import json
import logging
import re
from typing import Any, Dict, List

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
    "send_email": "ECHO",
    "send_sms": "CHARLIE",
    "generate_script": "HAMMER",
    "generate_run_of_show": "DELTA",
    "generate_postbot_content": "HAMMER",
    "generate_voice": "VECTOR",
    "time_delay": "DELTA",
}

AGENT_ID_MAP = {
    "ALPHA": "AGT-CMD-001",
    "BRAVO": "AGT-STR-002",
    "CHARLIE": "AGT-SUP-003",
    "DELTA": "AGT-CRD-004",
    "ECHO": "AGT-COM-005",
    "HAMMER": "AGT-CPY-006",
    "GHOST": "AGT-ENG-007",
    "ARCHER": "AGT-ANL-008",
    "ATLAS": "AGT-LOG-009",
    "RANGER": "AGT-DIS-010",
    "SCOUT": "AGT-FLT-011",
    "STRIKER": "AGT-SAL-012",
    "VECTOR": "AGT-DES-013",
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


def _extract_json_array(text: str) -> list[dict[str, Any]] | None:
    """Extract a JSON array of steps from an LLM response."""
    if not text:
        return None
    raw = text.strip()
    # Try direct parse
    if raw.startswith("[") and raw.endswith("]"):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass

    # Try extracting inside markdown ```json ... ```
    match = re.search(r"```(?:json)?\s*(\[\s*\{.*?\}\s*\])\s*```", raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(1))
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass

    # Try finding any [...] slice
    start = raw.find("[")
    end = raw.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            parsed = json.loads(raw[start : end + 1])
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass

    return None


def create_execution_plan(goal: str, context: Dict[str, object]) -> List[Dict[str, object]]:
    """
    Decomposes a high-level operator goal into structured execution steps.
    Attempts dynamic LLM goal decomposition first via the connected AI provider;
    falls back cleanly to deterministic pattern matching if unavailable.
    """
    logger.info("Planning goal: %s", goal)
    goal_lower = " ".join(str(goal or "").lower().split())

    # Fast deterministic check for direct calendar / booking commands
    booking_terms = (
        "schedule meeting",
        "book meeting",
        "book appointment",
        "reschedule meeting",
        "cancel meeting",
        "cancel booking",
        "upcoming bookings",
        "upcoming meetings",
    )
    if any(term in goal_lower for term in booking_terms):
        return create_booking_execution_plan(goal, context)

    # ── 1. DYNAMIC LLM DECOMPOSITION ATTEMPT ─────────────────────────────────
    try:
        from backend.deps import get_auth_store
        from backend.ai_service import ai_assist_service

        tenant_id = str(context.get("tenant_id") or ((context.get("tenant") or {}).get("id") if isinstance(context.get("tenant"), dict) else "") or "").strip()
        provider_config = context.get("_provider_config")
        if not provider_config and tenant_id:
            auth_store = get_auth_store()
            provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant_id)

        if provider_config:
            system_prompt = (
                "You are ALPHA, the Planning and Orchestration Authority for AIO Nexus (the Single Operator Business appliance).\n"
                "Decompose the user's operational goal into a sequence of concrete, structured execution steps.\n\n"
                "ALLOWABLE INTENTS:\n"
                "- query_vault: Search past client transcripts, assets, or knowledge base. (parameters: {'query': str})\n"
                "- add_contact: Create/update a CRM contact. (parameters: {'first_name': str, 'last_name': str, 'email': str, 'phone': str})\n"
                "- add_crm_note: Log note/update on a client or project. (parameters: {'note': str})\n"
                "- draft_email: Stage an outbound email draft. (parameters: {'recipient': str, 'subject': str, 'body': str})\n"
                "- send_sms: Stage an outbound SMS text. (parameters: {'to_number': str, 'body': str})\n"
                "- create_booking: Calendar scheduling. (parameters: {'title': str, 'start_time': str, 'guest_name': str, 'guest_email': str})\n"
                "- generate_script: Draft podcast, video, or presentation script. (parameters: {'topic': str, 'format': str})\n"
                "- generate_run_of_show: Create live event / cue sheet timeline. (parameters: {'event_title': str, 'cues': list})\n"
                "- generate_postbot_content: Create social media posts for LinkedIn, X, FB, IG, YouTube. (parameters: {'sourceContent': str, 'targetPlatforms': list})\n"
                "- time_delay: Pause before follow-up. (parameters: {'duration': int, 'unit': 'hours'|'minutes'|'days'})\n\n"
                "OUTPUT FORMAT RULES:\n"
                "Return JSON ONLY. Output a single JSON array of step objects. No conversational commentary.\n"
                "Set requiresApproval=true for any public communications, bookings, or published content.\n"
                "Assign the best specialist agent (ALPHA, CHARLIE, ECHO, HAMMER, DELTA, STRIKER)."
            )

            prompt = f"OPERATOR GOAL:\n\"{goal}\"\n\nProduce the execution plan array:"
            llm_result = ai_assist_service._provider_complete(provider_config, prompt, system_prompt=system_prompt)

            if llm_result and isinstance(llm_result, dict):
                content = llm_result.get("content") or ""
                raw_steps = _extract_json_array(content)
                if raw_steps and len(raw_steps) > 0:
                    validated_steps = []
                    for idx, s in enumerate(raw_steps, start=1):
                        intent = str(s.get("intent") or "query_vault").strip()
                        assigned_agent = str(s.get("assignedAgent") or INTENT_AGENT_MAP.get(intent, "ALPHA")).strip().upper()
                        requires_approval = bool(
                            s.get("requiresApproval")
                            or intent in {"draft_email", "send_email", "send_sms", "create_booking", "generate_postbot_content"}
                        )
                        validated_steps.append({
                            "stepId": f"planned-{idx}",
                            "intent": intent,
                            "parameters": s.get("parameters") if isinstance(s.get("parameters"), dict) else {},
                            "assignedAgent": assigned_agent,
                            "agentId": AGENT_ID_MAP.get(assigned_agent, "AGT-CMD-001"),
                            "requiresApproval": requires_approval,
                        })
                    logger.info("Successfully generated %d steps via LLM planner", len(validated_steps))
                    return validated_steps
    except Exception as e:
        logger.warning("Dynamic LLM planner invocation failed, using deterministic fallback: %s", e)

    # ── 2. DETERMINISTIC HEURISTIC FALLBACK ──────────────────────────────────
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

    if "podcast" in goal_lower or "script" in goal_lower or "episode" in goal_lower:
        steps.append({
            "stepId": f"plan-step-{len(steps)+1}",
            "intent": "generate_script",
            "parameters": {"topic": goal, "format": "podcast_interview"},
            "assignedAgent": "HAMMER",
            "agentId": "AGT-CPY-006",
            "requiresApproval": False,
        })
    elif "run of show" in goal_lower or "cue sheet" in goal_lower or "event" in goal_lower:
        steps.append({
            "stepId": f"plan-step-{len(steps)+1}",
            "intent": "generate_run_of_show",
            "parameters": {"event_title": goal},
            "assignedAgent": "DELTA",
            "agentId": "AGT-CRD-004",
            "requiresApproval": False,
        })
    elif "post" in goal_lower or "social" in goal_lower or "linkedin" in goal_lower or "twitter" in goal_lower:
        steps.append({
            "stepId": f"plan-step-{len(steps)+1}",
            "intent": "generate_postbot_content",
            "parameters": {"sourceContent": goal, "targetPlatforms": ["linkedin", "twitter", "instagram"]},
            "assignedAgent": "HAMMER",
            "agentId": "AGT-CPY-006",
            "requiresApproval": True,
        })
    elif "contact" in goal_lower or "lead" in goal_lower:
        steps.append({
            "stepId": f"plan-step-{len(steps)+1}",
            "intent": "add_contact",
            "parameters": {"first_name": "New", "last_name": "Contact"},
            "assignedAgent": "STRIKER",
            "agentId": "AGT-SAL-012",
            "requiresApproval": True,
        })
    elif "email" in goal_lower or "draft" in goal_lower:
        steps.append({
            "stepId": f"plan-step-{len(steps)+1}",
            "intent": "draft_email",
            "parameters": {"body": f"Drafting response for: {goal}"},
            "assignedAgent": "ECHO",
            "agentId": "AGT-COM-005",
            "requiresApproval": True,
        })

    if "note" in goal_lower or "update" in goal_lower:
        steps.append({
            "stepId": f"plan-step-{len(steps)+1}",
            "intent": "add_crm_note",
            "parameters": {"note": f"Action taken on: {goal}"},
            "assignedAgent": "CHARLIE",
            "agentId": "AGT-SUP-003",
            "requiresApproval": False,
        })

    for index, step in enumerate(steps, start=1):
        step["stepId"] = f"planned-{index}"

    return steps
