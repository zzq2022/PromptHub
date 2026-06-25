# Delta Spec - 服务端与公开商店重构规范 (Server & SkillHub Refactoring Spec)

## Added

### 1. 仿 ClawHub 技能商店服务 (SkillHub Public Portal)
* **公共公开网关页 (Public Web Hub)**：
  * 无需登录即可浏览公开技能。设计高美感的前端网卡与分类导航（办公、开发、数据、安全等）。
  * 技能卡片上直接显示核心指标：作者、SemVer 版本号、周下载安装量、以及大模型自动安全审查级别徽章。
  * 点击卡片进入详情页，解析 SKILL.md 生成漂亮的 Markdown 说明文档，并提供一键下载 ZIP 包链接以及终端一键安装指令（如 `prompthub install <slug>`）。
* **SkillHub API 支持**：
  * `GET /api/v1/skills`：分页列出所有审核通过的公开技能（`visibility = 'shared'` 且 `approval_status = 'approved'`）。
  * `GET /api/v1/search`：基于关键词的模糊检索。
  * `GET /api/v1/skills/:slug/file?path=SKILL.md`：供客户端校验及单文件读取的端点。
  * `GET /api/v1/download?slug=:slug`：生成对应技能版本全部文件 ZIP 压缩包的流式下载。

### 2. 多租户用户与管理员分权隔离 (User & Admin Portals)
* **用户端主界面（普通用户）**：
  * **我的数据管理**：只读/写属于自己的私有数据（私有提示词、私有文件夹、以及自建的私有技能）。
  * **发布管理**：提供“发布申请”面板。用户点击“申请公开”某个本地私有技能，服务端会将该技能的 `approval_status` 设为 `pending`，但在审核通过前，该技能在公共技能商店不可见。
* **管理端主界面（管理员）**：
  * 只有角色为 `role = 'admin'` 的用户才能进入。
  * **待办审核中心 (Approval Center)**：列表展示所有 `approval_status = 'pending'` 状态的技能申请，显示提交用户、技能名称、描述及代码预览。
  * **审批操作**：
    * 批准（Approve）：设置 `approval_status = 'approved'`，且系统自动将其 `visibility` 变更为 `'shared'`，瞬间公开。
    * 拒绝（Reject）：设置 `approval_status = 'rejected'`，并录入拒绝理由，技能可见性保持 `private`。

---

## Modified

* **数据访问鉴权层 (Authorization Middleware)**：
  * 改造现有的 `getAuthUser` 鉴权中间件。对涉及 `prompts`、`folders` 和 `skills` 表的 CRUD 操作，强制进行 `owner_user_id = actor.userId` 过滤，彻底杜绝越权访问漏洞。
  * 管理员具备跨租户只读公开资源，以及写审核字段的权限。

---

## Scenarios

### 场景 1：普通用户提交技能发布并由管理员审批通过
1. 普通用户 `user_A` 编写了一个新技能 `Git Optimizer`，并在用户控制台中点击“发布到商店”。
2. 服务端收到请求，通过鉴权核验所有权，更新 `skills` 表该行 `approval_status = 'pending'`，可见性仍为 `private`。
3. 管理员 `admin_B` 登录后台审核面板，查看到 `Git Optimizer` 处于待审列表。
4. `admin_B` 预览其代码和系统提示词，确认无恶意代码，点击“批准”。
5. 服务端执行事务：
   * 将 `approval_status` 更新为 `'approved'`。
   * 将 `visibility` 变更为 `'shared'`。
6. 该技能即刻展现在免登录的公共 SkillHub 商店主页中，所有用户均可检索并下载。
