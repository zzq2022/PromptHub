# 提案：清理桌面端 WebDAV 和 S3 兼容存储相关功能与界面

## 变更背景与动因
用户明确反馈，目前仅使用“自部署 PromptHub”（Self-Hosted PromptHub）来进行提示词和技能的云端同步与备份，不再使用 WebDAV 和 S3 兼容存储。

为了精简代码、降低桌面端的包体和内存负担、减少不必要的网络第三方依赖（如 `@aws-sdk/client-s3`），本提案建议彻底移除 WebDAV 和 S3 兼容存储相关的所有同步逻辑、自动化检查服务、UI 菜单和单元测试。

## 变更范围
1. **依赖移除**：在 `apps/desktop/package.json` 中移除对 `@aws-sdk/client-s3` 的依赖。
2. **逻辑与服务清理**：
   - 移除 `apps/desktop/src/renderer/services/webdav.ts`。
   - 移除 `apps/desktop/src/renderer/services/s3-sync.ts`。
   - 改造 `apps/desktop/src/renderer/services/backup-orchestrator.ts`，清理所有 WebDAV 和 S3 连接检测、备份和自动同步的对外接口（仅保留全量导出和自托管 PromptHub 同步逻辑）。
   - 改造主进程 `settings.ipc.ts` 及其通道，清理 WebDAV 和 S3 相关保存与迁移逻辑。
   - 改造 `apps/desktop/src/renderer/services/periodic-auto-sync.ts` 与 `app-background.ts`，彻底移除 S3 和 WebDAV 的后台自动同步定时任务。
3. **设置 Store 清理**：
   - 改造 `settings.store.ts`，从默认值、接口定义、`clampSyncProvider` 和 `loadSettingsFromMainProcess` 中彻底清理 WebDAV 和 S3 相关的启用状态、凭证字段（如 `webdavUrl`, `s3Bucket` 等）和控制逻辑。
4. **设置界面 UI 清理**：
   - 改造 `DataSettings.tsx`，将云备份设置下的 “WebDAV” 和 “S3 兼容存储” 整个面板页签及对应配置表单彻底删除。
   - 改造 `SettingsPage.tsx`，将侧边选项卡和状态展示中对于 WebDAV 和 S3 的状态引用移除。
5. **单元/集成测试清理与适配**：
   - 修改或删除相关的单元测试文件（如 `settings-sync-provider.test.ts` 中涉及 WebDAV/S3 的测试，删除 `data-settings.test.tsx` 中对 WebDAV/S3 的行为和 DOM 断言）。

## 潜在风险与回退考量
- 移除 WebDAV 和 S3 字段后，现有本地数据库中如果有以前保存的 `webdavUrl` 等数据将不再被解析和加载。由于用户已确认不使用，这些数据作为脏数据遗留或直接清空是安全的。
- 确保测试套件没有残余的 WebDAV/S3 引用报错。
