#!/usr/bin/env python3
"""
Shared gateway utilities for nanobot_sql.
注册工具、session 瘦身、记忆提取等重复逻辑统一管理。
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

from nanobot.agent.tools.base import Tool

WORKSPACE = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# QueryDBTool
# ---------------------------------------------------------------------------

class QueryDBTool(Tool):
    """SQL 查询工具 -- 在 Chinook 数据库上执行只读 SQL"""

    def __init__(self, db_path: Path | str):
        self._db_path = Path(db_path)

    @property
    def name(self) -> str:
        return "query_db"

    @property
    def description(self) -> str:
        return (
            "Execute a read-only SQL query against the Chinook database. "
            "Returns query results as formatted text. Only SELECT and PRAGMA statements are allowed."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "The SQL query to execute (SELECT only)"
                }
            },
            "required": ["sql"]
        }

    @property
    def read_only(self) -> bool:
        return True

    async def execute(self, **kwargs: Any) -> str:
        sql = kwargs.get("sql", "").strip()
        if not sql:
            return "Error: empty SQL query"

        upper = sql.upper().lstrip()
        if not (upper.startswith("SELECT") or upper.startswith("PRAGMA")):
            return "Error: only SELECT and PRAGMA statements are allowed"

        try:
            conn = sqlite3.connect(str(self._db_path))
            cursor = conn.cursor()
            cursor.execute(sql)
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            rows = cursor.fetchall()
            conn.close()

            if not rows:
                return "Query returned 0 rows."

            lines = [" | ".join(columns)]
            lines.append("-" * len(lines[0]))
            for row in rows[:50]:
                lines.append(" | ".join(str(v) for v in row))
            if len(rows) > 50:
                lines.append(f"... ({len(rows)} total rows, showing first 50)")

            return "\n".join(lines)
        except Exception as e:
            return f"SQL Error: {e}"


# ---------------------------------------------------------------------------
# Tool registration
# ---------------------------------------------------------------------------

def register_tools(loop, db_path: Path | str, user_id: str = "default", session_key: str = "default") -> None:
    """Register QueryDBTool and memory tools onto an AgentLoop instance."""
    db_path = Path(db_path)

    loop.tools.register(QueryDBTool(db_path))
    print("\n[🔌 Gateway Extension] 已成功在 Web 容器中注册 SQL 查询工具: query_db")

    try:
        cfg_data = json.loads((WORKSPACE / "config.json").read_text(encoding="utf-8"))
        if cfg_data.get("memory_backend") == "mem0":
            from memory_tools import SaveUserMemoryTool, SearchUserMemoryTool
            loop.tools.register(SaveUserMemoryTool(user_id=user_id, session_id=session_key))
            loop.tools.register(SearchUserMemoryTool(user_id=user_id))
            print("[🔌 Gateway Extension] 已成功在 Web 容器中注册 mem0 长期记忆工具")
    except Exception as e:
        print(f"[🔌 Gateway Extension] 注册记忆工具失败: {e}")


# ---------------------------------------------------------------------------
# Session slimming
# ---------------------------------------------------------------------------

def slim_session(workspace: Path, session_key: str) -> int:
    """Remove tool-call intermediate steps from session messages.

    Returns the number of removed messages.
    """
    try:
        from nanobot.session.manager import SessionManager
        sessions = SessionManager(workspace=workspace)
        session = sessions.get_or_create(session_key)

        original_count = len(session.messages)
        clean_messages = []
        for m in session.messages:
            role = m.get("role")
            if role == "tool":
                continue
            if role == "assistant" and m.get("tool_calls") and not m.get("content"):
                continue
            if role == "assistant" and "tool_calls" in m:
                m = {k: v for k, v in m.items() if k != "tool_calls"}
            clean_messages.append(m)

        removed = original_count - len(clean_messages)
        if removed > 0:
            session.messages[:] = clean_messages
            sessions.save(session)
            print(f"[🧹 Web Session 瘦身] 移除了 {removed} 条中间 tool 步骤，保留 {len(clean_messages)} 条对话流水")
        return removed
    except Exception as e:
        print(f"[WARN] Web Session 瘦身失败: {e}")
        return 0


# ---------------------------------------------------------------------------
# Memory extraction
# ---------------------------------------------------------------------------

def extract_question(content: str) -> str:
    """Strip memory-injection headers to recover the real user question."""
    for sep in ("---\n用户当前问题：", "---\n用户当前问题:", "---\nUser Question:"):
        if sep in content:
            return content.split(sep)[-1].strip()
    return content


async def extract_memory(workspace: Path, question: str, answer: str, user_id: str, session_key: str) -> None:
    """Extract and store memory after a turn ends (both mem0 and markdown backends)."""
    try:
        cfg_data = json.loads((workspace / "config.json").read_text(encoding="utf-8"))
        backend = cfg_data.get("memory_backend")

        if backend == "mem0":
            from smart_extractor import smart_extractor
            turn_messages = [
                {"role": "user", "content": question},
                {"role": "assistant", "content": answer}
            ]
            await smart_extractor.async_on_turn_end(
                messages=turn_messages,
                user_id=user_id,
                session_key=session_key
            )
        elif backend == "markdown":
            from trigger_memory import save_session_memory
            from nanobot.session.manager import SessionManager

            sessions = SessionManager(workspace=workspace)
            session = sessions.get_or_create(session_key)

            turn_count = sum(1 for msg in session.messages if msg.get("role") == "user")
            if turn_count > 0:
                print(f"\n[📚 Web 本地记忆] 正在自动提炼并写入本地 MEMORY.md...")
                await save_session_memory(workspace, session_key, user_id=user_id)
    except Exception as e:
        print(f"[WARN] Web 长期记忆提取执行失败: {e}")


# ---------------------------------------------------------------------------
# Config loading helpers
# ---------------------------------------------------------------------------

def load_clean_config(workspace: Path | None = None) -> Any:
    """Load nanobot config, stripping custom fields that break Pydantic validation."""
    if workspace is None:
        workspace = WORKSPACE

    import os
    config_path = workspace / "config.json"
    temp_config_path = workspace / f".temp_config_gateway_{os.getpid()}.json"

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg_data = json.load(f)

        cfg_data.pop("memory_backend", None)
        cfg_data.pop("mem0", None)
        cfg_data.pop("custom_instructions", None)
        cfg_data.pop("skills", None)

        with open(temp_config_path, "w", encoding="utf-8") as f:
            json.dump(cfg_data, f, indent=2, ensure_ascii=False)

        from nanobot.config.loader import load_config
        config = load_config(temp_config_path)
        return config
    finally:
        if temp_config_path.exists():
            try:
                temp_config_path.unlink()
            except Exception:
                pass


def create_agent_loop(
    workspace: Path,
    db_path: Path,
    user_id: str = "default",
    session_key: str = "default",
) -> Any:
    """Create and initialize a nanobot AgentLoop with shared config, patches, and tools."""
    # Apply monkeypatches
    try:
        from backend.graph.patches import apply_patches
        apply_patches(workspace)
    except ImportError:
        pass

    # Load configuration
    config = load_clean_config(workspace)
    config.agents.defaults.workspace = str(workspace)

    # Read skills config to calculate disabled_skills
    disabled_skills = []
    try:
        config_path = workspace / "config.json"
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                raw_cfg = json.load(f)
            skills_cfg = raw_cfg.get("skills", {})
            for name, item in skills_cfg.items():
                if isinstance(item, dict) and not item.get("enabled", True):
                    disabled_skills.append(name)
                elif isinstance(item, bool) and not item:
                    disabled_skills.append(name)
    except Exception as e:
        print(f"[WARN] Failed to read skills config: {e}")

    # Initialize components
    from nanobot.agent.loop import AgentLoop
    from nanobot.bus.queue import MessageBus
    from nanobot.providers.factory import make_provider

    provider = make_provider(config)
    defaults = config.agents.defaults

    loop = AgentLoop(
        bus=MessageBus(),
        provider=provider,
        workspace=workspace,
        model=defaults.model,
        max_iterations=defaults.max_tool_iterations,
        context_window_tokens=defaults.context_window_tokens,
        max_tool_result_chars=defaults.max_tool_result_chars,
        tools_config=config.tools,
        restrict_to_workspace=False,
        timezone=defaults.timezone,
        disabled_skills=disabled_skills,
    )

    # Register tools
    register_tools(loop, db_path, user_id=user_id, session_key=session_key)

    return loop


def load_user_memory(user_id: str, session_key: str) -> str:
    """读取用户长期记忆：mem0 后端优先，降级到 Markdown 文件。"""
    # 尝试 mem0 后端
    try:
        cfg_data = json.loads((WORKSPACE / "config.json").read_text(encoding="utf-8"))
        if cfg_data.get("memory_backend") == "mem0":
            from mem0_manager import mem0_manager  # type: ignore
            context = mem0_manager.get_context_for_prompt(
                query="SQL query history and user preferences",
                user_id=user_id,
                limit=8,
                score_threshold=0.1,
            )
            if context:
                return context
    except Exception as e:
        print(f"[WARN] mem0 记忆加载失败，降级到 Markdown: {e}")

    # 降级：Markdown 文件记忆（以 user_id 进行隔离）
    safe_user = user_id.replace(":", "_").replace("/", "_").replace("\\", "_")
    mem_file = WORKSPACE / "memory" / safe_user / "MEMORY.md"
    if mem_file.exists():
        return mem_file.read_text(encoding="utf-8")
    return ""