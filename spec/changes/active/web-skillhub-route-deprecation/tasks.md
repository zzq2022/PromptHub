# Tasks

- [x] 明确变更边界与清理范围
- [x] 完成 delta spec 与技术方案设计
- [ ] 实施客户端代码清理：
  - [ ] 移除 `apps/web/src/client/pages/DesktopWorkspace.tsx` 中的 "SkillHub" 链接
  - [ ] 移除 `apps/web/src/client/App.tsx` 中的 `/skillhub` 路由和 `SkillHubPage` 引入
  - [ ] 删除前端文件 `apps/web/src/client/pages/SkillHub.tsx`
  - [ ] 删除前端 API 文件 `apps/web/src/client/api/skillhub.ts`
- [ ] 实施服务端代码清理：
  - [ ] 移除 `apps/web/src/routes/skillhub-routes.ts` 中的 `skillhubAdminRoutes` 及其对应 handler
  - [ ] 移除 `apps/web/src/app.ts` 中的挂载语句 `protectedApi.route('/skillhub', skillhubAdminRoutes)`
- [ ] 进行验证与测试：
  - [ ] 运行 `pnpm --filter @prompthub/web typecheck` 或编译打包，确保无编译报错
  - [ ] 运行 Vitest 测试，确保后端与现有 API 功能正常
- [ ] 归档变更：
  - [ ] 更新 `implementation.md`
  - [ ] 同步稳定文档（如有需要）
