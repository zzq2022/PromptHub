# Design: 国际化语言包清理技术设计

## Overview

本次变更的技术核心是缩减 `i18next` 实例的 `resources` 范围，并同步调整相关的类型定义、选项列表以及测试套件，确保不会因物理删除 JSON 文件而引发编译或运行时错误。

## Affected Areas

- **Data model**:
  - 无数据库模型变化。但在 `localStorage` 的 `prompthub-settings` 中存储的旧语言值（如 `ja`）在加载时，应当通过 `normalizeLanguage` 安全地映射回默认值 `en`。
- **IPC / API**:
  - 无 IPC 变更。
- **Filesystem / sync**:
  - 物理删除 `apps/desktop/src/renderer/i18n/locales/` 与 `apps/web/src/client/locales/` 下的 10 个 JSON 文件。
- **UI / UX**:
  - 语言设置选择项（`GeneralSettings` 与 `LanguageSettings`）中的下拉菜单只显示“简体中文”与“English”。
  - 浏览器或 Electron 主进程在匹配系统默认语言时，若为非中文（不以 `zh` 开头），一律归入 `en`。

## Tradeoffs

- **舍弃繁体中文（zh-TW）**：繁体中文通常对部分中文用户有价值，但为了实现“仅保留中文（简体）和英文”的要求，本次一并物理删除。这与用户“只需要中文、英文就行”的意图保持一致。
- **系统回退机制**：不再检测日语、法语、德语、西班牙语的浏览器/系统语言，而是在检测不到以 `zh` 开头的语言时，默认统一 fallback 至 `en`。这样可以大幅简化初始化匹配代码。
