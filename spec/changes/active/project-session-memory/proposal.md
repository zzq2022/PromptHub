# Project Session & Memory 系统

## 1. 概述

为 PromptHub Projects 模块添加多会话管理和跨会话记忆能力，支持项目 × 用户 × 会话的三维数据隔离。

## 2. 数据模型：三维隔离

```
项目 A (Tpa_RuYiBot)
├── 用户 alice
│   ├── Memory: "alice 偏好用中文回股票问题"
│   ├── Session 1: "研报1" → messages[]
│   └── Session 2: "SQL查询" → messages[]
├── 用户 biubiu
│   ├── Memory: "biubiu 关注新能源板块"
│   ├── Session 1: "分析任务" → messages[]
│   └── Session 2: "选股策略" → messages[]

项目 B (另一个Agent项目)
├── 用户 alice
│   ├── Memory: (独立于项目A的记忆)
│   └── Session 1: ...
└── 用户 bob
    ├── Memory: ...
    └── Session 1: ...
```

与 Tpa_RuYiBot 现有机制的对应关系：

| 维度 | Tpa_RuYiBot 现有 | PromptHub 新设计 |
|---|---|---|
| 项目 | `WORKSPACE = agent.py 所在目录` | `skillProject.id` |
| 用户 | `user_id` 参数 (alice/biubiu) | `userId`（当前登录用户） |
| 会话 | `sessions/{user}__session_{ts}.jsonl` | `project_sessions` 表 |
| 项目记忆 | `memory/{user_id}/MEMORY.md` | `project_memory WHERE scope='project'` |
| 用户记忆 | `mem0 user_id` | `project_memory WHERE scope='user'` |

## 3. UI 设计：三栏布局

```
┌────────────────┬──────────────────┬─────────────────────┐
│ 项目列表       │ Session 列表     │  聊天面板           │
│ (w-56)         │ (w-52)           │  (flex-1)          │
│                │                  │                    │
│ [项目A] ← 选中 │ "会话 1" ←选中   │  消息流...          │
│ [项目B]        │ "会话 2"         │                    │
│ [项目C]        │ "会话 3"         │  [输入框...]        │
│                │                  │                    │
│                │ [+ 新会话]       │                    │
└────────────────┴──────────────────┴─────────────────────┘
```

### 交互细节

1. **Session 自动创建**：选择项目时如果没有活跃 session，自动创建一个
2. **Session 标题**：取第一条用户消息的前 30 字符，支持点击重命名
3. **Session 切换**：点击 session 直接切换，聊天面板平滑过渡，不丢失任何数据
4. **新建会话**：底部「+ 新会话」按钮，创建后自动选中
5. **删除会话**：右键菜单或 hover 显示删除按钮，有确认弹窗
6. **排序**：按 `updatedAt` 降序（最近活跃在最上方）
7. **空状态**：新建项目首次进入时展示引导文案

## 4. 表结构

### project_sessions

```sql
CREATE TABLE project_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,         -- skillProject.id (项目维度)
  user_id TEXT NOT NULL,            -- 用户维度（同一项目不同用户互不可见）
  title TEXT NOT NULL DEFAULT 'New Session',
  summary TEXT,                     -- AI 自动摘要
  goal_state TEXT,                  -- JSON: 当前目标状态（对应 Tpa_RuYiBot 的 goal_state）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_project_sessions_lookup ON project_sessions(project_id, user_id);
```

### project_session_messages

```sql
CREATE TABLE project_session_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES project_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  metadata TEXT,                    -- JSON: latency_ms, token_count, tool_calls
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_session_messages_session ON project_session_messages(session_id);
```

### project_memory

```sql
CREATE TABLE project_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,         -- 项目维度
  user_id TEXT NOT NULL,            -- 用户维度
  scope TEXT NOT NULL CHECK(scope IN ('project', 'user')),
  -- project = 项目级事实 ("这个项目用 TypeScript", "SQL查询只允许 SELECT")
  -- user = 用户级偏好 ("alice 偏好中文回复", "关注新能源板块")
  category TEXT,                    -- 'preference', 'fact', 'habit', 'context'
  content TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('user_explicit', 'ai_extracted', 'agent')),
  -- user_explicit = 用户主动说的
  -- ai_extracted = 每轮对话后 LLM 自动提取
  -- agent = Agent 自身写入的
  access_count INTEGER DEFAULT 0,
  last_accessed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_project_memory_lookup ON project_memory(project_id, user_id);
```

## 5. 关键查询路径

| 场景 | SQL |
|---|---|
| 列出某用户在某项目的 session 列表 | `SELECT * FROM project_sessions WHERE project_id=? AND user_id=? ORDER BY updated_at DESC` |
| 读取某 session 的全部消息 | `SELECT * FROM project_session_messages WHERE session_id=? ORDER BY created_at` |
| 读取某用户在某项目的记忆（注入 prompt） | `SELECT * FROM project_memory WHERE project_id=? AND user_id=? ORDER BY access_count DESC, updated_at DESC LIMIT ?` |
| 读取跨项目的用户级记忆 | `SELECT * FROM project_memory WHERE user_id=? AND scope='user' ORDER BY access_count DESC LIMIT ?` |

## 6. Memory 注入 prompt 的逻辑

```typescript
function buildMemoryContext(projectId: string, userId: string): string {
  // 1. 项目级记忆（只在这个项目生效）
  const projectFacts = memoryDB.list(projectId, userId, { scope: 'project', limit: 20 });

  // 2. 用户级偏好（跨项目生效，如语言偏好）
  const userPrefs = memoryDB.list(null, userId, { scope: 'user', limit: 10 });

  // 3. 拼装
  const sections: string[] = [];
  if (projectFacts.length > 0) {
    sections.push(`## Project Facts\n${projectFacts.map(f => `- ${f.content}`).join('\n')}`);
  }
  if (userPrefs.length > 0) {
    sections.push(`## User Preferences\n${userPrefs.map(f => `- ${f.content}`).join('\n')}`);
  }
  return sections.join('\n\n');
}
```

## 7. 与 Tpa_RuYiBot 的对接方式

### 模式 A：PromptHub 驱动（推荐先做）

PromptHub 自己管理整个对话流程，Agent 不感知 Session：

```
用户在 PromptHub UI 输入消息
  ↓
PromptHub 从 SQLite 加载 session messages + memory
  ↓
拼装 system prompt (含 memory)
  ↓
调用 chatCompletion(aiConfig, messages)
  ↓
PromptHub 把 assistant 回复存入 SQLite
  ↓
（可选）每 N 轮提取 memory
```

**优点**：Agent 不需要改代码，PromptHub 用任何 AI 配置都能跑
**对应 Tpa_RuYiBot**：相当于 PromptHub 替代了 `nanobot` 的 session 管理和 memory 注入，但 AI 后端从 nanobot 换成了 `chatCompletion()`

### 模式 B：Agent 驱动（未来增强）

PromptHub UI 只做展示，Agent 自己跑对话循环：

```
用户在 PromptHub UI 输入消息
  ↓
PromptHub 通过 IPC/HTTP 转发给 Agent 进程
  ↓
Agent 自己管理 session + memory（如 Tpa_RuYiBot 的 jsonl + memory）
  ↓
Agent 回复后，同步写回 PromptHub SQLite（用于 UI 展示）
```

**优点**：Agent 保持自治，可以用自己的 tool call、skill 加载等能力
**缺点**：需要 Agent 支持标准协议，复杂度高

## 8. IPC 通道

```typescript
// packages/shared/constants/ipc-channels.ts
projectSession:create      // (projectId, userId, title?) → session
projectSession:list        // (projectId, userId) → session[]
projectSession:get         // (sessionId) → session with messages
projectSession:delete      // (sessionId) → void
projectSession:rename      // (sessionId, title) → void
projectSession:addMessage  // (sessionId, {role, content, metadata?}) → message
projectSession:clear       // (sessionId) → void

projectMemory:list         // (projectId, userId, {scope?, limit?}) → memory[]
projectMemory:store        // (projectId, userId, {scope, content, category?, source}) → memory
projectMemory:update       // (memoryId, {content?, category?}) → memory
projectMemory:delete       // (memoryId) → void
projectMemory:search       // (projectId, userId, query) → memory[]
```

## 9. 改动清单

| 模块 | 文件 | 改动 | Phase |
|---|---|---|---|
| **DB** | `packages/db/src/schema.ts` | 3 新表 | 1 |
| **DB** | `packages/db/src/init.ts` | 幂等迁移 | 1 |
| **DB** | `packages/db/src/project-session.ts` (新) | Session CRUD | 1 |
| **DB** | `packages/db/src/project-memory.ts` (新) | Memory CRUD + search | 2 |
| **Types** | `packages/shared/types` | Session/Memory 类型 | 1 |
| **IPC** | `packages/shared/constants/ipc-channels.ts` | 12+ 通道 | 1+2 |
| **Preload** | `apps/desktop/src/preload` | 暴露 API | 1 |
| **IPC** | `apps/desktop/src/main/ipc/project-session/*.ts` (新) | Session handlers | 1 |
| **IPC** | `apps/desktop/src/main/ipc/project-memory/*.ts` (新) | Memory handlers | 2 |
| **UI** | `apps/desktop/src/renderer/components/project/ProjectSessionList.tsx` (新) | Session 列表 | 1 |
| **UI** | `apps/desktop/src/renderer/components/project/ProjectsManager.tsx` | 三栏布局 | 1 |
| **AI** | `apps/desktop/src/renderer/services/ai.ts` | system prompt 注入 memory | 2 |
| **AI** | `apps/desktop/src/renderer/components/project/ProjectsManager.tsx` | 对话后提取 memory | 2 |
| **i18n** | 7 个 locale 文件 | session/memory 翻译 | 1+2 |

## 10. Phase 规划

| Phase | 内容 | 可交付 |
|---|---|---|
| **Phase 1** | Session 表 + IPC + 三栏 UI + 聊天持久化 | 用户可以在 Projects 里管理多会话，对话刷新不丢失 |
| **Phase 2** | Memory 表 + 规则提取 + system prompt 注入 | 跨会话记忆，AI 能记住项目事实和用户偏好 |
| **Phase 3** | Session 标题自动摘要 + goal_state + 手动编辑 memory | UI 完善 |
| **Phase 4** | LLM 智能提取 + mem0 向量检索（可选） | 高级记忆能力 |

## 11. 记忆层对照

| 记忆层 | Tpa_RuYiBot 对应 | PromptHub 设计 | 生命周期 |
|---|---|---|---|
| **Session 内消息** | `.jsonl` 文件 | `project_session_messages` 表 | 随 session |
| **项目级事实** | `memory/{user_id}/MEMORY.md` | `project_memory` 表, `scope='project'` | 跨 session |
| **用户级事实** | `memory/{user_id}/MEMORY.md` (mem0) | `project_memory` 表, `scope='user'` | 跨项目 |

## 12. Memory 提取策略

### 方案 A：规则提取（轻量，推荐先做）

每轮对话后，用简单规则检测用户显式声明的偏好：
- "我喜欢用 TypeScript" → 存为 preference
- "这个项目用 pnpm" → 存为 project fact

无需额外 AI 调用。

### 方案 B：LLM 提取（智能，可选增强）

- 对应 Tpa_RuYiBot 的 `smart_extractor`
- 每 N 轮或对话结束后，用轻量模型提取持久事实
- `custom_instructions` 控制提取边界（禁止提取临时查询结果）
- 未来可接入 mem0 向量检索
