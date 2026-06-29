"""Memory loader — read user long-term memory from mem0 or Markdown files."""

from __future__ import annotations

import json
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent.parent


def load_user_memory(user_id: str, session_key: str) -> str:
    """读取用户长期记忆：mem0 后端优先，降级到 Markdown 文件。"""
    # 尝试 mem0 后端
    try:
        cfg_data = json.loads((WORKSPACE / "config.json").read_text(encoding="utf-8"))
        if cfg_data.get("memory_backend") == "mem0":
            from backend.memory.mem0_manager import mem0_manager  # type: ignore
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
