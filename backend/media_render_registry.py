from typing import Any, Optional

"""
AIO MEDIA RENDER REGISTRY (BACKEND)
Canonical store for Remotion template definitions and selection logic.
"""

REMOTION_TEMPLATES = {
    "aio_916": {
        "templateId": "aio_916",
        "humanLabel": "AIO 9:16",
        "compositionId": "VideoComposition",
        "description": "Universal AIO vertical template with animated background, title, subtitle, and dynamic captions.",
        "supportedProps": ["title", "subtitle", "audioUrl", "transcript", "transcriptLines", "watermarkText", "themeVariant", "logoUrl", "images", "videoClips"]
    },
    "aio_11": {
        "templateId": "aio_11",
        "humanLabel": "AIO 1:1",
        "compositionId": "AudiogramComposition",
        "description": "Audio-first branded square social video with high-impact captions and animated waveform.",
        "supportedProps": ["title", "subtitle", "audioUrl", "transcriptLines", "watermarkText", "themeVariant", "logoUrl", "images", "videoClips"]
    },
    "bltv_169": {
        "templateId": "bltv_169",
        "humanLabel": "BLTV 16:9",
        "compositionId": "BLTVLandscapeComposition",
        "description": "Broadcast-style BLTV landscape template for YouTube-ready production output.",
        "supportedProps": ["title", "subtitle", "audioUrl", "transcript", "transcriptLines", "watermarkText", "themeVariant", "logoUrl", "images", "videoClips"]
    }
}

DEFAULT_TEMPLATE_ID = "aio_916"

def resolve_template(template_id: Optional[str]) -> dict[str, Any]:
    """
    Resolves a template ID to its full registry entry.
    If None is provided, returns the default template.
    Raises ValueError if an invalid templateId is provided.
    """
    if template_id is None or template_id == "":
        return REMOTION_TEMPLATES[DEFAULT_TEMPLATE_ID]
    
    if template_id not in REMOTION_TEMPLATES:
        raise ValueError(f"Invalid templateId '{template_id}'. No such template registered in AIO.")
    
    return REMOTION_TEMPLATES[template_id]

def list_templates() -> list[dict[str, Any]]:
    """Returns all registered templates."""
    return list(REMOTION_TEMPLATES.values())
