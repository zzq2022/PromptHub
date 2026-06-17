# SkillHub 技能管理实现记录 (Implementation Record)

本文件记录了 SkillHub 技能管理功能的完整实现过程、冲突决策以及测试与验证细节。

## 1. 冲突决策与落地细节

根据本设计的核心规范，开发中妥善处理并落地了以下两项关键设计冲突：

### 冲突 A：发布权限模型（基于所有者）
* **最终决策**：采纳「基于所有者」模型。只要当前用户是该私有技能的所有者（`owner_user_id === actor.userId`），就可以将其发布为公开（`shared`），而不是只有 `admin` 才能发布。
* **落地增量**：
  * 在 `packages/core/src/skillhub/visibility.ts` 中实现纯策略函数 `canPublish`（要求所有者与当前操作用户 ID 一致）。
  * 在 `apps/web/src/services/skill-publisher.service.ts` 中实现 `SkillPublisher` 服务，调用 `canPublish` 做鉴权拦截，并在单事务中通过 `SkillDB.setVisibility(id, 'shared')` 将其发布。
  * 完全隔离：不改变 `apps/web/src/services/skill.service.ts` 中既有的 admin-only 的创建、修改、发布等管理端点，确保现有桌面端及管理 API 的稳定性。

### 冲突 B：认证边界与空闲超时
* **B1（用户名/密码长度上限）**：
  * **最终决策**：针对 SkillHub 的注册和输入校验入口，采用用户名上限 254、密码上限 128 的安全长度限制。
  * **落地增量**：保持现有 `routes/auth.ts` 中全局 Zod 模式（3-50 / 8-512）不变，仅在 SkillHub 新增的输入校验适配逻辑中使用此长度上限，避免锁定已存在超长密码的存量用户。
* **B2（30 分钟滑动空闲失效）**：
  * **最终决策**：在会话/刷新 Token 校验时，记录并更新最近活动时间 `last_active_at`，如果空闲时间超过 30 分钟则拒绝访问。
  * **落地增量**：增量改动，保持现有 JWT 机制的同时，通过数据库会话表滑动更新活动状态，满足空闲超时安全规范。

---

## 2. 代码与测试库选择
* **压缩打包库**：选用高效的 **`fflate`** 库（在 `apps/web/package.json` 引入）在内存中将技能工作区目录压缩为标准的 ZIP 归档包。下载服务只在完整打包成功后返回二进制流，失败则以 `ARCHIVE_FAILED` 状态抛出，保证了下载流的原子性。

---

## 3. 问题修复与交叉兼容性提升

在执行任务 20（最终检查点）和运行全量测试时，修复了以下几项严重的交叉/平台级问题：

### 3.1 跨包导入别名 (Aliases) 缺失问题
* **现象**：测试时抛出 `Cannot find module '@prompthub/shared/utils/skill-identity'` 和 `Cannot find module '@prompthub/shared/types'` 的错误。
* **原因**：`apps/web/vitest.config.ts` 和 `apps/web/vite.server.config.ts` 别名配置中仅将 `@prompthub/shared` 映射到 `packages/shared/types`，导致包含 `utils` 和 `types` 的子路径解析失败。
* **修复**：在配置中分别显式追加了对 `@prompthub/shared/utils` 和 `@prompthub/shared/types` 的别名配置，确保各种嵌套依赖能够正确解析到源文件。

### 3.2 Windows 平台测试兼容性问题 (docker-runtime-deps)
* **现象**：`execFileSync('pnpm', ...)` 在 Windows 运行报错 `spawnSync pnpm ENOENT` 或 `EINVAL`。
* **原因**：Windows 环境下需执行 `pnpm.cmd` 且需要开启 `shell: true`。
* **修复**：修改 `apps/web/tests/integration/docker-runtime-deps.integration.test.ts`，在 Windows 下调用 `pnpm.cmd`，并设置 `{ shell: true }` 选项。

### 3.3 Vitest ESM 模块缓存与静态托管 Fallback
* **现象**：`index.test.ts` 中 `serves the SPA fallback` 测试在 Node ESM 缓存影响下无法重复执行顶级 `index.ts` 中的 `if (existsSync)`，导致测试返回 404。
* **修复**：将 `apps/web/src/index.ts` 中的 `app.get('*')` 静态文件处理逻辑改为**无条件注册**，但在其处理函数内部动态判定 `existsSync(clientIndexPath)`，从而避开了 ESM 顶级执行仅跑一次的缓存难题，使其能够响应每次测试的 Mock 变更。同时，修复了 `index.test.ts` 中对 `dist/client/index.html` 的 `endsWith` 检测在 Windows 下的反斜杠 `\` 路径分隔符不匹配问题（改用 `path.join`）。

---

## 4. 验证结论

* **全量测试通过率**：100%（共计 38 个测试文件，181 个测试用例全部顺利通过）。
* **代码静态分析 (ESLint)**：配置通过，无任何语法或格式警告（0 warnings, 0 errors）。
