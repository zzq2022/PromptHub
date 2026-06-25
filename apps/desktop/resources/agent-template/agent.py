#!/usr/bin/env python3
"""
Agent Template — nanobot 版

通用 Agent 模板，可自定义 skills 和 tools。
运行: python agent.py "你好"
运行: python agent.py --user alice --session alice_customers "这个skill还能问啥?"
"""

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

if sys.platform == "win32":
    os.environ.setdefault("PYTHONUTF8", "1")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

WORKSPACE = Path(__file__).resolve().parent
sys.path.insert(0, str(WORKSPACE / "libs"))

from libs.gateway_utils import (
    register_tools, slim_session, extract_memory,
    create_agent_loop, load_user_memory, save_session_turn
)
from nanobot.agent.loop import AgentLoop
from nanobot.config.loader import load_config


async def main():
    """Run agent in CLI mode (single prompt)."""
    parser = argparse.ArgumentParser(description="Agent CLI")
    parser.add_argument("prompt", help="User message to send to the agent")
    parser.add_argument("--user", default="cli_user", help="User ID")
    parser.add_argument("--session", default=None,
                        help="Session ID (default: auto-generated timestamp)")
    args = parser.parse_args()

    session_id = args.session or f"cli_{int(time.time())}"
    session_key = f"websocket:{args.user}__{session_id}"
    db_path = WORKSPACE / "chinook.db"

    # Initialize the AgentLoop with correct parameters
    agent = create_agent_loop(WORKSPACE, db_path, user_id=args.user, session_key=session_key)

    # Load long-term memory with correct parameters
    memory = load_user_memory(args.user, session_key)

    # Build prompt with injected memory if exists
    prompt = args.prompt
    if memory:
        prompt = (
            f"以下是用户 [{args.user}] 的长期记忆，供本次对话参考：\n\n"
            f"{memory}\n\n---\n用户当前问题：{args.prompt}"
        )

    # Use Nanobot facade to run a single turn
    from nanobot.nanobot import Nanobot
    bot = Nanobot(agent)
    result = await bot.run(prompt, session_key=session_key)

    # Save session turn & slim session
    save_session_turn(WORKSPACE, args.user, session_id, args.prompt, result.content)

    # Extract memory asynchronously after turn ends
    await extract_memory(WORKSPACE, args.prompt, result.content, args.user, session_key)

    print(result.content)


if __name__ == "__main__":
    asyncio.run(main())

