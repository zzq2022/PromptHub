# PromptHub 技术架构 PPT 大纲

> 用途：技术分享/团队评审，约 1-2 页幻灯片密度（2 张主图 + 1 张要点收口）。
> 受众：开发 / 架构 / 运维。
> 数据来源：`README.md`、`package.json`（monorepo + 各子包）、`apps/desktop/src/main`、`apps/web/src/index.ts`。

---

## Slide 1｜项目总览：是什么、解决什么

### 1.1 一句话定位
**PromptHub = 本地优先的 Prompt / Skill / AI 编程资产工作台**。
把分散在 Claude Code、Cursor、Codex、Windsurf 等 15+ 工具里的 SKILL.md、规则、Prompt 统一收纳，并支持一键分发与多端同步，数据默认留在用户本机。

### 1.2 核心能力（要讲的 5 条）
- 📝 **Prompt 管理**：文件夹 / 标签 / 收藏、`{{variable}}` 模板、FTS5 全文搜索、Markdown + 代码高亮、版本历史 + diff + 回滚。
- 🧩 **Skill 商店 + 一键分发**：内置 20+ 精选技能，支持 GitHub / skills.sh / 本地目录商店源，**symlink / copy** 双模式安装到 15+ AI 工具的目标目录。
- 📐 **Rules 工作区**：集中管理 `.cursor/rules`、`.claude/CLAUDE.md`、`AGENTS.md`，与导入导出 / 同步全链路打通。
- 🤖 **AI 测试与生成**：OpenAI / Anthropic / Gemini / Azure / 自定义 endpoint，**多模型并行对比** + AI 反推 / 润色 / Quick Add 生成。
- 💾 **同步与备份**：本地优先 → WebDAV（坚果云/Nextcloud）/ 自部署 Web / Cloudflare Workers；统一 `.phub.gz` 全量备份；**只允许一个活动同步源**驱动自动同步。

### 1.3 关键设计原则
- **Local-first**：数据默认在本机，隐私边界清晰（AES-256-GCM 主密码）。
- **多端形态**而非多端重复造轮子：核心业务逻辑收敛在 `packages/core`，UI 在不同壳里复用。
- **平台无关的资产格式**：以 `SKILL.md` / `AGENTS.md` 为事实源，向 15+ 平台做适配分发。

---

## Slide 2｜技术架构：分层 + 数据流

### 2.1 顶层形态（4 端 + 3 包）
```
┌─────────────────────────── 用户可见形态 ───────────────────────────┐
│  apps/desktop          apps/web          apps/web-cloudflare   apps/cli
│  (Electron 33)          (Hono 4 + SPA)    (Workers + D1/R2)     (Node CLI)
└────────────┬──────────────┬────────────────┬────────────────┬──────┘
             │              │                │                │
             ▼              ▼                ▼                ▼
┌────────────────── packages/shared ──────────────────┐
│  types  ·  IPC 常量  ·  协议定义  ·  通用 utils       │
└─────────────────────────────────────────────────────┘
             │              │                │
             ▼              ▼                ▼
┌────────────────── packages/core ───────────────────┐
│  业务核心：Prompt / Skill / Rules / 同步 / AI 路由    │
│  CLI 与桌面端共享同一份实现                            │
└─────────────────────────────────────────────────────┘
             │
             ▼
┌────────────────── packages/db ─────────────────────┐
│  SQLite schema (node-sqlite3-wasm) + 共享查询        │
│  DATA_ROOT: data/ · config/ · logs/ · backups/      │
└─────────────────────────────────────────────────────┘
```

### 2.2 桌面端进程模型（重点）
- **Main 进程**（Node, `src/main/`）：数据库、文件系统、WebDAV、S3 兼容同步、`electron-updater`、菜单/快捷键/启动策略。
- **Preload 桥**（`src/preload/` + `api/`）：基于 `contextBridge` 暴露白名单 IPC，渲染进程 `nodeIntegration=false`。
- **Renderer**（React 18 + Vite 6）：Zustand 状态、Tailwind 3 + 自研动画 tokens（`<Reveal> <Collapsible> <ViewTransition> <Pressable>`）、`@tanstack/react-virtual` 虚拟化长列表、CodeMirror 6 作为轻量代码编辑器。
- **辅助服务层**（`src/main/services/`、`ipc/`）：把 IPC handler 按域拆开（prompt / skill / rules / ai / sync），避免单点 god class。

### 2.3 自部署 Web 形态
- **Server**：Hono 4 + `@hono/node-server`，单进程对外提供 `/api/*` + 静态资源 + SPA fallback（`apps/web/src/index.ts` 兜底读 `dist/client/index.html`）。
- **Client**：与桌面端**共享** React 组件、`i18next`（7 语言）、样式 token；走 React Router 7。
- **存储**：复用 `packages/db`（SQLite WASM），数据落到 `DATA_ROOT`，无需额外数据库进程。
- **同步协议**：桌面端走「Self-Hosted PromptHub」通道（启动拉取 + 后台定时 + 启动时上传），与 WebDAV 二选一，避免并发写入。
- **鉴权**：bcryptjs 密码哈希 + `jose` 签发 JWT，首次访问 `/setup` 创建管理员，`svg-captcha` 登录验证码。

### 2.4 Cloudflare Workers 形态（实验分支 `apps/web-cloudflare`）
- 计算 → Workers；结构化数据 → D1；图片/视频 → R2。
- 保持与桌面端「Self-Hosted PromptHub」同步协议兼容，桌面客户端无需改造。
- **职责边界清晰**：仅承担数据同步 + 媒体展示；安装到本地工具目录、扫描本机技能仓库等「需要本地文件系统」的能力仍由桌面端负责。

### 2.5 共享层（packages）做了哪些事
- `@prompthub/shared`：跨端的类型、IPC channel 常量、协议 schema（zod 校验源头在这里收口）。
- `@prompthub/core`：业务核心服务（仓库层、版本、商店适配、同步、平台安装器），**CLI 和桌面端都引用同一份**，保证 CLI 命令与 GUI 行为一致。
- `@prompthub/db`：SQLite schema + 共享查询层；用 `node-sqlite3-wasm` 让同一份代码在桌面（Electron main）、Web（Node server）、CLI 都能跑。

### 2.6 关键技术选型
| 关注点       | 选型                                              | 备注                                      |
| ------------ | ------------------------------------------------- | ----------------------------------------- |
| 桌面壳       | Electron 33 + electron-builder / electron-updater | 三平台（mac/win/linux，x64+arm64）打包    |
| UI           | React 18 + Tailwind 3 + 自研动画 tokens            | 卸掉 framer-motion 后 ui-vendor gzip 16KB |
| 状态         | Zustand 5                                         | 轻量、避免 Redux 样板                     |
| 长列表       | `@tanstack/react-virtual`                         | 替换手写 setTimeout 分批渲染              |
| 代码视图     | CodeMirror 6 + 多语言 lang + highlight.js         | 语法高亮 / 行号 / 自动换行                 |
| Web 服务     | Hono 4 + @hono/node-server                        | 轻量、与 Workers 同源（便于云版迁移）       |
| 数据库       | SQLite via `node-sqlite3-wasm`                    | 零依赖、跨端、单文件                       |
| 鉴权         | bcryptjs + jose (JWT) + svg-captcha               | 首登 `/setup` 自助初始化                   |
| 同步         | WebDAV · Self-Hosted Web · Cloudflare Workers     | 三选一，互斥活动同步源                     |
| 加密         | AES-256-GCM 主密码；私密文件夹加密存储（Beta）     | 应用入口保护                              |
| 测试         | Vitest 单测/集成 · Playwright e2e · bundle budget | `test:release` 串起 lint→typecheck→测试→e2e |

### 2.7 数据流（一图带过）
```
[Local FS]  .claude/ .agents/ .cursor/ .codex/ ...
      │ (本地扫描)
      ▼
[desktop main]  ── packages/core ─►  [packages/db] (SQLite)
      │                              │
      │ IPC (preload 白名单)          │ workspace 导出/导入
      ▼                              ▼
[React Renderer]  ◄── 同步协议 ──►  [Self-Hosted Web Hono]
                                     ▲
                                     │  同协议
                                     ▼
                                [CF Workers + D1/R2]
```

---

## 收口页（可选第 3 张）｜设计取舍与已知边界

### 取舍
- **为什么不直接上云？** Local-first 是产品定位，也是合规护城河；自部署 Web/Workers 满足「想用云又不想把数据交给厂商」的用户。
- **为什么 packages/core 不在 Web 用？** Web 形态聚焦「数据访问 + 同步」，不承担本地文件扫描/平台安装等桌面专属能力；core 的复用主要发生在 CLI↔Desktop 之间。
- **为什么只允许一个活动同步源？** 防止 WebDAV 和 Web 双源并发写入造成回放冲突。

### 已知边界
- 桌面端是数据所有权的「真源」；Web / Workers 是镜像+备份，不是强一致主库。
- macOS 未做 Apple 公证，首启需手动 `xattr` 解除隔离。
- 浏览器扩展 / 移动端 / 插件机制仍在 roadmap，未在本期架构内承诺。

### 路线图提示
- 浏览器扩展（ChatGPT/Claude 网页里直接调用）
- 移动端（查看 / 搜索 / 轻量编辑 + 同步）
- 插件机制（Ollama 等本地模型接入）
- Prompt 商店（社区验证过的提示词模板）

---

## 演讲备注（讲的时候可删）
- 第 1 张重点讲「为什么 local-first」和「15+ 平台一键分发」是别人没解决的痛点。
- 第 2 张重点讲 packages/core 复用 + 桌面/CLI 同源，避免「多端各写一份」的腐烂路径。
- 第 2 张可以现场点开 `apps/desktop/src/main/index.ts` 与 `apps/web/src/index.ts` 串讲进程模型。
- 收口页「已知边界」不要回避，让评审相信团队对架构边界有清晰认知。
