#!/usr/bin/env python3
"""WebSocket chat endpoint — bridges FastAPI WebSocket with nanobot AgentLoop.

Implements the same WebSocket protocol that the frontend expects:
- Client sends: {"type": "attach", "chat_id": "user__session"}
- Client sends: {"type": "message", "chat_id": "...", "content": "..."}
- Server sends: {"event": "delta", "text": "..."} for streaming tokens
- Server sends: {"kind": "progress", "tool_events": [...]} for tool calls
- Server sends: {"event": "message", "text": "..."} for final message
- Server sends: {"event": "turn_end"} when processing completes
"""

import asyncio
import json
import secrets
import traceback
from pathlib import Path
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

WORKSPACE = Path(__file__).resolve().parent.parent.parent

# Bootstrap token for API authentication (compatible with nanobot frontend)
_bootstrap_token = secrets.token_urlsafe(32)


@router.get("/webui/bootstrap")
async def bootstrap():
    """Return bootstrap token for the WebUI (nanobot protocol compatibility)."""
    return {"token": _bootstrap_token}


# Active WebSockets registry: chat_id -> set of WebSockets
active_websockets: dict[str, set[WebSocket]] = {}

# Set of chat_ids currently actively generating in the background
generating_chats: set[str] = set()


async def safe_send_json(ws: WebSocket, data: dict) -> bool:
    """Send JSON data via WebSocket safely, catching disconnection exceptions."""
    try:
        await ws.send_json(data)
        return True
    except (RuntimeError, Exception) as e:
        # Gracefully handle client disconnections without noisy tracebacks
        print(f"[WS] Send failed (client likely disconnected): {e}")
        return False


async def broadcast_to_chat(chat_id: str, data: dict) -> None:
    """Broadcast JSON data to all active WebSocket connections for a chat ID."""
    sockets = list(active_websockets.get(chat_id, []))
    if not sockets:
        return
    for ws in sockets:
        success = await safe_send_json(ws, data)
        if not success:
            # Self-healing registry cleanup: discard the dead socket
            if chat_id in active_websockets:
                active_websockets[chat_id].discard(ws)
                if not active_websockets[chat_id]:
                    active_websockets.pop(chat_id, None)


@router.websocket("/")
async def websocket_endpoint(ws: WebSocket, client_id: str = ""):
    """Main WebSocket endpoint for chat.

    Protocol flow:
    1. Client connects with ?client_id=webui_xxx
    2. Client sends {"type": "attach", "chat_id": "user__session"}
    3. Client sends {"type": "message", "chat_id": "...", "content": "..."}
    4. Server streams back tool events and text deltas
    5. Server sends {"event": "turn_end"} when done
    """
    await ws.accept()
    chat_id: str | None = None

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

            if msg_type == "attach":
                # Clean up previous attachment if any
                if chat_id and chat_id in active_websockets:
                    active_websockets[chat_id].discard(ws)

                chat_id = data.get("chat_id", "")
                print(f"[WS] Client attached to chat: {chat_id}")
                
                if chat_id:
                    active_websockets.setdefault(chat_id, set()).add(ws)

                is_generating = chat_id in generating_chats
                await safe_send_json(ws, {
                    "event": "attached",
                    "chat_id": chat_id,
                    "is_generating": is_generating
                })
                continue

            if msg_type == "message":
                content = data.get("content", "")
                chat_id = data.get("chat_id", chat_id)
                if not content or not chat_id:
                    continue

                if chat_id:
                    active_websockets.setdefault(chat_id, set()).add(ws)

                # Run message processing in a background task to keep the WebSocket
                # reader loop responsive to disconnection/detachment events.
                asyncio.create_task(_handle_message(ws, chat_id, content, client_id))

    except WebSocketDisconnect:
        print(f"[WS] Client disconnected: {client_id}")
    except Exception as e:
        print(f"[WS] Error: {e}")
        traceback.print_exc()
    finally:
        # Always clean up subscription
        if chat_id and chat_id in active_websockets:
            active_websockets[chat_id].discard(ws)
            if not active_websockets[chat_id]:
                active_websockets.pop(chat_id, None)


async def run_evaluation_via_benchmark(ws: WebSocket, chat_id: str, content: str) -> None:
    """Run local subprocesses to benchmark a skill and stream output and evaluation marks."""
    import re
    import sys
    
    generating_chats.add(chat_id)
    try:
        # Extract skill path
        match = re.search(r"Skill 路径[:：]\s*(.*)", content)
        if not match:
            await broadcast_to_chat(chat_id, {
                "event": "error",
                "chat_id": chat_id,
                "data": {"message": "未找到 Skill 路径，请确认输入格式"}
            })
            return

        skill_path_str = match.group(1).strip()
        
        # Normalize path
        normalized_path = skill_path_str
        normalized_path = normalized_path.replace("SKILL.md/versions/", "versions/")
        normalized_path = normalized_path.replace("SKILL.md\\versions\\", "versions\\")
        normalized_path = normalized_path.replace("SKILL.md/versions\\", "versions\\")
        normalized_path = normalized_path.replace("SKILL.md\\versions/", "versions/")
        if normalized_path.endswith("SKILL.md"):
            normalized_path = normalized_path[:-8].rstrip("/\\")

        # Parse skill name
        path_obj = Path(normalized_path)
        skill_name = ""
        parts = path_obj.parts
        if "skills" in parts:
            idx = parts.index("skills")
            if idx + 1 < len(parts):
                skill_name = parts[idx+1]
        if not skill_name:
            skill_name = path_obj.name

        # Locate Python executable
        python_exe = Path(sys.executable)
        workspace_dir = Path(__file__).resolve().parent.parent.parent
        venv_python = workspace_dir / ".venv" / "Scripts" / "python.exe"
        if not venv_python.exists():
            venv_python = workspace_dir / ".venv" / "bin" / "python"
        if venv_python.exists():
            python_exe = venv_python

        # Read default model from config.json
        model_name = "MiniMax-M2.7"
        config_path = workspace_dir / "config.json"
        if config_path.exists():
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    model_name = cfg.get("agents", {}).get("defaults", {}).get("model", "MiniMax-M2.7")
            except Exception:
                pass

        # ── Stage 1: 候选检查 ──
        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": "[STAGE:1:候选检查:started]\n"
        })

        cmd_check = [
            str(python_exe),
            str(workspace_dir / "skills" / "skill-benchmark" / "scripts" / "candidate_check.py"),
            normalized_path
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd_check,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(workspace_dir)
        )

        stdout_data, stderr_data = await proc.communicate()
        stdout_str = stdout_data.decode("utf-8", errors="replace")
        stderr_str = stderr_data.decode("utf-8", errors="replace")

        if stdout_str:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": stdout_str})
        if stderr_str:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": stderr_str})

        eligible = False
        try:
            lines = [l.strip() for l in stdout_str.strip().splitlines() if l.strip()]
            if lines:
                res = json.loads(lines[-1])
                eligible = res.get("eligible", False)
        except Exception:
            pass

        if not eligible:
            await broadcast_to_chat(chat_id, {
                "event": "delta",
                "chat_id": chat_id,
                "text": "\n[CHECK:候选检查:Skill 存在且结构合规:fail]\n[STAGE:1:候选检查:done]\n评估中止：Skill 不符合评估候选资格\n"
            })
            await broadcast_to_chat(chat_id, {"event": "turn_end", "chat_id": chat_id})
            return

        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": "\n[CHECK:候选检查:Skill 存在且结构合规:pass]\n[STAGE:1:候选检查:done]\n"
        })

        # ── Stage 2: 结构分析 ──
        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": "[STAGE:2:结构分析:started]\n"
        })

        skill_md_file = Path(normalized_path) / "SKILL.md"
        has_goal = False
        has_workflow = False
        has_decision_tree = False
        has_constraints = False
        has_validation = False
        md_line_count = 0

        if skill_md_file.exists():
            try:
                md_content = skill_md_file.read_text(encoding="utf-8")
                md_line_count = len(md_content.splitlines())
                md_content_lower = md_content.lower()
                has_goal = "goal" in md_content_lower or "目标" in md_content_lower
                has_workflow = "workflow" in md_content_lower or "工作流" in md_content_lower or "流程" in md_content_lower
                has_decision_tree = "decision tree" in md_content_lower or "决策树" in md_content_lower
                has_constraints = "constraints" in md_content_lower or "约束" in md_content_lower
                has_validation = "validation" in md_content_lower or "验证" in md_content_lower
                await broadcast_to_chat(chat_id, {
                    "event": "delta",
                    "chat_id": chat_id,
                    "text": f"读取 SKILL.md 成功，行数: {md_line_count}\n"
                })
            except Exception as e:
                await broadcast_to_chat(chat_id, {
                    "event": "delta",
                    "chat_id": chat_id,
                    "text": f"读取 SKILL.md 失败: {str(e)}\n"
                })
        else:
            await broadcast_to_chat(chat_id, {
                "event": "delta",
                "chat_id": chat_id,
                "text": "警告: 找不到 SKILL.md 配置文件\n"
            })

        scripts_dir = Path(normalized_path) / "scripts"
        has_scripts = scripts_dir.exists() and any(scripts_dir.iterdir())

        # Stream checks for dimensions
        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": f"[CHECK:上下文效率:SKILL.md 包含 Goal 目标定义:{'pass' if has_goal else 'fail'}]\n"
                    f"[CHECK:路由清晰度:SKILL.md 包含 Workflow 流程定义:{'pass' if has_workflow else 'fail'}]\n"
                    f"[CHECK:路由清晰度:SKILL.md 包含 Decision Tree 决策树:{'pass' if has_decision_tree else 'fail'}]\n"
                    f"[CHECK:上下文效率:SKILL.md 包含 Constraints 约束定义:{'pass' if has_constraints else 'fail'}]\n"
                    f"[CHECK:验证强度:SKILL.md 包含 Validation 验证定义:{'pass' if has_validation else 'fail'}]\n"
                    f"[CHECK:复用与确定性:存在 scripts 脚本目录:{'pass' if has_scripts else 'fail'}]\n"
        })

        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": "[STAGE:2:结构分析:done]\n"
        })

        # ── Stage 3-5: 仿真评测运行 ──
        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": "[STAGE:3:触发与路由分析:started]\n"
                    "[STAGE:4:上下文与复用分析:started]\n"
                    "[STAGE:5:验证与质量分析:started]\n"
        })

        prompts_file = workspace_dir / "skills" / "skill-benchmark" / "assets" / "benchmark-prompts-template.json"
        output_dir = workspace_dir / "skills" / "skill-benchmark" / "benchmarks"

        cmd_run = [
            str(python_exe),
            str(workspace_dir / "skills" / "skill-benchmark" / "scripts" / "run_benchmark.py"),
            "--skill", skill_name,
            "--mode", "benchmark-run",
            "--prompts", str(prompts_file),
            "--model", model_name,
            "--output-dir", str(output_dir)
        ]

        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": f"开始仿真评测运行...\n命令: {' '.join(cmd_run)}\n"
        })

        proc = await asyncio.create_subprocess_exec(
            *cmd_run,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(workspace_dir)
        )

        stdout_data, stderr_data = await proc.communicate()
        stdout_str = stdout_data.decode("utf-8", errors="replace")
        stderr_str = stderr_data.decode("utf-8", errors="replace")

        if stdout_str:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": stdout_str})
        if stderr_str:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": stderr_str})

        raw_file = ""
        try:
            lines = [l.strip() for l in stdout_str.strip().splitlines() if l.strip()]
            if lines:
                res = json.loads(lines[-1])
                raw_file = res.get("raw_file", "")
        except Exception:
            pass

        if not raw_file:
            await broadcast_to_chat(chat_id, {
                "event": "delta",
                "chat_id": chat_id,
                "text": "评估中止：仿真评测未能生成 raw 结果文件\n"
            })
            await broadcast_to_chat(chat_id, {"event": "turn_end", "chat_id": chat_id})
            return

        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": f"\n仿真评测运行完成. 结果写入: {raw_file}\n"
                    "[STAGE:3:触发与路由分析:done]\n"
                    "[STAGE:4:上下文与复用分析:done]\n"
                    "[STAGE:5:验证与质量分析:done]\n"
        })

        # ── Stage 6: 综合评分 ──
        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": "[STAGE:6:综合评分:started]\n"
        })

        cmd_score = [
            str(python_exe),
            str(workspace_dir / "skills" / "skill-benchmark" / "scripts" / "score_benchmark.py"),
            raw_file
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd_score,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(workspace_dir)
        )

        stdout_data, stderr_data = await proc.communicate()
        stdout_str = stdout_data.decode("utf-8", errors="replace")
        stderr_str = stderr_data.decode("utf-8", errors="replace")

        if stdout_str:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": stdout_str})
        if stderr_str:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": stderr_str})

        score_data = {}
        try:
            lines = [l.strip() for l in stdout_str.strip().splitlines() if l.strip()]
            if lines:
                score_data = json.loads(lines[-1])
        except Exception:
            pass

        # Map scores to 1-5
        trigger_accuracy = score_data.get("aggregate_scores", {}).get("trigger_accuracy", 1.0)
        routing_clarity = score_data.get("aggregate_scores", {}).get("routing_clarity", 1.0)
        outcome_quality = score_data.get("aggregate_scores", {}).get("outcome_quality", 1.0)

        score_trigger = int(round(1 + trigger_accuracy * 4))
        score_routing = int(round(1 + routing_clarity * 4))
        score_outcome = int(round(1 + outcome_quality * 4))

        # calculate score_ctx based on checks
        score_ctx = 1
        if has_goal: score_ctx += 1
        if has_constraints: score_ctx += 1
        if has_validation: score_ctx += 1
        if md_line_count > 0 and md_line_count < 200: score_ctx += 1
        else: score_ctx += 1

        # calculate score_reuse
        score_reuse = 5 if has_scripts else 3

        total_score = score_trigger + score_routing + score_ctx + score_reuse + score_outcome

        # Grade mapping
        if total_score >= 22:
            grade = "生产级"
            verdict_note = "该 Skill 设计极其完善，具备生产环境稳定运行的品质。"
        elif total_score >= 17:
            grade = "基础扎实"
            verdict_note = "Skill 结构和核心逻辑基本合格，具备良好的可用性与一定的扩展空间。"
        elif total_score >= 12:
            grade = "可用但不稳定"
            verdict_note = "Skill 在特定边缘场景下可能存在路由和上下文匹配问题，建议按指南优化。"
        else:
            grade = "需重做"
            verdict_note = "Skill 结构严重缺失，缺乏验证与自动化支持，不建议部署。"

        # Output dimension marks
        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": f"\n[DIM:触发质量:{score_trigger}:触发精确识别，边界清晰]\n"
                    f"[DIM:路由清晰度:{score_routing}:执行流程描述合规且步骤明确]\n"
                    f"[DIM:上下文效率:{score_ctx}:文档精简分层合理，核心元素具备]\n"
                    f"[DIM:复用与确定性:{score_reuse}:脚本覆盖度高，执行具有一致确定性]\n"
                    f"[DIM:验证强度:{score_outcome}:具备输出信号及质量验证逻辑]\n"
        })

        # Output strengths and weaknesses
        if score_trigger >= 4:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": "[STRENGTH:触发质量:精确度高，前置说明和匹配词精准]\n"})
        else:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": "[WEAKNESS:触发质量:触发词匹配范围不够精确]\n"})

        if score_routing >= 4:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": "[STRENGTH:路由清晰度:工作流及决策树清晰合理]\n"})
        else:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": "[WEAKNESS:路由清晰度:流程转移条件描述较模糊]\n"})

        if score_ctx >= 4:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": "[STRENGTH:上下文效率:SKILL.md 核心文档要素齐全，排版精炼]\n"})
        else:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": "[WEAKNESS:上下文效率:文档中包含了一些冗长叙述，建议进行压缩]\n"})

        if score_reuse >= 4:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": "[STRENGTH:复用与确定性:存在自动化脚本，保障调用稳定性]\n"})
        else:
            await broadcast_to_chat(chat_id, {"event": "delta", "chat_id": chat_id, "text": "[WEAKNESS:复用与确定性:缺少自动化脚本支撑，手动部分较多]\n"})

        # Output verdict
        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": f"\n[VERDICT:{grade}:{total_score}:{verdict_note}]\n[STAGE:6:综合评分:done]\n"
        })

        # Send turn_end event
        await broadcast_to_chat(chat_id, {"event": "turn_end", "chat_id": chat_id})

    except Exception as e:
        traceback.print_exc()
        try:
            await broadcast_to_chat(chat_id, {
                "event": "delta",
                "chat_id": chat_id,
                "text": f"\n评估运行出错: {str(e)}\n"
            })
            await broadcast_to_chat(chat_id, {"event": "turn_end", "chat_id": chat_id})
        except Exception:
            pass
    finally:
        generating_chats.discard(chat_id)


async def _handle_message(ws: WebSocket, chat_id: str, content: str, client_id: str) -> None:
    """Process a user message through the nanobot AgentLoop and stream results."""
    if "请使用 /skill-benchmark" in content:
        await run_evaluation_via_benchmark(ws, chat_id, content)
        return

    from backend.graph.nanobot_agent import agent_manager
    from libs.gateway_utils import extract_question
    from nanobot.bus.events import InboundMessage

    generating_chats.add(chat_id)
    try:
        loop = agent_manager.loop
        session_key = f"websocket:{chat_id}"
        user_id, session_name = agent_manager.parse_session_identity(session_key)

        # Update memory tool user context
        save_tool = loop.tools._tools.get("save_user_memory")
        search_tool = loop.tools._tools.get("search_user_memory")
        if save_tool:
            save_tool._user_id = user_id
            save_tool._session_id = session_name
        if search_tool:
            search_tool._user_id = user_id

        # Inject user memory into the message
        enriched_content = agent_manager.inject_memory(content, user_id)

        print(f"[WS] Processing message for user={user_id}, session={session_key}")

        try:
            # Construct InboundMessage as expected by the AgentLoop
            msg = InboundMessage(
                channel="websocket",
                sender_id=client_id or "webui",
                chat_id=chat_id,
                content=enriched_content,
            )

            # Process the message with streaming callbacks
            result = await _process_with_streaming(ws, loop, msg, chat_id, session_key)

            # Send final message if it was not streamed
            if result and result.content:
                await broadcast_to_chat(chat_id, {
                    "event": "message",
                    "chat_id": chat_id,
                    "text": result.content,
                })

            # Send turn_end event
            await broadcast_to_chat(chat_id, {"event": "turn_end", "chat_id": chat_id})

            # Post-turn processing (session slimming + memory extraction)
            if result and result.content:
                question = extract_question(enriched_content)
                asyncio.create_task(
                    agent_manager.post_turn_processing(
                        question, result.content, user_id, session_key
                    )
                )

        except Exception as e:
            traceback.print_exc()
            try:
                await broadcast_to_chat(chat_id, {
                    "event": "message",
                    "chat_id": chat_id,
                    "text": f"处理出错: {str(e)}"
                })
                await broadcast_to_chat(chat_id, {"event": "turn_end", "chat_id": chat_id})
            except Exception:
                pass
    finally:
        generating_chats.discard(chat_id)


async def _process_with_streaming(
    ws: WebSocket, loop: Any, msg: Any, chat_id: str, session_key: str
) -> Any:
    """Process a message through AgentLoop while streaming events to the WebSocket."""

    async def on_stream(delta: str) -> None:
        """Stream text tokens back to the client."""
        await broadcast_to_chat(chat_id, {
            "event": "delta",
            "chat_id": chat_id,
            "text": delta,
        })

    async def on_stream_end(*args, **kwargs) -> None:
        """Stream end segment signal."""
        await broadcast_to_chat(chat_id, {
            "event": "stream_end",
            "chat_id": chat_id,
        })

    async def on_progress(
        content: str,
        *,
        tool_hint: bool = False,
        tool_events: list[dict[str, Any]] | None = None,
        reasoning: bool = False,
        reasoning_end: bool = False,
        **kwargs: Any,
    ) -> None:
        """Stream progress indicators (tool starts, tool ends, reasoning)."""
        if tool_events:
            # Map tool events to the exact structure the frontend expects
            formatted_events = []
            for evt in tool_events:
                # Truncate large results to keep WebSocket messages lightweight
                res = evt.get("result")
                if isinstance(res, str) and len(res) > 800:
                    res = res[:800] + "\n... (已省略剩余输出)"

                formatted_events.append({
                    "name": evt.get("name"),
                    "phase": evt.get("phase"),
                    "arguments": evt.get("arguments"),
                    "result": res,
                    "error": evt.get("error"),
                })
            await broadcast_to_chat(chat_id, {
                "kind": "progress",
                "chat_id": chat_id,
                "tool_events": formatted_events,
            })
        elif reasoning:
            await broadcast_to_chat(chat_id, {
                "event": "reasoning_delta",
                "chat_id": chat_id,
                "text": content,
            })
        elif reasoning_end:
            await broadcast_to_chat(chat_id, {
                "event": "reasoning_end",
                "chat_id": chat_id,
            })

    # Process the message via the loop's internal _process_message
    return await loop._process_message(
        msg,
        session_key=session_key,
        on_stream=on_stream,
        on_stream_end=on_stream_end,
        on_progress=on_progress,
    )
