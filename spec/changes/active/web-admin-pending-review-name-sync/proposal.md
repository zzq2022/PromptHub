# Proposal

## Why

用户汇报：zzq02用户在桌面端我的skill提交了审核，zzq作为管理员在网页端没有看到“待审核的skill”。
经白盒审计，发现由于自建仓库/部分源不返回 `registry_slug` 时，桌面端会 fallback 到以 UUID 字符串作为 slug，进而在安装和 syncFromRepo 阶段无法将真实的 `SKILL.md` 里的 `name` 同步更新回数据库。导致在桌面端提交审核（publish）时，上传给服务端的技能名称依然是 UUID，导致管理员在网页端看到的是以 UUID 命名（如 `ae350158-00fe-4aeb-ad83-d63a033c758f`）的技能，而误以为没有该技能的待审核记录。

本变更旨在：
1. 让桌面端本地仓库同步函数 `buildSkillSyncUpdateFromRepo` 支持解析并同步 SKILL.md frontmatter 中的 `name` 字段到本地 DB 中，确保本地技能名称与实际文件声明一致。
2. 修复 Web 端 API (/api/skillhub/public 等)，返回正确的 slug/registry_slug，避免客户端直接 fallback 至 UUID。
3. 改进 Web 端 Admin 审核 UI 页面，显示更加全面的二级信息（例如技能的 ID/UUID，作者，以及增加提示），避免管理员因命名不一致漏掉审核或产生困惑。

## Scope

- In scope:
  - 桌面端：在 `buildSkillSyncUpdateFromRepo` (packages/core/src 或 apps/desktop) 中提取 `name` 字段，且检测到与当前 DB name 不一致时，同步更新到数据库中。
  - Web端：在 SkillHub Public API (browse, search, detail) 响应中正确填充 `slug` 字段。
  - Web端 UI：增强 `AdminSkillReview.tsx` 与 `AdminSkillManage.tsx` 表格中的名称列展示，增加 ID/UUID 等二级辅助信息展示。
  - 单元测试：为 `buildSkillSyncUpdateFromRepo` 补充针对 `name` 同步更新的回归测试用例。

- Out of scope:
  - 重构整个技能发布审核逻辑与多分支/版本控制流程。

## Risks

- 无。仅做只读/同步字段扩展，不影响现有数据库表结构或底层数据读写流程。

## Rollback Thinking

- 如遇非预期行为，可直接回滚 skill-repo-sync 处的 `name` 属性比对和 Web 端 API 中 slug 的比对代码。
