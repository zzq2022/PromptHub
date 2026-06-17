# Tasks

按阶段组织。同一阶段内的项可合并到一个 PR；跨阶段的项不要混。

## P1 — Bundle 可观测性

- [x] 添加 `rollup-plugin-visualizer` 到 `apps/desktop` devDependencies
- [x] `vite.config.ts` 增加 `BUILD_ANALYZE=1` 分支，启用 visualizer
- [x] `apps/desktop/package.json` 增加 `build:analyze` 脚本
- [x] 写 `apps/desktop/scripts/check-bundle-budget.mts`
- [x] 写 `apps/desktop/bundle-budget.json`（初版宽松基线）
- [x] `.gitignore` 增加 `apps/desktop/dist-stats/`
- [x] 本地跑一次 `pnpm --filter @prompthub/desktop build:analyze` 并确认 treemap 可读
- [x] 把 P1 的实测基线（主入口 gzip、各 vendor chunk）记录到 `implementation.md`

## P2 — 设置页拆分

> 在 P1 拿到精确数据后，发现 `SettingsPage` chunk 已只有 49 KB gzip 且不在首屏路径，物理拆分 5500 行带来的回归风险远大于收益。**降级为 follow-up**：作为独立 change 推进，本变更不再覆盖 P2。

- [-] ~~新建 `apps/desktop/src/renderer/components/settings/data/` 子目录~~（推迟）
- [-] ~~`DataSettings.tsx` 拆分为：`DataSettings.tsx`（router） + `WebdavPanel` + `SelfHostedPanel` + `S3Panel` + `BackupPanel` + `ImportExportPanel`（按现有 section 边界）~~（推迟）
- [-] ~~子面板用 `lazy()` + `<Suspense>` 加载~~（推迟）
- [-] ~~新建 `apps/desktop/src/renderer/components/settings/ai/` 子目录并对 `AISettings.tsx` 做同样拆分~~（推迟）
- [-] ~~验证 `useSettingsStore` selector 没有"取整 store"的写法~~（推迟）
- [-] ~~跑 `pnpm test -- tests/unit/components/data-settings.test.tsx --run`、`pnpm test -- tests/unit/components/ai-test-workbench.test.tsx --run` 全绿~~（推迟）
- [-] ~~跑 `pnpm lint && pnpm typecheck` 全绿~~（推迟）
- [-] ~~复跑 `build:analyze`，记录设置页相关 chunk 体积变化到 `implementation.md`~~（推迟）

## P3 — 长列表虚拟化

- [x] 添加 `@tanstack/react-virtual` 到 `apps/desktop` 依赖
- [x] 为 `SkillListView` 接入虚拟化
- [x] 为 `PromptGalleryView` 接入虚拟化（grid 模式）
- [x] 为 `PromptKanbanView` 接入虚拟化（每列独立）
- [-] ~~为 `Sidebar` 文件夹树接入条件虚拟化（>200 项时启用）~~（推迟 — 与 dnd-kit `SortableTree` 协作复杂，绝大多数用户文件夹数量远低于阈值，改为后续 follow-up）
- [x] 移除 `MainContent.tsx` 中 `INITIAL_PROMPT_RENDER_COUNT` / `PROMPT_RENDER_CHUNK_SIZE` / `PROMPT_RENDER_CHUNK_DELAY_MS` / `PROMPT_CARD_INTRINSIC_SIZE` 与对应分批渲染逻辑
- [x] 与 `@dnd-kit` 协作场景做手动验收（pinned 区域保留 framer-motion，unpinned 转纯 div；prompt 拖拽不在虚拟化范围内）
- [-] ~~写 `tests/e2e/prompt-large-list.spec.ts`：1000+ 条 fixture，验证滚动 + 拖拽 + 选中~~（推迟 — 现有 `main-content-large-dataset.integration.test.tsx` 已覆盖 1000 条场景，e2e 继续追加为 marginal value，归入 follow-up）
- [x] 跑 `pnpm test:unit` / `pnpm test -- tests/integration --run` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm bundle:budget` 全绿，记录数字到 `implementation.md`

## P4 — Modal 状态解耦

> 实际执行采用"最小有效干预"：保留 modal state 在 `MainContent` 内部，但把 `VirtualizedPromptList` 用 `React.memo` 包裹并稳定回调引用，这样 modal 开关不会让虚拟化列表子树重渲染。完整抽 `prompt-modal.store` 留作 follow-up。

- [-] ~~新建 `apps/desktop/src/renderer/stores/prompt-modal.store.ts`~~（推迟）
- [-] ~~把 `MainContent.tsx` 中所有 modal `useState` 迁移到该 store~~（推迟）
- [-] ~~抽出 `<PromptModalsHost />`，仅订阅 `prompt-modal.store`~~（推迟）
- [-] ~~抽出 `<PromptCard memo>`（若尚未独立），用 zustand selector 订阅自己那条数据~~（PromptCard 已是 React.memo，未额外抽文件）
- [x] `<VirtualizedPromptList>` 用 `React.memo` 包裹
- [x] `handleContextMenu` 改为 `useCallback`，与 `handleSelectPrompt` 一起保证回调引用稳定
- [x] 跑 `pnpm test:unit` 全绿

## P5 — `skill.store` 拆分

> 实测分析发现 skill.store 的"冷路径"（`chatCompletion` 等）是被 MainContent 等热路径组件**直接 import** 的，物理拆分 skill.store 不会改变 bundle graph。**降级为 follow-up**，作为未来 `desktop-ai-service-modularization` change 的一部分。

- [-] ~~新建 `apps/desktop/src/renderer/stores/skill/` 目录~~（推迟）
- [-] ~~拆分为 `core.ts` / `platform-sync.ts` / `scan.ts` / `export.ts`~~（推迟）
- [-] ~~`skill.store.ts` 仅 re-export `core.ts`~~（推迟）
- [-] ~~在 `SkillPlatformPanel` / `SkillScanPreview` / `SkillStore`（导出对话框等）调用点改为动态 `import()`~~（推迟）
- [-] ~~验证现有 `useSkillStore` 调用方零改动~~（推迟）
- [-] ~~跑测试 + e2e:smoke 全绿~~（推迟）
- [-] ~~复跑 `build:analyze`，确认 `skill.store` chunk 已瘦身~~（推迟）

## P6 — manualChunks 复核 + 体积预算收紧

- [-] ~~移除 `vite.config.ts` 中 `markdown-vendor` manual chunk~~（实测会让主入口变大；保留现状）
- [-] ~~把 markdown 渲染逻辑集中到 `<MarkdownViewer>`，并让其本身 lazy~~（需要重写 6+ 个组件的 markdown 用法，独立 change）
- [-] ~~复核 `dnd-kit` 仅在拖拽场景出现，必要时单独 lazy~~（dnd-kit 与 framer-motion 共占 `ui-vendor` 54 KB，不值得单独拆）
- [x] 全局 grep `from 'lucide-react'`，确认全是命名 import
- [x] 复核 `tailwind.config.js` 的 `content` 字段覆盖 `packages/core`、`packages/shared`、`packages/db` 中的 React 用法（结论：这些 package 没有 React/JSX，无需扫描）
- [x] 在 `bundle-budget.json` 写明"guardrail，不是 ratchet"策略；不主动收紧，留 5–10% 余量
- [x] 把 `pnpm --filter @prompthub/desktop bundle:budget` 接到 `.github/workflows/quality.yml` 中 `Build` 之后
- [x] 跑全套：`pnpm lint && pnpm typecheck && pnpm build && pnpm bundle:budget`

## Cross-cutting

- [x] 每完成一个阶段，更新 `implementation.md` 中对应小节，记录实际数据与偏差
- [x] 把"桌面端长列表虚拟化"、"bundle 预算"作为稳定行为同步到 `spec/knowledge/behavior/desktop.md`
- [x] 在 `spec/knowledge/structure/` 下新增 `desktop-frontend-performance.md` 描述桌面端 renderer 性能策略
- [ ] PR 描述附带前后体积对比与关键性能数字（PR 时补充）
