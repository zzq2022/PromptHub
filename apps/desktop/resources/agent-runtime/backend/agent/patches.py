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
    """Monkeypatch ExecTool.execute to use the project's venv python and force UTF-8 encoding on Windows."""
    if sys.platform != "win32":
        return

    from nanobot.agent.tools.shell import ExecTool
    import asyncio
    original_exec_execute = ExecTool.execute
    original_exec_spawn = ExecTool._spawn

    class UTF8SafeProcess:
        def __init__(self, process):
            self._process = process

        def __getattr__(self, name):
            return getattr(self._process, name)

        async def communicate(self, *args, **kwargs):
            stdout_bytes, stderr_bytes = await self._process.communicate(*args, **kwargs)
            
            def safe_to_utf8(data: bytes | None) -> bytes | None:
                if data is None:
                    return None
                try:
                    data.decode("utf-8")
                    return data
                except UnicodeDecodeError:
                    pass
                try:
                    decoded = data.decode("gbk")
                    return decoded.encode("utf-8")
                except UnicodeDecodeError:
                    pass
                return data.decode("utf-8", errors="replace").encode("utf-8")

            return safe_to_utf8(stdout_bytes), safe_to_utf8(stderr_bytes)

    async def custom_exec_spawn(command: str, cwd: str, env: dict[str, str]) -> asyncio.subprocess.Process:
        if sys.platform == "win32":
            env["PYTHONUTF8"] = "1"
            env["PYTHONIOENCODING"] = "utf-8"
        process = await original_exec_spawn(command, cwd, env)
        return UTF8SafeProcess(process)

    async def custom_exec_execute(self, command: str, *args, **kwargs) -> str:
        import time

        # Prepend chcp 65001 to change cmd.exe session to UTF-8
        if sys.platform == "win32" and not command.startswith("chcp 65001"):
            command = f"chcp 65001 >nul && {command}"

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
                        r"(?<![a-zA-Z\\])python(?:\.exe)?\b",
                        venv_python,
                        new_command,
                    )
                    return await original_exec_execute(self, final_command, *args, **kwargs)
                finally:
                    if temp_file.exists():
                        try:
                            temp_file.unlink()
                        except Exception:
                            pass

        venv_python = str(workspace / ".venv" / "Scripts" / "python.exe")
        # Only replace bare 'python'/'python.exe' when it's NOT already part of
        # an absolute path.  Lookbehind ensures the character before 'python'
        # is a start-of-string, space, or path-separator – but NOT a letter or
        # backslash that would mean we're inside a longer path like
        # "D:\...\Scripts\python.exe".
        command = re.sub(
            r"(?<![a-zA-Z\\])python(?:\.exe)?\b",
            venv_python,
            command,
        )
        return await original_exec_execute(self, command, *args, **kwargs)

    ExecTool._spawn = staticmethod(custom_exec_spawn)
    ExecTool.execute = custom_exec_execute

