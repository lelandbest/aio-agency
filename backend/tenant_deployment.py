from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

try:
    from backend.canonical_settings import (
        DEFAULT_SYSTEM_SETTINGS,
        DEFAULT_TENANT_SETTINGS,
        DEFAULT_USER_SETTINGS,
        FIELD_POLICIES,
        import_tenant_blueprint,
        merge_with_defaults,
        normalize_tenant_settings_payload,
        validate_against_schema,
    )
except ModuleNotFoundError:
    from canonical_settings import (
        DEFAULT_SYSTEM_SETTINGS,
        DEFAULT_TENANT_SETTINGS,
        DEFAULT_USER_SETTINGS,
        FIELD_POLICIES,
        import_tenant_blueprint,
        merge_with_defaults,
        normalize_tenant_settings_payload,
        validate_against_schema,
    )


class DeploymentFailureError(ValueError):
    def __init__(self, message: str, *, code: str = "deployment_failed", detail: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.payload = {
            "code": code,
            "message": message,
            "detail": detail or {},
        }


BLUEPRINTS_DIR = Path(__file__).with_name("blueprints")
DEPLOYMENT_SECTION_ORDER = [
    "branding",
    "navigation",
    "globalVariables",
    "comms",
    "calendar",
    "automation",
    "visibility",
    "internal",
]


def _deepcopy(value: Any) -> Any:
    return copy.deepcopy(value)


def _blueprint_files() -> list[Path]:
    if not BLUEPRINTS_DIR.exists():
        return []
    return sorted(
        [
            path
            for pattern in ("*.blueprint.json", "*.json")
            for path in BLUEPRINTS_DIR.glob(pattern)
            if path.is_file()
        ],
        key=lambda path: path.name.lower(),
    )


def _safe_registry_entry(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    valid, errors = validate_against_schema("tenant-blueprint", raw)
    if not valid:
        raise DeploymentFailureError(
            f"Blueprint '{path.name}' is invalid.",
            code="invalid_blueprint_registry_entry",
            detail={"path": str(path), "errors": errors},
        )
    blueprint_id = str(raw.get("blueprintId") or path.stem.replace(".blueprint", "")).strip()
    if not blueprint_id:
        raise DeploymentFailureError(
            f"Blueprint '{path.name}' is missing blueprintId.",
            code="invalid_blueprint_registry_entry",
            detail={"path": str(path)},
        )
    return {
        "id": blueprint_id,
        "name": str(raw.get("name") or blueprint_id).strip() or blueprint_id,
        "version": raw.get("version") or raw.get("blueprintVersion"),
        "description": str(raw.get("description") or "").strip(),
        "source": "filesystem",
        "path": str(path),
        "blueprint": raw,
    }


def list_blueprint_registry() -> list[dict[str, Any]]:
    registry: dict[str, dict[str, Any]] = {}
    for path in _blueprint_files():
        entry = _safe_registry_entry(path)
        registry[entry["id"]] = entry
    return [registry[key] for key in sorted(registry.keys())]


def get_registry_blueprint(blueprint_id: str) -> dict[str, Any]:
    normalized_id = (blueprint_id or "").strip()
    if not normalized_id:
        raise DeploymentFailureError("blueprintId is required.", code="missing_blueprint_id")
    for entry in list_blueprint_registry():
        if entry["id"] == normalized_id:
            return entry
    raise DeploymentFailureError(
        f"Unknown blueprintId '{normalized_id}'.",
        code="unknown_blueprint_id",
        detail={"blueprintId": normalized_id},
    )


def resolve_blueprint_source(*, blueprint_id: str | None = None, blueprint_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    has_id = bool((blueprint_id or "").strip())
    has_payload = isinstance(blueprint_payload, dict) and bool(blueprint_payload)
    if has_id == has_payload:
        raise DeploymentFailureError(
            "Provide exactly one of blueprintId or blueprintPayload.",
            code="invalid_blueprint_source",
        )
    if has_id:
        return get_registry_blueprint(blueprint_id)["blueprint"]
    blueprint = dict(blueprint_payload or {})
    valid, errors = validate_against_schema("tenant-blueprint", blueprint)
    if not valid:
        raise DeploymentFailureError(
            "Invalid tenant blueprint payload.",
            code="invalid_blueprint_payload",
            detail={"errors": errors},
        )
    return blueprint


def _normalized_overrides(overrides: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(overrides, dict):
        return {}
    return normalize_tenant_settings_payload({"tenantSettings": overrides}, include_defaults=False)


def _validate_variable_blueprints(variables: dict[str, Any]) -> None:
    for key, value in variables.items():
        if not isinstance(value, dict):
            raise DeploymentFailureError(
                f"Variable '{key}' must be an object.",
                code="invalid_blueprint_variables",
                detail={"variable": key},
            )
        if value.get("value") is None:
            raise DeploymentFailureError(
                f"Variable '{key}' is missing value.",
                code="invalid_blueprint_variables",
                detail={"variable": key},
            )


def _flow_blueprints(payload: dict[str, Any]) -> list[dict[str, Any]]:
    flows = payload.get("flows")
    if flows is None:
        return []
    if not isinstance(flows, list):
        raise DeploymentFailureError(
            "Blueprint flows must be an array when provided.",
            code="invalid_blueprint_flows",
        )
    normalized: list[dict[str, Any]] = []
    for index, flow in enumerate(flows):
        if not isinstance(flow, dict):
            raise DeploymentFailureError(
                f"Blueprint flow at index {index} must be an object.",
                code="invalid_blueprint_flows",
                detail={"index": index},
            )
        nodes = flow.get("nodes")
        edges = flow.get("edges")
        if not isinstance(nodes, list) or not isinstance(edges, list):
            raise DeploymentFailureError(
                f"Blueprint flow at index {index} must include nodes and edges arrays.",
                code="invalid_blueprint_flows",
                detail={"index": index},
            )
        if not any(str(node.get("type") or "").lower() == "trigger" for node in nodes if isinstance(node, dict)):
            raise DeploymentFailureError(
                f"Blueprint flow at index {index} must include at least one trigger node.",
                code="invalid_blueprint_flows",
                detail={"index": index},
            )
        normalized.append(_deepcopy(flow))
    return normalized


def build_deployment_plan(
    *,
    blueprint_id: str | None = None,
    blueprint_payload: dict[str, Any] | None = None,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    blueprint = resolve_blueprint_source(blueprint_id=blueprint_id, blueprint_payload=blueprint_payload)
    blueprint_settings = import_tenant_blueprint(blueprint)
    override_settings = _normalized_overrides(overrides)
    final_settings = normalize_tenant_settings_payload({"tenantSettings": {}}, include_defaults=True)

    variables = blueprint_settings.get("globalVariables") if isinstance(blueprint_settings.get("globalVariables"), dict) else {}
    _validate_variable_blueprints(variables)

    # Blueprint is the source of initial tenant state during deployment.
    # After deployment, canonical tenantSettings becomes the runtime authority.
    for section in DEPLOYMENT_SECTION_ORDER:
        base_section = _deepcopy(blueprint_settings.get(section, DEFAULT_TENANT_SETTINGS.get(section)))
        override_section = override_settings.get(section)
        final_settings[section] = merge_with_defaults(base_section, override_section) if override_section is not None else base_section

    _validate_variable_blueprints(final_settings.get("globalVariables") if isinstance(final_settings.get("globalVariables"), dict) else {})

    internal = final_settings.get("internal") if isinstance(final_settings.get("internal"), dict) else {}
    if blueprint.get("blueprintId") and not internal.get("blueprintId"):
        internal["blueprintId"] = blueprint["blueprintId"]
    final_settings["internal"] = internal

    valid, errors = validate_against_schema(
        "tenant-settings",
        {
            "system": DEFAULT_SYSTEM_SETTINGS,
            "tenant": final_settings,
            "user": DEFAULT_USER_SETTINGS,
            "fieldPolicies": FIELD_POLICIES,
        },
    )
    if not valid:
        raise DeploymentFailureError(
            "Invalid deployment settings payload.",
            code="invalid_deployment_plan",
            detail={"errors": errors},
        )

    flows = _flow_blueprints(blueprint)
    return {
        "blueprintId": blueprint.get("blueprintId"),
        "blueprintName": blueprint.get("name") or blueprint.get("blueprintId"),
        "blueprintVersion": blueprint.get("version") or blueprint.get("blueprintVersion"),
        "blueprintSource": blueprint.get("source") or "filesystem" if blueprint_id else blueprint.get("source") or "payload",
        "blueprint": blueprint,
        "tenantSettings": final_settings,
        "flows": flows,
        "expected": {
            "globalVariables": len(final_settings.get("globalVariables") or {}),
            "systemEmailTemplates": len(((final_settings.get("comms") or {}).get("systemEmailTemplates") or {})),
            "flows": len(flows),
        },
    }
