#!/usr/bin/env python3
"""Minimal monkeypatches for nanobot internals that cannot be replaced by FastAPI."""

import re
import sys
from pathlib import Path


def apply_patches(workspace: Path) -> None:
    """Apply essential monkeypatches to nanobot internals.
    
    Only 2 patches remain (everything else is handled by FastAPI):
    1. SessionManager path mapping: support compound keys (user__session)
    2. ExecTool interception: force Windows venv python
    """
    import os
    if sys.platform == "win32":
        os.environ.setdefault("PYTHONUTF8", "1")
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    _patch_session_path()
    _patch_exec_tool(workspace)
    print("[backend] Applied essential nanobot patches")


def _patch_session_path() -> None:
    """Monkeypatch SessionManager._get_session_path to support compound keys.
    
    Mapping rules:
        websocket:alice__zzq_customers  →  sessions/alice__zzq_customers.jsonl
        websocket:bob__bob_customers    →  sessions/bob__bob_customers.jsonl
        websocket:anon-uuid             →  sessions/anon-uuid.jsonl
    """
    from nanobot.session.manager import SessionManager
    original_get_session_path = SessionManager._get_session_path

    def custom_get_session_path(self, key: str) -> Path:
        target_key = key
        if key.startswith("websocket:"):
            target_key = key.split(":", 1)[1]
        return original_get_session_path(self, target_key)

    SessionManager._get_session_path = custom_get_session_path


def _patch_exec_tool(workspace: Path) -> None:
    """Monkeypatch ExecTool.execute to use the project's venv python on Windows."""
    if sys.platform != "win32":
        return

    from nanobot.agent.tools.shell import ExecTool
    original_exec_execute = ExecTool.execute

    async def custom_exec_execute(self, command: str, *args, **kwargs) -> str:
        import time

        if "\n" in command:
            match = re.search(r'python\s+-c\s+["\']([\s\S]+?)["\']', command)
            if match:
                code = match.group(1)
                temp_file = workspace / f"__temp_exec_win32_{time.time_ns()}.py"
                try:
                    temp_file.write_text(code, encoding="utf-8")
                    temp_file_str = str(temp_file).replace("\\", "/")
                    new_command = re.sub(
                        r'python\s+-c\s+["\'][\s\S]+?["\']',
                        f'python "{temp_file_str}"',
                        command,
                    )
                    venv_python = str(workspace / ".venv" / "Scripts" / "python.exe")
                    final_command = re.sub(
                        r"\bpython(?:\.exe)?\b", lambda m: venv_python, new_command
                    )
                    return await original_exec_execute(self, final_command, *args, **kwargs)
                finally:
                    if temp_file.exists():
                        try:
                            temp_file.unlink()
                        except Exception:
                            pass

        venv_python = str(workspace / ".venv" / "Scripts" / "python.exe")
        command = re.sub(r"\bpython(?:\.exe)?\b", lambda m: venv_python, command)
        return await original_exec_execute(self, command, *args, **kwargs)

    ExecTool.execute = custom_exec_execute
