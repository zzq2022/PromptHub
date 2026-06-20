# Implementation

## Status

Completed. All unit tests, type checking, and linting have passed successfully.

## Shipped In This Change

- 抽取 `getProjectDeployTargets` 导出至 `project-skill-targets.ts`，并让 `SkillFullDetailPage.tsx` 从公共服务导入。
- 在多语言包中添加 `selectProjects` 键。
- 在 `SkillQuickInstall.tsx` 中整合项目列表的获取、渲染及选择状态。
- 为项目软链接部署整合 `copyRepoByPathToDirectory` 以及自动重扫（`scanProjectSkills` / `updateSkillProject`）。
- 增加了对应的单元测试文件 `tests/unit/components/skill-quick-install.test.tsx`。
