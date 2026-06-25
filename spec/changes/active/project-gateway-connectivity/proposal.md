# Agent 项目 Gateway 连接可靠性优化

## 1. 问题诊断

### 1.1 现象

用户在 Projects 下点击 Agent 项目（从模板创建或导入的），无法连接问答。切换不同项目同样连接不上。UI 表现为：

- 有 Agent 列表的 session 列卡在 "Waiting for gateway..." 状态
- 进入聊天面板后 WebSocket 连接失败，显示 "Failed to connect to Agent Gateway"
- 即使点击"Start Gateway"成功后（提示 `Gateway running on port 18792`），WebSocket 仍然连不上

### 1.2 根因分析

经过全链路代码审查，发现 **6 个独立问题** 共同导致连接失败：

#### 问题 A：Gateway 进程启动无健康检查（核心问题）

**位置：** `packages/core/src/agent-gateway.ts` `startAgentGateway()`

```typescript
const child = spawn(pythonPath, [gatewayScript], { ... });
// ← 立即返回，不等待 HTTP 服务就绪
runningGateways.set(projectId, { child, port, pid });
return { port, pid };  // ← FastAPI 可能还没启动完成
```

`spawn` 是异步的，Python 进程需要时间启动 uvicorn 并开始监听端口。但 `startAgentGateway()` **不等待 HTTP endpoint 就绪就直接返回**。此时 `AgentSessionList` 和 `AgentChatPanel` 立即发起 HTTP/WS 连接，必然失败。

`AgentSessionList` 有重试机制（20 次 × 1.5s = 30 秒等待），但 `AgentChatPanel` 的 WebSocket 连接**没有任何重试**。所以 session 列表可能最终能加载，但聊天面板的 WebSocket 会永久挂掉。

#### 问题 B：WebSocket 连接无重试机制

**位置：** `apps/desktop/src/renderer/services/agent-service.ts` `connectToAgent()`

```typescript
// 定义了常量但从未使用
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 3;
```

`connectToAgent()` 内 `ws.onerror` **直接 reject**，没有指数退避重试。一旦网关启动慢了半秒，WebSocket 连接永久失败。

#### 问题 C：Gateway 进程错误不传递给 UI

**位置：** `packages/core/src/agent-gateway.ts`

```typescript
child.on("error", (err) => {
  console.error(`[AgentGateway] Process error for ${projectRootPath}:`, err);
  runningGateways.delete(projectId);
});
```

进程崩溃的错误仅输出到 `console.error`，UI 层完全感知不到。用户看到的是 "Connection failed" 但不知道为什么。

#### 问题 D：disconnectFromAgent 在已关闭的 WS 上发消息

**位置：** `agent-service.ts` `disconnectFromAgent()`

```typescript
conn.ws.send(JSON.stringify({ type: "attach", chat_id: conn.chatId }));
```

看起来是想发 detach 消息，但 WebSocket 可能已经关闭，`send()` 会抛异常被静默吃掉。且这种不一致可能导致连接状态混乱。

#### 问题 E：硬编码默认端口 18792

**位置：** `AgentChatPanel.tsx`

```typescript
await connectToAgent(project.id, project.gatewayPort ?? 18792, ...);
```

`project.gatewayPort` 可能是 `null`，此时 fallback 到 18792。但 `startAgentGateway()` 使用**递增端口分配**（从 18792 开始递增），第二个项目会用 18793。如果多个项目同时运行，fallback 指向错误端口。

#### 问题 F：Gateway 状态不持久化

`gatewayPort` 和 `gatewayPid` 仅存在内存中的 `settingsStore`。应用重启后所有项目显示为"未连接"，需要用户重新手动启动每个项目的 gateway。没有自动恢复机制。

### 1.3 影响范围

| 严重程度 | 影响 |
|----------|------|
| 🔴 致命 | 所有 Agent 项目首次启动时 WebSocket 几乎必失败（问题 A+B 叠加） |
| 🟠 高 | 切换项目后重新连接成功率低（问题 B+C） |
| 🟡 中 | 多项目场景端口混乱（问题 E） |
| 🔵 低 | 应用重启后需手动重连（问题 F） |

---

## 2. 优化方案

### 2.1 P0 — Gateway 启动加入健康检查（阻塞等待就绪）

**目标：** `startAgentGateway()` 不再立即返回，而是等待 FastAPI HTTP endpoint 可访问后再返回。

**方案：**

```typescript
export async function startAgentGateway(
  projectRootPath: string,
  resourcesPath: string,
  existingPort?: number,
): Promise<AgentGatewayStartResult> {
  // ... 现有 spawn 逻辑不变 ...

  // 新增：轮询等待 HTTP 服务就绪
  await waitForGatewayReady(`http://127.0.0.1:${port}/health`, 15_000);
  
  return { port, pid };
}

async function waitForGatewayReady(
  url: string, 
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) return;
    } catch {
      // 服务尚未就绪，继续等待
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Gateway did not start within ${timeoutMs}ms`);
}
```

**注意：** 这需要把 `startAgentGateway()` 改为 async，调用链上的 `ipcMain.handle` 也需要改为 async（它已经是 async 了）。

### 2.2 P0 — WebSocket 连接加入指数退避重试

**目标：** `connectToAgent()` 在连接失败时自动重试。

**方案：**

```typescript
export async function connectToAgent(
  projectId: string,
  port: number,
  userId?: string,
  sessionId?: string,
): Promise<void> {
  // ... 清理旧连接 ...

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    try {
      return await connectOnce(projectId, port, userId, sessionId);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS * attempt));
      }
    }
  }
  throw lastError;
}
```

### 2.3 P1 — Gateway 进程错误透传到 UI

**目标：** Python 进程的 stderr 输出和 crash 信息传递到渲染进程。

**方案：**

- `agent-gateway.ts` 中收集 `child.stderr` 的尾部输出（最后 500 字符）
- `ipcMain.handle(AGENT_GATEWAY_START)` 在启动失败时把 stderr 片段包含在错误消息中
- UI 的 `handleGatewayToggle` 在 catch 中显示具体错误

### 2.4 P1 — 修复端口推断逻辑

**目标：** 明确 gatewayPort 的类型，去掉硬编码 fallback。

**方案：**

- `AgentChatPanel` 和 `AgentSessionList` 中，如果 `project.gatewayPort` 为 null/falsy，**不尝试连接**而是显示"请先启动 Gateway"
- `AgentChatPanel` 连接前检查 `project.gatewayPort` 是否存在
- `ProjectsManager.tsx` 中 `isAgentProject && selectedProject?.gatewayPort` 条件已经做了这步，但 `AgentChatPanel` 内部又 fallback 回 18792，需要对齐

### 2.5 P2 — Gateway 状态持久化与重启恢复

**目标：** 应用重启后能自动恢复已启动的 gateway。

**方案：**

- 在 `settingsStore` 中持久化 `gatewayPort` 和 `gatewayPid`
- 应用启动时，遍历有 `gatewayPort` 的项目，检查进程是否存活
- 如果进程已死，清理状态（标记为未连接）
- 如果进程存活，直接复用端口

### 2.6 P2 — 修复 disconnectFromAgent 语义

**位置：** `agent-service.ts`

**方案：** 改为发送明确的 detach 消息类型，或只关闭连接不发送消息。

---

## 3. 优先级排序

| 优先级 | 问题 | 改动量 | 影响 |
|--------|------|--------|------|
| P0 | A: Gateway 启动无健康检查 | ~30 行 | 解决首次连接必败 |
| P0 | B: WebSocket 无重试 | ~20 行 | 解决连接偶发失败 |
| P1 | C: 错误不传递到 UI | ~15 行 | 改善调试体验 |
| P1 | E: 默认端口硬编码 | ~5 行 | 修复多项目场景 |
| P2 | F: 状态不持久化 | ~40 行 | 提升用户体验 |
| P2 | D: disconnect 语义问题 | ~10 行 | 代码健壮性 |

---

## 4. 风险与回滚

### 风险

- `startAgentGateway()` 改为 async 会影响 IPC 调用链，但 IPC handler 已支持 async
- 健康检查引入 15 秒超时，但如果 TCP 端口被其他进程占用会等满 15 秒才报错
- 重试机制可能导致 UI 启动阶段短暂闪烁

### 回滚

- 恢复 `agent-gateway.ts` 的 `startAgentGateway` 为非 async 版本
- 回退 `agent-service.ts` 的 `connectToAgent` 到单次连接
- 移除新增的 `waitForGatewayReady` 函数
