# Delta Spec: Agent Shared Runtime

## Core Constraint: Shared agent-venv

**Every agent project's gateway process MUST be started from the shared `agent-venv`.**

The Python virtual environment at `resources/agent-venv/` (bundled as `agent-venv/` in the built app) is a single, shared venv containing all gateway dependencies (FastAPI, uvicorn, pydantic, httpx, mem0ai, openai, etc.). Per-project venvs are explicitly forbidden — each agent project uses the same Python executable and site-packages.

This is already enforced in `agent-gateway.ts` via `findAgentPython(resourcesPath)`, which resolves to `resources/agent-venv/Scripts/python.exe` (Windows) or `resources/agent-venv/bin/python` (macOS/Linux). The venv is NOT part of the agent project directory; it lives in the app's resources bundle.

**Implications for the shared runtime:**
- The shared runtime code (at `resources/agent-runtime/`) must be compatible with the shared venv's Python version and installed packages.
- The gateway spawn command always uses the venv's Python: `pythonPath` from `findAgentPython()`, never system Python.
- `PYTHONPATH` is set to the venv's `site-packages` directory to ensure module resolution works regardless of the runtime script's physical location.
- `AGENT_WORKSPACE` (env var) tells the shared runtime code which agent project's data to operate on — this is the ONLY per-project differentiator in the Python process.

### Startup Flow

```
agent-gateway.ts
  ├── findAgentPython(resourcesPath)     → resources/agent-venv/Scripts/python.exe
  ├── Compute venvSitePackages            → resources/agent-venv/Lib/site-packages
  ├── Read config.json → gatewayPort      → per-agent port
  └── spawn(pythonPath, [gatewayScript], env: {
        AGENT_WORKSPACE: projectRootPath,    ← project isolation
        AGENT_PORT: port,
        PYTHONPATH: venvSitePackages,         ← shared venv resolution
        PROMPTHUB_PYTHON: pythonPath,         ← venv python path
        ...
      })
```

## Schema Changes

### `config.json` — Agent Project Config

```json
{
  "$schema": "...",
  "projectName": "myagentbot07",
  "gatewayPort": 18793,
  "theme": "sunset"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `gatewayPort` | `number \| null` | No | `null` | Deterministic port for the gateway. When `null`, falls back to auto-scan starting at 18780. Must be in range 18780–18999. |

**Validation rules:**
- If two active agent projects declare the same non-null `gatewayPort`, gateway startup for the second one must fail with a clear error message.
- If `gatewayPort` is `null` or absent, current auto-scan behavior is preserved (backward compatible).

## Filesystem Layout

### Before (per-project duplication)

```
agents/
├── myagentbot06/
│   └── runtime/
│       └── agent-runtime/       ← full copy per project
│           ├── run_gateway.py
│           ├── gateway_app.py
│           └── ...
└── myagentbot07/
    └── runtime/
        └── agent-runtime/       ← duplicate copy
            ├── run_gateway.py
            └── ...
```

### After (shared runtime + workspace isolation)

```
resources/
└── agent-runtime/               ← single shared copy
    ├── run_gateway.py
    ├── gateway_app.py
    ├── health_check.py
    └── skills/

agents/
├── myagentbot06/
│   ├── config.json              ← { "gatewayPort": 18793 }
│   ├── prompts/
│   ├── skills/
│   └── sessions/                ← only project-specific data
└── myagentbot07/
    ├── config.json              ← { "gatewayPort": 18794 }
    ├── prompts/
    ├── skills/
    └── sessions/
```

## Environment Variable Contract

The following env vars are passed by `agent-gateway.ts` when spawning each gateway process:

| Env Var | Source | Description |
|---------|--------|-------------|
| `AGENT_PORT` | `config.json → gatewayPort` or auto-scan | Port the gateway listens on |
| `AGENT_WORKSPACE` | `projectRootPath` | Absolute path to the agent project directory |
| `PROMPTHUB_PYTHON` | `agent-venv.ts` | Resolved Python executable path |
| `PYTHONPATH` | `venvSitePackages` | Python site-packages for the shared venv |
| `PYTHONUTF8` | Hardcoded `"1"` | Force UTF-8 output |
| `PYTHONIOENCODING` | Hardcoded `"utf-8"` | Force UTF-8 IO |
| `PYTHONUNBUFFERED` | Hardcoded `"1"` | Disable output buffering |

### Key Contract

`AGENT_WORKSPACE` replaces the old `Path(file).resolve().parent.parent` pattern in Python code:

```python
# BEFORE (fragile — depends on script location)
WORKSPACE = Path(__file__).resolve().parent.parent

# AFTER (explicit — driven by env var)
WORKSPACE = Path(os.environ["AGENT_WORKSPACE"])
```

Every Python module that previously used `WORKSPACE` from `config.py` is affected, but the interface (a `Path` object pointing to the agent project root) remains the same.

## Port Allocation Protocol

1. **Static config** (preferred): Read `gatewayPort` from `config.json`. If non-null, use it directly.
2. **Dynamic scan** (fallback): If `gatewayPort` is null/absent, scan from 18780 upward until a free port is found (existing behavior).
3. **Conflict detection**: Before spawning, check if the target port is already in use (health check URL). If so, throw a descriptive error instead of silently failing.

## Session Isolation

Session files are written to `AGENT_WORKSPACE/sessions/` by the Python gateway. Since `AGENT_WORKSPACE` is unique per agent project, session data is naturally isolated. No additional session-namespacing logic is needed.

## Migration

For existing agent projects that already have `runtime/agent-runtime/`:

1. Detect presence of `runtime/agent-runtime/` in the agent project.
2. If shared runtime exists at `resources/agent-runtime/`, delete the per-project copy.
3. If shared runtime does not exist, copy it there first, then delete the per-project copy.
4. Migration is idempotent: running it twice produces the same result.

## Concurrency

- Multiple gateway processes (one per agent) run simultaneously, each in its own `cmd.exe` window.
- Port conflicts are caught at startup via health check, not at runtime.
- Shared runtime files are read-only at runtime; no file locking is needed.
