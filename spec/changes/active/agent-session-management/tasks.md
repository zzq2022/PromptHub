# Agent Session 管理改进 — 实施任务

**当前进度：** 待实现

---

## T1: agent-service.ts — Session ID 生成 + userId

**文件：** `apps/desktop/src/renderer/services/agent-service.ts`

### T1.1 新增 `generateSessionId()`

生成 `session_YYYYMMDD_HHmmss` 格式的 session ID。

```typescript
export function generateSessionId(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `session_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
```

### T1.2 修正 `buildChatId()`

确保 chat_id 格式为 `{userId}__session_YYYYMMDD_HHmmss`。

### T1.3 `connectToAgent` 默认参数

默认 sessionId 改为 `generateSessionId()`，不再用 `"default"`。

### T1.4 导出 `switchAgentSession()`

已有实现，确认可正常工作。

**验收标准：** 新建对话后 gateway 的 sessions/ 目录出现正确命名的 JSONL 文件。

---

## T2: Preload + IPC — 注入 userId

### T2.1 Preload 新增 `getUserId()`

```typescript
// preload/api/agent.ts
getUserId: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_GET_USER_ID) as Promise<string>,
```

### T2.2 IPC 通道常量

`packages/shared/constants/ipc-channels.ts` 新增：
```typescript
AGENT_GET_USER_ID: "agent:getUserId",
```

### T2.3 IPC Handler

`apps/desktop/src/main/ipc/agent-session.ts` 新增 handler，返回 OS 用户名。

### T2.4 agent-service 使用

`getDefaultUserId()` 改为同步返回缓存值，首次调用时通过 preload 获取。

**验收标准：** `window.api.agent.getUserId()` 返回 OS 用户名。

---

## T3: AgentSessionList — 新建对话按钮

**文件：** `apps/desktop/src/renderer/components/project/AgentSessionList.tsx`

### T3.1 新增 `onNewChat` prop

```typescript
interface AgentSessionListProps {
  project: SkillProject;
  activeSessionId: string | null;
  onSelectSession: (session: AgentSessionInfo) => void;
  onNewChat: () => void;  // 新增
}
```

### T3.2 Header 添加按钮

在 session 列表 header 的 refresh 按钮旁边加 `PlusIcon` "新建对话" 按钮。

**验收标准：** 点击 "新建对话" 后触发父组件回调，创建新 session 并选中。

---

## T4: AgentChatPanel — session 切换 + 建议问题

**文件：** `apps/desktop/src/renderer/components/project/AgentChatPanel.tsx`

### T4.1 session 切换时重新 attach

监听 `activeSession` 变化 → 调用 `switchAgentSession()` 重新绑定 WebSocket → 清空本地消息 → 加载历史消息。

### T4.2 建议问题空状态

空消息时显示 4 个建议按钮（参考 Tpa_RuYiBot 的 `QuickHint`）：

```
帮我分析一下数据
写一段 Python 脚本
解释一下这段代码
有什么好的建议？
```

点击 → 直接 `sendAgentMessage(project.id, text)`。

**验收标准：**
- 切换 session 后聊天内容正确切换
- 空聊天面板显示建议问题
- 点击建议问题发送消息

---

## T5: ProjectsManager — 串联 onNewChat

**文件：** `apps/desktop/src/renderer/components/project/ProjectsManager.tsx`

传递 `onNewChat` 回调给 `AgentSessionList`：
- 生成 `generateSessionId()`
- 更新 `activeSessionId` 状态
- AgentChatPanel 自动响应 activeSession 变化

**验收标准：** 完整流程：点击新建 → session 列表刷新 → 自动选中 → 聊天面板就绪。

---

## T6: i18n 国际化

**文件：** `apps/desktop/src/renderer/i18n/locales/en.json` + `zh.json`

新增键：
```
agentProject.newChat          "New Chat" / "新建对话"
agentProject.hint1            "Help me analyze data" / "帮我分析一下数据"
agentProject.hint2            "Write a Python script" / "写一段 Python 脚本"
agentProject.hint3            "Explain this code" / "解释一下这段代码"
agentProject.hint4            "Any suggestions?" / "有什么好的建议？"
```

---

## 任务依赖

```
T1 (agent-service) ──→ T4 (AgentChatPanel)
T2 (userId IPC) ────→ T1 (agent-service 使用 userId)
T3 (新建按钮) ──────→ T5 (ProjectsManager 串联) ──→ T4
T6 (i18n) ──────────→ T3, T4
```
