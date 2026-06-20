# Delta Spec

## Added

- 无（本变更仅为清理和瘦身）。

## Modified

- **Web 顶部导航栏 (Topbar)**: 移除指向 `/skillhub` 的超链接入口。保留 “PromptHub” 标志、Admin Panel 按钮、用户名以及 Logout 退出登录按钮。
- **Web 路由配置**: 从 React Router 控制的可用路径中移除 `/skillhub`。
- **服务端 Hono 挂载**: 移除 `/api/skillhub/admin` 相关路由挂载（包括 `/api/skillhub/admin/pending`，`approve`，`reject`），以缩减暴露的 API 表面积。

## Removed

- **`/skillhub` 单页**: 彻底删除。
- **`api/skillhub.ts` 客户端文件**: 彻底删除。

## Scenarios

- 访客在自托管的 Web 应用中登录后，无法在顶部导航栏看到 "SkillHub" 入口，仅能通过 "Admin Panel"（如果是管理员）进入后台管理。
- 访客如果手动在地址栏输入 `http://localhost:5174/skillhub`，会被路由拦截（即匹配到通配符 `*` 并导向默认的工作区页面或报错）。
