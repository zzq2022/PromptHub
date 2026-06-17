# Implementation log

## Wave 1 — UI primitives (12 / 12 planned)

Shipped:

- `tests/unit/components/modal.test.tsx` — 9 tests
- `tests/unit/components/confirm-dialog.test.tsx` — 7 tests
- `tests/unit/components/checkbox.test.tsx` — 5 tests
- `tests/unit/components/input.test.tsx` — 5 tests
- `tests/unit/components/textarea.test.tsx` — 7 tests (component + handleMarkdownListKeyDown helper)
- `tests/unit/components/unsaved-changes-dialog.test.tsx` — 4 tests
- `tests/unit/components/close-dialog.test.tsx` — 3 tests
- `tests/unit/components/context-menu.test.tsx` — 6 tests
- `tests/unit/components/image-preview-modal.test.tsx` — 5 tests
- `tests/unit/components/background-image-backdrop.test.tsx` — 3 tests
- `tests/unit/components/collapsible-thinking.test.tsx` — 6 tests
- `tests/unit/components/toast.test.tsx` — 4 tests

Notes during execution:

- The bundled jsdom environment does not return DOM nodes from
  `screen.getByRole("combobox")` for our custom `Select`. Wave 2 settings tests
  switched to `userEvent.click` on the trigger button + `findByText` on
  portal-rendered options, mirroring the pattern in the existing `select.test.tsx`.
- `textarea.test.tsx` originally miscounted insertion lengths in the
  Markdown-list helper assertions; corrected to match the actual implementation
  (`"\n- "` is 3 chars, `"\n3. "` is 4 chars, `"\n- [ ] "` is 7 chars).
- `Input.test.tsx` initial draft used a controlled `value=""` with manual
  `fireEvent.change`, which doesn't update the DOM value. Switched to
  `defaultValue=""` so the change handler reflects the user-entered string.

## Wave 2 — Domain views (7 / 18 planned)

Shipped this iteration:

- `tests/unit/components/prompt-list-header.test.tsx` — 4 tests
- `tests/unit/components/skill-store-card.test.tsx` — 7 tests
- `tests/unit/components/column-config-menu.test.tsx` — 4 tests
- `tests/unit/components/skill-batch-tag-dialog.test.tsx` — 5 tests
- `tests/unit/components/language-settings.test.tsx` — 3 tests
- `tests/unit/components/general-settings.test.tsx` — 4 tests
- `tests/unit/components/import-prompt-modal.test.tsx` — 5 tests

Deferred from the original plan (left for a follow-up change folder so this
work could land cleanly):

- `folder-tree.test.tsx` — `FolderTree.tsx` is now a stub re-exporting `null`;
  there is nothing meaningful to assert. Will remove from the plan.
- `prompt-list-view.test.tsx`, `prompt-kanban-view.test.tsx`,
  `prompt-table-view.test.tsx` — these views depend on multiple Zustand stores
  (`folder.store`, `prompt.store`, `settings.store`) plus the virtualizer mock.
  A useful test needs a render helper that wires those stores to in-memory
  state. Worth a dedicated change folder.
- `create-prompt-modal.test.tsx`, `edit-prompt-modal.test.tsx`,
  `prompt-detail-modal.test.tsx` — depend on AI client calls and folder store;
  same blocker as the views above.
- `skill-store-detail.test.tsx`, `skill-quick-install.test.tsx`,
  `skill-platform-panel.test.tsx` — heavy `useSkillPlatform` hook surface;
  appropriate to test once we extract the platform-state slice into a leaner
  hook. Out of scope for this change.
- `shortcuts-settings.test.tsx` — depends on `window.electron.getShortcuts`
  multiple-handler wiring; deferring until a `tests/helpers/shortcuts.ts`
  helper exists.

## Verification

- `pnpm --filter @prompthub/desktop test:unit`: **152 files / 1261 tests**, all
  passing (was 136 / 1165 before this change).
- `pnpm --filter @prompthub/desktop lint`: clean.
- File-level component test count: **67** (`*.test.ts` + `*.test.tsx`) vs. 41
  before this change — surpassing the ≥65 success target.

## Follow-up recommended

- A small `tests/helpers/store.ts` factory that snapshots & restores Zustand
  store state per test, so view-level tests can wire realistic seeded data
  without poking internals.
- A `tests/helpers/window-overrides.ts` helper that wraps the window mock
  installer for ad-hoc namespace stubs (we did this inline for
  `window.api.settings` in `general-settings.test.tsx`).
- After those helpers land, revisit the deferred Wave 2 items above.
