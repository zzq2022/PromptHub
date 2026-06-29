#!/usr/bin/env python3
"""Nanobot AgentLoop wrapper — provides a clean interface for FastAPI endpoints."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from backend.workspace import get_workspace

WORKSPACE = get_workspace()

from backend.agent.runner import AgentRunner

DB_PATH = WORKSPACE / "chinook.db"


class NanobotAgentManager:
    """Singleton manager that wraps AgentRunner for the FastAPI backend.

    Responsibilities:
    - Initialize AgentRunner at startup
    - Provide loop/config access for WebSocket chat endpoint
    - Memory injection and post-turn processing
    """

    def __init__(self) -> None:
        self._runner: AgentRunner | None = None
        self._initialized: bool = False

    def initialize(self, workspace: Path | None = None) -> None:
        """Initialize the agent runner once at startup.

        Applies essential patches and creates the AgentRunner.
        """
        if self._initialized:
            return

        ws = workspace or WORKSPACE
        self._runner = AgentRunner(ws, DB_PATH)

        # Set workspace in config for nanobot
        self._runner.config.agents.defaults.workspace = str(ws)

        self._initialized = True
        print("[backend] NanobotAgentManager initialized")

    @property
    def loop(self) -> Any:
        """Access the underlying AgentLoop (used by WebSocket chat endpoint)."""
        if not self._initialized or self._runner is None:
            raise RuntimeError("AgentManager not initialized. Call initialize() first.")
        return self._runner.loop

    @property
    def config(self) -> Any:
        if self._runner is None:
            return None
        return self._runner.config

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
        if self._runner is None:
            return content
        return self._runner.inject_memory(content, user_id)

    async def post_turn_processing(
        self, question: str, answer: str, user_id: str, session_key: str
    ) -> None:
        """After a turn ends: slim the session and extract memories."""
        if self._runner is None:
            return
        await self._runner._post_turn(question, answer, user_id, session_key)


# Singleton instance
agent_manager = NanobotAgentManager()
