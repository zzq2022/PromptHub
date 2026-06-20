# 规格说明：重复 Skill 推送校验

## 现有行为
在推送本地 Skill 时，如果远程 Web 服务在 `POST /api/skills/` 导入阶段返回 `409` 命名冲突，客户端执行以下逻辑：
1. 通过 `GET /api/skills?scope=all` 获取所有远程 Skill。
2. 寻找匹配本地技能名称（大小写不敏感）的远程技能。
3. 如果找到，使用该远程技能的 ID 通过 `POST /api/skillhub/:id/publish` 提交审核。
4. 返回 `true` (成功)。UI 显示通用的成功提示，但用户的实际本地修改并未上传。

## 期望行为
当远程 Web 服务在 `POST /api/skills/` 导入阶段返回 `409` 命名冲突时：
1. 立即中止并抛出特定的异常，异常信息提示命名冲突。
2. 该异常信息应当是国际化的，我们将支持英文、中文以及其他已支持的语言。
   - 需要添加的翻译键值对：`skillhub.publishNameConflict`
     - 简体中文（zh）：`"远程已存在同名技能，请修改名称后再试。"`
     - 英文（en）：`"A skill with the same name already exists on the remote SkillHub. Please rename your skill and try again."`
     - 繁体中文（zh-TW）：`"遠端已存在同名技能，請修改名稱後再試。"`
     - 日文（ja）：`"リモートのSkillHubに同名のスキルが既に存在します。スキルの名前を変更してもう一度お試しください。"`
     - 西班牙文（es）：`"Ya existe un skill con el mismo nombre en el SkillHub remoto. Cambie el nombre e inténtelo de nuevo."`
     - 法文（fr）：`"Un skill du même nom existe déjà sur le SkillHub distant. Veuillez renommer votre skill et réessayer."`
     - 德文（de）：`"Ein Skill mit demselben Namen existiert bereits im Remote-SkillHub. Bitte benennen Sie Ihren Skill um und versuchen Sie es erneut."`
3. `mirrorPublishToSelfHostedWeb(skillId)` 抛出该错误。
4. `publishSkillToSkillHub(skillId)` 传播该错误。
5. 在 UI 层面 (`SkillDetailView.tsx` 和 `SkillManager.tsx`)，错误被捕获并作为错误 toast 显示。
6. 本地数据库的可见性修改依然应当生效，并且应该在本地 UI 中立即体现（即使远程发布失败，也不能影响本地的 shared 标记展示）。
