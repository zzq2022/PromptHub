# Proposal: 移除 apps/web-cloudflare 及其相关引用

## Why

随着 PromptHub 的演进，常规的自托管版本网页端（由 `apps/web` 提供，跑在 Node.js / Docker 上）已经成为主要的网页端分发形态。为了简化 monorepo 仓库结构，降低多包依赖管理、依赖升级（尤其是 Wrangler、Miniflare 相关的开发依赖）和持续集成校验（Linter/Typecheck/Tests）的维护开销，决定彻底移除仅作为备选方案的 Cloudflare Workers 部署分支（`apps/web-cloudflare`）。这能显著提高 `pnpm install` 与 release 自动化测试的速度，并精简项目架构。

## Scope

- **In scope**:
  - 物理删除 `apps/web-cloudflare` 包及其下的所有源文件、测试与辅助脚本。
  - 删除相关的说明文档 `docs/cloudflare-workers.md`。
  - 移除根目录下 `package.json` 中的 `"build:web:cf"` 打包构建客户端指令。
  - 修改 `scripts/verify-release.mts`，移除对 `web-cloudflare` 的 lint、typecheck 和 test 的校验 checks。
  - 修改 `spec/knowledge/behavior/web.md`，清理对该包结构和规范的硬性要求。
  - 移除主 `README.md` 中关于 Cloudflare Workers 自部署的段落和提示。
  - 运行 `pnpm install` 刷新 `pnpm-lock.yaml`，确保锁文件中不再包含该包依赖。

- **Out of scope**:
  - 不会对以 `apps/web` 为核心的常规网页自托管逻辑进行任何改动。
  - 不会影响桌面端本地工作区与 SQLite 数据逻辑。

## Risks

- **后续找回风险**：如果在未来决定重新启用 Cloudflare Workers 部署形态，需要从 Git 提交历史中回滚/找回 `apps/web-cloudflare`。
- **发布脚本报错**：如果未清理 `scripts/verify-release.mts` 中对应包的 check，会导致全局发布校验脚本在执行时崩溃。本变更将确保这些 check 被同步移除。

## Rollback Thinking

- 可通过 Git 命令直接回滚当前提交来完全恢复所有已删除的代码和配置。
