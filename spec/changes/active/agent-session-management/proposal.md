# Agent Session 管理改进

## 1. 概述

改进 PromptHub 的 Agent Session 管理体系。当前实现存在三个问题：

1. **Session 文件名不规范** — 使用硬编码 `"default"` 作为 session ID，没有时间戳
2. **无法新建 Session** — UI 没有暴露 "新建对话" 按钮
3. **没有建议问题** — 空聊天面板缺少引导性交互

同时引入关键的数据模型决策：**Session 必须归属于「用户 + 项目」的组合**，确保多用户、多项目场景下 session 不会混淆。

## 2. 问题背景

### 2.1 Tpa_RuYiBot 的 Session 规范

Tpa_RuYiBot 的 session 管理遵循以下规范：

```
文件命名: {userId}__session_{YYYYMMDD}_{HHmmss}.jsonl
WebSocket: chat_id = "websocket:{userId}__session_{YYYYMMDD}_{HHmmss}"
Session 过滤: 按 userId 前缀过滤，只显示当前用户的 session
```

关键设计：
- **双下划线分隔** `__`：userId 和 session 之间的分隔符
- **时间戳命名**：保证 session 唯一性，且可按时间排序
- **按用户过滤**：`listSessions` 返回所有 session，前端按 `websocket:{userId}__` 前缀过滤
- **WebSocket attach**：`{type: "attach", chat_id: "userId__session_xxx"}` 绑定连接到特定 session

### 2.2 PromptHub 当前实现的问题

| 问题 | 当前行为 | 期望行为 |
|------|---------|---------|
| Session ID | `"default"` 硬编码 | `session_YYYYMMDD_HHmmss` 时间戳 |
| chat_id | `"promptHub_user__session_default"` | `"{userId}__session_{YYYYMMDD}_{HHmmss}"` |
| 新建对话 | 无按钮 | Header 区域 "新建对话" 按钮 |
| Session 切换 | 不重新 attach WebSocket | 切换时 `switchAgentSession()` 重新 attach |
| 建议问题 | 无 | 空消息时显示 4 个通用建议 |
| 用户归属 | 无 userId 概念 | 通过 OS 用户名或设置确定 |

## 3. 设计方案

### 3.1 Session 归属模型

```
Session = f(userId, projectId, timestamp)

文件存储（Agent 侧）:
  {projectRoot}/sessions/{userId}__session_{YYYYMMDD}_{HHmmss}.jsonl

PromptHub 侧（不存储 session 内容，只透传）:
  window.api.agent.listSessions(port) → 按 userId 前缀过滤
  window.api.agent.createSession(port, title?) → 生成时间戳 ID
```

**Session 归属 = 用户 × 项目**

- 每个 Agent 项目有独立的 `sessions/` 目录
- 同一项目下，不同用户的 session 通过 `userId__` 前缀区分
- 同一用户在同一项目下，不同对话通过时间戳区分
- PromptHub 从 Agent Gateway 获取 session 列表后，按当前用户 ID 过滤

### 3.2 用户身份确定

优先级：
1. PromptHub 设置中的 `agentUserId`（用户可在设置页配置）
2. OS 用户名（`os.userInfo().username`，通过 IPC 获取）
3. 兜底值 `"user"`

### 3.3 新建对话流程

```
用户点击「新建对话」
  ↓
生成 session_YYYYMMDD_HHmmss
  ↓
WebSocket attach 到 {userId}__session_{YYYYMMDD_HHmmss}
  ↓
清空本地消息列表
  ↓
显示建议问题（空状态）
```

### 3.4 Session 切换流程

```
用户在 SessionList 点击某个 session
  ↓
AgentChatPanel 收到新的 activeSession prop
  ↓
switchAgentSession(projectId, userId, sessionId) → 重新 attach WebSocket
  ↓
通过 REST API 加载历史消息
  ↓
清空本地消息 → 填充历史
```

### 3.5 建议问题

硬编码 4 个通用建议（不从 SOUL.md 提取，简化实现）：

```
帮我分析一下数据
写一段 Python 脚本
解释一下这段代码
有什么好的建议？
```

点击建议问题 → 直接调用 `sendAgentMessage()`。

## 4. 影响范围

| 层 | 文件 | 变更 |
|----|------|------|
| Service | `agent-service.ts` | 新增 `generateSessionId()`、`getDefaultUserId()`；修正 `buildChatId()` |
| Preload | `preload/api/agent.ts` | 新增 `getUserId()` 方法 |
| IPC | `main/ipc/agent-session.ts` | 新增 `agent:getUserId` handler |
| UI | `AgentSessionList.tsx` | 新增 "新建对话" 按钮 + `onNewChat` 回调 |
| UI | `AgentChatPanel.tsx` | session 切换时重新 attach + 建议问题空状态 |
| UI | `ProjectsManager.tsx` | 串联 `onNewChat` 回调 |
| i18n | `en.json` / `zh.json` | 新增翻译键 |

## 5. 非目标

- 不修改 Agent Gateway 的 session 存储格式（保持 Tpa_RuYiBot 兼容）
- 不实现 PromptHub 侧的 session 持久化（session 内容完全由 Agent 管理）
- 不实现 session 压缩/清理功能（Phase 2）
- 不实现登录系统（userId 暂用 OS 用户名）
