# Implementation Record

## Completed Work

- 彻底清除了桌面端、Web 端及 `docs` 目录下非中英的共 15 个多语言翻译与 README 文件（包括 `de`、`es`、`fr`、`ja`、`zh-TW`）。
- 更新了桌面端与 Web 端的 i18n 初始化配置文件，移除了其它多语言加载与系统检测逻辑。
- 重构了 Web 后端同步的 Zod Schema 规则（`sync-snapshot.ts`, `settings.ts`），并把语言类型约束收窄为 `"zh" | "en"`。
- 在 Zustand settings.store.ts 中将支持语言类型收窄为 `"zh" | "en"`，并规范化了语言导入与 fallback 策略，同时更新了 `App.tsx` 中的同步注释与逻辑。
- 调整了 `LanguageSettings.tsx` 与 `GeneralSettings.tsx`，在下拉设置中隐藏非中英选项。
- 修改了包含 i18n-init.test.ts, settings-language.test.ts, ai-workbench-locales.test.ts, skill-locale-regression.test.ts, skill-i18n-smoke.test.tsx 以及 Web 端路由单元测试（import-export.test.ts, sync.test.ts, i18n.test.ts）在内的全套测试用例，将测试数据及断言中废弃的 `fr`/`de` 等语言统一替换为中/英。
- 调整了 `AGENTS.md` 中的多语言同步开发规范指南。

## Verification Results

- 在本地执行了 7 个核心测试用例文件，所有单元测试与组件冒烟共 44 个用例全部一次性高保真通过：
  - 桌面端：
    - `tests/unit/services/i18n-init.test.ts` (2 tests pass)
    - `tests/unit/stores/settings-language.test.ts` (2 tests pass)
    - `tests/unit/services/ai-workbench-locales.test.ts` (3 tests pass)
    - `tests/unit/services/skill-locale-regression.test.ts` (2 tests pass)
    - `tests/unit/components/skill-i18n-smoke.test.tsx` (24 tests pass)
  - Web 端：
    - `src/client/i18n.test.ts` (4 tests pass)
    - `src/routes/import-export.test.ts` (6 tests pass)
    - `src/routes/sync.test.ts` (5 tests pass, 5 skipped)
