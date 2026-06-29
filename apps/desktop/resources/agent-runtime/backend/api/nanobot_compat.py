#!/usr/bin/env python3
"""Nanobot compatibility endpoints — session listing in nanobot's native format.

The frontend expects the nanobot native session list format from /api/sessions,
which returns sessions with keys like "websocket:alice__zzq_customers".
"""

from pathlib import Path

from fastapi import APIRouter

router = APIRouter()

from backend.workspace import get_workspace

WORKSPACE = get_workspace()


@router.get("/sessions")
async def list_sessions():
    """List all sessions in nanobot's native format.
    
    Returns sessions from the sessions/ directory, preserving the
    websocket: prefix key format the frontend expects.
    """
    try:
        from nanobot.session.manager import SessionManager
        sm = SessionManager(workspace=WORKSPACE)
        sessions = sm.list_sessions()
        return {"sessions": sessions}
    except Exception as e:
        return {"sessions": [], "error": str(e)}


@router.get("/sessions/{session_key:path}/messages")
async def get_session_messages(session_key: str):
    """Get messages for a session (nanobot native format)."""
    import urllib.parse
    session_key = urllib.parse.unquote(session_key)
    
    try:
        from nanobot.session.manager import SessionManager
        sm = SessionManager(workspace=WORKSPACE)
        session = sm.get_or_create(session_key)
        
        # Clean up memory injection headers to show only original user questions in UI
        from backend.gateway_utils import extract_question
        
        cleaned_messages = []
        for msg in session.messages:
            if isinstance(msg, dict):
                cleaned_msg = dict(msg)
                if cleaned_msg.get("role") == "user":
                    cleaned_msg["content"] = extract_question(cleaned_msg.get("content", ""))
                cleaned_messages.append(cleaned_msg)
            else:
                # Fallback if messages are objects rather than dicts
                cleaned_msg = msg
                if getattr(cleaned_msg, "role", None) == "user":
                    cleaned_msg.content = extract_question(getattr(cleaned_msg, "content", ""))
                cleaned_messages.append(cleaned_msg)

        return {"messages": cleaned_messages}
    except Exception as e:
        return {"messages": [], "error": str(e)}


@router.get("/sessions/{session_key:path}/delete")
async def delete_session(session_key: str):
    """Delete a session (nanobot uses GET for delete)."""
    import urllib.parse
    session_key = urllib.parse.unquote(session_key)
    
    try:
        from nanobot.session.manager import SessionManager
        sm = SessionManager(workspace=WORKSPACE)
        sm.delete_session(session_key)
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}
