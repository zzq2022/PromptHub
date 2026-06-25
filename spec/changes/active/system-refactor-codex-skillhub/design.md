# Design - 重构设计方案 (Refactoring Technical Design)

## Overview

为了支撑 Codex 工作区、双向自动同步、SkillHub 商店和多租户分权体系，我们需要对前后端进行整体技术重构。
* **数据存储**：扩展 SQLite schema，增强 `skills` 表的版本和控制属性。
* **桌面端与服务端通信**：扩展 IPC 通道（Model 管理、工具装配、同步控制）与服务端的 REST APIs。
* **同步机制**：以防抖的增量对比机制取代单向文件传输，减少数据冲突，完成自动静默双向同步。
* **工具装配引擎**：在中继层将 Skills/MCP 动态混入 LLM 交互会话中。

---

## Affected Areas

### 1. Data Model (数据模型调整)
* **`skills` 表结构增强**：
  * 已包含 `approval_status` (CHECK 约束确保为 pending/approved/rejected)。
  * 已包含 `owner_user_id` 和 `visibility` 区分多租户归属与共享状态。
* **`models_config` 表（新增）**：
  * 存放用户的多模型提供商接入密钥与基础地址配置：
    ```sql
    CREATE TABLE IF NOT EXISTS models_config (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,         -- 'openai', 'anthropic', 'deepseek', 'gemini'
      name TEXT NOT NULL,             -- 用户定义的友好名称
      api_key_encrypted TEXT,         -- 本地加密存储的密钥
      base_url TEXT,                  -- 代理或自定义基础路径
      default_model TEXT,             -- 默认调用模型
      max_context_window INTEGER,     -- 最大上下文大小
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    ```

### 2. IPC & API (接口契约扩展)
* **新增桌面端 IPC 管道** (`packages/shared/constants/ipc-channels.ts`):
  * `skill:scan`：调起本地安全合规扫描。
  * `model:list`, `model:create`, `model:update`, `model:delete`, `model:test`：管理大模型接入提供商。
  * `sync:start`, `sync:stop`, `sync:status`：控制后台自动同步服务的开启、关闭与心跳获取。
* **新增服务端 REST API** (`apps/web/src/routes/`):
  * `PUT /api/v1/skills/:id/publish`：普通用户发布技能。
  * `GET /api/v1/admin/pending`：管理员查询待审核技能。
  * `POST /api/v1/admin/review`：管理员审批技能（批准/拒绝）。
  * `GET /api/v1/skills`：公共商店技能列表（ClawHub版）。
  * `GET /api/v1/download`：公开技能 ZIP 安装包流式下载。

### 3. Filesystem & Sync (文件系统与自动同步逻辑)
* **防抖同步引擎**：
  * 在桌面端维护一个内存状态 `dirtyState = Set<string>`（记录发生修改的表名/ID）。
  * 每次修改动作触发 30s 延迟定时器。定时器触发后，后台线程合并 `dirtyState` 列表，静默向服务端发起 API 握手：
    1. 校验哈希：比对本地 `prompthub.db` 数据指纹与服务端 `manifest`。
    2. 双向合并：若版本不一致，拉取服务端最新快照。在核心层用 `updatedAt` 时间戳进行字段合并，冲突字段以较新的一方为准，更新本地库。
    3. 推送增量：合并后，将本地有更新的增量数据推送到云端。
    4. 重置 `dirtyState` 并更新右上角状态指示灯。

### 4. UI / UX (界面设计要点)
* **Codex 工作区**：
  * 基于 React Grid 或 Flex 划分为经典的三栏视图。
  * 底部输入框下方设计 `Dropdown Selector`。勾选的本地技能和 MCP 工具以小 Badge 贴附。输入内容后，会话服务拦截并分析这些 Badge：
    * **本地技能 (Skill)**：读取其正文并拼装入 System Prompt。
    * **MCP 工具**：从本地进程端口获取 MCP Schema，转换为 GPT 兼容的 `tools` 参数发送。

---

## Tradeoffs

* **安全性 vs 易用性**：大模型配置的 `api_key_encrypted` 采用本地对称加密（如基于用户系统标识生成的密钥），虽然不能 100% 防御高级本地提权攻击，但在平衡了“免输密码体验”与“明文存储风险”后，是目前最务实的安全方案。
* **即时同步 vs 网络负载**：选择“定时轮询 + 30秒修改防抖”方案，既能保证数据同步的实时性（接近即时保存），又极大程度避开了由于连续打字、频繁点击导致的重复接口网络交互，有效节省了带宽与服务器算力。
