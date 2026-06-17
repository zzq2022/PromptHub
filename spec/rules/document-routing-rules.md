# PromptHub Document Routing Rules

这个文件定义 PromptHub 在接入最新 `spec-init` skill 后的文档语义到目录路径映射规则。

## 目标

- 让 agent 和贡献者知道“这份内容该写去哪”
- 让 `spec-init.topology.yml`、`README.md`、`AGENTS.md` 和 `spec/` 目录结构保持一致
- 避免把项目级 workflow / knowledge 文档和单次 change 工作区混在一起

## 路由规则

### Workflow

- 背景、用户、目标、非目标、约束：`spec/workflow/00-intake/README.md`
- FR / NFR / AC、范围外：`spec/workflow/01-requirements/README.md`
- 当前阶段 how、架构、模块、接口、数据、权衡：`spec/workflow/02-design/README.md`
- 里程碑、依赖、阶段顺序：`spec/workflow/03-implementation/README.md`
- 需求到测试映射、回归策略、验证方式：`spec/workflow/04-verification/README.md`
- 当前可执行动作：`spec/workflow/05-tasks/README.md`

### Knowledge

- 长期稳定的术语、角色、实体、产品边界：`spec/knowledge/context/`
- 长期稳定的模块边界、系统结构、集成关系：`spec/knowledge/structure/`
- 长期稳定的关键流程、规则、状态流转：`spec/knowledge/behavior/`
- 协议、schema、样例、fixtures、固定参考资料：`spec/knowledge/reference/`

### Changes

- 单次需求、bugfix、重构、流程变化：`spec/changes/active/<change-key>/`
- 已完成 change 语义入口：`spec/changes/completed/`
- PromptHub 当前真实归档目录：`spec/changes/archive/`
- 仅保留历史价值的旧变更资料：`spec/changes/legacy/`

### Records

- 未解决问题、风险、技术债：`spec/issues/`
- 项目默认规则：`spec/rules/`
- 版本级交付摘要：`spec/releases/`
- 架构决策记录：`spec/adr/`
- 项目级归档入口：`spec/archive/`

## PromptHub 当前稳定真相源

PromptHub 已经完成第一轮稳定文档迁移，当前长期真相源直接落在以下目录：

- `spec/workflow/*`：项目级背景、需求、设计、实施、验证与任务入口
- `spec/knowledge/context/`：长期稳定的角色、术语、产品边界
- `spec/knowledge/structure/`：长期稳定的结构、架构、模块边界
- `spec/knowledge/behavior/`：长期稳定的行为、规则、流程、状态流转
- `spec/knowledge/reference/`：平台矩阵、协议、schema、固定参考资料
- `spec/releases/`：发布规则与版本级交付摘要

## 当前规则

- 新增项目级文档统一写入 `spec/workflow/*`
- 根目录下不再保留重复的 `00-intake` ~ `05-tasks` 目录
- 根目录下不再保留 `spec/domains/`、`spec/architecture/`、`spec/logic/`、`spec/assets/` 旧稳定层

## 同步要求

- 目录结构变化时，必须同步更新 `spec-init.topology.yml`
- 目录结构变化时，必须同步更新 `README.md`
- 目录结构变化时，必须同步更新 `AGENTS.md`
- 文档边界变化时，必须同步更新本文件
