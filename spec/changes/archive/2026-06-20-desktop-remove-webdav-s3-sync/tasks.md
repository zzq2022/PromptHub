# 任务清单：清理桌面端 WebDAV 和 S3 兼容存储相关功能与界面

## 1. 物理清理与包依赖移除
- [ ] 1.1 从 `apps/desktop/package.json` 中移除 `"@aws-sdk/client-s3"`。
- [ ] 1.2 执行 `pnpm install` 刷新 node_modules 和锁定文件。
- [ ] 1.3 删除服务文件 `apps/desktop/src/renderer/services/webdav.ts`。
- [ ] 1.4 删除服务文件 `apps/desktop/src/renderer/services/s3-sync.ts`。

## 2. 核心逻辑重构
- [ ] 2.1 修改 `apps/desktop/src/renderer/stores/settings.store.ts`，从接口、默认值、`clampSyncProvider`、`loadSettingsFromMainProcess` 到 setters 全面清理 WebDAV 和 S3。
- [ ] 2.2 修改 `apps/desktop/src/renderer/services/backup-orchestrator.ts`，清理 WebDAV/S3 的对外接口。
- [ ] 2.3 修改 `apps/desktop/src/renderer/services/periodic-auto-sync.ts`，清理 WebDAV/S3 定时自检。
- [ ] 2.4 修改 `apps/desktop/src/renderer/services/app-background.ts`，清理 WebDAV/S3 后台周期同步。

## 3. UI 界面清理
- [ ] 3.1 修改 `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`，清理侧边指示灯及状态。
- [ ] 3.2 修改 `apps/desktop/src/renderer/components/settings/DataSettings.tsx`，彻底删除 WebDAV 与 S3 兼容存储设置的面板、表单和切换自愈里的 WebDAV/S3 补全逻辑。

## 4. 测试适配与验证
- [ ] 4.1 调整并修改 `apps/desktop/tests/unit/stores/settings-sync-provider.test.ts`。
- [ ] 4.2 调整并修改 `apps/desktop/tests/unit/components/data-settings.test.tsx`。
- [ ] 4.3 运行全部单元测试，验证修改正确无破坏。
