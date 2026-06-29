# 网页端页面整合与技能中心（ClawHub 风格）重构提案

## Why

目前 PromptHub 的自部署网页端首页直接加载了完整的桌面镜像工作区。这导致两个主要问题：
1. **未登录或初次加载负荷过重**：匿名访客无法直接浏览平台上公开分享的 AI 技能；而直接渲染整个 Electron 工作区增加了首屏渲染耗时和数据库加载负担。
2. **缺乏多租户轻量化面板**：用户没有一个专门的 Dashboard 来直观查看自己所有的技能、所处审核状态，进行提审和安全审计。

本变更将通过以下重构改善使用体验：
- 将首页替换为公开的 ClawHub 风格技能中心，突出公共技能搜索和详情下载/导入。
- 为普通用户和管理员增加独立的轻量级控制台 `/dashboard`（“我的主页”）。
- 将繁重的 Electron 工作区隔离至独立路由 `/workspace`。

## Scope

- **In scope:**
  - 新增 `/` 路由及 `SkillCatalogPage` 组件，实现 ClawHub 风格技能中心（支持分类过滤、模糊搜索、SKILL.md 渲染、ZIP 下载、导入工作区）。
  - 新增 `/dashboard` 路由及 `DashboardPage` 组件，实现个人主页（我的技能管理，状态徽章，在线 CRUD，提审与扫描）。
  - 新增 `/workspace` 路由，关联 `DesktopWorkspacePage`，并微调顶部导航使其互通。
  - 新增客户端 `/api/skillhub` 交互接口（`apps/web/src/client/api/skillhub.ts`）。
  - 覆盖率红线：新增或修改的代码必须达到 100% 测试覆盖。
- **Out of scope:**
  - 桌面端 Electron 本地软件本身的布局修改（桌面端仍由现存的 `desktop-landing-portal-layout` 处理，两者物理隔离）。
  - 用户认证逻辑变更。

## Risks

- **页面路由冲突**：原有路由重写可能影响到现有用户的访问习惯或产生页面死循环。
- **回滚难度**：如果整合后的状态与多租户权限判定发生冲突，可能导致普通用户越权或管理员功能受限。

## Rollback Thinking

- 在 `App.tsx` 中保留原有 `/` 指向 `DesktopWorkspacePage` 的开关，一旦发生严重阻断性问题，可以通过单行代码注释轻松恢复。
