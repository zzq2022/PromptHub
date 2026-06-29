# Tasks - 公开技能命名空间与 Registry Slug 唯一性约束任务清单

## 1. 数据库与迁移层开发
- [ ] 在 `packages/db/src/skill.ts` 中新增 `getByRegistrySlug(registrySlug: string)` 查询方法并暴露。
- [ ] 在 `packages/db/src/init.ts` 中：
  - [ ] 编写历史数据迁移逻辑：将 `visibility = 'shared'` 的公开技能 `registry_slug` 补齐更新为 `所有者用户名/slugify(技能名)`。
  - [ ] 编写创建唯一索引逻辑：执行创建 `idx_skills_registry_slug_unique` 的带过滤条件 `UNIQUE INDEX` 语句。

## 2. 业务服务层开发
- [ ] 修改 `apps/web/src/services/skill-publisher.service.ts` 中的 `submitForApproval` 方法：
  - [ ] 自动获取当前发布用户的 `username` 并对技能名称进行 `slugify`，拼接为目标 `registry_slug`。
  - [ ] 在更新前通过 `getByRegistrySlug` 执行防重名冲突校验，如重复则抛出 `409` 异常。
  - [ ] 校验通过后，将 `registry_slug` 和 `approval_status = 'pending'` 写入数据库。
- [ ] 修改 `apps/web/src/services/skill-admin.service.ts` 中的 `review` 方法：
  - [ ] 在审核判定为 `approved` 且正式公开（设置 `shared`）前，执行 `getByRegistrySlug` 二次校验，防止并发写入导致索引报错。

## 3. 前端 UI 展示优化
- [ ] 修改 `apps/web/src/client/pages/SkillCatalog.tsx` 中的技能卡片渲染部分：
  - [ ] 在技能卡片的标题上方或前缀处，直观展示技能的命名空间，即形如 `testuser / get-weather`。
  
## 4. 验证与回归测试
- [ ] 运行单测验证：`pnpm test:web`。
