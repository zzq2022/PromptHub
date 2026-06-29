#!/usr/bin/env python3
"""
统一 LLM 配置读取模块

所有 Skills 脚本通过此处读取 config.json 中的 skill_llm / skill_embedding 配置，
避免在各脚本中硬编码 API Key 或环境变量。

使用方式：
    from llm_config import get_llm_config, get_embedding_config

    cfg  = get_llm_config()       # {"api_base", "api_key", "model", "ocr_model"}
    ecfg = get_embedding_config()  # {"api_base", "api_key", "model"}
"""

import json
from pathlib import Path

_WORKSPACE = Path(__file__).resolve().parent.parent
_cached_llm: dict | None = None
_cached_emb: dict | None = None


def _load_full() -> dict:
    config_path = _WORKSPACE / "config.json"
    if not config_path.exists():
        raise FileNotFoundError(f"config.json not found at {_WORKSPACE}")
    return json.loads(config_path.read_text(encoding="utf-8"))


def get_llm_config() -> dict:
    """
    返回 skill_llm 配置块。

    Returns:
        {
            "api_base":  str,   # OpenAI 兼容接口地址，如 https://api.gotoken.top/v1
            "api_key":   str,   # API 密钥
            "model":     str,   # 文本生成模型名称
            "ocr_model": str,   # OCR / 多模态模型名称
        }
    """
    global _cached_llm
    if _cached_llm is None:
        full = _load_full()
        llm = full.get("skill_llm", {})
        if not llm.get("api_key"):
            raise ValueError("config.json 中 skill_llm.api_key 未配置")
        _cached_llm = llm
    return _cached_llm


def get_embedding_config() -> dict:
    """
    返回 skill_embedding 配置块。

    Returns:
        {
            "api_base": str,
            "api_key":  str,
            "model":    str,   # 如 BAAI/bge-large-zh-v1.5
        }
    """
    global _cached_emb
    if _cached_emb is None:
        full = _load_full()
        emb = full.get("skill_embedding", {})
        if not emb.get("api_key"):
            raise ValueError("config.json 中 skill_embedding.api_key 未配置")
        _cached_emb = emb
    return _cached_emb


# ---------- 快捷对象构造（LangChain / OpenAI SDK） ----------

def get_llm(model: str | None = None, temperature: float = 0):
    """
    构造 LangChain ChatOpenAI 实例（OpenAI 兼容接口）。
    """
    from langchain_openai import ChatOpenAI
    cfg = get_llm_config()
    return ChatOpenAI(
        model=model or cfg["model"],
        api_key=cfg["api_key"],
        base_url=cfg["api_base"],
        temperature=temperature,
    )


def get_embeddings():
    """
    构造 LangChain OpenAIEmbeddings 实例。
    """
    from langchain_openai import OpenAIEmbeddings
    cfg = get_embedding_config()
    return OpenAIEmbeddings(
        model=cfg["model"],
        api_key=cfg["api_key"],
        base_url=cfg["api_base"],
    )


def get_openai_client():
    """
    构造 openai.OpenAI 客户端（用于原生 SDK 调用，如 OCR / 情感分析）。
    """
    from openai import OpenAI
    cfg = get_llm_config()
    return OpenAI(api_key=cfg["api_key"], base_url=cfg["api_base"])


def get_ocr_client():
    """
    构造 OCR 专用 OpenAI 客户端，model 通过 get_ocr_model() 获取。
    """
    from openai import OpenAI
    cfg = get_llm_config()
    return OpenAI(api_key=cfg["api_key"], base_url=cfg["api_base"])


def get_ocr_model() -> str:
    """返回 OCR / 多模态模型名称。"""
    cfg = get_llm_config()
    return cfg.get("ocr_model", "qwen-vl-plus")
