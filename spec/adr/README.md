# PromptHub ADR

`spec/adr/` 对齐 `spec-init` 的 ADR 边界，用来记录关键架构和工程决策。

在最新 `spec-init` 拓扑中，这一层属于 `records.decisions`。

PromptHub 当前稳定架构事实主要保存在：

- `spec/knowledge/structure/`

如果后续要把重大决策按独立 ADR 文档编号管理，可以从这个目录开始补充。

## Routing Rule

- 重大架构或工程决策 -> `spec/adr/`
- 一般设计说明仍优先保留在 `spec/workflow/02-design/README.md`、`spec/knowledge/structure/` 或当前 change 的 `design.md`
