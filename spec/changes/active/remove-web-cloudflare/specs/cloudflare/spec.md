# Specification: 移除 Cloudflare Worker 同步端

## 变更行为边界

### 1. 移除部署平台支持

- **现状**：开发者与用户可以通过 `apps/web-cloudflare` 构建并部署一个基于 Cloudflare Workers + D1 + R2 的 API 同步端。
- **变更后**：删除所有 wrangler.jsonc、Worker 绑定、数据库迁移和部署脚本。仓库中不再提供 Cloudflare Workers 平台原生部署支持。

### 2. 移除发布校验范围

- **现状**：发布验证套件（Release Harness）必须运行对 `@prompthub/web-cloudflare` 的 lint, typecheck 和 test，确认其通过方可发版。
- **变更后**：验证套件只校验 `@prompthub/shared`, `@prompthub/db`, `@prompthub/core`, `@prompthub/cli`, `@prompthub/desktop` 和 `@prompthub/web`。

### 3. 主项目与网页端核心契约保持不变

- 桌面端中，与同步端通信的协议依然遵循基于 Hono 服务端定义的标准 REST APIs。因此，直接连接至由 `apps/web` 部署的标准自托管网页端的同步流程完全不受此移除影响。
