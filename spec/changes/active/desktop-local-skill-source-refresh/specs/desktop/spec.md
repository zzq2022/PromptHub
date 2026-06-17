# Desktop Spec Delta

## Modified

### Requirement: Local source skill refresh

Skills imported from local folder sources MUST refresh from the latest on-disk `SKILL.md` when the user updates or reimports them.

#### Scenario: Update local source skill after editing SKILL.md

- Given a skill was imported from a local source folder
- And the user edits that folder's `SKILL.md`
- When the user requests an update from the local source detail view
- Then PromptHub reads the latest on-disk `SKILL.md` and creates an updated skill version instead of failing or reusing stale content

#### Scenario: Remove and reimport local source skill

- Given a local source entry remains connected after a prior import is removed
- When the user reimports that source skill
- Then PromptHub reads the latest on-disk `SKILL.md` rather than stale cached content

#### Scenario: Import from source detail sidebar

- Given the user opens a local scanned skill detail/sidebar view
- When they click `Import to My Skills`
- Then PromptHub imports that scanned skill into the library using the same scanned-skill import flow as the source list
