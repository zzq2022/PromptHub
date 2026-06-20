# 16:9 架构汇报单页幻灯片 (One-Pager) 详细大纲与内容展开

---

### 📌 幻灯片标题 (Slide Title)
**全景蓝图：本地优先的个人智能工作台融合架构与数据衔接机制**

### 📌 幻灯片副标题 (Slide Subtitle)
**基于云端注册源、本地控制面与沙箱执行面的"发现-下载-管理-调试-热挂载-执行-回流"全生命周期智能体开发运行闭环**

---

### 🎨 版式布局与设计系统 (Layout & Design System)
*   **画布尺寸**：标准 16:9 宽屏（1920px × 1080px）暗黑极客风。
*   **空间构图**：左-中-右三栏非对称卡片布局（左 20% 服务端 SkillHub、中 40% 管理客户端 PromptHub、右 40% 推理客户端 Agent），底部横贯霓虹蓝（同步流）与琥珀金（执行流）双向流光闭环管道。

---

### 📊 图形化表达方案 (Visual & Diagram Schema)

```mermaid
graph LR
    subgraph SERVER_TIER ["【服务端】SkillHub 技能中心"]
        direction TB
        Backend["技能后端管理 & RBAC<br/>多租户命名空间"]
        PublicStore["公开 Skill 商店<br/>供 PromptHub 浏览 / 查询 / 导入"]
        Portal["管理员审查 / 个人空间<br/>接收 PromptHub 发布回流"]
    end

    subgraph CLIENT_PROMPTHUB ["【管理客户端】PromptHub 平台"]
        direction TB
        MySkill["<b>我的 Skill</b><br/>私有库 · 唯一真源<br/>managed repo + SQLite + 版本"]
        ProjectSkill["<b>项目 Skill</b><br/>当前项目上下文<br/>.agents/skills / .claude/skills<br/>symlink → 我的 Skill"]
        SkillStore["<b>Skill 商店 · 多源</b><br/>ClawHub 外网 / SkillHub 自建<br/>GitHub / skills.sh / 本地目录"]
        Symlink["Symlink 软链分发引擎<br/>symlink / copy 双模式"]
    end

    subgraph CLIENT_AGENT ["【推理客户端】Agent 智能体"]
        direction TB
        AgentSkill["<b>Agent Skill</b><br/>工具自带 skill 目录<br/>.claude/skills / .codex/skills /<br/>.cursor/skills / .windsurf/skills"]
        QAEngine["智能问答引擎 (Memory Mesh)"]
        FsWatcher["FsWatcher (秒级技能重载)"]
        Sandbox["Python 隔离沙箱 & 技能执行"]
    end

    SkillStore -->|① 多源浏览 + 一键导入| MySkill
    PublicStore -->|①a 自建 SkillHub 公开查询| SkillStore

    MySkill -.->|symlink / copy| ProjectSkill
    Symlink -->|② 软链分发到 Agent 目录| AgentSkill

    Symlink -->|② 技能热重载流| FsWatcher
    FsWatcher -->|动态重载技能| Sandbox
    QAEngine <-->|③ 技能调用与推理流| Sandbox

    MySkill ==>|"④ 发布回流<br/>POST /api/skillhub/:id/publish"| Portal

    %% 样式微调
    classDef server fill:#0C1C2B,stroke:#0EA5E9,stroke-width:2px,color:#fff;
    classDef prompt fill:#151E33,stroke:#8B5CF6,stroke-width:2px,color:#fff;
    classDef agent fill:#221E1A,stroke:#F59E0B,stroke-width:2px,color:#fff;
    class SERVER_TIER,Backend,PublicStore,Portal server;
    class CLIENT_PROMPTHUB,MySkill,ProjectSkill,SkillStore,Symlink prompt;
    class CLIENT_AGENT,AgentSkill,QAEngine,FsWatcher,Sandbox agent;
```

---

### 📝 详细结构化汇报正文 (Detailed Technical Core Text - 约 600 字)

#### 一、 三端核心定位与技术特征 (Three Projects: Characteristics & Roles)
本架构由**服务端**与**双客户端**解耦协作构成。
1. **【服务端】SkillHub（自建）**：AI 技能的云端元数据中心与核心注册表。对外提供多租户命名空间、RBAC 安全组与管理员审查流（第三方脚本静态 AST 安全检测）；同时承担两件事——① **公开 Skill 商店**：把"团队/社区公开的 Skill"暴露给 PromptHub 浏览、查询、导入；② **发布回流接收方**：接收 PromptHub 从本地调试成熟后回流的私有 Skill，经审查后入公共商店。
2. **【管理客户端】PromptHub**：本地优先的个人提示词与技能控制台。内部按"**1 真源 + 2 视图 + 1 多源商店**"四层组织：
   * **我的 Skill（私有库 · 唯一真源）**：SQLite 元数据 + managed repo 路径，所有保存自动写版本历史（diff / rollback / 命名版本），是所有"被引用 Skill"的最终落点；
   * **项目 Skill（项目级视图）**：当前打开项目上下文里的 `.agents/skills/` / `.claude/skills/` 等扫描目录，**以 symlink 指向我的 Skill 里的某些条目**，项目维度不污染全局库；
   * **Skill 商店（多源导入）**：可同时接入 ClawHub（外网公开）、自建 SkillHub、GitHub 仓库（anthropics/skills 等）、skills.sh、本地目录；命中后一键「导入到我的 Skill」，从此私有化、本地化、可版本化；
   * **Symlink 软链分发引擎**：把「我的 Skill」中的条目以 symlink / copy 双模式部署到 15+ Agent 工具的 skill 目录（Agent Skill 视图）。
3. **【推理客户端】Agent**：独立的智能对话交互与执行客户端。前端承载智能对话问答，核心依靠 **Memory Mesh 双层记忆网格**（短期上下文 + 长期向量特征精简蒸馏）进行智能推理增强；引擎层**通过 FsWatcher 实时监听 Agent Skill 目录的 symlink 变更**，以零停机热挂载方式动态加载 PromptHub 部署的 Skill，并在隔离的 Python 进程沙箱内安全执行投研或通用智能体任务。

#### 二、 软链治理：单一真源 + 多视图 (Single Source of Truth, Many Views)
PromptHub 在"我的 Skill → 视图"这一段统一走本地软链：
* **symlink（默认）**：项目 Skill 目录 / Agent Skill 目录里只是一条指向 managed repo 的链接，在 PromptHub 编辑就是真源编辑，所有视图即时同步。
* **copy**：把快照复制一份到目标目录。适合需要把 Skill "冻结"到某个项目某个版本、或者 Agent 工具不识别 symlink 的场景。

复制还是软链，所有变更都先落回「我的 Skill」再分发，**视图侧（项目 Skill / Agent Skill）永远不持有"独占真源"**，避免"项目里改了一份、桌面里看不到"的歧义。

#### 三、 四大核心数据工作流闭环 (4-Pillar Interconnection & Closed-Loop)
* **① 商店下载流（Skill 商店 → 我的 Skill）**：管理客户端的 Skill 商店可同时面向 ClawHub、自建 SkillHub、GitHub、本地目录发起浏览 / 搜索 / 分页请求；命中后一键「导入到我的 Skill」，下载落库、生成结构化 Markdown，**从此该 Skill 私有化、本地化、可版本化**。ClawHub 与 SkillHub 上的公开 skill 是"可消费的素材"，「我的 Skill」是"被消费的资产"。
* **② 技能重载流（我的 Skill → Agent）**：用户在 PromptHub 切换 Skill 激活态 / 选中目标平台 / 选中目标项目时，main 进程通过 `SKILL_INSTALL_MD_SYMLINK` 写一条 OS 级 symlink 到 Agent Skill 目录；Agent 运行时 FsWatcher 秒级捕捉变更并热重载配置，无需重启问答引擎。
* **③ 推理与工具执行流（Agent ↔ 个人用户）**：用户与 Agent 交互提问时，问答引擎结合 Memory Mesh 记忆，自动匹配并调度由 PromptHub 分发的 Skill，在 Python 隔离沙箱中受限运行脚本，流式拦截 stdout 渲染中间实数与 CoT 思维链。
* **④ 技能发布回流（我的 Skill → SkillHub）**：在本地调试成熟的自定义 Skill，可通过 PromptHub 安全上报通道发布回 SkillHub 服务端，经管理员审查安全合规后入公共商店，再被其他用户从 Skill 商店浏览 / 导入。发布回流失败**不回滚**本地 visibility —— Local-first 永远成立。

#### 四、 设计取舍与边界 (Trade-offs)
* **为什么不直接上云？** Local-first 是产品定位，也是合规护城河。「我的 Skill」默认留在用户磁盘，只有用户显式配置自部署 Web 才会上云，桌面端是数据所有权的真源。
* **为什么软链而不是双向同步？** 双向同步会引入冲突解决 / 时间窗口 / 离线合并难题；软链本质是"OS 级指针"，写只可能发生在一处（真源侧），视图侧天然只读 / 实时同步，把同步问题退化成了文件系统问题。
* **为什么商店要支持多源？** 不同源有不同的优势：ClawHub 偏社区热度、自建 SkillHub 偏团队内部共享、GitHub 偏可控可审、本地目录偏"我机器上已经有的 skill"。导入是单向收敛 —— 无论从哪来，都会被「我的 Skill」私有化后形成统一管理面。
* **为什么服务端只暴露"公开 Skill"和"接收回流"两类接口？** 服务端不是用户的"个人云盘"，它的角色是**社区注册表 + 审查入口**。个人数据始终留在桌面端，服务端只承担跨用户的"分享 / 发现 / 治理"职责。
