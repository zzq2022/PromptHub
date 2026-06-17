# Design

## Summary

Trace local-source registry entries back to disk on every update/reimport operation instead of trusting stale in-memory content. Ensure source-detail install actions reuse the same scanned-skill import path as the project/source list.

## Modules

- `apps/desktop/src/renderer/stores/skill.store.ts`
  - local source resolution for update/install/reimport
  - installed skill matching for local sources
- `apps/desktop/src/renderer/services/skill-store-update.ts`
  - update status computation for local source entries
- `apps/desktop/src/renderer/components/skill/SkillStoreDetail.tsx`
  - update/import action behavior for local source detail
- `apps/desktop/src/renderer/components/skill/ProjectSkillPreviewSidebar.tsx`
  - source detail import button integration

## Validation

- regression tests covering: local update, remove+reimport reads latest `SKILL.md`, and source-detail import button
- targeted lint + tests
