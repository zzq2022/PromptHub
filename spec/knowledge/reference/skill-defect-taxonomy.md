# Skill Defect Taxonomy

This document classifies escaped Skill-system bugs by defect type. It is intentionally more abstract than individual regression cases.

## Why This Exists

The reported Skill bugs are not mainly a lack of one-off test cases. They show repeated failure modes in how the system models state, lifecycle, source identity, filesystem fidelity, and UI derivation.

Future Skill TDD should start by classifying the bug into one or more defect types below, then choosing representative regression tests for that type.

## Defect Types

### SDT-001 State Source Divergence

Definition: two UI surfaces or services derive the same concept from different sources of truth.

Symptoms:

- detail view says installed but list view says not installed
- store tab count differs from header/card count
- project tab does not reflect platform/project installation state

Required prevention:

- define one selector/service as the canonical source for the state
- test at least two surfaces consuming the same state after install/update/delete/reload
- include stale-cache and reload/rescan scenarios

### SDT-002 Lifecycle Asymmetry

Definition: create/install paths exist but the matching delete/uninstall/rollback paths are incomplete.

Symptoms:

- install works but uninstall is missing
- deleting a skill leaves platform symlinks or activation records
- project distribution can deploy but cannot undeploy

Required prevention:

- every install/distribute/write operation must have a tested inverse
- tests must assert both persisted state and external side effects are removed
- TDD must include failure/partial-success cleanup behavior

### SDT-003 Data Fidelity Loss

Definition: import/export/sync preserves only a simplified representation and silently drops durable user data.

Symptoms:

- custom Git/Gitea install only keeps `SKILL.md`
- nested files, docs, assets, or scripts disappear
- file browser cannot reveal nested repository content

Required prevention:

- fixtures must include full directory trees, not just one markdown file
- tests must compare expected file inventory before and after import/export/sync
- ignore rules must be explicit and tested

### SDT-004 Identity Mismatch

Definition: installed/imported/deployed state is matched by unstable identity such as name or current path instead of durable source identity.

Symptoms:

- installed store skill does not show as imported
- same-name variants collide or show wrong status
- custom store and official store versions cannot be distinguished

Required prevention:

- state matching must use durable identity fields such as `source_id`, canonical path, source URL, branch, directory, and local repo identity
- tests must include same-name/different-source fixtures
- UI status must survive reload and source refresh

### SDT-005 Policy Boundary Misclassification

Definition: security or source policy blocks a valid managed source, or permits an invalid unmanaged source, because trust context is not modeled.

Symptoms:

- managed custom Git/Gitea skill cannot be safety-scanned
- local managed repo is treated like an unsafe remote URL
- internal-source blocking is applied without considering already-imported managed content

Required prevention:

- policy tests must cover managed custom source, unmanaged external source, internal/private network source, and local repo source separately
- tests must assert the reason code, not only pass/fail
- source trust context must be part of the input contract

### SDT-006 Derived View Inconsistency

Definition: counts, badges, filters, empty states, and card lists are computed by different filters or stale snapshots.

Symptoms:

- side tab shows 54 but page header shows 0
- empty state appears while a tab badge claims items exist
- filtered list and stats disagree

Required prevention:

- counts and rendered items must come from the same selector
- tests must assert count, empty state, and rendered card list together
- large dataset tests must verify the same invariants as small fixtures

### SDT-007 Capability Surface Gap

Definition: a user-visible entity can be created or viewed, but the expected management capabilities are unavailable in that context.

Symptoms:

- project skill can be installed but not uninstalled
- agent-centric inventory is missing
- project skill tags cannot be managed for copied and symlinked skills

Required prevention:

- each domain entity view must define required capabilities: view, tag, install, uninstall, rescan, open files, inspect source
- tests must cover capability availability by context, not just data rendering
- copy and symlink modes must both be represented

### SDT-008 Recursive Interaction Gap

Definition: tests cover first-level rendering or action only, while real user workflows require recursive/deeper interaction.

Symptoms:

- file browser lists folders but cannot expand nested folders
- scan detects top-level skill but not nested project skills
- import handles root content but not nested resources

Required prevention:

- fixtures must include at least two nested levels
- UI tests must perform the second-level interaction, not only assert the first-level node exists
- service tests must assert normalized relative paths at each depth

## Applying the Taxonomy

For every Skill bugfix or feature:

1. Assign one or more `SDT-*` defect types.
2. State the canonical source of truth being protected.
3. Pick the lowest effective test layer for the defect type.
4. Add a regression test that checks the observable invariant, not only internal calls.
5. Record the mapping in the active change `implementation.md`.

## Mapping The Reported Bugs

| Reported Item | Defect Type |
|---|---|
| Store install not shown as imported | SDT-001, SDT-004 |
| Custom Gitea import loses directories | SDT-003, SDT-008 |
| Delete leaves symlink | SDT-002 |
| Custom Gitea safety scan blocked | SDT-005 |
| Project distribution cannot uninstall | SDT-002, SDT-007 |
| Store tab/header count mismatch | SDT-006 |
| Detail installed but list gray | SDT-001, SDT-006 |
| File browser cannot expand folders | SDT-008 |
| Symlink project skills missing from project tab | SDT-001, SDT-004 |
| Missing agent-centric management entry | SDT-007 |
