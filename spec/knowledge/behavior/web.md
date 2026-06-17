# Web Spec

## Purpose

本规范定义 PromptHub Web / self-hosted 方向的稳定产品与工程边界。

## Stable Requirements

### 1. Product Role

- `apps/web` 的目标是可自部署网页版 PromptHub，而不只是纯 API helper。
- Web 版本应支持浏览器访问、认证、核心 Prompt/Folder/Skill 管理，以及作为 desktop 的同步目标。

### 2. Documentation Ownership

- 面向部署者的公开说明放在 `docs/web-self-hosted.md`。
- 更细的内部设计、布局迁移、REST API 规划与实施任务放在 `spec/`。

### 3. Stable Internal Sources

- Web 的架构与数据布局参考 `spec/knowledge/structure/data-layout-v0.5.5-zh.md`。
- Web 的长期实施规划与布局迁移历史保存在 `spec/changes/legacy/docs-08-todo/`。

### 4. Self-Hosted Runtime Packaging

- Web 自部署 runtime 在 Docker 或其他生产构建中必须能完整启动认证验证码服务。
- 如果服务端依赖像 `svg-captcha` 这样会在运行时读取包内静态资源的库，SSR 构建不得把它错误内联到 bundle 中，否则会破坏其字体或资源的相对路径读取。

### 5. Cloudflare Worker Packaging

- `apps/web-cloudflare` 是独立于 `apps/web` 的 Cloudflare Workers 自部署实现，但它仍必须作为 monorepo 内可重复安装、可重复 typecheck、可重复 lint、可重复测试的 workspace package 存在。
- Cloudflare worker 若通过 `wrangler` 生成运行时类型，应优先使用生成的 `worker-configuration.d.ts`，避免长期维护与真实平台 API 漂移的手写声明。
- Cloudflare worker 的辅助脚本只能调用仓库内真实存在的构建命令；公开同步脚本不得依赖失效命令名。
- Cloudflare worker 的 500 响应不得向客户端透传内部异常 message；详细异常仅记录在服务端日志。

## Stable Scenarios

### Scenario: Contributor updates web architecture

When a contributor changes web data layout, sync semantics, or deployment model:

- they update an active change under `spec/changes/active/`
- they encode behavioral delta in `specs/web/spec.md` inside that change
- they sync long-lived truth back into `spec/knowledge/behavior/web.md` and `spec/knowledge/structure/`

### Scenario: User wants self-hosting help

When a user needs deployment instructions:

- the public entry remains `docs/web-self-hosted.md`
- internal planning and migration detail stays in `spec/`

### Scenario: Contributor updates Cloudflare worker integration

When a contributor changes `apps/web-cloudflare` runtime bindings, scripts, or shared package imports:

- they keep the package installable from the monorepo root
- they rerun Cloudflare type generation after wrangler binding changes
- they verify `typecheck`, `lint`, `test`, and `build:web:cf`
