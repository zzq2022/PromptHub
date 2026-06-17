# Proposal

## Why

Issue #129 reports three related regressions around local skill sources: updating a locally sourced skill fails, removing and reimporting a local source still shows stale content, and the source-detail sidebar import button does nothing.

## Scope

- identify why local source content is not refreshed from disk during update / reimport flows
- fix local source update detection and install/update execution
- fix source-detail "Import to My Skills" interaction for local scanned skills
- add regression tests that mirror the user workflow

## Risks

- local source updates share logic with registry/store updates, so changes may affect other store source types
- stale cached source entries can hide multiple bugs if not tested across remove/reload paths

## Rollback

- revert local source resolution changes and keep the current scan/store behavior

## Impacted User Flows

- update a skill imported from a local folder source
- remove and reimport a local folder source after editing `SKILL.md`
- import a scanned local skill from the source detail sidebar
