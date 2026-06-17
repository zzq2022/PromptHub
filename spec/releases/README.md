# PromptHub Releases

`spec/releases/` 对齐 `spec-init` 的 releases 边界，用来记录版本级对外交付摘要。

在最新 `spec-init` 拓扑中，这一层属于 `records.releases`。

当前 PromptHub 对外版本说明的主入口仍然是：

- `CHANGELOG.md`
- `docs/README.*`
- `website/src/content/docs/changelog.md`

如果后续需要增加更结构化的版本发布归档，可以在这里扩展。

## Routing Rule

- 版本级交付摘要、发布说明、版本归档 -> `spec/releases/`
- 对外发布详情仍需同步 `CHANGELOG.md`、`docs/README.*` 与 website changelog
