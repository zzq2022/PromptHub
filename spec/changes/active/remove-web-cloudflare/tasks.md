# Tasks: 移除 apps/web-cloudflare 任务清单

- [x] 物理删除 `apps/web-cloudflare` 目录
- [x] 物理删除 `docs/cloudflare-workers.md` 说明文件
- [x] 修改 `scripts/verify-release.mts`，移除 web-cloudflare 的校验任务
- [x] 修改根目录 `package.json`，移除 `build:web:cf` 脚本
- [x] 修改 `spec/knowledge/behavior/web.md`，清除对 Cloudflare 包的规范约束
- [x] 修改 `README.md`，删除对 Cloudflare 部署的引介
- [x] 运行 `pnpm install` 重新生成 `pnpm-lock.yaml`
- [x] 运行 `pnpm verify:release:quick` 进行全局发版快速验证，确保项目依然编译/测试通过
