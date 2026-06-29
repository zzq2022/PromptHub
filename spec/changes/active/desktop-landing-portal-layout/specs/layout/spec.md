# 桌面端落地门户与组合导航规范 (简化单轨版)

## 1. 界面呈现 (Visual Requirements)

### 1.1 单栏垂直导航侧边栏 (Single Flat Sidebar)
- **外观**：宽度固定在 `240px` 至 `260px`，采用毛玻璃背景质感 (`backdrop-blur-md bg-sidebar-background/80`)。
- **无页签单轨道 (Single Rail-less Layout)**：取消顶部的 Work/Chat 切换开关。侧边栏统一垂直平铺四大核心板块（手风琴折叠菜单形式）：
  - 📂 **提示词库 (Prompts)** (点击展开)：
    - 展示 `全部提示词`、`收藏`、以及文件夹树（层级缩进）。
  - 🛠️ **技能中心 (Skills)** (点击展开)：
    - `我的技能 (My Skills)`
    - `IDE 部署 (IDE Skills)`
    - `技能商店 (Skill Store)`（可展开显示多个远程商店源）
  - 📜 **系统规则 (Rules)** (点击展开)：
    - 展示 `IDE 规则`、`项目规则`。
  - 🤖 **智能体项目 (Agents)** (点击展开)：
    - 展示所有已配置的 Agent 本地项目（如 `myagentbot05`, `Tpa_RuYiBot`）。
    - 点击某一项目后展开该项目下的 `历史会话 (Session List)`，支持 `新建对话`。
- **底部用户信息**：常驻于侧边栏左下角，展示用户头像、用户名，右侧提供极简设置图标。

### 1.2 落地门户 (Portal Dashboard)
- 当侧栏未选中具体资产（Prompt/Skill/Rule/Session）时，主内容区渲染落地主页：
  - **工作台主页**：上方 Logo，中间搜索对话框（带 `+ 新建提示词`、`+ 新建技能`、`+ 运行智能体` 快捷按钮），下方为推荐卡片网格。
  - 点击任何卡片自动定位至对应功能并加载。
