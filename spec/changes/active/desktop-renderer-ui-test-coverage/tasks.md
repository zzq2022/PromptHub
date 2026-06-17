# Tasks

## Wave 1 — UI primitives

- [ ] `tests/unit/components/modal.test.tsx`
- [ ] `tests/unit/components/toast.test.tsx`
- [ ] `tests/unit/components/context-menu.test.tsx`
- [ ] `tests/unit/components/confirm-dialog.test.tsx`
- [ ] `tests/unit/components/close-dialog.test.tsx`
- [ ] `tests/unit/components/unsaved-changes-dialog.test.tsx`
- [ ] `tests/unit/components/checkbox.test.tsx`
- [ ] `tests/unit/components/input.test.tsx`
- [ ] `tests/unit/components/textarea.test.tsx`
- [ ] `tests/unit/components/image-preview-modal.test.tsx`
- [ ] `tests/unit/components/background-image-backdrop.test.tsx`
- [ ] `tests/unit/components/collapsible-thinking.test.tsx`

## Wave 2 — Domain views

- [ ] `tests/unit/components/folder-tree.test.tsx`
- [ ] `tests/unit/components/prompt-list-view.test.tsx`
- [ ] `tests/unit/components/prompt-kanban-view.test.tsx`
- [ ] `tests/unit/components/prompt-table-view.test.tsx`
- [ ] `tests/unit/components/prompt-list-header.test.tsx`
- [ ] `tests/unit/components/column-config-menu.test.tsx`
- [ ] `tests/unit/components/create-prompt-modal.test.tsx`
- [ ] `tests/unit/components/edit-prompt-modal.test.tsx`
- [ ] `tests/unit/components/import-prompt-modal.test.tsx`
- [ ] `tests/unit/components/prompt-detail-modal.test.tsx`
- [ ] `tests/unit/components/skill-store-card.test.tsx`
- [ ] `tests/unit/components/skill-batch-tag-dialog.test.tsx`
- [ ] `tests/unit/components/skill-store-detail.test.tsx`
- [ ] `tests/unit/components/skill-quick-install.test.tsx`
- [ ] `tests/unit/components/skill-platform-panel.test.tsx`
- [ ] `tests/unit/components/general-settings.test.tsx`
- [ ] `tests/unit/components/language-settings.test.tsx`
- [ ] `tests/unit/components/shortcuts-settings.test.tsx`

## Verification

- [ ] `pnpm --filter @prompthub/desktop test -- --run` passes (0 failures)
- [ ] `pnpm --filter @prompthub/desktop lint` passes
- [ ] File-level component test count ≥ 65 (current 40, target ≥65)
- [ ] No `as any`, no `@ts-ignore`, no `toMatchSnapshot()` for dynamic data
- [ ] Update `implementation.md` with the actual coverage delta and any tests
      we had to drop or rewrite during execution
