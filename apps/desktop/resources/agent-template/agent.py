#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Text-to-SQL Agent -- nanobot 版

对标 DeepAgents 官方 text-to-sql-agent 示例。
使用 Chinook 数据库 + Skills 渐进式加载 + 自定义 query_db 工具。

运行: python agent.py "How many customers are from Canada?"
"""

import argparse
import asyncio
import json
import os
import sys
import urllib.request
from pathlib import Path

if sys.platform == "win32":
    os.environ.setdefault("PYTHONUTF8", "1")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore

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

WORKSPACE = Path(__file__).resolve().parent

from backend.agent.runner import AgentRunner

from nanobot.agent.hook import AgentHook, AgentHookContext

DB_PATH = WORKSPACE / "chinook.db"
DB_URL = "https://github.com/lerocha/chinook-database/raw/master/ChinookDatabase/DataSources/Chinook_Sqlite.sqlite"




class PrintHook(AgentHook):
    def __init__(self, workspace_path: Path):
        self.workspace_path = workspace_path

    async def before_execute_tools(self, context: AgentHookContext) -> None:
        for tc in context.tool_calls:
            # 判断是否通过 read_file 在动态加载某个具体的 Skill
            if tc.name == "read_file":
                path_arg = tc.arguments.get("path", "") or tc.arguments.get("filepath", "")
                if "skills" in str(path_arg) and "SKILL.md" in str(path_arg):
                    skill_name = Path(path_arg).parent.name
                    # 区分自定义技能和内置技能
                    if str(self.workspace_path) in str(path_arg):
                        print(f"\n[🧠 正在钻研自定义技能] ➡️ {skill_name}" if str(self.workspace_path) in str(path_arg) else f"\n[⚙️ 正在参考系统内置技能] ➡️ {skill_name}")
                    print(f"  └─ [🚀 执行工具] {tc.name} ({path_arg})")
                    continue

            # 简化参数输出，只在有意义时显示
            args_str = str(tc.arguments)
            if len(args_str) > 100:
                args_str = args_str[:100] + "..."
            print(f"  └─ [🚀 执行工具] {tc.name} ({args_str})")


def ensure_db():
    """确保 chinook.db 存在"""
    if DB_PATH.exists():
        return
    print(f"Downloading Chinook database...")
    try:
        urllib.request.urlretrieve(DB_URL, str(DB_PATH))
        print(f"Downloaded to {DB_PATH}")
    except Exception as e:
        print(f"Download failed: {e}")
        print(f"Please manually download from: {DB_URL}")
        print(f"Save as: {DB_PATH}")
        sys.exit(1)


def build_runner() -> AgentRunner:
    return AgentRunner(WORKSPACE, DB_PATH)



async def main():
    # 参数解析
    # 用法 1（推荐）: python agent.py --user alice "How many customers from Canada?"
    # 用法 2（兼容旧）: python agent.py "sql:run" "question"
    parser = argparse.ArgumentParser(description="Tpa_RuYiBot Text-to-SQL Agent")
    parser.add_argument("--user", default=None, help="User ID for per-user memory isolation")
    parser.add_argument("--session", default="sql:run", help="Session key (default: sql:run)")
    parser.add_argument("question", nargs="*", help="The question to ask")
    args, unknown = parser.parse_known_args()

    # 兼容旧式位置参数：python agent.py "session_key" "question"
    if args.user is None and unknown:
        # 旧模式：第一个位置参数当 session，其余为问题
        args.session = unknown[0] if unknown else "sql:run"
        args.question = unknown[1:] if len(unknown) > 1 else args.question

    user_id = args.user or args.session  # 未指定 --user 时以 session_key 作为 user_id
    session_key = args.session
    
    # 智能对齐：如果指定了 --user 但 session 处于默认的 'sql:run'，则自动将会话隔离为 'sql:run_{user_id}'
    # 这样可以确保不同用户的短期会话历史（Chat History）也完全物理隔离，不会发生对话上下文串台
    if args.user and args.session == "sql:run":
        session_key = f"sql:run_{user_id}"
        
    question = " ".join(args.question) if args.question else "How many customers are from Canada?"

    ensure_db()

    runner = build_runner()
    loop = runner.loop

    print(f"\n{'='*20} Tpa_RuYiBot Text-to-SQL Agent {'='*20}")
    print(f"User ID:      {user_id}")
    print(f"Session Key:  {session_key}")
    print(f"User Question: {question}")

    # 打印加载的技能和工具
    all_skills = loop.context.skills.list_skills()
    workspace_skills = [s for s in all_skills if str(WORKSPACE) in s.get("path", "")]
    builtin_skills = [s for s in all_skills if str(WORKSPACE) not in s.get("path", "")]

    ws_skill_names = ", ".join(s["name"] for s in workspace_skills) if workspace_skills else "None"
    bi_skill_names = ", ".join(s["name"] for s in builtin_skills) if builtin_skills else "None"
    tool_names = ", ".join(loop.tools._tools.keys())

    print(f"\n[📦 资产清单]")
    print(f"├─ 自定义技能 ({len(workspace_skills)}): {ws_skill_names}")
    print(f"├─ 系统内置技能 ({len(builtin_skills)}): {bi_skill_names}")
    print(f"└─ 注册工具 ({len(loop.tools._tools)}): {tool_names}")
    print(f"\n{'*'*50}\n[🤖 Agent 开始思考...]")

    answer = await runner.run(question, user_id=user_id, session_key=session_key, hooks=[PrintHook(WORKSPACE)])

    print(f"\n{'='*60}")
    print(f"Answer: {answer}")
    print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
