# Tasks - 重构实施清单 (Refactoring Checklist & Action Plan)

- [ ] **准备阶段：明确重构范围与接口契约**
  - [ ] 备份数据库和当前主干代码分支
  - [ ] 定义扩展的数据库 Schema（包括 `models_config` 结构）
  - [ ] 编写新增的 IPC 通道定义与服务端 API REST 类型声明

- [ ] **实施第一阶段：服务端与 SkillHub 重构**
  - [ ] 在 `apps/web` 下开发分权鉴权中间件，实现多租户隔离
  - [ ] 实现普通用户发布申请与管理员审批中心 API 路由
  - [ ] 实现公共商店列表、检索、ZIP包压缩下载端点（类 ClawHub API）
  - [ ] 编写并执行单元测试，保证服务端接口行/分支覆盖率达标

- [ ] **实施第二阶段：桌面端核心逻辑与同步引擎**
  - [ ] 升级客户端 `SyncBackupCore` 逻辑，支持基于 `updatedAt` 的双向增量合并
  - [ ] 编写后台防抖同步管理器，关联数据持久化写操作触发同步
  - [ ] 引入 `models_config` 大模型配置表操作类，编写测试覆盖其加密读写

- [ ] **实施第三阶段：桌面端 Codex UI 与交互**
  - [ ] 实现 Codex 编辑器三栏布局页面框架
  - [ ] 开发底部控制区域的 Skills 和 MCP 激活 Badge 选择器
  - [ ] 重构 LLM 会话发送逻辑，动态装载选中的技能 System Prompt 与 MCP Tools 参数
  - [ ] 嵌入 SkillHub 商店界面，提供公共技能浏览与一键 ZIP 包下载解密安装功能

- [ ] **验证与合规检查**
  - [ ] 运行桌面端 Vitest 单元测试，确保修改及新增代码 100% 覆盖率
  - [ ] 运行端到端测试（Playwright E2E），检验双向同步及发布审批闭环
  - [ ] 更新 `implementation.md`
  - [ ] 将稳定特性同步回 `spec/knowledge/*` 和 `spec/workflow/*`
