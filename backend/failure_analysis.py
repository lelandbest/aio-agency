import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

def classify_failure(step: Dict[str, Any], error: str, runtime: Dict[str, Any]) -> Dict[str, Any]:
    """
    Phase 16: Analyzes an error to determine if and how it can be healed.
    """
    error_lower = error.lower()
    
    if "timeout" in error_lower or "503" in error_lower or "network" in error_lower:
        return {
            "category": "transient",
            "recoverable": True,
            "recommendedAction": "retry",
            "riskLevel": "low"
        }
    
    if "missing" in error_lower or "not found" in error_lower or "context" in error_lower:
        return {
            "category": "missing_context",
            "recoverable": True,
            "recommendedAction": "refetch_context",
            "riskLevel": "low"
        }

    if "validation" in error_lower or "parameters" in error_lower:
        return {
            "category": "validation",
            "recoverable": True,
            "recommendedAction": "repair_params",
            "riskLevel": "high"
        }

    if "permission" in error_lower or "denied" in error_lower:
        return {
            "category": "permission",
            "recoverable": False,
            "recommendedAction": "escalate",
            "riskLevel": "high"
        }

    return {
        "category": "unknown",
        "recoverable": False,
        "recommendedAction": "fail",
        "riskLevel": "medium"
    }
