# 桌面端落地门户与组合导航设计方案 (简化单轨版)

## 1. 侧边栏结构与状态映射 (Sidebar Mapping)

通过取消最上方的 Work/Chat 切换开关，所有功能均被拉平展示在同一个垂直侧边栏中。我们直接使用已有的 `uiStore.appModule` ("prompt" | "skill" | "rules" | "projects") 来管理当前的激活模块：

### 1.1 手风琴状态机 (Sidebar Accordions)
每个核心板块为可独立收起的 `Collapsible`：
- **`提示词库 (Prompts)`**：折叠状态不受 `appModule` 影响。激活子项时，设置 `appModule = "prompt"`。
- **`技能中心 (Skills)`**：折叠状态由用户手动控制。激活子项（我的技能/IDE部署/具体商店）时，设置 `appModule = "skill"` 且设置对应 Store 子状态。
- **`系统规则 (Rules)`**：激活时，设置 `appModule = "rules"`。
- **`智能体项目 (Agents)`**：激活时，设置 `appModule = "projects"`。点击具体的 Agent 项目，会高亮项目并在下方渲染其对应的会话历史列表。

这极大简化了状态管理，无需再引入额外的 `appMode` 切换状态。

---

## 2. 主页面路由控制 (Main View Routing)

在 `App.tsx` 中，主布局简化为：
```tsx
<div className="flex h-screen overflow-hidden">
  {/* 统一侧边栏（垂直平铺提示词、技能、规则、项目） */}
  <Sidebar />
  
  <div className="flex-1 flex flex-col min-w-0">
    <TopBar />
    
    <div className="flex-1 overflow-hidden relative">
      {/* 落地主页门户（未选中任何条目时展示） */}
      {showPortal ? (
        <PortalDashboard />
      ) : (
        /* 工作区活动视口 */
        <MainContent />
      )}
    </div>
  </div>
</div>
```
- **`showPortal` 判定规则**：
  - 如果 `appModule === "prompt"` 且 `selectedId === null`
  - 或 `appModule === "skill"` 且 `selectedSkill === null`
  - 或 `appModule === "projects"` 且 `activeSessionId === null`
  - 则主页面自动显示 `PortalDashboard`（展示对应模块的 Logo、快捷输入框及卡片网格）。
- 点击卡片或在输入框发起调用后，自动设置选中状态，从而隐藏 `PortalDashboard`，滑入 `MainContent` 工作区。
