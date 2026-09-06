"""
AIO Nexus — AI & Automation Router
Decomposed from server.py monolith into clean modular domain router.
Provides:
- AI Command execution (natural language shell, navigation intercept, Charlie conversational intake, Alpha specialist execution, ExecutionEngine)
- AI Assist & Drafting (/api/ai/assist, /api/ai/draft)
- AI Run history & detail (/api/ai/runs, /api/ai/run/{run_id})
- Agent definitions & runtime customization (/api/ai/agents)
- Voice-to-Text command parsing & registry (/api/vtt/*)
- AI Providers & dynamic routing (/api/ai/providers, /api/ai/routing, Ollama)
- Automation Providers (Make, n8n, Zapier)
- Data Store Provider adapters (read/create/update/upsert)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Body, HTTPException, Query, Request
from pydantic import BaseModel

from backend.deps import (
    auth_store,
    clean_text,
    extract_session_token,
    provider,
    require_capability,
    require_operator,
    require_session,
    utcnow_iso,
)

logger = logging.getLogger("aio-nexus-ai")

router = APIRouter(tags=["AI & Automation"])

# ── Domain Service Imports ──────────────────────────────────────────────────
try:
    from backend.agent_definitions import (
        AGENT_DEFINITIONS,
        expand_agent_action_tokens,
        validate_agent_action,
    )
    from backend.agent_runtime import AgentRegistry
    from backend.ai_routing import (
        log_ai_route,
        resolve_ai_route,
        validate_ai_routing_config,
    )
    from backend.ai_service import ai_assist_service, get_ai_provider_catalog, list_ollama_models
    from backend.automation_service import test_automation_provider
    from backend.data_store_adapters import (
        create_data_store_record,
        read_data_store_records,
        test_data_store_provider,
        update_data_store_record,
        upsert_data_store_record,
    )
    from backend.flow_graph_utils import build_flow_execution_steps
    from backend.operator_assist import generate_assist_response
    from backend.orchestration import ExecutionEngine
    from backend.planner import create_booking_execution_plan
    from backend.vtt_service import process_transcript
except ModuleNotFoundError:
    from agent_definitions import (
        AGENT_DEFINITIONS,
        expand_agent_action_tokens,
        validate_agent_action,
    )
    from agent_runtime import AgentRegistry
    from ai_routing import (
        log_ai_route,
        resolve_ai_route,
        validate_ai_routing_config,
    )
    from ai_service import ai_assist_service, get_ai_provider_catalog, list_ollama_models
    from automation_service import test_automation_provider
    from data_store_adapters import (
        create_data_store_record,
        read_data_store_records,
        test_data_store_provider,
        update_data_store_record,
        upsert_data_store_record,
    )
    from flow_graph_utils import build_flow_execution_steps
    from operator_assist import generate_assist_response
    from orchestration import ExecutionEngine
    from planner import create_booking_execution_plan
    from vtt_service import process_transcript

VISIBLE_AGENT_KEYS = [key for key, value in AGENT_DEFINITIONS.items() if value.visibility != "hidden"]

# ── Pydantic Request Models ─────────────────────────────────────────────────

class AIAssistRequest(BaseModel):
    module: str
    surface: str
    field: str
    intent: str = "draft"
    currentValue: str = ""
    context: Optional[dict[str, Any]] = None
    task: Optional[str] = None
    routeHints: Optional[dict[str, Any]] = None
    providerOverride: Optional[Any] = None


class OperatorAssistRequest(BaseModel):
    message: str
    context: Optional[dict[str, Any]] = None


class AICommandRequest(BaseModel):
    command: str
    context: Optional[dict[str, Any]] = None
    agent: Optional[str] = None
    collabAgents: Optional[list[str]] = None
    flowId: Optional[str] = None
    sessionType: Optional[str] = None


class AIProviderUpsertRequest(BaseModel):
    label: Optional[str] = None
    baseUrl: Optional[str] = None
    model: Optional[str] = None
    apiKey: Optional[str] = None
    enabled: bool = False
    isDefault: bool = False
    status: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    systemGuardrails: Optional[str] = None
    taskGuardrails: Optional[str] = None


class AIRoutingConfigRequest(BaseModel):
    features: Optional[dict[str, Any]] = None
    tasks: Optional[dict[str, Any]] = None
    fallback: Optional[dict[str, Any]] = None
    version: Optional[int] = None


class AutomationProviderUpsertRequest(BaseModel):
    label: Optional[str] = None
    baseUrl: Optional[str] = None
    apiKey: Optional[str] = None
    enabled: bool = False
    status: Optional[str] = None
    config: Optional[dict[str, Any]] = None


class DataStoreProviderUpsertRequest(BaseModel):
    label: Optional[str] = None
    baseUrl: Optional[str] = None
    apiKey: Optional[str] = None
    enabled: bool = False
    status: Optional[str] = None
    config: Optional[dict[str, Any]] = None


class DataStoreReadRecordsRequest(BaseModel):
    limit: Optional[int] = None
    viewName: Optional[str] = None


class DataStoreCreateRecordRequest(BaseModel):
    row: dict[str, Any]


class DataStoreUpdateRecordRequest(BaseModel):
    recordId: str
    row: dict[str, Any]


class DataStoreUpsertRecordRequest(BaseModel):
    row: dict[str, Any]
    recordId: Optional[str] = None
    matchField: Optional[str] = None
    matchValue: Optional[Any] = None


class OllamaModelsRequest(BaseModel):
    baseUrl: Optional[str] = None
    apiKey: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


class VTTRequest(BaseModel):
    transcript: str
    context: dict[str, Any] = {}
    voiceEnabled: bool = False
    voiceProvider: str = "system"
    voiceAutoPlay: bool = False


# ── Helper Utilities ────────────────────────────────────────────────────────

def strip_markdown(text: str) -> str:
    if not text:
        return text
    text = re.sub(r'[*_#~>`\[\]{}]+', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def normalize_agent_key(value: Any) -> str:
    resolved = " ".join(str(value or "").split()).strip().upper()
    return resolved if resolved in AGENT_DEFINITIONS else ""


def extract_requested_agent(command_text: str = "", explicit: str = "") -> str:
    direct = normalize_agent_key(explicit)
    if direct:
        return direct
    if not command_text:
        return ""
    command_upper = command_text.upper()
    for key in VISIBLE_AGENT_KEYS:
        if re.search(rf"\b{re.escape(key)}\b", command_upper):
            return key
    return ""


def resolve_permission_tier(command_text: str, field: str = "", intent: str = "") -> str:
    haystack = " ".join([str(command_text or ""), str(field or ""), str(intent or "")]).lower()
    if intent == "query_vault":
        return "safe"
    if any(term in haystack for term in ["assign", "archive", "close", "schedule", "create deal", "run workflow", "trigger workflow", "send "]):
        return "guarded"
    return "safe"


def choose_specialist_for_command(module: str, surface: str, field: str, command_text: str, context: dict[str, Any]) -> str:
    explicit_agent = extract_requested_agent(
        command_text,
        explicit=str(
            context.get("agent_role")
            or context.get("assignee")
            or context.get("selected_agent")
            or context.get("agent")
            or context.get("requested_agent")
            or ""
        ),
    )
    if explicit_agent and explicit_agent != "OMEGA":
        return explicit_agent
    haystack = " ".join(
        [
            str(command_text or ""),
            str(field or ""),
            str(surface or ""),
            str(module or ""),
            str(context.get("summary") or ""),
            str(context.get("subject") or ""),
            str(context.get("description") or ""),
            str(context.get("notes") or ""),
        ]
    ).lower()
    normalized_module = " ".join(str(module or "").split()).strip().lower()
    normalized_field = " ".join(str(field or "").split()).strip().lower()
    if normalized_module == "comms":
        if normalized_field in {"summary", "brief", "refresh-brief"}:
            return "CHARLIE"
        if normalized_field in {"draft-reply", "reply", "rewrite", "rewrite-draft"}:
            return "STRIKER"
        if normalized_field in {"extract", "extract-tasks", "schedule", "schedule-follow-up", "run-workflow", "workflow"}:
            return "ALPHA"
    if any(term in haystack for term in ["support", "ticket", "help desk", "customer success", "faq", "issue resolution", "service"]):
        return "CHARLIE"
    if any(term in haystack for term in ["email", "newsletter", "campaign", "social", "hashtag", "channel", "outreach", "response template"]):
        return "ECHO"
    if any(term in haystack for term in ["proposal", "deal", "close", "negotiat", "pipeline", "revenue", "follow-up", "discovery call", "sales"]):
        return "STRIKER"
    if any(term in haystack for term in ["strategy", "swot", "market", "positioning", "growth plan", "business model"]):
        return "BRAVO"
    if any(term in haystack for term in ["project", "timeline", "milestone", "coordinate", "meeting follow-up"]):
        return "DELTA"
    if any(term in haystack for term in ["logistics", "deployment", "runbook", "system map", "resource movement", "handoff"]):
        return "ATLAS"
    if any(term in haystack for term in ["api", "code", "devops", "infra", "bug", "engineering", "it ", "site", "automation", "integration"]):
        return "GHOST"
    if any(term in haystack for term in ["analytics", "financial", "roi", "kpi", "forecast", "reporting", "budget"]):
        return "ARCHER"
    if any(term in haystack for term in ["content", "copy", "article", "landing page", "brand story", "product description"]):
        return "HAMMER"
    if any(term in haystack for term in ["seo", "keyword", "ranking", "meta description", "organic"]):
        return "RANGER"
    if any(term in haystack for term in ["hire", "recruit", "candidate", "interview", "onboarding"]):
        return "SCOUT"
    if any(term in haystack for term in ["design", "visual", "creative", "palette", "asset", "graphics", "style guide"]):
        return "VECTOR"
    if "comms" in haystack:
        return "CHARLIE"
    return "ALPHA"


def resolve_ai_run_routing(module: str, surface: str, field: str, intent: str, command_text: str, context: dict[str, Any]) -> dict[str, Any]:
    requested_agent = extract_requested_agent(command_text, explicit=str(context.get("requested_agent") or ""))
    if requested_agent == "OMEGA":
        requested_agent = ""
    executing_agent = choose_specialist_for_command(module, surface, field, command_text, context)
    permission_tier = resolve_permission_tier(command_text, field=field, intent=intent)
    intake_agent = "CHARLIE"
    dispatcher_agent = "ALPHA"
    delegate_chain = [intake_agent, dispatcher_agent]
    if requested_agent and requested_agent not in delegate_chain and requested_agent != executing_agent:
        delegate_chain.append(requested_agent)
    if executing_agent and executing_agent not in delegate_chain:
        delegate_chain.append(executing_agent)
    return {
        "intake_agent": intake_agent,
        "dispatcher_agent": dispatcher_agent,
        "requested_agent": requested_agent or None,
        "executing_agent": executing_agent,
        "delegate_chain": delegate_chain,
        "permission_tier": permission_tier,
    }


def extract_run_result_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "\n".join(filter(None, (extract_run_result_text(item) for item in value))).strip()
    if isinstance(value, dict):
        for key in ("message", "suggestion", "summary", "content", "result", "output", "answer"):
            text = extract_run_result_text(value.get(key))
            if text:
                return text
        return "\n".join(
            filter(
                None,
                (
                    f"{str(key).replace('_', ' ').title()}: {extract_run_result_text(item)}".strip()
                    for key, item in value.items()
                ),
            )
        ).strip()
    return ""


def derive_agent_chain_from_steps(steps: list[dict[str, Any]]) -> list[str]:
    chain: list[str] = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        agent = str(step.get("assignedAgent") or step.get("agent") or "").strip().upper()
        if agent and agent not in chain:
            chain.append(agent)
    return chain


def summarize_runtime_excerpt(value: Any, fallback: str = "") -> str:
    text = " ".join(str(value or "").split()).strip()
    if not text:
        return fallback
    return f"{text[:277].rstrip()}..." if len(text) > 280 else text


def build_brain_assist_query(current_value: str, context: dict[str, Any], tenant: dict[str, Any]) -> str:
    parts: list[str] = []
    for value in [
        current_value,
        context.get("subject"),
        context.get("summary"),
        context.get("description"),
        context.get("label"),
        context.get("name"),
        context.get("company_name"),
        context.get("company"),
        context.get("notes"),
        (context.get("profile") or {}).get("company_name") if isinstance(context.get("profile"), dict) else "",
        tenant.get("name"),
    ]:
        text = " ".join(str(value or "").split()).strip()
        if text and text not in parts:
            parts.append(text)
    return " | ".join(parts[:4]).strip()


def inject_brain_context(query: str, context: dict[str, Any], tenant: dict[str, Any]) -> dict[str, Any]:
    if not query:
        return context
    try:
        stored_results = provider.search_brain_memory(query, limit=5)
    except Exception:
        stored_results = []
    if stored_results:
        context["brain_memory"] = stored_results
        context["brain_memory_summary"] = "\n".join(
            [
                f"{entry.get('title')}: {str(entry.get('excerpt') or '')[:300]}..."
                for entry in stored_results
            ]
        )
        context["brain_memory_query"] = query
    return context


def build_ai_run_artifacts(*, draft_text: str = "", thread: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    if draft_text:
        artifacts.append(
            {
                "artifact_type": "draft",
                "kind": "reply",
                "title": "AI Draft",
                "body": summarize_runtime_excerpt(draft_text, "Draft generated."),
            }
        )
    if thread and isinstance(thread.get("brief"), dict):
        brief = thread.get("brief") or {}
        artifacts.append(
            {
                "artifact_type": "brief",
                "kind": "thread-brief",
                "title": "AI Brief",
                "body": summarize_runtime_excerpt(
                    brief.get("summary") or brief.get("recommended_next_step"),
                    "Thread brief updated.",
                ),
            }
        )
    return artifacts


def build_ai_run_steps(
    *,
    brain_results: list[dict[str, Any]],
    applied_thread: dict[str, Any] | None = None,
    draft_text: str = "",
) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    if brain_results:
        steps.append(
            {
                "kind": "retrieval",
                "status": "completed",
                "label": "Brain retrieval",
                "summary": f"{len(brain_results)} memory match(es) pulled for context.",
            }
        )
    steps.append(
        {
            "kind": "generation",
            "status": "completed",
            "label": "AI assist",
            "summary": "Suggestion generated through the shared AI assist path.",
        }
    )
    if applied_thread:
        steps.append(
            {
                "kind": "writeback",
                "status": "completed",
                "label": "Thread writeback",
                "summary": "Thread brief and related Comms state updated from the run result.",
            }
        )
    if draft_text:
        steps.append(
            {
                "kind": "artifact",
                "status": "completed",
                "label": "Draft artifact",
                "summary": "A draft output was produced for operator review.",
            }
        )
    return steps


def project_engine_run_for_ui(run: dict[str, Any] | None) -> dict[str, Any] | None:
    if not run:
        return None
    routing = run.get("routing") if isinstance(run.get("routing"), dict) else {}
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    artifacts = run.get("artifacts") if isinstance(run.get("artifacts"), list) else []
    trace = run.get("trace") if isinstance(run.get("trace"), list) else []
    pending_approvals = run.get("pending_approvals") if isinstance(run.get("pending_approvals"), list) else []

    last_success = next((step for step in reversed(steps) if step.get("status") == "success"), None)
    last_error = next((step for step in reversed(steps) if step.get("status") == "error"), None)
    last_success_data = last_success.get("data") if isinstance(last_success, dict) and isinstance(last_success.get("data"), dict) else {}
    last_error_text = str((last_error or {}).get("error") or "").strip()
    result_text = (
        extract_run_result_text(last_success_data)
        or last_error_text
        or ""
    )
    delegate_chain = routing.get("delegate_chain")
    if not isinstance(delegate_chain, list):
        delegate_chain = []
    executing_agent = routing.get("executing_agent") or ""
    agent_chain = derive_agent_chain_from_steps(steps)
    for agent in agent_chain:
        if agent not in delegate_chain:
            delegate_chain.append(agent)
    if executing_agent and executing_agent not in delegate_chain:
        delegate_chain = [*delegate_chain, executing_agent]
    flow_id = str(
        context.get("flow_id")
        or context.get("flowId")
        or ((context.get("flow") or {}).get("id") if isinstance(context.get("flow"), dict) else "")
        or ""
    ).strip()
    flow_name = str(
        context.get("flow_name")
        or context.get("flowName")
        or ((context.get("flow") or {}).get("name") if isinstance(context.get("flow"), dict) else "")
        or ""
    ).strip()
    flow = {"id": flow_id, "name": flow_name} if flow_id else None
    projected_steps: list[dict[str, Any]] = []
    for index, step in enumerate(steps, start=1):
        if not isinstance(step, dict):
            continue
        step_parameters = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
        projected_steps.append(
            {
                **step,
                "step_index": step.get("step_index") or step.get("stepIndex") or step_parameters.get("step_index") or index,
                "agent": step.get("assignedAgent") or step.get("agent"),
                "output": extract_run_result_text(step.get("data")),
            }
        )
    return {
        "id": run.get("id"),
        "tenant_id": run.get("tenant_id"),
        "module": str(context.get("module") or "agents"),
        "surface": str(context.get("surface") or "command"),
        "field": str(context.get("field") or "command"),
        "intent": str(context.get("intent") or ("assist" if str(run.get("mode") or "").strip().lower() == "assist" else "command")),
        "status": run.get("status") or "completed",
        "agent_role": executing_agent or routing.get("requested_agent") or "ALPHA",
        "intake_agent": routing.get("intake_agent"),
        "dispatcher_agent": routing.get("dispatcher_agent"),
        "executing_agent": executing_agent or None,
        "requested_agent": routing.get("requested_agent"),
        "delegate_chain": delegate_chain,
        "agent_chain": agent_chain or delegate_chain,
        "permission_tier": routing.get("permission_tier"),
        "thread_id": str(context.get("thread_id") or "") or None,
        "contact_id": str(context.get("contact_id") or "") or None,
        "company_id": str(context.get("company_id") or "") or None,
        "command_text": run.get("command"),
        "provider_key": ((context.get("_provider_config") or {}).get("provider_key") if isinstance(context.get("_provider_config"), dict) else None),
        "provider_label": ((context.get("_provider_config") or {}).get("label") if isinstance(context.get("_provider_config"), dict) else None),
        "model": ((context.get("_provider_config") or {}).get("model") if isinstance(context.get("_provider_config"), dict) else None),
        "prompt": run.get("command"),
        "result": result_text,
        "output": result_text,
        "artifacts": artifacts,
        "steps": projected_steps,
        "step_count": int(context.get("step_count") or len(projected_steps) or 0),
        "flow": flow,
        "flow_id": flow_id or None,
        "flow_name": flow_name or None,
        "flowId": flow_id or None,
        "flowName": flow_name or None,
        "metadata": {
            "projection_source": "aiEngineRuns",
            "legacy_ai_runs_adapter": True,
            "scheduled_removal": "Remove compatibility projection after UI history consumers read aiEngineRuns natively.",
            "trace": trace,
            "context": context,
            "pending_approvals": pending_approvals,
        },
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
    }


def _normalize_ai_command_response(response: dict) -> dict:
    def _normalize_dict(d: dict) -> dict:
        if not isinstance(d, dict):
            return d
        result = {}
        for key, value in d.items():
            normalized_key = {
                "run_id": "runId",
                "flow_id": "flowId",
                "flow_name": "flowName",
                "executing_agent": "executingAgent",
                "requested_agent": "requestedAgent",
                "delegate_chain": "delegateChain",
                "brain_query": "brainQuery",
                "brain_result_count": "brainResultCount",
                "brain_memory": "brainMemory",
                "selected_agent_locked": "selectedAgentLocked",
                "result_metadata": "resultMetadata",
                "projection_source": "projectionSource",
                "pending_approvals": "pendingApprovals",
                "active_agent": "activeAgent",
                "command_text": "commandText",
                "collab_agents": "collabAgents",
                "step_count": "stepCount",
            }.get(key, key)
            if isinstance(value, dict):
                result[normalized_key] = _normalize_dict(value)
            elif isinstance(value, list):
                result[normalized_key] = [
                    _normalize_dict(item) if isinstance(item, dict) else item
                    for item in value
                ]
            else:
                result[normalized_key] = value
        return result

    return _normalize_dict(response)


def list_runtime_agents(include_hidden: bool = False, tenant_id: str | None = None) -> list[dict[str, Any]]:
    all_agents = list(AGENT_DEFINITIONS.values())
    filtered = all_agents if include_hidden else [a for a in all_agents if a.visibility != "hidden"]
    agents = []

    overrides = {}
    if tenant_id:
        try:
            tenant_settings = auth_store.get_tenant_settings(tenant_id)
            overrides = (tenant_settings.get("agents") or {}).get("overrides") or {}
        except Exception:
            pass

    for definition in filtered:
        key = definition.name.upper()
        agent_override = overrides.get(key) or {}
        agents.append({
            "registry_key": definition.name,
            "name": agent_override.get("name") or definition.name,
            "label": agent_override.get("label") or definition.label,
            "rank": definition.rank,
            "role": definition.role,
            "specialization": definition.specialization,
            "visibility": definition.visibility,
            "capability_tier": definition.capability_tier,
            "subordinates": definition.subordinates,
            "tools": definition.tools,
            "capabilities": definition.capabilities,
            "agent_id": definition.agent_id,
            "avatar_url": agent_override.get("avatar_url") or "",
        })
    return agents


def _automation_provider_internal_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    raw = dict(payload or {})
    config = dict(raw.get("config") or {})
    webhook_url = raw.get("baseUrl") or config.get("webhookUrl") or config.get("webhook_url") or ""
    auth_header = raw.get("apiKey") or config.get("authHeader") or config.get("auth_header") or ""
    return {
        "label": raw.get("label") or "Automation Provider",
        "enabled": bool(raw.get("enabled")),
        "baseUrl": webhook_url,
        "apiKey": auth_header,
        "config": {
            **config,
            "webhookUrl": webhook_url,
            "authHeader": auth_header,
        },
    }


def _automation_provider_internal_config(config: dict[str, Any] | None) -> dict[str, Any]:
    raw = dict(config or {})
    cfg = dict(raw.get("config") or {})
    webhook_url = raw.get("baseUrl") or raw.get("base_url") or cfg.get("webhookUrl") or cfg.get("webhook_url") or ""
    auth_header = raw.get("apiKey") or raw.get("api_key") or cfg.get("authHeader") or cfg.get("auth_header") or ""
    return {
        **raw,
        "provider_key": raw.get("providerKey") or raw.get("provider_key"),
        "webhook_url": webhook_url,
        "auth_header": auth_header,
    }


def serialize_data_store_provider_public(config: dict[str, Any] | None) -> dict[str, Any] | None:
    if not config:
        return None
    return {
        "providerKey": config.get("providerKey") or "",
        "baseUrl": config.get("baseUrl") or "",
        "apiKeyPresent": bool(config.get("apiKeyPresent")),
        "lastTestedAt": config.get("lastTestedAt"),
        "lastError": config.get("lastError"),
    }


def _build_vtt_response(
    *,
    response_type: str,
    input_text: str,
    command: dict[str, Any] | None,
    response_message: str,
    success: bool,
    result: dict[str, Any],
    audio_url: str | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    return {
        "type": response_type,
        "inputText": input_text,
        "command": command,
        "response": {
            "message": response_message,
            "audioUrl": audio_url,
            "reason": reason,
        },
        "success": success,
        "result": result,
    }


# ── AI Command Endpoint ──────────────────────────────────────────────────────

@router.post("/api/ai/command")
async def ai_command(request: Request, payload: AICommandRequest):
    session = require_capability(request, "system.view", "Only workspace members can run AI commands.")
    token = extract_session_token(request)
    tenant = session.get("tenant") or {}
    user = session.get("user") or {}
    ai_provider = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
    resolved_context = dict(payload.context or {})
    command_text = (payload.command or "").strip()
    if not command_text:
        raise HTTPException(status_code=400, detail="Command is required.")

    # ── Step 0: Shell Navigation Authority Intercept ──────────────────────────
    nav_cmd = command_text.lower()
    if nav_cmd.startswith(("open ", "go ")):
        target = nav_cmd.split(" ", 1)[1].strip()
        nav_map = {
            "cortex": "aio-brain",
            "signals": "signals",
            "agents": "aio-agents",
            "forge": "forge",
            "calendar": "calendar",
            "comms": "comms",
            "crm": "crm",
            "design": "design",
            "flows": "flows",
            "forms": "forms",
            "orders": "orders",
            "pipelines": "pipelines",
            "pipeline": "pipelines",
            "sms voip": "sms_voip",
            "studio": "media",
            "media": "media",
            "systems": "integrations",
            "integrations": "integrations",
            "settings": "settings",
            "help": "aio-help",
        }
        if target in nav_map:
            module_id = nav_map[target]
            display_name = target.replace("sms voip", "SMS & VoIP").title()
            return {
                "status": "success",
                "message": f"Opening {display_name}.",
                "result": {
                    "status": "completed",
                    "action": "navigation",
                    "target": module_id,
                    "module": module_id,
                    "intent": "navigation",
                    "message": f"Opening {display_name}.",
                },
            }

    module = str(resolved_context.get("module") or "agents")
    surface = str(resolved_context.get("surface") or "command")
    requested_agent = normalize_agent_key(payload.agent or resolved_context.get("requested_agent"))
    collab_agents = [
        agent
        for agent in (
            normalize_agent_key(value)
            for value in (payload.collabAgents or resolved_context.get("collab_agents") or [])
        )
        if agent
    ]
    is_collab = len(collab_agents) > 0
    flow_id = str(payload.flowId or resolved_context.get("flowId") or "").strip() or None
    selected_flow = provider.get_flow(flow_id) if flow_id else None
    if flow_id and not selected_flow:
        return {
            "status": "error",
            "message": f"Flow '{flow_id}' is not available in the current workspace.",
            "result": {},
        }
    if requested_agent == "OMEGA":
        return {
            "status": "error",
            "message": "OMEGA cannot be executed through the natural-language agent shell.",
            "result": {},
        }
    if resolved_context.get("requested_agent") and not requested_agent:
        return {
            "status": "error",
            "message": f"Unknown agent '{resolved_context.get('requested_agent')}'.",
            "result": {},
        }
    booking_command_steps = create_booking_execution_plan(command_text, resolved_context)
    booking_command_mode = any(
        term in " ".join(command_text.lower().split())
        for term in ("schedule", "book", "booking", "appointment", "meeting", "reschedule", "cancel meeting", "cancel booking", "upcoming bookings", "upcoming meetings")
    )
    if not ai_provider and not booking_command_mode and not selected_flow:
        return {
            "status": "error",
            "result": {"routing": None, "run": None, "runId": None},
            "message": "No active AI provider is configured for agent execution.",
        }
    routing = resolve_ai_run_routing(
        module,
        surface,
        field="command",
        intent=str(resolved_context.get("intent") or "command").strip().lower(),
        command_text=command_text,
        context={**resolved_context, "requested_agent": requested_agent},
    )

    # ── CONVO / TASK ROUTING ──────────────────────────────────────────────────
    if routing.get("intent") == "conversation" or resolved_context.get("intent") == "conversation":
        from backend.ai_service import AIAssistService
        ai_service = AIAssistService()

        charlie_def = AGENT_DEFINITIONS.get("CHARLIE")
        charlie_sys_prompt = charlie_def.system_prompt if charlie_def else (
            "You are CHARLIE, the voice intake authority for AIO Nexus. "
            "You receive user requests and either respond conversationally or identify task requests to escalate to ALPHA."
        )

        classification_prompt = (
            f"User input: \"{command_text}\"\n\n"
            "Classify this input into exactly one of three categories:\n"
            "  MEDIA_TASK — the user wants to create, generate, or render any media asset: "
            "video, audio, voice narration, music, sound effects, promo, podcast, audiogram, "
            "render, clip, or any combination of these.\n"
            "  TASK  — any other action or deliverable: take a note, compose an email, "
            "draft a report, summarise, research, create a plan, analyze.\n"
            "  CONVERSATION  — chatting, asking a simple question, giving feedback, "
            "or a comment that needs no execution.\n\n"
            "Reply with a single JSON object, e.g.: {\"classification\": \"MEDIA_TASK\"} "
            "and nothing else."
        )
        classification_system = (
            "You are CHARLIE, intake classifier. "
            "Return only valid JSON with key 'classification' set to "
            "'MEDIA_TASK', 'TASK', or 'CONVERSATION'. No explanation. No markdown."
        )
        try:
            classification_result = ai_service._provider_complete(
                provider_config=ai_provider,
                prompt=classification_prompt,
                system_prompt=classification_system,
            )
            classification_raw = (classification_result or {}).get("suggestion", "")
            _json_match = re.search(r'\{[^}]+\}', classification_raw)
            classification_json = json.loads(_json_match.group()) if _json_match else {}
            input_classification = str(classification_json.get("classification", "CONVERSATION")).upper().strip()
        except Exception:
            input_classification = "CONVERSATION"

        explicit_session_type = (payload.sessionType or resolved_context.get("sessionType") or "").upper().strip()
        if explicit_session_type and explicit_session_type not in ["CONVO", "COMMAND", "CONSULT"]:
            return {
                "status": "error",
                "message": f"Invalid or missing sessionType contract: {explicit_session_type}. Message dropped.",
                "result": {"error": "invalid_session_contract"},
            }

        interaction_mode = explicit_session_type or "CONVO"
        if interaction_mode == "CONVO" and input_classification in ["TASK", "MEDIA_TASK"]:
            interaction_mode = "COMMAND"

        if interaction_mode == "CONSULT":
            try:
                assist_resp = generate_assist_response(
                    message=command_text,
                    context={
                        **resolved_context,
                        "assistMode": "brain",
                        "targetAgent": requested_agent,
                        "collab": is_collab,
                        "interactionMode": interaction_mode,
                    },
                    token=token,
                    session=session,
                    auth_store=auth_store,
                    provider=provider,
                    ai_service=ai_assist_service,
                    ai_config=ai_provider,
                )
                message = assist_resp.get("answer") or assist_resp.get("message") or "..."
                return {
                    "status": "success",
                    **assist_resp,
                    "message": message,
                    "result": {
                        "message": message,
                        "routing": routing,
                        "orchestration": assist_resp.get("orchestration"),
                    },
                }
            except Exception as e:
                logger.error("Specialist consultation bridge failed: %s", str(e))
                return {
                    "status": "error",
                    "message": f"Specialist consultation failed: {str(e)}",
                    "result": {"routing": routing},
                }

        if interaction_mode == "CONVO":
            charlie_sys_prompt += f"\n\nSystem Event Target Context:\n{json.dumps(resolved_context, default=str)}"
            convo_result = ai_service._provider_complete(
                provider_config=ai_provider,
                prompt=command_text,
                system_prompt=charlie_sys_prompt,
            )
            raw_reply = str((convo_result or {}).get("suggestion") or "").strip() or "Ready."
            reply_text = strip_markdown(raw_reply)
            return {
                "status": "success",
                "message": reply_text,
                "result": {
                    "message": reply_text,
                    "mode": "immediate",
                    "intent": "conversation",
                    "response": {"answer": reply_text, "insights": [], "suggestedActions": []},
                },
            }

        # Alpha execution path for media/tasks
        alpha_runtime = {
            "command": command_text,
            "providerConfig": ai_provider,
            "steps": [],
            "sharedContext": {
                "goal": command_text,
                "plan": [],
                "agentNotes": [],
                "source": "charlie_vtt_intake",
            },
            "trace": [],
        }
        alpha_context = {
            **resolved_context,
            "surface": "vtt",
            "module": "vtt",
            "intent": "media_task" if input_classification == "MEDIA_TASK" else "task",
            "requested_agent": "ALPHA",
            "classification": input_classification,
        }

        if input_classification == "MEDIA_TASK":
            try:
                from backend.media_engine import get_media_engine
            except ImportError:
                from media_engine import get_media_engine

            engine = get_media_engine()
            media_tenant_id = tenant.get("id")
            media_assets_built: list[dict] = []
            media_errors: list[str] = []
            audio_layers: list[dict] = []

            # Voice / TTS
            try:
                from backend.vtt_service import synthesize_voice
                voice_url = synthesize_voice(text=command_text[:600], tenant_id=media_tenant_id)
                if voice_url:
                    audio_layers.append({"type": "voice", "url": voice_url})
                    media_assets_built.append({"component": "voice", "url": voice_url})
            except Exception as voice_err:
                media_errors.append(f"Voice generation failed: {voice_err}")

            qc_summary = "Media assembly prepared for review."
            return {
                "status": "success" if media_assets_built else "error",
                "result": {
                    "mode": "media_task",
                    "intent": "media_task",
                    "message": qc_summary,
                    "response": {
                        "answer": qc_summary,
                        "insights": alpha_runtime.get("trace") or [],
                        "suggestedActions": [],
                    },
                    "media_assets": media_assets_built,
                    "errors": media_errors,
                },
            }

        # Generic TASK delegation
        alpha_agent = AgentRegistry.get("ALPHA")
        if not alpha_agent or not ai_provider:
            fallback = "I've received your request but Alpha is not reachable right now. Please try again."
            return {
                "status": "error",
                "result": {
                    "mode": "task",
                    "intent": "task",
                    "message": fallback,
                    "response": {"answer": fallback, "insights": [], "suggestedActions": []},
                },
            }

        alpha_step = {
            "id": "vtt-task-001",
            "intent": "agent_task",
            "action": "delegate",
            "parameters": {"command": command_text},
            "assignedAgent": "ALPHA",
            "_delegation_depth": 0,
        }
        try:
            alpha_result = alpha_agent.execute(alpha_step, alpha_context, alpha_runtime)
        except Exception as exc:
            logger.error("[VTT Task] Alpha execution error: %s", exc)
            alpha_result = {"status": "error", "data": {}}

        data = alpha_result.get("data") or {}
        specialist_output = (
            data.get("message")
            or data.get("suggestion")
            or data.get("content")
            or "Task completed by specialist."
        ).strip()
        final_reply = strip_markdown(specialist_output)
        return {
            "status": "success",
            "result": {
                "mode": "task",
                "intent": "task",
                "message": final_reply,
                "response": {
                    "answer": final_reply,
                    "insights": alpha_runtime.get("trace") or [],
                    "suggestedActions": [],
                },
                "alpha_trace": alpha_runtime.get("trace") or [],
            },
        }

    # ── Standard Task Execution Engine Path ──────────────────────────────────
    if routing["permission_tier"] == "dangerous":
        raise HTTPException(status_code=403, detail="Dangerous commands are blocked from natural-language routing. Use dedicated admin controls.")

    flow_raw_steps: list[dict[str, Any]] = []
    flow_agent_chain: list[str] = []
    if selected_flow:
        flow_raw_steps, flow_agent_chain = build_flow_execution_steps(
            selected_flow, command_text, requested_agent or routing["executing_agent"], runtime_context=resolved_context
        )
        if not flow_raw_steps:
            return {
                "status": "error",
                "result": {"routing": routing, "run": None, "runId": None},
                "message": f"Flow '{selected_flow.get('name') or flow_id}' has no executable steps.",
            }

    executing_agent = requested_agent or (flow_agent_chain[-1] if flow_agent_chain else ("DELTA" if booking_command_mode else routing["executing_agent"]))
    agent_definition = AGENT_DEFINITIONS.get(executing_agent)
    if not agent_definition:
        return {
            "status": "error",
            "result": {"routing": routing, "run": None, "runId": None},
            "message": f"Agent '{executing_agent}' is not available in the canonical runtime registry.",
        }

    resolved_context.update(routing)
    resolved_context["command_text"] = command_text
    resolved_context["requested_agent"] = requested_agent or routing["requested_agent"] or ""
    resolved_context["active_agent"] = resolved_context.get("active_agent") or executing_agent
    resolved_context["_provider_config"] = ai_provider
    resolved_context["_requested_agent_locked"] = bool(requested_agent or selected_flow)
    resolved_context["field"] = "command"
    if collab_agents:
        resolved_context["collab_agents"] = collab_agents
    if selected_flow:
        resolved_context["flow_id"] = selected_flow.get("id")
        resolved_context["flow_name"] = selected_flow.get("name") or "Untitled Flow"
        resolved_context["flow"] = {
            "id": selected_flow.get("id"),
            "name": selected_flow.get("name") or "Untitled Flow",
        }
        resolved_context["step_count"] = len(flow_raw_steps)
        resolved_context["agent_chain"] = flow_agent_chain

    brain_query = build_brain_assist_query(command_text, resolved_context, tenant)
    if brain_query:
        resolved_context = inject_brain_context(brain_query, resolved_context, tenant)
        brain_results = resolved_context.get("brain_memory") or []
    else:
        brain_results = []

    raw_steps = flow_raw_steps or [
        *(
            [
                {
                    "id": step.get("stepId") or f"cmd-{uuid4().hex[:10]}",
                    "intent": step.get("intent"),
                    "parameters": step.get("parameters") or {},
                    "assignedAgent": step.get("assignedAgent") or "DELTA",
                    "agentId": (AGENT_DEFINITIONS.get(step.get("assignedAgent") or "DELTA") or AGENT_DEFINITIONS["DELTA"]).agent_id,
                }
                for step in booking_command_steps
            ]
            if booking_command_mode
            else [
                {
                    "id": f"cmd-{uuid4().hex[:10]}",
                    "intent": "agent_task",
                    "parameters": {
                        "command": command_text,
                        "module": module,
                        "surface": surface,
                    },
                    "assignedAgent": executing_agent,
                    "agentId": agent_definition.agent_id,
                }
            ]
        )
    ]

    engine = ExecutionEngine(provider)
    try:
        engine_result = engine.run(
            raw_steps=raw_steps,
            mode="execute",
            command=command_text,
            context=resolved_context,
            actor=user,
            tenant=tenant,
        )
    except Exception as error:
        logger.exception("ExecutionEngine command run failed")
        return {
            "status": "error",
            "message": str(error),
            "result": {"routing": routing},
        }

    engine_steps = engine_result.get("steps") or []
    primary_step = next((step for step in reversed(engine_steps) if step.get("status") == "success"), None)
    error_step = next((step for step in engine_steps if step.get("status") == "error"), None)
    primary_data = primary_step.get("data") if isinstance(primary_step, dict) else {}
    if not isinstance(primary_data, dict):
        primary_data = {}
    agent_message = ""
    for key in ("message", "suggestion", "content"):
        text = " ".join(str(primary_data.get(key) or "").split()).strip()
        if text:
            agent_message = text
            break
    if not agent_message:
        agent_message = extract_run_result_text(primary_data)

    resolved_routing = engine_result.get("routing") or routing
    delegate_chain = list(
        dict.fromkeys(
            (resolved_routing.get("delegate_chain") or [])
            + flow_agent_chain
            + [executing_agent]
        )
    )
    run_status = "completed"
    response_status = "success"
    response_message = None
    if engine_result.get("status") != "completed":
        run_status = "failed"
        response_status = "error"
        response_message = str((error_step or {}).get("error") or "").strip()
        if not response_message and engine_result.get("pendingApprovals"):
            response_message = "Execution is blocked pending approval."
        if not response_message:
            response_message = f"ExecutionEngine ended with status '{engine_result.get('status')}'."
    elif not agent_message:
        run_status = "failed"
        response_status = "error"
        response_message = "ExecutionEngine completed without agent output."

    engine_run = provider.get_ai_run(engine_result.get("runId"))
    if engine_run:
        run = project_engine_run_for_ui(engine_run)
    else:
        run = project_engine_run_for_ui(
            {
                "id": engine_result.get("runId"),
                "tenant_id": tenant.get("id"),
                "command": command_text,
                "status": run_status,
                "routing": {**resolved_routing, "executing_agent": executing_agent, "requested_agent": requested_agent or resolved_routing.get("requested_agent"), "delegate_chain": delegate_chain},
                "steps": engine_steps,
                "artifacts": engine_result.get("artifacts") or [],
                "trace": engine_result.get("trace") or [],
                "pending_approvals": engine_result.get("pendingApprovals") or [],
                "context": resolved_context,
                "created_at": utcnow_iso(),
                "updated_at": utcnow_iso(),
            }
        )

    response = {
        "message": agent_message,
        "suggestion": agent_message,
        "result": primary_data,
        "routing": {**resolved_routing, "executing_agent": executing_agent, "requested_agent": requested_agent or resolved_routing.get("requested_agent"), "delegate_chain": delegate_chain},
        "steps": engine_steps,
        "artifacts": engine_result.get("artifacts") or [],
        "trace": engine_result.get("trace") or [],
        "pendingApprovals": engine_result.get("pendingApprovals") or [],
        "agent": {
            "name": executing_agent,
            "agentId": agent_definition.agent_id,
            "label": agent_definition.label,
        },
        "flow": (
            {
                "id": selected_flow.get("id"),
                "name": selected_flow.get("name") or "Untitled Flow",
            }
            if selected_flow
            else None
        ),
        "metadata": {
            "brainQuery": brain_query,
            "brainResultCount": len(brain_results),
            "brainMemory": brain_results,
            "selectedAgentLocked": bool(requested_agent),
            "resultMetadata": primary_data.get("metadata") or {},
            "projectionSource": "aiEngineRuns",
        },
        "run": run,
        "runId": run["id"] if run else None,
    }
    return {"status": response_status, "result": _normalize_ai_command_response(response), "message": response_message}


# ── AI Assist & Draft ────────────────────────────────────────────────────────

@router.post("/api/ai/assist")
async def ai_assist(request: Request, payload: OperatorAssistRequest):
    session = require_capability(request, "system.view", "Only workspace members can use Operator Assist.")
    token = extract_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    tenant = session.get("tenant") or {}
    ai_provider = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
    resolved_context = dict(payload.context or {})

    brain_query = build_brain_assist_query(payload.message, resolved_context, tenant)
    if brain_query:
        resolved_context = inject_brain_context(brain_query, resolved_context, tenant)

    try:
        return generate_assist_response(
            message=payload.message,
            context=resolved_context,
            token=token,
            session=session,
            auth_store=auth_store,
            provider=provider,
            ai_service=ai_assist_service,
            ai_config=ai_provider,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/ai/draft")
async def ai_draft(request: Request, payload: AIAssistRequest):
    session = require_capability(request, "system.view", "Only workspace members can use AI drafting.")
    token = extract_session_token(request)
    user = session.get("user") or {}
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    resolved_context = dict(payload.context or {})
    resolved_module = payload.module
    resolved_surface = payload.surface
    resolved_field = payload.field
    resolved_intent = payload.intent
    route_hints = payload.routeHints or {}
    provider_override = payload.providerOverride
    if provider_override is None and isinstance(resolved_context, dict):
        provider_override = resolved_context.get("provider_override")

    try:
        route = resolve_ai_route(
            tenant_id=tenant_id,
            feature=resolved_module,
            task=str(payload.task or resolved_intent or "").strip() or None,
            provider_override=provider_override,
            route_hints=route_hints,
            auth_store=auth_store,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    log_ai_route(route)
    ai_provider = route.get("provider_config")
    routing = resolve_ai_run_routing(
        resolved_module,
        resolved_surface,
        field=resolved_field,
        intent=resolved_intent,
        command_text=payload.currentValue,
        context=resolved_context,
    )
    resolved_agent_role = routing["executing_agent"]
    agent_definition = AGENT_DEFINITIONS.get(resolved_agent_role)
    if not agent_definition:
        raise HTTPException(status_code=400, detail=f"Agent '{resolved_agent_role}' is not available in the canonical runtime registry.")

    assist_policy_inputs = [resolved_intent, resolved_field]
    if resolved_intent in {"draft", "assist"} and resolved_field in {"content", "general"}:
        assist_policy_inputs.append("agent_task")
    assist_policy_error = validate_agent_action(
        agent_definition,
        *expand_agent_action_tokens(*assist_policy_inputs),
    )
    if assist_policy_error:
        raise HTTPException(status_code=403, detail=assist_policy_error)

    resolved_context.update(routing)
    resolved_context["route"] = {
        "provider_key": route.get("provider_key"),
        "provider_label": route.get("provider_label"),
        "model": route.get("model"),
        "route_source": route.get("route_source"),
        "reason": route.get("reason"),
        "feature": route.get("feature"),
        "task": route.get("task"),
    }
    brain_query = build_brain_assist_query(payload.currentValue, resolved_context, tenant)
    brain_results = []
    if brain_query:
        resolved_context = inject_brain_context(brain_query, resolved_context, tenant)
        brain_results = resolved_context.get("brain_memory") or []

    result = ai_assist_service.assist(
        module=resolved_module,
        surface=resolved_surface,
        field=resolved_field,
        intent=resolved_intent,
        current_value=payload.currentValue,
        context=resolved_context,
        actor=user,
        tenant=tenant,
        provider_config=ai_provider,
    )
    response = result.to_dict()
    response["route"] = resolved_context["route"]

    applied_thread = None
    draft_text = ""
    if resolved_module == "comms" and resolved_context.get("thread_id"):
        action_metadata = {
            **(result.metadata or {}),
            "agent_name": resolved_agent_role,
        }
        applied = provider.apply_thread_ai_result(
            thread_id=str(resolved_context["thread_id"]),
            mode=resolved_field or "summary",
            suggestion=result.suggestion,
            metadata=action_metadata,
        )
        applied_thread = applied.get("thread")
        response["thread"] = applied_thread
        if applied.get("draft"):
            draft_text = str(applied["draft"])
            response["draft"] = draft_text

    run_artifacts = build_ai_run_artifacts(draft_text=draft_text, thread=applied_thread)
    run_steps = build_ai_run_steps(brain_results=brain_results, applied_thread=applied_thread, draft_text=draft_text)
    run_steps = [
        *run_steps,
        {
            "kind": "assist",
            "status": "completed",
            "label": "Assist response",
            "summary": result.suggestion,
            "agent": resolved_agent_role,
            "data": {
                "message": result.suggestion,
                "suggestion": result.suggestion,
                "content": result.suggestion,
                "metadata": result.metadata or {},
                "alternatives": result.alternatives,
                "rationale": result.rationale,
            },
        },
    ]

    canonical_run_id = f"run-{uuid4().hex[:10]}"
    canonical_context = {
        **resolved_context,
        "module": payload.module,
        "surface": payload.surface,
        "field": payload.field,
        "intent": payload.intent,
        "_provider_config": {
            "provider_key": route.get("provider_key"),
            "label": route.get("provider_label") or (ai_provider or {}).get("label"),
            "model": route.get("model"),
        },
    }
    provider.save_ai_run(
        {
            "id": canonical_run_id,
            "command": str(payload.currentValue or resolved_context.get("command_text") or "").strip() or f"{payload.module}:{payload.surface}:{payload.field}",
            "mode": "assist",
            "status": "completed",
            "steps_json": json.dumps(run_steps),
            "artifacts_json": json.dumps(run_artifacts),
            "pending_approvals_json": json.dumps([]),
            "routing_json": json.dumps(routing),
            "trace_json": json.dumps(
                [
                    {
                        "action": "assist_response",
                        "agent": resolved_agent_role,
                        "provider_key": route.get("provider_key"),
                        "provider_label": route.get("provider_label") or (ai_provider or {}).get("label"),
                        "model": route.get("model"),
                        "timestamp": utcnow_iso(),
                    }
                ]
            ),
            "actor_json": json.dumps({"id": user.get("id"), "email": user.get("email")}),
            "context_json": json.dumps(canonical_context),
        }
    )
    run = project_engine_run_for_ui(provider.get_ai_run(canonical_run_id))
    response["run_id"] = run["id"] if run else canonical_run_id
    response["run"] = run
    return {"data": response, "run": run}


# ── AI Runs ──────────────────────────────────────────────────────────────────

@router.get("/api/ai/runs")
async def list_ai_runs(request: Request, limit: int = 50, flow_id: Optional[str] = None):
    require_capability(request, "system.manage", "Only workspace staff or higher can view AI activity.")
    try:
        runs = [project_engine_run_for_ui(run) for run in provider.list_ai_runs(limit=limit)]
        normalized_flow_id = str(flow_id or "").strip()
        if normalized_flow_id:
            runs = [run for run in runs if run and str(run.get("flow_id") or run.get("flowId") or "").strip() == normalized_flow_id]
        return {"data": [run for run in runs if run]}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/ai/run/{run_id}")
async def get_ai_run(request: Request, run_id: str):
    require_capability(request, "system.manage", "Only workspace staff or higher can view AI activity.")
    try:
        raw_run = provider.get_ai_run(run_id) if hasattr(provider, "get_ai_run") else None
        if not raw_run:
            raw_run = next((run for run in provider.list_ai_runs(limit=200) if run.get("id") == run_id), None)
        run = project_engine_run_for_ui(raw_run)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        return {"status": "success", "run": run}
    except HTTPException:
        raise
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ── AI Agents & Definitions ──────────────────────────────────────────────────

@router.get("/api/ai/agents/definitions")
async def get_ai_agent_definitions(request: Request):
    require_capability(request, "system.view", "Only workspace members can view AI agents.")
    defs = {key: value.to_dict() for key, value in AGENT_DEFINITIONS.items()}
    return {"status": "success", "data": defs}


@router.get("/api/ai/agents")
async def list_ai_agents(request: Request, includeHidden: bool = Query(False, alias="includeHidden")):
    session = require_capability(request, "system.view", "Only workspace members can view AI agents.")
    tenant_id = (session.get("tenant") or {}).get("id")
    tenant_role = ((session.get("tenant") or {}).get("role") or "").strip().lower()
    resolved_include_hidden = includeHidden if tenant_role in ["owner", "admin"] else False
    agents = list_runtime_agents(include_hidden=resolved_include_hidden, tenant_id=tenant_id)
    return {"status": "success", "data": agents}


@router.patch("/api/ai/agents/{agent_key}")
async def update_ai_agent(agent_key: str, request: Request, payload: dict = Body(...)):
    session = require_capability(request, "system.manage", "Only workspace editors can update AI agents.")
    tenant_id = (session.get("tenant") or {}).get("id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Missing tenant context.")
    token = extract_session_token(request)
    tenant_settings = auth_store.get_tenant_settings(tenant_id)
    agents_conf = tenant_settings.get("agents") or {}
    overrides = agents_conf.get("overrides") or {}

    target_key = agent_key.upper()
    overrides[target_key] = {
        **overrides.get(target_key, {}),
        **payload,
    }
    payload_to_save = {"agents": {"overrides": overrides}}
    auth_store.update_tenant_settings(token, tenant_id, payload_to_save)
    return {"data": overrides[target_key]}


# ── Voice-to-Text (VTT) Endpoints ────────────────────────────────────────────

@router.post("/api/vtt/command")
async def vtt_command(request: Request, payload: Optional[VTTRequest] = None):
    require_capability(request, "system.view", "Only workspace members can use voice commands.")
    session = request.state.session or {}
    tenant = session.get("tenant") or {}
    raw = (payload.transcript if payload else "").strip()
    if not raw:
        return _build_vtt_response(
            response_type="conversational",
            input_text="",
            command=None,
            response_message="Empty transcript.",
            success=False,
            result={},
            audio_url=None,
            reason="empty_transcript",
        )

    tenant_id = tenant.get("id")
    result = process_transcript(raw, tenant_id=tenant_id, context=payload.context if payload else None)
    voice_enabled = bool(payload.voiceEnabled) if payload else False

    if result.get("action") == "conversational":
        if result.get("response"):
            response_data = result.get("response") or {}
            spoken_text = str(response_data.get("message") or "").strip()
            audio_url = None
            if voice_enabled and spoken_text:
                try:
                    from backend.vtt_service import synthesize_voice
                    audio_url = synthesize_voice(spoken_text, tenant_id=tenant_id)
                except Exception:
                    pass
            return _build_vtt_response(
                response_type="conversational",
                input_text=raw,
                command=None,
                response_message=spoken_text,
                success=True,
                result=result.get("result", {}),
                audio_url=audio_url,
                reason="fast_path_match",
            )
        return _build_vtt_response(
            response_type="conversational",
            input_text=raw,
            command=None,
            response_message="I'm sorry, I didn't recognize that as a command.",
            success=False,
            result={},
            audio_url=None,
            reason="not_a_command",
        )

    response_data = result.get("response") or {}
    spoken_text = str(response_data.get("message") or "").strip()
    audio_url = None
    if voice_enabled and spoken_text:
        try:
            from backend.vtt_service import synthesize_voice
            audio_url = synthesize_voice(spoken_text, tenant_id=tenant_id)
        except Exception:
            pass

    response_type = "command" if result.get("type") == "command" else "conversational"
    command_payload = None
    if response_type == "command":
        command_payload = {
            "action": result.get("action") or "unknown",
            "commandType": result.get("commandType"),
        }
    command_result = dict(result.get("result") or {})

    return _build_vtt_response(
        response_type=response_type,
        input_text=raw,
        command=command_payload,
        response_message=spoken_text,
        success=result.get("action") != "unknown",
        result=command_result,
        audio_url=audio_url,
        reason=str(response_data.get("reason") or "").strip() or None,
    )


@router.get("/api/vtt/providers")
async def list_vtt_commands(request: Request):
    require_capability(request, "system.view", "Only workspace members can view voice commands.")
    try:
        from backend.vtt_service import DEFAULT_REGISTRY, _load_registry
        active = _load_registry()
        return {
            "data": {
                "registry": [{"phrase": e["phrase"], "type": e["type"], "target": e["target"]} for e in active],
                "defaults": [{"phrase": e["phrase"], "type": e["type"], "target": e["target"]} for e in DEFAULT_REGISTRY],
            }
        }
    except Exception as e:
        return {"data": {"registry": [], "defaults": [], "error": str(e)}}


# ── AI Providers & Routing ───────────────────────────────────────────────────

@router.get("/api/ai/providers/catalog")
async def list_ai_provider_catalog(request: Request):
    require_capability(request, "system.view", "Only workspace members can view AI provider options.")
    return {"data": get_ai_provider_catalog()}


@router.get("/api/ai/routing")
async def get_ai_routing_config(request: Request):
    session = require_capability(request, "system.view", "Only workspace members can view AI routing config.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        record = auth_store.get_ai_routing_record_for_tenant(tenant_id) if tenant_id else None
        provider_configs = auth_store.list_ai_provider_configs(token, tenant_id)
        normalized = validate_ai_routing_config((record or {}).get("config"), provider_configs)
        return {"data": {"config": normalized, "updated_at": (record or {}).get("updated_at")}}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/api/ai/routing")
async def upsert_ai_routing_config(request: Request, payload: AIRoutingConfigRequest):
    session = require_capability(request, "system.admin", "Only workspace admins can manage AI routing.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        provider_configs = auth_store.list_ai_provider_configs(token, tenant_id)
        normalized = validate_ai_routing_config(payload.model_dump(exclude_unset=True), provider_configs)
        record = auth_store.upsert_ai_routing_config(token, tenant_id, normalized)
        return {"data": record}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/ai/providers/ollama/models")
async def list_ollama_provider_models_post(request: Request, payload: OllamaModelsRequest):
    session = require_capability(request, "system.view", "Only workspace members can view AI provider options.")
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    try:
        if payload.baseUrl:
            models = list_ollama_models(
                base_url=payload.baseUrl,
                api_key=payload.apiKey,
                username=payload.username,
                password=payload.password,
            )
        else:
            models = list_ollama_models(
                tenant_id=tenant_id,
                api_key=payload.apiKey,
                username=payload.username,
                password=payload.password,
            )
        return {"data": models}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/ai/providers")
async def list_ai_provider_configs(request: Request):
    session = require_capability(request, "system.view", "Only workspace members can view LLMs.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.list_ai_provider_configs(token, tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/api/ai/providers/{provider_key}")
async def upsert_ai_provider_config(provider_key: str, request: Request, payload: AIProviderUpsertRequest):
    session = require_capability(request, "system.admin", "Only workspace admins can manage LLMs.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        config = auth_store.upsert_ai_provider_config(token, tenant_id, provider_key, payload.model_dump())
        return {"data": config}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/ai/providers/{config_id}")
async def delete_ai_provider_config(config_id: str, request: Request):
    session = require_capability(request, "system.admin", "Only workspace admins can delete LLMs.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return auth_store.delete_ai_provider_config(token, tenant_id, config_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/ai/providers/{config_id}/test")
async def test_ai_provider_config(config_id: str, request: Request):
    session = require_capability(request, "system.admin", "Only workspace admins can test LLMs.")
    tenant_id = (session.get("tenant") or {}).get("id")
    config = auth_store.get_ai_provider_config_for_tenant(tenant_id, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="AI provider config not found")
    try:
        result = ai_assist_service.test_provider(config)
        updated = auth_store.save_ai_provider_test_result(
            tenant_id,
            config_id,
            status="connected",
            last_error=None,
            connected_identity=result.get("identity"),
        )
        return {"result": result, "data": updated}
    except ValueError as error:
        updated = auth_store.save_ai_provider_test_result(
            tenant_id,
            config_id,
            status="error",
            last_error=str(error),
        )
        raise HTTPException(status_code=400, detail=updated.get("last_error") or str(error)) from error


# ── Automation Providers (Make, n8n, Zapier) ─────────────────────────────────

@router.get("/api/automation/providers")
async def list_automation_provider_configs(request: Request):
    session = require_capability(request, "system.view", "Only workspace members can view automation providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.list_automation_provider_configs(token, tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/api/automation/providers/{provider_key}")
async def upsert_automation_provider_config(provider_key: str, request: Request, payload: AutomationProviderUpsertRequest):
    session = require_capability(request, "system.admin", "Only workspace admins can manage automation providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        config = auth_store.upsert_automation_provider_config(
            token,
            tenant_id,
            provider_key,
            _automation_provider_internal_payload(payload.model_dump()),
        )
        return {"data": config}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/automation/providers/{config_id}")
async def delete_automation_provider_config(config_id: str, request: Request):
    session = require_capability(request, "system.admin", "Only workspace admins can delete automation providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return auth_store.delete_automation_provider_config(token, tenant_id, config_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/automation/providers/{config_id}/test")
async def test_automation_provider_config(config_id: str, request: Request):
    session = require_capability(request, "system.admin", "Only workspace admins can test automation providers.")
    tenant_id = (session.get("tenant") or {}).get("id")
    config = auth_store.get_automation_provider_config_for_tenant(tenant_id, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Automation provider config not found")
    try:
        result = test_automation_provider(_automation_provider_internal_config(config))
        details = {
            "last_delivery_at": result.get("delivery_at"),
            "last_delivery_status": result.get("status"),
            "last_target_url": result.get("target_url"),
            "last_method": result.get("method"),
            "last_status_code": result.get("status_code"),
        }
        updated = auth_store.save_automation_provider_test_result(
            tenant_id,
            config_id,
            status="connected" if result.get("ok") else "error",
            last_error=None if result.get("ok") else result.get("error"),
            details=details,
        )
        return {"result": result, "data": updated}
    except ValueError as error:
        updated = auth_store.save_automation_provider_test_result(
            tenant_id,
            config_id,
            status="error",
            last_error=str(error),
        )
        raise HTTPException(status_code=400, detail=updated.get("last_error") or str(error)) from error


# ── Data Store Providers (Airtable, Sheets, DBs) ─────────────────────────────

@router.get("/api/data-stores/providers")
async def list_data_store_provider_configs(request: Request):
    session = require_capability(request, "system.view", "Only workspace members can view data store providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": [serialize_data_store_provider_public(item) for item in auth_store.list_data_store_provider_configs(token, tenant_id)]}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/api/data-stores/providers/{providerKey}")
async def upsert_data_store_provider_config(providerKey: str, request: Request, payload: DataStoreProviderUpsertRequest):
    session = require_capability(request, "system.admin", "Only workspace admins can manage data store providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        config = auth_store.upsert_data_store_provider_config(token, tenant_id, providerKey, payload.model_dump())
        return {"data": serialize_data_store_provider_public(config)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/data-stores/providers/{providerKey}")
async def delete_data_store_provider_config(providerKey: str, request: Request):
    session = require_capability(request, "system.admin", "Only workspace admins can delete data store providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        auth_store.delete_data_store_provider_config_by_provider_key(token, tenant_id, providerKey)
        return {"data": None}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/data-stores/providers/{providerKey}/test")
async def test_data_store_provider_config(providerKey: str, request: Request):
    session = require_capability(request, "system.admin", "Only workspace admins can test data store providers.")
    tenant_id = (session.get("tenant") or {}).get("id")
    config = auth_store.get_data_store_provider_config_by_provider_key(tenant_id, providerKey)
    if not config:
        raise HTTPException(status_code=404, detail="Data store provider config not found")
    try:
        result = test_data_store_provider(config)
        config_id = config.get("id")
        if not config_id:
            raise HTTPException(status_code=500, detail="Data store provider id missing")
        updated = auth_store.save_data_store_provider_test_result(
            tenant_id,
            config_id,
            status="connected",
            last_error=None,
            details={"lastRowCount": result.get("count", 0)},
        )
        return {"data": serialize_data_store_provider_public(updated)}
    except ValueError as error:
        config_id = config.get("id")
        if not config_id:
            raise HTTPException(status_code=500, detail="Data store provider id missing")
        updated = auth_store.save_data_store_provider_test_result(
            tenant_id,
            config_id,
            status="error",
            last_error=str(error),
        )
        raise HTTPException(status_code=400, detail=updated.get("lastError") or str(error)) from error


@router.post("/api/data-stores/providers/{providerKey}/read-records")
async def read_records_from_data_store(providerKey: str, request: Request, payload: DataStoreReadRecordsRequest):
    session = require_capability(request, "system.manage", "Only workspace editors can read data store records.")
    tenant_id = (session.get("tenant") or {}).get("id")
    config = auth_store.get_data_store_provider_config_by_provider_key(tenant_id, providerKey)
    if not config:
        raise HTTPException(status_code=404, detail="Data store provider config not found")
    try:
        return {"data": read_data_store_records(config, payload.model_dump(exclude_none=True))}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/data-stores/providers/{providerKey}/create-record")
async def create_record_in_data_store(providerKey: str, request: Request, payload: DataStoreCreateRecordRequest):
    session = require_capability(request, "system.manage", "Only workspace editors can create data store records.")
    tenant_id = (session.get("tenant") or {}).get("id")
    config = auth_store.get_data_store_provider_config_by_provider_key(tenant_id, providerKey)
    if not config:
        raise HTTPException(status_code=404, detail="Data store provider config not found")
    try:
        return {"data": create_data_store_record(config, payload.row)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/data-stores/providers/{providerKey}/update-record")
async def update_record_in_data_store(providerKey: str, request: Request, payload: DataStoreUpdateRecordRequest):
    session = require_capability(request, "system.manage", "Only workspace editors can update data store records.")
    tenant_id = (session.get("tenant") or {}).get("id")
    config = auth_store.get_data_store_provider_config_by_provider_key(tenant_id, providerKey)
    if not config:
        raise HTTPException(status_code=404, detail="Data store provider config not found")
    try:
        return {"data": update_data_store_record(config, payload.recordId, payload.row)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/data-stores/providers/{providerKey}/upsert-record")
async def upsert_record_in_data_store(providerKey: str, request: Request, payload: DataStoreUpsertRecordRequest):
    session = require_capability(request, "system.manage", "Only workspace editors can upsert data store records.")
    tenant_id = (session.get("tenant") or {}).get("id")
    config = auth_store.get_data_store_provider_config_by_provider_key(tenant_id, providerKey)
    if not config:
        raise HTTPException(status_code=404, detail="Data store provider config not found")
    try:
        return {"data": upsert_data_store_record(config, payload.model_dump(exclude_none=True))}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
