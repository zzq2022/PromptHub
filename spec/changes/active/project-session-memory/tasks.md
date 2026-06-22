# Agent Project 管理系统 — Phase 1 实施任务

**目标：** 用户可以创建/导入 Agent 项目，通过 WebSocket 与 Agent 对话，三栏布局 UI 可用。

**当前进度：** T1 ✅ T2 ✅ T3 ✅ T4 ✅ T5 ✅ T6 ✅ | T7-T12 待实现

---

## T1: Agent 模板文件集

**文件位置：** `apps/desktop/resources/agent-template/`

从 Tpa_RuYiBot 复制核心文件到 PromptHub 模板目录，精简为通用模板。

### T1.1 创建模板目录结构

```
apps/desktop/resources/agent-template/
├── agent.py                          # T3 中精简
├── config.json                       # T1.3
├── run_gateway.py                    # 从 Tpa_RuYiBot 复制（启动入口）
├── stop_gateway.py                   # 从 Tpa_RuYiBot 复制（调试用）
├── libs/
│   ├── __init__.py
│   ├── gateway_utils.py              # 从 Tpa_RuYiBot 复制
│   ├── logger_setup.py               # 从 Tpa_RuYiBot 复制
│   ├── memory_tools.py               # 从 Tpa_RuYiBot 复制
│   ├── smart_extractor.py            # 从 Tpa_RuYiBot 复制
│   └── trigger_memory.py             # 从 Tpa_RuYiBot 复制
├── backend/
│   ├── __init__.py
│   ├── app.py                        # 从 Tpa_RuYiBot 复制
│   └── api/
│       ├── __init__.py
│       ├── chat.py                   # 从 Tpa_RuYiBot 复制
│       ├── sessions.py               # 从 Tpa_RuYiBot 复制
│       ├── settings.py               # 从 Tpa_RuYiBot 复制
│       ├── skills.py                 # 从 Tpa_RuYiBot 复制
│       └── nanobot_compat.py         # 从 Tpa_RuYiBot 复制
├── SOUL.md                           # 通用模板（去掉 Tpa_RuYiBot 特定人格）
├── USER.md                           # 空模板
├── TOOLS.md                          # 从 Tpa_RuYiBot 复制
├── HEARTBEAT.md                      # 空模板
├── AGENTS.md                         # 通用 Agent 行为规范
├── .gitignore                        # sessions/ 和 memory/ 忽略规则
├── sessions/                         # .gitkeep
│   └── .gitkeep
└── memory/                           # .gitkeep
    └── .gitkeep
```

**验收标准：** 目录结构完整，所有文件非空（.gitkeep 除外）。

### T1.2 确认 libs/ 和 backend/ 文件完整性

逐个检查 `libs/` 和 `backend/` 中的文件，确认：
- 没有 Tpa_RuYiBot 特定业务逻辑残留（Chinook DB、stock query）
- 所有 import 路径兼容模板结构
- `gateway_utils.py` 中的 `save_session_turn()` 函数可用（agent.py CLI 模式需要）

**验收标准：** 模板文件无业务逻辑残留。

### T1.3 创建 config.json 模板

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
  "custom_instructions": "Extract ONLY persistent, long-term facts and preferences about the user."
}
```

**验收标准：** `config.json` 是合法 JSON，包含所有必要字段。

### T1.4 创建 SOUL.md 通用模板

去掉 Tpa_RuYiBot 的股票助手人格，写一个通用的 Agent 人格模板。

**验收标准：** SOUL.md 无 Tpa_RuYiBot 特定内容。

---

## T2: IPC 通道定义 + 类型

**文件位置：** `packages/shared/`

### T2.1 新增 IPC 通道常量

在 `packages/shared/constants/ipc-channels.ts` 中新增：

```typescript
// Agent 项目管理
AGENT_PROJECT_CREATE: "agentProject:create",
AGENT_PROJECT_IMPORT: "agentProject:import",
AGENT_PROJECT_VERIFY: "agentProject:verify",

// Agent gateway 进程管理
AGENT_GATEWAY_START: "agentGateway:start",
AGENT_GATEWAY_STOP: "agentGateway:stop",
AGENT_GATEWAY_STATUS: "agentGateway:status",

// Agent 会话（REST API 透传）
AGENT_SESSION_LIST: "agentSession:list",
AGENT_SESSION_GET: "agentSession:get",
AGENT_SESSION_CREATE: "agentSession:create",
AGENT_SESSION_DELETE: "agentSession:delete",
AGENT_SESSION_RENAME: "agentSession:rename",

// Agent 记忆（只读）
AGENT_MEMORY_LOAD: "agentMemory:load",
```

**验收标准：** 所有通道在 `IPC_CHANNELS` 中定义，命名符合 `agent*` 前缀规范。

### T2.2 新增共享类型

在 `packages/shared/types/` 下新增 `agent-project.ts`：

```typescript
/** Agent 项目来源 */
export type AgentProjectOrigin = 'template' | 'imported';

/** Agent 项目配置（config.json） */
export interface AgentConfig {
  model?: string;
  apiKey?: string;
  apiBase?: string;
  maxTokens?: number;
  temperature?: number;
  memoryBackend?: 'markdown' | 'vector';
}

/** 创建 Agent 项目的请求参数 */
export interface CreateAgentProjectInput {
  name: string;
  targetDir: string;
  config?: AgentConfig;
}

/** 导入 Agent 项目的请求参数 */
export interface ImportAgentProjectInput {
  dirPath: string;
}

/** Agent gateway 状态 */
export interface AgentGatewayStatus {
  isRunning: boolean;
  port?: number;
  pid?: number;
}

/** Agent session 信息（透传自 Agent REST API） */
export interface AgentSessionInfo {
  session_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

/** Agent session 消息 */
export interface AgentSessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
```

在 `packages/shared/types/index.ts` 中导出新类型。

**验收标准：** 类型文件编译通过，从 index.ts 可正常导入。

### T2.3 扩展 SkillProject 类型

在现有的 `SkillProject` 接口中添加 `origin` 字段：

```typescript
// packages/shared/types 下的 SkillProject 定义
interface SkillProject {
  id: string;
  name: string;
  rootPath: string;
  origin?: 'template' | 'imported';   // 新增
  gatewayPort?: number;                // 新增
  gatewayPid?: number;                 // 新增
  scanPaths?: string[];
  deployTargets?: string[];
  createdAt: number;
  updatedAt: number;
}
```

**验收标准：** 现有 skillProjects 代码不受影响（字段均为可选）。

---

## T3: Agent 模板 agent.py 精简

**文件位置：** `apps/desktop/resources/agent-template/agent.py`

将 proposal.md 中 3.4 节的 agent.py 精简版写入模板文件。

核心变更（相对 Tpa_RuYiBot 的 agent.py）：
- 去掉 Chinook DB 下载逻辑
- 去掉 stock-specific skills
- 添加 `--session` 参数
- 添加 `save_session_turn()` 调用（CLI 模式也保存对话记录）
- 确保与 gateway 模式的 JSONL 格式一致

**验收标准：** 
- `python agent.py "hello"` 可运行（需要 venv）
- `python agent.py --user alice --session test123 "hello"` 可运行
- CLI 模式写入的 JSONL 与 gateway 模式格式一致

---

## T4: Core 层 — Agent 项目管理

**文件位置：** `packages/core/src/`

### T4.1 新建 `agent-project.ts`

```typescript
export interface AgentProjectManager {
  // 创建新项目（从模板复制）
  createProject(input: CreateAgentProjectInput): Promise<SkillProject>;
  
  // 导入已有项目（验证 + 注册）
  importProject(input: ImportAgentProjectInput): Promise<SkillProject>;
  
  // 验证目录是否为合法 Agent 项目
  verifyProject(dirPath: string): Promise<{ isValid: boolean; name?: string }>;
  
  // 获取模板目录路径（resources/agent-template/）
  getTemplatePath(): string;
}
```

实现要点：
- `createProject`：复制模板 → 修改 config.json → 写入 settings
- `importProject`：验证 `agent.py` + `config.json` 存在 → 注册到 settings
- `verifyProject`：检查必需文件，返回验证结果

**验收标准：**
- 创建项目后目标目录包含完整模板文件
- 导入项目后 SkillProject.origin = 'imported'
- 重复导入同一目录返回错误

### T4.2 新建 `agent-gateway.ts`

```typescript
export interface AgentProcessManager {
  start(projectId: string, projectRootPath: string): Promise<{ port: number; pid: number }>;
  stop(projectId: string): Promise<void>;
  isRunning(projectId: string): boolean;
  getPort(projectId: string): number | null;
}
```

实现要点：
- 复用 proposal.md 9.6 节的 `startAgentGateway()` 逻辑（PATH 注入）
- 端口分配：从 18792 开始递增，避免冲突
- 进程生命周期管理：启动、停止、异常处理
- 资源清理：app quit 时停止所有 gateway 进程

**验收标准：**
- `start()` 后 gateway 进程在后台运行，端口可达
- `stop()` 后进程正确退出，端口释放
- 多个项目可同时运行不同端口

### T4.3 新建 `agent-session.ts`

```typescript
export interface AgentSessionProxy {
  list(gatewayPort: number, userId: string): Promise<AgentSessionInfo[]>;
  get(gatewayPort: number, sessionId: string): Promise<AgentSessionMessage[]>;
  create(gatewayPort: number, userId: string, title?: string): Promise<string>;
  delete(gatewayPort: number, sessionId: string): Promise<void>;
  rename(gatewayPort: number, sessionId: string, title: string): Promise<void>;
  loadMemory(gatewayPort: number, userId: string): Promise<string>;
}
```

实现要点：
- 透传 HTTP/REST 请求到 Agent Gateway
- 使用 `httpx` 或 `fetch` 调用 Agent 的 REST API 端点
- 错误处理：gateway 未运行时返回友好错误

**验收标准：** 通过 gatewayPort 可获取 Agent 的 session 列表。

---

## T5: IPC Handler 实现

**文件位置：** `apps/desktop/src/main/ipc/`

### T5.1 新建 `agent-project.ts` IPC handler

```typescript
// 注册 agentProject:create, agentProject:import, agentProject:verify
```

实现要点：
- 调用 Core 层的 `AgentProjectManager`
- 在 settings.store 中读写 skillProjects
- 路径验证（防穿越）

**验收标准：** 通过 IPC 可创建/导入/验证 Agent 项目。

### T5.2 新建 `agent-gateway.ts` IPC handler

```typescript
// 注册 agentGateway:start, agentGateway:stop, agentGateway:status
```

实现要点：
- 调用 Core 层的 `AgentProcessManager`
- 更新 SkillProject 的 gatewayPort/gatewayPid
- 进程退出回调（自动清理状态）

**验收标准：** 通过 IPC 可启动/停止/查询 gateway 状态。

### T5.3 新建 `agent-session.ts` IPC handler

```typescript
// 注册 agentSession:list, agentSession:get, agentSession:create, 
//       agentSession:delete, agentSession:rename, agentMemory:load
```

实现要点：
- 调用 Core 层的 `AgentSessionProxy`
- 参数验证（port 合法性、sessionId 非空）

**验收标准：** 通过 IPC 可获取 Agent 的 session 列表和消息。

### T5.4 在 IPC index.ts 中注册新 handler

在 `apps/desktop/src/main/ipc/index.ts` 中导入并注册所有新增的 IPC handler。

**验收标准：** app 启动后所有 agent* IPC 通道可正常 invoke。

---

## T6: Preload 桥接

**文件位置：** `apps/desktop/src/preload/`

在 preload 脚本中暴露 Agent 相关的 API 方法：

```typescript
// contextBridge.exposeInMainWorld('api', {
//   agentProject: { create, import, verify },
//   agentGateway: { start, stop, status },
//   agentSession: { list, get, create, delete, rename },
//   agentMemory: { load },
// })
```

**验收标准：** `window.api.agentProject.create(...)` 可在渲染器中调用。

---

## T7: AgentService（渲染器侧 WebSocket 封装）

**文件位置：** `apps/desktop/src/renderer/services/agent-service.ts`

实现 WebSocket 连接管理器（proposal.md 5.3 节）：

```typescript
class AgentServiceImpl implements AgentService {
  private connections = new Map<string, WebSocket>();

  async connect(projectId: string, port: number): Promise<void> { ... }
  disconnect(projectId: string): void { ... }
  sendMessage(projectId: string, chatId: string, content: string): void { ... }
  onDelta(projectId: string, callback: (text: string) => void): () => void { ... }
  onTurnEnd(projectId: string, callback: () => void): () => void { ... }
  onError(projectId: string, callback: (error: string) => void): () => void { ... }
}
```

实现要点：
- 浏览器原生 WebSocket API，直连 `ws://localhost:{port}`
- 重连逻辑（断线后自动重试 3 次）
- 事件监听管理（支持 unsubscribe）
- 连接状态跟踪

**验收标准：**
- 连接到运行中的 gateway 后可发送消息
- 收到 delta 事件时回调触发
- 断开连接后 WebSocket 正确关闭

---

## T8: UI 组件

**文件位置：** `apps/desktop/src/renderer/components/`

### T8.1 新建 `CreateAgentDialog.tsx`

新建 Agent 项目对话框（proposal.md 7.2 节）：
- 表单字段：项目名称、存放目录、Provider、Model、API Key、API Base
- 提交逻辑：调用 `window.api.agentProject.create()`
- 验证：名称非空、目录可写、Provider 配置完整

**验收标准：** 填写表单后点击创建，新项目出现在项目列表中。

### T8.2 新建 `ImportProjectDialog.tsx`

导入项目对话框（proposal.md 7.3 节）：
- 目录选择（使用 Electron 的 dialog.showOpenDialog）
- 自动提取项目名称（从目录名）
- 调用 `window.api.agentProject.verify()` 验证
- 提交逻辑：调用 `window.api.agentProject.import()`

**验收标准：** 选择合法 Agent 项目目录后可成功导入。

### T8.3 新建 `AgentChatPanel.tsx`

Agent 聊天面板（proposal.md 7.1 右侧面板）：
- 消息流展示（用户消息 + AI 回复）
- 流式输出（delta 事件实时更新）
- 输入框 + 发送按钮
- 工具调用进度展示

**验收标准：** 连接 Agent 后可实时对话，流式输出正常。

### T8.4 新建 `AgentSessionList.tsx`

Session 列表组件（proposal.md 7.1 中间栏）：
- 调用 `window.api.agentSession.list()` 获取列表
- 显示 session 标题、时间、消息数
- 点击 session 切换聊天上下文
- 新建/删除 session 操作

**验收标准：** 选中 Agent 后显示 session 列表，点击可切换。

### T8.5 修改 `SkillProjectsView.tsx`

在现有 Projects 页面添加 Agent 项目支持：
- 项目列表中区分显示 Agent 项目（添加图标/标识）
- Agent 项目点击后显示三栏布局（项目列表 → Session 列表 → 聊天面板）
- 底部添加「新建 Agent」和「导入项目」按钮

**验收标准：** 项目列表可同时显示 Skill 项目和 Agent 项目。

---

## T9: Zustand Store 扩展

**文件位置：** `apps/desktop/src/renderer/stores/settings.store.ts`

### T9.1 扩展 skillProjects 存储

添加 Agent 项目相关操作：

```typescript
addAgentProject(project: SkillProject): void;
removeAgentProject(projectId: string): void;
updateAgentProject(projectId: string, updates: Partial<SkillProject>): void;
getAgentProjects(): SkillProject[];
```

实现要点：
- 复用现有 skillProjects 数组（通过 origin 字段区分）
- 保持向后兼容（origin 为 undefined 时视为旧版 Skill 项目）

**验收标准：** 创建/删除 Agent 项目后持久化正确。

---

## T10: i18n 国际化

**文件位置：** `apps/desktop/src/renderer/i18n/locales/`

添加 Agent 项目相关翻译键：

```json
{
  "agentProject": {
    "create": "新建 Agent",
    "import": "导入项目",
    "createTitle": "新建 Agent 项目",
    "importTitle": "导入 Agent 项目",
    "name": "项目名称",
    "targetDir": "存放目录",
    "provider": "Provider",
    "model": "模型",
    "apiKey": "API Key",
    "apiBase": "API Base",
    "browse": "浏览...",
    "creating": "创建中...",
    "importing": "导入中...",
    "verifyFailed": "目录不是合法的 Agent 项目",
    "alreadyImported": "该项目已导入",
    "gatewayStartFailed": "启动 Agent gateway 失败",
    "gatewayRunning": "Agent 运行中",
    "gatewayStopped": "Agent 已停止",
    "noSessions": "暂无会话",
    "newSession": "新建会话",
    "deleteSession": "删除会话",
    "renameSession": "重命名会话",
    "chatPlaceholder": "输入消息...",
    "send": "发送",
    "connecting": "连接中...",
    "disconnected": "已断开"
  }
}
```

**验收标准：** 所有 UI 文本通过 `t()` 函数调用，支持中英文切换。

---

## T11: 打包配置

**文件位置：** `apps/desktop/electron-builder.json`

### T11.1 添加 extraResources

```json
{
  "extraResources": [
    { "from": "resources/agent-template", "to": "agent-template" },
    { "from": "resources/agent-venv", "to": "agent-venv" },
    { "from": "resources/requirements.agent.txt", "to": "requirements.agent.txt" }
  ]
}
```

**验收标准：** 打包后 resources 目录包含 agent-template 和 agent-venv。

### T11.2 创建 requirements.agent.txt

```txt
nanobot
fastapi>=0.100.0
uvicorn>=0.23.0
pydantic>=2.0.0
aiofiles
httpx
```

**验收标准：** 依赖清单完整，可正常安装。

---

## T12: 测试

### T12.1 Core 层单元测试

**文件位置：** `packages/core/tests/`

- `agent-project.test.ts`：测试 createProject、importProject、verifyProject
- `agent-gateway.test.ts`：测试 start、stop、端口分配
- `agent-session.test.ts`：测试 REST API 透传

**验收标准：** 所有测试通过，覆盖正常路径和错误路径。

### T12.2 IPC Handler 测试

**文件位置：** `apps/desktop/tests/unit/main/ipc/`

- `agent-project.test.ts`
- `agent-gateway.test.ts`
- `agent-session.test.ts`

**验收标准：** 通过 IPC 调用可完成完整流程。

### T12.3 渲染器组件测试

**文件位置：** `apps/desktop/tests/unit/components/`

- `CreateAgentDialog.test.tsx`
- `ImportProjectDialog.test.tsx`
- `AgentChatPanel.test.tsx`
- `AgentSessionList.test.tsx`

**验收标准：** 组件渲染正常，交互逻辑正确。

---

## 任务依赖关系

```
T1 (模板文件) ─────────────┬──→ T4 (Core 层) ──→ T5 (IPC) ──→ T6 (Preload) ──→ T9 (Store)
T2 (IPC + 类型) ──────────┤                           │                         │
T3 (agent.py 精简) ───────┘                           ├──→ T7 (WebSocket) ─────┤
                                                        │                         │
T8 (UI 组件) ──────────────────────────────────────────────────────────────────→ T10 (i18n)
T11 (打包配置) ─────────────────────────────────────────────────────────────────→ T12 (测试)
```

**建议执行顺序：**
1. **第一轮：** T1 + T2 + T3（基础准备）
2. **第二轮：** T4 + T5 + T6（后端逻辑）
3. **第三轮：** T7 + T8 + T9（前端集成）
4. **第四轮：** T10 + T11 + T12（收尾）

---

## Phase 2 预告

Phase 1 完成后，Phase 2 将实现：
- Session 列表完整透传
- 聊天历史展示（加载历史消息）
- 流式输出优化
- Tool call 进度展示（工具调用状态）
- Agent 配置编辑 UI
