import logging
from typing import Any, Dict, List, Optional
from backend.data_provider import create_provider

logger = logging.getLogger(__name__)

class CortextService:
    def __init__(self, provider=None):
        self.provider = provider or create_provider()
        self.retrieval_limit_per_step = 2

    def query_vault(self, query: str, limit: int = 5, strategy: str = "hybrid") -> List[Dict[str, Any]]:
        """Unified entry point for knowledge retrieval."""
        logger.info(f"Querying vault: '{query}' [strategy={strategy}, limit={limit}]")
        return self.retrieve_context(query, strategy=strategy, top_k=limit)

    def retrieve_context(self, query: str, tenant: str | None = None, top_k: int = 5, strategy: str = "hybrid") -> List[Dict[str, Any]]:
        """
        Phase 14: Enhanced retrieval with semantic-ready abstraction.
        Preserves keyword fallback while supporting hybrid/semantic strategy hooks.
        """
        results = []
        
        # 1. Keyword search (Robust Fallback)
        keyword_results = self.provider.search_brain_memory(query, limit=top_k) or []
        for res in keyword_results:
            res["retrieval_method"] = "keyword"
            results.append(res)

        # 2. Semantic Search Hook (Semantic-ready abstraction)
        if strategy in ["semantic", "hybrid"]:
            # Utilizing granular chunks if they exist to provide better precision than items
            chunk_results = self._rank_chunks(query, limit=top_k)
            for res in chunk_results:
                res["retrieval_method"] = "semantic-abstraction"
                # Avoid duplicates by title/content hash in real scenarios; here by ID
                if not any(r.get("id") == res.get("id") for r in results):
                    results.append(res)

        # 3. Hybrid Re-ranking (Simple Scoring pass)
        unique_results = self._deduplicate_and_rank(results)
        return unique_results[:top_k]

    def _rank_chunks(self, query: str, limit: int) -> List[Dict[str, Any]]:
        """Simple ranker over brain_chunks as a semantic-ready placeholder."""
        try:
            all_chunks = self.provider.list_brain_chunks()
        except AttributeError:
            # Fallback if provider doesn't support brain_chunks yet
            return []
            
        scored: List[tuple[float, Dict[str, Any]]] = []
        query_terms = set(query.lower().split())
        
        for chunk in all_chunks:
            content = chunk.get("content", "").lower()
            # Simple keyword frequency on chunks provides more contextually relevant segments
            score = sum(1.0 for term in query_terms if term in content)
            if score > 0:
                scored.append((score, chunk))
        
        scored.sort(key=lambda x: x[0], reverse=True)
        return [item for score, item in scored[:limit]]

    def _deduplicate_and_rank(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen_ids = set()
        unique = []
        for r in results:
            rid = r.get("id") or r.get("chunk_id") or r.get("title")
            if rid not in seen_ids:
                unique.append(r)
                seen_ids.add(rid)
        return unique

    def get_context_summary(self, results: List[Dict[str, Any]]) -> str:
        """Helper to convert retrieval results into a string block for LLM context."""
        if not results:
            return "No relevant knowledge found in vault."
            
        summary_blocks = []
        for i, item in enumerate(results):
            title = item.get("title") or item.get("label") or "Knowledge Source"
            content = item.get("content") or item.get("content_excerpt") or ""
            method = item.get("retrieval_method", "unknown")
            summary_blocks.append(f"[{i+1}] Source: {title} ({method})\nContent: {content[:800]}...")
            
        return "---\nVAULT KNOWLEDGE RETRIEVAL:\n" + "\n\n".join(summary_blocks) + "\n---\n"

# Singleton instance
cortext_service = CortextService()
