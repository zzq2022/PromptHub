#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tpa_RuYiBot — Gateway Startup Script

Starts the FastAPI backend server with uvicorn.
All backend logic lives in the backend/ package.
"""

import os
import sys
import atexit
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent
sys.path.insert(0, str(WORKSPACE))
sys.path.insert(0, str(WORKSPACE / "libs"))

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


PID_FILE = WORKSPACE / "gateway.pid"


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
        from logger_setup import setup_gateway_logging
        setup_gateway_logging(WORKSPACE)
    except Exception as e:
        print(f"Failed to setup logging: {e}")

    import uvicorn

    host = "127.0.0.1"
    port = int(os.environ.get("AGENT_PORT", "18792"))
    print(f"\n🚀 Starting Tpa_RuYiBot backend on http://{host}:{port}")
    print(f"   Frontend: http://{host}:{port}")
    print(f"   API:      http://{host}:{port}/api")
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