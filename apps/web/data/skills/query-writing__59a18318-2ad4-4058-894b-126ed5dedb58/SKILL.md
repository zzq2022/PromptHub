---
name: query-writing
description: "Write and execute SQL queries to answer user questions about the database"
---

# Query Writing Skill

## When to Use
- User asks a question that requires querying the database
- User wants to analyze, count, aggregate, or compare data
- User requests data comparison, ranking, or trend analysis

## Workflow11111

### Step 1: Understand the Question
Identify what tables and columns are needed by:
- Rephrasing the user's question in your own words
- Listing the entities (nouns) mentioned
- Identifying what analysis is needed (count, sum, average, comparison, etc.)

**If unsure about schema → Use the `scripts/check_schema.py` helper**
(If that script is unavailable, manually run: `query_db(sql="SELECT name FROM sqlite_master WHERE type='table'")` to list tables, then `query_db(sql="PRAGMA table_info(TABLE_NAME)")` to inspect columns)

Decision tree for schema uncertainty: