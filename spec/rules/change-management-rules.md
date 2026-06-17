# PromptHub Change Management Rules

## 基本原则

- 当前状态文档和历史变更文档必须同时维护。
- 新需求、bugfix、重构、发布，不允许只改代码不留文档痕迹。

## 记录规则

- 新需求或需求变化：更新 workflow / knowledge 中受影响内容，并在 `spec/changes/active/<change-key>/` 建立工作区
- bug 修复：更新受影响文档，并在 `spec/changes/active/<change-key>/` 记录症状、根因、验证和影响范围
- 架构或关键技术变化：更新 `spec/workflow/02-design/README.md`、`spec/knowledge/structure/README.md`，必要时补 `spec/adr/`
- 版本发布：新增或更新 `spec/releases/` 中的版本记录
- 变更完成后：归档到 `spec/changes/archive/`

## 最低要求

- 每条 change 工作区都要写清背景、影响范围、同步文档和待确认项
- 每条 bug 记录都要写清症状、根因、修复方案和回归要求
- release 记录要写清新增、修复、破坏性变化和已知问题
