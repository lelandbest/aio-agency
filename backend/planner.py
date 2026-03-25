import logging
from typing import Any, Dict, List
from backend.agent_definitions import AGENT_DEFINITIONS

logger = logging.getLogger(__name__)

INTENT_AGENT_MAP = {
    "draft_email": "ECHO",
    "query_vault": "ALPHA",
    "add_contact": "STRIKER",
    "add_crm_note": "CHARLIE",
    "schedule_calendar": "DELTA"
}

def create_execution_plan(goal: str, context: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Phase 15: Decomposes a high-level goal into structured execution steps.
    In a true implementation, this would involve an LLM call. 
    Here we provide a robust deterministic pattern based on goal keywords.
    """
    logger.info(f"Planning goal: {goal}")
    goal_lower = goal.lower()
    steps = []

    # 1. Knowledge Step (Standard for RAG)
    steps.append({
        "stepId": "plan-step-1",
        "intent": "query_vault",
        "parameters": {"query": goal},
        "assignedAgent": "ALPHA",
        "agentId": "AGT-CMD-001",
        "requiresApproval": False
    })

    # 2. Functional Steps based on goal
    if "contact" in goal_lower:
        steps.append({
            "stepId": "plan-step-2",
            "intent": "add_contact",
            "parameters": {"first_name": "New", "last_name": "Contact"},
            "assignedAgent": "ALPHA",
            "agentId": "AGT-CMD-001",
            "requiresApproval": True
        })
    elif "email" in goal_lower:
        steps.append({
            "stepId": "plan-step-2",
            "intent": "draft_email",
            "parameters": {"body": f"Drafting response for: {goal}"},
            "assignedAgent": "ALPHA",
            "agentId": "AGT-CMD-001",
            "requiresApproval": False
        })
    
    if "market" in goal_lower or "research" in goal_lower or "strategy" in goal_lower:
        steps.append({
            "stepId": f"plan-step-{len(steps)+1}",
            "intent": "market_research",
            "parameters": {"topic": goal},
            "assignedAgent": "ALPHA",
            "agentId": "AGT-CMD-001",
            "requiresApproval": False
        })

    if "callback" in goal_lower or "appointment" in goal_lower or "schedule" in goal_lower:
        steps.append({
            "stepId": f"plan-step-{len(steps)+1}",
            "intent": "schedule_calendar",
            "parameters": {"time": "tomorrow morning"},
            "assignedAgent": "DELTA",
            "agentId": "AGT-CRD-004",
            "requiresApproval": True
        })

    if "note" in goal_lower or "update" in goal_lower:
        steps.append({
            "stepId": f"plan-step-{len(steps)+1}",
            "intent": "add_crm_note",
            "parameters": {"note": f"Action taken on: {goal}"},
            "assignedAgent": "CHARLIE",
            "agentId": "AGT-CS-003",
            "requiresApproval": False
        })

    # Ensure uniqueness and ID consistency
    for i, step in enumerate(steps):
        step["stepId"] = f"planned-{i+1}"
        
    return steps
