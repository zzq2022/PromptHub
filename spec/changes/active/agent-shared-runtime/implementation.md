# Implementation: Agent Shared Runtime

## Shipped

### Phase 1–3: Core Infrastructure + Python Side + TypeScript Side

| Step | Status | Details |
|------|--------|---------|
| Create `resources/agent-runtime/backend/workspace.py` | ✅ | Single source of truth: `get_workspace()` reads `AGENT_WORKSPACE` env var, falls back to `__file__.parent.parent` |
| Update all Python modules to use `get_workspace()` | ✅ | `run_gateway.py`, `gateway_app.py`, `memory/manager.py`, `session/manager.py`, `tools/skills_manager.py`, `backend/api/chat.py`, `backend/api/mcp.py`, `backend/api/health.py` |
| Move `run_gateway.py` and `stop_gateway.py` to `agent-runtime/` | ✅ | Shared across all agent projects, reads `AGENT_WORKSPACE` instead of `Path(__file__).resolve().parent.parent` |
| Update `agent-gateway.ts` to use shared runtime | ✅ | Script path → `resources/agent-runtime/run_gateway.py`, env vars: `AGENT_WORKSPACE: projectRootPath`, `AGENT_PORT: config.gatewayPort \|\| auto` |
| Fix Windows spawn: spawn Python directly | ✅ | Removed `cmd.exe /c start` which created orphan zombie processes; now spawns Python directly on all platforms for proper PID tracking and lifecycle management |
| Trim `agent-template` | ✅ | Removed `backend/`, `libs/`, `run_gateway.py`, `stop_gateway.py` — only per-project files remain |
| Add `agent-runtime` to `electron-builder.json` | ✅ | Included in `extraResources` for packaged builds |
| Config schema: `gatewayPort` field | ✅ | Already in `config.json` template with default `18793` |

### Architecture Summary

```
resources/
├── agent-runtime/               ← single shared copy (code)
│   ├── run_gateway.py
│   ├── stop_gateway.py
│   ├── backend/
│   │   ├── workspace.py         ← get_workspace() = SINGLE SOURCE OF TRUTH
│   │   ├── gateway_app.py
│   │   ├── app.py
│   │   └── ...
│   ├── libs/
│   │   ├── logger_setup.py
│   │   └── llm_config.py
│   └── skills/
├── agent-template/              ← per-project template (config + data only)
│   ├── agent.py
│   ├── config.json
│   ├── skills/
│   ├── sessions/
│   └── memory/
└── agent-venv/                  ← shared Python venv

env vars per process:
  AGENT_WORKSPACE = projectRootPath   ← isolation boundary
  AGENT_PORT      = 18793
  PYTHONPATH      = venv site-packages
```

### Key Design Decision: `workspace.py`

`backend/workspace.py` is the **single source of truth** for `WORKSPACE`:

```python
# backend/workspace.py
WORKSPACE = Path(os.environ["AGENT_WORKSPACE"])   # primary path
# fallback only for standalone testing
```

Every Python module imports `WORKSPACE` from `backend.workspace`, eliminating the fragile `Path(__file__).resolve().parent.parent` pattern.

## Verification

_(待实现后填写)_

## Synced Docs

_(待实现后填写)_

## Follow-ups

- 后端窗口标题增强:加入端口号显示 `Agent: myagentbot07 [:18794]`
- `agents/myagentbot07/config.json` 用户手动编辑端口时的 UI 验证提示
- 考虑添加 `pnpm agent:ports` 命令显示所有 agent 的端口分配状态
