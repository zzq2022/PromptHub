# Desktop Frontend Performance Architecture

## Purpose

定义桌面端 renderer 的稳定性能策略与"如何不让性能慢慢退化"的工程契约。本文是长期规则，不记录任何一次具体优化的过程；阶段性优化记录在 `spec/changes/`。

## Stable Principles

### 1. 长列表必须用虚拟化

任何渲染规模可能 ≥ O(用户数据量) 的列表必须基于 `@tanstack/react-virtual` 把可见 DOM 节点数控制在 `O(visible + overscan)` 量级。

当前已被这条规则覆盖的场景：

| 场景 | 文件 | 模式 |
| --- | --- | --- |
| 技能列表 | `apps/desktop/src/renderer/components/skill/SkillListView.tsx` | 行虚拟化 + measureElement |
| Prompt 画廊 | `apps/desktop/src/renderer/components/prompt/PromptGalleryView.tsx` | 行虚拟化（grid，列数随 ResizeObserver 动态改变） |
| Prompt 看板（unpinned） | `apps/desktop/src/renderer/components/prompt/PromptKanbanView.tsx` | 行虚拟化（pinned 仍保留 framer-motion 动画） |
| Prompt 详情列表 | `apps/desktop/src/renderer/components/layout/MainContent.tsx` 中 `<VirtualizedPromptList>` | 行虚拟化 + measureElement |

新增长列表组件时，**默认套虚拟化**；如果出于产品交互（如拖拽、layout 动画）放弃虚拟化，必须在 `spec/issues/active/` 留一个明确的 follow-up 条目，列出"放弃的原因 + 何时重新评估"。

### 2. 不再使用 `setTimeout` 分批渲染

renderer 不应再以"先渲前 N 条、setTimeout 慢慢补齐剩余"的形式做长列表平滑化。该补丁会带来：

- 进入页面时滚动到底突然卡顿；
- 数据更新后旧批次未渲染时陷入"不可见但已加载"的不一致中间态；
- 与 React reconciliation 的协作不稳定。

虚拟化是唯一推荐的替代方案。如果未来出现"虚拟化无法覆盖的渲染热点"，先升级虚拟化策略（窗口大小、overscan、measureElement），不要回到 setTimeout 分批。

### 3. jsdom 测试必须 mock virtualizer

jsdom 不做真实布局，`useVirtualizer` 测得 0×0 viewport 后会拒绝渲染任何行，组件测试就会找不到任何节点。`apps/desktop/tests/setup.ts` 中以全局 `vi.mock('@tanstack/react-virtual', ...)` 把 hook 替换为"全量渲染"的直通实现，让测试既能验证可见性又不需要真实布局。

任何对 `useVirtualizer` 的本地 mock 必须保持与 setup 中的 mock 行为一致（`getVirtualItems`、`getTotalSize`、`measureElement` 至少返回安全占位）。生产代码不可依赖该 mock。

### 4. Bundle 预算是 guardrail，不是 ratchet

桌面端 renderer 通过 `apps/desktop/bundle-budget.json` 声明每个关键 chunk 的 gzip 上限。规则：

- 阈值通常**比当前实测高 5–10%**，吸收无关 PR 的小幅波动；
- 收紧阈值的唯一时机：本 PR 内做了有意的优化、希望把成果固化。把"收紧阈值"和"造成下降的优化"放在同一个 PR；
- **不要**在与体积无关的 PR 里收紧阈值；
- 跨阶段、跨 PR 监控由 CI 完成：`quality.yml` 在 `Build` 之后跑 `pnpm --filter @prompthub/desktop bundle:budget`，超阈值 PR 直接失败。

### 5. Bundle 可观测性入口

`apps/desktop/package.json` 暴露两个脚本：

- `pnpm --filter @prompthub/desktop build:analyze`：在普通 build 基础上启用 `rollup-plugin-visualizer`，把 treemap 写到 `apps/desktop/dist-stats/renderer.html`（`.gitignore`）。
- `pnpm --filter @prompthub/desktop bundle:budget`：依据 `bundle-budget.json` 校验最近一次 build 的 chunk 大小。

视觉化工具仅在 `BUILD_ANALYZE=1` 时通过动态 import 加载，避免 `rollup-plugin-visualizer` 的 ESM-only 包污染 `vite-plugin-electron` 的 CJS 配置加载。

## Stable Scenarios

### Scenario: Adding a new long list

When 新增任何渲染量随用户数据线性增长的列表组件：

- 默认接入 `@tanstack/react-virtual`；
- 父级容器保持 `overflow-hidden`，由列表组件自带滚动元素，让 virtualizer 能测量到正确的可视窗口；
- 估算 `estimateSize` + 通过 `measureElement` 修正实际高度；
- `getItemKey` 绑定数据 id，让测得高度跨 reorder 不丢失。

### Scenario: Adding a new heavy dependency

When 引入一个体积 ≥ 50 KB 的新依赖：

- 评估它是否真的需要进首屏（多数情况答案是"否"）；
- 若不在首屏，使用动态 `import()` 或 `lazy()` 把它放到对应的次级 chunk 中；
- 跑一次 `pnpm --filter @prompthub/desktop build:analyze` 确认它没意外被打进主入口；
- 如果它确实必须在首屏，在 `bundle-budget.json` 中相应 chunk 的预算上加一个能容纳的额度，并在同一 PR 里记录原因。

### Scenario: A bundle-budget step fails on someone else's PR

When CI 的 `Bundle budget` 步骤失败：

- 默认假设是真实回归，不要立即放宽预算；
- 先用 `build:analyze` 找到新进入主入口或意外膨胀的模块；
- 如果是合理的功能增长，**在同一 PR** 中调整预算并解释原因；
- 如果是意外的副作用（误把 cold-path 模块静态 import 进 hot-path），修正 import；
- 不要绕过预算 step（不要 `continue-on-error`）。

## Non-goals

- 本文不规定"最优 chunk 大小"或"最优 estimateSize"——这些数字由实测决定，不写死；
- 本文不替代特定优化的 change folder——任何具体改动仍然走 `spec/changes/active/<change-key>/`。
