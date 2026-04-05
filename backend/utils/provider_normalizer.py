from __future__ import annotations

import os
from typing import Any


def normalize_provider_key(key: str) -> str:
    if not key:
        return key
    import re
    key = key.strip()
    key = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', key).lower()
    key = key.replace("-", "_")
    if key in ("elevenlabs_tts", "elevenlabs_scribe", "elevenlabs"):
        return "elevenlabs"
    return key


def get_elevenlabs_api_key() -> str | None:
    return os.getenv("ELEVENLABS_API_KEY") or os.getenv("ELEVEN_LABS_API_KEY")


def resolve_elevenlabs_runtime_provider() -> str | None:
    key = get_elevenlabs_api_key()
    if key:
        return "elevenlabs"
    return None


def elevenlabs_status() -> str:
    config_key = get_elevenlabs_api_key()
    return "connected" if config_key else "needs_config"
