from __future__ import annotations

import copy
from typing import Any

from auth_store import AuthStore, default_auth_db_path


DEFAULT_ROUTING_CONFIG: dict[str, Any] = {
    "version": 1,
    "features": {},
    "tasks": {},
    "fallback": None,
}


PROVIDER_CAPABILITIES: dict[str, dict[str, Any]] = {
    "ollama": {
        "local": True,
        "hosted": False,
        "supports_chat": True,
        "supports_completion": True,
        "supports_model_listing": True,
        "supports_temperature": True,
        "requires_base_url": True,
        "requires_api_key": False,
    },
    "openai": {
        "local": False,
        "hosted": True,
        "supports_chat": True,
        "supports_completion": True,
        "supports_model_listing": True,
        "supports_temperature": True,
        "requires_base_url": True,
        "requires_api_key": True,
    },
    "openrouter": {
        "local": False,
        "hosted": True,
        "supports_chat": True,
        "supports_completion": True,
        "supports_model_listing": True,
        "supports_temperature": True,
        "requires_base_url": True,
        "requires_api_key": True,
    },
    "anthropic": {
        "local": False,
        "hosted": True,
        "supports_chat": True,
        "supports_completion": True,
        "supports_model_listing": False,
        "supports_temperature": True,
        "requires_base_url": True,
        "requires_api_key": True,
    },
    "google-ai": {
        "local": False,
        "hosted": True,
        "supports_chat": True,
        "supports_completion": True,
        "supports_model_listing": True,
        "supports_temperature": True,
        "requires_base_url": True,
        "requires_api_key": True,
    },
    "perplexity": {
        "local": False,
        "hosted": True,
        "supports_chat": True,
        "supports_completion": True,
        "supports_model_listing": False,
        "supports_temperature": True,
        "requires_base_url": True,
        "requires_api_key": True,
    },
}


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _normalize_route_target(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        return {"provider_key": _clean(value)}
    if isinstance(value, dict):
        normalized = dict(value)
        provider_key = _clean(normalized.get("provider_key") or normalized.get("provider"))
        normalized["provider_key"] = provider_key
        return normalized
    return {}


def _normalize_routing_config(payload: dict[str, Any] | None) -> dict[str, Any]:
    base = copy.deepcopy(DEFAULT_ROUTING_CONFIG)
    if not payload:
        return base
    base["features"] = payload.get("features") or {}
    base["tasks"] = payload.get("tasks") or {}
    base["fallback"] = payload.get("fallback")
    version = payload.get("version")
    if isinstance(version, int):
        base["version"] = version
    return base


def _provider_capabilities(provider_key: str) -> dict[str, Any]:
    return PROVIDER_CAPABILITIES.get(provider_key, {
        "local": False,
        "hosted": True,
        "supports_chat": True,
        "supports_completion": True,
        "supports_model_listing": False,
        "supports_temperature": True,
        "requires_base_url": True,
        "requires_api_key": False,
    })


def _validate_provider_route(
    provider_config: dict[str, Any] | None,
    *,
    capabilities: dict[str, Any],
    route_label: str,
    route_hints: dict[str, Any] | None = None,
) -> None:
    if not provider_config:
        raise ValueError(f"{route_label} provider config not found.")

    if not provider_config.get("enabled"):
        raise ValueError(f"{route_label} provider is disabled.")

    provider_key = _clean(provider_config.get("provider_key"))
    if not provider_key:
        raise ValueError(f"{route_label} provider key is missing.")

    config = provider_config.get("config") or {}
    base_url = _clean(provider_config.get("base_url") or config.get("base_url"))
    api_key = _clean(provider_config.get("api_key"))
    api_key_present = bool(provider_config.get("api_key_present")) or bool(api_key)

    if capabilities.get("requires_base_url") and not base_url:
        raise ValueError(f"{route_label} provider '{provider_key}' missing base URL.")

    if capabilities.get("requires_api_key") and not api_key_present:
        raise ValueError(f"{route_label} provider '{provider_key}' missing API key.")

    hints = route_hints or {}
    if hints.get("local_only") and not capabilities.get("local"):
        raise ValueError(f"{route_label} requires a local provider, but '{provider_key}' is hosted.")


def validate_ai_routing_config(
    config: dict[str, Any] | None,
    provider_configs: list[dict[str, Any]],
) -> dict[str, Any]:
    normalized = _normalize_routing_config(config)
    features = normalized.get("features") or {}
    tasks = normalized.get("tasks") or {}
    fallback = normalized.get("fallback")

    if not isinstance(features, dict):
        raise ValueError("Routing config features must be a mapping.")
    if not isinstance(tasks, dict):
        raise ValueError("Routing config tasks must be a mapping.")
    if fallback is not None and not isinstance(fallback, dict):
        raise ValueError("Routing config fallback must be an object or null.")

    provider_map = {cfg.get("provider_key"): cfg for cfg in provider_configs}

    for feature_key, target in features.items():
        normalized_target = _normalize_route_target(target)
        provider_key = normalized_target.get("provider_key")
        if not provider_key:
            raise ValueError(f"Feature route '{feature_key}' missing provider_key.")
        provider_config = provider_map.get(provider_key)
        capabilities = _provider_capabilities(provider_key)
        _validate_provider_route(provider_config, capabilities=capabilities, route_label=f"Feature '{feature_key}'")

    for task_key, target in tasks.items():
        normalized_target = _normalize_route_target(target)
        provider_key = normalized_target.get("provider_key")
        if not provider_key:
            raise ValueError(f"Task route '{task_key}' missing provider_key.")
        provider_config = provider_map.get(provider_key)
        capabilities = _provider_capabilities(provider_key)
        _validate_provider_route(provider_config, capabilities=capabilities, route_label=f"Task '{task_key}'")

    if fallback:
        normalized_target = _normalize_route_target(fallback)
        provider_key = normalized_target.get("provider_key")
        if not provider_key:
            raise ValueError("Fallback route missing provider_key.")
        provider_config = provider_map.get(provider_key)
        capabilities = _provider_capabilities(provider_key)
        _validate_provider_route(provider_config, capabilities=capabilities, route_label="Fallback")

    return normalized


def _apply_route_overrides(provider_config: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    effective = copy.deepcopy(provider_config)
    if "model" in target and _clean(target.get("model")):
        effective["model"] = _clean(target.get("model"))

    config = dict(effective.get("config") or {})
    if "temperature" in target and target.get("temperature") is not None:
        config["temperature"] = target.get("temperature")
    if _clean(target.get("system_guardrails")):
        config["system_guardrails"] = target.get("system_guardrails")
    if _clean(target.get("task_guardrails")):
        config["task_guardrails"] = target.get("task_guardrails")
    effective["config"] = config
    return effective


def resolve_ai_route(
    *,
    tenant_id: str,
    feature: str | None,
    task: str | None = None,
    provider_override: dict[str, Any] | str | None = None,
    route_hints: dict[str, Any] | None = None,
    auth_store: AuthStore | None = None,
) -> dict[str, Any]:
    if not tenant_id:
        raise ValueError("Tenant ID is required to resolve AI routing.")

    store = auth_store or AuthStore(default_auth_db_path())
    provider_configs = store.list_ai_provider_configs_for_tenant(tenant_id)
    provider_map = {cfg.get("provider_key"): cfg for cfg in provider_configs}
    default_provider = store.get_default_ai_provider_config_for_tenant(tenant_id)
    routing_config = _normalize_routing_config(store.get_ai_routing_config_for_tenant(tenant_id))

    resolved_feature = _clean(feature).lower() or None
    resolved_task = _clean(task).lower() or None

    route_source = None
    reason = None
    route_target = None

    if provider_override:
        route_target = _normalize_route_target(provider_override)
        route_source = "task override"
        reason = "Explicit provider override requested."
    elif resolved_task and resolved_task in (routing_config.get("tasks") or {}):
        route_target = _normalize_route_target(routing_config["tasks"][resolved_task])
        route_source = "task override"
        reason = f"Task override configured for '{resolved_task}'."
    elif resolved_feature and resolved_feature in (routing_config.get("features") or {}):
        route_target = _normalize_route_target(routing_config["features"][resolved_feature])
        route_source = "feature override"
        reason = f"Feature override configured for '{resolved_feature}'."
    elif default_provider:
        route_target = {"provider_key": default_provider.get("provider_key"), "model": default_provider.get("model")}
        route_source = "workspace default"
        reason = "Workspace default provider selected."
    elif routing_config.get("fallback"):
        route_target = _normalize_route_target(routing_config.get("fallback"))
        route_source = "fallback"
        reason = "Fallback provider selected."
    else:
        raise ValueError("No AI provider route could be resolved for this request.")

    provider_key = _clean((route_target or {}).get("provider_key"))
    if not provider_key:
        raise ValueError("Resolved AI route missing provider_key.")

    provider_config = provider_map.get(provider_key)
    if provider_config and provider_config.get("id"):
        provider_config = store.get_ai_provider_config_for_tenant(tenant_id, provider_config["id"]) or provider_config
    capabilities = _provider_capabilities(provider_key)
    _validate_provider_route(
        provider_config,
        capabilities=capabilities,
        route_label=f"Route '{route_source}'",
        route_hints=route_hints,
    )

    effective_provider = _apply_route_overrides(provider_config, route_target or {})
    effective_provider["_route_source"] = route_source
    config = effective_provider.get("config") or {}
    system_guardrails = (config.get("system_guardrails") or "").strip()
    task_guardrails = (config.get("task_guardrails") or "").strip()
    temperature = config.get("temperature") if capabilities.get("supports_temperature") else None

    return {
        "provider_id": effective_provider.get("id"),
        "provider_key": provider_key,
        "provider_type": provider_key,
        "provider_label": effective_provider.get("label"),
        "model": effective_provider.get("model"),
        "route_source": route_source,
        "reason": reason,
        "feature": resolved_feature,
        "task": resolved_task,
        "route_hints": route_hints or {},
        "effective_guardrails": {
            "system": system_guardrails,
            "task": task_guardrails,
        },
        "effective_temperature": temperature,
        "provider_capabilities": capabilities,
        "provider_config": effective_provider,
    }


def log_ai_route(route: dict[str, Any]) -> None:
    if not route:
        return
    provider_key = route.get("provider_key")
    model = route.get("model") or "default"
    feature = route.get("feature") or "unspecified"
    task = route.get("task") or "unspecified"
    source = route.get("route_source")
    reason = route.get("reason")
    print(f"[AIRoute] feature={feature} task={task} provider={provider_key} model={model} source={source} reason={reason}")
