import logging
from typing import Any, Dict, List, Optional
from backend.agent_definitions import AGENT_DEFINITIONS

logger = logging.getLogger(__name__)

class AdaptiveRouting:
    def __init__(self, provider):
        self.provider = provider

    def select_best_agent_for_step(self, step: Dict[str, Any], runtime: Dict[str, Any]) -> Dict[str, Any]:
        """
        Phase 16: Scores candidate agents based on historical performance for this intent.
        """
        intent = step.get("intent")
        current_agent = step.get("assignedAgent", "ALPHA")
        
        # 1. Fetch historical performance data
        history = self.provider.get_intent_performance(intent) if hasattr(self.provider, "get_intent_performance") else []
        
        if not history:
            return {
                "selectedAgent": current_agent,
                "agentId": step.get("agentId"),
                "score": 1.0,
                "reason": "No historical data available; using deterministic default.",
                "alternatives": []
            }

        # 2. Score candidates
        # Simple scoring: success_rate * 1.0 + (1.0 - failure_rate)
        scores = {}
        for entry in history:
            name = entry["agent_name"]
            if name not in scores:
                scores[name] = {"success": 0, "total": 0}
            scores[name]["total"] += 1
            if entry["status"] == "success":
                scores[name]["success"] += 1

        ranked = []
        for name, stats in scores.items():
            success_rate = stats["success"] / stats["total"]
            ranked.append({
                "agent": name,
                "score": success_rate,
                "total_runs": stats["total"]
            })

        ranked.sort(key=lambda x: x["score"], reverse=True)
        
        # 3. Decision
        best = ranked[0]
        best_agent_defn = AGENT_DEFINITIONS.get(best["agent"])
        
        return {
            "selectedAgent": best["agent"],
            "agentId": best_agent_defn.agent_id if best_agent_defn else None,
            "score": best["score"],
            "reason": f"Highest historical success rate ({best['score']:.2f}) over {best['total_runs']} runs.",
            "alternatives": ranked[1:]
        }

adaptive_router = None # Initialized by ExecutionEngine
