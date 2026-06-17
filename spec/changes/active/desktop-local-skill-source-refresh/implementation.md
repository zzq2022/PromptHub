# Implementation

## Status

Implementation landed and targeted verification passed.

## Notes

- issue #129 bundled three local-source regressions; the confirmed root causes were in local source path resolution and custom-path scanning behavior
- `SkillInstaller.collectSkillDirs()` previously skipped the scan root itself and only checked child directories, so a custom local source pointing directly at a skill folder would not rescan that folder's `SKILL.md`
- `resolveRegistrySkillContent()` previously treated `source_url` as the local repo directory when reading `SKILL.md`; if a local source entry stored `source_url` or `content_url` as `/path/to/SKILL.md`, updates would read the wrong location and fall back to stale cached content
- the same file-vs-directory ambiguity was also a latent risk in other local read paths: project detail rendering could pass a `.../SKILL.md` source path into `readLocalFileByPath(...)`, and the main-process repo access layer assumed the provided base path was always a directory
- the hardening pass now normalizes local skill directories in renderer code and also makes the main-process by-path repo helpers tolerant of receiving a `.../SKILL.md` file path as their base input
- the project/source detail `Import to My Skills` action already uses `handleImportProjectSkill() -> importScannedSkills()` correctly; a regression test now locks that interaction so future changes do not break it silently

## Verification

- `pnpm exec vitest run tests/unit/main/skill-installer.test.ts tests/unit/stores/skill.store.test.ts tests/unit/components/skill-projects-view.test.tsx`
- `pnpm exec vitest run tests/integration/components/skill-ui.integration.test.tsx tests/unit/main/skill-installer.test.ts tests/unit/stores/skill.store.test.ts tests/unit/components/skill-projects-view.test.tsx`
- `pnpm lint`
