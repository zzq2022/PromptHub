# Design - 公开技能命名空间与 Registry Slug 唯一性约束设计

## 1. 数据库模式变更与迁移 (Packages/db)

### 1.1 唯一索引设计
我们需要在 `skills` 表的 `registry_slug` 列上建立一个部分唯一索引（Filtered Unique Index），仅对状态为公开的记录生效：
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_registry_slug_unique 
ON skills(registry_slug) 
WHERE visibility = 'shared' AND registry_slug IS NOT NULL AND registry_slug != '';
```
由于 SQLite 完美支持带有 `WHERE` 条件的 `UNIQUE INDEX`，这能在不破坏历史私有重名技能的前提下，保证公开技能的唯一性。

### 1.2 迁移脚本逻辑 (`packages/db/src/init.ts`)
在创建该唯一索引前，我们必须通过迁移脚本（Migration）自动修复历史数据，否则已有公开技能若存在重名或为空值，在创建索引时会报错冲突：
1. 找出所有 `visibility = 'shared'` 且 `registry_slug` 不符合 `{用户名}/{技能名}` 格式的技能记录。
2. 关联 `users` 表查询其所有者用户名。若无所有者，默认使用 `system` 作为命名空间。
3. 将其 `registry_slug` 更新为 `owner_username/slugify(name)`。
4. 执行索引创建 SQL。

---

## 2. 服务层与校验逻辑 (Apps/web/src/services)

### 2.1 数据库操作类扩展 (`packages/db/src/skill.ts`)
新增方法，根据 `registry_slug` 查询已公开的技能：
```typescript
getByRegistrySlug(registrySlug: string): Skill | null {
  const row = this.db
    .prepare("SELECT * FROM skills WHERE registry_slug = ? AND visibility = 'shared'")
    .get(registrySlug) as SkillRow | undefined;
  return row ? this.rowToSkill(row) : null;
}
```

### 2.2 提交审批校验 (`apps/web/src/services/skill-publisher.service.ts`)
* 当用户调用 `submitForApproval(actor, id)` 时，我们在将状态修改为 `pending` 前，首先自动计算其目标公开标识。
* 关联获取所有者的用户名 `owner_username`。
* 自动生成目标标识：`targetSlug = owner_username/slugify(skill.name)`。
* 执行查重：
  ```typescript
  const conflict = this.skillDb.getByRegistrySlug(targetSlug);
  if (conflict && conflict.id !== id) {
    throw new SkillPublisherError(409, 'CONFLICT', '该技能的公开命名空间标识已被占用');
  }
  ```
* 查重通过后，将计算得到的 `targetSlug` 连同 `approval_status = 'pending'` 一起更新写入数据库的 `registry_slug` 字段中。

### 2.3 管理员审批校验 (`apps/web/src/services/skill-admin.service.ts`)
* 当管理员调用 `review(actor, id, 'approved')` 时，在正式调用 `setVisibility(id, 'shared')` 之前，再次执行 `getByRegistrySlug` 验证其 `registry_slug` 的唯一性，防止并发导致的数据库主键或索引异常。

---

## 3. 前端 UI 展示优化

### 3.1 首页卡片展示
* 修改 `apps/web/src/client/pages/SkillCatalog.tsx`：
  * 在技能卡片原渲染 `skill.name` 的位置，修改为突出展示其命名空间，例如：
    * 标题显示为 `testuser / get-weather`（以斜杠或优雅的徽章形式），使用更淡的前缀文字凸显层级。
