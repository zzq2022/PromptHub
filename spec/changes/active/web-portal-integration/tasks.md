# 网页端页面整合重构任务书 (Tasks)

## 1. 基础接口开发 (API)
- [x] **任务 1.1**：新建 `apps/web/src/client/api/skillhub.ts` 模块。
  - 实现与公开技能和提审动作的 Fetch 交互（对接 `/api/skillhub/public`, `/api/skillhub/public/search`, `/api/skillhub/public/:id`, `/api/skillhub/:id/publish`）。

## 2. 路由升级 (Routing)
- [x] **任务 2.1**：修改 `apps/web/src/client/App.tsx` 中的路由定义。
  - 将 `/` 指向 `SkillCatalogPage`（公开，包含 setup 拦截）。
  - 新增 `/dashboard` 指向 `DashboardPage`（受保护）。
  - 新增 `/workspace` 指向 `DesktopWorkspacePage`（受保护）。
- [x] **任务 2.2**：微调 `apps/web/src/client/pages/DesktopWorkspace.tsx`。
  - 增加顶部全局栏链接，使登录用户能在工作区与个人主页/技能中心之间双向跳转。

## 3.公共技能中心 (SkillCatalog)
- [x] **任务 3.1**：新建 `apps/web/src/client/pages/SkillCatalog.tsx`。
  - 绘制顶部 Hero + 独立搜索框。
  - 绘制左侧分类侧栏与右侧技能卡片网格。
  - 实现 Markdown 渲染模态框（详情展示，ZIP下载，以及导入工作区逻辑）。

## 4. 个人控制面板 (Dashboard)
- [x] **任务 4.1**：新建 `apps/web/src/client/pages/Dashboard.tsx`。
  - 实现用户拥有的个人技能列表呈现及状态徽章。
  - 封装在线“新建技能（Form Modal）”和“拉取远程技能”表单交互。
  - 对接提交审核、删除、安全审计 API。

## 5. 测试与上线 (Verification)
- [x] **任务 5.1**：为新添加的前端组件与接口编写 Vitest 单元测试，确保覆盖率达到 100%。
- [x] **任务 5.2**：启动 `pnpm dev` 进行网页端端到端本地验证。
