"""
AIO Nexus — Cortex Vector Embedding & Hybrid Knowledge Retrieval Service
Upgrades the local-first Cortex vault with local vector embeddings via Ollama (nomic-embed-text),
cosine similarity vector ranking, and keyword BM25 fallback for zero-cloud-rent semantic retrieval.
"""

from __future__ import annotations

import json
import logging
import math
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("aio-nexus-cortex")


def dot_product(v1: List[float], v2: List[float]) -> float:
    return sum(a * b for a, b in zip(v1, v2))


def vector_norm(v: List[float]) -> float:
    return math.sqrt(sum(a * a for a in v))


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    norm1 = vector_norm(v1)
    norm2 = vector_norm(v2)
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot_product(v1, v2) / (norm1 * norm2)


class CortexService:
    """
    Local-first hybrid semantic & keyword knowledge retrieval engine.
    Computes vector embeddings using local Ollama instance with zero external cloud dependencies.
    """

    def __init__(self, provider=None, ollama_url: Optional[str] = None, embed_model: Optional[str] = None):
        self._provider = provider
        self.ollama_url = (ollama_url or os.getenv("OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/")
        self.embed_model = embed_model or os.getenv("OLLAMA_EMBED_MODEL") or "nomic-embed-text"
        self._embedding_cache: Dict[str, List[float]] = {}
        self.retrieval_limit_per_step = 2

    @property
    def provider(self):
        if self._provider is None:
            from backend.deps import provider as p
            self._provider = p
        return self._provider

    def get_embedding(self, text: str) -> Optional[List[float]]:
        """
        Fetch vector embedding for text from local Ollama instance.
        Caches results in memory to minimize compute.
        """
        cleaned = " ".join(text.strip().split())
        if not cleaned:
            return None

        cache_key = f"{self.embed_model}:{cleaned[:500]}"
        if cache_key in self._embedding_cache:
            return self._embedding_cache[cache_key]

        payload = json.dumps({
            "model": self.embed_model,
            "prompt": cleaned[:2000],
        }).encode("utf-8")

        # Try /api/embeddings (standard Ollama endpoint)
        req = urllib.request.Request(
            f"{self.ollama_url}/api/embeddings",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                vec = data.get("embedding")
                if isinstance(vec, list) and vec:
                    self._embedding_cache[cache_key] = [float(x) for x in vec]
                    return self._embedding_cache[cache_key]
        except Exception as err:
            logger.debug("Local Ollama /api/embeddings unavailable: %s (falling back to keyword)", err)

        # Try newer /api/embed endpoint
        payload_v2 = json.dumps({
            "model": self.embed_model,
            "input": cleaned[:2000],
        }).encode("utf-8")
        req_v2 = urllib.request.Request(
            f"{self.ollama_url}/api/embed",
            data=payload_v2,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req_v2, timeout=3.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                embeddings = data.get("embeddings")
                if isinstance(embeddings, list) and embeddings and isinstance(embeddings[0], list):
                    vec = [float(x) for x in embeddings[0]]
                    self._embedding_cache[cache_key] = vec
                    return vec
        except Exception:
            pass

        return None

    def query_vault(self, query: str, limit: int = 5, strategy: str = "hybrid") -> List[Dict[str, Any]]:
        """Unified entry point for knowledge retrieval from knowledge vault."""
        logger.info("Querying vault: '%s' [strategy=%s, limit=%d]", query[:80], strategy, limit)
        return self.retrieve_context(query, strategy=strategy, top_k=limit)

    def retrieve_context(
        self,
        query: str,
        tenant: Optional[str] = None,
        top_k: int = 5,
        strategy: str = "hybrid",
    ) -> List[Dict[str, Any]]:
        """
        Hybrid retrieval pipeline:
        1. Fast keyword retrieval over stored brain memories
        2. Local vector embedding computation and cosine similarity ranking
        3. Reciprocal Rank Fusion / hybrid score merging
        """
        results: List[Dict[str, Any]] = []

        # 1. Keyword search (always fast & robust fallback)
        try:
            keyword_results = self.provider.search_brain_memory(query, limit=top_k * 2) or []
        except Exception as e:
            logger.warning("Keyword brain search error: %s", e)
            keyword_results = []

        for rank, res in enumerate(keyword_results, start=1):
            res["retrieval_method"] = "keyword"
            res["keyword_rank"] = rank
            results.append(res)

        # 2. Semantic Search with local vector embeddings
        if strategy in ["semantic", "hybrid"]:
            semantic_results = self._rank_semantic(query, limit=top_k * 2)
            for rank, res in enumerate(semantic_results, start=1):
                res["semantic_rank"] = rank
                # Check if item is already in results; if so, annotate with semantic score
                existing = next((r for r in results if (r.get("id") or r.get("title")) == (res.get("id") or res.get("title"))), None)
                if existing:
                    existing["similarity"] = res.get("similarity", 0.0)
                    existing["retrieval_method"] = "hybrid"
                else:
                    results.append(res)

        # 3. Score normalization and hybrid ranking
        ranked_results = self._hybrid_rank(results)
        return ranked_results[:top_k]

    def _rank_semantic(self, query: str, limit: int) -> List[Dict[str, Any]]:
        """
        Computes cosine similarity between query embedding and vault chunks.
        Falls back to term-frequency keyword matching if Ollama is offline.
        """
        try:
            all_chunks = self.provider.list_brain_chunks() if hasattr(self.provider, "list_brain_chunks") else []
        except Exception:
            all_chunks = []

        if not all_chunks:
            # Fall back to brain items if chunks not isolated
            try:
                all_chunks = self.provider.list_brain_items() if hasattr(self.provider, "list_brain_items") else []
            except Exception:
                all_chunks = []

        if not all_chunks:
            return []

        query_vector = self.get_embedding(query)
        scored: List[Tuple[float, Dict[str, Any]]] = []

        if query_vector:
            # Full semantic cosine similarity
            for chunk in all_chunks:
                content = str(chunk.get("content") or chunk.get("excerpt") or chunk.get("title") or "")
                if not content:
                    continue
                chunk_vector = self.get_embedding(content)
                if chunk_vector:
                    sim = cosine_similarity(query_vector, chunk_vector)
                    if sim > 0.15:
                        chunk_copy = dict(chunk)
                        chunk_copy["similarity"] = round(sim, 4)
                        chunk_copy["retrieval_method"] = "semantic-vector"
                        scored.append((sim, chunk_copy))
        else:
            # Term-frequency fallback when Ollama is offline
            query_terms = set(query.lower().split())
            for chunk in all_chunks:
                content = str(chunk.get("content") or chunk.get("excerpt") or "").lower()
                score = sum(1.0 for term in query_terms if term in content)
                if score > 0:
                    chunk_copy = dict(chunk)
                    chunk_copy["similarity"] = round(score / (len(query_terms) or 1), 4)
                    chunk_copy["retrieval_method"] = "semantic-frequency"
                    scored.append((score, chunk_copy))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored[:limit]]

    def _hybrid_rank(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Deduplicates and sorts results by hybrid reciprocal rank fusion:
        Score = 1 / (60 + keyword_rank) + 1 / (60 + semantic_rank) + similarity_boost
        """
        seen_ids = set()
        scored_items: List[Tuple[float, Dict[str, Any]]] = []

        for r in results:
            rid = str(r.get("id") or r.get("chunk_id") or r.get("title") or "").strip()
            if not rid or rid in seen_ids:
                continue
            seen_ids.add(rid)

            kw_rank = r.get("keyword_rank", 100)
            sem_rank = r.get("semantic_rank", 100)
            similarity = float(r.get("similarity") or 0.0)

            # RRF (Reciprocal Rank Fusion) formula
            rrf_score = (1.0 / (60.0 + kw_rank)) + (1.0 / (60.0 + sem_rank)) + (similarity * 0.5)
            scored_items.append((rrf_score, r))

        scored_items.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored_items]

    def get_context_summary(self, results: List[Dict[str, Any]]) -> str:
        """Serializes retrieved knowledge into a clean context prompt block."""
        if not results:
            return "No relevant knowledge found in vault."

        summary_blocks = []
        for i, item in enumerate(results, start=1):
            title = item.get("title") or item.get("label") or "Knowledge Source"
            content = item.get("content") or item.get("content_excerpt") or item.get("excerpt") or ""
            method = item.get("retrieval_method", "hybrid")
            sim = f" (relevance: {item['similarity']:.2f})" if "similarity" in item else ""
            summary_blocks.append(f"[{i}] {title}{sim} [{method}]\n{content[:800]}...")

        return "---\nVAULT KNOWLEDGE CONTEXT:\n" + "\n\n".join(summary_blocks) + "\n---\n"


# Singleton instance
cortex_service = CortexService()
