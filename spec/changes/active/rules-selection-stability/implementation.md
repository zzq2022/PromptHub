# Implementation

## Shipped

- `apps/desktop/src/renderer/stores/rules.store.ts` 现在为 `loadFiles()` 与 `selectRule()` 引入了最新请求序号保护；晚到的旧读取结果不会再覆盖用户后来选中的规则详情或草稿。
- `saveCurrentRule()` 成功后现在会显式保留 `selectedRuleId = updated.id`，避免保存完成后的 store 状态被动丢失当前锚点。
- `selectRule` 在开始读取新规则文件时，现在会立即清空 `currentFile` (设为 `null`) 和 `draftContent` (设为 `""`)，并采用 `previousRuleId/previousFile/previousDraftContent` 在读取失败时进行自动回滚。这样彻底杜绝了加载期间的草稿混淆与越界保存。
- `apps/desktop/src/renderer/components/rules/RulesManager.tsx` 的保存按钮在 `isLoading` 为真时增加了禁用限制，并将 textarea 和 AI 优化文本域及按钮在加载期间设为只读，避免了任何在文件尚未加载完毕时的误保存交互。
- `apps/desktop/tests/unit/stores/rules.store.test.ts` 新增“旧规则读取结果不能覆盖新选择”以及“切换新规则时立即清空当前文件和草稿”的回归测试，并补充保存后保持选中项断言。
- `apps/desktop/tests/unit/components/rules-manager.test.tsx` 新增“保存当前 draft 后仍保持 Gemini 规则选中”的组件回归。
- `apps/desktop/tests/unit/components/sidebar.test.tsx` 新增“Rules 模块初始加载的旧读取结果不能覆盖用户后来点击的 Gemini 选择”的侧边栏交互回归。

## Verification

- `npx vitest run tests/unit/stores/rules.store.test.ts`
- `npx vitest run tests/unit/components/rules-manager.test.tsx`
- `npx vitest run tests/unit/components/sidebar.test.tsx`

## Follow-ups

- 当前的加载占位防护和立即清空状态已完全解决在异步读取期间保存错误 ID 规则文件的 Bug。

