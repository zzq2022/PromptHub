# Design: Agent Shared Runtime

## Overview

将 agent Python 运行时从每个项目的 `runtime/agent-runtime/` 提升到 `resources/agent-runtime/` 共享位置,通过环境变量 `AGENT_WORKSPACE` 实现项目隔离,并在 `config.json` 中添加 `gatewayPort` 字段实现端口确定性分配。

核心改动涉及两层:
1. **Electron 侧**(`agent-gateway.ts`):读取 config、传递 `AGENT_WORKSPACE`、基于 config 端口启动 gateway
2. **Python 侧**(`run_gateway.py`、`gateway_app.py`、`health_check.py`):从 `AGENT_WORKSPACE` env var 解析工作目录,替代 `Path(__file__).resolve().parent.parent`

## Affected Areas

- **Data model**: `config.json` 新增 `gatewayPort` 字段(`number | null`,可选,向后兼容)
- **IPC / API**: 无变更。gateway HTTP API 保持不变。
- **Filesystem / sync**: 
  - `resources/agent-runtime/` 为新的共享运行时位置
  - 各 agent 项目下 `runtime/agent-runtime/` 将在迁移后删除
  - Session 文件写入 `AGENT_WORKSPACE/sessions/`(与现有行为一致,只是解析方式变化)
- **UI / UX**: 
  - Agent 管理界面中可选显示/编辑端口配置
  - 创建 agent 项目时自动分配端口并写入 config.json

## Architecture

```
                    ┌─────────────────────┐
                    │  agent-gateway.ts    │
                    │  (Electron 主进程)   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     读取 config.json    解析 AGENT_WORKSPACE   spawn python
     获取 gatewayPort    设置为 env var        指向共享 runtime
              │                │                │
              ▼                ▼                ▼
    ┌──────────────────────────────────────────────┐
    │         resources/agent-runtime/              │
    │  run_gateway.py → gateway_app.py → skills/   │
    │  health_check.py                             │
    └──────────────────┬───────────────────────────┘
                       │
          使用 os.environ["AGENT_WORKSPACE"]
          确定 prompts/ sessions/ skills/ 位置
                       │
                       ▼
    ┌──────────────────┐  ┌──────────────────┐
    │ agents/bot06/    │  │ agents/bot07/    │
    │ port: 18793      │  │ port: 18794      │
    │ sessions/        │  │ sessions/        │
    └──────────────────┘  └──────────────────┘
```

## Key Design Decisions

### 1. 环境变量 vs 命令行参数

选择环境变量 `AGENT_WORKSPACE` 而非命令行参数传递工作目录:
- 与现有 `PROMPTHUB_PYTHON`、`PYTHONPATH` 等 env var 风格一致
- Python 代码改动最小:只需在 `config.py` 中读取一个 env var
- 不影响 `cmd.exe /c start` 的参数结构

### 2. config.json 端口 vs 全局端口表

选择在每个项目的 `config.json` 中声明端口,而非维护一个全局端口分配表:
- 符合现有每个 agent 项目自包含的设计哲学
- `config.json` 已经存在,字段扩展自然
- 全局表会引入跨项目状态管理复杂度,不适合当前规模

### 3. 迁移策略:复制后删除 vs 直接删除

选择先确保共享 runtime 存在再删除项目副本:
- 对于从未更新过的旧项目,首次启动时自动迁移
- 幂等操作:重复执行不产生副作用
- 失败时保留原样,不破坏现有功能

## Tradeoffs

| 选择 | 优点 | 代价 |
|------|------|------|
| 共享 runtime | 零重复、统一更新、小磁盘占用 | 所有 agent 依赖同一份代码版本 |
| config.json 端口 | 简单直观、易手动编辑 | 端口冲突需启动时检测 |
| env var 隔离 | 改动最小、与现有模式一致 | Python 代码需逐一检查 WORKSPACE 引用 |
| 后端窗口保留 | 调试方便、用户可见运行状态 | 每个 agent 占用一个控制台窗口 |
