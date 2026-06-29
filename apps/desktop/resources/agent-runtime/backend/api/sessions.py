#!/usr/bin/env python3
"""Session management API — compress, clear, rename."""

import urllib.parse
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

from backend.workspace import get_workspace

WORKSPACE = get_workspace()


class RenameRequest(BaseModel):
    title: str


def _get_session_manager():
    """Lazy import to avoid circular imports."""
    from nanobot.session.manager import SessionManager
    return SessionManager(workspace=WORKSPACE)


def _normalize_key(session_key: str) -> str:
    """Ensure session key has websocket: prefix."""
    if not session_key.startswith("websocket:"):
        return f"websocket:{session_key}"
    return session_key


@router.post("/sessions/{session_key:path}/compress")
@router.get("/sessions/{session_key:path}/compress")
async def compress_session(session_key: str):
    """Compress a session by removing intermediate tool steps."""
    from backend.gateway_utils import slim_session
    full_key = _normalize_key(urllib.parse.unquote(session_key))
    removed_count = slim_session(WORKSPACE, full_key)
    
    # Invalidate long-lived in-memory cache of the active AgentLoop
    try:
        from backend.agent.manager import agent_manager
        agent_manager.loop.sessions.invalidate(full_key)
    except Exception as e:
        print(f"[WARN] Web Session 缓存失效执行失败: {e}")

    return {"status": "ok", "archived_count": removed_count, "remaining_count": 0}


@router.post("/sessions/{session_key:path}/clear")
@router.get("/sessions/{session_key:path}/clear")
async def clear_session(session_key: str):
    """Clear all messages in a session."""
    full_key = _normalize_key(urllib.parse.unquote(session_key))
    try:
        sm = _get_session_manager()
        session = sm.get_or_create(full_key)
        session.messages[:] = []
        sm.save(session)

        # Invalidate long-lived in-memory cache of the active AgentLoop
        try:
            from backend.agent.manager import agent_manager
            agent_manager.loop.sessions.invalidate(full_key)
        except Exception as e:
            print(f"[WARN] Web Session 缓存失效执行失败: {e}")

        return {"status": "ok", "session_id": session_key}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_key:path}/rename")
@router.get("/sessions/{session_key:path}/rename")
async def rename_session(session_key: str, title: str = ""):
    """Rename a session."""
    full_key = _normalize_key(urllib.parse.unquote(session_key))
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    try:
        sm = _get_session_manager()
        session = sm.get_or_create(full_key)
        session.title = title
        sm.save(session)

        # Invalidate long-lived in-memory cache of the active AgentLoop
        try:
            from backend.agent.manager import agent_manager
            agent_manager.loop.sessions.invalidate(full_key)
        except Exception as e:
            print(f"[WARN] Web Session 缓存失效执行失败: {e}")

        return {"status": "ok", "session_id": session_key, "title": title}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
