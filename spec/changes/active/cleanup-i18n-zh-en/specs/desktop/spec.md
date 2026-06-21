# Spec: 桌面端与 Web 端的语言清单与行为规则

## 行为变更

1. **配置行为 (Settings Store)**:
   - `language` 字段的可用类型限定为 `"zh" | "en"`。
   - 对外保存和加载时的容错：如果用户 localStorage 中之前选中的是 `ja` 等语言，在重新初始化时，系统应当静默地通过 `normalizeLanguage` 重置其默认值为 `en`，并且调用 `changeLanguage("en")`。
2. **检测行为 (System Language Detection)**:
   - 系统检测逻辑由“针对 7 种语言的前缀映射”缩减为“仅判断是否以 `zh` 开头”。
   - 若匹配 `zh`（无论 `zh-CN`、`zh-TW`、`zh-HK` 等均统一处理），系统语言定为 `zh`。
   - 否则系统语言一律定为 `en`。
3. **UI 下拉选项 (Dropdown Option)**:
   - 只展示 2 个选项：“简体中文”与“English”。
