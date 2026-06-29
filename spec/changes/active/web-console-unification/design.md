# 统一控制台重塑设计规格 (V4 - Unified Console)

## 1. 路由精简 (Routing Unification)

在网页端，删除自定义的 Dashboard Page 路由，将所有开发、管理需求归口至 `/console/skills` 路由，渲染 `DesktopWorkspacePage`。

```text
/                      -> SkillCatalogPage (公开技能中心)
/console               -> ConsoleLayout (嵌套路由骨架)
  ├── /console/skills       -> DesktopWorkspacePage (我的技能，渲染完整 IDE 并默认聚焦至 skill 模块)
  └── /console/admin        -> AdminLayout (管理员审核后台)
```

对旧路径的向后兼容重定向：
- `/dashboard` -> `/console/skills`
- `/workspace` -> `/console/skills`

---

## 2. 网页端环境下的 IDE 模块默认聚焦 (Default Tab Focus)

在 `apps/desktop/src/renderer/App.tsx` 中，如果在网页端运行（`isWebRuntime()`），且当前是首次挂载（即启动时没有传入其他激活参数），默认将 `appModule` 切换至 `skill` 模块，方便用户第一时间管理智能体技能；同时，用户可以通过点击左侧 Sidebar 自由切换到 `prompt`：

```typescript
  useEffect(() => {
    if (isWebRuntime()) {
      // 默认聚焦至我的技能 Tab
      setAppModule("skill");
    }
  }, [setAppModule]);
```

由于不再对其进行侧栏 Tab 的过滤，`Sidebar.tsx` 将保持原有的 `visibleDesktopModules` 计算逻辑不变，允许 `prompt`、`skill` 等图标同时共存。
