# Implementation

## Shipped

- 为 `Modal` 内容区补充 `min-h-0`，修复更新弹窗长内容场景的内部滚动收缩。
- 调整更新弹窗头部动作区为可换行布局，降低窄窗口下的横向溢出风险。
- 重构升级备份提醒区，保留单条核心状态说明并移除冗余确认文案。
- 将升级确认勾选切换为统一的 `ui/Checkbox` 组件。
- 将安装门槛改为仅依赖用户的已备份确认勾选，额外完整导出改为可选动作。
- 扩大更新日志滚动区域高度，适配较长发布说明。

## Verification

- `pnpm vitest --run tests/unit/components/update-dialog.test.tsx`
- `pnpm lint`

## Synced Docs

- 无。当前为局部 UI 修复，暂不需要回写稳定域文档。

## Follow-ups

- 若其他长内容弹窗也存在相同收缩问题，可统一排查依赖 `Modal` 的长表单与长说明弹窗。
