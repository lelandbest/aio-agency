"""
AIO Nexus — Modular Route Package
Exposes domain routers for the modern local-first neural appliance.
"""

from backend.routes.ai import router as ai_router
from backend.routes.auth import router as auth_router
from backend.routes.comms import router as comms_router
from backend.routes.cortex import router as cortex_router
from backend.routes.crm import router as crm_router
from backend.routes.flows import router as flows_router
from backend.routes.media import router as media_router
from backend.routes.pocket import router as pocket_router
from backend.routes.signals import router as signals_router
from backend.routes.system import router as system_router

__all__ = [
    "ai_router",
    "auth_router",
    "comms_router",
    "cortex_router",
    "crm_router",
    "flows_router",
    "media_router",
    "pocket_router",
    "signals_router",
    "system_router",
]
