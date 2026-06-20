# 任务清单 - 重复 Skill 推送与安装校验

## 1. 准备工作与国际化
- [ ] 在所有语言包中添加翻译键值对：
  - `skill.overwriteConfirmTitle`
  - `skill.overwriteConfirmMessage`
  - `skill.overwriteConfirmAction`
  - `skillhub.publishNameConflict`
  - 语言包文件包括：`zh.json`, `en.json`, `zh-TW.json`, `ja.json`, `es.json`, `fr.json`, `de.json`

## 2. 服务端与共享数据库修改
- [ ] 修改 `packages/db/src/skill.ts`：
  - 新增 `getByOwnerAndName` 查询方法。
  - 修改 `SkillDB.create` 以在传入 `ownerUserId` 时进行限定性查重，并在配置 `overwriteExisting: true` 时自动覆盖更新已有技能。
- [ ] 修改 `apps/web/src/routes/skills.ts`：
  - 在 POST 接口中注入当前用户 ID 作为所有者传递给服务。
- [ ] 修改 `apps/web/src/services/skill.service.ts`：
  - 在创建技能时，调用带 `ownerUserId` 与 `overwriteExisting: true` 的 create 方法。

## 3. 桌面端逻辑与 UI 更改
- [ ] 修改 `apps/desktop/src/main/ipc/skill/crud-handlers.ts`：
  - 允许在 IPC `SKILL_CREATE` 接口中透传 `overwriteExisting` 选项。
- [ ] 修改 `apps/desktop/src/renderer/stores/skill.store.ts`：
  - 扩展 `installRegistrySkill` 接口，接收并传递 `overwriteExisting` 选项。
- [ ] 修改 `apps/desktop/src/renderer/services/skillhub-publish.ts`：
  - 更新 `mirrorPublishToSelfHostedWeb` 以在同步接口返回 `409` 命名冲突时，抛出 `skillhub.publishNameConflict` 异常。
  - 在 `publishSkillToSkillHub` 中，本地发布成功后，立即先更新 React store，再发起远程镜像同步，若远程抛出错误则将异常抛给页面。
- [ ] 修改 `apps/desktop/src/renderer/components/skill/SkillStoreDetail.tsx`：
  - 在安装技能前检测同名冲突，展示 `ConfirmDialog` 覆盖确认弹窗，确认后传递 `overwriteExisting: true`。
- [ ] 修改 `apps/desktop/src/renderer/components/skill/SkillStore.tsx`：
  - 在快速安装技能前同样检测同名冲突，展示 `ConfirmDialog` 覆盖确认弹窗。

## 4. 验证与测试
- [ ] 编写或更新单元测试 `apps/desktop/tests/unit/services/skillhub-publish.test.ts`。
- [ ] 运行 Vitest 测试套件：`pnpm test -- apps/desktop/tests/unit/services/skillhub-publish.test.ts --run`。
- [ ] 运行完整的桌面 Vitest 测试套件：`pnpm test:run`，确保无任何功能回归。
