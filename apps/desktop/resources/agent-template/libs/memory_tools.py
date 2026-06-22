"""Memory tools for nanobot_sql — nanobot Tool subclasses wrapping mem0.

Two tools exposed to the LLM:
  - save_user_memory: 主动保存关键信息（用户偏好、项目上下文等）
  - search_user_memory: 主动检索历史记忆

user_id 在工具初始化时绑定，无需请求上下文（CLI 模式）。
"""

from __future__ import annotations

from typing import Any

from nanobot.agent.tools.base import Tool


class SaveUserMemoryTool(Tool):
    """保存用户关键信息到 mem0 长期记忆。

    适用场景：
    - 用户介绍自己的背景（"我是数据分析师"）
    - 用户表达偏好（"结果请用中文展示"）
    - 对话中出现的重要项目事实
    """

    def __init__(self, user_id: str, session_id: str | None = None) -> None:
        self._user_id = user_id
        self._session_id = session_id

    @property
    def name(self) -> str:
        return "save_user_memory"

    @property
    def description(self) -> str:
        return (
            "Save important information about the user to long-term memory. "
            "Use this when the user shares personal info, preferences, behavioral rules, "
            "or project context that should be remembered in future sessions. "
            "Examples: 'User is a data analyst', 'User prefers results in Chinese', "
            "'User is analyzing the Chinook music database'."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "A concise one-sentence summary of the information to save."
                },
                "memory_type": {
                    "type": "string",
                    "enum": ["user", "feedback", "project", "reference"],
                    "description": (
                        "Category of the memory: "
                        "'user' for profile/preferences, "
                        "'feedback' for behavioral rules, "
                        "'project' for project context, "
                        "'reference' for URLs/paths/endpoints."
                    )
                }
            },
            "required": ["content"]
        }

    @property
    def read_only(self) -> bool:
        return False

    async def execute(self, **kwargs: Any) -> str:
        content = kwargs.get("content", "").strip()
        memory_type = kwargs.get("memory_type", "user")

        if not content:
            return "Error: content cannot be empty."

        try:
            from mem0_manager import mem0_manager
        except ImportError:
            return "mem0 模块未找到，请确认 mem0_manager.py 存在于工作目录。"

        if not mem0_manager.is_available():
            return "mem0 服务不可用，请检查 config.json 中的 mem0 配置。"

        result = mem0_manager.add(
            messages=[{"role": "user", "content": content}],
            user_id=self._user_id,
            session_id=self._session_id,
            metadata={"type": memory_type},
        )

        type_labels = {
            "user": "用户画像",
            "feedback": "行为偏好",
            "project": "项目上下文",
            "reference": "参考信息",
        }
        label = type_labels.get(memory_type, memory_type)
        preview = content[:60] + ("..." if len(content) > 60 else "")

        if result:
            try:
                from smart_extractor import smart_extractor
                smart_extractor.mark_agent_wrote(self._session_id or self._user_id)
            except Exception:
                pass
            return f"[{label}] 记忆已保存: {preview}"
        return f"[{label}] 保存完成（mem0 判断为无需新增）"


class SearchUserMemoryTool(Tool):
    """从 mem0 长期记忆中检索用户历史信息。

    当需要回忆用户背景、偏好或历史项目信息时调用。
    """

    def __init__(self, user_id: str) -> None:
        self._user_id = user_id

    @property
    def name(self) -> str:
        return "search_user_memory"

    @property
    def description(self) -> str:
        return (
            "Search the user's long-term memory for relevant past information. "
            "Use this when you need to recall user preferences, background, "
            "past queries, or project context from previous sessions."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What to search for in the user's memory."
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default: 5).",
                    "default": 5
                }
            },
            "required": ["query"]
        }

    @property
    def read_only(self) -> bool:
        return True

    async def execute(self, **kwargs: Any) -> str:
        query = kwargs.get("query", "").strip()
        limit = int(kwargs.get("limit", 5))

        if not query:
            return "Error: query cannot be empty."

        try:
            from mem0_manager import mem0_manager
        except ImportError:
            return "mem0 模块未找到。"

        if not mem0_manager.is_available():
            return "mem0 服务不可用。"

        results = mem0_manager.search(
            query, user_id=self._user_id, limit=limit, score_threshold=0.1
        )

        if not results:
            return f"未找到与「{query}」相关的历史记忆。"

        lines = [f"共找到 {len(results)} 条相关记忆："]
        type_labels = {
            "user": "用户画像",
            "feedback": "行为偏好",
            "project": "项目上下文",
            "reference": "参考信息",
        }
        for r in results:
            mem_text = r.get("memory", "")
            score = r.get("score", 0)
            metadata = r.get("metadata") or {}
            mem_type = metadata.get("type", "user")
            label = type_labels.get(mem_type, mem_type)
            lines.append(f"- [{label}] [{score:.2f}] {mem_text}")

        return "\n".join(lines)
