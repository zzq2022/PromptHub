# Design: 物理清理及依赖卸载设计

## 清理策略

### 1. 物理删除
通过 Git 指令或文件系统命令直接移除下列文件与子目录：
- `apps/web-cloudflare/`
- `docs/cloudflare-workers.md`

### 2. 构建/测试链路调整
- **`scripts/verify-release.mts`**：
  从 `checks` 数组中过滤并移除所有以 `web-cloudflare-` 开头的 check 项。
- **根目录 `package.json`**：
  移除对 `apps/web` 单独为 CF 做客户端打包的快捷指令 `"build:web:cf"`，降低维护歧义。

### 3. 文档描述同步
- **`spec/knowledge/behavior/web.md`**：
  删除行为规范中对于 `apps/web-cloudflare` 必须具备独立 typecheck/lint/test 闭环的强制规定，只保留对 `apps/web` 相关的规范。
- **`README.md`**：
  清除对 Cloudflare 部署的引介，避免用户对该平台运行方式产生疑惑。

### 4. 依赖更新与锁重置
- 移除包后，在根目录执行 `pnpm install`。
- pnpm 会自动将 `@prompthub/web-cloudflare` 及其全部依赖从 `pnpm-lock.yaml` 中剔除。这能够大幅精简 `node_modules` 的体积并提高安装速度。
