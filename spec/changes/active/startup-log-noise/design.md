# Design

## Boundaries

- Electron startup controls whether DevTools opens automatically.
- Vite config can suppress Browserslist stale-data warnings for local dev/build logs.
- `packages/db` owns migration backup behavior.

## Decisions

- DevTools should be opt-in during dev startup via `PROMPTHUB_OPEN_DEVTOOLS=1` or `ELECTRON_OPEN_DEVTOOLS=1`.
- Database pre-migration backups should only be created when the existing database appears to need schema work.
- Stale SQLite lock cleanup remains visible only when it actually removes a lock.

