#!/usr/bin/env python3
"""Nanobot AgentLoop wrapper — provides a clean interface for FastAPI endpoints."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parent.parent.parent  # project root
sys.path.insert(0, str(WORKSPACE / "libs"))

from libs.gateway_utils import (
    register_tools,
    slim_session,
    extract_memory,
    extract_question,
    load_clean_config,
    create_agent_loop,
    load_user_memory,
)

DB_PATH = WORKSPACE / "chinook.db"


class NanobotAgentManager:
    """Singleton manager that wraps nanobot AgentLoop for the FastAPI backend.

    Responsibilities:
    - Initialize the AgentLoop with tools and config
    - Process user messages with memory injection
    - Extract and store memories after each turn
    """

    def __init__(self) -> None:
        self._loop: Any = None
        self._config: Any = None
        self._initialized: bool = False

    def initialize(self, workspace: Path | None = None) -> None:
        """Initialize the agent once at startup.

        Applies essential patches and creates the AgentLoop.
        """
        if self._initialized:
            return

        ws = workspace or WORKSPACE

        self._config = load_clean_config(ws)
        self._config.agents.defaults.workspace = str(ws)

        self._loop = create_agent_loop(ws, DB_PATH)

        self._initialized = True
        print("[backend] NanobotAgentManager initialized")

    @property
    def loop(self) -> Any:
        """Access the underlying AgentLoop (used by WebSocket chat endpoint)."""
        if not self._initialized:
            raise RuntimeError("AgentManager not initialized. Call initialize() first.")
        return self._loop

    @property
    def config(self) -> Any:
        return self._config

    def parse_session_identity(self, session_key: str) -> tuple[str, str]:
        """Parse a compound session key into (user_id, session_name).

        Examples:
            'websocket:alice__zzq_customers' → ('alice', 'zzq_customers')
            'websocket:bob__session_123'     → ('bob', 'session_123')
            'websocket:anon-uuid'            → ('anon-uuid', 'anon-uuid')
        """
        path = session_key
        if ":" in session_key:
            path = session_key.split(":", 1)[1]
        if "__" in path:
            user_id, session_name = path.split("__", 1)
        else:
            user_id = path
            session_name = path
        return user_id, session_name

    def inject_memory(self, content: str, user_id: str) -> str:
        """Inject user long-term memory into the message content."""
        if "---\n用户当前问题：" in content or "---\nUser Question:" in content:
            return content

        user_memory = load_user_memory(user_id, "")
        if user_memory:
            content = (
                f"以下是用户 [{user_id}] 的长期记忆，供本次对话参考：\n\n"
                f"{user_memory}\n\n---\n用户当前问题：{content}"
            )
            print(f"[backend] Injected memory for user [{user_id}]")
        return content

    async def post_turn_processing(
        self, question: str, answer: str, user_id: str, session_key: str
    ) -> None:
        """After a turn ends: slim the session and extract memories."""
        try:
            slim_session(WORKSPACE, session_key)
            await extract_memory(WORKSPACE, question, answer, user_id, session_key)
        except Exception as e:
            print(f"[backend] Post-turn processing error: {e}")


# Singleton instance
agent_manager = NanobotAgentManager()
