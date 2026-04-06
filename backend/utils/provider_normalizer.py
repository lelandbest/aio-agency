from __future__ import annotations

import os
from typing import Any


def normalize_provider_key(key: str) -> str:
    if not key:
        return key
    import re
    key = key.strip()
    key = re.sub(r'([a-z9])([A-Z])', r'\1_\2', key).lower()
    key = key.replace("-", "_")
    if key in ("elevenlabs_tts", "elevenlabs_scribe", "elevenlabstts", "elevenlabsscribe", "elevenlabs"):
        return "elevenlabs"
    return key


def get_elevenlabs_api_key(tenant_id: str | None = None) -> str | None:
    env_key = os.getenv("ELEVENLABS_API_KEY") or os.getenv("ELEVEN_LABS_API_KEY")
    if env_key:
        return env_key
    
    if tenant_id:
        try:
            from backend.auth_store import get_auth_store
            auth_store = get_auth_store()
            config = auth_store.get_media_provider_config_by_provider_key(tenant_id, "elevenlabs")
            if config:
                api_key = config.get("apiKey") or config.get("api_key")
                if isinstance(api_key, str):
                    api_key = api_key.strip()
                return api_key or None
        except Exception:
            pass
    
    return None


def get_elevenlabs_voice_selection(tenant_id: str | None = None, *, purpose: str = "default") -> str | None:
    if not tenant_id:
        return None
    try:
        from backend.auth_store import get_auth_store
        auth_store = get_auth_store()
        config = auth_store.get_media_provider_config_by_provider_key(tenant_id, "elevenlabs")
        if not config:
            return None
        provider_config = config.get("config") if isinstance(config.get("config"), dict) else {}
        if purpose == "charlie":
            for key in ("charlieVoice", "voiceId", "voice"):
                value = provider_config.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        for key in ("voiceId", "voice", "charlieVoice"):
            value = provider_config.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    except Exception:
        return None
    return None


def resolve_elevenlabs_runtime_provider(tenant_id: str | None = None) -> str | None:
    key = get_elevenlabs_api_key(tenant_id)
    if key:
        return "elevenlabs"
    return None


def elevenlabs_status(tenant_id: str | None = None) -> str:
    config_key = get_elevenlabs_api_key(tenant_id)
    return "connected" if config_key else "needs_config"
