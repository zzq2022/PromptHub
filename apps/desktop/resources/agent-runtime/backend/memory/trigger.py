#!/usr/bin/env python3
"""将 session 历史写入对应 session 目录的 MEMORY.md（手写版本，不依赖 LLM）。"""

import sys
import io
from pathlib import Path
from datetime import datetime

# 强制 UTF-8 编码
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

# 移动到 libs 目录后，WORKSPACE 指向项目根目录 (上级目录)
WORKSPACE = Path(__file__).resolve().parent.parent.parent

from nanobot.session.manager import SessionManager


class SessionMemoryStore:
    """按 session_key 组织记忆的 MemoryStore。"""

    def __init__(self, workspace: Path, session_key: str):
        self.session_key = session_key
        self.memory_dir = workspace / "memory" / self._safe_key(session_key)
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.memory_file = self.memory_dir / "MEMORY.md"
        self.history_file = self.memory_dir / "HISTORY.md"

    @staticmethod
    def _safe_key(key: str) -> str:
        return key.replace(":", "_").replace("/", "_").replace("\\", "_")

    def read_long_term(self) -> str:
        if self.memory_file.exists():
            return self.memory_file.read_text(encoding="utf-8")
        return ""

    def write_long_term(self, content: str) -> None:
        self.memory_file.write_text(content, encoding="utf-8")

    def append_history(self, entry: str) -> None:
        with open(self.history_file, "a", encoding="utf-8") as f:
            f.write(entry.rstrip() + "\n\n")


async def save_session_memory(workspace: Path, session_key: str, user_id: str | None = None, provider = None) -> None:
    target_key = user_id or session_key
    sessions = SessionManager(workspace=workspace)
    store = SessionMemoryStore(workspace=workspace, session_key=target_key)

    session = sessions.get_or_create(session_key)
    
    if not session.messages:
        print(f"Session '{session_key}' is empty.")
        return

    # 1. 自动懒加载 MiniMax 官方 Provider 驱动（用于独立运行及解耦场景）
    if provider is None:
        from nanobot.config.loader import load_config
        from nanobot.providers.factory import make_provider
        
        config_path = workspace / "config.json"
        import os
        temp_config_path = workspace / f".temp_config_{os.getpid()}.json"
        
        try:
            import json
            with open(config_path, "r", encoding="utf-8") as f:
                cfg_data = json.load(f)
            cfg_data.pop("memory_backend", None)
            cfg_data.pop("mem0", None)
            cfg_data.pop("custom_instructions", None)
            cfg_data.pop("skills", None)
            cfg_data.pop("skill_llm", None)
            cfg_data.pop("skill_embedding", None)
            with open(temp_config_path, "w", encoding="utf-8") as f:
                json.dump(cfg_data, f, indent=2, ensure_ascii=False)
                
            config = load_config(temp_config_path)
            provider = make_provider(config)
        except Exception as e:
            print(f"[WARN] 自动初始化大模型 Provider 失败: {e}")
            return
        finally:
            if temp_config_path.exists():
                try:
                    temp_config_path.unlink()
                except Exception:
                    pass

    # 2. 从消息中提取最后 3 轮完整交互的问答对
    user_turns = []
    current_assistant = None
    
    for msg in reversed(session.messages):
        role = msg.get("role")
        content = (msg.get("content") or "").strip()
        
        if role == "assistant":
            # 忽略包含工具调用的过程消息，只抓取最终输出的文本回复
            if content and not msg.get("tool_calls"):
                current_assistant = content
        elif role == "user":
            # 剥离注入头部，提炼真实的干净用户问题
            if "---\n用户当前问题：" in content:
                content = content.split("---\n用户当前问题：")[-1].strip()
            elif "---\n用户当前问题:" in content:
                content = content.split("---\n用户当前问题:")[-1].strip()
            elif "---\nUser Question:" in content:
                content = content.split("---\nUser Question:")[-1].strip()
                
            if current_assistant:
                user_turns.append({"question": content, "answer": current_assistant})
                current_assistant = None
                if len(user_turns) >= 3:
                    break
                    
    if not user_turns:
        print("[📚 本地记忆提取] 没有找到有效的对话历史，跳过提取。")
        return
        
    user_turns.reverse()
    
    # 3. 构造对话流，请求 MiniMax 大模型提炼长期价值事实
    dialogue_lines = []
    for turn in user_turns:
        dialogue_lines.append(f"User: {turn['question']}\nAssistant: {turn['answer']}")
    dialogue_text = "\n\n".join(dialogue_lines)
    
    # 动态读取 config.json 中的统一 custom_instructions 补充指令
    custom_inst = ""
    try:
        import json
        config_path = workspace / "config.json"
        if config_path.exists():
            cfg_data = json.loads(config_path.read_text(encoding="utf-8"))
            custom_inst = cfg_data.get("custom_instructions") or cfg_data.get("mem0", {}).get("custom_instructions", "")
    except Exception:
        pass

    prompt = (
        "你是一个记忆事实提取专家。从下面的对话中提取关于【用户本人】的长期个人事实。\n\n"
        "=== 合格事实的例子 ===\n"
        "- 用户喜欢被称呼为alice哥\n"
        "- 用户偏好用中文展示结果\n"
        "- 用户的编程语言偏好是Java\n"
        "- 用户平时主要运动是打篮球\n\n"
        "=== 不合格内容的例子（绝对禁止输出） ===\n"
        "- 是否有用户的长期个人事实？  （这是疑问句，禁止）\n"
        "- 没有迹象表明用户有特殊偏好  （这是否定分析，禁止）\n"
        "- 这次对话只涉及一个临时查询  （这是对话描述，禁止）\n"
        "- 加拿大客户数量为8            （这是查询结果，禁止）\n\n"
        "=== 严格规则 ===\n"
        "1. 只输出关于用户本人的肯定性事实（用户是/喜欢/偏好/习惯...）\n"
        "2. 禁止输出分析过程、疑问句、否定句、对话描述\n"
        "3. 禁止提取临时性数据查询结果\n"
        "4. 如果没有任何事实，只返回一个字：无\n\n"
    )
    
    if custom_inst:
        prompt += f"=== 补充定制提取规则 (Custom Instructions) ===\n{custom_inst}\n\n"
        
    prompt += (
        f"对话历史：\n{dialogue_text}\n\n"
        "提炼结果（没有事实就只写 无）："
    )
    
    print("\n[📚 本地记忆提取] 正在调用 MiniMax 大模型提炼这 3 轮对话中的长期事实...")
    try:
        response = await provider.chat([{"role": "user", "content": prompt}])
        extracted_content = (response.content or "").strip()
    except Exception as e:
        print(f"[WARN] 调用大模型进行本地事实提取失败: {e}")
        return

    # 解析提炼的事实
    new_facts = []
    
    # 1. 移除可能存在的深度思考 <think>...</think> 标签内容，防止其干扰事实判断
    import re
    clean_resp = re.sub(r'<think>.*?</think>', '', extracted_content, flags=re.DOTALL).strip()
    
    # 兼容 LLM 返回 "无" 的多种变体
    clean_resp_lower = clean_resp.strip(".").strip().lower()
    if clean_resp and clean_resp_lower not in ("无", "无。", "none", "n/a", ""):
        for line in clean_resp.split("\n"):
            line = line.strip()
            if not line:
                continue
            
            # 支持多种格式 of 列表标记过滤（如：- 、* 、1. 等），也包容无标记的纯文本行
            fact = re.sub(r'^(?:[-*\u2022]|\d+\.)\s*', '', line).strip()
            if not fact:
                continue
                
            # 二次过滤：排除分析过程、疑问句、否定句、对话描述
            skip = False
            # 排除疑问句
            if "？" in fact or fact.endswith("?"):
                skip = True
            # 排除否定性/分析性描述
            if not skip:
                neg_kws = [
                    "没有迹象", "没有关于", "不确定", "是否有", "无法确定",
                    "不太可能", "可能表明", "更像是", "而不是", "暂无",
                    "这只是", "这次对话", "这可能", "不涉及", "未发现",
                    "只涉及", "临时", "问了", "回答了", "简单问答",
                    "没有", "不清楚", "无法判断",
                ]
                for kw in neg_kws:
                    if kw in fact:
                        skip = True
                        break
            if skip:
                print(f"  [过滤] 非事实内容被跳过: {fact}")
            else:
                new_facts.append(fact)
                
    # 4. 写入隔离文件夹下的 MEMORY.md
    existing_content = store.read_long_term().strip()
    existing_facts = set()
    if existing_content:
        for line in existing_content.split("\n"):
            line = line.strip()
            if line.startswith("-"):
                existing_facts.add(line.lstrip("- ").strip())
                
    unique_new_facts = [f for f in new_facts if f not in existing_facts]
    
    if unique_new_facts:
        fact_lines = [f"- {fact}" for fact in unique_new_facts]
        
        # 重构 MEMORY.md 标题与事实展示
        clean_old_lines = []
        if existing_content:
            for l in existing_content.split("\n"):
                if not (l.startswith("# User 长期记忆:") or l.startswith("更新时间:")):
                    clean_old_lines.append(l)
        clean_old_content = "\n".join(clean_old_lines).strip()
        
        updated_content = f"# User 长期记忆: {target_key}\n更新时间: {datetime.now().isoformat()}\n\n"
        updated_content += "\n".join(fact_lines) + "\n"
        if clean_old_content:
            updated_content += "\n" + clean_old_content + "\n"
            
        store.write_long_term(updated_content)
        print(f"[📚 本地记忆提取] 🎉 成功提炼并写入了 {len(unique_new_facts)} 条全新事实到 memory/{store._safe_key(target_key)}/MEMORY.md：")
        for f in unique_new_facts:
            print(f"  └─ - {f}")
    else:
        print("[📚 本地记忆提取] 本次交互中无新增的长期记忆事实，MEMORY.md 无需更新。")
        
    # 5. 严格仅将本次新增的 3 条用户提问写入到 HISTORY.md 中
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    history_lines = [f"- {turn['question']}" for turn in user_turns]
    
    # 提取人性化的 session_id 标识
    clean_session_name = session_key
    if "websocket:" in clean_session_name:
        clean_session_name = clean_session_name.split("websocket:", 1)[1]
    if "__" in clean_session_name:
        clean_session_name = clean_session_name.split("__", 1)[1]

    new_entry = (
        f"## {now_str}\n"
        f"本次新增 {len(user_turns)} 条记录：\n"
        + "\n".join(history_lines)
    )

    # 读取并解析现有的 HISTORY.md，实现会话级绝对合并与去重
    intro = ""
    session_sections = {}
    session_order = []

    if store.history_file.exists():
        try:
            content = store.history_file.read_text(encoding="utf-8")
            # 兼容：以 "# 会话:" 切割文件，获取各会话的分块内容
            sections = content.split("# 会话:")
            intro = sections[0].strip()
            
            for sec in sections[1:]:
                lines = sec.splitlines()
                if not lines:
                    continue
                sec_id = lines[0].strip()
                sec_body = "\n".join(lines[1:]).strip()
                if sec_id:
                    if sec_id not in session_sections:
                        session_sections[sec_id] = sec_body
                        session_order.append(sec_id)
                    else:
                        # 自动合并之前可能产生的重复会话分块
                        session_sections[sec_id] = (session_sections[sec_id] + "\n\n" + sec_body).strip()
        except Exception as e:
            print(f"[WARN] 读取并解析 HISTORY.md 失败: {e}")

    # 将本次的新提问追加到对应会话的分块中
    if clean_session_name in session_sections:
        session_sections[clean_session_name] = (session_sections[clean_session_name] + "\n\n" + new_entry).strip()
    else:
        session_sections[clean_session_name] = new_entry
        session_order.append(clean_session_name)

    # 重新组装完整的 HISTORY.md
    new_content = ""
    if intro:
        new_content += intro + "\n\n"
    
    for sec_id in session_order:
        new_content += f"# 会话: {sec_id}\n\n"
        new_content += session_sections[sec_id] + "\n\n"

    try:
        store.history_file.write_text(new_content.rstrip() + "\n\n", encoding="utf-8")
        print(f"[📚 本地记忆提取] 成功更新并层级合并 memory/{store._safe_key(target_key)}/HISTORY.md 变更历史（严格记录本次 {len(user_turns)} 条）。")
    except Exception as e:
        print(f"[WARN] 写入 HISTORY.md 失败: {e}")


def main():
    import asyncio
    if len(sys.argv) > 1:
        session_key = sys.argv[1]
    else:
        session_key = "user2"

    asyncio.run(save_session_memory(WORKSPACE, session_key))


if __name__ == "__main__":
    main()
