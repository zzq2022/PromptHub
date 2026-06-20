# Proposal

## Why

PromptHub 桌面端现在已经具备了原生且高度整合的“技能商店 / SkillHub 社区”功能。而在自托管的 Web 网页版中，独立的 `/skillhub` 单页浏览/管理界面已经没有任何作用。同时，对于技能审核与管理，自托管 Web 网页端已引入了专用的管理后台路径 `/admin/skills/review` 等页面。

因此，为了消除项目中冗余的客户端代码，使应用与项目结构更轻量，本变更提议评估并彻底清理客户端冗余的 `/skillhub` 页面、客户端 API 模块 `api/skillhub.ts`，以及其在导航栏和路由表中的入口。同时保持桌面端与自托管 Web 端通过 `/api/skillhub/*` 与后端交互的核心能力。

## Scope

- In scope:
  - 删除客户端页面 `apps/web/src/client/pages/SkillHub.tsx`；
  - 从主路由 `apps/web/src/client/App.tsx` 中移除对 `SkillHubPage` 的导入和路由声明 `<Route path="/skillhub" element={<SkillHubPage />} />`；
  - 从自托管 web 页面顶部导航栏 `apps/web/src/client/pages/DesktopWorkspace.tsx` 中移除链接至 `/skillhub` 的 A 标签；
  - 删除客户端 API 模块 `apps/web/src/client/api/skillhub.ts`，因为该文件仅由已被废弃的 `SkillHub.tsx` 单页依赖；
  - 清理服务端冗余的 `skillhubAdminRoutes`（主要包括 `/api/skillhub/admin/...`），并在 `apps/web/src/app.ts` 中移除挂载，因其功能已被独立的 `/api/admin/skills` 路由完全替代。
- Out of scope:
  - 后端服务与核心 API 路由 `/api/skillhub/public`、`/api/skillhub/private` 等提供给桌面端进行下载和发布的 API（必须保留以保证桌面端能正常拉取和发布 Skill）。

## Risks

- 无已知高风险。主要依赖被删除页面的人群已全部迁移至桌面端原生社区或 Web 管理后台。
- 确认没有桌面端或 Web 端的其他活跃功能依赖 `api/skillhub.ts`。我们已经通过 grep_search 验证了该模块没有其他外部引用。

## Rollback Thinking

- 如需回滚，可通过 Git 恢复被删除的文件并重写路由挂载即可。
