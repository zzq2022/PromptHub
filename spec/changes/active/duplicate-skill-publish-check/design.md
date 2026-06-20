# 设计说明 - 重复 Skill 推送与安装校验

本设计方案旨在解决本地 Skill 推送至远程时如遭遇重名冲突的拦截与覆盖更新逻辑，以及本地在从商店安装同名技能时的覆盖安全确认提示。

## 核心设计

### 1. 数据库查重逻辑 (Shared DB)
- **桌面端（本地）**：技能名称全局唯一。调用 `SkillDB.create` 时，若未传入 `ownerUserId`，则通过 `getByName` 执行全局不区分大小写的重名检查。
- **服务端（Web）**：允许不同用户拥有相同名字的技能，但同一用户下名称需唯一。调用 `SkillDB.create` 时，若传入 `ownerUserId`，则通过新查询方法 `getByOwnerAndName` 仅在当前用户自己名下执行重名检查。
- **覆盖选项**：当检测到同名技能存在且传入了 `options.overwriteExisting === true` 时，直接调用 `this.update` 执行修改（覆盖操作），否则抛出重名异常。

### 2. 服务端导入与创建 (Server Import & Create)
- 修改 `apps/web/src/services/skill.service.ts`：
  - 在 `create` 时，向 `this.skillDb.create` 传递当前登录用户的 `ownerUserId` 字段值。
  - 在创建前，利用 `this.skillDb.getByOwnerAndName(actor.userId, data.name)` 查找同名技能。
  - 若已存在，自动以 `overwriteExisting: true` 调用 `skillDb.create` 触发对已有技能的覆盖更新。

### 3. 桌面端商店同名安装拦截 (Desktop UI Store Install)
- 桌面端由于不支持同名技能共存，当用户从商店点击“下载/安装”或在列表点击“快速安装”时：
  - 先检查本地所有技能中是否有同名技能：
    `const hasDuplicate = skills.some(s => s.name.toLowerCase() === skill.name.toLowerCase());`
  - 如果存在重名：
    - 拦截安装流程，打开 `showOverwriteConfirm` 覆盖确认弹窗。
    - 使用 UI 中的 `ConfirmDialog` 警告用户：覆盖安装会替换该技能下的所有本地指令与文件。
    - 用户确认后，以 `installRegistrySkill(skill, { overwriteExisting: true })` 进行强制覆盖安装；用户取消则退出流程。
- 为此，需要将桌面端主进程 IPC 的 `SKILL_CREATE` 处理器中对 `overwriteExisting` 的过滤移除，使其能安全接收并透传此参数。

---

## 关键代码修改点

### 1. 共享数据库 `packages/db/src/skill.ts`
```typescript
getByOwnerAndName(ownerUserId: string, name: string): Skill | null {
  const stmt = this.db.prepare(
    "SELECT * FROM skills WHERE owner_user_id = ? AND LOWER(name) = LOWER(?)",
  );
  const row = stmt.get(ownerUserId, name) as SkillRow | undefined;
  return row ? this.rowToSkill(row) : null;
}
```
修改 `create`：
```typescript
const existing = data.ownerUserId
  ? this.getByOwnerAndName(data.ownerUserId, normalizedName)
  : (data.source_id ? this.getBySourceId(data.source_id) : this.getByName(normalizedName));
```

### 2. 服务端 API `apps/web/src/services/skill.service.ts`
```typescript
create(actor: SkillActor, data: CreateSkillParams): Skill {
  const visibility = data.visibility ?? 'shared';
  this.assertCanCreate(actor, visibility);

  // 显式传入 ownerUserId 参与查重
  const skill = this.skillDb.create({
    ...data,
    ownerUserId: actor.userId,
    visibility,
  }, { overwriteExisting: true }); // 如果重名则更新

  // 更新所有权
  this.db
    .prepare('UPDATE skills SET owner_user_id = ?, visibility = ? WHERE id = ?')
    .run(actor.userId, visibility, skill.id);

  this.syncWorkspace();
  return this.getById(actor, skill.id);
}
```

### 3. 桌面端主进程 IPC `apps/desktop/src/main/ipc/skill/crud-handlers.ts`
```typescript
// 允许接收并透传 overwriteExisting
const safeOptions = options
  ? {
      skipInitialVersion: options.skipInitialVersion,
      overwriteExisting: options.overwriteExisting
    }
  : undefined;
```

### 4. 桌面端商店页面 `SkillStoreDetail.tsx` & `SkillStore.tsx`
- 引入状态 `showOverwriteConfirm` 与待安装技能数据缓存。
- 在 `handleInstall` 与 `handleQuickInstall` 前增加同名检测。
- 渲染 `ConfirmDialog` 以展示覆盖安装警告。
