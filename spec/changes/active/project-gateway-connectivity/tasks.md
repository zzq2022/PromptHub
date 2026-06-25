# Tasks: Gateway 连接可靠性优化

## 使用说明

- **分支命名：** `fix/gateway-connectivity`
- **每条任务完成后 commit，commit message 格式：** `{type}: {scope} - {简短描述}`
- **完成一条勾一条（用 `[x]`）**

---

## Phase 1：核心修复（P0）

- [ ] **1.1 Gateway 健康检查**
  - 文件：`packages/core/src/agent-gateway.ts`
  - 改动：
    1. 新增 `waitForGatewayReady(url, timeoutMs)` 函数，轮询 HTTP `/health` endpoint
    2. 将 `startAgentGateway()` 改为 `async`，启动子进程后调用 `waitForGatewayReady`
    3. 超时未就绪则 kill 子进程并抛异常
    4. 更新类型定义 `AgentGatewayStartResult`（如需）
  - 验证：单元测试覆盖健康检查超时和正常场景

- [ ] **1.2 WebSocket 指数退避重试**
  - 文件：`apps/desktop/src/renderer/services/agent-service.ts`
  - 改动：
    1. 将 `connectToAgent()` 中的单次 WebSocket 连接抽离为 `connectOnce()`
    2. 实现循环重试逻辑（最多 3 次，延时 2s, 4s, 6s）
    3. 在 `ws.onerror` 中不立即 reject，而是等待重试耗尽
  - 验证：模拟网关延迟启动，确认 WS 在重试后成功连接

- [ ] **1.3 报错可见性提升 + 端口推断修复**
  - 文件：`packages/core/src/agent-gateway.ts`
  - 改动：进程 crash / stderr 输出截取最后 500 字符拼入错误消息
  - 文件：`apps/desktop/src/renderer/pages/AgentChatPanel.tsx`（或等效文件）
  - 改动：`gatewayPort` 为 null 时不尝试连接，显示"请先启动 Gateway"
  - 文件：`apps/desktop/src/renderer/components/ProjectsManager.tsx`（或等效文件）
  - 改动：对齐端口逻辑，移除硬编码 18792 fallback

---

## Phase 2：体验改进（P1）

- [ ] **2.1 Gateway 状态持久化 & 重启恢复**
  - 文件：`packages/core/src/agent-gateway.ts`
  - 改动：
    1. 启动成功后将 `{ projectId, port, pid }` 写入持久化存储
    2. 应用启动时调用 `restoreGateways()` 检查持久化记录中的进程是否存活
    3. 已死的进程清理记录，存活的记录其端口供 UI 复用
  - 文件：对应 IPC handler 新增 `restore-gateways` 通道

- [ ] **2.2 disconnectFromAgent 语义修正**
  - 文件：`apps/desktop/src/renderer/services/agent-service.ts`
  - 改动：
    1. `disconnectFromAgent()` 中 `ws.send()` 前检查 readyState
    2. 发送明确的消息类型（`detach` 而非 `attach`）
    3. 发送失败不阻塞关闭流程

---

## Phase 3：测试与验证

- [ ] **3.1 健康检查单元测试**
  - 文件：`packages/core/tests/agent-gateway.test.ts`
  - 覆盖场景：
    - `waitForGatewayReady` 在服务就绪时快速返回
    - `waitForGatewayReady` 在超时后抛异常
    - `startAgentGateway` 成功启动后等待就绪
    - `startAgentGateway` 超时后 kill 子进程

- [ ] **3.2 WebSocket 重试单元测试**
  - 文件：`apps/desktop/tests/renderer/agent-service.test.ts`
  - 覆盖场景：
    - 首次连接成功直接返回
    - 前 2 次失败第 3 次成功
    - 3 次全部失败抛出最终错误

- [ ] **3.3 多项目端口分配集成测试**
  - 验证连续启动 3 个项目，每个获得不同的端口
  - 验证端口被占用时的递增 + 健康检查超时

- [ ] **3.4 端到端手动测试清单**
  - [ ] 从模板创建 Agent 项目，等待 3 秒后确认 Gateway 自动启动
  - [ ] 进入聊天面板，确认 WebSocket 连接成功
  - [ ] 发送消息并接收回复
  - [ ] 切换到第 2 个 Agent 项目，确认重新连接正常
  - [ ] 杀掉 gateway 进程（模拟 crash），确认 UI 显示断连
  - [ ] 重启应用，确认之前启动的 gateway 自动恢复

---

## 代码变更清单

| # | 文件 | 改动类型 | 预估行数 |
|---|------|----------|---------|
| 1 | `packages/core/src/agent-gateway.ts` | 修改 + 新增 | +50 / -10 |
| 2 | `apps/desktop/src/renderer/services/agent-service.ts` | 修改 | +30 / -10 |
| 3 | `apps/desktop/src/renderer/pages/AgentChatPanel.tsx` | 修改 | +10 / -5 |
| 4 | `apps/desktop/src/renderer/components/ProjectsManager.tsx` | 修改 | +5 / -5 |
| 5 | `apps/desktop/src/main/ipc-handlers.ts` | 修改 | +10 / -2 |
| 6 | `packages/core/tests/agent-gateway.test.ts` | 新增 | +120 |
| 7 | `apps/desktop/tests/renderer/agent-service.test.ts` | 新增 | +80 |
| **合计** | | | **+305 / -32** |
