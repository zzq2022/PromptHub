# Delta Spec

本 delta 描述桌面端 renderer 在性能调优落地后的可观察行为，作为 `spec/knowledge/behavior/desktop.md` 的增量。这不是新增功能，而是把"足够快"的标准与具体保障写成可验证的契约。

## Added

- 桌面端构建产物应有 bundle 可视化报告：执行 `pnpm --filter @prompthub/desktop build:analyze`（新增脚本）后会在 `apps/desktop/dist-stats/` 下生成 treemap 报告。
- 桌面端构建应有体积预算脚本（`apps/desktop/scripts/check-bundle-budget.mts`）；脚本读取 vite 构建产物的体积，与 `bundle-budget.json` 中的阈值比较，超过阈值时以非 0 退出。
- 桌面端 4 个长列表渲染路径应使用虚拟化（基于 `@tanstack/react-virtual`）：
  - 技能列表视图（`SkillListView`）。
  - Prompt 画廊视图（`PromptGalleryView`）。
  - Prompt 看板视图（`PromptKanbanView`）。
  - 侧边栏文件夹树（`Sidebar` 中渲染 prompts 文件夹与子文件夹的部分）。
- 桌面端"设置 → 数据与同步"和"设置 → AI 模型"两个面板应支持二级懒加载：用户切换到具体子面板（如 WebDAV、S3、Self-Hosted、Backup；或单个 AI provider）时再加载对应代码。

## Modified

- 桌面端 prompt 列表的渲染管线应交由虚拟化负责；`MainContent.tsx` 中现有的常量 `INITIAL_PROMPT_RENDER_COUNT`、`PROMPT_RENDER_CHUNK_SIZE`、`PROMPT_RENDER_CHUNK_DELAY_MS` 与对应的分批 `setTimeout` 渲染逻辑应被移除。
- 桌面端 `MainContent.tsx` 内部的 prompt-related modal 开关状态（AI test、prompt detail、image preview、variable input、version history、confirm dialog）应不再以 prop 形式贯穿到 prompt 卡片层；modal 的开/关应不会触发整页 prompt 列表 rerender。
- 桌面端 `vite.config.ts` 中 `markdown-vendor` 不再作为首屏强制载入的 manual chunk；markdown 渲染相关依赖应只随实际使用 markdown 的页面（`PromptDetailModal`、`SkillFullDetailPage`、`EditPromptModal` 等）按需加载。
- 桌面端 `apps/desktop/src/renderer/stores/skill.store.ts` 应不再单文件承载平台同步 / 安全扫描 / 导入导出等冷路径；这些子能力应拆为独立 module，仅在调用点动态 import。
- 桌面端 `DataSettings.tsx` 与 `AISettings.tsx` 应不再以单文件 2000+ 行存在；应拆成按面板划分的多个文件，单文件保持在可维护规模（建议 ≤ 600 行）。

## Removed

- 移除 `MainContent.tsx` 中的"分批渲染 prompt 列表"手写补丁逻辑（虚拟化替代）。

## Scenarios

- 用户在生产构建产物中打开桌面端首屏，主入口 chunk（gzip 压缩后）应显著小于当前基线 368 KB；目标基线由 `bundle-budget.json` 给出可执行阈值。
- 用户拥有 5000 条 prompts、滚动 Prompt 画廊视图，应在帧时间 16 ms 以内保持稳定滚动（虚拟化覆盖）；具体由 `pnpm test:perf` 与现有 `apps/desktop/scripts/profile-large-datasets.mts` 报告承担可量化判定。
- 用户在 AI 测试 modal 上反复打开 / 关闭，prompt 列表项应不发生不必要的 rerender（通过 React Profiler 或 RTL re-render 计数验证）。
- 用户进入"设置 → 数据与同步"，再进入子面板（例如 WebDAV）时，对应代码应通过二级 chunk 异步加载，而不是设置页首次打开时一次性载入全部子面板。
- 开发者执行 `pnpm --filter @prompthub/desktop build`，并执行 bundle 预算脚本时，应得到明确通过 / 失败信号；预算变更必须随对应 PR 一并提交。
