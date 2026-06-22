#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tpa_RuYiBot — Gateway Stop Script

Sends a POST request to /api/shutdown to gracefully stop the running gateway.
If that fails, attempts to use a PID file or netstat/taskkill to force stop.
"""

import sys
import urllib.request
import urllib.error
import subprocess
import re
from pathlib import Path

SHUTDOWN_URL = "http://127.0.0.1:18792/api/shutdown"


def main():
    print("Sending shutdown request to Tpa_RuYiBot gateway...")
    try:
        req = urllib.request.Request(SHUTDOWN_URL, method="POST", data=b"")
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read()
            print(f"Service is shutting down. Response: {body.decode()}")
            sys.exit(0)
    except urllib.error.URLError as e:
        if "Connection refused" in str(e) or "refused" in str(e).lower():
            print("Service is not running (connection refused). Trying PID file...")
        else:
            print(f"Failed to reach service: {e}")
            sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)

    # Fallback 1: try PID file
    try:
        pid_path = Path(__file__).resolve().parent / "gateway.pid"
        if pid_path.is_file():
            pid = int(pid_path.read_text().strip())
            print(f"Found PID file, attempting to kill PID {pid}...")
            result = subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"Successfully killed PID {pid} via PID file.")
                sys.exit(0)
            else:
                print(f"Failed to kill PID {pid} via PID file: {result.stderr}")
    except Exception as e:
        print(f"Error handling PID file: {e}")

    # Fallback 2: netstat search for any process listening on :18792
    try:
        cmd = "netstat -ano | findstr \":18792\" | findstr LISTENING"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        pids = set()
        for line in result.stdout.splitlines():
            parts = re.split(r"\s+", line.strip())
            if len(parts) >= 5:
                pids.add(parts[4])
        if pids:
            for pid in pids:
                print(f"Attempting to kill PID {pid} found via netstat...")
                kill_res = subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True, text=True)
                if kill_res.returncode == 0:
                    print(f"Successfully killed PID {pid}.")
                else:
                    print(f"Failed to kill PID {pid}: {kill_res.stderr}")
            sys.exit(0)
        else:
            print("No PID found listening on port 18792.")
    except Exception as e:
        print(f"Netstat fallback error: {e}")

    print("Shutdown attempts completed. If the service is still running, you may need to stop it manually.")
    sys.exit(1)


if __name__ == "__main__":
    main()
