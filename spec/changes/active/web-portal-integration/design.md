# 网页端页面整合与技能中心（ClawHub 风格）技术设计方案

## 1. 路由与守卫设计 (Routing & Guards)

调整后的 React Client 路由关系如下：
- `/`：公开访问，绑定 `SkillCatalog` 组件。
- `/login`：公开访问，绑定 `LoginPage` 组件。已登录则自动重定向到 `/dashboard`。
- `/setup`：公开访问，引导绑定。
- `/dashboard`：绑定 `ProtectedRoute`，仅限已登录用户，渲染 `Dashboard` 组件。
- `/workspace`：绑定 `ProtectedRoute`，仅限已登录用户，渲染 `DesktopWorkspacePage`（即镜像工作区）。
- `/admin`：绑定 `ProtectedRoute` 并在组件内部进行 `user.role === 'admin'` 过滤。

## 2. 状态映射与接口对接 (State & API Integration)

### 2.1 公共技能中心 (SkillCatalog) 状态流
- 组件加载时调用 `/api/skillhub/public?page=1` 获取首批公开数据。
- 用户点击分类（如 `dev`、`ai`）或更改输入框发起搜索时，调用 `/api/skillhub/public/search?q={term}&page={page}`。
- 点击卡片：
  - 触发 `selectedSkillId` 选中状态，打开 Modal。
  - Modal 内部调用 `/api/skillhub/public/:id` 接口获取包含 `skillMd` 的详细内容。
  - 提供 `Download` 按钮触发文件下载（直接定向浏览器至 `/api/skillhub/:id/download`）。
  - 提供 `Import` 按钮：若未登录则提示登录；若已登录，触发 `/api/skills/import` 以一键拉取到库中。

### 2.2 个人控制台 (Dashboard) 状态流
- 提供 Tabs 标签：“我的技能 (My Skills)” 和 “设置 (Settings)”。
- **我的技能**：
  - 加载时调用 `/api/skills?scope=all` 获取所有属于当前登录用户的技能（包含私有和共享技能）。
  - 每一个技能根据 `visibility`（`private` | `shared`）与 `approval_status`（`pending` | `approved` | `rejected`）显示不同的徽章。
  - 支持**新建技能**（弹窗表单，保存时发送 `POST /api/skills`，`protocol_type` 默认 `skill`）。
  - 支持**导入远程**（弹窗表单输入 URL，发送 `POST /api/skills/fetch-remote`）。
  - 支持**提交审核**（发送 `POST /api/skillhub/:id/publish`）。
  - 支持**删除技能**（发送 `DELETE /api/skills/:id`）。
  - 支持**安全扫描**（发送 `POST /api/skills/:id/safety-scan`）。

---

## 3. 多语言键扩展 (I18n Keys)

已有的 `zh.json` 与 `en.json` 中定义了以下核心翻译段落：
- `skillhub.title`: 技能中心
- `skillhub.searchPlaceholder`: 按名称或描述搜索技能...
- `skillhub.download`: 下载
- `skillhub.publish`: 发布
- `skillhub.submitForReview`: 提交审核
- `skillhub.pendingApproval`: 已提交审核...
- `admin.backToApp`: 返回应用 (在这里可修改或指向返回 Dashboard)

我们将复用已定义的 `skillhub.*` 和 `admin.*` 段落，并增加：
- `nav.dashboard`: 个人主页
- `nav.workspace`: 提示词工作区
- `dashboard.intro`: 欢迎来到你的个人控制面板
- `dashboard.createSkill`: 新建技能
- `dashboard.importRemote`: 导入远程技能
- `dashboard.mySkills`: 我的技能
- `dashboard.toWorkspace`: 进入高阶工作区
