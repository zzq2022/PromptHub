# Proposal: Agent Shared Runtime

## Why

When creating multiple agent projects (e.g. myagentbot06, myagentbot07), the following problems occur:

1. **Session mixing**: Each agent project has its own `runtime/agent-runtime/` copy with a full Python environment. When gateway processes start, `WORKSPACE = Path(file).resolve().parent.parent` resolves relative to the runtime script location, not the agent project — causing session data to leak across projects.
2. **Port conflicts**: Gateway ports are assigned dynamically via port scanning (starting at 18780). Without deterministic allocation, port collisions cause gateway startup failures and immediate exits.
3. **Resource waste**: Each agent project duplicates ~12 Python source files and has its own venv (~100+ MB per project). With N agents this means N × full runtime copies.
4. **Maintenance burden**: Bug fixes or feature additions to the gateway must be replicated across every agent project's runtime copy.

**Target users:** Desktop app users who create and manage multiple agent projects.

**Expected outcome:** Single shared runtime, per-project port config via `config.json`, clear session isolation, and no resource duplication.

## Scope

- In scope:
  - Moving agent Python runtime to a shared location under `resources/agent-runtime/`
  - Adding `AGENT_WORKSPACE` env var to replace script-relative path resolution
  - Adding `gatewayPort` to `config.json` schema for deterministic port assignment
  - Updating `agent-gateway.ts` to pass `AGENT_WORKSPACE` and read port from config
  - Updating `run_gateway.py` and `health_check.py` to use `AGENT_WORKSPACE`
  - Agent template `config.json` updated with `gatewayPort` field
  - Migration logic: remove per-project `runtime/agent-runtime/` after verifying shared runtime exists
- Out of scope:
  - Backend window UI changes (each agent still gets its own `cmd.exe /c start` console window — confirmed unaffected)
  - Web/CLI agent runtime changes
  - Changing the gateway HTTP API surface
  - Cloud sync of agent config

## Risks

- **Migration for existing users**: Projects with existing `runtime/agent-runtime/` need cleanup; migration script must be idempotent and fail-safe
- **Python path resolution**: `AGENT_WORKSPACE` must be reliably set for every gateway spawn; missing value would cause silent wrong-path behavior
- **Port config conflicts**: If two config files declare the same `gatewayPort`, the second one should fail at startup with a clear error

## Rollback Thinking

- Shared runtime is additive: existing per-project runtimes can be restored by copying the shared runtime back
- `AGENT_WORKSPACE` env var is a clean addition with no side effects if unset (fallback to old behavior could be retained during transition)
- `gatewayPort: null` (or absent) falls back to current auto-scan behavior, so existing configs without the field continue to work
