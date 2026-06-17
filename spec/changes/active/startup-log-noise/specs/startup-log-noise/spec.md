# Startup Log Noise Spec

## Requirements

- Dev startup MUST NOT open Chromium DevTools by default.
- Dev startup MUST allow explicit DevTools opening through an environment variable.
- Database initialization MUST NOT create a pre-migration backup when the existing database schema is already current.
- Database initialization MUST still create a pre-migration backup when a non-empty existing database needs migration.

