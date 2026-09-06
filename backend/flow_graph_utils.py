from __future__ import annotations

import json
import re
from typing import Any
from uuid import uuid4

from backend.agent_definitions import AGENT_DEFINITIONS
from backend.deps import clean_text
from backend.orchestration import validate_prepared_flow_steps


def normalize_agent_key(value: Any) -> str:
    resolved = " ".join(str(value or "").split()).strip().upper()
    return resolved if resolved in AGENT_DEFINITIONS else ""


def extract_flow_graph(flow: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    spec = flow.get("spec") if isinstance(flow.get("spec"), dict) else {}
    spec_nodes = spec.get("nodes") if isinstance(spec.get("nodes"), list) else []
    spec_edges = spec.get("edges") if isinstance(spec.get("edges"), list) else []
    nodes = spec_nodes or (flow.get("nodes") if isinstance(flow.get("nodes"), list) else [])
    edges = spec_edges or (flow.get("edges") if isinstance(flow.get("edges"), list) else [])
    return nodes, edges


def order_flow_nodes(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not nodes:
        return []
    node_map = {str(node.get("id")): node for node in nodes if node.get("id")}
    ordered_ids: list[str] = []
    indegree = {node_id: 0 for node_id in node_map}
    adjacency = {node_id: [] for node_id in node_map}

    for edge in edges:
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if source in adjacency and target in indegree:
            adjacency[source].append(target)
            indegree[target] += 1

    queue = [node_id for node_id, degree in indegree.items() if degree == 0]
    queue.sort(key=lambda node_id: next((index for index, node in enumerate(nodes) if str(node.get("id")) == node_id), 0))

    while queue:
        node_id = queue.pop(0)
        ordered_ids.append(node_id)
        for target in adjacency.get(node_id, []):
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)

    for node in nodes:
        node_id = str(node.get("id") or "").strip()
        if node_id and node_id not in ordered_ids:
            ordered_ids.append(node_id)

    return [node_map[node_id] for node_id in ordered_ids if node_id in node_map]


def infer_flow_step_agent(node: dict[str, Any], fallback_agent: str = "") -> str:
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    for candidate in (
        data.get("assignedAgent"),
        data.get("agent"),
        data.get("agentKey"),
        data.get("selectedAgent"),
        node.get("assignedAgent"),
        node.get("agent"),
    ):
        normalized = normalize_agent_key(candidate)
        if normalized:
            return normalized

    haystacks = [
        str(node.get("id") or ""),
        str(node.get("type") or ""),
        str(data.get("label") or ""),
        str(data.get("description") or ""),
        str(data.get("typeLabel") or ""),
    ]
    for agent_name in AGENT_DEFINITIONS.keys():
        for haystack in haystacks:
            if re.search(rf"\b{re.escape(agent_name)}\b", haystack, flags=re.IGNORECASE):
                return agent_name
    return normalize_agent_key(fallback_agent) or "ALPHA"


def parse_json_config(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def infer_flow_step_intent(node: dict[str, Any]) -> str:
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    config = data.get("config") if isinstance(data.get("config"), dict) else {}
    template_id = str(data.get("templateId") or node.get("templateId") or "").strip().lower().replace("-", "_")
    node_type = str(node.get("type") or "").strip().lower()
    action_type = str(
        config.get("actionType")
        or data.get("actionType")
        or ""
    ).strip().lower()
    logic_type = str(
        config.get("logicType")
        or data.get("logicType")
        or ""
    ).strip().lower()
    if action_type in {
        "create_booking", "update_booking", "cancel_booking", "get_booking",
        "verify_email", "verify_email_bulk", "generate_script", "generate_run_of_show",
        "generate_voice", "text_to_speech", "generate_thumbnail", "generate_video",
        "transcribe_media", "ingest_meeting_artifacts", "publish_asset", "rss_ingest",
        "generate_image", "generate_podcast_script", "generate_postbot_content",
        "set_variable", "send_email", "send_sms", "store_data", "http_request",
    }:
        return action_type
    if logic_type in {"if_then", "wait_for_verification", "verification_branch", "time_delay", "delay", "filter", "switch"}:
        return "time_delay" if logic_type in {"time_delay", "delay"} else logic_type
    if template_id in {"time_delay", "delay"}:
        return "time_delay"
    if template_id in {"filter", "switch"}:
        return template_id
    if template_id in {
        "set_variable", "send_email", "send_sms", "store_data", "http_request",
        "generate_script", "generate_run_of_show", "generate_voice", "text_to_speech",
        "generate_thumbnail", "generate_video", "transcribe_media", "ingest_meeting_artifacts",
        "publish_asset", "rss_ingest", "generate_image", "generate_podcast_script",
        "generate_postbot_content",
    }:
        return template_id
    if node_type == "webhook" and template_id == "webhook":
        return "webhook"
    return "agent_task"


def normalize_flow_trigger_key(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def trigger_node_event_keys(node: dict[str, Any]) -> set[str]:
    if str(node.get("type") or "").lower() != "trigger":
        return set()
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    config = data.get("config") if isinstance(data.get("config"), dict) else {}
    candidates = {
        config.get("event"),
        data.get("templateId"),
        data.get("id"),
        data.get("label"),
        node.get("id"),
    }
    keys: set[str] = set()
    for candidate in candidates:
        normalized = normalize_flow_trigger_key(candidate)
        if not normalized:
            continue
        keys.add(normalized)
        if normalized.endswith("_trigger"):
            keys.add(normalized[:-8])
    return keys


def resolve_flow_trigger_targets(flow: dict[str, Any], trigger_key: str) -> list[str]:
    normalized_key = normalize_flow_trigger_key(trigger_key)
    if not normalized_key:
        return []
    nodes, edges = extract_flow_graph(flow)
    outgoing_by_node: dict[str, list[str]] = {}
    for edge in edges:
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if source and target:
            outgoing_by_node.setdefault(source, []).append(target)
    targets: list[str] = []
    seen: set[str] = set()
    for node in nodes:
        node_id = str(node.get("id") or "").strip()
        if not node_id or normalized_key not in trigger_node_event_keys(node):
            continue
        for target in outgoing_by_node.get(node_id, []):
            if target and target not in seen:
                seen.add(target)
                targets.append(target)
    return targets


def reachable_flow_node_ids(edges: list[dict[str, Any]], start_node_ids: list[str]) -> set[str]:
    outgoing_by_node: dict[str, list[str]] = {}
    for edge in edges:
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if source and target:
            outgoing_by_node.setdefault(source, []).append(target)
    reachable: set[str] = set()
    stack = [node_id for node_id in start_node_ids if node_id]
    while stack:
        node_id = stack.pop()
        if not node_id or node_id in reachable:
            continue
        reachable.add(node_id)
        for target in outgoing_by_node.get(node_id, []):
            if target not in reachable:
                stack.append(target)
    return reachable


def validate_flow_graph(flow: dict[str, Any]) -> dict[str, list[str]]:
    blockers: list[str] = []
    warnings: list[str] = []
    nodes, edges = extract_flow_graph(flow)
    if not nodes:
        blockers.append("Flow has no nodes.")
        return {"blockers": blockers, "warnings": warnings}

    node_ids = {clean_text(node.get("id")) for node in nodes if clean_text(node.get("id"))}
    trigger_nodes = [node for node in nodes if clean_text(node.get("type")).lower() == "trigger"]
    if not trigger_nodes:
        blockers.append("Flow requires at least one trigger node.")

    for edge in edges:
        source = clean_text(edge.get("source"))
        target = clean_text(edge.get("target"))
        if not source or not target:
            blockers.append("Flow contains an edge without both source and target.")
            continue
        if source not in node_ids or target not in node_ids:
            blockers.append(f"Flow edge '{clean_text(edge.get('id')) or f'{source}->{target}'}' references a missing node.")

    if trigger_nodes:
        reachable = reachable_flow_node_ids(edges, [clean_text(node.get("id")) for node in trigger_nodes])
        for node in nodes:
            node_id = clean_text(node.get("id"))
            node_type = clean_text(node.get("type")).lower()
            if node_type in {"trigger", "frame", "note"}:
                continue
            if node_id and node_id not in reachable:
                blockers.append(f"Node '{clean_text((node.get('data') or {}).get('label')) or node_id}' is not reachable from any trigger.")
    return {"blockers": list(dict.fromkeys(blockers)), "warnings": list(dict.fromkeys(warnings))}


def flow_preflight_validation(flow: dict[str, Any], raw_steps: list[dict[str, Any]]) -> dict[str, list[str]]:
    graph_validation = validate_flow_graph(flow)
    step_validation = validate_prepared_flow_steps(raw_steps)
    return {
        "blockers": list(dict.fromkeys([*graph_validation["blockers"], *step_validation["blockers"]])),
        "warnings": list(dict.fromkeys([*graph_validation["warnings"], *step_validation["warnings"]])),
    }


def build_flow_execution_steps(
    flow: dict[str, Any],
    command_text: str,
    fallback_agent: str = "",
    runtime_context: dict[str, Any] | None = None,
    start_node_ids: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    nodes, edges = extract_flow_graph(flow)
    ordered_nodes = order_flow_nodes(nodes, edges)
    outgoing_by_node: dict[str, list[dict[str, Any]]] = {}
    incoming_by_node: dict[str, list[dict[str, Any]]] = {}
    for edge in edges:
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if not source or not target:
            continue
        edge_data = edge.get("data") if isinstance(edge.get("data"), dict) else {}
        projected_edge = {
            "id": str(edge.get("id") or f"flow-edge-{uuid4().hex[:10]}"),
            "source": source,
            "target": target,
            "condition": edge_data.get("condition") or edge.get("condition"),
            "label": edge_data.get("label") or edge.get("label"),
            "sourceHandle": edge.get("sourceHandle"),
            "targetHandle": edge.get("targetHandle"),
        }
        outgoing_by_node.setdefault(source, []).append(projected_edge)
        incoming_by_node.setdefault(target, []).append(projected_edge)

    allowed_node_ids = reachable_flow_node_ids(edges, start_node_ids) if start_node_ids is not None else None
    executable_nodes = [
        node for node in ordered_nodes
        if str(node.get("type") or "").lower() not in {"trigger", "frame", "note"}
        and (allowed_node_ids is None or str(node.get("id") or "").strip() in allowed_node_ids)
    ]
    raw_steps: list[dict[str, Any]] = []
    agent_chain: list[str] = []
    flow_id = str(flow.get("id") or "").strip()
    flow_name = str(flow.get("name") or "Untitled Flow").strip() or "Untitled Flow"
    step_count = len(executable_nodes)

    runtime_context = runtime_context or {}

    for index, node in enumerate(executable_nodes, start=1):
        data = node.get("data") if isinstance(node.get("data"), dict) else {}
        node_config = data.get("config") if isinstance(data.get("config"), dict) else {}
        action_intent = infer_flow_step_intent(node)
        node_id = str(node.get("id") or f"flow-node-{index}")
        node_label = str(data.get("label") or node.get("label") or f"Step {index}").strip() or f"Step {index}"
        node_description = str(data.get("description") or "").strip()
        assigned_agent = infer_flow_step_agent(node, fallback_agent or ("DELTA" if action_intent in {"create_booking", "update_booking", "cancel_booking", "get_booking"} else ""))
        agent_definition = AGENT_DEFINITIONS.get(assigned_agent) or AGENT_DEFINITIONS["ALPHA"]
        if assigned_agent not in agent_chain:
            agent_chain.append(assigned_agent)
        parameters: dict[str, Any] = {
            "original_command": command_text,
            "flow_id": flow_id,
            "flow_name": flow_name,
            "node_id": node_id,
            "node_type": str(node.get("type") or "action"),
            "node_label": node_label,
            "node_description": node_description,
            "step_index": index,
            "step_count": step_count,
            "node_config": node_config,
            "configuration": parse_json_config(node_config.get("configuration")),
            "outgoing_edges": outgoing_by_node.get(node_id, []),
            "incoming_edges": incoming_by_node.get(node_id, []),
            "trigger_event": runtime_context.get("trigger_event"),
            "booking_event": runtime_context.get("booking_event"),
        }
        if action_intent == "agent_task":
            step_command_parts = [
                f"Flow {flow_name} step {index} of {step_count}: {node_label}.",
                f"Operator command: {command_text}",
            ]
            if node_description:
                step_command_parts.append(f"Node description: {node_description}")
            if node_config.get("configuration"):
                step_command_parts.append(f"Node configuration: {node_config.get('configuration')}")
            if node_config.get("actionType"):
                step_command_parts.append(f"Action type: {node_config.get('actionType')}")
            parameters["command"] = " ".join(part for part in step_command_parts if part).strip()
        raw_steps.append(
            {
                "id": node_id,
                "intent": action_intent,
                "parameters": parameters,
                "assignedAgent": assigned_agent,
                "agentId": agent_definition.agent_id,
            }
        )
    return raw_steps, agent_chain
