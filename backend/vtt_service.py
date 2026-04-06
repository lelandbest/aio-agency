"""
VTT Service — Voice-to-Command + Conversational (Charlie)

Command types:
  interrupt  — stop / abort running operations
  immediate  — escape / cancel UI state
  navigation — open module
  workflow   — start / stop named workflow
  staged    — send email, create image/video, summarize
  confirmed  — run flow (requires confirmation)
"""

from typing import Any
import os
from backend.utils.provider_normalizer import get_elevenlabs_api_key, get_elevenlabs_voice_selection, get_async_api_key, get_async_voice_selection

_HIGH_IMPACT_ACTIONS: set[str] = {
    "send_email", "publish", "run_flow",
    "delete", "overwrite", "external_submission",
}

_PENDING_ACTIONS: dict[str, dict[str, Any]] = {}

_CONFIRM_KEYWORDS: set[str] = {"yes", "confirm", "go", "do it", "doit", "y", "sure", "ok", "execute", "run it", "send it", "publish it"}
_INTERRUPT_KEYWORDS: set[str] = {"stop", "escape", "cancel", "abort"}

QUICK_GREETINGS: dict[str, str] = {
    "hello": "Hello. I am Charlie.",
    "hello charlie": "Hello. I am Charlie.",
    "hi": "Hi there. Ready for commands.",
    "hi charlie": "Hi there. Ready for commands.",
    "how are you": "I am functioning within normal parameters. Ready for your directive.",
    "how are you charlie": "I am functioning within normal parameters. Ready for your directive.",
}


def formatCharlieResponse(*, mode: str, message: str = "", reason: str = "") -> dict[str, Any]:
    """Format a Charlie response deterministically based on mode."""
    result = {"mode": mode}

    if mode == "command":
        result["message"] = message
    elif mode == "assist":
        result["message"] = message
    elif mode == "confirmation":
        result["message"] = message
    elif mode == "clarification":
        result["message"] = message
    elif mode == "result":
        result["message"] = message
    elif mode == "failure":
        result["message"] = message
        if reason:
            result["reason"] = reason
    elif mode == "interrupt":
        result["message"] = message

    if len(result.get("message", "")) > 300:
        result["message"] = result["message"][:297] + "..."

    return result


def _classify_input(raw: str) -> str:
    """Classify a conversational input into a response mode."""
    normalized = raw.strip().lower()

    if normalized in _INTERRUPT_KEYWORDS:
        return "interrupt"

    if normalized in _CONFIRM_KEYWORDS:
        return "confirmation"

    return "assist"


def _pending_action_key(tenant_id: str | None) -> str:
    return tenant_id or "anonymous"

DEFAULT_REGISTRY: list[dict[str, Any]] = [
    # ── Reserved (locked) ──────────────────────────────────────────────
    {"phrase": "stop",       "type": "interrupt",   "target": "system:stop",              "requiresPayload": False},
    {"phrase": "escape",     "type": "immediate",   "target": "ui:escape",               "requiresPayload": False},
    {"phrase": "cancel",     "type": "immediate",   "target": "ui:cancel",              "requiresPayload": False},
    {"phrase": "abort",       "type": "interrupt",   "target": "system:stop",              "requiresPayload": False},
    # ── Diagnostics ───────────────────────────────────────────────────
    {"phrase": "test 123",   "type": "immediate",   "target": "system:test",             "requiresPayload": False},
    # ── Navigation ────────────────────────────────────────────────────
    {"phrase": "open brain",       "type": "navigation", "target": "route:/aio-brain"},
    {"phrase": "open crm",          "type": "navigation", "target": "route:/crm"},
    {"phrase": "open forms",        "type": "navigation", "target": "route:/forms"},
    {"phrase": "open form builder",  "type": "navigation", "target": "route:/forms/builder"},
    {"phrase": "open flows",        "type": "navigation", "target": "route:/flows"},
    {"phrase": "open flow builder", "type": "navigation", "target": "route:/flows/builder"},
    {"phrase": "open media",        "type": "navigation", "target": "route:/media"},
    {"phrase": "open integrations", "type": "navigation", "target": "route:/integrations"},
    {"phrase": "open signals",      "type": "navigation", "target": "route:/signals"},
    {"phrase": "open comms",        "type": "navigation", "target": "route:/comms"},
    {"phrase": "open pipeline",     "type": "navigation", "target": "route:/pipeline"},
    {"phrase": "open orders",        "type": "navigation", "target": "route:/orders"},
    {"phrase": "open help",         "type": "navigation", "target": "route:/help"},
    {"phrase": "open contacts",     "type": "navigation", "target": "route:/crm"},
    # ── Workflow ─────────────────────────────────────────────────────
    {"phrase": "start postbot",         "type": "workflow", "target": "workflow:start_postbot"},
    {"phrase": "start script generator", "type": "workflow", "target": "workflow:start_script_generator"},
    {"phrase": "stop script generator", "type": "workflow", "target": "workflow:stop_script_generator"},
    {"phrase": "start podcast",         "type": "workflow", "target": "workflow:start_podcast"},
    # ── Staged ────────────────────────────────────────────────────────
    {"phrase": "send email",     "type": "staged", "target": "system:send_email"},
    {"phrase": "create image",   "type": "staged", "target": "system:create_image"},
    {"phrase": "create video",   "type": "staged", "target": "system:create_video"},
    {"phrase": "summarize",      "type": "staged", "target": "system:summarize"},
    {"phrase": "transcribe media", "type": "staged", "target": "system:transcribe_media"},
    # ── Confirmed ────────────────────────────────────────────────────
    {"phrase": "run flow",  "type": "confirmed", "target": "workflow:run_flow", "requiresPayload": True},
    {"phrase": "search contacts", "type": "navigation", "target": "route:/crm/search"},
]

_ROUTE_MAP: dict[str, str] = {
    "route:/aio-brain":      "aio-brain",
    "route:/crm":            "crm",
    "route:/crm/search":     "crm",
    "route:/forms":          "forms",
    "route:/forms/builder":  "forms",
    "route:/flows":          "flows",
    "route:/flows/builder":  "flows",
    "route:/media":          "media",
    "route:/studio":         "media",
    "route:/integrations":   "integrations",
    "route:/signals":        "signals",
    "route:/comms":          "comms",
    "route:/pipeline":       "pipeline",
    "route:/orders":         "orders",
    "route:/help":           "help",
}

_RESERVED_PHRASES: set[str] = {"stop", "escape", "cancel", "abort"}

_user_registry: list[dict[str, Any]] | None = None


def _load_registry() -> list[dict[str, Any]]:
    """Load user-editable registry from VTT_COMMANDS env var or defaults."""
    global _user_registry
    if _user_registry is not None:
        return _user_registry
    env_val = os.environ.get("VTT_COMMANDS", "")
    if env_val:
        phrases = [p.strip() for p in env_val.split(",") if p.strip()]
        _user_registry = [r for r in DEFAULT_REGISTRY if r["phrase"] in phrases]
    else:
        _user_registry = list(DEFAULT_REGISTRY)
    return _user_registry


def parse_command(raw: str) -> dict[str, Any]:
    """
    Parse raw transcript text through the command hierarchy.
    Returns {"type": "command", ...} or {"type": "conversational", "text": raw}.
    Exact match only. prefix match only when requiresPayload is True.
    """
    normalized = raw.strip().lower()
    if not normalized:
        return {"input": raw, "type": "conversational", "text": raw}

    if normalized in _RESERVED_PHRASES:
        for entry in DEFAULT_REGISTRY:
            if entry["phrase"] == normalized:
                return {
                    "input": raw,
                    "type": "command",
                    "commandType": entry.get("type"),
                    "action": entry.get("action"),
                    "result": entry.get("result"),
                    "response": entry.get("response"),
                    "phrase": entry.get("phrase"),
                    "target": entry.get("target"),
                    "matched": normalized,
                }
        return {"input": raw, "type": "conversational", "text": raw}

    registry = _load_registry()

    for entry in registry:
        phrase = entry["phrase"]
        requires_payload = entry.get("requiresPayload", False)
        if phrase == normalized:
            return {
                "input": raw,
                "type": "command",
                "commandType": entry.get("type"),
                "action": entry.get("action"),
                "result": entry.get("result"),
                "response": entry.get("response"),
                "phrase": entry.get("phrase"),
                "target": entry.get("target"),
                "matched": normalized,
            }
        if requires_payload and normalized.startswith(phrase + " "):
            payload = normalized[len(phrase) + 1:].strip()
            return {
                "input": raw,
                "type": "command",
                "commandType": entry.get("type"),
                "action": entry.get("action"),
                "result": entry.get("result"),
                "response": entry.get("response"),
                "phrase": entry.get("phrase"),
                "target": entry.get("target"),
                "matched": phrase,
                "payload": payload,
            }

    return {"input": raw, "type": "conversational", "text": raw}


def execute_command(parsed: dict[str, Any], tenant_id: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Execute a parsed command.
    Returns {"action": "navigate"|"system"|"workflow"|"confirmed"|"immediate"|"interrupt", ...}
    """
    if parsed.get("type") != "command":
        return {"action": "conversational", "text": parsed.get("input") or parsed.get("text", "")}

    cmd_type  = parsed.get("commandType", "")
    target    = parsed.get("target", "")
    phrase    = parsed.get("phrase") or parsed.get("matched") or parsed.get("input", "")
    payload   = parsed.get("payload")

    if cmd_type == "interrupt" or target == "system:stop":
        return {"action": "interrupt", "commandType": cmd_type, "phrase": phrase, "target": target}

    if cmd_type == "immediate" or target in ("ui:escape", "ui:cancel"):
        return {"action": "immediate", "commandType": cmd_type, "phrase": phrase, "target": target}

    if cmd_type == "navigation" and target.startswith("route:"):
        module = _ROUTE_MAP.get(target, "")
        return {"action": "navigate", "commandType": cmd_type, "phrase": phrase, "target": target, "module": module}

    if target.startswith("workflow:"):
        workflow_name = target.split(":", 1)[1] if ":" in target else ""
        return {
            "action": "confirmed" if cmd_type == "confirmed" else "workflow",
            "commandType": cmd_type,
            "phrase": phrase,
            "target": target,
            "workflowName": workflow_name,
            "payload": payload,
        }

    if cmd_type == "staged" and target.startswith("system:"):
        system_action = target.split(":", 1)[1] if ":" in target else ""
        return {"action": "staged", "commandType": cmd_type, "phrase": phrase, "target": target, "systemAction": system_action}

    return {"action": "unknown", "commandType": cmd_type, "phrase": phrase, "target": target}


def process_transcript(
    raw: str,
    tenant_id: str | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Main entry point. Parse then execute.
    Classifies input, stages high-impact actions, handles interruptions.
    """
    parsed   = parse_command(raw)
    executed = execute_command(parsed, tenant_id, context)
    key = _pending_action_key(tenant_id)

    if parsed.get("type") == "command":
        action = executed.get("action", "unknown")
        command_type = parsed.get("commandType")

        # Interrupt → immediate response
        if action in ("interrupt", "immediate"):
            _immediate_responses = {
                "ui:escape":   "Closed.",
                "ui:cancel":   "Canceled.",
                "system:test": "TEST IS GOOD.",
            }
            msg_map = {
                "interrupt": "Stopped.",
                "immediate": _immediate_responses.get(executed.get("target", ""), "Done."),
            }
            msg = msg_map.get(action, "Done.")
            return {
                "input": raw,
                "type": "command",
                "commandType": command_type,
                "action": action,
                "result": executed,
                "response": formatCharlieResponse(mode="interrupt", message=msg),
            }

        # High-impact → stage, request confirmation
        system_action = executed.get("systemAction", "")
        workflow_name = executed.get("workflowName", "")
        if system_action in _HIGH_IMPACT_ACTIONS or (workflow_name and action in ("workflow", "confirmed")):
            pending = {
                "raw": raw,
                "action": action,
                "commandType": command_type,
                "systemAction": system_action,
                "workflowName": workflow_name,
                "phrase": executed.get("phrase", ""),
                "parsed": parsed,
                "executed": executed,
            }
            _PENDING_ACTIONS[key] = pending
            confirmation_msg = _build_confirmation_message(executed)
            return {
                "input": raw,
                "type": "command",
                "commandType": command_type,
                "action": "staged",
                "result": executed,
                "response": formatCharlieResponse(mode="confirmation", message=confirmation_msg),
            }

        # Safe command → execute and return
        return {
            "input": raw,
            "type": "command",
            "commandType": command_type,
            "action": action,
            "result": executed,
            "response": formatCharlieResponse(mode="command", message=_build_execution_message(executed)),
        }

    # Conversational → check for quick responses first
    mode = _classify_input(raw)

    if mode == "assist":
        # Check for fast-path greetings
        normalized = raw.strip().lower()
        if normalized in QUICK_GREETINGS:
            return {
                "input": raw,
                "type": "conversational",
                "action": "conversational",
                "response": formatCharlieResponse(mode="assist", message=QUICK_GREETINGS[normalized]),
            }

    # Check pending action confirmation
    if mode == "confirmation":
        if key not in _PENDING_ACTIONS:
            return {
                "input": raw,
                "type": "conversational",
                "commandType": None,
                "action": "conversational",
                "result": {"success": False},
                "response": formatCharlieResponse(mode="confirmation", message="Nothing to confirm."),
            }
        pending = _PENDING_ACTIONS.pop(key)
        return {
            "input": raw,
            "type": "conversational",
            "commandType": pending.get("commandType"),
            "action": "confirmed_pending",
            "result": pending,
            "response": formatCharlieResponse(mode="result", message=_build_result_message(pending)),
        }

    return {
        "input":    raw,
        "type":     parsed.get("type", "unknown"),
        "commandType": parsed.get("commandType"),
        "matched":  parsed.get("matched"),
        "phrase":   parsed.get("phrase"),
        "payload":  parsed.get("payload"),
        "action":   executed.get("action", "unknown"),
        "result":   executed,
    }


def _build_execution_message(executed: dict[str, Any]) -> str:
    action = executed.get("action", "")
    phrase = executed.get("phrase", "")

    if action == "navigate":
        module = executed.get("module", "")
        return f"Opened {module.title()}."

    if action == "workflow":
        name = executed.get("workflowName", "")
        if name:
            return f"PostBot ready: {name}."
        return "Workflow ready."

    if action == "staged":
        sa = executed.get("systemAction", "")
        return f"Draft prepared. Confirm {sa.replace('_', ' ')}?"

    if action == "confirmed":
        return "Flow staged. Run now?"

    return f"Ready."


def _build_confirmation_message(executed: dict[str, Any]) -> str:
    action = executed.get("action", "")
    phrase = executed.get("phrase", "")

    if action == "staged":
        sa = executed.get("systemAction", "")
        return f"Draft ready. Confirm {sa.replace('_', ' ')}?"

    if action == "workflow":
        name = executed.get("workflowName", "")
        return f"Flow staged: {name}. Run now?"

    if action == "confirmed":
        return "Flow staged. Run now?"

    return "Draft ready. Confirm?"


def _build_result_message(pending: dict[str, Any]) -> str:
    phrase = (pending.get("phrase") or "").lower()

    if "email" in phrase:
        return "Sent."
    if "image" in phrase:
        return "Created."
    if "video" in phrase:
        return "Generated."
    if "flow" in phrase:
        return "Executed."

    return "Done."


def synthesize_voice(text: str, voice: str | None = None, tenant_id: str | None = None) -> str | None:
    """
    Synthesize text to audio via ElevenLabs. Returns an audio URL or None.
    Text must be <= 600 characters. Falls back gracefully on any error.
    """
    MAX_CHARS = 600
    if not text:
        return None

    import re
    # Strip markdown symbols and formatting artifacts (asterisks, underscores, hashes, backticks, brackets)
    text = re.sub(r'[*_#~>`\[\]{}]+', '', text).strip()

    if not text or len(text) > MAX_CHARS:
        return None

    try:
        import os
        import urllib.request
        import urllib.error
        import json
        from pathlib import Path

        provider = os.environ.get("TTS_PROVIDER", "elevenlabs").lower()
        async_key = os.environ.get("ASYNC_API_KEY") or get_async_api_key(tenant_id)

        # Auto-route if only one provider is configured in DB
        if async_key and provider != "async" and not get_elevenlabs_api_key(tenant_id):
            provider = "async"

        if (provider == "async" and async_key) or (async_key and provider == "async"):
            # Wire up async.com specifically
            url = "https://api.async.com/v1/text_to_speech"
            selected_async_voice = voice or get_async_voice_selection(tenant_id) or "announcer"
            body = json.dumps({
                "text": text,
                "voice": selected_async_voice
            }).encode("utf-8")

            req = urllib.request.Request(
                url, data=body,
                headers={
                    "x-api-key": async_key,
                    "version": "v1",
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                method="POST",
            )
        else:
            api_key = get_elevenlabs_api_key(tenant_id)
            if not api_key:
                return None

            VOICE_ID_MAP = {
                "rachel": "21m00Tcm4TlvDq8ikWAM",
                "domi":    "AZnzlk1XvdvUeBnXmlld",
                "bella":   "EXAVITQu4vr4xnSDxMaL",
                "adam":    "pNInz6obpgDQGcFmaJgB",
                "antoni":  "ErXwobaYiN019PkySvjV",
            }
            selected_voice = (voice or get_elevenlabs_voice_selection(tenant_id, purpose="charlie") or "Rachel").strip()
            voice_id = VOICE_ID_MAP.get(selected_voice.lower(), selected_voice or "21m00Tcm4TlvDq8ikWAM")

            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            body = json.dumps({
                "text": text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
            }).encode("utf-8")

            req = urllib.request.Request(
                url, data=body,
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                method="POST",
            )

        with urllib.request.urlopen(req, timeout=30) as resp:
            audio_bytes = resp.read()

        if not audio_bytes:
            return None

        audio_dir = Path(__file__).resolve().parent / "data" / "voice"
        audio_dir.mkdir(parents=True, exist_ok=True)
        import hashlib
        from datetime import datetime
        import hashlib
        token = hashlib.sha256(text.encode()).hexdigest()[:16]
        filename = f"vtt_{token}.mp3"
        (audio_dir / filename).write_bytes(audio_bytes)
        return f"/api/media/voice/{filename}"

    except Exception:
        return None





