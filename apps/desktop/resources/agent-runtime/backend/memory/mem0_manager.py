"""Mem0Manager — mem0 长期记忆管理器，懒加载单例模式。

移植自 mini_OpenClaw_v5，适配 nanobot_sql 项目：
- 使用 config.json 中的 mem0 配置段
- 无需 contextvars（CLI 场景，user_id 直接传参）
- 默认向量存储：qdrant（内存模式，无需部署）
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

# Suppress spaCy optional warning logs from mem0
logging.getLogger("mem0.utils.spacy_models").setLevel(logging.ERROR)

# Claude Code 记忆类型体系规则分类关键词
_TYPE_KEYWORDS: dict[str, list[str]] = {
    "feedback": [
        "不要", "禁止", "规则", "避免", "风格", "方式", "偏好",
        "总结模式", "不需要", "请不要", "停止", "不再",
    ],
    "project": [
        "项目", "数据库", "表", "查询", "字段", "任务", "进度", "需求",
    ],
    "reference": [
        "文档", "链接", "地址", "路径", "api", "配置", "url",
    ],
}

# 移动到 libs 目录后，config.json 在上级目录
_CONFIG_FILE = Path(__file__).resolve().parent.parent / "config.json"


def _load_mem0_config() -> dict[str, Any]:
    """从 config.json 读取 mem0 配置。"""
    try:
        data = json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
        return data.get("mem0", {})
    except Exception:
        return {}


class Mem0Manager:
    """mem0 长期记忆单例管理器（nanobot_sql CLI 版本）。"""

    def __init__(self) -> None:
        self._memory = None       # mem0 Memory 实例（懒加载）
        self._initialized = False  # 是否已尝试初始化
        self._available = False    # 初始化是否成功

    def _ensure_initialized(self) -> None:
        """懒加载：首次调用时初始化 mem0。"""
        if self._initialized:
            return

        # 第一步：检测 mem0 是否安装
        try:
            from mem0 import Memory
        except ImportError:
            self._initialized = True
            self._available = False
            print("[WARN] mem0 未安装，请运行: uv pip install mem0ai -p D:\\Pyprojects\\nanobot-main\\.venv\\Scripts\\python.exe")
            return

        # 第二步：读取配置并初始化
        try:
            full_cfg = {}
            if _CONFIG_FILE.exists():
                full_cfg = json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
            cfg = full_cfg.get("mem0", {})
            if not cfg:
                print("[WARN] config.json 中未找到 mem0 配置段")
                self._initialized = True
                return

            # 构建 mem0 Memory.from_config() 所需的配置
            mem0_config: dict[str, Any] = {}

            if "llm" in cfg:
                mem0_config["llm"] = cfg["llm"]

            if "embedder" in cfg:
                mem0_config["embedder"] = cfg["embedder"]

            if "vector_store" in cfg:
                mem0_config["vector_store"] = cfg["vector_store"]

            # 优先从根节点读取全局 custom_instructions，并向下兼容 mem0 嵌套字段
            custom_instructions = full_cfg.get("custom_instructions") or cfg.get("custom_instructions", "")
            if custom_instructions:
                mem0_config["custom_instructions"] = custom_instructions

            # 动态注入以支持在不修改 mem0 源码的情况下将自定义字段写入 Milvus 静态列
            try:
                from mem0.utils.factory import VectorStoreFactory
                from mem0.vector_stores.milvus import MilvusDB
                from pymilvus import FieldSchema, DataType, CollectionSchema, Function, FunctionType
                import logging
                
                logger = logging.getLogger(__name__)

                class CustomMilvusDB(MilvusDB):
                    def create_col(
                        self,
                        collection_name: str,
                        vector_size: int,
                        metric_type = None,
                    ) -> None:
                        if metric_type is None:
                            from mem0.configs.vector_stores.milvus import MetricType
                            metric_type = MetricType.COSINE

                        if self.client.has_collection(collection_name):
                            desc: Any = self.client.describe_collection(collection_name=collection_name)
                            # Handle both dict and object return types from different pymilvus versions
                            fields = desc.get("fields", []) if isinstance(desc, dict) else getattr(desc, "fields", [])
                            field_names = set()
                            for f in fields:
                                name = f.get("name") if isinstance(f, dict) else getattr(f, "name", "")
                                if name:
                                    field_names.add(name)
                            
                            has_custom_fields = "user_id" in field_names and "session_id" in field_names and "updatedtime" in field_names
                            self._has_bm25_schema = "text" in field_names and "sparse" in field_names
                            
                            if has_custom_fields:
                                logger.info(f"Collection {collection_name} already exists with custom fields. Skipping creation.")
                                return
                            else:
                                logger.info(f"Collection {collection_name} exists but lacks custom fields. Recreating...")
                                self.client.drop_collection(collection_name=collection_name)

                        fields = [
                            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=512),
                            FieldSchema(name="vectors", dtype=DataType.FLOAT_VECTOR, dim=vector_size),
                            FieldSchema(name="metadata", dtype=DataType.JSON),
                            FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535, enable_analyzer=True),
                            FieldSchema(name="sparse", dtype=DataType.SPARSE_FLOAT_VECTOR),
                            # Custom static fields
                            FieldSchema(name="user_id", dtype=DataType.VARCHAR, max_length=256),
                            FieldSchema(name="session_id", dtype=DataType.VARCHAR, max_length=256),
                            FieldSchema(name="updatedtime", dtype=DataType.VARCHAR, max_length=256),
                        ]
                        schema = CollectionSchema(fields, enable_dynamic_field=True)
                        
                        bm25_function = Function(
                            name="bm25",
                            input_field_names=["text"],
                            output_field_names=["sparse"],
                            function_type=FunctionType.BM25,
                        )
                        schema.add_function(bm25_function)
                        
                        index_params = self.client.prepare_index_params()
                        index_params.add_index(
                            field_name="vectors", metric_type=metric_type, index_type="AUTOINDEX", index_name="vector_index"
                        )
                        index_params.add_index(
                            field_name="sparse",
                            index_type="SPARSE_INVERTED_INDEX",
                            metric_type="BM25",
                            index_name="sparse_index",
                        )
                        self.client.create_collection(collection_name=collection_name, schema=schema, index_params=index_params)
                        self._has_bm25_schema = True
                        logger.info(f"Collection {collection_name} successfully created with custom fields user_id, session_id, updatedtime.")

                    def insert(self, ids, vectors, payloads, **kwargs):
                        def _build_record(idx, embedding, metadata):
                            record = {"id": idx, "vectors": embedding, "metadata": metadata}
                            for key in ["user_id", "session_id", "updatedtime"]:
                                record[key] = (metadata.get(key) or "") if metadata else ""
                            if self._has_bm25_schema:
                                record["text"] = (metadata.get("text_lemmatized") or metadata.get("data", ""))[:65535] if metadata else ""
                            return record

                        data = [_build_record(idx, embedding, metadata) for idx, embedding, metadata in zip(ids, vectors, payloads)]
                        # Filter kwargs to avoid positional mismatch in MilvusClient.insert
                        insert_kwargs = {k: v for k, v in kwargs.items() if k not in ["collection_name", "data"]}
                        self.client.insert(collection_name=self.collection_name, data=data, **insert_kwargs)  # type: ignore

                    def update(self, vector_id=None, vector=None, payload=None):
                        if vector_id is None:
                            return
                        if vector is None or payload is None:
                            existing: Any = self.client.get(collection_name=self.collection_name, ids=[vector_id])
                            if not existing:
                                raise ValueError(f"Vector with id {vector_id} not found in collection {self.collection_name}")
                            if vector is None:
                                vector = existing[0].get("vectors") if isinstance(existing[0], dict) else getattr(existing[0], "vectors", None)
                            if payload is None:
                                payload = existing[0].get("metadata") if isinstance(existing[0], dict) else getattr(existing[0], "metadata", None)

                        text = ""
                        if payload:
                            text = (payload.get("text_lemmatized") or payload.get("data", ""))[:65535]
                        schema = {"id": vector_id, "vectors": vector, "metadata": payload, "text": text}
                        for key in ["user_id", "session_id", "updatedtime"]:
                            schema[key] = (payload.get(key) or "") if payload else ""
                        self.client.upsert(collection_name=self.collection_name, data=schema)


                original_create = VectorStoreFactory.create
                @classmethod
                def custom_create(cls, provider_name, config):
                    if provider_name == "milvus":
                        if not isinstance(config, dict):
                            config = config.model_dump()
                        return CustomMilvusDB(**config)
                    return original_create(provider_name, config)
                VectorStoreFactory.create = custom_create  # type: ignore
                logger.info("[INFO] Successfully injected CustomMilvusDB dynamic subclass.")
            except Exception as ex:
                print(f"[WARN] Failed to dynamically patch MilvusDB: {ex}")

            self._memory = Memory.from_config(mem0_config)
            self._available = True
            self._initialized = True
            print("[INFO] mem0 Memory 初始化完成")
        except Exception as e:
            self._available = False
            print(f"[WARN] mem0 初始化失败: {e}")

    def is_available(self) -> bool:
        """检查 mem0 是否可用。"""
        self._ensure_initialized()
        return self._available

    def search(
        self, query: str, user_id: str, limit: int = 5, score_threshold: float = 0.0
    ) -> list[dict[str, Any]]:
        """检索与 query 最相关的记忆条目。

        Returns: [{"memory": "...", "score": 0.85, "id": "..."}, ...]
        """
        if not self.is_available() or self._memory is None:
            return []
        try:
            # mem0 v2.x: user_id via filters instead of top-level kwarg
            try:
                results = self._memory.search(query, filters={"user_id": user_id}, limit=limit)
            except TypeError:
                # fallback for v1.x
                results = self._memory.search(query, user_id=user_id, limit=limit)
            items = results.get("results", [])
            if score_threshold > 0:
                items = [r for r in items if r.get("score", 0) >= score_threshold]
            return items
        except Exception as e:
            print(f"[WARN] mem0 search 失败: {e}")
            return []

    def add(
        self,
        messages: list[dict[str, str]],
        user_id: str,
        session_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """将对话消息提交给 mem0，自动提取关键事实。

        messages: [{"role": "user", "content": "..."}, ...]
        """
        if not self.is_available() or self._memory is None:
            return None
            
        # 自动注入定制元数据字段：user_id, session_id, updatedtime
        from datetime import datetime
        merged_meta = dict(metadata) if metadata else {}
        merged_meta["user_id"] = user_id
        merged_meta["updatedtime"] = datetime.now().isoformat()
        if session_id:
            merged_meta["session_id"] = session_id
            
        try:
            kwargs: dict[str, Any] = {"user_id": user_id, "metadata": merged_meta}
            result = self._memory.add(messages, **kwargs)
            return result
        except TypeError:
            # mem0 v2.x may use different signature; try without user_id kwarg
            try:
                kwargs2: dict[str, Any] = {"filters": {"user_id": user_id}, "metadata": merged_meta}
                result = self._memory.add(messages, **kwargs2)
                return result
            except Exception as e2:
                print(f"[WARN] mem0 add 失败 (v2 fallback): {e2}")
                return None
        except Exception as e:
            print(f"[WARN] mem0 add 失败: {e}")
            return None

    def get_all(self, user_id: str) -> list[dict[str, Any]]:
        """获取指定用户的全部记忆条目。"""
        if not self.is_available() or self._memory is None:
            return []
        try:
            # mem0 v2.x: user_id via filters
            try:
                results = self._memory.get_all(filters={"user_id": user_id})
            except TypeError:
                results = self._memory.get_all(user_id=user_id)
            return results.get("results", [])
        except Exception as e:
            print(f"[WARN] mem0 get_all 失败: {e}")
            return []

    def delete_all(self, user_id: str) -> bool:
        """删除指定用户的全部记忆。"""
        if not self.is_available() or self._memory is None:
            return False
        try:
            self._memory.delete_all(user_id=user_id)
            return True
        except Exception as e:
            print(f"[WARN] mem0 delete_all 失败: {e}")
            return False

    def _classify_type(self, memory_text: str) -> str:
        """规则分类：将记忆文本映射到四类型之一（feedback/project/reference/user）。"""
        text_lower = memory_text.lower()
        for mem_type in ("feedback", "project", "reference"):
            if any(kw in text_lower for kw in _TYPE_KEYWORDS[mem_type]):
                return mem_type
        return "user"

    def get_context_for_prompt(
        self, query: str, user_id: str, limit: int = 6, score_threshold: float = 0.1
    ) -> str:
        """检索记忆并格式化为可注入 prompt 的文本块。

        返回格式：
            ## 用户长期记忆
            - [用户画像] 张三，数据分析师
            - [项目上下文] 正在分析 Chinook 音乐数据库
            ...
        若无记忆则返回空字符串。
        """
        results = self.search(query, user_id=user_id, limit=limit, score_threshold=score_threshold)
        if not results:
            return ""

        type_labels = {
            "user": "用户画像",
            "feedback": "行为偏好",
            "project": "项目上下文",
            "reference": "参考信息",
        }
        lines = ["## 用户长期记忆"]
        for r in results:
            mem_text = r.get("memory", "")
            if not mem_text:
                continue
            metadata = r.get("metadata") or {}
            mem_type = metadata.get("type") or self._classify_type(mem_text)
            if mem_type not in type_labels:
                mem_type = "user"
            label = type_labels[mem_type]
            lines.append(f"- [{label}] {mem_text}")

        return "\n".join(lines) if len(lines) > 1 else ""


# 全局单例
mem0_manager = Mem0Manager()
