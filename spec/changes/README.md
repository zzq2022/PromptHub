# PromptHub Changes

`spec/changes/` 是 PromptHub 的单次变更工作区总入口，对齐最新 `spec-init` 的 `changes` 语义。

## Structure

- `active/`：当前进行中的 change workspace
- `completed/`：已完成或已发布的 change 兼容入口
- `archive/`：PromptHub 当前实际使用的已完成 / 已放弃变更归档目录
- `legacy/`：旧流程遗留、仍可参考但不是当前真相源的历史文档
- `_templates/`：新建 change 时使用的模板说明

## PromptHub Current Rule

PromptHub 当前仍以 `spec/changes/archive/` 作为已完成 change 的真实归档目录。

为了与最新 `spec-init` 的 `changes.completed` 语义对齐，本仓库额外保留：

- `spec/changes/completed/`

它当前作为兼容入口，指向已完成 change 的归档语义，而不是第二套独立归档仓。

## Routing Rule

- 新需求、bugfix、重构、流程变化 -> `spec/changes/active/<change-key>/`
- 已完成或已放弃的 change -> `spec/changes/archive/`
- 旧平铺内部文档、历史遗留资料 -> `spec/changes/legacy/`
