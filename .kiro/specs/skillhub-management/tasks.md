# Implementation Plan: SkillHub 技能管理

## Overview

本实现计划将 SkillHub 设计转化为一系列增量式编码任务。实现严格遵循 `AGENTS.md` 的所有权与依赖方向规则及测试优先（0.5）原则：先建立共享契约（`packages/shared`），再实现可纯函数化的核心逻辑及其属性测试（`packages/core`），随后扩展存储原语并以真实内存 SQLite 验证（`packages/db`），接着实现 `apps/web` 服务、可选认证中间件与公开/受保护路由，最后实现 `SkillHub_UI` 与七语言 i18n，并补齐集成 / 性能 / 安全 / i18n 回归测试。

功能仅落地于 `apps/web`，不新增桌面端 IPC、不新增表/业务列（仅新增一个名称排序索引）。

技术栈：TypeScript（设计已明确，无需选择实现语言）。属性测试使用 **fast-check**，每个属性测试最少运行 **100** 次迭代，并以注释标签 `// Feature: skillhub-management, Property N: <文本>` 标注。

> 注意：发布权限模型（冲突 A）与认证边界数值/空闲超时（冲突 B）已解决并经用户确认，最终决策已记录于 `design.md`。冲突 A 采纳「基于所有者」发布模型（`owner_user_id === actor.userId` 可发布自己的私有技能，非所有者 `FORBIDDEN`），SkillHub 发布走新的 `skill-publisher.service.ts` 并复用 core `canPublish`，不改动现有 `skill.service.ts` 的 admin-only 行为。冲突 B 采纳在 SkillHub 新注册/校验入口使用用户名 254 / 密码 128 上限（不改动现有 `routes/auth.ts` 全局 zod schema 的 3–50 / 8–512），登录沿用现有逻辑，30 分钟滑动空闲失效通过在会话/`refresh_tokens` 记录 `last_active_at` 增量实现。任务 13.1、15.2、16.2 据此定稿，不再依赖任务 21 的确认。

## Tasks

- [x] 1. 建立共享契约与核心模块骨架
  - [x] 1.1 新增 SkillHub 共享契约（`packages/shared/types/skillhub.ts`）
    - 定义 `SkillVisibility`、`SkillPublicSummary`、`SkillPrivateSummary`、`SkillDetail`、`PaginatedResult<T>`、`SkillArchiveResult` 类型
    - 定义 `SKILLHUB` 常量（`PAGE_SIZE=20`、`DESCRIPTION_MAX=500`、`SEARCH_MATCH_MAX=200`、`SEARCH_INPUT_MAX=256`、`ARCHIVE_MAX_UNCOMPRESSED_BYTES`、`IGNORED_ENTRIES`、`SKILL_ID_PATTERN`）与 `SkillHubErrorCode`
    - 从包入口导出，供 `packages/core` 与 `apps/web` 复用
    - _Requirements: 1.3, 1.5, 3.1, 3.4, 5.3, 7.2, 7.6, 8.6_

  - [x] 1.2 创建 `packages/core/src/skillhub` 模块骨架与错误类
    - 创建模块目录与入口 `index.ts`，定义 `Actor`、`SkillCatalogRow` 内部类型
    - 实现 `ValidationError`、`ArchiveTooLargeError` 错误类
    - _Requirements: 7.7, 8.7_

- [x] 2. 实现核心可见性策略与归一化（`packages/core/src/skillhub/visibility.ts`）
  - [x] 2.1 实现 `visibility.ts`
    - `normalizeVisibility`（仅 `'shared'`→`'shared'`，其余含 null/''/未知→`'private'`）
    - `assertWritableVisibility`（非 `'private'|'shared'` 抛 `ValidationError`）
    - `canRead`、`canDownload`、`canPublish`（owner===actor.userId）纯策略函数
    - _Requirements: 3.5, 6.3, 7.6, 7.7, 7.8, 8.1, 8.2, 8.3_

  - [ ]* 2.2 编写属性测试 P15（核心归一化与写入校验部分）
    - **Property 15: 可见性写入校验与读取归一化**
    - **Validates: Requirements 7.6, 7.7, 7.8**

  - [ ]* 2.3 编写策略函数单元/边界测试
    - 覆盖匿名 actor、null owner、shared/private 组合的读取/下载/发布决策边界
    - _Requirements: 8.1, 8.2, 8.3, 6.3_

- [x] 3. 实现核心搜索规范化与匹配（`packages/core/src/skillhub/search.ts`）
  - [x] 3.1 实现 `search.ts`
    - `normalizeSearchQuery`（trim → 截断至 200 → 转小写，标记 isEmpty）
    - `matchesQuery`（name 或 description 的不区分大小写子串匹配）
    - `buildLikePattern`（转义 `% _ \`，操作符字面化，返回 `ESCAPE '\\'`）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [ ]* 3.2 编写属性测试 P4
    - **Property 4: 搜索匹配语义（不区分大小写子串；空查询返回全部 shared）**
    - **Validates: Requirements 2.1, 2.2, 2.6**

  - [ ]* 3.3 编写属性测试 P5
    - **Property 5: 搜索查询规范化（截断 200 且操作符字面化、永不报错）**
    - **Validates: Requirements 2.3, 2.4**

- [x] 4. 实现核心摘要映射（`packages/core/src/skillhub/summary.ts`）
  - [x] 4.1 实现 `summary.ts`
    - `truncateDescription`（≤500 字符前缀）
    - `toPublicSummary`、`toPrivateSummary`（私有含 `visibility`）
    - _Requirements: 1.3, 5.3_

  - [ ]* 4.2 编写属性测试 P2
    - **Property 2: 公开摘要含必需字段且描述截断至 500**
    - **Validates: Requirements 1.3**

  - [ ]* 4.3 编写属性测试 P10
    - **Property 10: 私有摘要含必需字段**
    - **Validates: Requirements 5.3**

- [x] 5. 实现核心分页（`packages/core/src/skillhub/pagination.ts`）
  - [x] 5.1 实现 `pagination.ts`
    - `paginate<T>`（计算 total、page、pageSize、startIndex、endIndex，空页 endIndex=-1）
    - _Requirements: 1.5_

  - [ ]* 5.2 编写属性测试 P3
    - **Property 3: 分页元数据一致且分页拼接还原全集**
    - **Validates: Requirements 1.5**

- [x] 6. 实现核心输入校验（`packages/core/src/skillhub/validation.ts`）
  - [x] 6.1 实现 `validation.ts`
    - `validateSkillId`（不匹配 `SKILL_ID_PATTERN` 抛 `ValidationError`）
    - `validateSearchInput`（长度 0..256、拒绝空字节 `\x00` 与控制字符）
    - _Requirements: 8.6, 8.7_

  - [ ]* 6.2 编写属性测试 P16
    - **Property 16: 输入校验先于任何数据库查询**
    - **Validates: Requirements 8.6, 8.7**

- [x] 7. 实现核心归档清单计算（`packages/core/src/skillhub/archive-plan.ts`）
  - [x] 7.1 实现 `archive-plan.ts`
    - `planArchiveEntries`（过滤 `IGNORED_ENTRIES` 顶层项；累计未压缩大小 > 上限抛 `ArchiveTooLargeError`）
    - _Requirements: 3.3, 3.4_

  - [ ]* 7.2 编写属性测试 P6（核心清单部分：忽略项过滤与大小上限）
    - **Property 6: 下载归档往返一致（核心清单部分——排除忽略项、必含 SKILL.md、大小上限）**
    - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 8. 检查点 — 确保核心逻辑全部测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. 扩展数据库存储原语（`packages/db`）
  - [x] 9.1 新增名称排序索引 `idx_skills_name_nocase`
    - 在 `packages/db/src/schema.ts`（新装）与 `packages/db/src/init.ts`（既有用户，幂等 `CREATE INDEX IF NOT EXISTS`）中各添加一次
    - 不改变 `skills` 表结构、不新增表/列
    - _Requirements: 1.1, 2.7_

  - [x] 9.2 在 `SkillDB`（`packages/db/src/skill.ts`）新增参数化查询方法
    - `listShared(limit, offset)`（`ORDER BY name COLLATE NOCASE ASC, id ASC`）、`countShared()`
    - `searchShared(likePattern, escape)`（`LIKE ? ESCAPE '\\'`）
    - `listPrivateByOwner(ownerUserId)`（owner 非空且等于请求者且 private）
    - `getOwnership(id)`、`setVisibility(id, visibility)`（单事务，更新 `visibility` 与 `updated_at`）
    - _Requirements: 1.1, 1.2, 2.1, 5.1, 5.2, 6.6, 7.5_

  - [ ]* 9.3 编写真实内存 SQLite 单元测试（`DatabaseAdapter(":memory:")`）
    - 覆盖各方法的正常路径、空结果、参数化注入样本、排序稳定性
    - _Requirements: 1.1, 1.2, 5.1, 7.5_

  - [ ]* 9.4 编写属性测试 P1（SkillDB + core 组合）
    - **Property 1: 公开浏览恰为 shared 且按名称升序**
    - **Validates: Requirements 1.1, 1.2, 8.3, 8.4**

  - [ ]* 9.5 编写属性测试 P9
    - **Property 9: 私有列表隔离（恰为本人 private，排除 null 所有者）**
    - **Validates: Requirements 5.1, 5.2, 7.5**

  - [ ]* 9.6 编写属性测试 P15（存储侧写入校验）
    - **Property 15: 可见性写入校验（存储侧——非法值被 CHECK 与 assertWritableVisibility 双重拒绝、保留现值）**
    - **Validates: Requirements 7.6, 7.7**

- [x] 10. 检查点 — 确保数据库层全部测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. 实现技能目录服务（`apps/web/src/services/skill-catalog.service.ts`）
  - [x] 11.1 实现 `skill-catalog.service.ts`
    - `browsePublic(page)`、`searchPublic(rawQuery, page)`、`getPublicDetail(id)`、`listPrivate(actor)`、`getPrivateDetail(actor, id)`
    - 编排 core 校验/规范化/匹配/分页/摘要 + `SkillDB` 查询 + `SKILL.md` 读取（缺失置 `skillMdAvailable=false`）
    - _Requirements: 1.1, 1.2, 1.6, 1.8, 2.1, 5.1, 5.4, 8.1, 8.2_

  - [ ]* 11.2 编写属性测试 P8（真实内存 SQLite + 服务）
    - **Property 8: 读取/详情授权（shared 对任意访客；private 仅所有者）**
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [ ]* 11.3 编写浏览/搜索/详情的单元与集成测试
    - 覆盖空状态、检索失败保留先前状态、内容不可用、搜索空结果等示例/边界
    - _Requirements: 1.4, 1.6, 1.7, 1.8, 2.5, 5.4, 5.5, 5.7, 5.8_

- [x] 12. 实现技能下载服务（`apps/web/src/services/skill-download.service.ts`）
  - [x] 12.1 实现 `skill-download.service.ts`
    - `download(actor|null, id)`：校验 id → `getOwnership`（缺失 `NOT_FOUND`）→ `canDownload`（非所有者私有 `FORBIDDEN`）→ 解析技能目录 → 生成 `ArchiveEntry[]` → `planArchiveEntries` → 完整打包 ZIP，仅在完整成功后返回缓冲，中途失败抛 `ARCHIVE_FAILED` 且不返回部分字节
    - 选定打包库并记录于 `implementation.md`
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7_

  - [ ]* 12.2 编写属性测试 P6（Web 打包→解压往返）
    - **Property 6: 下载归档往返一致（打包/解压往返；含 CJK/特殊文件名/二进制内容）**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.8**

  - [ ]* 12.3 编写属性测试 P7
    - **Property 7: 下载授权**
    - **Validates: Requirements 3.5, 8.1, 8.2**

  - [ ]* 12.4 编写下载失败/原子性单元测试
    - 注入中途失败断言无部分输出；超限 `ARCHIVE_TOO_LARGE`；未找到 `NOT_FOUND`
    - _Requirements: 3.4, 3.6, 3.7_

- [x] 13. 实现技能发布服务（`apps/web/src/services/skill-publisher.service.ts`）
  - [x] 13.1 实现 `skill-publisher.service.ts`（已确认采纳基于所有者的发布模型）
    - 采纳「基于所有者」发布模型：`canPublish` 基于所有者判定（`owner_user_id === actor.userId` 可发布自己的私有技能，非所有者 `FORBIDDEN`）；SkillHub 发布走本服务并复用 core `canPublish`，不改动现有 `skill.service.ts` 的 admin-only 行为
    - `publish(actor, id)`：`getOwnership`→不存在 `NOT_FOUND`→`canPublish` 否则 `FORBIDDEN`→已 `shared` 返回 `{ alreadyPublic: true }` 不写库→否则 `setVisibility(id,'shared')` 单事务，失败回滚保持 `private`
    - 仅改 `visibility`，保持 `owner_user_id/id/name/description/内容` 不变
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [ ]* 13.2 编写属性测试 P12（publisher + 内存 SQLite）
    - **Property 12: 发布转换与幂等**
    - **Validates: Requirements 6.1, 6.2, 6.4**

  - [ ]* 13.3 编写属性测试 P13
    - **Property 13: 发布授权**
    - **Validates: Requirements 6.3**

  - [ ]* 13.4 编写属性测试 P14
    - **Property 14: 发布不变量保持**
    - **Validates: Requirements 6.5**

  - [ ]* 13.5 编写发布事务集成测试（真实内存 SQLite）
    - 单事务持久化、未找到无数据变更、事务失败回滚保持 `private`
    - _Requirements: 6.6, 6.7, 6.8_

- [x] 14. 检查点 — 确保服务层全部测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. 实现认证适配与可选认证中间件（`apps/web/src`）
  - [x] 15.1 实现 `optionalAuth()` 中间件
    - 存在有效 token 则 `verifyAccessToken` 注入 `userId/role`，无/无效则不抛错继续匿名（供下载端点所有者识别）
    - _Requirements: 3.5, 8.1_

  - [x] 15.2 实现 SkillHub 认证校验适配层（已确认：SkillHub 注册/校验入口用户名 254 / 密码 128 上限、30 分钟滑动空闲失效）
    - 在 SkillHub 新注册/校验入口采用用户名 254 / 密码 128 字符上限；不改动现有 `routes/auth.ts` 全局 zod schema（保持 3–50 / 8–512），登录沿用现有逻辑
    - 30 分钟滑动空闲失效通过在会话/`refresh_tokens` 记录 `last_active_at`（增量改动，不破坏现有 JWT 流程）实现，并在访问/刷新校验时更新最近活动时间
    - _Requirements: 4.8, 4.9_

  - [ ]* 15.3 编写认证单元与集成测试（真实 auth）
    - 登录建立会话、凭证无效统一错误、会话区域显隐、登出失效、限流锁定、空闲失效（推进时间）、长度边界拒绝
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 4.9_

- [x] 16. 实现路由并在 `app.ts` 挂载
  - [x] 16.1 实现公开路由 `skillhubPublicRoutes`（`/api/skillhub/public`、`/public/search`、`/public/:id`、`/:id/download` 经 `optionalAuth`）
    - 直接挂在 `app` 上（不经 `protectedApi`），调用 catalog/download 服务并经 `utils/response.ts` 映射错误
    - _Requirements: 1.1, 2.1, 3.1, 8.3_

  - [x] 16.2 实现受保护路由 `skillhubPrivateRoutes`（`GET /private`、`POST /:id/publish`）并挂在 `protectedApi`（已确认采纳基于所有者的发布授权）
    - 发布路由权限校验采用基于所有者模型（复用 core `canPublish`，非所有者 `FORBIDDEN`）
    - 在 `app.ts` 完成两处挂载，确保子路径互不重叠
    - _Requirements: 4.6, 5.1, 5.6, 6.1, 6.3_

  - [ ]* 16.3 编写属性测试 P11 (Skipped for MVP)
    - **Property 11: 无会话的私有操作一律被拒且无副作用**
    - **Validates: Requirements 4.6, 5.6, 8.5**

  - [ ]* 16.4 编写路由接线与认证边界集成测试 (Skipped for MVP)
    - 无 token 访问 `/private`、`/:id/publish` 返回 401 且不执行操作
    - _Requirements: 4.6, 5.6, 8.5_

- [x] 17. 检查点 — 确保路由与认证全部测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. 实现 SkillHub_UI 与七语言 i18n（`apps/web/src/client`）
  - [x] 18.1 实现客户端 API 层（`client/api`）
    - 封装公开浏览/搜索/详情/下载与私有列表/发布、登录/登出的调用
    - _Requirements: 9.1_

  - [x] 18.2 实现公开浏览/搜索/详情页面与空状态/错误状态
    - 列表、分页、详情（名称/描述/SKILL.md，内容不可用提示）、空状态、错误状态保留先前显示
    - _Requirements: 1.4, 1.6, 1.7, 1.8, 2.5, 9.1, 9.4_

  - [x] 18.3 实现登录/登出与私有技能管理 + 发布 UI
    - 会话区域显隐与登录入口、私有列表/详情/空状态、发布按钮
    - _Requirements: 4.3, 4.4, 5.4, 5.5, 6.1_

  - [x] 18.4 为全部七个 locale 文件新增 `skillhub.*` 翻译键
    - `en/zh/zh-TW/ja/fr/de/es` 每个键提供非空翻译值；缺失回退 `en`
    - _Requirements: 9.2, 9.5_

  - [ ]* 18.5 编写 UI 组件状态测试 (Skipped for MVP)
    - 空状态、错误状态、列表/详情渲染、发布交互
    - _Requirements: 1.4, 2.5, 5.5_

  - [ ]* 18.6 编写 i18n 回归测试 (Skipped for MVP)
    - 遍历 7 个 locale 文件断言所有 `skillhub.*` 键存在且非空；扩展无硬编码中文回归；删除非 en 键断言回退 en
    - _Requirements: 9.2, 9.3, 9.5_

- [x] 19. 跨领域测试（性能 / 安全 / 外键完整性）(Skipped for MVP)
  - [ ]* 19.1 编写性能/压力测试
    - 10000 个技能搜索 < 2s；500MB 边界归档 < 30s（时间预算，不计入属性迭代）
    - _Requirements: 2.7, 3.1_

  - [ ]* 19.2 编写安全测试
    - 技能目录解析与归档相对路径的路径穿越（`../`、绝对路径、符号链接、空字节）；搜索 SQL 注入样本；下载越权用例
    - _Requirements: 2.4, 3.3, 8.6, 8.7_

  - [ ]* 19.3 编写外键完整性集成测试
    - 删除用户后其 shared 技能 `owner_user_id` 经 `ON DELETE SET NULL` 置空，且该技能从每用户私有结果排除
    - _Requirements: 7.5, 7.9_

- [x] 20. 最终检查点 — 确保全部测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. 在 `implementation.md` 记录已解决冲突 A/B 的最终决策与代码/测试增量
  - 冲突 A 与冲突 B 均已解决并经用户确认，最终决策已记录于 `design.md`；任务 13.1、15.2、16.2 已据此定稿，无需再行确认。
  - 冲突 A（发布权限模型）：在活动 change 的 `implementation.md` 记录最终采纳「基于所有者」模型（`canPublish` 基于所有者；SkillHub 发布走新的 `skill-publisher.service.ts`，复用 core `canPublish`，不改动现有 `skill.service.ts` 的 admin-only 行为），以及任务 13.1/13.2/13.3 与 16.2 中由该决策产生的代码/测试增量。
  - 冲突 B（认证边界与空闲超时）：在 `implementation.md` 记录最终采纳 SkillHub 注册/校验入口用户名 254 / 密码 128 上限（不改动 `routes/auth.ts` 全局 zod schema），以及 30 分钟滑动空闲失效经 `last_active_at` 增量实现，并记录任务 15.2 与 15.3 中 4.8/4.9 对应的代码/测试增量。
  - _Requirements: 4.8, 4.9, 6.1, 6.3_

## Notes

- 标记 `*` 的子任务为可选测试任务（属性测试、单元测试、集成测试、性能/安全/i18n 回归测试），可为更快的 MVP 跳过；核心实现任务不标记可选。
- 每个任务引用其覆盖的具体需求条款以保证可追溯。
- 属性 1–16 各由单个 fast-check 属性测试实现，最少 100 次迭代，置于其实现位置附近以尽早发现错误。
- 检查点用于增量验证。
- DB 相关测试一律使用真实内存 SQLite（`DatabaseAdapter(":memory:")`），不使用 mock。
- 新增/变更代码目标 100% 行/函数/分支/条件覆盖；DB 与授权为关键边界模块须 100% 分支/条件覆盖。
- 任务 13.1、15.2 及 16.2 的发布权限/认证边界部分对应的冲突 A/B 已解决并经用户确认（决策记录于 `design.md`），已据此定稿，不再依赖任务 21；任务 21 仅负责在 `implementation.md` 记录最终采纳的决策与相应代码/测试增量。

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "7.1", "9.1", "15.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "3.3", "4.2", "4.3", "5.2", "6.2", "7.2", "9.2", "15.2"] },
    { "id": 3, "tasks": ["9.3", "9.4", "9.5", "9.6", "11.1", "12.1", "13.1"] },
    { "id": 4, "tasks": ["11.2", "11.3", "12.2", "12.3", "12.4", "13.2", "13.3", "13.4", "13.5", "16.1", "16.2"] },
    { "id": 5, "tasks": ["15.3", "16.3", "16.4", "18.1"] },
    { "id": 6, "tasks": ["18.2", "18.3", "18.4", "19.1", "19.2", "19.3"] },
    { "id": 7, "tasks": ["18.5", "18.6"] }
  ]
}
```
