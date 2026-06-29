# 落地门户与组合导航重构任务清单

- [ ] **步骤 1：状态管理扩展 (ui.store.ts)**
  - [ ] 在 `ui.store.ts` 添加 `appMode` ("work" | "chat") 状态。
  - [ ] 添加 `showPortal` (boolean) 状态及控制函数。
  - [ ] 在 persist partialize / merge 中同步保存与校验。
  
- [ ] **步骤 2：创建落地门户组件 (PortalDashboard.tsx)**
  - [ ] 新建 `PortalDashboard.tsx` 组件，使用 Vanilla CSS + Tailwind 实现磨砂玻璃卡片与 HSL 渐变。
  - [ ] 绘制居中品牌 Logo 及浮动搜索输入框。
  - [ ] 绑定跨模块数据（Prompt/Skill/Rules），并在底部实现 Tab 网格预览卡片。
  - [ ] 实现点击卡片平滑设置选定项并退出 Portal 的转场逻辑。

- [ ] **步骤 3：重构侧边栏 (Sidebar.tsx)**
  - [ ] 将原 Rail 导航与 Panel 树列表整合。
  - [ ] 顶部添加 `Work` 与 `Chat` 开关滑块。
  - [ ] 重塑工作区模式子页签（提示词/技能/规则）。
  - [ ] 重塑智能体对话模式，直出 Agent 项目与对应 Session 历史。
  
- [ ] **步骤 4：整合路由与主视口 (App.tsx & MainContent.tsx)**
  - [ ] 重构 `App.tsx` 里的主容器排列，采用 `[Sidebar] -> [TopBar -> Content]` 的现代双层结构。
  - [ ] 根据 `showPortal` 开关在落地门户与工作区之间进行淡入淡出转场。
  - [ ] 微调顶部栏，去除冗余的面包屑或开关。

- [ ] **步骤 5：验证与系统测试**
  - [ ] 执行 `pnpm test` 保证状态机逻辑完整。
  - [ ] 构建并本地打包核对 CSS 动效和转场物理正确性。
