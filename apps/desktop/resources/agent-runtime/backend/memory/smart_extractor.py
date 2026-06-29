"""SmartExtractor — mem0 智能提取节流器（nanobot_sql CLI 适配版）。

基于 mini_OpenClaw_v5 机制，针对 CLI 单次运行进程退出的特点，使用本地 file 持久化状态：
1. 节流控制：累积每 N 轮才自动提取一次，大幅节省 LLM token 费用
2. 主动写互斥：若主 Agent 已通过 save_user_memory 工具主动保存了记忆，则自动跳过本轮，防止重复提取
3. 状态持久化：将会话消息缓冲区和计数器保存到 `sessions/{session_key}_extractor.json`，确保多次 CLI 运行之间数据连贯
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# 移动到 libs 目录后，WORKSPACE 指向项目根目录 (上级目录)
WORKSPACE = Path(__file__).resolve().parent.parent


@dataclass
class _SessionState:
    """单个 session 的节流状态。"""
    turns_since_last: int = 0
    message_buffer: list[dict[str, str]] = field(default_factory=list)
    agent_wrote_this_turn: bool = False


# 全局 session 状态池（运行时缓存）
_sessions: dict[str, _SessionState] = {}
_THROTTLE_EVERY = 1  # 默认每 1 轮提取一次


class SmartExtractor:
    """mem0 智能提取节流器（单例）。"""

    def __init__(self, throttle_every: int = 3) -> None:
        self._throttle_every = throttle_every

    @staticmethod
    def _safe_key(key: str) -> str:
        return key.replace(":", "_").replace("/", "_").replace("\\", "_")

    def _get_state(self, session_key: str) -> _SessionState:
        """获取 session 状态（优先从运行时缓存读取，否则从本地 JSON 文件加载）。"""
        if session_key not in _sessions:
            safe_key = self._safe_key(session_key)
            state_file = WORKSPACE / "sessions" / f"{safe_key}_extractor.json"
            
            if state_file.exists():
                try:
                    data = json.loads(state_file.read_text(encoding="utf-8"))
                    _sessions[session_key] = _SessionState(
                        turns_since_last=data.get("turns_since_last", 0),
                        message_buffer=data.get("message_buffer", []),
                        agent_wrote_this_turn=data.get("agent_wrote_this_turn", False)
                    )
                except Exception:
                    _sessions[session_key] = _SessionState()
            else:
                _sessions[session_key] = _SessionState()
        return _sessions[session_key]

    def _save_state(self, session_key: str, state: _SessionState) -> None:
        """持久化 session 状态到本地 JSON 文件。"""
        safe_key = self._safe_key(session_key)
        sessions_dir = WORKSPACE / "sessions"
        sessions_dir.mkdir(parents=True, exist_ok=True)
        state_file = sessions_dir / f"{safe_key}_extractor.json"
        
        try:
            data = {
                "turns_since_last": state.turns_since_last,
                "message_buffer": state.message_buffer,
                "agent_wrote_this_turn": state.agent_wrote_this_turn
            }
            state_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            print(f"[WARN] 智能记忆提取器状态保存失败: {e}")

    def mark_agent_wrote(self, session_key: str) -> None:
        """标记本轮主 Agent 已通过 save_user_memory 主动写入记忆。"""
        state = self._get_state(session_key)
        state.agent_wrote_this_turn = True
        self._save_state(session_key, state)

    async def async_on_turn_end(
        self, messages: list[dict[str, str]], user_id: str, session_key: str
    ) -> dict[str, Any] | None:
        """每轮对话结束时调用，异步进行事实提取与存储。"""
        state = self._get_state(session_key)
        state.message_buffer.extend(messages)
        state.turns_since_last += 1

        # 1. 互斥检测：如果主 Agent 已通过工具主动写过记忆，则清空缓冲，重置计数
        if state.agent_wrote_this_turn:
            print(f"\n[🧠 智能记忆提取] 检测到主 Agent 已主动写入记忆，自动跳过本轮背景提取")
            state.agent_wrote_this_turn = False
            state.message_buffer.clear()
            state.turns_since_last = 0
            self._save_state(session_key, state)
            return None

        # 2. 节流控制：未达阈值（默认 3 轮），继续缓冲并持久化
        if state.turns_since_last < self._throttle_every:
            print(f"\n[🧠 智能记忆提取] 节流蓄力中（当前 {state.turns_since_last}/{self._throttle_every} 轮，已累积 {len(state.message_buffer)} 条对话）")
            self._save_state(session_key, state)
            return None

        # 3. 触发提取：复制快照并清空当前状态（防并发，先清空再异步执行）
        print(f"\n[🧠 智能记忆提取] 蓄力已满（第 {self._throttle_every} 轮），正在异步从这 {len(state.message_buffer)} 条对话历史中提炼长期记忆事实...")
        buffer_snapshot = list(state.message_buffer)
        state.message_buffer.clear()
        state.turns_since_last = 0
        self._save_state(session_key, state)

        try:
            from backend.memory.mem0_manager import mem0_manager
            if not mem0_manager.is_available():
                return None

            import asyncio
            loop = asyncio.get_running_loop()
            
            # 使用线程池执行同步 I/O，不阻塞主线程
            result = await loop.run_in_executor(
                None, 
                mem0_manager.add, 
                buffer_snapshot, 
                user_id,
                session_key
            )
            
            if result and result.get("results"):
                print(f"[🧠 智能记忆提取] 🎉 提取成功！自动识别并保存了 {len(result['results'])} 条长期事实：")
                for item in result["results"]:
                    print(f"  └─ {item.get('memory')}")
            else:
                print(f"[🧠 智能记忆提取] 提取完成，本轮无新增价值的长期事实")
            return result

        except Exception as e:
            # 失败重试机制：将快照放回缓冲区，等待下一轮继续重试
            print(f"[🧠 智能记忆提取] ⚠️ 提取失败: {e}，对话内容已保留，将在下一轮重试")
            # 重新加载最新状态，合并快照
            current_state = self._get_state(session_key)
            current_state.message_buffer = buffer_snapshot + current_state.message_buffer
            current_state.turns_since_last = self._throttle_every - 1
            self._save_state(session_key, current_state)
            return None


# 初始化全局单例
smart_extractor = SmartExtractor(throttle_every=_THROTTLE_EVERY)

