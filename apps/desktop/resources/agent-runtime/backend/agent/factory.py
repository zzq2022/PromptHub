"""Agent factory — create AgentLoop with shared config, patches, and tools."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from backend.tools.query_db import QueryDBTool
from backend.workspace import get_workspace

WORKSPACE = get_workspace()


def register_tools(loop, db_path: Path | str, user_id: str = "default", session_key: str = "default") -> None:
    """Register QueryDBTool, Todo tools, and memory tools onto an AgentLoop instance."""
    db_path = Path(db_path)

    loop.tools.register(QueryDBTool(db_path))
    print("\n[🔌 Gateway Extension] 已成功在 Web 容器中注册 SQL 查询工具: query_db")

    # ── Todo task-management tools (awareness loop) ──
    try:
        from backend.tools.todo_tools import register_todo_tools
        register_todo_tools(loop)
    except Exception as e:
        print(f"[🔌 Gateway Extension] 注册 Todo 工具失败: {e}")

    try:
        cfg_data = json.loads((WORKSPACE / "config.json").read_text(encoding="utf-8"))
        if cfg_data.get("memory_backend") == "mem0":
            from backend.memory.tools import SaveUserMemoryTool, SearchUserMemoryTool
            loop.tools.register(SaveUserMemoryTool(user_id=user_id, session_id=session_key))
            loop.tools.register(SearchUserMemoryTool(user_id=user_id))
            print("[🔌 Gateway Extension] 已成功在 Web 容器中注册 mem0 长期记忆工具")
    except Exception as e:
        print(f"[🔌 Gateway Extension] 注册记忆工具失败: {e}")


def load_clean_config(workspace: Path | None = None) -> Any:
    """Load nanobot config, stripping custom fields that break Pydantic validation."""
    if workspace is None:
        workspace = WORKSPACE

    config_path = workspace / "config.json"
    temp_config_path = workspace / f".temp_config_gateway_{os.getpid()}.json"

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg_data = json.load(f)

        cfg_data.pop("memory_backend", None)
        cfg_data.pop("mem0", None)
        cfg_data.pop("custom_instructions", None)
        cfg_data.pop("skills", None)
        cfg_data.pop("skill_llm", None)
        cfg_data.pop("skill_embedding", None)

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
        from backend.agent.patches import apply_patches
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
