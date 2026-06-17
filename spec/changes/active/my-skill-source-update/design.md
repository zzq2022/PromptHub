# Design

## Boundary

The store remains the owner of installed skill source update decisions because it already owns registry skill comparison, install fingerprints, and local repo synchronization.

## Source Candidate Resolution

For an installed skill id:

1. Prefer a cached `RegistrySkill` candidate matched by `source_id`, `content_url`, or `source_url`.
2. If none exists, derive a temporary `RegistrySkill` candidate from the installed skill metadata.
3. For GitHub tree URLs, derive `content_url` as `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<directory>/SKILL.md`.
4. Keep fallback metadata conservative: installed name, description, author, category, source fields, and `version` as `"source"` because the raw GitHub file alone does not provide a reliable remote version.

## Update Semantics

The installed-source path reuses `getRegistrySkillUpdateStatus()`. Applying an update follows the existing registry update flow:

- create a version snapshot
- update SQLite skill fields and install fingerprint
- sync the managed local repo from the remote skill package where supported
- return the same status family as registry updates

## UI

The My Skills detail header gets a compact source update action for non-project/non-agent details. A first click checks. If an update is available, the next action applies it. Conflict/local-modified results are surfaced by toast and do not overwrite content by default.

## Compatibility

No schema or IPC contract changes are required. Existing skills without source metadata simply do not expose the source update action.
