import logging
from typing import Dict, List

logger = logging.getLogger(__name__)

INTENT_AGENT_MAP = {
    "draft_email": "ECHO",
    "query_vault": "ALPHA",
    "add_contact": "STRIKER",
    "add_crm_note": "CHARLIE",
    "schedule_calendar": "DELTA",
    "create_booking": "DELTA",
    "update_booking": "DELTA",
    "cancel_booking": "DELTA",
    "get_booking": "DELTA",
}


def create_booking_execution_plan(goal: str, context: Dict[str, object]) -> List[Dict[str, object]]:
    goal_lower = " ".join(str(goal or "").lower().split())
    parameters: Dict[str, object] = {
        "event_id": context.get("event_id"),
        "thread_id": context.get("thread_id"),
        "contact_id": context.get("contact_id"),
        "calendar_id": context.get("calendar_id"),
        "booking_type_id": context.get("booking_type_id"),
        "title": context.get("title"),
        "description": context.get("description"),
        "start_time": context.get("start_time") or context.get("scheduled_at"),
        "end_time": context.get("end_time"),
        "status": context.get("status"),
        "location": context.get("location"),
        "location_type": context.get("location_type"),
        "meeting_url": context.get("meeting_url"),
        "guest_name": context.get("guest_name"),
        "guest_email": context.get("guest_email"),
        "guest_phone": context.get("guest_phone"),
    }

    if any(phrase in goal_lower for phrase in ("cancel meeting", "cancel booking", "cancel appointment")):
        intent = "cancel_booking"
    elif any(
        phrase in goal_lower
        for phrase in ("reschedule", "move meeting", "move booking", "update booking", "update meeting", "change meeting")
    ):
        intent = "update_booking"
    elif any(
        phrase in goal_lower
        for phrase in ("show booking", "get booking", "fetch booking", "list bookings", "show bookings", "upcoming bookings", "upcoming meetings", "read booking")
    ):
        intent = "get_booking"
    else:
        intent = "schedule_calendar"

    return [
        {
            "stepId": "planned-1",
            "intent": intent,
            "parameters": {key: value for key, value in parameters.items() if value is not None},
            "assignedAgent": "DELTA",
            "agentId": "AGT-CRD-004",
            "requiresApproval": intent in {"schedule_calendar", "update_booking", "cancel_booking"},
        }
    ]


def create_execution_plan(goal: str, context: Dict[str, object]) -> List[Dict[str, object]]:
    """
    Phase 15: Decomposes a high-level goal into structured execution steps.
    In a true implementation, this would involve an LLM call.
    Here we provide a deterministic pattern based on goal keywords.
    """
    logger.info("Planning goal: %s", goal)
    goal_lower = " ".join(str(goal or "").lower().split())

    booking_terms = (
        "schedule",
        "book",
        "booking",
        "appointment",
        "meeting",
        "reschedule",
        "cancel meeting",
        "cancel booking",
        "upcoming bookings",
        "upcoming meetings",
    )
    if any(term in goal_lower for term in booking_terms):
        return create_booking_execution_plan(goal, context)

    steps: List[Dict[str, object]] = [
        {
            "stepId": "plan-step-1",
            "intent": "query_vault",
            "parameters": {"query": goal},
            "assignedAgent": "ALPHA",
            "agentId": "AGT-CMD-001",
            "requiresApproval": False,
        }
    ]

    if "contact" in goal_lower:
        steps.append(
            {
                "stepId": "plan-step-2",
                "intent": "add_contact",
                "parameters": {"first_name": "New", "last_name": "Contact"},
                "assignedAgent": "ALPHA",
                "agentId": "AGT-CMD-001",
                "requiresApproval": True,
            }
        )
    elif "email" in goal_lower:
        steps.append(
            {
                "stepId": "plan-step-2",
                "intent": "draft_email",
                "parameters": {"body": f"Drafting response for: {goal}"},
                "assignedAgent": "ALPHA",
                "agentId": "AGT-CMD-001",
                "requiresApproval": False,
            }
        )

    if "market" in goal_lower or "research" in goal_lower or "strategy" in goal_lower:
        steps.append(
            {
                "stepId": f"plan-step-{len(steps)+1}",
                "intent": "market_research",
                "parameters": {"topic": goal},
                "assignedAgent": "ALPHA",
                "agentId": "AGT-CMD-001",
                "requiresApproval": False,
            }
        )

    if "note" in goal_lower or "update" in goal_lower:
        steps.append(
            {
                "stepId": f"plan-step-{len(steps)+1}",
                "intent": "add_crm_note",
                "parameters": {"note": f"Action taken on: {goal}"},
                "assignedAgent": "CHARLIE",
                "agentId": "AGT-CS-003",
                "requiresApproval": False,
            }
        )

    for index, step in enumerate(steps, start=1):
        step["stepId"] = f"planned-{index}"

    return steps
