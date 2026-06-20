# Proposal - 重复 Skill 推送校验

## 背景与动因
当将本地 Skill 推送/发布到远程自部署 PromptHub Web 或 Cloudflare Worker 端的 SkillHub 目录时，如果远程已存在同名 Skill，接口会返回 `409 Conflict`。
目前客户端通过以下方式处理：
1. 调用 `GET /api/skills?scope=all` 获取所有远程 Skill。
2. 在远程列表中寻找同名的 Skill (大小写不敏感)。
3. 如果找到，自动将其远程 Skill 的 ID 提交以进行管理员审批 (`POST /api/skillhub/:id/publish`)。
4. 返回 `true` 表示发布成功。

这个自动匹配逻辑存在很大的体验和安全隐患：用户以为推送了自己的本地修改，但实际上并未向远程上传，而是直接把远程已存在的（甚至属于其他人的）同名技能提交审核了。
为了避免这种混淆，提供正确的本地优先体验：
1. 我们必须在推送时检测到名称重复时拦截推送/发布操作。
2. 给予用户明确的提醒（中文："远程已存在同名技能，请修改名称后再试。"），以便用户重命名本地 Skill 后重新发布。

## 范围
- **在范围内 (In scope)**:
  - 修改 `mirrorPublishToSelfHostedWeb` 逻辑，在导入阶段遇到 `409` 冲突时，不再执行自动匹配并审核已有远程技能的逻辑，而是直接抛出特定的名称冲突异常。
  - 修改 `publishSkillToSkillHub` 以等待 `mirrorPublishToSelfHostedWeb`。
  - 为了保持本地优先的隔离性，当本地数据库发布成功后，立即在 `publishSkillToSkillHub` 中调用 `useSkillStore.setState` 更新 React store 状态，使 UI 立即显示本地已共享，即使随后的远程推送抛出冲突异常也是如此。
  - 在 UI 组件 (`SkillDetailView.tsx` 和 `SkillManager.tsx`) 中捕获异常，并显示包含警告信息的错误 toast。
- **不在范围内 (Out of scope)**:
  - 自动为本地 Skill 重命名，用户必须手动编辑重命名。
  - 远程发布失败时回滚本地 SQLite 数据库中的发布状态。本地的发布状态仍然保持持久化。

## 风险与规避
- 如果远程推送失败并抛出异常，UI 里的 `try-catch` 块会捕获异常。如果我们在抛出异常前没有更新 React store 状态，UI 会无法同步显示本地数据库已被成功标记为 shared 的事实。
- 规避手段：在本地 IPC 调用成功后、开始远程推送之前，在 `publishSkillToSkillHub` 内部首先更新 React store。

## 回滚思考
- 如有需要，可以通过恢复 `mirrorPublishToSelfHostedWeb` 中的 `409` 处理逻辑，还原自动查找和提交远程技能的旧机制。
