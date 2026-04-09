"""
Workflow import utilities for external JSON designs.

This module provides:
- structural detection for supported workflow exports
- parsing into an intermediate graph
- normalization into AIO-native draft flow nodes/edges

It does not perform persistence by itself.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_source(value: Any) -> str:
    return _clean_text(value).lower()


def _search(full_text: str, *patterns: str) -> bool:
    return any(re.search(pattern, full_text) for pattern in patterns)


def _looks_like_n8n(template_json: Any) -> bool:
    if not isinstance(template_json, dict):
        return False
    nodes = template_json.get("nodes")
    connections = template_json.get("connections")
    if not isinstance(nodes, list) or not isinstance(connections, dict):
        return False
    return any(
        isinstance(node, dict)
        and (_clean_text(node.get("type")) or _clean_text(node.get("name")))
        for node in nodes
    )


def _looks_like_make(template_json: Any) -> bool:
    if not isinstance(template_json, dict):
        return False
    flow = template_json.get("flow")
    if not isinstance(flow, list) or not flow:
        return False
    return any(
        isinstance(module, dict)
        and (_clean_text(module.get("module")) or _clean_text(module.get("name")))
        for module in flow
    )


def detect_external_workflow_format(template_json: Any) -> dict[str, Any]:
    if _looks_like_n8n(template_json):
        node_count = len(template_json.get("nodes") or [])
        return {
            "detected": True,
            "source": "n8n",
            "supported": True,
            "convertible": True,
            "label": "n8n workflow",
            "reason": f"Detected n8n workflow structure with {node_count} node(s).",
            "warnings": [],
        }
    if _looks_like_make(template_json):
        module_count = len(template_json.get("flow") or [])
        return {
            "detected": True,
            "source": "make",
            "supported": True,
            "convertible": True,
            "label": "Make.com scenario",
            "reason": f"Detected Make.com scenario structure with {module_count} module(s).",
            "warnings": [
                "Make.com exports do not expose canonical edge wiring here; downstream connections are inferred from module order."
            ],
        }
    return {
        "detected": False,
        "source": None,
        "supported": False,
        "convertible": False,
        "label": "unsupported_json",
        "reason": "JSON does not match a supported workflow export shape.",
        "warnings": [],
    }


def _classify_node(node_type: str, node_name: str, params: dict[str, Any], source: str) -> dict[str, Any]:
    combined = f"{node_type} {node_name}".lower()
    params_str = json.dumps(params, sort_keys=True).lower() if params else ""
    full_text = f"{combined} {params_str}"

    if _search(full_text, r"manual.*trigger|manual.*start"):
        return {"semanticType": "trigger", "mappingQuality": "direct", "iconName": "Play"}
    if _search(full_text, r"schedule|cron|interval|timer"):
        return {"semanticType": "trigger", "mappingQuality": "direct", "iconName": "Clock"}
    if _search(full_text, r"form.*trigger|form.*submit"):
        return {"semanticType": "trigger", "mappingQuality": "direct", "iconName": "FileText"}
    if _search(full_text, r"rss|feed|watch.*rss"):
        return {"semanticType": "trigger", "mappingQuality": "direct", "iconName": "Rss"}
    if _search(full_text, r"webhook"):
        return {
            "semanticType": "trigger",
            "mappingQuality": "approximated",
            "iconName": "Webhook",
            "warning": "External webhook triggers are imported as AIO manual triggers until native webhook-trigger ingestion is available.",
        }
    if _search(full_text, r"email.*send|gmail.*send"):
        return {"semanticType": "publishing", "mappingQuality": "direct", "iconName": "Mail"}
    if _search(full_text, r"sms|twilio.*message|telnyx.*message"):
        return {"semanticType": "publishing", "mappingQuality": "direct", "iconName": "MessageSquare"}
    if _search(full_text, r"http.*request|api|rest|graphql|slack.*post|discord.*webhook"):
        return {"semanticType": "externalApi", "mappingQuality": "direct", "iconName": "Globe"}
    if _search(full_text, r"database|postgres|mysql|mongo|sqlite|spreadsheet|sheets|airtable|notion|record"):
        return {"semanticType": "storage", "mappingQuality": "direct", "iconName": "Database"}
    if _search(full_text, r"set.*variable|set\b|assign\b"):
        return {"semanticType": "transformation", "mappingQuality": "direct", "iconName": "Settings"}
    if _search(full_text, r"wait|delay|sleep"):
        return {"semanticType": "condition", "mappingQuality": "approximated", "iconName": "Clock"}
    if _search(full_text, r"\bif\b|condition|filter"):
        return {"semanticType": "condition", "mappingQuality": "approximated", "iconName": "Filter"}
    if _search(full_text, r"router|branch|switch|split"):
        return {"semanticType": "routing", "mappingQuality": "approximated", "iconName": "SlidersHorizontal"}
    if _search(full_text, r"openai|gpt|langchain|agent|llm|claude|anthropic|perplexity|gemini"):
        return {
            "semanticType": "contentGeneration",
            "mappingQuality": "approximated",
            "iconName": "Sparkles",
            "warning": "AI generation nodes are preserved as imported AIO actions and require operator review before activation.",
        }
    if _search(full_text, r"text.*to.*speech|tts|voice.*gen|eleven.*labs"):
        return {
            "semanticType": "contentGeneration",
            "mappingQuality": "approximated",
            "iconName": "Headphones",
            "warning": "Text-to-speech nodes are preserved as imported AIO actions unless their config maps directly.",
        }
    if _search(full_text, r"transcribe|speech.*to.*text|whisper"):
        return {
            "semanticType": "contentGeneration",
            "mappingQuality": "approximated",
            "iconName": "Mic",
            "warning": "Transcription nodes are preserved as imported AIO actions unless their config maps directly.",
        }
    if _search(full_text, r"publish|upload|post|tweet|linkedin|youtube|facebook|instagram"):
        return {
            "semanticType": "publishing",
            "mappingQuality": "approximated",
            "iconName": "Send",
            "warning": "Publishing nodes are preserved with source configuration for manual review.",
        }
    return {
        "semanticType": "unknown",
        "mappingQuality": "unknown",
        "iconName": "Zap",
        "warning": f"Node type '{node_type or node_name or source}' has no direct AIO mapping and is preserved as a generic imported action.",
    }


def parse_external_template(source: str, template_json: dict[str, Any]) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    warnings: list[str] = []
    source = _normalize_source(source)

    if source == "n8n":
        raw_nodes = template_json.get("nodes", [])
        raw_connections = template_json.get("connections", {})

        for index, raw_node in enumerate(raw_nodes):
            if not isinstance(raw_node, dict):
                continue
            node_id = _clean_text(raw_node.get("id")) or _clean_text(raw_node.get("name")) or f"node-{index}"
            node_type = _clean_text(raw_node.get("type"))
            node_name = _clean_text(raw_node.get("name")) or node_type or f"Node {index + 1}"
            params = raw_node.get("parameters") if isinstance(raw_node.get("parameters"), dict) else {}
            position = raw_node.get("position") if isinstance(raw_node.get("position"), list) else [index * 280, 200]

            classification = _classify_node(node_type, node_name, params, source)
            if classification.get("warning"):
                warnings.append(f"[{node_name}] {classification['warning']}")

            nodes.append(
                {
                    "id": node_id,
                    "originalType": node_type,
                    "name": node_name,
                    "parameters": params,
                    "position": {"x": position[0], "y": position[1]},
                    "classification": classification,
                    "source": source,
                }
            )

        for source_id, connection_groups in raw_connections.items():
            if not isinstance(connection_groups, dict):
                continue
            for handle_type, targets in connection_groups.items():
                if not isinstance(targets, list):
                    continue
                for target_group in targets:
                    if not isinstance(target_group, list):
                        continue
                    for target in target_group:
                        if not isinstance(target, dict) or not _clean_text(target.get("node")):
                            continue
                        edges.append(
                            {
                                "source": _clean_text(source_id),
                                "target": _clean_text(target.get("node")),
                                "sourceHandle": handle_type,
                                "targetHandle": _clean_text(target.get("type")) or "main",
                            }
                        )

    elif source == "make":
        raw_modules = template_json.get("flow", [])
        for index, raw_module in enumerate(raw_modules):
            if not isinstance(raw_module, dict):
                continue
            node_id = _clean_text(raw_module.get("id")) or f"module-{index}"
            module_type = _clean_text(raw_module.get("module"))
            node_name = _clean_text(raw_module.get("name")) or module_type or f"Module {index + 1}"
            params = raw_module.get("mapper") if isinstance(raw_module.get("mapper"), dict) else {}
            designer = raw_module.get("metadata", {}).get("designer") if isinstance(raw_module.get("metadata"), dict) else {}
            position = [
                designer.get("x", index * 280) if isinstance(designer, dict) else index * 280,
                designer.get("y", 200) if isinstance(designer, dict) else 200,
            ]

            classification = _classify_node(module_type, node_name, params, source)
            if classification.get("warning"):
                warnings.append(f"[{node_name}] {classification['warning']}")

            nodes.append(
                {
                    "id": node_id,
                    "originalType": module_type,
                    "name": node_name,
                    "parameters": params,
                    "position": {"x": position[0], "y": position[1]},
                    "classification": classification,
                    "source": source,
                }
            )

        if len(nodes) > 1:
            for index in range(len(nodes) - 1):
                edges.append(
                    {
                        "source": nodes[index]["id"],
                        "target": nodes[index + 1]["id"],
                        "sourceHandle": "main",
                        "targetHandle": "main",
                    }
                )
            warnings.append("Make.com connections were inferred from module order.")
    else:
        raise ValueError(f"Unsupported source '{source}'.")

    return {"source": source, "nodes": nodes, "edges": edges, "warnings": list(dict.fromkeys(warnings))}


def _safe_json_string(value: dict[str, Any]) -> str:
    return json.dumps(value, indent=2, sort_keys=True)


def _deep_first(mapping: Any, *keys: str) -> Any:
    if not isinstance(mapping, dict):
        return None
    for key in keys:
        if key in mapping and mapping[key] not in {None, ""}:
            return mapping[key]
    return None


def _extract_delay_config(params: dict[str, Any]) -> dict[str, Any] | None:
    duration = _deep_first(params, "amount", "duration", "value", "waitAmount")
    unit = _clean_text(_deep_first(params, "unit", "waitUnit", "interval"))
    if duration in {None, ""}:
        return None
    if not unit:
        unit = "minutes"
    unit = unit.lower()
    unit_aliases = {
        "second": "seconds",
        "seconds": "seconds",
        "minute": "minutes",
        "minutes": "minutes",
        "hour": "hours",
        "hours": "hours",
        "day": "days",
        "days": "days",
    }
    normalized_unit = unit_aliases.get(unit)
    if not normalized_unit:
        return None
    return {
        "logicType": "time_delay",
        "duration": duration,
        "unit": normalized_unit,
    }


def _extract_n8n_condition_config(params: dict[str, Any]) -> dict[str, Any] | None:
    conditions = params.get("conditions")
    if not isinstance(conditions, dict):
        return None
    for value in conditions.values():
        if not isinstance(value, list):
            continue
        for item in value:
            if not isinstance(item, dict):
                continue
            left = item.get("value1")
            right = item.get("value2")
            operator = _clean_text(item.get("operation"))
            if left in {None, ""} or not operator:
                continue
            operator_map = {
                "equal": "equals",
                "equals": "equals",
                "notEqual": "not_equals",
                "not_equal": "not_equals",
                "larger": "greater_than",
                "largerEqual": "greater_than_or_equal",
                "smaller": "less_than",
                "smallerEqual": "less_than_or_equal",
                "contains": "contains",
                "notContains": "not_contains",
                "empty": "is_empty",
                "notEmpty": "is_not_empty",
            }
            normalized_operator = operator_map.get(operator, operator.lower())
            return {
                "operator": normalized_operator,
                "left": left,
                "right": right,
            }
    return None


def _extract_make_condition_config(params: dict[str, Any]) -> dict[str, Any] | None:
    filters = params.get("conditions") or params.get("filter")
    entries = filters if isinstance(filters, list) else [filters] if isinstance(filters, dict) else []
    for item in entries:
        if not isinstance(item, dict):
            continue
        left = _deep_first(item, "a", "left", "leftOperand", "field")
        right = _deep_first(item, "b", "right", "rightOperand", "value")
        operator = _clean_text(_deep_first(item, "o", "operator", "comparison"))
        if left in {None, ""} or not operator:
            continue
        operator_map = {
            "equal": "equals",
            "equals": "equals",
            "not_equal": "not_equals",
            "contains": "contains",
            "not_contains": "not_contains",
            "gt": "greater_than",
            "gte": "greater_than_or_equal",
            "lt": "less_than",
            "lte": "less_than_or_equal",
        }
        return {
            "operator": operator_map.get(operator.lower(), operator.lower()),
            "left": left,
            "right": right,
        }
    return None


def _extract_http_config(params: dict[str, Any]) -> dict[str, Any] | None:
    url = _clean_text(_deep_first(params, "url", "uri", "endpoint"))
    if not url:
        return None
    return {
        "actionType": "http_request",
        "url": url,
        "method": _clean_text(_deep_first(params, "method")) or "GET",
        "headers": params.get("headers") if isinstance(params.get("headers"), dict) else {},
        "payloadMap": params.get("body") or params.get("payload") or params.get("jsonBody") or "",
    }


def _extract_email_config(params: dict[str, Any]) -> dict[str, Any] | None:
    recipient = _deep_first(params, "to", "email", "recipient")
    subject = _deep_first(params, "subject")
    body = _deep_first(params, "text", "body", "message", "html")
    if recipient in {None, ""} and body in {None, ""}:
        return None
    return {
        "actionType": "send_email",
        "to": recipient or "",
        "subject": subject or "",
        "body": body or "",
    }


def _extract_sms_config(params: dict[str, Any]) -> dict[str, Any] | None:
    body = _deep_first(params, "message", "text", "body")
    recipient = _deep_first(params, "to", "phone", "phoneNumber")
    if body in {None, ""}:
        return None
    return {
        "actionType": "send_sms",
        "to": recipient or "",
        "message": body,
    }


def _extract_storage_config(params: dict[str, Any]) -> dict[str, Any] | None:
    return {
        "actionType": "store_data",
        "entityType": _clean_text(_deep_first(params, "resource", "table", "collection")) or "external_record",
        "payloadMap": _safe_json_string(params),
    }


def _extract_set_variable_config(params: dict[str, Any]) -> dict[str, Any] | None:
    if not params:
        return None
    name = _clean_text(_deep_first(params, "name", "variable", "key"))
    value = _deep_first(params, "value", "expression")
    if not name and value in {None, ""}:
        return None
    return {
        "actionType": "set_variable",
        "name": name or "importedValue",
        "value": value,
    }


def _resolve_direct_mapping(node: dict[str, Any]) -> dict[str, Any]:
    original_type = _clean_text(node.get("originalType"))
    node_name = _clean_text(node.get("name"))
    params = node.get("parameters") if isinstance(node.get("parameters"), dict) else {}
    source = _normalize_source(node.get("source"))
    full_text = f"{original_type} {node_name} {json.dumps(params, sort_keys=True)}".lower()

    if _search(full_text, r"manual.*trigger|manual.*start"):
        return {"type": "trigger", "templateId": "manual-trigger", "iconName": "Play", "config": {}}
    if _search(full_text, r"schedule|cron|interval|timer"):
        return {
            "type": "trigger",
            "templateId": "scheduled-trigger",
            "iconName": "Clock",
            "config": {
                key: value
                for key, value in {
                    "cronExpression": _deep_first(params, "rule", "cronExpression", "cron"),
                    "interval": _deep_first(params, "interval"),
                }.items()
                if value not in {None, ""}
            },
        }
    if _search(full_text, r"form.*trigger|form.*submit"):
        return {"type": "trigger", "templateId": "form-submitted-trigger", "iconName": "FileText", "config": {}}
    if _search(full_text, r"rss|feed|watch.*rss"):
        return {
            "type": "trigger",
            "templateId": "rss-ingest-trigger",
            "iconName": "Rss",
            "config": {
                "feedUrl": _clean_text(_deep_first(params, "url", "feedUrl", "feed_url")) or "",
            },
        }
    if _search(full_text, r"webhook"):
        return {
            "type": "trigger",
            "templateId": "manual-trigger",
            "iconName": "Webhook",
            "config": {
                "importedTriggerType": "webhook",
            },
            "warning": "Imported external webhook trigger was normalized to a manual trigger for AIO compatibility.",
        }

    email_config = _extract_email_config(params)
    if email_config:
        return {"type": "action", "templateId": "send-email", "iconName": "Mail", "config": email_config}

    sms_config = _extract_sms_config(params)
    if sms_config:
        return {"type": "action", "templateId": "send-sms", "iconName": "MessageSquare", "config": sms_config}

    http_config = _extract_http_config(params)
    if http_config and _search(full_text, r"http.*request|api|rest|graphql|slack.*post|discord.*webhook"):
        return {"type": "webhook", "templateId": "http-request", "iconName": "Globe", "config": http_config}

    if _search(full_text, r"database|postgres|mysql|mongo|sqlite|spreadsheet|sheets|airtable|notion|record"):
        return {"type": "action", "templateId": "store-data", "iconName": "Database", "config": _extract_storage_config(params)}

    set_variable_config = _extract_set_variable_config(params)
    if set_variable_config and _search(full_text, r"set.*variable|set\b|assign\b"):
        return {"type": "action", "templateId": "set-variable", "iconName": "Settings", "config": set_variable_config}

    delay_config = _extract_delay_config(params)
    if delay_config:
        return {"type": "logic", "templateId": "time-delay", "iconName": "Clock", "config": delay_config}

    return {
        "type": "action",
        "templateId": "external-import",
        "iconName": node.get("classification", {}).get("iconName") or "Zap",
        "config": {
            "configuration": _safe_json_string(
                {
                    "sourceFormat": source,
                    "originalType": original_type,
                    "name": node_name,
                    "parameters": params,
                }
            )
        },
    }


def _build_imported_node(node: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    mapping = _resolve_direct_mapping(node)
    data_config = mapping.get("config") if isinstance(mapping.get("config"), dict) else {}
    warnings: list[str] = []
    if mapping.get("warning"):
        warnings.append(f"[{_clean_text(node.get('name'))}] {mapping['warning']}")
    if node.get("classification", {}).get("warning"):
        warnings.append(f"[{_clean_text(node.get('name'))}] {node['classification']['warning']}")
    return (
        {
            "id": node["id"],
            "type": mapping["type"],
            "data": {
                "label": node.get("name") or "Imported Node",
                "iconName": mapping.get("iconName") or "Zap",
                "templateId": mapping["templateId"],
                "config": data_config,
                "originalType": node.get("originalType"),
                "semanticType": node.get("classification", {}).get("semanticType", "unknown"),
                "mappingQuality": node.get("classification", {}).get("mappingQuality", "unknown"),
                "importedSource": {
                    "sourceFormat": node.get("source"),
                    "originalType": node.get("originalType"),
                    "parameters": node.get("parameters") if isinstance(node.get("parameters"), dict) else {},
                },
            },
            "position": node.get("position") or {"x": 0, "y": 0},
        },
        warnings,
    )


def _root_target_ids(edges: list[dict[str, Any]], nodes: list[dict[str, Any]]) -> list[str]:
    incoming: dict[str, int] = {}
    for edge in edges:
        target = _clean_text(edge.get("target"))
        if target:
            incoming[target] = incoming.get(target, 0) + 1
    return [
        _clean_text(node.get("id"))
        for node in nodes
        if _clean_text(node.get("id")) and incoming.get(_clean_text(node.get("id")), 0) == 0 and _clean_text(node.get("type")).lower() != "trigger"
    ]


def normalize_to_aio_flow(parsed_data: dict[str, Any]) -> dict[str, Any]:
    source = _normalize_source(parsed_data.get("source"))
    nodes = parsed_data.get("nodes") if isinstance(parsed_data.get("nodes"), list) else []
    edges = parsed_data.get("edges") if isinstance(parsed_data.get("edges"), list) else []
    warnings = list(parsed_data.get("warnings") or [])

    aio_nodes: list[dict[str, Any]] = []
    aio_edges: list[dict[str, Any]] = []
    semantic_counts: dict[str, int] = {}
    direct_count = 0
    approximated_count = 0
    unknown_count = 0

    for parsed_node in nodes:
        if not isinstance(parsed_node, dict):
            continue
        converted_node, node_warnings = _build_imported_node(parsed_node)
        aio_nodes.append(converted_node)
        warnings.extend(node_warnings)
        semantic_type = _clean_text((parsed_node.get("classification") or {}).get("semanticType")) or "unknown"
        semantic_counts[semantic_type] = semantic_counts.get(semantic_type, 0) + 1
        mapping_quality = _clean_text((parsed_node.get("classification") or {}).get("mappingQuality")) or "unknown"
        if mapping_quality == "direct":
            direct_count += 1
        elif mapping_quality == "approximated":
            approximated_count += 1
        else:
            unknown_count += 1

    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source_id = _clean_text(edge.get("source"))
        target_id = _clean_text(edge.get("target"))
        if not source_id or not target_id:
            continue
        aio_edges.append(
            {
                "id": f"e-{source_id}-{target_id}",
                "source": source_id,
                "target": target_id,
                "sourceHandle": edge.get("sourceHandle") or "main",
                "targetHandle": edge.get("targetHandle") or "main",
                "animated": False,
            }
        )

    if not any(_clean_text(node.get("type")).lower() == "trigger" for node in aio_nodes):
        trigger_node = {
            "id": "import-trigger-manual",
            "type": "trigger",
            "data": {
                "label": "Imported Manual Trigger",
                "iconName": "Play",
                "templateId": "manual-trigger",
                "config": {
                    "importedTriggerFallback": True,
                    "sourceFormat": source,
                },
                "mappingQuality": "approximated",
            },
            "position": {"x": -320, "y": 200},
        }
        aio_nodes.insert(0, trigger_node)
        for target_id in _root_target_ids(aio_edges, aio_nodes):
            aio_edges.append(
                {
                    "id": f"e-import-trigger-manual-{target_id}",
                    "source": "import-trigger-manual",
                    "target": target_id,
                    "sourceHandle": "main",
                    "targetHandle": "main",
                    "animated": False,
                }
            )
        warnings.append("No native trigger could be mapped from the source workflow. A manual trigger was inserted as the AIO entry point.")

    total_nodes = len(nodes)
    usability = "high" if unknown_count == 0 and approximated_count <= max(1, total_nodes // 3) else "partial"

    return {
        "flow": {
            "nodes": aio_nodes,
            "edges": aio_edges,
            "metadata": {
                "importSourceFormat": source,
                "importedAt": datetime.now(timezone.utc).isoformat(),
                "warnings": list(dict.fromkeys(warnings)),
                "conversionSummary": {
                    "totalNodes": total_nodes,
                    "directMappings": direct_count,
                    "approximatedMappings": approximated_count,
                    "unknownMappings": unknown_count,
                    "semanticTypeCounts": semantic_counts,
                    "usabilityRating": usability,
                },
            },
        }
    }
