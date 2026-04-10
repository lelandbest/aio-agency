from typing import Any, Optional

"""
AIO MEDIA RENDER REGISTRY (BACKEND)
Canonical store for Remotion template definitions and selection logic.
"""

REMOTION_TEMPLATES = {
    "aio_base_vertical": {
        "templateId": "aio_base_vertical",
        "humanLabel": "AIO Base Vertical",
        "compositionId": "VideoComposition",
        "description": "Universal AIO vertical template with animated background, title, subtitle, and dynamic captions.",
        "supportedProps": ["title", "subtitle", "audioUrl", "transcript", "transcriptLines", "watermarkText", "themeVariant", "logoUrl"]
    },
    "aio_audiogram_vertical": {
        "templateId": "aio_audiogram_vertical",
        "humanLabel": "AIO Audiogram Vertical",
        "compositionId": "AudiogramComposition",
        "description": "Audio-first branded vertical social video with high-impact captions and animated waveform.",
        "supportedProps": ["title", "subtitle", "audioUrl", "transcriptLines", "watermarkText", "themeVariant", "logoUrl"]
    }
}

DEFAULT_TEMPLATE_ID = "aio_base_vertical"

def resolve_template(template_id: Optional[str]) -> dict[str, Any]:
    """
    Resolves a template ID to its full registry entry.
    If None is provided, returns the default template.
    Raises ValueError if an invalid templateId is provided.
    """
    if template_id is None or template_id == "":
        return REMOTION_TEMPLATES[DEFAULT_TEMPLATE_ID]
    
    if template_id not in REMOTION_TEMPLATES:
        # Check if it was passed as the raw compositionId for legacy support
        # We search for it in the registry first
        for key, entry in REMOTION_TEMPLATES.items():
            if entry["compositionId"] == template_id:
                return entry
                
        raise ValueError(f"Invalid templateId '{template_id}'. No such template registered in AIO.")
    
    return REMOTION_TEMPLATES[template_id]

def list_templates() -> list[dict[str, Any]]:
    """Returns all registered templates."""
    return list(REMOTION_TEMPLATES.values())
