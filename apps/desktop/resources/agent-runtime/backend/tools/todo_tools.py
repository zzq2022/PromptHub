#!/usr/bin/env python3
"""
Todo / Task-List tools for nanobot agents.
移植自 babdogcat/todolist-mcp (MIT)，适配 nanobot Tool 接口。

核心循环 (Awareness Loop):
  setup → list → execute → analyze →
    (success) → complete → list → ...
    (failure) → fail → add recovery → list → ...
    ... → ALL DONE → final answer

用法:
    在 register_tools() 中调用 register_todo_tools(loop) 即可。
"""

from __future__ import annotations

import json
import time
from typing import Any

from nanobot.agent.tools.base import Tool


# ── shared state (per-process, single-agent scope) ──────────────────────

class _Task:
    __slots__ = ("id", "title", "description", "completed", "failed",
                 "fail_reason", "created_at", "completed_at")

    def __init__(self, task_id: int, title: str, description: str = ""):
        self.id = task_id
        self.title = title
        self.description = description
        self.completed = False
        self.failed = False
        self.fail_reason: str | None = None
        self.created_at = time.time()
        self.completed_at: float | None = None


_state: dict[str, Any] = {
    "tasks": {},          # id -> _Task
    "next_id": 1,
    "goal": "",
}


def _reset() -> None:
    _state["tasks"] = {}
    _state["next_id"] = 1
    _state["goal"] = ""


def _fmt_task_list(filter_mode: str) -> str:
    tasks: list[_Task] = list(_state["tasks"].values())
    if filter_mode == "done":
        tasks = [t for t in tasks if t.completed and not t.failed]
    elif filter_mode == "failed":
        tasks = [t for t in tasks if t.failed]
    elif filter_mode == "pending":
        tasks = [t for t in tasks if not t.completed and not t.failed]
    else:
        tasks = []

    if not tasks:
        return "None"
    lines: list[str] = []
    for t in tasks:
        if t.failed:
            lines.append(f"  #{t.id} [FAILED] {t.title}\n         Reason: {t.fail_reason}")
        elif t.completed:
            lines.append(f"  #{t.id} [DONE] {t.title}")
        else:
            desc = f" - {t.description}" if t.description else ""
            lines.append(f"  #{t.id} [PENDING] {t.title}{desc}")
    return "\n".join(lines)


def _counters() -> tuple[int, int, int]:
    total = len(_state["tasks"])
    done = sum(1 for t in _state["tasks"].values() if t.completed and not t.failed)
    failed = sum(1 for t in _state["tasks"].values() if t.failed)
    pending = total - done - failed
    return done, failed, pending


# ── Tool subclasses ──────────────────────────────────────────────────────

class TodoSetupTool(Tool):
    """初始化 todo list，设定目标和任务列表（会重置之前的状态）"""

    @property
    def name(self) -> str:
        return "todo_setup"

    @property
    def description(self) -> str:
        return (
            "Initialize a checklist with a goal and ordered task list. "
            "Resets all previous state.\n\n"
            "WORKFLOW (Awareness Loop):\n"
            "1. Call todo_setup once to create the list\n"
            "2. Call todo_list to see the first task\n"
            "3. Execute that task with your own abilities\n"
            "4. ANALYZE the result — did it actually succeed?\n"
            "   5a. success → todo_complete\n"
            "   5b. failure → todo_fail + todo_add (recovery step)\n"
            "6. Call todo_list again — NEVER skip the checklist\n"
            "7. Repeat until todo_list says ALL TASKS COMPLETED\n"
            "8. Only then give the final answer"
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "goal": {
                    "type": "string",
                    "description": "The overall goal for this session",
                    "minLength": 1,
                    "maxLength": 500,
                },
                "tasks": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Ordered list of task titles",
                    "minItems": 1,
                    "maxItems": 50,
                },
            },
            "required": ["goal", "tasks"],
        }

    @property
    def read_only(self) -> bool:
        return False

    async def execute(self, **kwargs: Any) -> str:
        goal: str = (kwargs.get("goal") or "").strip()
        tasks_raw: list[str] = kwargs.get("tasks") or []
        if not goal or not tasks_raw:
            return "Error: both 'goal' and non-empty 'tasks' list are required."

        _reset()
        _state["goal"] = goal

        for title in tasks_raw:
            tid = _state["next_id"]
            _state["tasks"][tid] = _Task(tid, title.strip())
            _state["next_id"] += 1

        total = len(tasks_raw)
        return (
            f"✅ CHECKLIST CREATED\n"
            f"Goal: {goal}\n"
            f"Total tasks: {total}\n\n"
            f"Pending:\n{_fmt_task_list('pending')}\n\n"
            f"➡️  NEXT: Call todo_list to see your first task."
        )


class TodoListTool(Tool):
    """查看当前 checklist 状态，这是每次执行完任务后必须调用的检查点"""

    @property
    def name(self) -> str:
        return "todo_list"

    @property
    def description(self) -> str:
        return (
            "Check the current checklist and see what to do next.\n"
            "THIS IS YOUR CHECKPOINT — You MUST call this:\n"
            "- After todo_setup to see the first task\n"
            "- After EVERY todo_complete or todo_fail\n"
            "- Whenever you need to re-check what remains\n\n"
            "If todo_list shows ALL TASKS COMPLETED → give the final answer.\n"
            "FAILED tasks require your decision: add recovery (todo_add) or "
            "update the goal (todo_update_goal)."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {"type": "object", "properties": {}}

    @property
    def read_only(self) -> bool:
        return True

    async def execute(self, **kwargs: Any) -> str:
        if not _state["tasks"]:
            return "No checklist yet. Call todo_setup first."

        done, failed, pending = _counters()
        total = done + failed + pending

        lines: list[str] = ["=== CHECKLIST ===", f"Goal: {_state['goal']}", f"Progress: {done}/{total}", ""]

        if done > 0:
            lines.append(f"Completed ({done}):")
            lines.append(_fmt_task_list("done"))
            lines.append("")

        if failed > 0:
            lines.append(f"FAILED ({failed}) — requires your decision:")
            lines.append(_fmt_task_list("failed"))
            lines.append("")
            lines.append("ACTION REQUIRED: Analyze why and decide:")
            lines.append("  - Retryable → call todo_add to insert a recovery task")
            lines.append("  - Plan is wrong → call todo_update_goal to recalibrate")
            lines.append("")

        if pending > 0:
            lines.append(f"Pending ({pending}):")
            lines.append(_fmt_task_list("pending"))
            lines.append("")
            lines.append("INSTRUCTION: Execute the next pending task now. "
                          "After finishing, call todo_complete or todo_fail, then todo_list again.")

        if pending == 0 and failed == 0:
            lines.append("🎉 ALL TASKS COMPLETED! You may now provide the final answer to the user.")

        return "\n".join(lines)


class TodoCompleteTool(Tool):
    """标记一个任务为已完成"""

    @property
    def name(self) -> str:
        return "todo_complete"

    @property
    def description(self) -> str:
        return (
            "Mark a task as completed on the checklist.\n"
            "After calling this, you MUST immediately call todo_list to check what's next. "
            "Do NOT skip the checklist — the loop is: execute → complete → list."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "integer",
                    "description": "ID of the task to mark as completed",
                    "minimum": 1,
                },
            },
            "required": ["task_id"],
        }

    @property
    def read_only(self) -> bool:
        return False

    async def execute(self, **kwargs: Any) -> str:
        task_id = kwargs.get("task_id")
        if task_id is None:
            return "Error: 'task_id' is required."

        task: _Task | None = _state["tasks"].get(task_id)
        if not task:
            return f"Error: Task #{task_id} not found. Call todo_list to see valid IDs."
        if task.completed:
            return f"Task #{task_id} '{task.title}' was already completed. Call todo_list to check what remains."
        if task.failed:
            return f"Task #{task_id} '{task.title}' was already marked failed."

        task.completed = True
        task.completed_at = time.time()
        remaining = sum(1 for t in _state["tasks"].values() if not t.completed and not t.failed)

        if remaining == 0:
            return f"[TICK] Task #{task_id} '{task.title}' done. ✅ All tasks complete! Call todo_list to confirm."
        return f"[TICK] Task #{task_id} '{task.title}' done. {remaining} task(s) left. Call todo_list NOW to see what's next."


class TodoFailTool(Tool):
    """标记一个任务失败并记录原因"""

    @property
    def name(self) -> str:
        return "todo_fail"

    @property
    def description(self) -> str:
        return (
            "Mark a task as failed with a reason.\n"
            "When a task's result is unacceptable, do NOT complete it. Mark it failed and adapt.\n"
            "After calling this you MUST:\n"
            "  1. Analyze WHY it failed\n"
            "  2. Decide: add recovery (todo_add), skip, or update goal (todo_update_goal)\n"
            "  3. Call todo_list to see the updated picture"
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "integer",
                    "description": "ID of the task that failed",
                    "minimum": 1,
                },
                "reason": {
                    "type": "string",
                    "description": "Why the task failed and what went wrong",
                    "minLength": 1,
                    "maxLength": 500,
                },
            },
            "required": ["task_id", "reason"],
        }

    @property
    def read_only(self) -> bool:
        return False

    async def execute(self, **kwargs: Any) -> str:
        task_id = kwargs.get("task_id")
        reason: str = (kwargs.get("reason") or "").strip()
        if task_id is None:
            return "Error: 'task_id' is required."
        if not reason:
            return "Error: 'reason' is required."

        task: _Task | None = _state["tasks"].get(task_id)
        if not task:
            return f"Error: Task #{task_id} not found. Call todo_list to see valid IDs."
        if task.failed:
            return f"Task #{task_id} '{task.title}' was already marked failed. Call todo_list to assess."
        if task.completed:
            return f"Task #{task_id} '{task.title}' was already completed. If you must redo it, call todo_add."

        task.failed = True
        task.fail_reason = reason
        remaining = sum(1 for t in _state["tasks"].values() if not t.completed and not t.failed)

        return (
            f"[FAIL] Task #{task_id} '{task.title}' marked as failed.\n"
            f"  Reason: {reason}\n"
            f"  {remaining} pending task(s) remain.\n\n"
            f"ANALYZE AND DECIDE: Add a recovery task (todo_add), skip, "
            f"or update the goal (todo_update_goal)? Call todo_list to assess."
        )


class TodoAddTool(Tool):
    """在执行过程中动态添加新任务"""

    @property
    def name(self) -> str:
        return "todo_add"

    @property
    def description(self) -> str:
        return (
            "Add a new task to the checklist mid-session "
            "(e.g., a recovery step after a failure).\n"
            "After adding, call todo_list to see the updated checklist."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Task title",
                    "minLength": 1,
                    "maxLength": 200,
                },
                "description": {
                    "type": "string",
                    "description": "Optional task description",
                    "default": "",
                },
            },
            "required": ["title"],
        }

    @property
    def read_only(self) -> bool:
        return False

    async def execute(self, **kwargs: Any) -> str:
        title: str = (kwargs.get("title") or "").strip()
        desc: str = (kwargs.get("description") or "").strip()
        if not title:
            return "Error: 'title' is required."

        tid = _state["next_id"]
        _state["tasks"][tid] = _Task(tid, title, desc)
        _state["next_id"] += 1

        return f"Added task #{tid}: {title}. Call todo_list to see updated checklist."


class TodoUpdateGoalTool(Tool):
    """更新当前 session 的目标"""

    @property
    def name(self) -> str:
        return "todo_update_goal"

    @property
    def description(self) -> str:
        return "Update the session goal when the original plan is off track."

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "goal": {
                    "type": "string",
                    "description": "New goal description",
                    "minLength": 1,
                    "maxLength": 500,
                },
            },
            "required": ["goal"],
        }

    @property
    def read_only(self) -> bool:
        return False

    async def execute(self, **kwargs: Any) -> str:
        goal: str = (kwargs.get("goal") or "").strip()
        if not goal:
            return "Error: 'goal' is required."
        _state["goal"] = goal
        return f"Goal updated to: {goal}"


# ── convenience registration helper ──────────────────────────────────────

def register_todo_tools(loop: Any) -> None:
    """注册全部 6 个 todo tools 到 nanobot AgentLoop。

    在 agent_factory.register_tools() 中调用即可:
        from backend.tools.todo_tools import register_todo_tools
        register_todo_tools(loop)
    """
    for tool_cls in (
        TodoSetupTool,
        TodoListTool,
        TodoCompleteTool,
        TodoFailTool,
        TodoAddTool,
        TodoUpdateGoalTool,
    ):
        loop.tools.register(tool_cls())

    print("[🔌 Gateway Extension] 已注册 Todo 任务管理工具 (todo_setup/list/complete/fail/add/update_goal)")

