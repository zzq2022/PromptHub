"""Gateway utilities — re-export shim for backward compatibility.

This module previously contained all gateway utilities in one file.
They have been split into focused modules:
  - backend/tools/query_db.py        — QueryDBTool
  - backend/agent/factory.py         — create_agent_loop, load_clean_config, register_tools
  - backend/session/ops.py           — slim_session, extract_memory, extract_question
  - backend/memory/loader.py         — load_user_memory

New code should import directly from those modules.
"""

from __future__ import annotations

# Re-export everything for backward compatibility
from backend.tools.query_db import QueryDBTool
from backend.agent.factory import create_agent_loop, load_clean_config, register_tools
from backend.session.ops import slim_session, extract_memory, extract_question
from backend.memory.loader import load_user_memory

__all__ = [
    "QueryDBTool",
    "create_agent_loop",
    "load_clean_config",
    "register_tools",
    "slim_session",
    "extract_memory",
    "extract_question",
    "load_user_memory",
]