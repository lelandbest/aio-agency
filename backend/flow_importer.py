"""
AIO Flow Import Gate — Phase 2 (Semantic Upgrade Layer)

Converts n8n / Make.com workflow JSON into preview-ready AIO flow drafts.
- Structural conversion
- Semantic node classification
- AIO-native mapping suggestions
- Warnings for unsupported/ambiguous behavior
- No DB writes, no execution, no persistence
"""

import json
import re
from datetime import datetime, timezone
from typing import Any

# Deterministic semantic classification buckets
SEMANTIC_TYPES = {
    "trigger", "ingestion", "contentGeneration", "transformation",
    "routing", "condition", "publishing", "externalApi", "storage", "unknown"
}

# Mapping rules: (pattern_match, semantic_type, aio_node_type, icon)
# n8n patterns
_N8N_CLASSIFIERS = [
    # Triggers
    (r"webhook", "trigger", "trigger", "Webhook"),
    (r"manual.*trigger|manual.*start", "trigger", "trigger", "Play"),
    (r"schedule|cron|interval|timer", "trigger", "trigger", "Clock"),
    (r"form.*trigger|form.*submit", "trigger", "trigger", "FileText"),
    (r"email.*trigger|imap.*trigger", "trigger", "trigger", "Mail"),
    # Ingestion
    (r"rss|feed|crawl|scrape", "ingestion", "action", "Rss"),
    (r"read.*file|local.*file.*trigger", "ingestion", "action", "FolderOpen"),
    # Content generation
    (r"openai|gpt|langchain|agent|llm|claude|anthropic|perplexity|gemini|chat.*completion", "contentGeneration", "action", "Sparkles"),
    (r"generate.*image|dall|stable.*diffusion|image.*gen", "contentGeneration", "action", "Image"),
    (r"text.*to.*speech|tts|voice.*gen|eleven.*labs", "contentGeneration", "action", "Headphones"),
    (r"transcribe|speech.*to.*text|whisper", "contentGeneration", "action", "Mic"),
    # Transformation
    (r"set|aggregate|merge|summarize|transform|format|code|function|javascript|python|split", "transformation", "action", "GitMerge"),
    (r"html.*extract|xml.*parse|json.*parse|csv.*parse", "transformation", "action", "Code"),
    # Routing / Condition
    (r"router|branch|switch|split", "routing", "logic", "GitMerge"),
    (r"if|condition|filter|wait.*for|verification", "condition", "logic", "Filter"),
    # Publishing
    (r"publish|upload|create.*post|create.*tweet|facebook.*post|instagram.*post|linkedin.*post|youtube.*upload|youtube.*video", "publishing", "action", "Send"),
    (r"email.*send|gmail.*send|slack.*post|discord.*webhook", "publishing", "action", "Send"),
    # External API
    (r"http.*request|api|webhook.*call|rest|graphql", "externalApi", "action", "Globe"),
    # Storage
    (r"database|postgres|mysql|mongo|sqlite|spreadsheet|sheets|airtable|notion|create.*record|update.*record|delete.*record", "storage", "action", "Database"),
    (r"file.*write|s3.*upload|dropbox|google.*drive", "storage", "action", "Folder"),
]

# Make patterns
_MAKE_CLASSIFIERS = [
    # Triggers
    (r"webhook|instant.*trigger|polling.*trigger", "trigger", "trigger", "Webhook"),
    (r"schedule|timer|cron", "trigger", "trigger", "Clock"),
    (r"form.*watch|form.*trigger", "trigger", "trigger", "FileText"),
    # Ingestion
    (r"rss|feed|watch.*rss", "ingestion", "action", "Rss"),
    # Content generation
    (r"openai|gpt|claude|anthropic|llm|text.*generator|chat.*completion|make.*an.*api.*call.*open.*router", "contentGeneration", "action", "Sparkles"),
    (r"generate.*image|dall", "contentGeneration", "action", "Image"),
    (r"text.*to.*speech|tts|eleven.*labs", "contentGeneration", "action", "Headphones"),
    # Transformation
    (r"aggregator|iterator|text.*aggregator|json|csv|set.*variable|map", "transformation", "action", "GitMerge"),
    # Routing / Condition
    (r"router|filter|if|condition|switch", "condition", "logic", "Filter"),
    # Publishing
    (r"create.*post|create.*tweet|create.*a.*tweet|facebook.*pages|instagram.*business|linkedin.*create|youtube.*upload|upload.*video", "publishing", "action", "Send"),
    (r"send.*email|gmail.*send|slack.*post", "publishing", "action", "Send"),
    # External API
    (r"http.*request|api.*call|make.*an.*api.*call", "externalApi", "action", "Globe"),
    # Storage
    (r"create.*record|update.*record|delete.*record|spreadsheet|airtable|notion|database|sheets", "storage", "action", "Database"),
]


def _classify_node(node_type: str, node_name: str, params: dict[str, Any], source: str) -> dict[str, Any]:
    """Classify a single imported node into a semantic type and AIO mapping."""
    combined = f"{node_type} {node_name}".lower()
    params_str = json.dumps(params).lower() if params else ""
    full_text = f"{combined} {params_str}"

    classifiers = _N8N_CLASSIFIERS if source == "n8n" else _MAKE_CLASSIFIERS

    for pattern, semantic_type, aio_type, icon in classifiers:
        if re.search(pattern, full_text):
            return {
                "semanticType": semantic_type,
                "aioNodeType": aio_type,
                "iconName": icon,
                "mappingQuality": "direct" if semantic_type in ("trigger", "contentGeneration", "routing", "condition") else "approximated",
            }

    # Code/function nodes always need manual attention
    if "code" in full_text or "function" in full_text or "javascript" in full_text or "python" in full_text:
        return {
            "semanticType": "transformation",
            "aioNodeType": "action",
            "iconName": "Code",
            "mappingQuality": "approximated",
            "warning": "Code/function nodes require manual review and rewrite for AIO compatibility.",
        }

    # Credential-dependent nodes
    if any(kw in full_text for kw in ["oauth", "credential", "auth", "login", "token"]):
        return {
            "semanticType": "externalApi",
            "aioNodeType": "action",
            "iconName": "Globe",
            "mappingQuality": "approximated",
            "warning": "This node depends on external credentials that cannot be auto-migrated.",
        }

    return {
        "semanticType": "unknown",
        "aioNodeType": "action",
        "iconName": "Zap",
        "mappingQuality": "unknown",
        "warning": f"Node type '{node_type}' has no known AIO equivalent. Preserved as generic action.",
    }


def parse_external_template(source: str, template_json: dict[str, Any]) -> dict[str, Any]:
    """
    Parse n8n or Make workflow JSON into intermediate representation.
    Returns nodes list, edges list, and raw metadata.
    """
    nodes = []
    edges = []
    warnings = []

    if source == "n8n":
        raw_nodes = template_json.get("nodes", [])
        raw_connections = template_json.get("connections", {})

        for n in raw_nodes:
            node_id = str(n.get("id") or n.get("name") or f"node-{len(nodes)}")
            node_type = str(n.get("type") or "")
            node_name = str(n.get("name") or node_type)
            params = n.get("parameters") or {}
            position = n.get("position") or [len(nodes) * 300, 200]

            classification = _classify_node(node_type, node_name, params, "n8n")
            if classification.get("warning"):
                warnings.append(classification["warning"])

            nodes.append({
                "id": node_id,
                "originalType": node_type,
                "name": node_name,
                "parameters": params,
                "position": {"x": position[0], "y": position[1]},
                "classification": classification,
            })

        # Extract edges from connections
        for source_id, conn_data in raw_connections.items():
            if isinstance(conn_data, dict):
                for handle_type, targets in conn_data.items():
                    if isinstance(targets, list):
                        for target_list in targets:
                            if isinstance(target_list, list):
                                for t in target_list:
                                    if isinstance(t, dict) and t.get("node"):
                                        edges.append({
                                            "source": str(source_id),
                                            "target": str(t["node"]),
                                            "sourceHandle": handle_type,
                                            "targetHandle": t.get("type", "main"),
                                        })

    elif source == "make":
        raw_flow = template_json.get("flow", [])
        raw_metadata = template_json.get("metadata", {})

        # Make stores modules in a flat list with x/y positions
        for mod in raw_flow:
            node_id = str(mod.get("id") or f"module-{len(nodes)}")
            module_type = str(mod.get("module") or "")
            node_name = str(mod.get("name") or module_type)
            params = mod.get("mapper") or {}
            designer = mod.get("metadata", {}).get("designer", {})
            position = [designer.get("x", len(nodes) * 300), designer.get("y", 200)]

            classification = _classify_node(module_type, node_name, params, "make")
            if classification.get("warning"):
                warnings.append(classification["warning"])

            nodes.append({
                "id": node_id,
                "originalType": module_type,
                "name": node_name,
                "parameters": params,
                "position": {"x": position[0], "y": position[1]},
                "classification": classification,
            })

        # Make stores routes in metadata.designer.orphans or implicit sequential connections
        # Since Make JSON may not have explicit edges, infer from position ordering
        if len(nodes) > 1:
            for i in range(len(nodes) - 1):
                edges.append({
                    "source": nodes[i]["id"],
                    "target": nodes[i + 1]["id"],
                    "sourceHandle": "main",
                    "targetHandle": "main",
                })
            warnings.append("Make.com workflows do not expose explicit connections. Edges inferred from module order.")

    else:
        raise ValueError(f"Unsupported source: {source}. Must be 'n8n' or 'make'.")

    return {"nodes": nodes, "edges": edges, "warnings": warnings}


def normalize_to_aio_flow(parsed_data: dict[str, Any]) -> dict[str, Any]:
    """
    Convert parsed intermediate representation into AIO-native flow structure.
    Includes semantic classification, mapping quality, and upgrade metadata.
    """
    nodes = parsed_data.get("nodes", [])
    edges = parsed_data.get("edges", [])
    raw_warnings = parsed_data.get("warnings", [])

    aio_nodes = []
    aio_edges = []
    type_counts: dict[str, int] = {}
    direct_count = 0
    approximated_count = 0
    unknown_count = 0
    all_warnings = list(raw_warnings)

    for n in nodes:
        classification = n.get("classification", {})
        semantic_type = classification.get("semanticType", "unknown")
        aio_type = classification.get("aioNodeType", "action")
        icon = classification.get("iconName", "Zap")
        quality = classification.get("mappingQuality", "unknown")

        type_counts[semantic_type] = type_counts.get(semantic_type, 0) + 1
        if quality == "direct":
            direct_count += 1
        elif quality == "approximated":
            approximated_count += 1
        else:
            unknown_count += 1

        if classification.get("warning"):
            all_warnings.append(f"[{n.get('name', 'Unknown')}] {classification['warning']}")

        aio_nodes.append({
            "id": n["id"],
            "type": aio_type,
            "data": {
                "label": n.get("name", "Untitled Node"),
                "iconName": icon,
                "templateId": f"imported-{n.get('originalType', 'unknown')}",
                "config": n.get("parameters", {}),
                "originalType": n.get("originalType", ""),
                "semanticType": semantic_type,
                "mappingQuality": quality,
            },
            "position": n.get("position", {"x": 0, "y": 0}),
        })

    for e in edges:
        aio_edges.append({
            "id": f"e-{e['source']}-{e['target']}",
            "source": e["source"],
            "target": e["target"],
            "sourceHandle": e.get("sourceHandle", "main"),
            "targetHandle": e.get("targetHandle", "main"),
            "animated": True,
        })

    total = len(nodes)
    usability = "high" if unknown_count == 0 and approximated_count < total * 0.3 else (
        "partial" if unknown_count < total * 0.5 else "structural"
    )

    return {
        "flow": {
            "nodes": aio_nodes,
            "edges": aio_edges,
            "metadata": {
                "source": "external",
                "importedAt": datetime.now(timezone.utc).isoformat(),
                "warnings": all_warnings,
                "conversionSummary": {
                    "totalNodes": total,
                    "directMappings": direct_count,
                    "approximatedMappings": approximated_count,
                    "unknownMappings": unknown_count,
                    "semanticTypeCounts": type_counts,
                    "usabilityRating": usability,
                },
            },
        }
    }
