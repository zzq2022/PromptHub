"""Unified Agent service layer.

Encapsulates the full AgentLoop lifecycle:
  user message → inject_memory → bot.run → slim_session → extract_memory

Used by both CLI (agent.py) and WebSocket backend (nanobot_agent.py).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.agent.factory import create_agent_loop, load_clean_config
from backend.memory.loader import load_user_memory
from backend.session.ops import slim_session, extract_memory


class AgentRunner:
    """Unified Agent runner.

    Responsibilities:
      1. AgentLoop initialization (delegates to create_agent_loop)
      2. Long-term memory injection (backend chosen by config.json)
      3. Post-turn processing (slim session + extract memory)
    """

    def __init__(self, workspace: Path, db_path: Path) -> None:
        self._workspace = workspace
        self._db_path = db_path
        self._loop = create_agent_loop(workspace, db_path)
        self._config = load_clean_config(workspace)

    # ── properties ──────────────────────────────────────────────

    @property
    def loop(self) -> Any:
        """Access the underlying AgentLoop."""
        return self._loop

    @property
    def config(self) -> Any:
        """Access the loaded config."""
        return self._config

    @property
    def bot(self) -> Any:
        """Return a Nanobot wrapper around the loop."""
        from nanobot.nanobot import Nanobot

        return Nanobot(self._loop)

    # ── public API ──────────────────────────────────────────────

    async def run(
        self,
        question: str,
        user_id: str,
        session_key: str,
        hooks: list[Any] | None = None,
    ) -> str:
        """Execute a full conversation turn: memory injection → agent run → post-processing.

        Returns the agent's text response.
        """
        content = self.inject_memory(question, user_id)

        nanobot = self.bot
        result = await nanobot.run(
            content,
            session_key=session_key,
            hooks=hooks or [],
        )

        answer = result.content or ""
        await self._post_turn(question, answer, user_id, session_key)
        return answer

    # ── memory ──────────────────────────────────────────────────

    def inject_memory(self, content: str, user_id: str) -> str:
        """Inject user long-term memory into the message content.

        Skips injection if memory is already present (re-injection guard).
        """
        if "---\n用户当前问题：" in content or "---\nUser Question:" in content:
            return content

        user_memory = load_user_memory(user_id, "")
        if user_memory:
            content = (
                f"以下是用户 [{user_id}] 的长期记忆，供本次对话参考：\n\n"
                f"{user_memory}\n\n---\n用户当前问题：{content}"
            )
        return content

    # ── post-turn ───────────────────────────────────────────────

    async def _post_turn(
        self,
        question: str,
        answer: str,
        user_id: str,
        session_key: str,
    ) -> None:
        """Slim the session and extract memories after a turn."""
        try:
            slim_session(self._workspace, session_key)
            await extract_memory(
                self._workspace, question, answer, user_id, session_key
            )
        except Exception as e:
            print(f"[agent_runner] Post-turn processing error: {e}")
