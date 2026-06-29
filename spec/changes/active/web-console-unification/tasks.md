# 开发者控制台整合任务书 (V4)

## 1. 路由与头部精简
- [x] **任务 1.1**：清理旧版自定义 Dashboard。
  - 删除 `apps/web/src/client/pages/Dashboard.tsx` 与 `apps/web/src/client/pages/Dashboard.test.tsx`。
- [x] **任务 1.2**：修改 `apps/web/src/client/components/ConsoleHeader.tsx`。
  - 移除“提示词开发”切换 Tab，仅保留 `技能中心`、`我的技能` 与 `管理后台`。
- [x] **任务 1.3**：修改 `apps/web/src/client/App.tsx` 路由树。
  - 移除 `/console/workspace` 子路由。
  - 将 `/workspace` 与 `/dashboard` 均重定向指向 `/console/skills`。

## 2. 网页端环境 IDE 行为适配
- [x] **任务 2.1**：修改 `apps/desktop/src/renderer/App.tsx`。
  - 在组件挂载时，若为 `isWebRuntime()` 默认调用 `setAppModule('skill')` 以聚焦技能面板。
- [x] **任务 2.2**：验证 `apps/desktop/src/renderer/components/layout/Sidebar.tsx`。
  - 确保网页端不进行任何过滤，用户在侧栏可以看到 `prompt` 和 `skill` 图标。

## 3. 测试与验证
- [x] **任务 3.1**：重构 `App.test.tsx` 的 Mock 和断言。
  - 移除对 `/console/workspace` 的路由测试，更新对 `/workspace` 和 `/dashboard` 的向后兼容重定向测试（均期望指向 `/console/skills` 并渲染完整的 IDE 工作区）。
- [x] **任务 3.2**：运行本地单元测试套件。
  - 执行 `pnpm --filter @prompthub/web test` 确保 100% 通过。
