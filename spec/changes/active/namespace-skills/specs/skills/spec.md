# Spec - 公开技能命名空间规范

## 行为规格定义

### 1. 自动生成 Registry Slug
在用户提交技能公开审核时，系统将不再允许为空或使用平铺的名称作为 `registry_slug`。
* **规则**：`registry_slug = {owner_username}/{slugify(name)}`。
* **校验逻辑**：
  * `{owner_username}` 必须为当前提交发布用户的用户名（强校验，不允许伪造他人命名空间）。
  * 命名格式必须符合 `/^[a-z0-9_-]+\/[a-z0-9_-]+$/`（不区分大小写）。

### 2. 发布审批时的唯一性拦截
* **场景一：用户点击“提交审核（Submit for Review）”**
  * 服务端计算该技能在公开后的目标 `registry_slug`。
  * 在数据库中查找是否已有 `visibility = 'shared'` 且具有相同 `registry_slug` 但 `id` 不同的技能。
  * 如果存在同名冲突，直接返回 HTTP 409 Conflict 状态码，并报错：`“公开市场上已存在相同命名空间的技能，请修改您的本地技能名称后再试。”`
* **场景二：管理员点击“审核通过（Approve）”**
  * 在审批通过前，服务端再次强制查询 `registry_slug` 在公开技能中的唯一性。
  * 如果在审核期间有同名技能已被通过，则此审批被拦截并返回 409 错误，防止并发导致的命名冲突。

### 3. 数据迁移与历史兼容
* 运行数据库初始化和更新时，对 `skills` 数据库表的 `registry_slug` 新增 `UNIQUE` 索引约束：
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_registry_slug_unique ON skills(registry_slug) WHERE registry_slug IS NOT NULL AND registry_slug != '' AND visibility = 'shared';`
* 注意：为了兼容未公开的私有技能，唯一性索引必须包含过滤条件 `WHERE visibility = 'shared'`。即：**私有技能之间、私有与公开技能之间允许重名，只有处于“公开（shared）”状态的技能必须保证全局 registry_slug 唯一**。
