# TDD and Design Gate

This rule applies to bug fixes, new features, refactors with behavior impact, and data/API/storage changes.

## Principle

PromptHub changes must be design-aware and test-first. The agent should not "just finish the code" when it has not understood the current boundary, cannot prove the bug, or discovers a design conflict.

## Required Sequence

1. Understand the current boundary:
   - read the owning code path
   - read relevant `spec/knowledge/*`, `spec/rules/*`, and active change records
   - identify the canonical source of truth
2. Classify the change:
   - bug fix
   - new behavior
   - behavior-preserving refactor
   - data/API/storage change
3. Write or update the failing test first:
   - bug: reproduce the escaped failure or invariant violation
   - feature: encode acceptance behavior and at least one boundary/error path
   - refactor: protect existing behavior before moving code
4. Define the coverage and harness target before implementation:
   - new/changed production code targets 100% line, function, branch, and condition coverage
   - critical boundary code must include black-box behavior tests, white-box branch tests, boundary/fuzz tests, failure/rollback tests, and stress/performance tests where relevant
   - any legacy branch that remains uncovered must be recorded in the active change with a follow-up task
5. Implement the smallest design-consistent change.
6. Run the lowest effective test layer, coverage command when available, then the relevant harness when release risk exists.
7. Record what was verified, what coverage was achieved, and what was skipped.

## What Counts As A Real Test

A real test can fail for the bug or missing behavior. It asserts observable results:

- returned values that matter
- database rows or migrations
- filesystem side effects
- IPC/API responses and validation errors
- visible UI state
- sync/import/export payloads
- status after reload, rescan, or reopen

Mock call counts, snapshot churn, and `toBeDefined()`-style assertions do not satisfy TDD unless paired with a meaningful observable post-condition.

## Coverage Gate

Coverage must be used as a regression guard for the code being changed:

- 100% line coverage for touched production lines.
- 100% function coverage for touched exported and internal functions.
- 100% branch coverage for touched branches.
- 100% condition coverage for compound boolean decisions.

Do not lower the bar because a full legacy file is currently below 100%. Instead, isolate the changed behavior, add focused tests for every new/changed branch, and record any unrelated legacy gap in the active change.

## Test Method Gate

Coverage alone is not sufficient. Before implementation, identify which methods are required for the risk:

- Black-box behavior tests for user-visible outputs and durable state.
- White-box tests for each changed branch, guard, fallback, and compound condition.
- Boundary/fuzz tests for malformed, adversarial, extreme, duplicate, Unicode, and path-like inputs.
- Security tests for trust boundaries, source validation, traversal, injection, symlinks, secrets, and tamper behavior.
- Performance/stress tests for large data, large file trees, repeated operations, and concurrency-like execution.
- Integration/contract tests for DB, filesystem, IPC/preload, CLI/API, sync, and platform boundaries.
- Failure/rollback tests for every external side effect that can partially succeed.

Record omitted methods explicitly with a reason. "The coverage is already high" is not a valid reason to omit a relevant test method.

## Design Conflict Rule

When design conflict appears, stop implementation and ask the user. Design conflict includes:

- docs and code disagree
- two plausible designs have different data/user consequences
- source-of-truth ownership would change
- backward compatibility requires migration or fallback
- an existing active change defines a different direction
- a quick fix would violate module boundaries

The active change must record the conflict and options. Do not silently choose one path.

## Exceptions

Test-first can be skipped only for:

- documentation-only changes
- formatting-only changes
- mechanical renames with no behavior impact
- emergency hotfixes where the skipped test is recorded and added immediately after

Even in these cases, design conflicts must still be surfaced.
