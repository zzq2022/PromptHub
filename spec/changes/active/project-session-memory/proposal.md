# Agent Project 管理系统

## 1. 概述

为 PromptHub Projects 模块添加 Agent 项目的导入、创建和管理能力。支持从模板 Agent 项目快速创建新项目，也支持导入已有的 Agent 项目。每个 Agent 项目的会话和记忆由 Agent 自身管理（`sessions/*.jsonl` + `memory/*/MEMORY.md`），PromptHub 只负责调用各 Agent 项目的 WebSocket API 实现问答。

**核心原则：**

- PromptHub 不管理 Agent 的会话和记忆，Agent 完全自治
- PromptHub 通过 WebSocket 连接 Agent 的 gateway 实现实时问答
- 模板 Agent 项目基于 Tpa_RuYiBot 的核心文件结构，只保留最小可运行的文件集

## 2. 两种项目来源

### 2.1 导入已有项目

用户选择本地一个已存在的 Agent 项目目录，PromptHub 注册为项目。

**流程：**
```
用户点击「导入项目」
  ↓
选择本地目录（如 D:\Pyprojects\Tpa_RuYiBot）
  ↓
PromptHub 验证目录内有 agent.py + config.json（判断是合法 Agent 项目）
  ↓
注册到 skillProjects（name + rootPath + type="agent"）
  ↓
完成
```

### 2.2 从模板新建项目

用户输入项目名称，PromptHub 从模板目录复制核心文件，创建新的 Agent 项目。

**流程：**
```
用户点击「新建 Agent 项目」
  ↓
输入项目名称（如 my-stock-bot）
  ↓
选择项目存放目录（默认 workspace/agents/）
  ↓
PromptHub 复制模板文件到 {目标目录}/{名称}/
  ↓
修改 config.json 中的项目参数（名称、端口号等）
  ↓
注册到 skillProjects
  ↓
完成
```

## 3. 模板 Agent 项目设计

基于 Tpa_RuYiBot 的核心文件结构，只保留最小可运行的文件集。

### 3.1 模板文件清单

```
agent-template/                       # 模板目录（打包在 PromptHub 内）
├── agent.py                          # 入口文件（nanobot AgentLoop）
├── config.json                       # 配置（provider, model, skills, tools, memory）
├── run_gateway.py                    # 启动 FastAPI gateway
├── stop_gateway.py                   # 停止 gateway
├── libs/                             # 核心库
│   ├── gateway_utils.py              # 工具注册、session 管理、记忆提取
│   ├── logger_setup.py               # 日志配置
│   ├── mem0_manager.py               # mem0 向量记忆管理
│   ├── memory_tools.py               # Markdown 记忆读写工具
│   ├── smart_extractor.py            # 智能记忆提取器
│   └── trigger_memory.py             # 记忆触发器
├── backend/                          # FastAPI 后端
│   ├── app.py                        # FastAPI 入口
│   ├── __init__.py
│   └── api/
│       ├── __init__.py
│       ├── chat.py                   # WebSocket 聊天端点
│       ├── sessions.py               # Session REST API
│       ├── settings.py               # 设置 REST API
│       ├── skills.py                 # Skills REST API
│       └── nanobot_compat.py         # nanobot 兼容 API
├── SOUL.md                           # Agent 灵魂定义
├── USER.md                           # 用户配置（空模板）
├── TOOLS.md                          # 工具使用说明
├── HEARTBEAT.md                      # 定时任务（空）
├── AGENTS.md                         # Agent 行为规范
├── .gitignore                        # git 忽略规则
└── sessions/                         # 空目录（会话存储）
└── memory/                           # 空目录（记忆存储）
```

### 3.2 模板与 Tpa_RuYiBot 的区别

| 文件 | Tpa_RuYiBot | 模板 | 说明 |
|---|---|---|---|
| `agent.py` | 完整（含 Chinook DB、stock skills） | 精简版（通用 Agent） | 去掉特定业务逻辑 |
| `config.json` | MiniMax + stock skills | 通用配置（用户自选 provider） | 模板化参数 |
| `libs/*` | 完整 | 完全复制 | 核心库不变 |
| `backend/*` | 完整 | 完全复制 | Gateway 不变 |
| `SOUL.md` | 个性化 | 通用模板 | 可自定义 |
| `skills/` | 14 个业务技能 | 空目录 | 用户自行安装 |
| `chinook.db` | 存在 | 不存在 | 特定业务数据 |
| `frontend/` | 前端构建产物 | 不存在 | PromptHub 是前端 |
| `sessions/` | 有历史数据 | 空目录 | 新项目无历史 |
| `memory/` | 有历史数据 | 空目录 | 新项目无历史 |

### 3.3 config.json 模板

```json
{
  "agents": {
    "defaults": {
      "workspace": ".",
      "provider": "custom",
      "model": "MiniMax-M2.7",
      "max_tokens": 4096,
      "context_window_tokens": 32768,
      "temperature": 0,
      "max_tool_iterations": 20,
      "timezone": "Asia/Shanghai"
    }
  },
  "providers": {
    "custom": {
      "api_key": "YOUR_API_KEY_HERE",
      "api_base": "https://api.minimaxi.com/v1"
    }
  },
  "skills": {},
  "tools": {
    "web": { "enable": false },
    "exec": { "enable": true, "timeout": 30 }
  },
  "memory_backend": "markdown",
  "custom_instructions": "Extract ONLY persistent, long-term facts and preferences about the user. ABSOLUTELY FORBID extracting temporary query results or conversational fillers."
}
```

### 3.4 agent.py 精简版

模板的 `agent.py` 去掉 Tpa_RuYiBot 特有的 Chinook DB、stock query 等业务逻辑，保留通用的 nanobot AgentLoop 启动逻辑：

```python
#!/usr/bin/env python3
"""
Agent Template — nanobot 版

通用 Agent 模板，可自定义 skills 和 tools。
运行: python agent.py "你好"
运行: python agent.py --user alice --session alice_customers "这个skill还能问啥?"
"""

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

if sys.platform == "win32":
    os.environ.setdefault("PYTHONUTF8", "1")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

WORKSPACE = Path(__file__).resolve().parent
sys.path.insert(0, str(WORKSPACE / "libs"))

from libs.gateway_utils import (
    register_tools, slim_session, extract_memory,
    create_agent_loop, load_user_memory, save_session_turn
)
from nanobot.agent.loop import AgentLoop
from nanobot.config.loader import load_config


async def main():
    """Run agent in CLI mode (single prompt)."""
    parser = argparse.ArgumentParser(description="Agent CLI")
    parser.add_argument("prompt", help="User message to send to the agent")
    parser.add_argument("--user", default="cli_user", help="User ID")
    parser.add_argument("--session", default=None,
                        help="Session ID (default: auto-generated timestamp)")
    args = parser.parse_args()

    session_id = args.session or f"cli_{int(time.time())}"

    config = load_config(str(WORKSPACE / "config.json"))
    agent = create_agent_loop(config, WORKSPACE)

    memory = load_user_memory(WORKSPACE, args.user)
    messages = []
    if memory:
        messages.append({"role": "system", "content": f"## User Memory\n{memory}"})
    messages.append({"role": "user", "content": args.prompt})

    result = await agent.run(messages)

    # 保存本轮对话到 session JSONL（与 gateway 模式写入同一文件）
    save_session_turn(WORKSPACE, args.user, session_id, args.prompt, result)

    print(result)


if __name__ == "__main__":
    asyncio.run(main())
```

## 4. 项目创建流程

### 4.1 新建项目

PromptHub 提供 UI 入口创建新 Agent 项目：

```
Projects 页面 → 「新建 Agent」按钮
  ↓
弹出对话框：
  - 项目名称（必填，如 "my-stock-bot"）
  - 存放目录（默认 {workspace}/agents/）
  - Provider 配置（可选，可后续在 config.json 修改）
  ↓
点击「创建」
  ↓
PromptHub 执行：
  1. 创建目标目录
  2. 复制 agent-template/ 下所有文件到目标目录
  3. 重命名关键文件中的占位符（项目名称等）
  4. 生成初始 config.json（填入用户选择的 provider）
  5. 注册到 skillProjects（type="agent"）
  6. 可选：自动启动 Agent gateway
  ↓
完成，用户可以在 Projects 页面看到新项目
```

### 4.2 导入项目

```
Projects 页面 → 「导入项目」按钮
  ↓
选择本地目录
  ↓
PromptHub 验证：
  - 目录内有 agent.py（判断为 Agent 项目）
  - 目录内有 config.json（可读取配置）
  ↓
注册到 skillProjects（type="agent", rootPath=选择的目录）
  ↓
完成
```

## 5. PromptHub 与 Agent 的通信

### 5.1 架构

AgentService **就是** WebSocket 连接管理器——渲染器进程通过浏览器原生 WebSocket 直连 Agent Gateway（`ws://localhost:PORT`），不需要经过 Electron IPC。IPC 只用于**启停 gateway 进程**和**获取端口号**。

```
┌──────────────────────────────────────────────┐
│ PromptHub Desktop                             │
│                                               │
│  ProjectsManager                              │
│       ↓                                       │
│  AgentService (WebSocket 连接管理)             │
│       ↓                                       │
│  WebSocket ──TCP──→ Agent Gateway (FastAPI)   │
│       ↑                                       │
│  IPC (仅用于启停/端口分配)                     │
│       ↑                                       │
│  主进程 (AgentProcessManager)                  │
└──────────────────────────────────────────────┘
```

**为什么这样设计：**
- 渲染器进程**可以直接用浏览器 WebSocket API**，不需要经过 IPC/preload 转发
- WebSocket 对象**可以**存在于渲染器进程中（和 preload IPC 不同）
- IPC 只负责两件事：启动/停止 gateway 进程、查询端口号
- AgentService 封装了 WebSocket 连接 + 事件监听 + 重连逻辑，对 ProjectsManager 暴露简洁的 API

### 5.2 通信协议（复用 Tpa_RuYiBot 现有协议）

```typescript
// PromptHub → Agent
interface AgentMessage {
  type: "attach" | "message";
  chat_id: string;         // "userId__session_sessionId"
  content?: string;        // message 类型时的消息内容
}

// Agent → PromptHub
interface AgentEvent {
  event: "delta" | "message" | "turn_end" | "error" | "attached";
  chat_id?: string;
  text?: string;           // delta/message 事件的文本
  data?: {
    message?: string;      // error 事件的错误信息
    is_generating?: boolean;
  };
  kind?: "progress";      // tool 事件
  tool_events?: ToolEvent[];
}
```

### 5.3 AgentService（渲染器侧 WebSocket 封装）

`AgentService` 直接使用浏览器原生 `WebSocket` API 连接 Agent Gateway，不经过 IPC 转发：

```typescript
// apps/desktop/src/renderer/services/agent-service.ts

interface AgentService {
  // 连接到已启动的 Agent gateway（通过 WebSocket 直连）
  connect(projectId: string, port: number): Promise<void>;

  // 断开连接
  disconnect(projectId: string): void;

  // 发送消息（直接通过 WebSocket）
  sendMessage(projectId: string, chatId: string, content: string): void;

  // 监听事件（WebSocket 原生事件回调）
  onDelta(projectId: string, callback: (text: string) => void): () => void;
  onTurnEnd(projectId: string, callback: () => void): () => void;
  onError(projectId: string, callback: (error: string) => void): () => void;
}
```

> **设计决策**：渲染器进程可以使用浏览器 WebSocket API 直连 `ws://localhost:{port}`，无需经过 IPC/preload。这比"主进程持有 WebSocket + IPC 转发"方案更简洁，延迟更低，且减少了一层间接。
```

### 5.4 Gateway 进程管理

每个 Agent 项目运行自己的 gateway 进程（FastAPI + uvicorn）：

```typescript
interface AgentProcessManager {
  // 启动 Agent gateway（后台运行）
  start(projectId: string, projectRootPath: string): Promise<{ port: number; pid: number }>;

  // 停止 Agent gateway
  stop(projectId: string): Promise<void>;

  // 检查是否正在运行
  isRunning(projectId: string): boolean;

  // 获取端口号
  getPort(projectId: string): number | null;
}
```

**端口分配**：每个 Agent 项目分配唯一端口（从 18792 开始递增），记录在 `config.json` 或项目元数据中。

## 6. 数据模型

### 6.1 SkillProject 扩展

所有项目本质上都是 Agent 项目（即使是用模板新建的，核心也是 agent.py + config.json + gateway），区别只是**来源**（模板创建 vs 导入已有）：

```typescript
interface SkillProject {
  id: string;
  name: string;
  rootPath: string;
  origin?: 'template' | 'imported'; // 来源：模板新建 / 导入已有目录
  gatewayPort?: number;              // Agent gateway 端口号
  gatewayPid?: number;               // Agent gateway 进程 PID
  scanPaths?: string[];
  deployTargets?: string[];
  createdAt: number;
  updatedAt: number;
}
```

**为什么要区分来源（origin）：**
- **模板新建**：PromptHub 可以自动启动/停止 gateway（知道如何管理生命周期）
- **导入的项目**：可能是用户自己的 Agent 项目，PromptHub 只负责连接，不自动管理进程（用户自己启动 gateway）
- UI 上可以给导入的项目显示不同标识，提示用户「需要手动启动 gateway」

### 6.2 不需要新建数据库表

所有数据都存在文件系统中：
- 项目列表 → 现有 `skillProjects` 设置（Zustand + 持久化）
- 会话 → Agent 自己管理（`sessions/*.jsonl`）
- 记忆 → Agent 自己管理（`memory/*/MEMORY.md`）

## 7. UI 设计

### 7.1 Projects 页面（三栏布局）

```
┌────────────────┬──────────────────┬─────────────────────┐
│ 项目列表       │ Session 列表     │  聊天面板           │
│ (w-56)         │ (w-52)           │  (flex-1)          │
│                │                  │                    │
│ [Agent A] ←选中│ "会话 1" ←选中   │  消息流...          │
│ [Agent B]      │ "会话 2"         │                    │
│ [Agent C]      │ "会话 3"         │  [输入框...]        │
│                │                  │                    │
│ [+ 新建 Agent] │ [+ 新会话]       │                    │
│ [导入项目]     │                  │                    │
└────────────────┴──────────────────┴─────────────────────┘
```

**左侧项目列表：**
- 显示所有注册的 Agent 项目
- 选中项目时，中间栏加载该项目的 session 列表（从 Agent 读取）
- 底部两个按钮：「新建 Agent」和「导入项目」

**中间 Session 列表：**
- 通过 WebSocket 连接 Agent，调用 `GET /api/sessions` 获取 session 列表
- 显示 session 标题、时间、消息数
- 点击 session 切换聊天上下文

**右侧聊天面板：**
- 通过 WebSocket 实时收发消息
- 显示 AI 回复（流式输出）
- 支持 tool call 进度展示

### 7.2 新建 Agent 对话框

```
┌─────────────────────────────────────┐
│ 新建 Agent 项目                      │
│                                      │
│ 项目名称：[my-stock-bot          ]   │
│                                      │
│ 存放目录：[D:\Pyprojects\agents\  ]  │
│                                      │
│ Provider：[MiniMax           ▼]     │
│ Model：   [MiniMax-M2.7     ▼]     │
│ API Key： [sk-...             ]     │
│ API Base：[https://api.minimaxi.com │
│            /v1                  ]   │
│                                      │
│        [取消]  [创建项目]            │
└─────────────────────────────────────┘
```

### 7.3 导入项目对话框

```
┌─────────────────────────────────────┐
│ 导入 Agent 项目                      │
│                                      │
│ 选择目录：[D:\Pyprojects\Tpa_RuYiBot│
│            ──────────────────── ]   │
│            [浏览...]                │
│                                      │
│ 项目名称：[Tpa_RuYiBot          ]   │
│ (自动从目录名提取)                   │
│                                      │
│        [取消]  [导入项目]            │
└─────────────────────────────────────┘
```

## 8. 新建项目文件复制逻辑

### 8.1 模板目录位置

```
{PromptHub安装目录}/
├── resources/
│   └── agent-template/          # Agent 模板目录
│       ├── agent.py
│       ├── config.json
│       ├── run_gateway.py
│       ├── stop_gateway.py
│       ├── libs/
│       ├── backend/
│       ├── SOUL.md
│       ├── USER.md
│       ├── TOOLS.md
│       ├── HEARTBEAT.md
│       ├── AGENTS.md
│       ├── .gitignore
│       ├── sessions/            # 空目录
│       └── memory/              # 空目录
```

### 8.2 复制流程

```typescript
async function createAgentProject(
  templatePath: string,       // 模板目录路径
  targetPath: string,         // 目标目录路径
  projectName: string,        // 项目名称
  config: AgentConfig,        // 用户配置（provider, model 等）
): Promise<void> {
  // 1. 创建目标目录
  fs.mkdirSync(targetPath, { recursive: true });

  // 2. 复制模板文件（排除 .git、sessions 历史、memory 历史）
  const excludePatterns = ['.git', 'sessions/*.jsonl', 'memory/*/MEMORY.md'];
  copyDirSync(templatePath, targetPath, excludePatterns);

  // 3. 修改 config.json（填入用户配置）
  // 4. 注册到 skillProjects
}
```

## 9. 共享 Python 虚拟环境

### 9.1 设计原则

- **所有 Agent 项目共享同一个 Python 虚拟环境**，不在每个项目内创建独立 venv
- 虚拟环境随 PromptHub 桌面应用一起打包分发
- 开发环境下，虚拟环境位于 `resources/agent-venv/`
- 打包后，虚拟环境位于安装目录的 `resources/agent-venv/`

### 9.2 虚拟环境目录结构

```
resources/
├── agent-template/              # Agent 项目模板（上一节已定义）
│   ├── agent.py
│   ├── config.json
│   ├── libs/
│   ├── backend/
│   └── ...
├── agent-venv/                  # 共享 Python 虚拟环境
│   ├── Scripts/                 # Windows
│   │   ├── python.exe
│   │   ├── pip.exe
│   │   ├── uvicorn.exe
│   │   └── ...
│   ├── Lib/
│   │   └── site-packages/       # 所有依赖包
│   │       ├── nanobot/         # 核心 Agent 框架
│   │       ├── fastapi/         # Web 框架
│   │       ├── uvicorn/         # ASGI 服务器
│   │       ├── pydantic/        # 数据校验
│   │       ├── pymilvus/        # 向量数据库客户端（可选）
│   │       └── ...
│   ├── pyvenv.cfg
│   └── requirements.txt         # 依赖清单（用于重建）
```

### 9.3 依赖清单

从 Tpa_RuYiBot 的导入分析，共享 venv 需要的核心依赖：

```
# requirements.agent.txt — Agent 共享环境依赖

# 核心框架
nanobot                   # Agent 框架（AgentLoop, tools, session, config）
fastapi>=0.100.0          # Web 框架
uvicorn>=0.23.0           # ASGI 服务器
pydantic>=2.0.0           # 数据校验

# 记忆（可选，按需启用）
pymilvus>=2.3.0           # 向量数据库客户端（mem0 向量检索用）

# 工具
aiofiles                  # 异步文件操作
httpx                     # HTTP 客户端（Agent 调用外部 API）
```

### 9.4 虚拟环境初始化流程

**开发环境（开发者首次设置）：**

```bash
# 1. 创建虚拟环境
python -m venv resources/agent-venv

# 2. 安装依赖
resources/agent-venv/Scripts/pip.exe install -r resources/requirements.agent.txt

# 3. 验证
resources/agent-venv/Scripts/python.exe -c "import nanobot; import fastapi; print('OK')"
```

**打包时（electron-builder 构建）：**

```typescript
// scripts/build-agent-venv.ts
// 在 electron-builder 构建前执行，确保 venv 存在且完整

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const VENV_PATH = path.join(__dirname, '../resources/agent-venv');
const REQUIREMENTS = path.join(__dirname, '../resources/requirements.agent.txt');

function buildAgentVenv() {
  if (!existsSync(VENV_PATH)) {
    console.log('Creating agent virtual environment...');
    execSync(`python -m venv "${VENV_PATH}"`, { stdio: 'inherit' });
  }

  console.log('Installing agent dependencies...');
  execSync(`"${VENV_PATH}/Scripts/pip.exe" install -r "${REQUIREMENTS}"`, {
    stdio: 'inherit',
  });

  // 清理 pip 缓存减小打包体积
  execSync(`"${VENV_PATH}/Scripts/pip.exe" cache purge`, { stdio: 'inherit' });

  console.log('Agent venv ready.');
}

buildAgentVenv();
```

### 9.5 Agent 项目如何使用共享 venv

每个 Agent 项目的 `run_gateway.py` 和 `agent.py` 通过 `sys.path` 引用共享 venv：

```python
# run_gateway.py 中的关键逻辑
import sys
import os
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent

# 定位共享 venv 的 Python 可执行文件
# 开发环境：resources/agent-venv/
# 打包后：{安装目录}/resources/agent-venv/
def find_shared_python() -> Path:
    """查找共享虚拟环境中的 Python 可执行文件"""
    # 方式1：通过环境变量（PromptHub 启动 Agent 时设置）
    env_python = os.environ.get("PROMPTHUB_PYTHON")
    if env_python and Path(env_python).exists():
        return Path(env_python)

    # 方式2：相对路径探测（从项目目录向上查找）
    candidates = [
        WORKSPACE.parent / "resources" / "agent-venv" / "Scripts" / "python.exe",  # 开发
        WORKSPACE.parent.parent / "resources" / "agent-venv" / "Scripts" / "python.exe",  # 打包
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    # 方式3：系统 Python（fallback）
    return Path(sys.executable)

SHARED_PYTHON = find_shared_python()

# 将共享 venv 的 site-packages 加入 sys.path
venv_site = SHARED_PYTHON.parent.parent / "Lib" / "site-packages"
if venv_site.exists():
    sys.path.insert(0, str(venv_site))
```

### 9.6 PromptHub 启动 Agent 时设置环境

```typescript
// packages/core/src/agent-gateway.ts

import { spawn, ChildProcess } from 'child_process';
import path from 'path';

interface AgentProcessManager {
  start(projectId: string, projectRootPath: string): Promise<{ port: number; pid: number }>;
}

// 定位共享 venv 的 Python
function findAgentPython(resourcesPath: string): string {
  const venvPython = path.join(resourcesPath, 'agent-venv', 'Scripts', 'python.exe');
  return venvPython;
}

// 启动 Agent gateway 进程
function startAgentGateway(
  projectRootPath: string,
  resourcesPath: string,
  port: number,
): ChildProcess {
  const pythonPath = findAgentPython(resourcesPath);
  const venvScripts = path.dirname(pythonPath);         // agent-venv/Scripts
  const venvSitePackages = path.join(                    // agent-venv/Lib/site-packages
    path.dirname(venvScripts), 'Lib', 'site-packages'
  );
  const gatewayScript = path.join(projectRootPath, 'run_gateway.py');

  // ⚠️ 关键：必须将 venv Scripts 注入 PATH 最前面
  //
  // 调用链：gateway 进程 → nanobot ExecTool._build_env() → 从 os.environ 复制 PATH
  //       → asyncio.create_subprocess_shell("python xxx.py", env={PATH: ...})
  //
  // 如果 PATH 里没有 venv/Scripts，exec 工具执行 "python" 时会找到系统 Python
  // 而不是 venv 的 Python，导致缺少 nanobot/fastapi 等依赖。
  const currentPath = process.env.PATH || '';
  const venvPath = `${venvScripts}${path.delimiter}${currentPath}`;

  const child = spawn(pythonPath, [gatewayScript], {
    cwd: projectRootPath,
    env: {
      ...process.env,
      PATH: venvPath,                              // venv Scripts 放在 PATH 最前面
      PROMPTHUB_PYTHON: pythonPath,                // Agent 内部定位 venv Python
      PYTHONUTF8: '1',                             // Windows UTF-8 支持
      PYTHONIOENCODING: 'utf-8',
      PYTHONPATH: venvSitePackages,                // 确保 import 能找到 venv 包
    },
    stdio: ['ignore', 'pipe', 'pipe'],             // stdout/stderr 管道化
    detached: false,
  });

  return child;
}
```

### 9.7 打包分发（electron-builder）

```json
// apps/desktop/electron-builder.json — extraResources 补充
{
  "extraResources": [
    {
      "from": "resources/agent-template",
      "to": "agent-template"
    },
    {
      "from": "resources/agent-venv",
      "to": "agent-venv"
    },
    {
      "from": "resources/requirements.agent.txt",
      "to": "requirements.agent.txt"
    }
  ]
}
```

**打包后的安装目录结构：**

```
PromptHub/
├── PromptHub.exe                  # 主程序
├── resources/
│   ├── icon.ico
│   ├── CHANGELOG.md
│   ├── agent-template/            # Agent 项目模板
│   │   ├── agent.py
│   │   ├── config.json
│   │   ├── libs/
│   │   ├── backend/
│   │   └── ...
│   ├── agent-venv/                # 共享 Python 虚拟环境
│   │   ├── Scripts/
│   │   │   ├── python.exe
│   │   │   └── ...
│   │   ├── Lib/
│   │   │   └── site-packages/
│   │   └── pyvenv.cfg
│   └── requirements.agent.txt     # 依赖清单（用于修复/重建）
├── resources/app.asar             # Electron 主程序
└── ...
```

**用户安装后的数据目录：**

```
{用户数据目录}/
├── prompthub.db                   # PromptHub 数据库
├── agents/                        # 用户创建的 Agent 项目
│   ├── my-stock-bot/
│   │   ├── agent.py
│   │   ├── config.json
│   │   ├── sessions/
│   │   └── memory/
│   └── my-research-bot/
│       ├── agent.py
│       ├── config.json
│       ├── sessions/
│       └── memory/
└── settings.json                  # PromptHub 设置
```

### 9.8 venv 修复与重建

用户可能遇到 venv 损坏的情况，PromptHub 提供修复入口：

```typescript
// 用户点击「修复 Agent 环境」时执行
async function repairAgentVenv(resourcesPath: string): Promise<void> {
  const pythonPath = path.join(resourcesPath, 'agent-venv', 'Scripts', 'python.exe');
  const pipPath = path.join(resourcesPath, 'agent-venv', 'Scripts', 'pip.exe');
  const requirementsPath = path.join(resourcesPath, 'requirements.agent.txt');

  // 1. 如果 venv 不存在，重新创建
  if (!fs.existsSync(pythonPath)) {
    execSync(`python -m venv "${path.join(resourcesPath, 'agent-venv')}"`);
  }

  // 2. 重新安装所有依赖
  execSync(`"${pipPath}" install -r "${requirementsPath}" --force-reinstall`);
}
```

### 9.9 跨平台考虑

| 平台 | venv 路径 | Python 路径 |
|---|---|---|
| Windows | `resources/agent-venv/Scripts/python.exe` | `resources/agent-venv/Scripts/python.exe` |
| macOS | `resources/agent-venv/bin/python3` | `resources/agent-venv/bin/python3` |
| Linux | `resources/agent-venv/bin/python3` | `resources/agent-venv/bin/python3` |

> **注意**：虚拟环境与平台绑定，不能跨平台复用。打包时需要为每个目标平台单独构建 venv。macOS 需要分别为 x64 和 arm64 构建。

### 9.10 开发者工作流

| 场景 | 操作 |
|---|---|
| 首次开发 | 运行 `scripts/build-agent-venv.ts` 创建 venv |
| 添加新依赖 | 编辑 `requirements.agent.txt`，重新运行构建脚本 |
| 打包发布 | electron-builder 自动包含 venv 到 extraResources |
| 用户安装 | NSIS 安装包包含 venv，开箱即用 |
| 用户修复 | PromptHub UI 提供「修复 Agent 环境」按钮 |

  // 3. 创建空的 sessions/ 和 memory/ 目录
  fs.mkdirSync(path.join(targetPath, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(targetPath, 'memory'), { recursive: true });

  // 4. 修改 config.json
  const configPath = path.join(targetPath, 'config.json');
  const configContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  configContent.agents.defaults.model = config.model;
  configContent.providers.custom.api_key = config.apiKey;
  configContent.providers.custom.api_base = config.apiBase;
  fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2), 'utf-8');

  // 5. 修改 SOUL.md 中的项目名称（可选）
  const soulPath = path.join(targetPath, 'SOUL.md');
  if (fs.existsSync(soulPath)) {
    let soul = fs.readFileSync(soulPath, 'utf-8');
    soul = soul.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
    fs.writeFileSync(soulPath, soul, 'utf-8');
  }
}
```

## 9. IPC 通道

```typescript
// packages/shared/constants/ipc-channels.ts

// Agent 项目管理
agentProject:create       // (name, targetDir, config) → { projectId, path }
agentProject:import       // (dirPath) → { projectId, name, path }
agentProject:verify       // (dirPath) → { isValid: boolean, name?: string }

// Agent gateway 进程管理
agentGateway:start        // (projectId, projectRootPath) → { port, pid }
agentGateway:stop         // (projectId) → void
agentGateway:status       // (projectId) → { isRunning, port?, pid? }

// Agent 会话（透传给 Agent 的 REST API）
agentSession:list         // (gatewayPort, userId) → SessionInfo[]
agentSession:get          // (gatewayPort, sessionId) → SessionMessage[]
agentSession:create       // (gatewayPort, userId, title?) → sessionId
agentSession:delete       // (gatewayPort, sessionId) → void
agentSession:rename       // (gatewayPort, sessionId, title) → void

// Agent 记忆（只读，用于 UI 展示）
agentMemory:load          // (gatewayPort, userId) → string
```

## 10. 改动清单

| 模块 | 文件 | 改动 | Phase |
|---|---|---|---|
| **模板** | `resources/agent-template/` (新) | Agent 模板文件集 | 1 |
| **Core** | `packages/core/src/agent-project.ts` (新) | 新建/导入/验证 Agent 项目 | 1 |
| **Core** | `packages/core/src/agent-gateway.ts` (新) | Gateway 进程启停管理 | 1 |
| **Core** | `packages/core/src/agent-session.ts` (新) | 透传 Agent session API | 1 |
| **Types** | `packages/shared/types` | SkillProject.type, AgentConfig 类型 | 1 |
| **IPC** | `packages/shared/constants/ipc-channels.ts` | 12 个新通道 | 1 |
| **Preload** | `apps/desktop/src/preload` | 暴露 Agent 相关 API | 1 |
| **IPC** | `apps/desktop/src/main/ipc/agent-project.ts` (新) | 新建/导入 handlers | 1 |
| **IPC** | `apps/desktop/src/main/ipc/agent-gateway.ts` (新) | 进程管理 handlers | 1 |
| **IPC** | `apps/desktop/src/main/ipc/agent-session.ts` (新) | Session 透传 handlers | 1 |
| **UI** | `apps/desktop/src/renderer/components/project/CreateAgentDialog.tsx` (新) | 新建 Agent 对话框 | 1 |
| **UI** | `apps/desktop/src/renderer/components/project/ImportProjectDialog.tsx` (新) | 导入项目对话框 | 1 |
| **UI** | `apps/desktop/src/renderer/components/project/ProjectSessionList.tsx` (新) | Session 列表（中间栏） | 1 |
| **UI** | `apps/desktop/src/renderer/components/project/ProjectsManager.tsx` | 三栏布局 + Agent 连接 | 1 |
| **UI** | `apps/desktop/src/renderer/services/agent-service.ts` (新) | WebSocket 连接管理 | 1 |
| **i18n** | 7 个 locale 文件 | agent 项目相关翻译键 | 1 |

**不需要改动**：
- `packages/db/src/schema.ts` — 不建新表
- `packages/db/src/init.ts` — 不需要迁移
- Agent 内部的 sessions/memory — Agent 自己管理

## 11. Phase 规划

| Phase | 内容 | 可交付 |
|---|---|---|
| **Phase 1** | Agent 模板 + 新建/导入 + Gateway 进程管理 + WebSocket 连接 + 三栏 UI | 用户可以创建/导入 Agent 项目，通过 WebSocket 与 Agent 对话 |
| **Phase 2** | Session 列表透传 + 聊天历史展示 + 流式输出 + tool call 展示 | 完整的对话体验，与 Tpa_RuYiBot 前端等价 |
| **Phase 3** | Agent 配置编辑（UI 中修改 config.json）+ 记忆只读展示 | 配置管理完善 |
| **Phase 4** | 多 Agent 协作（Agent 之间调用）+ Agent marketplace | 高级功能 |

## 12. 与 Tpa_RuYiBot 的关系

| 能力 | Tpa_RuYiBot | PromptHub 新方案 |
|---|---|---|
| 会话管理 | 自己管理（`sessions/*.jsonl`） | Agent 自己管理，PromptHub 透传 |
| 记忆管理 | 自己管理（`memory/*/MEMORY.md`） | Agent 自己管理，PromptHub 只读 |
| 聊天对话 | WebSocket 实时对话 | WebSocket 实时对话（相同协议） |
| 前端 UI | 自带 Next.js 前端 | PromptHub 作为前端替代 |
| Skills | 自己的 skills 目录 | Agent 自己的 skills 目录（独立） |
| 配置 | `config.json` | `config.json`（PromptHub 可编辑） |

**PromptHub 替代了 Tpa_RuYiBot 的前端，但保留了 Agent 的完整自治能力。**

## 13. 安全考虑

- **路径穿越**：新建/导入时验证路径合法性，防止 `../` 穿越
- **进程管理**：Gateway 进程通过 PID 文件管理，防止僵尸进程
- **端口冲突**：分配端口前检查可用性，避免端口占用
- **API Key 安全**：API Key 只存在本地 `config.json`，不上传到任何服务
- **WebSocket 认证**：复用 Tpa_RuYiBot 的 bootstrap token 机制
