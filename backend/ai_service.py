from __future__ import annotations

import json
import base64
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest
from dataclasses import dataclass
from typing import Any

# Lazy import to avoid circular dependency
_auth_store = None

def _get_auth_store():
    global _auth_store
    if _auth_store is None:
        from auth_store import AuthStore, default_auth_db_path
        _auth_store = AuthStore(default_auth_db_path())
    return _auth_store

def get_configured_ollama_url(tenant_id: str | None) -> str:
    """Get the configured Ollama base URL for a tenant.
    
    Returns the saved base_url from the default Ollama provider config.
    Raises ValueError if no Ollama provider is configured.
    """
    if not tenant_id:
        raise ValueError("No tenant ID provided. Configure an Ollama provider first.")
    
    auth_store = _get_auth_store()
    provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant_id)
    
    if not provider_config:
        raise ValueError("No AI provider configured. Please configure an Ollama provider in Settings.")
    
    if provider_config.get("provider_key") != "ollama":
        raise ValueError(f"Default provider is not Ollama (found: {provider_config.get('provider_key')}).")
    
    base_url = provider_config.get("base_url") or provider_config.get("config", {}).get("base_url")
    
    if not base_url:
        raise ValueError("Ollama provider has no base URL configured. Please set the Ollama server URL.")
    
    print(f"[OllamaConfig] Resolved URL from config: {base_url}")
    return base_url.rstrip("/")


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _title(value: Any) -> str:
    return " ".join(part.capitalize() for part in _clean(value).replace("_", " ").replace("-", " ").split())


def _slug_username(value: Any) -> str:
    raw = _clean(value).lower()
    normalized = "".join(char if char.isalnum() else "." for char in raw)
    compact = ".".join(part for part in normalized.split(".") if part)
    return compact[:40] or "user"


def _email_local(email: str) -> str:
    return _clean(email).split("@")[0]


def _email_domain(email: str) -> str:
    return _clean(email).split("@")[-1]


def _company_from_email(email: str) -> str:
    domain = _email_domain(email)
    if not domain or "." not in domain:
        return ""
    core = domain.split(".")[0]
    for noise in ("mail", "smtp", "inbox", "team", "hello", "contact", "support", "info"):
        core = core.replace(noise, "")
    return _title(core)


def _json_text(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2)


def _provider_base_url(value: Any, fallback: str) -> str:
    raw = _clean(value) or fallback
    return raw.rstrip("/")


def _ollama_auth_headers(api_key: Any = None, username: Any = None, password: Any = None) -> dict[str, str]:
    headers: dict[str, str] = {}
    if _clean(api_key):
        headers["Authorization"] = f"Bearer {_clean(api_key)}"
        return headers
    if _clean(username) or _clean(password):
        token = base64.b64encode(f"{_clean(username)}:{_clean(password)}".encode("utf-8")).decode("ascii")
        headers["Authorization"] = f"Basic {token}"
    return headers


def _describe_connectivity_error(url: str, error: Exception) -> str:
    if isinstance(error, urlerror.HTTPError):
        detail = error.read().decode("utf-8", errors="ignore")
        return f"HTTP {error.code} from {url}: {detail}"
    if isinstance(error, TimeoutError):
        return f"Unable to reach {url}: timed out"
    if isinstance(error, urlerror.URLError):
        reason = getattr(error, "reason", error)
        if isinstance(reason, TimeoutError):
            return f"Unable to reach {url}: timed out"
        return f"Unable to reach {url}: {reason}"
    if isinstance(error, OSError):
        return f"Unable to reach {url}: {error}"
    return f"Unable to reach {url}: {error}"


def get_ai_provider_catalog() -> list[dict[str, Any]]:
    return [
        {
            "key": "ollama",
            "label": "Ollama",
            "description": "Local or networked Ollama runtime for private workspace AI.",
            "default_model": "",
            "fields": [
                {"key": "base_url", "label": "Base URL"},
                {"key": "api_key", "label": "API Key", "type": "password"},
                {"key": "username", "label": "Username"},
                {"key": "password", "label": "Password", "type": "password"},
                {"key": "model", "label": "Model"},
                {"key": "temperature", "label": "Temperature"},
                {"key": "system_guardrails", "label": "System Guardrails", "type": "textarea"},
                {"key": "task_guardrails", "label": "Task Guardrails", "type": "textarea"},
            ],
        },
        {
            "key": "openai",
            "label": "OpenAI",
            "description": "External OpenAI models for shared AI tasks.",
            "default_base_url": "https://api.openai.com",
            "default_model": "gpt-4.1-mini",
            "fields": [
                {"key": "api_key", "label": "API Key"},
                {"key": "base_url", "label": "Base URL"},
                {"key": "model", "label": "Model"},
                {"key": "system_guardrails", "label": "System Guardrails", "type": "textarea"},
                {"key": "task_guardrails", "label": "Task Guardrails", "type": "textarea"},
            ],
        },
        {
            "key": "openrouter",
            "label": "OpenRouter",
            "description": "Route shared AI traffic through OpenRouter-managed models.",
            "default_base_url": "https://openrouter.ai/api",
            "default_model": "openai/gpt-4.1-mini",
            "fields": [
                {"key": "api_key", "label": "API Key"},
                {"key": "base_url", "label": "Base URL"},
                {"key": "model", "label": "Model"},
                {"key": "site_url", "label": "Site URL"},
                {"key": "app_name", "label": "App Name"},
                {"key": "system_guardrails", "label": "System Guardrails", "type": "textarea"},
                {"key": "task_guardrails", "label": "Task Guardrails", "type": "textarea"},
            ],
        },
        {
            "key": "anthropic",
            "label": "Anthropic",
            "description": "Claude models through Anthropic's API.",
            "default_base_url": "https://api.anthropic.com",
            "default_model": "claude-sonnet-4-20250514",
            "fields": [
                {"key": "api_key", "label": "API Key"},
                {"key": "base_url", "label": "Base URL"},
                {"key": "model", "label": "Model"},
                {"key": "system_guardrails", "label": "System Guardrails", "type": "textarea"},
                {"key": "task_guardrails", "label": "Task Guardrails", "type": "textarea"},
            ],
        },
        {
            "key": "google-ai",
            "label": "Google AI",
            "description": "Gemini models via Google AI Studio.",
            "default_base_url": "https://generativelanguage.googleapis.com",
            "default_model": "gemini-2.5-flash",
            "fields": [
                {"key": "api_key", "label": "API Key"},
                {"key": "base_url", "label": "Base URL"},
                {"key": "model", "label": "Model"},
                {"key": "system_guardrails", "label": "System Guardrails", "type": "textarea"},
                {"key": "task_guardrails", "label": "Task Guardrails", "type": "textarea"},
            ],
        },
        {
            "key": "perplexity",
            "label": "Perplexity",
            "description": "Perplexity chat models for research-forward drafting and answers.",
            "default_base_url": "https://api.perplexity.ai",
            "default_model": "sonar",
            "fields": [
                {"key": "api_key", "label": "API Key"},
                {"key": "base_url", "label": "Base URL"},
                {"key": "model", "label": "Model"},
                {"key": "system_guardrails", "label": "System Guardrails", "type": "textarea"},
                {"key": "task_guardrails", "label": "Task Guardrails", "type": "textarea"},
            ],
        },
    ]


def list_ollama_models(base_url: str | None = None, api_key: str | None = None, username: str | None = None, password: str | None = None, tenant_id: str | None = None) -> list[str]:
    """List available Ollama models.
    
    Args:
        base_url: Optional Ollama server URL (for manual testing)
        api_key: Optional API key
        username: Optional username for auth
        password: Optional password for auth
        tenant_id: Optional tenant ID to resolve configured provider URL
    """
    # If explicit base_url provided, use it; otherwise resolve from config
    if base_url:
        resolved_base_url = _provider_base_url(base_url, "")
        print(f"[OllamaConfig] Using explicit base_url: {resolved_base_url}")
    else:
        resolved_base_url = get_configured_ollama_url(tenant_id)
        print(f"[OllamaConfig] Using configured base_url: {resolved_base_url}")
    
    request = urlrequest.Request(
        f"{resolved_base_url}/api/tags",
        headers=_ollama_auth_headers(api_key, username, password),
        method="GET",
    )
    try:
        response = urlrequest.urlopen(request, timeout=15)
        payload = json.loads(response.read().decode("utf-8"))
    except (urlerror.HTTPError, urlerror.URLError, TimeoutError, OSError) as exc:
        raise ValueError(_describe_connectivity_error(f"{resolved_base_url}/api/tags", exc)) from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Ollama at {resolved_base_url} returned an unreadable model list.") from exc

    models = payload.get("models") or []
    names = []
    for model in models:
        name = _clean(model.get("name"))
        if name:
            names.append(name)
    return names


def _infer_name_parts(context: dict[str, Any]) -> tuple[str, str]:
    first_name = _clean(context.get("firstName") or context.get("first_name"))
    last_name = _clean(context.get("lastName") or context.get("last_name"))
    if first_name or last_name:
        return first_name, last_name

    email = _clean(context.get("email"))
    local = _email_local(email)
    if not local:
        return "", ""

    parts = [part for part in local.replace(".", " ").replace("_", " ").replace("-", " ").split() if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return _title(parts[0]), ""
    return _title(parts[0]), _title(" ".join(parts[1:]))


@dataclass
class AssistResult:
    suggestion: str
    alternatives: list[str]
    rationale: str
    prompt: str
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "suggestion": self.suggestion,
            "alternatives": self.alternatives,
            "rationale": self.rationale,
            "prompt": self.prompt,
            "metadata": self.metadata or {},
        }


class AIAssistService:
    def assist(
        self,
        *,
        module: str,
        surface: str,
        field: str,
        intent: str = "draft",
        current_value: str = "",
        context: dict[str, Any] | None = None,
        actor: dict[str, Any] | None = None,
        tenant: dict[str, Any] | None = None,
        provider_config: dict[str, Any] | None = None,
    ) -> AssistResult:
        resolved_module = _clean(module).lower() or "general"
        resolved_surface = _clean(surface).lower() or "general"
        resolved_field = _clean(field) or "general"
        resolved_intent = _clean(intent).lower() or "draft"
        resolved_context = context or {}

        prompt = (
            f"Module: {resolved_module}. Surface: {resolved_surface}. Field: {resolved_field}. "
            f"Intent: {resolved_intent}. Actor: {_clean((actor or {}).get('name') or (actor or {}).get('email')) or 'operator'}. "
            f"Workspace: {_clean((tenant or {}).get('name')) or 'active workspace'}."
        )

        if resolved_module == "crm":
            result = self._assist_crm(resolved_surface, resolved_field, current_value, resolved_context)
        elif resolved_module == "forms":
            result = self._assist_forms(resolved_surface, resolved_field, current_value, resolved_context)
        elif resolved_module == "calendar":
            result = self._assist_calendar(resolved_surface, resolved_field, current_value, resolved_context)
        elif resolved_module == "flows":
            result = self._assist_flows(resolved_surface, resolved_field, current_value, resolved_context)
        elif resolved_module == "comms":
            result = self._assist_comms(resolved_surface, resolved_field, current_value, resolved_context)
        elif resolved_module == "brain":
            result = self._assist_brain(resolved_surface, resolved_field, current_value, resolved_context)
        elif resolved_module == "pipeline":
            result = self._assist_pipeline(resolved_surface, resolved_field, current_value, resolved_context)
        elif resolved_module == "dashboard":
            result = self._assist_dashboard(resolved_surface, resolved_field, current_value, resolved_context)
        elif resolved_module == "orders":
            result = self._assist_orders(resolved_surface, resolved_field, current_value, resolved_context)
        elif resolved_module == "help":
            result = self._assist_help(resolved_surface, resolved_field, current_value, resolved_context)
        else:
            result = self._generic_result(resolved_field, current_value, resolved_context)

        provider_result = self._assist_with_provider(
            provider_config=provider_config,
            module=resolved_module,
            surface=resolved_surface,
            field=resolved_field,
            intent=resolved_intent,
            current_value=current_value,
            context=resolved_context,
            actor=actor or {},
            tenant=tenant or {},
            fallback=result,
        )
        if provider_result:
            result = provider_result

        result.prompt = prompt
        return result

    def generate_report(
        self,
        *,
        prompt: str,
        context: dict[str, Any] | None = None,
        actor: dict[str, Any] | None = None,
        tenant: dict[str, Any] | None = None,
        provider_config: dict[str, Any] | None = None,
    ) -> str:
        """Generate a long-form report using the configured AI provider.
        
        This is a direct generation method, not field assistance.
        Raises exceptions on failure.
        
        Prompt composition order:
        1. Base system instructions
        2. Provider system_guardrails (if set)
        3. Task prompt
        4. Provider task_guardrails (if set)
        5. Context data
        """
        if not provider_config:
            raise Exception("No AI provider configured")
        
        # Extract guardrails from provider config
        config = provider_config.get("config") or {}
        system_guardrails = (config.get("system_guardrails") or "").strip()
        task_guardrails = (config.get("task_guardrails") or "").strip()
        
        # Base system prompt
        system_prompt_parts = [
            "You are an expert AI analyst for AIO CRM.",
            "Generate detailed, actionable reports in clean markdown format.",
            "Do not wrap output in JSON or code blocks.",
        ]
        
        # Add provider system guardrails if set
        if system_guardrails:
            system_prompt_parts.append(f"\n\nAdditional instructions:\n{system_guardrails}")
        
        system_prompt = "\n\n".join(system_prompt_parts)
        
        actor_name = _clean((actor or {}).get("name") or (actor or {}).get("email")) or "operator"
        workspace_name = _clean((tenant or {}).get("name")) or "active workspace"
        
        # Build full prompt with task guardrails appended
        full_prompt = f"{prompt}\n\nGenerated by {actor_name} in workspace: {workspace_name}"
        
        # Append task guardrails if set
        if task_guardrails:
            full_prompt = f"{full_prompt}\n\nTask guidance:\n{task_guardrails}"
        
        print(f"[AIProviderResolve] Guardrails - system: {'set' if system_guardrails else 'empty'}, task: {'set' if task_guardrails else 'empty'}")
        
        result = self._provider_complete(
            provider_config=provider_config,
            prompt=full_prompt,
            system_prompt=system_prompt,
        )
        
        if not result:
            raise Exception("Empty AI response from provider")
        
        if result.get("suggestion"):
            return result["suggestion"]
        raise Exception("AI response missing suggestion field")

    def test_provider(self, provider_config: dict[str, Any]) -> dict[str, Any]:
        provider_key = _clean(provider_config.get("provider_key")).lower()
        label = _clean(provider_config.get("label")) or provider_key
        if provider_key == "ollama":
            return self._test_ollama_provider(provider_config, label)
        sample_result = self._provider_complete(
            provider_config,
            "Return strict JSON with keys suggestion, alternatives, rationale, metadata. suggestion must be 'AI provider connected'.",
            system_prompt="You are verifying provider connectivity for AIO CRM. Return compact JSON only.",
        )
        if not sample_result:
            raise ValueError(f"{label} did not return a usable response.")
        return {
            "status": "ok",
            "message": f"{label} responded successfully.",
            "identity": provider_config.get("model") or provider_key,
            "sample": sample_result.get("suggestion") or "AI provider connected",
        }

    def _test_ollama_provider(self, provider_config: dict[str, Any], label: str) -> dict[str, Any]:
        config = provider_config.get("config") or {}
        model = _clean(provider_config.get("model"))
        if not model:
            raise ValueError("Select an Ollama model before testing.")
        
        # Use configured base_url, not localhost fallback
        base_url = _provider_base_url(provider_config.get("base_url"), "")
        if not base_url:
            raise ValueError("Ollama base URL not configured. Please set the Ollama server URL in provider settings.")
        
        print(f"[OllamaConfig] Testing provider at: {base_url}")
        
        response = self._post_json(
            f"{base_url}/api/generate",
            {
                "model": model,
                "prompt": "Reply with the exact words: AI provider connected",
                "stream": False,
                "options": {"temperature": float(config.get("temperature") or 0.2)},
            },
            headers=_ollama_auth_headers(
                provider_config.get("api_key"),
                config.get("username"),
                config.get("password"),
            ),
        )
        sample = _clean(response.get("response"))
        if not sample:
            raise ValueError(f"{label} did not return a usable response.")
        return {
            "status": "ok",
            "message": f"{label} responded successfully.",
            "identity": model,
            "sample": sample,
        }

    def _assist_crm(self, surface: str, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        normalized_field = field.lower()
        if surface == "contact-create":
            return self._assist_contact_create(normalized_field, current_value, context)
        if surface == "user-create":
            return self._assist_user_create(normalized_field, current_value, context)
        if surface == "bulk-action":
            return self._assist_bulk_action(normalized_field, current_value, context)
        return self._generic_result(field, current_value, context)

    def _assist_contact_create(self, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        first_name, last_name = _infer_name_parts(context)
        email = _clean(context.get("email"))
        company = _clean(context.get("company")) or _company_from_email(email)
        website = _clean(context.get("website"))
        department = _clean(context.get("department"))
        city = _clean(context.get("city"))
        state = _clean(context.get("state"))

        if field == "firstname":
            suggestion = first_name or "Jordan"
            return AssistResult(suggestion, [suggestion, "Taylor"], "Inferred from the current email and CRM context.", "")
        if field == "lastname":
            suggestion = last_name or "Brooks"
            return AssistResult(suggestion, [suggestion, "Stone"], "Inferred from the current email and CRM context.", "")
        if field == "company":
            suggestion = company or "North Ridge Studio"
            alternatives = [suggestion, "Evergreen Advisory", "Summit Growth Lab"]
            return AssistResult(suggestion, alternatives, "Built from the domain, company field, and relationship context.", "")
        if field == "title":
            base = department or "Growth"
            suggestion = {
                "sales": "Sales Director",
                "marketing": "Growth Lead",
                "support": "Client Success Manager",
                "engineering": "Technical Lead",
            }.get(base.lower(), "Operations Lead")
            return AssistResult(suggestion, [suggestion, "Founder", "Marketing Director"], "Shaped to match the likely CRM role for this contact.", "")
        if field == "department":
            suggestion = department or ("Marketing" if "growth" in _clean(current_value).lower() else "Sales")
            return AssistResult(suggestion, [suggestion, "Operations", "Support"], "Matched to the contact's title and current intake context.", "")
        if field == "website":
            if website:
                suggestion = website
            elif email and "." in _email_domain(email):
                suggestion = f"https://{_email_domain(email)}"
            elif company:
                suggestion = f"https://{_slug_username(company).replace('.', '')}.com"
            else:
                suggestion = "https://example.com"
            return AssistResult(suggestion, [suggestion], "Derived from email domain and company naming.", "")
        if field == "street":
            suggestion = current_value or "1200 Meridian Ave"
            return AssistResult(suggestion, [suggestion, "450 Harbor Drive"], "Provides a structured mailing address starter.", "")
        if field == "city":
            suggestion = city or "Austin"
            return AssistResult(suggestion, [suggestion, "Nashville", "Miami"], "Offers a plausible city value for quick completion.", "")
        if field == "state":
            suggestion = state or "Texas"
            return AssistResult(suggestion, [suggestion, "Florida", "Michigan"], "Keeps state naming human-readable for CRM entry.", "")
        return self._generic_result(field, current_value, context)

    def _assist_user_create(self, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        first_name, last_name = _infer_name_parts(context)
        email = _clean(context.get("email"))
        company = _clean(context.get("company"))
        full_name = " ".join(part for part in [first_name, last_name] if part).strip()

        if field == "username":
            seed = email or full_name or company or current_value or "operator"
            suggestion = _slug_username(seed)
            alternatives = [suggestion, _slug_username(f"{seed}.crm")]
            return AssistResult(suggestion, alternatives, "Generated a login-friendly username from the current person or email.", "")
        if field == "firstname":
            suggestion = first_name or "Jordan"
            return AssistResult(suggestion, [suggestion], "Inferred from the current person record.", "")
        if field == "lastname":
            suggestion = last_name or "Brooks"
            return AssistResult(suggestion, [suggestion], "Inferred from the current person record.", "")
        if field == "systemname":
            suggestion = company or (f"{full_name} Workspace" if full_name else "Client Workspace")
            alternatives = [suggestion, f"{suggestion} HQ".strip(), f"{suggestion} Portal".strip()]
            return AssistResult(suggestion, alternatives, "Names the isolated workspace in a client-friendly way.", "")
        return self._generic_result(field, current_value, context)

    def _assist_bulk_action(self, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        action = _clean(context.get("action")).lower()
        selected_count = int(context.get("selectedCount") or 0)
        if field == "value":
            if action == "add_tag":
                suggestion = "High Intent"
                alternatives = ["Needs Follow-up", "VIP", "Pipeline Push"]
            elif action == "remove_tag":
                suggestion = "Cold Lead"
                alternatives = ["Nurture", "Stale", "Unqualified"]
            elif action == "set_owner":
                suggestion = "STRIKER"
                alternatives = ["ECHO", "Adam B."]
            elif action == "set_department":
                suggestion = "Sales"
                alternatives = ["Marketing", "Operations"]
            elif action == "assign_ai":
                suggestion = "STRIKER"
                alternatives = ["ECHO", "ALPHA"]
            elif action == "add_flow":
                suggestion = "Discovery Sequence"
                alternatives = ["Follow-up Sprint", "Reactivation Loop"]
            elif action == "remove_flow":
                suggestion = "Paused Nurture"
                alternatives = ["Discovery Sequence", "Newsletter Follow-up"]
            else:
                suggestion = current_value or "Refine this value"
                alternatives = [suggestion]
            return AssistResult(
                suggestion,
                alternatives,
                f"Drafted a bulk-action value that fits {selected_count or 'the selected'} CRM record(s).",
                "",
            )
        return self._generic_result(field, current_value, context)

    def _assist_forms(self, surface: str, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        normalized_field = field.lower()
        label = _clean(context.get("label")) or "Field Label"
        field_type = _clean(context.get("type")).lower() or "text"
        form_name = _clean(context.get("form_name"))
        schema_labels = [str(item).strip() for item in (context.get("schema_labels") or []) if str(item).strip()]

        if normalized_field == "form-name":
            if form_name and form_name.lower() != "new untitled form":
                suggestion = form_name if "form" in form_name.lower() else f"{form_name} Form"
            elif schema_labels:
                suggestion = f"{schema_labels[0]} Intake Form"
            else:
                suggestion = "Lead Intake Form"
            return AssistResult(
                suggestion,
                [suggestion, "Client Intake Form", "Discovery Form"],
                "Shaped from the current form schema and naming context.",
                "",
            )

        if normalized_field == "label":
            by_type = {
                "text": "Full Name",
                "email": "Email Address",
                "tel": "Phone Number",
                "textarea": "How can we help?",
                "select": "Select an option",
                "radio": "Choose one option",
                "number": "How many seats?",
                "address": "Business Address",
                "signature": "Signature",
                "url": "Website URL",
                "currency": "Budget Range",
            }
            suggestion = by_type.get(field_type, label or "Field Label")
            return AssistResult(suggestion, [suggestion], "Matches the field type and the form's likely operator intent.", "")

        if normalized_field == "placeholder":
            if field_type == "email":
                suggestion = "name@company.com"
            elif field_type == "tel":
                suggestion = "(555) 555-5555"
            elif field_type == "textarea":
                suggestion = "Share the details so AIO can route this properly..."
            elif field_type == "url":
                suggestion = "https://example.com"
            else:
                suggestion = f"Enter {(label or 'this field').lower()}..."
            return AssistResult(suggestion, [suggestion], "Provides a fast placeholder starter aligned to the field type.", "")

        if normalized_field == "defaultvalue":
            suggestion = "" if field_type == "select" else f"Sample {label}"
            return AssistResult(suggestion, [suggestion], "Keeps the default value aligned with the field label.", "")

        if normalized_field == "options":
            suggestion = "Yes, No, Need More Info" if field_type == "radio" else "Option 1, Option 2, Option 3"
            return AssistResult(
                suggestion,
                [suggestion, "Discovery, Proposal, Closed Won", "Basic, Growth, Enterprise"],
                "Returns comma-separated options that can drop straight into the form builder.",
                "",
            )

        if normalized_field == "errormessage":
            suggestion = f"{label} is required before this form can continue."
            return AssistResult(suggestion, [suggestion], "Frames the validation message clearly for the operator and the submitter.", "")

        if normalized_field == "fieldname":
            suggestion = _slug_username(label).replace(".", "_")
            return AssistResult(suggestion, [suggestion], "Produces a stable machine-friendly field name.", "")

        return self._generic_result(field, current_value, context)

    def _assist_calendar(self, surface: str, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        normalized_field = field.lower()
        location_type = _clean(context.get("location_type")).lower() or "other"
        name = _clean(context.get("name"))

        if surface == "booker":
            if normalized_field == "name":
                suggestion = {
                    "zoom": "Strategy Zoom Session",
                    "google_meet": "Google Meet Check-In",
                    "phone": "Phone Discovery Call",
                    "other": "Client Planning Session",
                }.get(location_type, "Client Meeting")
                return AssistResult(suggestion, [suggestion], "Matched to the meeting type and booking context.", "")
            if normalized_field == "description":
                suggestion = (
                    f"Use this booking type for {name or 'this meeting'}.\n"
                    "Clarify the goal, who should attend, and what the client should prepare before the call."
                )
                return AssistResult(suggestion, [suggestion], "Produces a concise booking description with clear expectations.", "")
            if normalized_field == "location":
                suggestion = {
                    "zoom": "Zoom Meeting",
                    "google_meet": "Google Meet",
                    "phone": "+1 (555) 555-5555",
                    "other": "Main office or private meeting link",
                }.get(location_type, "Main office")
                return AssistResult(suggestion, [suggestion], "Keeps the location details consistent with the selected meeting channel.", "")

        if surface == "event":
            if normalized_field == "title":
                suggestion = {
                    "zoom": "Strategy Review Meeting",
                    "google_meet": "Working Session",
                    "phone": "Phone Follow-Up",
                    "other": "Client Meeting",
                }.get(location_type, "Client Meeting")
                return AssistResult(suggestion, [suggestion], "Matched to the selected meeting location type.", "")
            if normalized_field == "description":
                suggestion = (
                    "Objective: align on the next step.\n"
                    "Agenda: review context, confirm blockers, and leave with one owner and one concrete action.\n"
                    "Preparation: bring the latest notes and any open questions."
                )
                return AssistResult(suggestion, [suggestion], "Drafts a structured meeting brief that works for operators and clients.", "")
            if normalized_field == "location":
                suggestion = {
                    "phone": "+1 (555) 555-5555",
                    "other": "Office address, room, or external meeting link",
                }.get(location_type, current_value or "Meeting details")
                return AssistResult(suggestion, [suggestion], "Supplies the right detail style for the selected meeting mode.", "")

        return self._generic_result(field, current_value, context)

    def _assist_flows(self, surface: str, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        normalized_field = field.lower()
        flow_name = _clean(context.get("flow_name")) or "Untitled Flow"
        selected_label = _clean(context.get("selected_label")) or "this node"
        action_type = _clean(context.get("action_type")).lower() or "send_email"
        logic_type = _clean(context.get("logic_type")).lower() or "if_then"
        trigger_event = _clean(context.get("trigger_event")) or "the selected event"

        if surface in {"flow-node", "flow-header"}:
            if normalized_field == "node-description":
                suggestion = (
                    f"{selected_label} handles one clean step inside {flow_name}. "
                    "Document the trigger, the payload it expects, and the exact output it should hand to the next node."
                )
                return AssistResult(suggestion, [suggestion], "Keeps the node description operator-readable and execution-specific.", "")
            if normalized_field in {"description", "trigger-description"}:
                suggestion = (
                    f"When {trigger_event} fires, normalize the important fields, score urgency, "
                    "and push forward only the context the next action needs."
                )
                return AssistResult(suggestion, [suggestion], "Drafts trigger logic with signal-first language.", "")
            if normalized_field in {"configuration", "action-configuration"}:
                config_by_action = {
                    "send_email": {"channel": "email", "objective": "Deliver a concise follow-up", "tone": "helpful and direct", "required_fields": ["subject", "body", "owner"]},
                    "send_sms": {"channel": "sms", "objective": "Send a short action-first reminder", "tone": "brief and clear", "required_fields": ["message", "owner"]},
                    "store_data": {"channel": "storage", "objective": "Persist normalized payload", "required_fields": ["target_table", "fields"]},
                    "create_task": {"channel": "task", "objective": "Create a follow-up task", "required_fields": ["title", "owner", "due_in_hours"]},
                }
                suggestion = _json_text(config_by_action.get(action_type, config_by_action["send_email"]))
                return AssistResult(suggestion, [suggestion], "Returns a valid JSON starter for the current action node.", "")
            if normalized_field in {"condition", "logic-condition"}:
                if logic_type == "delay":
                    suggestion = "Wait 30 minutes before continuing, unless the contact has replied or the stage has already advanced."
                elif logic_type == "filter":
                    suggestion = 'Continue only if lead_score >= 70, a valid email is present, and the contact is not closed-lost.'
                else:
                    suggestion = 'If intent contains "demo" or lead_score >= 75, route to sales. Otherwise send to nurture and create a review task.'
                return AssistResult(suggestion, [suggestion], "Drafts decision logic in readable operator language.", "")
            if normalized_field in {"payloadmap", "payload-map"}:
                suggestion = _json_text({
                    "contact_email": "{{trigger.payload.email}}",
                    "contact_name": "{{trigger.payload.name}}",
                    "stage": "{{crm.contact.pipeline_stage}}",
                    "owner": "{{crm.contact.owner}}",
                })
                return AssistResult(suggestion, [suggestion], "Provides a clean payload mapping scaffold.", "")
            if normalized_field == "headers":
                suggestion = _json_text({
                    "Content-Type": "application/json",
                    "X-AIO-Flow": flow_name,
                    "Authorization": "Bearer {{global.API_TOKEN}}",
                })
                return AssistResult(suggestion, [suggestion], "Produces a safe default webhook header block.", "")
            if normalized_field == "general":
                suggestion = (
                    "Objective: explain what this node should accomplish.\n"
                    "Input: note the incoming data.\n"
                    "Decision: define the logic or transformation.\n"
                    "Output: describe the payload or side effect expected next."
                )
                return AssistResult(suggestion, [suggestion], "Creates an operator-facing configuration scaffold.", "")
            if normalized_field in {"raw-config", "rawconfig"}:
                suggestion = _json_text({
                    "summary": f"AI scaffold for {selected_label}",
                    "objective": "Capture the intended node behavior before finalizing config.",
                    "notes": ["confirm payload shape", "confirm owner routing", "confirm retries"],
                })
                return AssistResult(suggestion, [suggestion], "Returns a raw JSON scaffold for deeper node configuration.", "")

        if surface == "flow-note":
            suggestion = (
                f"Goal: {flow_name}\n"
                "Signal: define the operator intent.\n"
                "Risk: capture where this automation can fail.\n"
                "Next step: record the next action or dependency."
            )
            return AssistResult(suggestion, [suggestion], "Writes a concise note for the current flow context.", "")

        if surface == "edge-filter":
            suggestion = 'lead_score >= 70 AND pipeline_stage != "Closed Lost" AND contact_email != ""'
            return AssistResult(suggestion, [suggestion], "Provides a practical routing filter starter.", "")

        return self._generic_result(field, current_value, context)

    def _assist_comms(self, surface: str, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        normalized_field = field.lower()
        subject = _clean(context.get("subject")) or "this thread"
        preview = _clean(context.get("preview"))
        summary = _clean(context.get("summary")) or preview
        next_step = _clean(context.get("recommended_next_step"))
        disposition = _clean(context.get("disposition")) or "Active relationship signal"
        contact_name = _clean(context.get("contact_name")) or "the contact"
        company_name = _clean(context.get("company_name"))
        assignee = _clean(context.get("assignee")) or "ECHO"
        latest_message = _clean(context.get("latest_message"))
        latest_direction = _clean(context.get("latest_direction")).lower() or "inbound"
        reasoning_cues = [str(item).strip() for item in (context.get("reasoning_cues") or []) if str(item).strip()]
        unresolved_questions = [str(item).strip() for item in (context.get("unresolved_questions") or []) if str(item).strip()]
        ai_flags = [str(item).strip() for item in (context.get("ai_flags") or []) if str(item).strip()]
        priority = _clean(context.get("priority")) or "medium"
        relationship = f"{contact_name} at {company_name}" if company_name else contact_name
        source_text = latest_message or summary or preview or subject
        clean_source = source_text.rstrip(".")

        if normalized_field == "summary":
            if latest_message:
                suggestion = f"{relationship} is focused on {clean_source.lower()}."
            elif summary:
                suggestion = summary if summary.endswith(".") else f"{summary}."
            else:
                suggestion = f"{relationship} needs a clear next move on {subject}."
            recommended_next_step = next_step or (
                "Send a concise follow-up that confirms ownership, answers the latest question, and proposes one decisive next step."
                if latest_direction == "inbound"
                else "Monitor for reply, prep the next touchpoint, and keep the CRM record aligned with the thread."
            )
            metadata = {
                "recommended_next_step": recommended_next_step,
                "disposition": disposition,
                "confidence": 0.91 if latest_message else 0.82,
                "unresolved_questions": unresolved_questions or ["Confirm the most important next action for this thread."],
                "crm_implications": [f"{priority.capitalize()} priority relationship signal"],
                "reasoning_cues": reasoning_cues or ai_flags or ["AI brief refreshed from the latest thread context"],
            }
            return AssistResult(
                suggestion,
                [suggestion],
                "Refreshes the thread brief from the latest message, current disposition, and operator context.",
                "",
                metadata,
            )

        if normalized_field == "reply":
            suggestion = (
                f"Hi {contact_name},\n\n"
                f"I reviewed your latest note on {subject}. {summary or clean_source} "
                f"Our next step from this side is: {next_step or 'I will align the right owner and send the cleanest next move shortly.'}\n\n"
                "If that works, I can keep this moving and confirm timing in the same thread.\n\n"
                f"Best,\n{assignee}"
            )
            return AssistResult(
                suggestion,
                [suggestion],
                "Drafts a direct reply that uses the live thread summary and next-step guidance.",
                "",
                {"recommended_next_step": "Review the AI draft, tighten the tone, and send when ready."},
            )

        if normalized_field == "rewrite":
            seed = _clean(current_value) or summary or clean_source
            suggestion = (
                f"{seed.rstrip('.')}. "
                f"Next move: {next_step or 'respond with one clear action, one owner, and one time commitment.'}"
            )
            return AssistResult(
                suggestion,
                [suggestion],
                "Reframes the current draft into a cleaner operator-ready message.",
                "",
                {"recommended_next_step": "Review the refined message and align it to the active thread status before sending."},
            )

        if normalized_field == "extract":
            tasks = [
                f"- Confirm owner for {subject}.",
                f"- Respond to {contact_name} with the clean next step.",
                "- Update CRM stage and follow-up timing if the thread has moved.",
            ]
            if unresolved_questions:
                tasks.append(f"- Resolve open question: {unresolved_questions[0]}.")
            suggestion = "Task extract:\n" + "\n".join(tasks)
            return AssistResult(
                suggestion,
                [suggestion],
                "Pulls operational tasks out of the active conversation so the operator can execute quickly.",
                "",
                {"recommended_next_step": "Turn the extracted tasks into ownership, timing, and a decisive customer-facing reply."},
            )

        return self._generic_result(field, current_value, context)

    def _assist_brain(self, surface: str, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        normalized_surface = surface.lower()
        normalized_field = field.lower()
        profile = context.get("profile") or {}
        company_name = _clean(profile.get("company_name") or context.get("company_name")) or "this workspace"
        website = _clean(profile.get("website") or context.get("website"))
        industry = _clean(profile.get("industry") or context.get("industry")) or "AI operations"
        overview = _clean(profile.get("overview") or context.get("overview"))
        mission = _clean(profile.get("mission") or context.get("mission"))
        brand_voice = _clean(profile.get("brand_voice") or context.get("brand_voice"))
        ideal_customer = _clean(profile.get("ideal_customer") or context.get("ideal_customer"))
        source_count = int(context.get("source_count") or 0)
        knowledge_count = int(context.get("knowledge_count") or 0)

        if normalized_surface in {"workspace", "profile", "ai-workbench"}:
            if normalized_field in {"orientation", "starter-note"}:
                suggestion = (
                    f"AIO Brain should hold the durable operating memory for {company_name}: "
                    "positioning, SOPs, customer truths, brand rules, and the guidance your agents should inherit before they draft, classify, or route work."
                )
                return AssistResult(
                    suggestion,
                    [suggestion],
                    "Frames the module as workspace memory instead of a loose note bucket.",
                    "",
                )

            if normalized_field in {"company-profile", "profile-build", "overview"}:
                suggestion = (
                    f"{company_name} operates in {industry}. "
                    f"It uses AIO CRM as a local-first control layer for customer operations, communications, workflows, and AI execution. "
                    f"The company should be described as {brand_voice or 'direct, operator-friendly, and practical'}, "
                    "with messaging centered on replacing fragmented tools with one operational system that keeps humans and AI aligned."
                )
                return AssistResult(
                    suggestion,
                    [suggestion],
                    "Builds a grounded company overview that can feed future drafting and retrieval.",
                    "",
                )

            if normalized_field in {"mission", "mission-build"}:
                suggestion = (
                    mission
                    or f"Help {company_name} run revenue, relationships, and execution from one system where automation and AI stay accountable to real operational context."
                )
                return AssistResult(
                    suggestion,
                    [suggestion],
                    "Turns the workspace context into a mission statement agents can inherit.",
                    "",
                )

            if normalized_field in {"brand-voice", "voice"}:
                suggestion = (
                    brand_voice
                    or "Voice: direct, sharp, informed, and practical. Avoid fluff, generic hype, and soft corporate filler. Explain clearly, recommend decisively, and sound like an operator who knows the system end to end."
                )
                return AssistResult(
                    suggestion,
                    [suggestion],
                    "Creates a reusable brand voice block for AI drafting across the workspace.",
                    "",
                )

            if normalized_field in {"ideal-customer", "icp", "customer"}:
                suggestion = (
                    ideal_customer
                    or f"Ideal customer: founder-led or lean operator teams juggling CRM, messaging, automation, and follow-up across too many tools. They need a local-first operating system that reduces tool sprawl, sharpens execution, and gives AI real company context instead of shallow prompts."
                )
                return AssistResult(
                    suggestion,
                    [suggestion],
                    "Defines the ICP in a way that can feed marketing, sales, and AI behavior.",
                    "",
                )

            if normalized_field in {"ops-playbook", "playbook", "ops"}:
                suggestion = (
                    f"Ops playbook entry: Before any outbound draft or workflow action, pull current relationship context, active stage, and workspace memory from AIO Brain. "
                    "Prefer one clear owner, one next step, and one logged rationale. "
                    "If the system lacks enough context, generate a follow-up question instead of pretending certainty."
                )
                return AssistResult(
                    suggestion,
                    [suggestion],
                    "Produces an actionable operating rule suitable for a playbook entry.",
                    "",
                )

            if normalized_field in {"source-notes", "source-brief"}:
                suggestion = (
                    f"This source should strengthen Brain memory for {company_name} by contributing factual operating context, reusable references, and draftable language. "
                    f"Current workspace footprint: {source_count} source(s), {knowledge_count} knowledge item(s). "
                    "Prefer concise notes that explain why the source matters and how agents should use it."
                )
                return AssistResult(
                    suggestion,
                    [suggestion],
                    "Explains the role a source plays inside the memory system.",
                    "",
                )

            if normalized_field in {"knowledge-note", "knowledge", "item"}:
                seed = current_value or overview or mission or f"{company_name} should use AIO Brain to store truths that future agents can trust."
                return AssistResult(
                    seed,
                    [seed],
                    "A draft knowledge item for the AIO Brain.",
                    "",
                )

        return self._generic_result(field, current_value, context)

    def _assist_pipeline(self, surface: str, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        normalized_field = _clean(field).lower()
        normalized_surface = _clean(surface).lower()
        
        contact_name = _clean(context.get("contactName"))
        contact_email = _clean(context.get("contactEmail"))
        deal_value = context.get("dealValue")
        lead_score = context.get("leadScore")
        
        if normalized_field in {"next-action", "suggestion", "recommendation"}:
            if lead_score and lead_score >= 85:
                suggestion = f"Priority outreach to {contact_name or 'this contact'} - high signal detected. Draft personalized intro focused on value proposition."
            elif lead_score and lead_score >= 65:
                suggestion = f"Nurture {contact_name or 'this contact'} with relevant content. Schedule follow-up for next week."
            else:
                suggestion = f"Add {contact_name or 'this contact'} to targeted sequence. Monitor for engagement."
            return AssistResult(suggestion, [suggestion], f"Deal scoring: {lead_score}/100. Value: ${deal_value or 'undisclosed'}", "")
        
        return AssistResult(
            f"Analyze deal flow for {contact_name or 'pipeline'}",
            [f"Review deal: {contact_name}", f"Schedule follow-up: {contact_email}"],
            "Pipeline deal analysis.",
            ""
        )

    def _assist_dashboard(self, surface: str, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        normalized_field = _clean(field).lower()
        stats = context.get("stats", [])
        
        if normalized_field in {"summary", "insights", "analyze"}:
            if stats:
                stat_summary = ", ".join([f"{s.get('title')}: {s.get('value')}" for s in stats[:4]])
                suggestion = f"Current workspace metrics: {stat_summary}. Key observation: activity trending upward with strong engagement signals."
            else:
                suggestion = "Dashboard is showing healthy activity levels. Continue monitoring key KPIs."
            return AssistResult(suggestion, [suggestion], "Dashboard insight analysis", "")
        
        return AssistResult(
            "Dashboard metrics overview",
            ["Review stats", "Check trends", "Monitor conversions"],
            "General dashboard overview",
            ""
        )

    def _assist_orders(self, surface: str, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        normalized_field = _clean(field).lower()
        order_count = context.get("orderCount", 0)
        
        if normalized_field in {"summary", "analyze"}:
            suggestion = f"Order volume currently at {order_count} orders. Review recent transactions for patterns and fulfillment status."
            return AssistResult(suggestion, [suggestion], f"Order analysis: {order_count} orders in system", "")
        
        return AssistResult(
            f"Order management for {order_count} orders",
            ["Review orders", "Check fulfillment", "Process returns"],
            "Order management overview",
            ""
        )

    def _assist_help(self, surface: str, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        normalized_field = _clean(field).lower()
        subject = _clean(context.get("subject"))
        content = _clean(context.get("content"))
        category = _clean(context.get("category"))
        priority = _clean(context.get("priority"))

        if normalized_field == "ticket-triage":
            suggestion = (
                f"Triage Result for '{subject}':\n\n"
                f"Analysis: This appears to be a {category} request of {priority} priority. "
                "Charlie recommends immediate reference to the Knowledgebase article 'System Settings' while an agent reviews the technical details.\n\n"
                "Auto-Draft Response: Hello! Charlie here. I've logged your request and am currently analyzing the Cortex logs. "
                "In the meantime, you might find a quick answer in our 'Support' section."
            )
            return AssistResult(suggestion, [suggestion], "Automated triage and initial drafting by Charlie v1.", "")

        if normalized_field == "subject":
            suggestion = current_value or "Help Request: "
            return AssistResult(suggestion, [suggestion], "Drafts a clear, professional support subject.", "")

        if normalized_field == "content":
            suggestion = current_value or "I'm experiencing an issue with..."
            return AssistResult(suggestion, [suggestion], "Provides a structured starter for the support request.", "")

        return self._generic_result(field, current_value, context)

    def service_help_ticket(self, ticket: dict[str, Any], provider_config: dict[str, Any] | None = None) -> dict[str, Any]:
        """
        Background servicing of a ticket by Charlie.
        In v1, this generates an internal AI note and a draft response.
        """
        subject = ticket.get("subject", "No Subject")
        content = ticket.get("content", "No Content")
        
        system_prompt = (
            "You are Charlie, the AIO CRM Help Desk Assistant. "
            "Analyze the following support ticket and provide: "
            "1. A concise internal analysis for the team. "
            "2. A professional, helpful draft response for the customer."
        )
        prompt = f"Ticket Subject: {subject}\nTicket Content: {content}"
        
        ai_response = self._provider_complete(provider_config, prompt, system_prompt=system_prompt)
        
        if ai_response and ai_response.get("suggestion"):
            return {
                "ai_note": ai_response.get("rationale"),
                "ai_draft": ai_response.get("suggestion")
            }
        
        # Fallback for v1 if AI is offline
        return {
            "ai_note": "Charlie v1 analyzed the ticket: detected category match. Recommended manual review.",
            "ai_draft": f"Hello! Charlie has received your ticket regarding '{subject}'. An agent will be with you shortly."
        }

    def parse_command(
        self,
        command: str,
        context: dict[str, Any],
        actor: dict[str, Any],
        tenant_id: str,
        provider_config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized_command = _clean(command)
        if not normalized_command:
            return {"steps": []}

        system_prompt = (
            "You are Cortex, the orchestrator. Parse the user's natural language command into a structured JSON array of execution steps.\n"
            "Return valid JSON ONLY matching this exact schema:\n"
            '{\n  "steps": [\n    { "intent": "supported_intent", "parameters": { ... } }\n  ]\n}\n'
            "Strictly use ONLY the following supported intents:\n"
            "- draft_email\n"
            "- schedule_calendar\n"
            "- add_contact\n"
            "- add_crm_note\n"
            "\n"
            "CRITICAL RULES:\n"
            "1. Output NOTHING except valid JSON.\n"
            "2. DO NOT guess missing information. Return partial steps with available parameters only.\n"
        )
        prompt = (
            f"User Command: {normalized_command}\n"
            f"Available Context: {json.dumps(context)}\n"
            f"Actor: {actor.get('name') or actor.get('email') or 'operator'}\n"
            f"Return the parsed steps."
        )

        try:
            ai_response = self._provider_complete(provider_config, prompt, system_prompt=system_prompt)
            if not ai_response:
                return {"steps": []}

            raw_text = _clean(ai_response.get("suggestion"))
            if not raw_text:
                return {"steps": []}

            # Strip Markdown formatting if present
            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[-1].split("```")[0].strip()
            elif "```" in raw_text:
                raw_text = raw_text.split("```")[-1].split("```")[0].strip()

            parsed = json.loads(raw_text)
            steps = parsed.get("steps") or []
            
            supported_intents = {"draft_email", "schedule_calendar", "add_contact", "add_crm_note"}
            valid_steps = []
            
            for step in steps:
                if isinstance(step, dict) and step.get("intent") in supported_intents:
                    valid_steps.append({
                        "intent": step.get("intent"),
                        "parameters": step.get("parameters") or {}
                    })

            return {"steps": valid_steps}
        except Exception:
            return {"steps": []}

    def _post_json(self, url: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> dict[str, Any]:
        resolved_headers = {"Content-Type": "application/json", **(headers or {})}
        data = json.dumps(payload).encode("utf-8")
        req = urlrequest.Request(url, data=data, headers=resolved_headers, method="POST")
        try:
            with urlrequest.urlopen(req, timeout=30) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body.strip() else {}
        except urlerror.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise ValueError(f"HTTP {exc.code} from {url}: {detail}") from exc
        except (urlerror.URLError, TimeoutError, OSError) as exc:
            raise ValueError(f"Unable to reach {url}: {exc}") from exc
        except json.JSONDecodeError:
            return {}

    def _provider_complete(
        self,
        provider_config: dict[str, Any] | None,
        prompt: str,
        *,
        system_prompt: str = "",
    ) -> dict[str, Any] | None:
        if not provider_config:
            return None
        
        provider_key = _clean(provider_config.get("provider_key")).lower()
        if not provider_key:
            return None
            
        config = provider_config.get("config") or {}
        
        # Globally extract and inject guardrails for ALL providers
        system_guardrails = (config.get("system_guardrails") or provider_config.get("system_guardrails") or "").strip()
        task_guardrails = (config.get("task_guardrails") or provider_config.get("task_guardrails") or "").strip()
        
        if system_guardrails:
            system_prompt = f"{system_prompt}\n\nAdditional instructions:\n{system_guardrails}".strip()
            
        if task_guardrails:
            prompt = f"{prompt}\n\nTask guidance:\n{task_guardrails}".strip()
            
        model = _clean(provider_config.get("model"))
        api_key = _clean(provider_config.get("api_key"))
        base_url = _provider_base_url(provider_config.get("base_url"), "")
        
        if provider_key == "ollama" and not base_url:
            raise ValueError("Ollama base URL not configured. Please set the Ollama server URL in provider settings.")
        try:
            if provider_key == "ollama":
                if not base_url:
                    raise ValueError("Ollama base URL not configured. Please set the Ollama server URL in provider settings.")
                print(f"[AIProviderResolve] {provider_key} using base_url: {base_url}")
                raw_text = self._complete_ollama(
                    base_url, model, prompt, system_prompt, api_key, config,
                )
            elif provider_key in {"openai", "openrouter", "perplexity"}:
                if not base_url:
                    raise ValueError(f"{provider_key} base URL not configured. Please set the API endpoint in provider settings.")
                print(f"[AIProviderResolve] {provider_key} using base_url: {base_url}")
                extra_headers: dict[str, str] = {
                    "temperature": str(config.get("temperature") or 0.2)
                }
                if provider_key == "openrouter":
                    extra_headers["HTTP-Referer"] = _clean(config.get("site_url")) or "https://aiocrm.local"
                    extra_headers["X-Title"] = _clean(config.get("app_name")) or "AIO CRM"
                raw_text = self._complete_openai_compat(
                    base_url, api_key, model, prompt, system_prompt, extra_headers,
                )
            elif provider_key == "anthropic":
                if not base_url:
                    raise ValueError("Anthropic base URL not configured. Please set the API endpoint in provider settings.")
                print(f"[AIProviderResolve] {provider_key} using base_url: {base_url}")
                raw_text = self._complete_anthropic(
                    base_url, api_key, model, prompt, system_prompt,
                )
            elif provider_key == "google-ai":
                if not base_url:
                    raise ValueError("Google AI base URL not configured. Please set the API endpoint in provider settings.")
                print(f"[AIProviderResolve] {provider_key} using base_url: {base_url}")
                raw_text = self._complete_google_ai(
                    base_url, api_key, model, prompt, system_prompt, float(config.get("temperature") or 0.2),
                )
            else:
                raise ValueError(f"Unsupported AI provider type: {provider_key}")
        except (ValueError, OSError, urlerror.URLError) as e:
            logger.warning(f"[AI Provider] Call failed: {e}")
            return None
        if not raw_text or not raw_text.strip():
            return None
        cleaned = raw_text.strip()
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[-1].split("```")[0].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned.split("```", 2)[-1].rsplit("```", 1)[0].strip()
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict) and "suggestion" in parsed:
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass
        return {"suggestion": raw_text.strip()}

    def _complete_ollama(
        self, base_url: str, model: str, prompt: str, system_prompt: str, api_key: str, config: dict[str, Any],
    ) -> str:
        if not model:
            return ""
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": float(config.get("temperature") or 0.2)},
        }
        if system_prompt:
            payload["system"] = system_prompt
        response = self._post_json(
            f"{base_url}/api/generate",
            payload,
            headers=_ollama_auth_headers(api_key, config.get("username"), config.get("password")),
        )
        return _clean(response.get("response"))

    def _complete_openai_compat(
        self, base_url: str, api_key: str, model: str, prompt: str, system_prompt: str,
        extra_headers: dict[str, str] | None = None,
    ) -> str:
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        # Ensure temperature is passed through extra_headers if not already
        if extra_headers is None:
            extra_headers = {}
            
        headers = {"Authorization": f"Bearer {api_key}", **{k: v for k, v in extra_headers.items() if k != "temperature"}}
        response = self._post_json(
            f"{base_url}/v1/chat/completions",
            {"model": model, "messages": messages, "temperature": float(extra_headers.get("temperature") or 0.2)},
            headers=headers,
        )
        choices = response.get("choices") or []
        if choices:
            return _clean(choices[0].get("message", {}).get("content"))
        return ""

    def _complete_anthropic(
        self, base_url: str, api_key: str, model: str, prompt: str, system_prompt: str,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model or "claude-sonnet-4-20250514",
            "max_tokens": 2048,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            payload["system"] = system_prompt
        response = self._post_json(
            f"{base_url}/v1/messages",
            payload,
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
        )
        content = response.get("content") or []
        if content and isinstance(content, list):
            return _clean(content[0].get("text"))
        return ""

    def _complete_google_ai(
        self, base_url: str, api_key: str, model: str, prompt: str, system_prompt: str, temperature: float = 0.2,
    ) -> str:
        resolved_model = model or "gemini-2.5-flash"
        payload: dict[str, Any] = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature},
        }
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
        url = f"{base_url}/v1beta/models/{resolved_model}:generateContent?key={api_key}"
        response = self._post_json(url, payload)
        candidates = response.get("candidates") or []
        if candidates:
            parts = candidates[0].get("content", {}).get("parts") or []
            if parts:
                return _clean(parts[0].get("text"))
        return ""

    def _assist_with_provider(
        self,
        *,
        provider_config: dict[str, Any] | None,
        module: str,
        surface: str,
        field: str,
        intent: str,
        current_value: str,
        context: dict[str, Any],
        actor: dict[str, Any],
        tenant: dict[str, Any],
        fallback: AssistResult,
    ) -> AssistResult | None:
        if not provider_config or not _clean(provider_config.get("provider_key")):
            return None
        system_prompt = (
            "You are an AI assistant for AIO CRM. Return compact JSON only with these exact keys: "
            "suggestion (str), alternatives (list of str), rationale (str), metadata (dict or null). "
            "Do not return anything outside of valid JSON."
        )
        parts = [f"Module: {module}", f"Surface: {surface}", f"Field: {field}", f"Intent: {intent}"]
        actor_name = _clean(actor.get("name") or actor.get("email")) or "operator"
        workspace_name = _clean(tenant.get("name")) or "active workspace"
        parts.extend([f"Actor: {actor_name}", f"Workspace: {workspace_name}"])
        if current_value:
            parts.append(f"Current value: {current_value}")
        relevant = {k: v for k, v in context.items() if v and k not in ("brain_memory_summary", "profile")}
        if relevant:
            parts.append(f"Context: {json.dumps(relevant, default=str)}")
        prompt = ". ".join(parts) + ". Generate the best value for this field."
        try:
            result = self._provider_complete(provider_config, prompt, system_prompt=system_prompt)
            if not result:
                return None
            suggestion = _clean(result.get("suggestion"))
            if not suggestion:
                return None
            alternatives = result.get("alternatives")
            if not isinstance(alternatives, list) or not alternatives:
                alternatives = [suggestion]
            rationale = _clean(result.get("rationale")) or "Generated by the configured AI provider."
            metadata = result.get("metadata") if isinstance(result.get("metadata"), dict) else None
            return AssistResult(
                suggestion=suggestion,
                alternatives=[str(a) for a in alternatives],
                rationale=rationale,
                prompt=fallback.prompt if fallback else "",
                metadata=metadata,
            )
        except Exception:
            return None


    def _generic_result(self, field: str, current_value: str, context: dict[str, Any]) -> AssistResult:
        brain_memory = _clean(context.get("brain_memory_summary"))
        seed = (
            current_value
            or _clean(context.get("company"))
            or _clean(context.get("email"))
            or (brain_memory.splitlines()[0] if brain_memory else "")
            or _title(field)
        )
        suggestion = seed or f"Refined {field}"
        rationale = "Generated from the current field context."
        if brain_memory:
            rationale += " Enriched with AIO Brain memory."
        return AssistResult(suggestion, [suggestion], rationale, "")


ai_assist_service = AIAssistService()
