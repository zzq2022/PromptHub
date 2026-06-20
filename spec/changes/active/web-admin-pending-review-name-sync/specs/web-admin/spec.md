# Spec: Web Admin Pending Review Name Sync & UX Polish

## Scenarios

### Scenario 1: Sync Name from Frontmatter during local repo sync
- **Given** a skill exists in the desktop database with name `"ae350158-00fe-4aeb-ad83-d63a033c758f"` (UUID).
- **And** the local managed `SKILL.md` contains frontmatter with `name: "skill-creator"`.
- **When** the desktop app triggers `syncFromRepo` on this skill.
- **Then** the database skill record is updated, setting the `name` column to `"skill-creator"`.

### Scenario 2: Return slug in SkillHub Public APIs
- **Given** a public skill has `registry_slug` set in the database (e.g. `"skill-creator"`).
- **When** a client fetches `/api/skillhub/public`, `/api/skillhub/public/search`, or `/api/skillhub/public/:id`.
- **Then** the JSON payload contains the `slug` field set to `"skill-creator"`.

### Scenario 3: Admin reviews list shows UUID as secondary identifier
- **Given** the admin reviews list contains pending skills.
- **When** the admin loads the review dashboard page.
- **Then** each skill row displays the skill ID/UUID underneath its name as secondary text in monospace font, helping to trace any UUID/naming discrepancy.
