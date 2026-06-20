# Design

## Overview

1. **Desktop Sync Alignment**: Update `buildSkillSyncUpdateFromRepo` in `apps/desktop/src/main/services/skill-repo-sync.ts` to retrieve and check the parsed `name` field from the frontmatter of `SKILL.md` using `sanitizeImportedSkillDraft`. If `name` differs from the database entry, include it in the `UpdateSkillParams`.
2. **Web API Slug Exposure**:
   - Update `SkillCatalogRow` type in `packages/core/src/skillhub/types.ts` and `packages/db/src/skill.ts` to include `registry_slug?: string | null`.
   - Update `listShared`, `searchShared`, `listPrivateByOwner`, and `getOwnership` in `packages/db/src/skill.ts` to query and return `registry_slug`.
   - Update `toPublicSummary`, `toPrivateSummary` in `packages/core/src/skillhub/summary.ts` and `toDetail` in `apps/web/src/services/skill-catalog.service.ts` to map `registry_slug` to `slug` on the outgoing summaries and detail responses.
   - Add `slug?: string` to `SkillPublicSummary`, `SkillPrivateSummary`, and `SkillDetail` interfaces in `packages/shared/types/skillhub.ts`.
3. **Admin UI Helper**:
   - In `apps/web/src/client/pages/admin/AdminSkillReview.tsx` and `AdminSkillManage.tsx`, render `skill.id` in secondary monospace text inside the name column cell.

## Affected Areas

- **Data model**:
  - `packages/db/src/skill.ts` (query modifications to select `registry_slug`).
- **IPC / API**:
  - `/api/skillhub/public`, `/api/skillhub/public/search`, `/api/skillhub/public/:id` (Hono API routes).
- **Filesystem / sync**:
  - `apps/desktop/src/main/services/skill-repo-sync.ts` (mapping logic update).
- **UI / UX**:
  - `apps/web/src/client/pages/admin/AdminSkillReview.tsx` (secondary info text).
  - `apps/web/src/client/pages/admin/AdminSkillManage.tsx` (secondary info text).

## Tradeoffs

- None. Selecting `registry_slug` adds negligible overhead while making registry client resolution robust.
