# Design

## Overview

本次重构的目标是完全移除前端的 `/skillhub` 页面路由以及专门供其使用的前端 API 层。
因为旧的 `/api/skillhub/admin` 服务端 API 也是仅供该废弃的单页使用（目前的管理后台已统一使用 `/api/admin/skills` 后端接口进行待审批展示与审批），我们也可以安全地从后端中删除这部分管理相关的 API 路由。

## Affected Areas

- **Data model**:
  - 无变更。
- **IPC / API**:
  - 移除了客户端接口文件 `apps/web/src/client/api/skillhub.ts`。
  - 移除了服务端接口 `skillhubAdminRoutes`（在 `apps/web/src/routes/skillhub-routes.ts` 中定义，且在 `apps/web/src/app.ts` 中注册）。
- **Filesystem / sync**:
  - 无变更。
- **UI / UX**:
  - 删除了 `apps/web/src/client/pages/SkillHub.tsx`。
  - 修改了 `apps/web/src/client/pages/DesktopWorkspace.tsx`，移除了顶部的 `/skillhub` 超链接。
  - 修改了 `apps/web/src/client/App.tsx`，移除了相应的路由。

## Tradeoffs

- **移除 `/api/skillhub/admin` 服务端接口**:
  - 优点：减少后端的路由数量，避免暴露无用的 API 端点，降低安全攻击面。
  - 缺点：如果有老版本的第三方客户端直接调用了这些接口可能会报错，但 PromptHub 作为纯 Monorepo 本地项目，桌面端从未调用过 `/api/skillhub/admin/*`（只在 `SkillHub.tsx` 这个曾经部署在同域下的 Web 前端中使用），因此该风险为零。
