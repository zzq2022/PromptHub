#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tpa_RuYiBot — Gateway Startup Script (Shared Runtime)

Starts the FastAPI backend server with uvicorn.
This script lives in the shared agent-runtime/ directory.
It reads AGENT_WORKSPACE env var to find the per-agent project directory.

Usage (invoked by TypeScript gateway launcher):
    AGENT_WORKSPACE=<project_dir> python run_gateway.py
"""

import os
import sys
import atexit
from pathlib import Path

# AGENT_WORKSPACE must be set by the TypeScript gateway launcher
WORKSPACE = Path(os.environ["AGENT_WORKSPACE"])

# Runtime directory (where this file lives) — for backend package imports
RUNTIME_DIR = Path(__file__).resolve().parent

# Windows UTF-8 and ANSI Color support
if sys.platform == "win32":
    os.environ.setdefault("PYTHONUTF8", "1")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    
    # Enable Virtual Terminal Processing for ANSI escape codes
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        # stdout (-11)
        h_out = kernel32.GetStdHandle(-11)
        mode = ctypes.c_ulong()
        if kernel32.GetConsoleMode(h_out, ctypes.byref(mode)):
            kernel32.SetConsoleMode(h_out, mode.value | 0x0004)
        # stderr (-12)
        h_err = kernel32.GetStdHandle(-12)
        if kernel32.GetConsoleMode(h_err, ctypes.byref(mode)):
            kernel32.SetConsoleMode(h_err, mode.value | 0x0004)
    except Exception:
        pass

# Ensure runtime directory is on sys.path so "backend" and "libs" packages resolve
if str(RUNTIME_DIR) not in sys.path:
    sys.path.insert(0, str(RUNTIME_DIR))

# Also ensure workspace is on sys.path for config.json access, appended to not override runtime packages
if str(WORKSPACE) not in sys.path:
    sys.path.append(str(WORKSPACE))

PID_FILE = WORKSPACE / "gateway.pid"

# Increase LLM request timeout for gotoken API (default 120s is too tight)
os.environ.setdefault("NANOBOT_OPENAI_COMPAT_TIMEOUT_S", "300")


def write_pid():
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")


def remove_pid():
    try:
        PID_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def main():
    # Write PID file so stop_gateway.py can find and kill us
    write_pid()
    atexit.register(remove_pid)

    # Initialize file logging to logs/run_gateway_YYYY-MM-DD.log
    try:
        from libs.logger_setup import setup_gateway_logging
        setup_gateway_logging(WORKSPACE)
    except Exception as e:
        print(f"Failed to setup logging: {e}")

    import uvicorn
    import json

    host = "127.0.0.1"
    port = 18792

    # Prioritize AGENT_PORT environment variable set by the TypeScript launcher
    env_port = os.environ.get("AGENT_PORT")
    if env_port:
        try:
            port = int(env_port)
        except ValueError:
            pass
    else:
        try:
            config_path = WORKSPACE / "config.json"
            if config_path.exists():
                cfg = json.loads(config_path.read_text(encoding="utf-8"))
                gateway_cfg = cfg.get("gateway", {})
                host = gateway_cfg.get("host", host)
                port = int(gateway_cfg.get("port", port))
        except Exception as e:
            print(f"Failed to read custom gateway config: {e}")

    print(f"\n🚀 Starting Tpa_RuYiBot backend on http://{host}:{port}")
    print(f"   Workspace: {WORKSPACE}")
    print(f"   Frontend:  http://{host}:{port}")
    print(f"   API:       http://{host}:{port}/api")
    print()

    uvicorn.run(
        "backend.app:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
