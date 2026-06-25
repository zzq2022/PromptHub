# Skill Safety Scanner Architecture (`skill-safety-scan.ts`)

> **File**: `apps/desktop/src/main/services/skill-safety-scan.ts`  
> **Tests**: `apps/desktop/tests/unit/main/skill-safety-scan.test.ts`  
> **Shared Types**: `packages/shared/types/skill.ts`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Layers](#2-architecture-layers)
3. [Core Data Flow](#3-core-data-flow)
4. [Pattern-Based Scanning (Preflight)](#4-pattern-based-scanning-preflight)
5. [Repository File Scanning](#5-repository-file-scanning)
6. [Source URL Validation](#6-source-url-validation)
7. [AI-Powered Safety Scanning](#7-ai-powered-safety-scanning)
8. [Safety Level Derivation](#8-safety-level-derivation)
9. [Dependency Injection & Testability](#9-dependency-injection--testability)
10. [Design Patterns & Principles](#10-design-patterns--principles)
11. [Key Constants & Configuration](#11-key-constants--configuration)
12. [Future Considerations](#12-future-considerations)

---

## 1. Overview

The **Skill Safety Scanner** is a multi-layered security analysis system that evaluates AI skill packages (SKILL.md-based skills) for potentially malicious content before installation. It combines:

- **Regex-based pattern matching** for known dangerous patterns (blocked/high-risk/warning)
- **File structure analysis** for dangerous file types and persistence mechanisms
- **Source URL provenance validation** with SSRF protection via DNS resolution checks
- **AI-powered semantic analysis** using an LLM for contextual risk assessment

The scanner produces a `SkillSafetyReport` with a severity level (`safe` | `warn` | `high-risk` | `blocked`) and a set of findings with evidence.

---

## 2. Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    scanSkillSafety()                         │
│                   (entry point, orchestrator)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐   ┌──────────────────────────────┐  │
│  │  scanSourceUrls()   │   │   scanRepoFiles()            │  │
│  │  (provenance check) │   │   (file structure analysis)  │  │
│  └─────────┬───────────┘   └──────────────┬───────────────┘  │
│            │                              │                   │
│            └──────┬───────────────────────┘                   │
│                   ▼                                          │
│        ┌──────────────────┐                                  │
│        │ Preflight        │                                  │
│        │ Findings Array   │                                  │
│        └────────┬─────────┘                                  │
│                 │                                            │
│                 ▼                                            │
│        ┌──────────────────┐                                  │
│        │   runAIScan()    │  ◄── AI_SAFETY_SYSTEM_PROMPT     │
│        │   (LLM analysis) │       buildAIUserPrompt()        │
│        └────────┬─────────┘       buildPackagePromptContent()│
│                 │                 parseAIReport()             │
│                 ▼                                            │
│        ┌──────────────────┐                                  │
│        │ SkillSafetyReport │                                  │
│        └──────────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Core Data Flow

### 3.1 Entry Point: `scanSkillSafety()`

```typescript
export async function scanSkillSafety(
  input: SkillSafetyScanInput,
  deps: ScanDeps = {},
): Promise<SkillSafetyReport>
```

**Flow**:

1. **Validate AI configuration** — throws `AI_NOT_CONFIGURED` if `apiKey`, `apiUrl`, or `model` are missing
2. **Read local repo files** (if `localRepoPath` provided) — delegates to injected `readRepoFiles` (default: `readRepoFilesFromPath`)
3. **Run repo file scanning** (`scanRepoFiles`) — produces `repoFindings`
4. **Run source URL validation** (`scanSourceUrls`) — produces `preflightFindings`
5. **Merge** all preflight findings (URL + repo)
6. **Block early** if source resolves to internal address AND no local repo path exists (throws `SAFETY_SCAN_BLOCKED_SOURCE_ERROR`)
7. **Delegate to AI scan** (`runAIScan`) — passes all context to the LLM for final assessment

### 3.2 Key Interfaces

```typescript
interface SkillSafetyScanInput {
  name?: string;
  content?: string;              // SKILL.md content
  sourceUrl?: string;
  contentUrl?: string;
  localRepoPath?: string;        // Absolute path to cloned repo
  securityAudits?: string[];     // Marketplace audit metadata
  aiConfig: SafetyScanAIConfig;  // LLM provider config
}

interface SkillSafetyReport {
  level: SkillSafetyLevel;       // "safe" | "warn" | "high-risk" | "blocked"
  findings: SkillSafetyFinding[];
  recommendedAction: "allow" | "review" | "block";
  scannedAt: number;
  checkedFileCount: number;
  summary: string;
  scanMethod: "ai";
}

interface SkillSafetyFinding {
  code: string;                  // kebab-case identifier
  severity: "info" | "warn" | "high";
  title: string;                 // Short one-line title
  detail: string;                // Explanation of risk
  evidence?: string;             // Specific triggering text (max 160 chars)
  filePath?: string;             // Source file, if applicable
}
```

---

## 4. Pattern-Based Scanning (Preflight)

Three tiers of regex pattern rules, evaluated in priority order:

### 4.1 BLOCK_PATTERNS (severity: high → blocked level)

| Code | Pattern | Detection |
|------|---------|-----------|
| `shell-pipe-exec` | `curl\|wget ... \| sh\|bash\|zsh\|fish\|pwsh\|powershell` | Pipe-to-shell execution |
| `dangerous-delete` | `rm -rf /`, `rm -rf ~/`, `rm -rf $VAR/`, `rm -rf *` | Destructive delete targeting root/wildcard |
| `encoded-powershell` | `powershell\|pwsh ... -enc\|-encodedcommand` | Encoded PowerShell execution |
| `encoded-shell-bootstrap` | `base64 ... -d\|--decode ... \| sh\|bash\|zsh\|python\|node` | Encoded payload decoded and piped to shell |

### 4.2 HIGH_RISK_PATTERNS (severity: high)

| Code | Pattern | Detection |
|------|---------|-----------|
| `privilege-escalation` | `sudo` | Elevated execution |
| `system-persistence` | `launchctl\|systemctl\|service ...\|crontab\|schtasks` | Persistence/service manipulation |
| `secret-access` | `.env`, `id_rsa`, `id_ed25519`, `.ssh/`, `aws/credentials`, `.npmrc`, `.pypirc` | Credential file reads |
| `security-bypass` | `disable\|bypass\|suppress\|ignore ... approval\|permission\|sandbox\|security` | Security bypass instructions |
| `network-exfil` | (secret pattern) + ... + `curl\|wget\|scp\|rsync\|nc\|ftp` | Credential + upload combo |

### 4.3 WARN_PATTERNS (severity: warn)

| Code | Pattern | Detection |
|------|---------|-----------|
| `exec-bit` | `chmod ... 777\|755\|+x` | Permission changes |
| `network-bootstrap` | `curl\|wget\|Invoke-WebRequest` | Downloading remote resources |
| `env-mutation` | `.zshrc\|.bashrc\|.profile\|export VAR=` | Shell rc/env modification |

### 4.4 False Positive Mitigation: `shouldIgnoreRuleMatch()`

Currently handles one case:
- `secret-access`: ignores matches where `.env` appears in context of `process.env` or `import.meta.env` (common development patterns)

### 4.5 Matching Mechanics: `extractMatches()`

- Creates a global regex from any input pattern
- Collects up to **3 matches** per rule
- Each match truncated to **160 characters**
- Uses `matchAll()` for global matching

---

## 5. Repository File Scanning

### 5.1 File Discovery: `readRepoFilesFromPath()`

- **Max depth**: 5 levels (`MAX_SCAN_DEPTH`)
- **Max files**: 200 (`MAX_SCAN_FILES`)
- **Max text file size**: 256 KB (`MAX_TEXT_FILE_BYTES`)
- **Symlink handling**: skipped (symbolic links are excluded)
- **Directory traversal guard**: verifies resolved paths stay within base directory (anti-symlink-escape)
- Returns `SkillLocalFileEntry[]` with relative paths

### 5.2 Scan Logic: `scanRepoFiles()`

Checks each file (excluding internal skill repo entries) for:

1. **Persistence files** (high severity): `.github/workflows`, `LaunchAgents`, `LaunchDaemons` in path
2. **High-risk binary extensions** (high severity): `.exe`, `.dll`, `.dylib`, `.so`, `.app`, `.pkg`, `.msi`, `.bat`, `.cmd`, `.ps1`, `.psm1`, `.jar`
3. **Script files** (warn severity): `.sh`, `.bash`, `.zsh`, `.fish`, `.py`, `.rb`, `.js`, `.ts`, `.ps1`, `.bat`, `.cmd` (excluding `SKILL.md` itself)
4. **Text content scanning**: All non-binary text files are scanned against all pattern rules

---

## 6. Source URL Validation

### 6.1 `scanSourceUrls()`

Validates both `sourceUrl` and `contentUrl` from the input:

1. **Missing URLs** → `unknown-source` (warn) if no local repo path either
2. **Malformed URLs** → `invalid-source-url` (warn)
3. **Non-HTTPS** → `insecure-source-url` (warn)
4. **Untrusted host** → `untrusted-source-host` (warn) — host is not in `TRUSTED_HOSTS` set (`github.com`, `raw.githubusercontent.com`, `skills.sh`)
5. **DNS resolution to internal/blocked address** → `internal-source`:
   - **Without local repo**: high severity → throws `SAFETY_SCAN_BLOCKED_SOURCE_ERROR` (hard block)
   - **With local repo**: warn severity (can still scan local files, but provenance flagged)

### 6.2 SSRF Protection

Uses `resolvePublicAddress()` from `skill-installer-remote.ts` to resolve hostnames and detect internal/private IP addresses. This prevents SSRF attacks where a skill declares a source URL pointing to internal network resources.

---

## 7. AI-Powered Safety Scanning

### 7.1 System Prompt (`AI_SAFETY_SYSTEM_PROMPT`)

A comprehensive LLM system prompt (~200 lines) that defines:

- **Output schema**: JSON with `level`, `findings[]`, `summary`
- **10 risk categories** to check:
  1. Shell injection / arbitrary code execution
  2. Privilege escalation
  3. Data exfiltration
  4. Persistence mechanisms
  5. Destructive commands
  6. Social engineering
  7. Prompt injection
  8. Obfuscation
  9. Network risks
  10. File system manipulation
- **Canonical finding codes**: Predefined codes for consistent reporting
- **Level assignment rules**: Blocked → high-risk → warn → safe
- **Anti-false-positive guidance**: Common dev patterns (`git clone`, `npm install`, `pip install`) are NOT inherently dangerous
- **Output format**: Strict JSON only, no markdown fences expected (though stripped if present)

### 7.2 Prompt Builder: `buildAIUserPrompt()`

Builds a structured user prompt with these sections (in order):

1. **Skill Name**
2. **Source URL** / **Content URL**
3. **Marketplace Audit Metadata** (if present)
4. **Preflight Validation Findings** (formatted list from `formatPreflightFindings()`)
5. **SKILL.md Content** (in markdown code fence)
6. **Repository File Tree** (📁 for dirs, 📄 for files)
7. **Package Content Coverage** (stats about what was/wasn't included)
8. **Package File Contents** (file contents within budget)

### 7.3 Content Budget Management: `buildPackagePromptContent()`

Files are included in alphabetical order, subject to:

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_AI_PROMPT_CONTENT_CHARS` | 64 KB | Total user prompt content budget |
| `MAX_AI_FILE_CONTENT_CHARS` | 8 KB | Per-file content truncation limit |

- Files with content starting with `[` (like `[binary file]`, `[file too large]`) are metadata-only entries
- Files exceeding budget are counted as omitted
- A coverage summary is appended explaining what was truncated/omitted

### 7.4 AI Response Parsing: `parseAIReport()`

1. Strips markdown code fences (```json ... ```) if present
2. Parses JSON via `JSON.parse()`
3. Validates `level` against `SkillSafetyLevel` enum
4. Validates each finding (code, severity, title, detail required; evidence truncated to 160 chars)
5. Falls back to `buildSummary()` if `summary` field is empty/invalid
6. Deduplicates findings via `dedupeFindings()`

### 7.5 AI Call: `runAIScan()`

```typescript
const result = await aiChat(aiConfig, messages, {
  temperature: 0.2,
  maxTokens: 4096,
  responseFormat: { type: "json_object" },
});
```

- **Temperature**: 0.2 (low randomness for consistent security assessments)
- **Max tokens**: 4096 (enough for detailed findings)
- **Response format**: `json_object` (structured output)
- **Messages**: system prompt + user prompt

---

## 8. Safety Level Derivation

### 8.1 `deriveLevel()` (used for preflight summary)

| Condition | Level |
|-----------|-------|
| Contains `shell-pipe-exec`, `dangerous-delete`, `encoded-powershell`, `encoded-shell-bootstrap`, or `internal-source` | `blocked` |
| Any high severity findings | `high-risk` |
| Any warn severity findings | `warn` |
| No findings | `safe` |

### 8.2 Final Level

The final level is determined by the **AI scan** (not preflight), because:
> "AI remains the source of truth for the final report, while blocked internal sources fail before the model call."

Preflight findings are passed as **context/evidence** to the AI, but the AI makes the final level determination. The only exception is `internal-source` without a local repo path, which hard-blocks before the AI call.

---

## 9. Dependency Injection & Testability

### 9.1 `ScanDeps` Interface

```typescript
interface ScanDeps {
  now?: () => number;
  readRepoFiles?: (absolutePath: string) => Promise<SkillLocalFileEntry[]>;
  resolveAddress?: typeof resolvePublicAddress;
  aiChat?: typeof chatCompletion;
}
```

All external dependencies are injectable, making the module fully testable:

| Dependency | Default | Test Mock Strategy |
|-----------|---------|-------------------|
| `now` | `Date.now` | Control timestamps |
| `readRepoFiles` | `readRepoFilesFromPath` | Return controlled file lists |
| `resolveAddress` | `resolvePublicAddress` | Throw/succeed for DNS tests |
| `aiChat` | `chatCompletion` | Return mock AI responses |

### 9.2 Test Patterns (from test file)

The test suite demonstrates key patterns:

1. **Package context inclusion**: Verifies that non-SKILL.md package files (e.g., `docs/guide.md`, `references/policy.md`) are sent to the AI for analysis, not just SKILL.md and script files.

2. **Preflight findings passed to AI**: Confirms repository findings (`persistence-file`, `high-risk-binary`) appear in the AI prompt's "Preflight Validation Findings" section.

3. **Prompt budget truncation**: Tests that large repos (> 120 large files) are properly truncated with coverage notices, and the AI still receives a well-formed prompt within budget.

---

## 10. Design Patterns & Principles

### 10.1 Multi-Layered Defense

The scanner uses **defense in depth**:
1. **Static regex patterns** catch known-bad patterns with high precision
2. **File structure analysis** catches dangerous file types and persistence mechanisms
3. **Source URL validation with DNS resolution** prevents SSRF and provenance attacks
4. **AI semantic analysis** catches contextual threats that static patterns miss (social engineering, prompt injection, obfuscation)

### 10.2 Hard Preflight + Soft AI Final Review

- **Hard blockers**: `internal-source` without local repo → throws error before AI call
- **Soft evidence**: All other preflight findings are passed as context to the AI, which makes the final determination
- This prevents the AI from being the sole decider on clear-cut SSRF blocks while letting it make nuanced judgments on ambiguous cases

### 10.3 Deterministic Prompt Budget

- Content is included in **alphabetical order** (deterministic, reproducible)
- Per-file and total budgets are enforced with clear truncation/omission notices
- The AI is informed about coverage gaps so it can weigh incomplete context appropriately
- No randomness in prompt construction → deterministic testing

### 10.4 Facade Export Pattern

The scanner is exported as a single function `scanSkillSafety` that delegates to internal helpers. This follows the same pattern as `skill-installer.ts` which acts as a facade over multiple sub-modules.

### 10.5 Defensive Programming

- **Type guards**: `isValidSeverity()`, `isValidLevel()` validate AI responses at runtime
- **Safe defaults**: `buildSummary()` as fallback when AI summary is empty
- **Input sanitization**: Evidence truncated to 160 chars, file paths validated
- **Encoding safety**: `encodeURIComponent()` used for URL path segments
- **Symlink attack protection**: Real path comparison ensures files stay within base directory
- **Deduplication**: `dedupeFindings()` prevents duplicate findings via Set

### 10.6 Separation of Concerns

| Concern | Module/Function |
|---------|----------------|
| Text pattern matching | `BLOCK_PATTERNS`, `HIGH_RISK_PATTERNS`, `WARN_PATTERNS` + `scanTextContent()` |
| File system walking | `readRepoFilesFromPath()` |
| File structure analysis | `scanRepoFiles()` |
| URL/DNS validation | `scanSourceUrls()` |
| AI prompt construction | `buildAIUserPrompt()` + `buildPackagePromptContent()` |
| AI response parsing | `parseAIReport()` |
| Orchestration | `scanSkillSafety()` |

---

## 11. Key Constants & Configuration

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_SCAN_DEPTH` | 5 | Directory walk depth |
| `MAX_SCAN_FILES` | 200 | Max files to scan |
| `MAX_TEXT_FILE_BYTES` | 256 KB | Max readable text file size |
| `MAX_AI_PROMPT_CONTENT_CHARS` | 64 KB | AI prompt content budget |
| `MAX_AI_FILE_CONTENT_CHARS` | 8 KB | Per-file AI content limit |
| `AI_TEMPERATURE` | 0.2 | LLM temperature for consistent assessment |
| `AI_MAX_TOKENS` | 4096 | LLM max output tokens |
| `TRUSTED_HOSTS` | `github.com`, `raw.githubusercontent.com`, `skills.sh` | Known marketplace hosts |
| `HIGH_RISK_FILE_EXTENSIONS` | `.exe`, `.dll`, `.dylib`, `.so`, `.app`, `.pkg`, `.msi`, `.bat`, `.cmd`, `.ps1`, `.psm1`, `.jar` | Binary executables |
| `SCRIPT_FILE_EXTENSIONS` | `.sh`, `.bash`, `.zsh`, `.fish`, `.py`, `.rb`, `.js`, `.ts`, `.ps1`, `.bat`, `.cmd` | Scriptable files |

---

## 12. Future Considerations

1. **Signature-based caching**: If the same skill version is scanned repeatedly, the report could be cached (keyed on `directory_fingerprint` + AI config hash).

2. **Fine-grained severity mapping**: Currently all `BLOCK_PATTERNS` findings are severity "high". Some (e.g., `dangerous-delete`) could be more severe than others.

3. **User override workflow**: `blocked` findings today only produce a report. The installation UI/workflow needs to handle allowing blocked skills after user review.

4. **Multi-model support**: The `SafetyScanAIConfig` includes `provider` and `apiProtocol` fields for future multi-LLM support. Currently uses `chatCompletion()` which routes based on config.

5. **Expanded false positive mitigation**: `shouldIgnoreRuleMatch()` currently only handles `process.env`. More patterns could be added (e.g., `npm install -g` for `privilege-escalation` false positives).

6. **Progressive scanning**: The scanner could scan metadata first, then content, then repo — returning early if blocked at any stage, to save AI API costs.
