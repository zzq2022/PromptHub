# 设计方案：清理桌面端 WebDAV 和 S3 兼容存储相关功能与界面

本方案详细描述如何重构相关文件，以彻底移除 WebDAV 和 S3 的同步能力。

## 1. 彻底删除的文件

- [DELETE] `apps/desktop/src/renderer/services/webdav.ts`
- [DELETE] `apps/desktop/src/renderer/services/s3-sync.ts`

## 2. 代码重构设计

### 2.1 依赖库移除
- **`apps/desktop/package.json`**：
  - 移除 `"@aws-sdk/client-s3"`。

### 2.2 状态管理与设置加载逻辑 (`apps/desktop/src/renderer/stores/settings.store.ts`)
- **类型定义 (`SettingsState`)**：
  - 移除与 WebDAV 和 S3 相关的状态属性（如 `webdavEnabled`, `webdavUrl`, `webdavUsername`, `webdavPassword`, `webdavAutoSync` ... `s3StorageEnabled`, `s3Endpoint`, `s3Region` 等）。
  - 移除对应的 setters（如 `setWebdavEnabled`, `setS3StorageEnabled` 等）。
- **同步限制 (`clampSyncProvider`)**：
  - 简化为仅校验 `"self-hosted"` 和 `"manual"`：
    ```typescript
    function clampSyncProvider(
      provider: SyncProviderKind,
      state: Pick<SettingsState, "selfHostedSyncEnabled">,
    ): SyncProviderKind {
      if (provider === "self-hosted" && !state.selfHostedSyncEnabled) {
        return "manual";
      }
      if (provider === "manual") {
        return "manual";
      }
      return "manual"; // 任何其他未知/已删除的同步方式均回退到 manual
    }
    ```
- **配置主进程加载 (`loadSettingsFromMainProcess`)**：
  - 不再从数据库 `settings` 读取、解析和合并 WebDAV/S3 的凭证。
  - 在 `setState` 中剔除这些已删除的状态键。
  - 重新计算 `computedId` 时，只保留 `"self-hosted"` 逻辑：
    ```typescript
    async function computeAccountId(state: any): Promise<string | null> {
      let rawId = "";
      if (state.syncProvider === "self-hosted") {
        if (!state.selfHostedSyncUsername) return null;
        rawId = state.selfHostedSyncUsername;
      } else {
        return null;
      }
      return rawId.trim().replace(/@/g, "_").replace(/[\\/:*?"<>|]/g, "_");
    }
    ```
- **Zustand 初始化及 Persist 合并**：
  - 移除默认值和 `onRehydrateStorage` 时的 WebDAV/S3 回滚和同步主进程逻辑。

### 2.3 设置主页 (`apps/desktop/src/renderer/components/settings/SettingsPage.tsx`)
- 移除 `SettingsPage.tsx` 中对 `webdavEnabled` 和 `s3StorageEnabled` 状态变量的获取。
- 移除在云端状态指示栏（Cloud indicators）中对 WebDAV / S3 激活状态的处理。

### 2.4 数据与同步配置面板 (`apps/desktop/src/renderer/components/settings/DataSettings.tsx`)
- **子菜单 (Subsection)**：
  - `DataSettingsSubsection` 移除 `"webdav"` 和 `"s3"`，只保留 `"local"`, `"selfHosted"`, `"backup"`, `"recovery"`。
- **页面左侧导航与右侧表单**：
  - 删除 “WebDAV” 菜单项和 “S3 兼容存储” 菜单项。
  - 彻底删除 WebDAV 表单配置区（包括用户名、密码、URL、同步选项等）和 S3 兼容存储配置区。
  - 移除 WebDAV/S3 的连接测试、推送、拉取的 loading 状态。
- **本机缓存账户列表与切换自愈**：
  - 在“载入此账号数据”的 onClick 逻辑中，删去 WebDAV 和 S3 的配置自愈和补齐逻辑，只保留自部署 self-hosted 的用户名和 URL 物理保存。

### 2.5 周期同步与后台服务 (`apps/desktop/src/renderer/services/`)
- **`periodic-auto-sync.ts`** 与 **`app-background.ts`**：
  - 移除对 `settings.webdavEnabled` / `settings.s3StorageEnabled` 的依赖，不再注册 S3 和 WebDAV 的周期性上传/下载后台工作。
- **`backup-orchestrator.ts`**：
  - 彻底清理 `runWebDAVConnectionCheck`, `runWebDAVUpload`, `runWebDAVDownload`, `runWebDAVAutoSync`, `runS3ConnectionCheck`, `runS3Upload`, `runS3Download`, `runS3AutoSync` 接口。

---

## 3. 测试适配

- **`settings-sync-provider.test.ts`**：
  - 移除涉及 WebDAV 和 S3 降级、禁用的测试，修改断言以仅覆盖 `self-hosted`。
- **`data-settings.test.tsx`**：
  - 移除 WebDAV 和 S3 面板渲染及连接校验测试用例。
