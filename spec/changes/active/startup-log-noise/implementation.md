# Implementation

## Shipped

- Added a startup DevTools policy that keeps DevTools closed by default in dev and opens it only when `PROMPTHUB_OPEN_DEVTOOLS=1` or `ELECTRON_OPEN_DEVTOOLS=1` is set.
- Updated desktop startup to use that policy, which avoids Chromium DevTools internal console noise during normal dev startup.
- Changed stale SQLite lock cleanup to log only when a lock directory actually existed and was removed.
- Changed pre-migration backup behavior so current databases are not backed up on every startup. Legacy/non-current databases still get a backup before migration.
- Suppressed Browserslist stale-data warnings in the desktop Vite configs.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/database-migration-locks.test.ts tests/unit/main/devtools-policy.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop build`
- `git diff --check -- packages/db/src/init.ts apps/desktop/src/main/index.ts apps/desktop/vite.config.ts apps/desktop/vite.web.config.ts apps/desktop/tests/unit/main/database-migration-locks.test.ts apps/desktop/tests/unit/main/devtools-policy.test.ts spec/changes/active/startup-log-noise`

## Notes

- The Vite CJS Node API deprecation warning can still appear in Vitest output. It is a separate tooling migration issue and was not part of the Electron startup noise shown in the user report.
