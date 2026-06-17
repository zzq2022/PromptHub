# Delta Spec

## Added

- Prompt 右键菜单新增“移动到...”入口。
- 右键菜单触发的文件夹选择弹层必须列出全部文件夹并支持移出当前文件夹。

## Modified

- 单条 Prompt 的文件夹迁移不再只能依赖拖拽或表格批量移动。

## Removed

- 无。

## Scenarios

- 当用户在任意 Prompt 视图中右键单条 Prompt 时，可以通过“移动到...”直接选择目标文件夹。
- 当用户选择“移出文件夹”时，该 Prompt 的 `folderId` 被清空并立即反映到列表中。
