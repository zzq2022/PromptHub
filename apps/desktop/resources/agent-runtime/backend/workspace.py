"""Shared workspace resolution — single source of truth for AGENT_WORKSPACE.

All backend modules import get_workspace() from here instead of computing
Path(__file__).resolve().parent... relative paths.

The gateway startup script (run_gateway.py) sets AGENT_WORKSPACE env var to
point to the per-agent project directory (where config.json, sessions/, etc. live).
"""

from __future__ import annotations

import os
from pathlib import Path


def get_workspace() -> Path:
    """Return the per-agent workspace directory.

    Reads the AGENT_WORKSPACE environment variable set by the TypeScript
    gateway launcher. Falls back to the runtime directory itself for
    backward-compatibility during development.
    """
    env = os.environ.get("AGENT_WORKSPACE")
    if env:
        return Path(env)
    # Fallback: runtime directory (for backward compat / manual testing)
    return Path(__file__).resolve().parent.parent
