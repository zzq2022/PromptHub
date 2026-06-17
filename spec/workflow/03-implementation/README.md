# PromptHub Workflow Implementation

`spec/workflow/03-implementation/README.md` 是 PromptHub 当前项目级 implementation 主入口，对齐最新 `spec-init` 的 workflow/implementation 边界，回答“先做什么、后做什么”。

## 当前实施方式

PromptHub 当前不把项目级实施节奏集中写在一个总计划文件里，而是按 change 维护执行节奏：

- `spec/changes/active/<change-key>/tasks.md`
- `spec/changes/active/<change-key>/implementation.md`

## 当前默认顺序

1. 先明确 intake / requirements / design
2. 对非 trivial 改动建立 active change
3. 在 change 中拆任务、记录验证与实施
4. 实现完成后回写稳定真相源

## 当前阶段建议

- 跨 change 的长期实施规划可以逐步沉淀到这里
- 单次变更的实施顺序与落地记录仍以 active change 为主
