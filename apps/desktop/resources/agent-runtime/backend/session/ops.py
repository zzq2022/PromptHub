"""Session operations — slimming, memory extraction, question parsing."""

from __future__ import annotations

import json
from pathlib import Path


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
            from backend.memory.smart_extractor import smart_extractor
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
            from backend.memory.trigger import save_session_memory
            from nanobot.session.manager import SessionManager

            sessions = SessionManager(workspace=workspace)
            session = sessions.get_or_create(session_key)

            turn_count = sum(1 for msg in session.messages if msg.get("role") == "user")
            if turn_count > 0:
                print(f"\n[📚 Web 本地记忆] 正在自动提炼并写入本地 MEMORY.md...")
                await save_session_memory(workspace, session_key, user_id=user_id)
    except Exception as e:
        print(f"[WARN] Web 长期记忆提取执行失败: {e}")
