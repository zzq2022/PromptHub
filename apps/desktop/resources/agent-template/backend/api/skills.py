#!/usr/bin/env python3
"""Skills management API — CRUD, file tree, file read/write, versions, diff."""

import datetime
import json
import shutil
import urllib.parse
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

WORKSPACE = Path(__file__).resolve().parent.parent.parent


class CreateSkillRequest(BaseModel):
    name: str
    description: str = ""


class FileContentRequest(BaseModel):
    path: str
    content: str


class VersionRequest(BaseModel):
    label: str


class DiffRequest(BaseModel):
    version_a: str
    version_b: str


def _get_agent_loop():
    """Get the global AgentLoop instance."""
    from backend.graph.nanobot_agent import agent_manager
    return agent_manager.loop


def _list_all_skills() -> list[dict]:
    """List all available skills (active or disabled) in workspace and builtins."""
    try:
        loop = _get_agent_loop()
        if hasattr(loop, "context") and loop.context.skills:
            loader = loop.context.skills
            skills = loader._skill_entries_from_dir(loader.workspace_skills, "workspace")
            workspace_names = {entry["name"] for entry in skills}
            if loader.builtin_skills and loader.builtin_skills.exists():
                skills.extend(
                    loader._skill_entries_from_dir(loader.builtin_skills, "builtin", skip_names=workspace_names)
                )
            return skills
    except Exception:
        pass

    # Fallback to direct directory scan if loop not initialized
    try:
        skills_dir = WORKSPACE / "skills"
        if skills_dir.exists():
            entries = []
            for item in skills_dir.iterdir():
                if item.is_dir() and (item / "SKILL.md").exists():
                    entries.append({
                        "name": item.name,
                        "path": str(item / "SKILL.md"),
                        "source": "workspace"
                    })
            return entries
    except Exception:
        pass
    return []


def _list_loaded_skills() -> list[dict]:
    """List skills loaded by the AgentLoop."""
    try:
        loop = _get_agent_loop()
        if hasattr(loop, "context") and loop.context.skills:
            return loop.context.skills.list_skills()
    except Exception:
        pass
    return []


def _find_skill(skill_name: str) -> dict | None:
    """Find a specific skill by name among all available skills."""
    all_skills = _list_all_skills()
    return next((s for s in all_skills if s.get("name") == skill_name), None)


def _update_config_skill_status(skill_name: str, enabled: bool):
    """Update config.json's skills section to enable/disable a skill."""
    config_path = WORKSPACE / "config.json"
    if not config_path.exists():
        return
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        skills_cfg = data.setdefault("skills", {})
        if enabled:
            if isinstance(skills_cfg.get(skill_name), dict):
                skills_cfg[skill_name]["enabled"] = True
            else:
                skills_cfg[skill_name] = {"enabled": True}
        else:
            if isinstance(skills_cfg.get(skill_name), dict):
                skills_cfg[skill_name]["enabled"] = False
            else:
                skills_cfg[skill_name] = {"enabled": False}

        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[skills api] Failed to update config.json: {e}")


# ── Skills list and create ──────────────────────────────────────

@router.get("/skills")
async def list_skills():
    """List all available skills (both active and disabled)."""
    try:
        all_skills = _list_all_skills()
        skills = [
            {
                "name": s.get("name", ""),
                "path": s.get("path", ""),
                "description": f"Loaded via {s.get('source', 'workspace')}",
            }
            for s in all_skills
        ]
        return {"skills": skills}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skills")
async def create_skill(body: CreateSkillRequest):
    """Create a new skill directory with SKILL.md."""
    try:
        new_dir = WORKSPACE / "skills" / body.name
        new_dir.mkdir(parents=True, exist_ok=True)
        skill_md = new_dir / "SKILL.md"
        skill_md.write_text(f"# {body.name}\n\n{body.description}\n", encoding="utf-8")
        return {"name": body.name, "path": str(skill_md)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Active skills ───────────────────────────────────────────────

@router.get("/skills/active")
async def get_active_skills():
    """Get currently active skills."""
    try:
        loaded = _list_loaded_skills()
        skills = [
            {
                "name": s.get("name", ""),
                "description": f"Loaded via {s.get('source', 'workspace')}",
            }
            for s in loaded
        ]
        return {"skills": skills}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skills/unload")
async def unload_skill(body: dict):
    """Unload/disable a skill dynamically and persist to config."""
    skill_name = body.get("skill_name", "")
    if not skill_name:
        raise HTTPException(status_code=400, detail="skill_name is required")
    
    # 1. Persist status to config.json
    _update_config_skill_status(skill_name, enabled=False)

    # 2. Update running AgentLoop state dynamically
    try:
        loop = _get_agent_loop()
        if hasattr(loop, "context") and loop.context.skills:
            loop.context.skills.disabled_skills.add(skill_name)
        if hasattr(loop, "subagents"):
            loop.subagents.disabled_skills.add(skill_name)
    except Exception as e:
        print(f"[skills api] Failed to dynamically disable skill '{skill_name}': {e}")

    return {"status": "ok", "skill_name": skill_name}


@router.post("/skills/load")
async def load_skill(body: dict):
    """Load/enable a skill dynamically and persist to config."""
    skill_name = body.get("skill_name", "")
    if not skill_name:
        raise HTTPException(status_code=400, detail="skill_name is required")

    # 1. Persist status to config.json
    _update_config_skill_status(skill_name, enabled=True)

    # 2. Update running AgentLoop state dynamically
    try:
        loop = _get_agent_loop()
        if hasattr(loop, "context") and loop.context.skills:
            loop.context.skills.disabled_skills.discard(skill_name)
        if hasattr(loop, "subagents"):
            loop.subagents.disabled_skills.discard(skill_name)
    except Exception as e:
        print(f"[skills api] Failed to dynamically enable skill '{skill_name}': {e}")

    return {"status": "ok", "skill_name": skill_name, "message": "Skill loaded (workspace mode)"}



@router.post("/skills/{skill_name}/publish")
async def publish_skill(skill_name: str):
    """Mark a skill as published/approved — creates a 'published' version snapshot."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent
    label = "published"
    versions_dir = skill_dir / "versions" / label

    if not versions_dir.exists():
        versions_dir.mkdir(parents=True, exist_ok=True)
        for item in skill_dir.iterdir():
            if item.name == "versions":
                continue
            if item.is_file():
                shutil.copy2(item, versions_dir / item.name)
            elif item.is_dir():
                shutil.copytree(item, versions_dir / item.name, dirs_exist_ok=True)

    return {"status": "ok", "skill_name": skill_name, "version": label}


# ── Single skill detail and delete ──────────────────────────────

@router.get("/skills/{skill_name}")
async def get_skill_detail(skill_name: str):
    """Get detailed info about a specific skill."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_path = Path(found.get("path", ""))
    skill_dir = skill_path.parent

    content = ""
    if skill_path.exists():
        content = skill_path.read_text(encoding="utf-8")

    files = []
    if skill_dir.exists():
        for f in skill_dir.glob("*"):
            if f.is_file():
                stat = f.stat()
                files.append(
                    {
                        "name": f.name,
                        "size": stat.st_size,
                        "modified": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    }
                )

    return {
        "name": skill_name,
        "description": f"Loaded via {found.get('source', 'workspace')}",
        "path": str(skill_dir),
        "files": files,
        "content": content,
    }


@router.delete("/skills/{skill_name}")
async def delete_skill(skill_name: str):
    """Delete a skill directory."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent
    if skill_dir.exists() and "skills" in str(skill_dir):
        shutil.rmtree(skill_dir)
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Skill not found")


# ── Skill file tree ─────────────────────────────────────────────

@router.get("/skills/{skill_name}/tree")
async def get_skill_tree(skill_name: str):
    """Get the file tree for a skill."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent
    files = []
    if skill_dir.exists():
        for f in skill_dir.glob("*"):
            if f.is_file():
                stat = f.stat()
                files.append({"path": f.name, "type": "file", "size": stat.st_size})

    return {"name": skill_name, "files": files}


# ── Skill file read/write ───────────────────────────────────────

@router.get("/skills/{skill_name}/file")
async def read_skill_file(skill_name: str, path: str = ""):
    """Read a file within a skill directory."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent
    target_file = skill_dir / path
    if target_file.exists() and target_file.is_file():
        content = target_file.read_text(encoding="utf-8")
        language = "markdown" if path.endswith(".md") else "json"
        return {"path": path, "content": content, "language": language}

    raise HTTPException(status_code=404, detail="File not found")


@router.post("/skills/{skill_name}/file")
async def save_skill_file(skill_name: str, body: FileContentRequest):
    """Save a file within a skill directory."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent
    target_file = skill_dir / body.path
    target_file.write_text(body.content, encoding="utf-8")
    return {"status": "ok"}


# ── Skill versions ──────────────────────────────────────────────

@router.post("/skills/{skill_name}/versions")
async def create_version(skill_name: str, body: VersionRequest):
    """Create a version snapshot of a skill."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    label = body.label.strip()
    skill_dir = Path(found.get("path", "")).parent
    versions_dir = skill_dir / "versions" / label

    if versions_dir.exists():
        raise HTTPException(status_code=409, detail="Version already exists")

    versions_dir.mkdir(parents=True, exist_ok=True)
    for item in skill_dir.iterdir():
        if item.name == "versions":
            continue
        if item.is_file():
            shutil.copy2(item, versions_dir / item.name)
        elif item.is_dir():
            shutil.copytree(item, versions_dir / item.name)

    file_count = sum(1 for f in versions_dir.iterdir() if f.is_file())
    return {
        "label": label,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "file_count": file_count,
        "status": "created",
    }


@router.get("/skills/{skill_name}/versions")
async def list_versions(skill_name: str):
    """List all version snapshots of a skill."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent
    versions_base = skill_dir / "versions"
    if not versions_base.exists():
        return {"versions": []}

    versions = []
    for ver_dir in versions_base.iterdir():
        if not ver_dir.is_dir():
            continue
        stat = ver_dir.stat()
        file_count = sum(1 for f in ver_dir.iterdir() if f.is_file())
        versions.append(
            {
                "label": ver_dir.name,
                "created_at": datetime.datetime.fromtimestamp(
                    stat.st_mtime, tz=datetime.timezone.utc
                ).isoformat(),
                "file_count": file_count,
            }
        )

    versions.sort(key=lambda v: v["created_at"], reverse=True)
    return {"versions": versions}


@router.get("/skills/{skill_name}/versions/{label}")
async def get_version_content(skill_name: str, label: str):
    """Get SKILL.md content from a specific version."""
    skill_name = urllib.parse.unquote(skill_name)
    label = urllib.parse.unquote(label)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent
    version_dir = skill_dir / "versions" / label
    if not version_dir.is_dir():
        raise HTTPException(status_code=404, detail="Version not found")

    skill_md = version_dir / "SKILL.md"
    if not skill_md.exists():
        raise HTTPException(status_code=404, detail="SKILL.md not found in version")

    content = skill_md.read_text(encoding="utf-8")
    return {"label": label, "content": content}


# ── Skill version diff ──────────────────────────────────────────

@router.post("/skills/{skill_name}/diff")
async def diff_versions(skill_name: str, body: DiffRequest):
    """Compare SKILL.md content between two versions."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent

    def read_version(version: str) -> str:
        if version == "current":
            md_path = skill_dir / "SKILL.md"
        else:
            md_path = skill_dir / "versions" / version / "SKILL.md"
        if not md_path.exists():
            raise FileNotFoundError(f"SKILL.md not found for version {version}")
        return md_path.read_text(encoding="utf-8")

    try:
        content_a = read_version(body.version_a)
        content_b = read_version(body.version_b)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {
        "version_a": body.version_a,
        "version_b": body.version_b,
        "content_a": content_a,
        "content_b": content_b,
    }


# ── Skill Evaluation Results ─────────────────────────────────────

class FiveDimEvalResult(BaseModel):
    skill_name: str
    timestamp: float
    total_score: int
    grade: str
    verdict_note: str
    dimensions: list[dict]
    strengths: list[dict]
    weaknesses: list[dict]
    session_id: str


@router.post("/skills/{skill_name}/eval-result")
async def save_eval_result(skill_name: str, result: FiveDimEvalResult, version: str = None):
    """Save five-dimension evaluation result to the backend."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent
    if version and version != "current":
        eval_dir = skill_dir / "versions" / version / "evals"
    else:
        eval_dir = skill_dir / "evals"

    eval_dir.mkdir(parents=True, exist_ok=True)
    result_file = eval_dir / "five-dim-result.json"
    result_file.write_text(json.dumps(result.dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    return {"success": True}


@router.get("/skills/{skill_name}/eval-result")
async def get_eval_result(skill_name: str, version: str = None):
    """Read five-dimension evaluation result from the backend."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent
    if version and version != "current":
        result_file = skill_dir / "versions" / version / "evals" / "five-dim-result.json"
    else:
        result_file = skill_dir / "evals" / "five-dim-result.json"

    if not result_file.exists():
        raise HTTPException(status_code=404, detail="Evaluation result not found")

    try:
        data = json.loads(result_file.read_text(encoding="utf-8"))
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read evaluation result: {str(e)}")


@router.get("/skills/{skill_name}/eval-results-list")
async def list_eval_results(skill_name: str):
    """List all eval results across current and versioned snapshots."""
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill_dir = Path(found.get("path", "")).parent
    results = []

    # 1. Check current version
    current_file = skill_dir / "evals" / "five-dim-result.json"
    if current_file.exists():
        try:
            data = json.loads(current_file.read_text(encoding="utf-8"))
            results.append({
                "version": "current",
                "total_score": data.get("total_score", 0),
                "grade": data.get("grade", ""),
                "timestamp": data.get("timestamp", 0)
            })
        except Exception:
            pass

    # 2. Check version snapshots
    versions_dir = skill_dir / "versions"
    if versions_dir.exists():
        for ver_dir in versions_dir.iterdir():
            if ver_dir.is_dir():
                ver_file = ver_dir / "evals" / "five-dim-result.json"
                if ver_file.exists():
                    try:
                        data = json.loads(ver_file.read_text(encoding="utf-8"))
                        results.append({
                            "version": ver_dir.name,
                            "total_score": data.get("total_score", 0),
                            "grade": data.get("grade", ""),
                            "timestamp": data.get("timestamp", 0)
                        })
                    except Exception:
                        pass

    # Sort results by timestamp descending
    results.sort(key=lambda r: r["timestamp"], reverse=True)
    return {"results": results}


class OptimizeRequest(BaseModel):
    original_content: str
    evaluation_verdict: str = ""


@router.post("/skills/{skill_name}/optimize")
async def optimize_skill(skill_name: str, body: OptimizeRequest):
    """Generate optimization suggestions for the skill's SKILL.md using LLM."""
    import httpx
    skill_name = urllib.parse.unquote(skill_name)
    found = _find_skill(skill_name)
    if not found:
        raise HTTPException(status_code=404, detail="Skill not found")

    # 1. Load config for API keys
    config_path = WORKSPACE / "config.json"
    api_key = ""
    api_base = "https://api.minimaxi.com/v1"
    model = "MiniMax-M2.7"
    
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                model = cfg.get("agents", {}).get("defaults", {}).get("model", "MiniMax-M2.7")
                provider = cfg.get("agents", {}).get("defaults", {}).get("provider", "custom")
                prov_cfg = cfg.get("providers", {}).get(provider, {})
                api_key = prov_cfg.get("api_key", "")
                api_base = prov_cfg.get("api_base", "https://api.minimaxi.com/v1")
        except Exception:
            pass

    prompt = (
        "你是一个资深的 Agent 专家。下面是一个 Skill 的 SKILL.md 文档及针对它的五维度评估结果和诊断结论。\n"
        "请你仔细阅读评估结论中【得分较低】（低于 4 分）的维度以及【存在的问题/缺陷/建议】。\n"
        "你的任务是：**仅针对这些得分不高、存在问题或缺失的章节进行针对性的优化和修补。而对于得分高（4分及以上）、属于优势的章节或内容，请务必保留其原样，不要做无意义的修改或全局重写。**\n\n"
        "【设计与修改要求】\n"
        "1. 仔细对比评估结论，找出得分低于 4 分的维度（例如：如果触发质量低，就仅优化触发说明；如果验证强度低，就仅优化 Validation 章节；如果上下文效率低，就精简冗余文字等）。\n"
        "2. 对于得分在 4 分及以上的维度和章节，必须最大程度地保留原文档的文字、结构与细节，不做任何不必要的变动。\n"
        "3. 保持原文档的整体 Markdown 结构（包括 Frontmatter、各级标题等）不变，只在需要修补和优化的局部进行精准替换与润色，做到精准修补。\n\n"
        f"【评估诊断结论】\n{body.evaluation_verdict}\n\n"
        f"【当前的 SKILL.md 原文档内容如下】\n{body.original_content}\n\n"
        "【输出格式】\n"
        "请直接输出修补优化后的完整 SKILL.md 文档内容本身。禁止包含任何前后解释性说明，不要使用 Markdown 的 ``` 进行包裹。"
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    url = f"{api_base.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }
    
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            suggested = data["choices"][0]["message"]["content"]
            # Clean possible markdown wrap
            suggested = suggested.strip()
            if suggested.startswith("```markdown"):
                suggested = suggested[11:]
            elif suggested.startswith("```"):
                suggested = suggested[3:]
            if suggested.endswith("```"):
                suggested = suggested[:-3]
            suggested = suggested.strip()
            return {"suggested_content": suggested}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM 优化请求失败: {str(e)}")

