# 任务清单：桌面端多账号本地数据物理隔离及同步权限联动

## 开发阶段

### 1. 全局配置与路径隔离
- [ ] 1.1 在 `apps/desktop/src/main/runtime-paths.ts` 中实现全局配置读取（加载并写入 `global-config.json` 中的 `lastActiveAccountId`）。
- [ ] 1.2 改造 `getUserDataPath()`，使其根据 `lastActiveAccountId` 动态决定并拼装返回的路径（区分 `users/<accountId>` 和回落到本地系统用户名 `users/<OS_Username>`）。
- [ ] 1.3 暴露 `setActiveAccountId(accountId: string | null)` 内存更新接口，并同步写回 `global-config.json`。

### 2. 主进程 IPC 通道与连接重构
- [ ] 2.1 修改 `apps/desktop/src/main/database/index.ts`，暴露新 IPC 处理程序 `database:switch-account`。
- [ ] 2.2 在该处理器中，实现：
  1. 调用 `closeDatabase()` 安全关闭当前数据库并清理单例缓存。
  2. 调用 `setActiveAccountId(accountId)` 刷新路径。
  3. 重新调用 `initDatabase()` 对新路径的数据库执行创建 and Schema 迁移。
  4. 触发工作区的后台重新扫描。

### 3. 前端联动、同步验证与 UI 状态锁定
- [ ] 3.1 扩展前端设置相关状态，支持 `isSyncVerified` 验证状态的管理。
- [ ] 3.2 在前端 WebDAV “测试连接”及“保存”配置逻辑中：
  - 测试连接成功时，触发 `database:switch-account(accountId)` 切换数据环境。
  - 清理/注销配置时，触发 `database:switch-account(null)` 切换回系统用户名数据环境（如 `Administrator`）。
- [ ] 3.3 修改前端“数据同步”与“备份与恢复”设置面板的按钮（推送、拉取、远程备份等）：
  - 当 `isSyncVerified` 为 `false` 时，禁用（`disabled`）这些操作按钮，并展示提示文案（如“请先在同步设置中通过测试连接”）。

---

## 验证阶段

### 4. 自动化与手动测试验证
- [ ] 4.1 编写单元测试，模拟登录账号 A、写入数据、切换账号 B，验证账号 B 的数据库为空，且切换回账号 A 后数据还原。
- [ ] 4.2 运行桌面端测试套件 `pnpm --filter @prompthub/desktop test:run`，确保原有的数据库与数据迁移测试不退化。
- [ ] 4.3 进行端到端手动验证：
  - 未配置或测试连接未通过时，确认数据存放于当前系统用户名的子目录，且同步、远程备份等按钮置灰禁用。
  - 配置并测试通过后，确认上述按钮解锁，数据成功在专属路径 `users/<accountId>` 下存储和同步。
