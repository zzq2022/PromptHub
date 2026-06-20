/**
 * SkillHub core 内部类型（无 I/O、无副作用）。
 *
 * 这些类型供 `packages/core/src/skillhub` 下的纯逻辑模块
 * （visibility / search / summary / pagination / validation / archive-plan）
 * 使用，不属于跨包共享契约——跨包契约位于 `@prompthub/shared`。
 */

/**
 * 发起请求的已认证用户。
 *
 * `userId` 对应 `skills.owner_user_id` / `users.id`；`role` 为可选的账户角色
 * （如 `'admin'`）。SkillHub 的发布授权基于所有者（`owner === actor.userId`），
 * 不依赖 `role`。
 */
export interface Actor {
  userId: string;
  role?: string;
}

/**
 * `skills` 表中与目录/可见性逻辑相关的原始行形状（snake_case，贴合数据库列）。
 *
 * `visibility` 在此为原始 `string | null`：可能为空或存储侧未识别的值，
 * 由 core 的 `normalizeVisibility` 在读取时归一化为 `'private' | 'shared'`。
 */
export interface SkillCatalogRow {
  id: string;
  name: string;
  description: string | null;
  owner_user_id: string | null;
  visibility: string | null;
  registry_slug?: string | null;
}
