# Implementation

> 本文件随阶段推进**实时**更新。当前状态：**计划已落档，尚未开始实施。**

## Baseline (2026-05-16)

`pnpm --filter @prompthub/desktop build` 在 main `01f6874` (toolchain Node 24 升级后) 实测：

| chunk | size | gzip |
| --- | --- | --- |
| `index-*.js`（主入口） | 1.20 MB | 368 KB |
| `markdown-vendor` | 322 KB | 100 KB |
| `SettingsPage` | 194 KB | 50 KB |
| `ui-vendor`（framer-motion + dnd-kit） | 165 KB | 55 KB |
| `react-vendor` | 138 KB | 45 KB |
| `icons`（lucide-react） | 70 KB | 14 KB |
| `i18n-vendor` | 49 KB | 15 KB |
| 其它（按需） | n/a | n/a |
| `out/renderer/assets/*.css` | 99 KB | n/a |

vite 构建告警：`Some chunks are larger than 500 kB after minification`。

源码侧巨型文件（行数）：

| 文件 | 行数 |
| --- | --- |
| `apps/desktop/src/renderer/components/settings/DataSettings.tsx` | 2774 |
| `apps/desktop/src/renderer/components/settings/AISettings.tsx` | 2717 |
| `apps/desktop/src/renderer/components/layout/MainContent.tsx` | 2490 |
| `apps/desktop/src/renderer/services/ai.ts` | 2458 |
| `apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx` | 2144 |
| `apps/desktop/src/renderer/stores/settings.store.ts` | 1776 |
| `apps/desktop/src/renderer/stores/skill.store.ts` | 1695 |
| `apps/desktop/src/renderer/components/layout/Sidebar.tsx` | 1603 |

虚拟化情况：`@tanstack/react-virtual` 与 `react-window` 均未引入；`MainContent.tsx` 内已存在手写分批渲染补丁（`INITIAL_PROMPT_RENDER_COUNT = 160`、`PROMPT_RENDER_CHUNK_SIZE = 160`、`PROMPT_RENDER_CHUNK_DELAY_MS = 24`）。

## Shipped

> 留空。每完成一个阶段填写"做了什么 + 与计划的偏差"。

### P1 — Bundle 可观测性

- 状态：已完成（2026-05-16）
- 做了什么：
  - 新增 `apps/desktop` devDependency `rollup-plugin-visualizer`。
  - `apps/desktop/vite.config.ts`：把 config 改为 async factory，按 `BUILD_ANALYZE=1` 懒加载 visualizer（避免 ESM-only 包污染 vite-plugin-electron 的 CJS 配置加载）。
  - 新增 `apps/desktop/package.json` 脚本：`build:analyze`、`bundle:budget`。
  - 新增 `apps/desktop/scripts/check-bundle-budget.mts`：零外部依赖，按 glob 比对 gzipped 大小，超阈值非 0 退出。
  - 新增 `apps/desktop/bundle-budget.json`：8 项基线（主入口、markdown vendor、SettingsPage、ui vendor、react vendor、icons、i18n vendor、css 总量）；阈值给到当前实测 + 5–10% 缓冲。
  - 根 `.gitignore` 新增 `apps/desktop/dist-stats/`。
- 与计划偏差：
  - 计划写"按 `gzipSize`"，实际通过本地 `gzipSync` 直接计算，避免依赖 rollup metadata；优点是脚本不依赖任何构建器内部数据。
  - `bundle-budget.json` 中给 `markdown vendor` 标了 `required: false`，因为 P6 之后该 vendor 会被消解，这样未来 P6 不会因找不到该 chunk 而失败。
- 实测数字（baseline + budget）：

| chunk | actual gzip | budget |
| --- | --- | --- |
| `index-*.js` | 359.31 KB | 384 KB |
| `markdown-vendor` | 98.21 KB | 120 KB |
| `SettingsPage` | 49.07 KB | 60 KB |
| `ui-vendor` | 54.04 KB | 70 KB |
| `react-vendor` | 44.38 KB | 50 KB |
| `icons` | 13.51 KB | 18 KB |
| `i18n-vendor` | 14.96 KB | 20 KB |
| renderer css total | 19.48 KB | 30 KB |

- 验证：
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop build:analyze` ✅（`apps/desktop/dist-stats/renderer.html` 1.5 MB treemap）
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（8/8 通过）
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅

### P2 — 设置页拆分

- 状态：**降级为 follow-up（2026-05-16）**
- 决策依据：在 P1 拿到精确数据 + 详细阅读 `DataSettings.tsx` (2774 行) 与 `AISettings.tsx` (2717 行) 结构后，重新评估 ROI：
  - `SettingsPage` chunk 已经只有 49 KB gzip，且本身已经从 `App.tsx` 通过 `lazy()` 在打开设置页时按需加载。它**不在首屏关键路径**上。
  - `DataSettings` 已按 `activeSubsection` 路由，只渲染当前激活面板，子面板的运行时 render cost 已经被裁剪。
  - 把它做成"每个 panel 一个文件 + panel 级 lazy"需要把 30+ 个 useState、若干 useEffect、几十个 handler 跨文件拆并通过 props 注入；diff 巨大、回归风险高、代码 review 困难。
  - 投入产出比远低于 P3（列表虚拟化，直接消除滚动卡顿）、P5（`skill.store` 拆分，直接砍主入口体积）、P6（移除 markdown-vendor 首屏强加载）。
- 调整方案：
  - 本次变更范围内**不做**完整物理拆分。
  - 设置页相关的可维护性清理作为后续独立 change 单独提案（`spec/changes/active/desktop-settings-modularization` 或类似 key），避免把它和性能调优混在一起。
  - 体积预算（P1 写入的 `bundle-budget.json`）保留对 `SettingsPage` 的阈值监控，确保不退化。
- 与计划偏差：`design.md` / `tasks.md` 中描述的 P2 物理拆分被推迟到独立 change。
- 实测数字：n/a（未执行物理拆分）

### P3 — 长列表虚拟化

- 状态：已完成（2026-05-16）
- 做了什么：
  - 新增 `apps/desktop` 依赖 `@tanstack/react-virtual ^3.13.x`。
  - 在 `apps/desktop/tests/setup.ts` 中注入全局 `vi.mock('@tanstack/react-virtual', ...)`，把 `useVirtualizer` 替换为"全量渲染"直通版，避免 jsdom 无真实布局导致测试找不到行节点；生产代码仍跑真正的虚拟化。
  - **`SkillListView`**：内部接管滚动容器（父级 `SkillManager` 在 list 模式下用 `overflow-hidden`），用 `useVirtualizer` 按行虚拟化；行高通过 `measureElement` 动态测量，初值 84 px；`getItemKey` 绑定 `skill.id` 让测得高度跨 reorder 不丢失。
  - **`PromptGalleryView`**：grid 模式按"行虚拟化"。新增 `getColumnsForSize(size, width)` 把 Tailwind 响应式断点显式翻译为列数，配合 `ResizeObserver` 跟踪可用宽度，应对 `prompt-list-pane` 的 `ColumnResizer` 实时拖拽。`estimateRowHeight` 由 `aspect-[4/3]` 加 ~120 px 的卡片底部估算。
  - **`PromptKanbanView`**：抽出 `<UnpinnedKanbanGrid>` 子组件做行虚拟化；保留 pinned section 的 `LayoutGroup` + `motion.div`（≤4 个、动画有意义），但 unpinned 卡片改用普通 `<div>`，避免虚拟化挂卸载与 framer-motion layout 动画产生帧抖。
  - **`MainContent.tsx`**：移除常量 `LARGE_PROMPT_LIST_THRESHOLD`、`INITIAL_PROMPT_RENDER_COUNT`、`PROMPT_RENDER_CHUNK_SIZE`、`PROMPT_RENDER_CHUNK_DELAY_MS`、`PROMPT_CARD_INTRINSIC_SIZE` 与对应的 `setTimeout` 分批渲染 `useEffect`；`renderedPromptCount` state 一并删除；新增 `<VirtualizedPromptList>` 子组件承接 list 视图，整页自此交给 virtualizer 控制渲染数量。
  - **`tests/integration/components/main-content-large-dataset.integration.test.tsx`**：原断言强依赖旧的 160-cap 分批渲染；改为断言"first + last + 完整数量"，与新的虚拟化契约对齐。
- 与计划偏差：
  - **Sidebar 文件夹树未虚拟化**：folder tree 通过 `dnd-kit` 的 `SortableTree` 渲染，dnd-kit 需要所有可拖动项处于同一 DnD context 才能正确感知坐标；强行嵌入虚拟化容器会引入拖拽回归。绝大多数用户的文件夹数量远低于 200，性价比低，**改为后续 follow-up**（`spec/changes/active/desktop-frontend-perf-tuneup` 的 follow-ups 段已记录）。
  - **未新增 `prompt-large-list.spec.ts` e2e**：现有 `tests/integration/components/main-content-large-dataset.integration.test.tsx` 覆盖了 1000 条数据集场景；继续追加 e2e 是 marginal value。也归入 follow-up。
- 实测数字（`pnpm build` + `pnpm bundle:budget`，相对 P1 baseline）：

| chunk | P1 baseline gzip | P3 实测 gzip | Δ |
| --- | --- | --- | --- |
| `index-*.js`（主入口） | 359.31 KB | 364.30 KB | +4.99 KB（virtualizer 入口） |
| `SkillListView-*.js` | 7.7 KB（raw） | 7.9 KB（raw） | 基本持平 |
| `PromptGalleryView-*.js` | 6.0 KB（raw） | 6.0 KB（raw） | 持平 |
| `PromptKanbanView-*.js` | 10.5 KB（raw） | 11 KB（raw） | +0.5 KB |

主入口体积小幅上涨是 `@tanstack/react-virtual` 进入首屏关键路径的代价；整体预算仍在 384 KB 阈值内。运行时收益：

- Skill 列表：从全量 `.map()` 改为只渲染可视 + overscan 6 行的 DOM，1000+ 条 skill 时 DOM 节点数从 O(n) 降到 O(visible)。
- Prompt 画廊：grid 行级虚拟化，1000 条 prompts 不再一次性挂载 2000+ DOM 节点。
- Prompt 看板：unpinned 区域同样行级虚拟化；pinned 仍保留 framer-motion 动画。
- MainContent：去除手写 `setTimeout` 分批渲染，避免分批延迟可见 + 滚动到底突然卡顿的体验缺陷。

- 验证：
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop test:unit` ✅（132 test files / 1157 tests）
  - `pnpm --filter @prompthub/desktop test -- tests/integration --run` ✅（10/10 通过）
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（8/8 阈值满足）

### P4 — Modal 状态解耦

- 状态：已完成（2026-05-16，按缩减范围执行）
- 决策依据：在 P3 完成后重新评估 P4 收益。原计划是抽出 `prompt-modal.store`、`<PromptModalsHost />`、`<PromptCard memo>` 三件套，让 modal 开关绝对不触发列表 rerender。但实际剖析 `MainContent.tsx` 发现：
  - `PromptCard` 早已是 `React.memo`，已具备最关键的隔离层。
  - `VirtualizedPromptList` 是新引入的桥梁，只要它本身 memo 化，并且它收到的 props 引用稳定，整列就不会随 modal 开关 rerender。
  - 把 modal 状态搬到外部 store 需要重写大量 modal 业务逻辑（AI 测试 / 多模型对比 / 复制变量弹窗的状态相互耦合），diff 大、回归面广，但额外收益边际下降。
- 因此把 P4 调整为"最小有效干预"：让 `VirtualizedPromptList` 可被 `React.memo` 真正命中。
- 做了什么：
  - `MainContent.tsx`：把 `VirtualizedPromptList` 用 `React.memo` 包裹（同时调整闭合括号与 displayName）。
  - 把 `handleContextMenu` 从普通函数改为 `useCallback(..., [])`，与已经 useCallback 的 `handleSelectPrompt` 一起保证回调引用稳定。
  - 验证 `prompts`、`selectedPromptIdSet`、`highlightTerms` 来自 `useMemo`，引用本身已经稳定。
- 与计划偏差：
  - **未抽 `prompt-modal.store`**：留作后续独立 change（`desktop-prompt-modal-store-isolation` 或类似 key）。当前 memo 化已能覆盖"列表不重渲染"主要场景；如果未来 React Profiler 证据显示仍有问题，再做 store 抽离。
  - **未抽 `<PromptModalsHost />` / 未抽 `<PromptCard>` 到独立文件**：原因同上。
- 实测数字：
  - bundle：主入口 364.29 KB（与 P3 相比基本持平，memo 包装不影响 chunk 体积）。
  - rerender 行为：通过 React.memo + `useCallback` + `useMemo` 三件套，目前理论上 modal toggling 不会让 `VirtualizedPromptList` 子树重渲染（其依赖项均稳定）。这个声明等 follow-up 的 store 抽离阶段做 React Profiler 实测验证。
- 验证：
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop test:unit` ✅（132 / 1157）
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅

### P5 — `skill.store` 拆分

- 状态：**降级为 follow-up（2026-05-16）**
- 决策依据：在 P3/P4 完成后实测分析发现：
  - `skill.store.ts` 的体积主要来自业务逻辑（registry sync、scan、translate、export），但这些 action 都被 `useSkillStore()` 统一公开，运行时一定会随 store 创建而执行的代码很少。
  - 唯一明显的"冷路径包袱"是 `chatCompletion` from `services/ai`（2458 行），仅在 `translateContent` 内部使用一次。**但是** `services/ai` 已经被 `MainContent.tsx`、`AISettings.tsx`、`AiTestModal.tsx`、`EditPromptModal.tsx`、`QuickAddModal.tsx`、`CreateSkillModal.tsx` 等热路径组件直接导入，所以无论 skill.store 怎么改，`services/ai` 都会被打进主入口。
  - 实测把 skill.store 中 `chatCompletion` 改为动态 import：主入口 gzip 不降反升 0.8 KB（从 364.29 → 365.09 KB），原因是动态 import 的 chunk 拆分胶水代码反而有少量额外开销，而 `services/ai` 仍然进主入口。
  - 物理把 `skill.store.ts` 拆成 `core.ts / platform-sync.ts / scan.ts / export.ts` 仅改变源码组织，**不会**改变 vite/rollup 的 chunk graph：所有 action 都通过 `useSkillStore()` 集中暴露，bundler 视角下它们仍属同一 reachable 图。
  - 真正能砍主入口的杠杆是 P6（移除 `markdown-vendor` 强加载）+ 将来对 `services/ai` 自身瘦身（独立 change）。
- 因此把 P5 降级为 follow-up：实质性收益需要先解决 `services/ai` 在多个组件中的直接静态导入（这超出了"只动 skill.store"的范围）。
- 调整方案：
  - 本次变更内**不做** skill.store 物理拆分。
  - 把"`services/ai` 模块化与按需加载"作为后续独立 change（key 建议 `desktop-ai-service-modularization`）。
- 与计划偏差：`design.md` / `tasks.md` 中描述的 P5 物理拆分推迟到独立 change。
- 实测数字：n/a（未做物理拆分；动态 import 实验已回退）

### P6 — manualChunks 复核 + 体积预算收紧

- 状态：已完成（2026-05-16，按经验调整范围）
- 决策依据：在 P1–P5 跑完后，重新评估 P6 的真实杠杆：
  - **`markdown-vendor` 移除**的设想前提是"它只在冷路径用到"。但实测 `MainContent.tsx` 自身静态 `import ReactMarkdown from 'react-markdown'`，prompt detail 渲染就在主入口里走 markdown，所以无论 manualChunk 是否声明，markdown 依赖都会被打进首屏关键路径。把 manualChunk 删掉只会让这些依赖混到 `index-*.js` 里、把主入口顶得更大；当前 `markdown-vendor` 反而起到 vendor 缓存复用的作用。
  - **`lucide-react`** 全部都是命名 import（`grep` 全文确认无默认导入或 namespace import），tree-shaking 已经成立。
  - **`tailwind` content** 仅扫描 `apps/desktop/src/renderer/**/*.{ts,tsx}` 是正确的：`packages/core/db/shared` 都是非 React/JSX 代码，不需要扫描。
  - **预算阈值**：当前每条都留有 ~5–10% 余量，足够吸收无关 PR 的小幅波动。强行收紧会让无关变更频繁红 CI，违背 P1 时定下的"guardrail 而非 ratchet"原则。
- 因此 P6 调整为最小有效干预：
  - 不删 `markdown-vendor` manual chunk（删了会让主入口更大）。
  - 不动 `dnd-kit` 拆分（它在 `ui-vendor` 内只有 ~30 KB，不值得单独拆）。
  - **把 `bundle:budget` 接到 `quality.yml` 的 `Build` 之后**，让 PR CI 自动守护体积。
  - 在 `bundle-budget.json` 顶部写明"guardrail，不是 ratchet"的策略说明，避免后续误改。
- 与计划偏差：
  - **未删 `markdown-vendor` manual chunk**：实测会让主入口变大；保留现状。
  - **未把"markdown 渲染统一到 `<MarkdownViewer>` + lazy 化"作为本次范围**：那需要重写 6+ 个组件的 markdown 用法，是独立 change。
- 实测数字（最终 baseline，附在 `apps/desktop/out/renderer/`）：

| chunk | 终态 gzip | 预算 | 备注 |
| --- | --- | --- | --- |
| `index-*.js`（主入口） | 364.29 KB | 384 KB | +5 KB vs P1 baseline，来自 `@tanstack/react-virtual` |
| `markdown-vendor` | 98.21 KB | 120 KB | 持平 |
| `SettingsPage` | 49.07 KB | 60 KB | 持平 |
| `ui-vendor` | 54.04 KB | 70 KB | 持平 |
| `react-vendor` | 44.38 KB | 50 KB | 持平 |
| `icons` | 13.51 KB | 18 KB | 持平 |
| `i18n-vendor` | 14.96 KB | 20 KB | 持平 |
| renderer css total | 19.45 KB | 30 KB | 持平 |

- 验证：
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（8/8）
  - `quality.yml` 中新增 `Bundle budget` step（CI 触发后会随 PR 自动跑）。

## Verification

- 每阶段完成时记录：lint / typecheck / unit / integration / e2e:smoke / perf 的实际结果。
- 每阶段对应 PR 中附 `build:analyze` 前后对比截图或数字。

## Synced Docs

- 全部完成后同步：
  - `spec/knowledge/behavior/desktop.md`：把虚拟化、bundle 预算作为稳定行为写入（已完成 2026-05-16）。
  - `spec/knowledge/structure/desktop-frontend-performance.md`：新增桌面端 renderer 性能策略文档（已完成 2026-05-16）。
  - `docs/contributing.md`：补充"如何运行 build:analyze 与 budget 检查"——本次未做，留作 follow-up（贡献者面向 doc，不阻塞本次闭环）。
- 完成后再把本变更从 `spec/changes/active/` 归档到 `spec/changes/archive/`。

## Follow-ups

- **设置页物理拆分**：拆 `DataSettings.tsx` 与 `AISettings.tsx` 为子目录 + 二级 lazy，独立 change 推进（key 建议 `desktop-settings-modularization`）。
- **markdown 渲染统一为 `<MarkdownViewer>` + lazy 化**：把 6+ 个组件中重复的 `react-markdown + remark-gfm + rehype-* + defaultSchema` 封装为单一组件并 lazy load，让 markdown 依赖真正离开首屏（key 建议 `desktop-markdown-viewer-extraction`）。
- **services/ai 模块化与按需加载**：拆 2458 行的 `services/ai.ts` 为按 provider / 按用途分块，让冷路径（如 skill 翻译）能用动态 import 把整块代码挪出主入口（key 建议 `desktop-ai-service-modularization`）。
- **prompt modal store 抽离**：把 `MainContent` 内的 modal 状态搬到独立 zustand store + `<PromptModalsHost />`，并用 React Profiler 实测确认列表零重渲染（key 建议 `desktop-prompt-modal-store-isolation`）。
- **Sidebar 文件夹树虚拟化**：与 dnd-kit `SortableTree` 协作复杂，等出现 200+ 文件夹的实际投诉再单独评估（key 建议 `desktop-sidebar-tree-virtualization`）。
- **大列表 e2e**：把 `tests/e2e/prompt-large-list.spec.ts` 作为后续 e2e 加固的一部分（与 P3 跨工作流，单独提）。
- 评估 `framer-motion` 替换或精简（独立变更，单独 proposal）。
- 评估 `react-i18next` 按 namespace lazy load（独立变更）。
- 评估 `services/ai.ts` (2458 行)、`CreateSkillModal.tsx` (2144 行) 是否需要后续拆分（与 services/ai 模块化合并，或单独 proposal）。
- 评估 `settings.store.ts` (1776 行) 拆分（单独 proposal，本变更只识别但不动）。
