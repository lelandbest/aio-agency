from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field

from backend.deps import (
    clean_text,
    extract_session_token,
    get_auth_store,
    get_provider,
    require_capability,
    require_session,
)
from backend.oauth_connect import (
    GOOGLE_CALENDAR_SCOPE,
    GOOGLE_MAIL_SCOPE,
    MICROSOFT_CALENDAR_SCOPE,
    MICROSOFT_MAIL_SCOPE,
    backend_base_url,
    build_google_authorize_url,
    build_microsoft_authorize_url,
)
from backend.canonical_settings import apply_calendar_event_defaults, normalize_tenant_settings_payload
from backend.orchestration import emit_system_event
from backend.routes.auth import encode_oauth_state, oauth_callback_url

logger = logging.getLogger(__name__)

router = APIRouter(tags=["comms"])


# --- Request Models ---

class ThreadCreateRequest(BaseModel):
    subject: str
    channel_type: str = Field(default="email", alias="channelType")
    contact_id: str | None = Field(default=None, alias="contactId")
    company_id: str | None = Field(default=None, alias="companyId")
    body: str = ""
    status: str = "new"
    assignee: str = "ECHO"
    mailbox_id: str | None = Field(default=None, alias="mailboxId")

    model_config = ConfigDict(populate_by_name=True)


class ThreadOpenRequest(BaseModel):
    contact_id: str = Field(alias="contactId")
    channel_type: str = Field(default="email", alias="channelType")
    subject: str | None = None
    body: str = ""
    force_new: bool = Field(default=False, alias="forceNew")
    mailbox_id: str | None = Field(default=None, alias="mailboxId")

    model_config = ConfigDict(populate_by_name=True)


class ThreadMessageRequest(BaseModel):
    body: str
    channel_type: str | None = Field(default=None, alias="channelType")
    sender_name: str = Field(default="AIO Flow", alias="senderName")
    sender_email: str = Field(default="mission@aiocrm.local", alias="senderEmail")
    recipients: list[str] = []
    direction: str = "outbound"

    model_config = ConfigDict(populate_by_name=True)


class MailSendRequest(BaseModel):
    mailbox_id: str = Field(..., alias="mailboxId")
    body: str
    sender_name: str = Field(..., alias="senderName")
    sender_email: str = Field(..., alias="senderEmail")
    recipients: list[str] = []

    model_config = ConfigDict(populate_by_name=True)


class ThreadStatusRequest(BaseModel):
    status: str


class ThreadAssignRequest(BaseModel):
    assignee_name: str | None = Field(default=None, alias="assigneeName")
    assignee: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class ThreadMailboxRequest(BaseModel):
    mailbox_id: str = Field(alias="mailboxId")

    model_config = ConfigDict(populate_by_name=True)


class ThreadDraftRequest(BaseModel):
    mode: str = "reply"


class ThreadMeetingRequest(BaseModel):
    scheduled_at: str | None = Field(default=None, alias="scheduledAt")

    model_config = ConfigDict(populate_by_name=True)


class ThreadReportRequest(BaseModel):
    kind: str = "operator"


class MailboxCreateRequest(BaseModel):
    name: str
    address: str
    provider: str = "gmail-oauth"
    inbound_enabled: bool = Field(default=True, alias="inboundEnabled")
    outbound_enabled: bool = Field(default=True, alias="outboundEnabled")
    config: dict[str, Any] | None = None

    model_config = ConfigDict(populate_by_name=True)


class MailboxUpdateRequest(BaseModel):
    name: str | None = None
    address: str | None = None
    provider: str | None = None
    status: str | None = None
    inbound_enabled: bool | None = Field(default=None, alias="inboundEnabled")
    outbound_enabled: bool | None = Field(default=None, alias="outboundEnabled")
    last_synced_at: str | None = Field(default=None, alias="lastSyncedAt")
    config: dict[str, Any] | None = None

    model_config = ConfigDict(populate_by_name=True)


class CalendarEventUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    startTime: str | None = None
    endTime: str | None = None
    status: str | None = None
    locationType: str | None = None
    location: str | None = None
    meetingUrl: str | None = None


class CalendarPushRequest(BaseModel):
    source_id: str | None = Field(default=None, alias="sourceId")

    model_config = ConfigDict(populate_by_name=True)


class CalendarEventReconcileRequest(BaseModel):
    strategy: str


class CalendarSourceCreateRequest(BaseModel):
    name: str
    provider: str = "google-calendar-oauth"
    sync_direction: str = Field(default="two-way", alias="syncDirection")
    config: dict[str, Any] | None = None

    model_config = ConfigDict(populate_by_name=True)


class CalendarSourceUpdateRequest(BaseModel):
    name: str | None = None
    provider: str | None = None
    status: str | None = None
    sync_direction: str | None = Field(default=None, alias="syncDirection")
    last_synced_at: str | None = Field(default=None, alias="lastSyncedAt")
    config: dict[str, Any] | None = None

    model_config = ConfigDict(populate_by_name=True)


# --- Helper Functions ---

def booking_event_payload(event: dict[str, Any] | None) -> dict[str, Any]:
    event = event or {}
    return {
        "event_id": event.get("id"),
        "calendar_id": event.get("calendar_id"),
        "contact_id": event.get("contact_id"),
        "thread_id": event.get("thread_id"),
        "start_time": event.get("start_time"),
        "end_time": event.get("end_time"),
        "booking_type_id": event.get("booking_type_id"),
        "status": event.get("status"),
    }


def session_tenant_settings(tenant: dict[str, Any] | None) -> dict[str, Any]:
    tenant = tenant or {}
    candidate = tenant.get("tenant_settings") if isinstance(tenant.get("tenant_settings"), dict) else tenant.get("settings") or {}
    return normalize_tenant_settings_payload({"tenantSettings": candidate}, include_defaults=True)


def emit_booking_lifecycle_event(
    *,
    event_type: str,
    event: dict[str, Any],
    actor: dict[str, Any],
    tenant: dict[str, Any],
    provider_config: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    provider = get_provider()
    return emit_system_event(
        provider,
        {
            "type": event_type,
            "payload": booking_event_payload(event),
            "meta": {"depth": 0},
        },
        actor=actor,
        tenant=tenant,
        provider_config=provider_config,
    )


# --- Thread & Messaging Endpoints ---

@router.get("/api/comms/snapshot")
async def comms_snapshot(request: Request):
    require_capability(request, "comms.view", "Only authorized users can view the comms snapshot.")
    provider = get_provider()
    return provider.get_comms_snapshot()


@router.post("/api/comms/threads")
async def create_thread(request: Request, payload: ThreadCreateRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    return provider.create_thread(
        subject=payload.subject,
        channel_type=payload.channel_type,
        contact_id=payload.contact_id,
        company_id=payload.company_id,
        body=payload.body,
        status=payload.status,
        assignee=payload.assignee,
        mailbox_id=payload.mailbox_id,
    )


@router.post("/api/comms/threads/open")
async def open_thread(request: Request, payload: ThreadOpenRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    try:
        return provider.open_thread_for_contact(
            contact_id=payload.contact_id,
            channel_type=payload.channel_type,
            subject=payload.subject,
            body=payload.body,
            force_new=payload.force_new,
            mailbox_id=payload.mailbox_id,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/comms/threads/{thread_id}/messages")
async def send_thread_message(thread_id: str, request: Request, payload: ThreadMessageRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    return provider.send_thread_message(
        thread_id=thread_id,
        body=payload.body,
        channel_type=payload.channel_type,
        sender_name=payload.sender_name,
        sender_email=payload.sender_email,
        recipients=payload.recipients,
        direction=payload.direction,
    )


@router.post("/api/comms/threads/{thread_id}/send-email")
async def send_thread_email(thread_id: str, request: Request, payload: MailSendRequest):
    require_capability(request, "comms.operate", "Only workspace staff or higher can operate Comms.")
    try:
        from backend.comms_service import send_email_message
    except ImportError:
        from comms_service import send_email_message

    result = send_email_message(
        thread_id=thread_id,
        recipients=payload.recipients,
        subject="Email from Comms",
        body=payload.body,
        mailbox_id=payload.mailbox_id,
        sender_name=payload.sender_name,
        sender_email=payload.sender_email,
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Email delivery failed"))
    return result


@router.patch("/api/comms/threads/{thread_id}/status")
async def update_thread_status(thread_id: str, request: Request, payload: ThreadStatusRequest):
    require_capability(request, "comms.operate", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    return provider.update_thread_status(thread_id=thread_id, status=payload.status)


@router.patch("/api/comms/threads/{thread_id}/assign")
async def assign_thread(thread_id: str, request: Request, payload: ThreadAssignRequest):
    require_capability(request, "comms.operate", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    assignee_name = payload.assignee_name or payload.assignee
    if not assignee_name:
        raise HTTPException(status_code=422, detail="assignee_name is required")
    return provider.assign_thread(thread_id=thread_id, assignee_name=assignee_name)


@router.patch("/api/comms/threads/{thread_id}/mailbox")
async def update_thread_mailbox(thread_id: str, request: Request, payload: ThreadMailboxRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    return provider.update_thread_mailbox(thread_id=thread_id, mailbox_id=payload.mailbox_id)


@router.post("/api/comms/threads/{thread_id}/summarize")
async def summarize_thread(thread_id: str, request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    return provider.summarize_thread(thread_id=thread_id)


@router.post("/api/comms/threads/{thread_id}/draft")
async def create_thread_draft(thread_id: str, request: Request, payload: ThreadDraftRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    return provider.create_thread_draft(thread_id=thread_id, mode=payload.mode)


@router.post("/api/comms/threads/{thread_id}/create-deal")
async def create_deal_from_thread(thread_id: str, request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    try:
        return provider.create_deal_from_thread(thread_id=thread_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/comms/threads/{thread_id}/advance-stage")
async def advance_thread_stage(thread_id: str, request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    try:
        return provider.advance_thread_stage(thread_id=thread_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/comms/threads/{thread_id}/schedule-meeting")
async def schedule_thread_meeting(thread_id: str, request: Request, payload: ThreadMeetingRequest | None = None):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    auth_store = get_auth_store()
    try:
        existing_events = provider.list_calendar_events(thread_id=thread_id)
        response = provider.schedule_thread_meeting(thread_id=thread_id, scheduled_at=payload.scheduled_at if payload else None)
        refreshed_events = provider.list_calendar_events(thread_id=thread_id)
        linked_event = refreshed_events[0] if refreshed_events else None
        if linked_event:
            tenant = session.get("tenant") or {}
            user = session.get("user") or {}
            provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
            emit_booking_lifecycle_event(
                event_type="booking_created" if not existing_events else "booking_updated",
                event=linked_event,
                actor=user,
                tenant=tenant,
                provider_config=provider_config,
            )
        return response
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/comms/threads/{thread_id}/reports")
async def create_thread_report(thread_id: str, request: Request, payload: ThreadReportRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    try:
        return provider.create_thread_report(thread_id=thread_id, kind=payload.kind)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/comms/threads/{thread_id}")
async def delete_thread(thread_id: str, request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can operate Comms.")
    provider = get_provider()
    try:
        return provider.delete_thread(thread_id=thread_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


# --- SMS & VoIP Comms Routes ---

@router.get("/api/comms/overview")
async def get_comms_overview(request: Request):
    require_capability(request, "comms.view", "Only workspace members can view comms.")
    from backend.comms_service import get_comms_overview
    return {"data": get_comms_overview()}


@router.get("/api/comms/phone-numbers")
async def list_phone_numbers(request: Request):
    require_capability(request, "comms.view", "Only workspace members can view phone numbers.")
    from backend.comms_service import list_phone_numbers
    return {"data": list_phone_numbers()}


@router.post("/api/comms/phone-numbers")
async def create_phone_number(request: Request, payload: dict):
    require_capability(request, "comms.operate", "Only editors can manage phone numbers.")
    from backend.comms_service import create_phone_number
    return {"data": create_phone_number(
        number=payload.get("number"),
        display_label=payload.get("displayLabel"),
        owner=payload.get("owner"),
    )}


@router.patch("/api/comms/phone-numbers/{number_id}")
async def update_phone_number(number_id: str, request: Request, payload: dict):
    require_capability(request, "system.manage", "Only editors can update phone numbers.")
    from backend.comms_service import update_phone_number
    return {"data": update_phone_number(number_id, **payload)}


@router.delete("/api/comms/phone-numbers/{number_id}")
async def delete_phone_number(number_id: str, request: Request):
    require_capability(request, "system.manage", "Only editors can delete phone numbers.")
    from backend.comms_service import delete_phone_number
    delete_phone_number(number_id)
    return {"data": {"success": True}}


@router.get("/api/comms/sms-threads")
async def list_sms_threads(request: Request, limit: int = 50):
    require_capability(request, "system.view", "Only workspace members can view SMS threads.")
    from backend.comms_service import list_sms_threads
    return {"data": list_sms_threads(limit)}


@router.post("/api/comms/sms-threads")
async def create_sms_thread(request: Request, payload: dict):
    require_capability(request, "system.manage", "Only editors can create SMS threads.")
    from backend.comms_service import create_sms_thread
    return {"data": create_sms_thread(
        contact_id=payload.get("contactId"),
        phone_number_id=payload.get("phoneNumberId"),
        subject=payload.get("subject"),
    )}


@router.post("/api/comms/sms-threads/{thread_id}/messages")
async def add_sms_message(thread_id: str, request: Request, payload: dict):
    require_capability(request, "system.manage", "Only editors can send SMS messages.")
    from backend.comms_service import add_sms_message
    return {"data": add_sms_message(
        thread_id=thread_id,
        body=payload.get("body"),
        direction=payload.get("direction", "outbound"),
        sender_number=payload.get("senderNumber"),
        recipient_number=payload.get("recipientNumber"),
    )}


@router.get("/api/comms/sms-threads/{thread_id}")
async def get_sms_thread(thread_id: str, request: Request):
    require_capability(request, "system.view", "Only workspace members can view SMS threads.")
    from backend.comms_service import get_sms_thread
    return {"data": get_sms_thread(thread_id)}


@router.get("/api/comms/sms-threads/{thread_id}/messages")
async def get_sms_messages(thread_id: str, request: Request):
    require_capability(request, "system.view", "Only workspace members can view SMS messages.")
    from backend.comms_service import get_sms_messages
    return {"data": get_sms_messages(thread_id)}


@router.post("/api/comms/sms/send")
async def send_sms(request: Request, payload: dict):
    require_capability(request, "system.manage", "Only editors can send SMS messages.")
    from backend.comms_service import send_sms_message
    return {"data": send_sms_message(
        thread_id=payload.get("threadId"),
        phone_number=payload.get("phoneNumber"),
        body=payload.get("body"),
        from_number=payload.get("fromNumber"),
        contact_id=payload.get("contactId"),
    )}


@router.get("/api/comms/sms/opt-out-check")
async def check_opt_out(request: Request, phone_number: str):
    require_capability(request, "system.view", "Only workspace members can check opt-out status.")
    from backend.comms_service import check_opt_out
    return {"data": check_opt_out(phone_number)}


@router.get("/api/comms/contacts-with-phone")
async def get_contacts_with_phone(request: Request):
    require_capability(request, "system.view", "Only workspace members can view contacts.")
    from backend.comms_service import get_contacts_with_phone
    return {"data": get_contacts_with_phone()}


@router.get("/api/comms/sms-plans")
async def list_sms_plans(request: Request):
    require_capability(request, "system.view", "Only workspace members can view SMS plans.")
    from backend.comms_service import list_sms_plans
    return {"data": list_sms_plans()}


@router.post("/api/comms/sms-plans")
async def create_sms_plan(request: Request, payload: dict):
    require_capability(request, "comms.admin", "Only admins can create SMS plans.")
    from backend.comms_service import create_sms_plan
    return {"data": create_sms_plan(
        name=payload.get("name"),
        brand_name=payload.get("brandName"),
        campaign_type=payload.get("campaignType"),
    )}


@router.patch("/api/comms/sms-plans/{plan_id}")
async def update_sms_plan(plan_id: str, request: Request, payload: dict):
    require_capability(request, "system.admin", "Only admins can update SMS plans.")
    from backend.comms_service import update_sms_plan
    return {"data": update_sms_plan(plan_id, **payload)}


@router.get("/api/comms/extensions")
async def list_extensions(request: Request):
    require_capability(request, "system.view", "Only workspace members can view extensions.")
    from backend.comms_service import list_extensions
    return {"data": list_extensions()}


@router.post("/api/comms/extensions")
async def create_extension(request: Request, payload: dict):
    require_capability(request, "system.manage", "Only editors can create extensions.")
    from backend.comms_service import create_extension
    return {"data": create_extension(
        extension_number=payload.get("extensionNumber"),
        display_name=payload.get("displayName"),
        user_id=payload.get("userId"),
    )}


@router.get("/api/comms/ring-groups")
async def list_ring_groups(request: Request):
    require_capability(request, "system.view", "Only workspace members can view ring groups.")
    from backend.comms_service import list_ring_groups
    return {"data": list_ring_groups()}


@router.post("/api/comms/ring-groups")
async def create_ring_group(request: Request, payload: dict):
    require_capability(request, "system.manage", "Only editors can create ring groups.")
    from backend.comms_service import create_ring_group
    return {"data": create_ring_group(
        name=payload.get("name"),
        extensions=payload.get("extensions", []),
        ring_strategy=payload.get("ringStrategy", "simultaneous"),
    )}


@router.get("/api/comms/call-sessions")
async def list_call_sessions(request: Request, limit: int = 50):
    require_capability(request, "system.view", "Only workspace members can view call history.")
    from backend.comms_service import list_call_sessions
    return {"data": list_call_sessions(limit)}


@router.post("/api/comms/call-sessions")
async def create_call_session(request: Request, payload: dict):
    require_capability(request, "system.manage", "Only editors can create call sessions.")
    from backend.comms_service import create_call_session
    return {"data": create_call_session(
        direction=payload.get("direction", "outbound"),
        contact_id=payload.get("contactId"),
        phone_number_id=payload.get("phoneNumberId"),
    )}


@router.patch("/api/comms/call-sessions/{session_id}")
async def update_call_session(session_id: str, request: Request, payload: dict):
    require_capability(request, "system.manage", "Only editors can update call sessions.")
    from backend.comms_service import update_call_session
    return {"data": update_call_session(session_id, **payload)}


@router.post("/api/comms/calls/start")
async def start_outbound_call(request: Request, payload: dict):
    require_capability(request, "system.manage", "Only editors can initiate calls.")
    from backend.comms_service import start_outbound_call
    try:
        return {"data": start_outbound_call(
            phone_number=payload.get("phoneNumber"),
            from_number=payload.get("fromNumber"),
            contact_id=payload.get("contactId"),
            extension_id=payload.get("extensionId"),
        )}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/api/comms/calls/{call_id}/end")
async def end_call_session(call_id: str, request: Request, payload: dict):
    require_capability(request, "system.manage", "Only editors can end calls.")
    from backend.comms_service import end_call_session
    return {"data": end_call_session(
        call_id=call_id,
        disposition=payload.get("disposition"),
        duration_seconds=payload.get("durationSeconds"),
    )}


@router.get("/api/comms/calls/{call_id}")
async def get_call_session(call_id: str, request: Request):
    require_capability(request, "system.view", "Only workspace members can view call details.")
    from backend.comms_service import get_call_session
    return {"data": get_call_session(call_id)}


@router.get("/api/comms/routes")
async def get_routes(request: Request):
    require_capability(request, "system.view", "Only workspace members can view routes.")
    from backend.comms_service import get_routes_for_ui
    return {"data": get_routes_for_ui()}


@router.get("/api/comms/contact-summary/{contact_id}")
async def get_comms_contact_summary(request: Request, contact_id: str):
    require_capability(request, "system.view", "Only workspace members can view comms data.")
    try:
        from comms_integration import get_communication_summary_for_contact
        return {"data": get_communication_summary_for_contact(contact_id)}
    except ImportError:
        return {"data": {"contactId": contact_id, "smsThreadCount": 0, "callCount": 0, "lastSmsAt": None, "lastCallAt": None}}


@router.post("/api/comms/contact-activity")
async def create_comms_activity(request: Request, payload: dict[str, Any]):
    require_capability(request, "system.manage", "Only workspace staff or higher can create CRM activities.")
    from comms_integration import create_crm_activity_from_sms, create_crm_activity_from_call
    activity_type = payload.get("activityType", "")
    contact_id = payload.get("contactId")
    tenant_id = payload.get("tenantId", "default")
    if not contact_id:
        raise HTTPException(status_code=400, detail="contactId is required")
    if activity_type in ("sms_sent", "sms_received"):
        result = create_crm_activity_from_sms(
            tenant_id=tenant_id,
            contact_id=contact_id,
            thread_id=payload.get("threadId", ""),
            message_body=payload.get("messageBody", ""),
            direction="outbound" if activity_type == "sms_sent" else "inbound",
        )
        return {"data": result}
    elif activity_type in ("call_outbound", "call_inbound"):
        result = create_crm_activity_from_call(
            tenant_id=tenant_id,
            contact_id=contact_id,
            call_id=payload.get("callId", ""),
            direction="outbound" if activity_type == "call_outbound" else "inbound",
            duration_seconds=payload.get("durationSeconds"),
            disposition=payload.get("disposition"),
        )
        return {"data": result}
    else:
        raise HTTPException(status_code=400, detail=f"Unknown activity type: {activity_type}")


@router.get("/api/comms/integration-info")
async def get_comms_integration_info(request: Request):
    require_capability(request, "system.view", "Only workspace members can view integration info.")
    from comms_integration import COMMS_EVENT_TYPES, COMMS_ACTIVITY_TYPES, ARTIFACT_CLASSIFICATIONS
    from comms_service import get_provider_info
    from comms_providers import get_available_providers
    provider_info = get_provider_info()
    providers = get_available_providers()
    return {
        "data": {
            "eventTypes": COMMS_EVENT_TYPES,
            "activityTypes": COMMS_ACTIVITY_TYPES,
            "artifactClassifications": ARTIFACT_CLASSIFICATIONS,
            "providerStatus": provider_info.get("providerType", "stub"),
            "providerName": provider_info.get("providerName", "Stub"),
            "isProviderActive": provider_info.get("isActive", False),
            "providerHealthStatus": provider_info.get("healthStatus", "not_configured"),
            "availableProviders": providers,
            "crmIntegration": "ready",
            "signalsIntegration": "ready",
            "flowsTriggerReadiness": "bridge_only",
            "vaultCortexReadiness": "bridge_only",
        }
    }


@router.get("/api/comms/provider-configs")
async def list_comms_provider_configs(request: Request):
    require_capability(request, "integrations.view", "Only workspace members can view provider configs.")
    from comms_service import list_provider_configs
    return {"data": list_provider_configs()}


@router.post("/api/comms/verify-provider")
async def verify_comms_provider(request: Request, payload: dict[str, Any]):
    require_capability(request, "integrations.manage", "Only workspace staff or higher can verify provider config.")
    from comms_service import verify_provider_config
    provider_type = payload.get("providerType")
    config = payload.get("config", {})
    if not provider_type:
        raise HTTPException(status_code=400, detail="providerType is required")
    result = verify_provider_config(provider_type, config)
    if result.get("status") != "verified":
        raise HTTPException(status_code=400, detail=result.get("message", "Verification failed"))
    return {"data": result}


# --- Mailbox Endpoints ---

@router.get("/api/mailboxes")
async def list_mailboxes():
    provider = get_provider()
    return {"data": provider.list_mailboxes()}


@router.get("/api/mailboxes/providers")
async def list_mailbox_providers():
    provider = get_provider()
    return {"data": provider.get_mail_provider_catalog()}


@router.get("/api/mailboxes/{mailbox_id}/authorize")
async def authorize_mailbox(mailbox_id: str, request: Request):
    require_capability(request, "system.admin", "Only workspace admins can connect mailboxes.")
    provider = get_provider()
    mailbox = next((item for item in provider.list_mailboxes() if item["id"] == mailbox_id), None)
    if not mailbox:
        raise HTTPException(status_code=404, detail="Mailbox not found")

    config = mailbox.get("config") or {}
    tenant_id = clean_text(getattr(request.state, "tenant_id", None))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Workspace context is required before starting mailbox OAuth.")
    state = encode_oauth_state(
        {
            "kind": "mailbox",
            "resource_id": mailbox_id,
            "provider": mailbox.get("provider") or "",
            "tenant_id": tenant_id,
        }
    )
    redirect_uri = oauth_callback_url()

    if mailbox.get("provider") == "gmail-oauth":
        client_id = config.get("client_id")
        if not client_id:
            raise HTTPException(status_code=400, detail="Missing Google client_id in mailbox config")
        return RedirectResponse(build_google_authorize_url(client_id, redirect_uri, state, GOOGLE_MAIL_SCOPE))

    if mailbox.get("provider") == "microsoft365-oauth":
        client_id = config.get("client_id")
        if not client_id:
            raise HTTPException(status_code=400, detail="Missing Microsoft client_id in mailbox config")
        tenant_id = config.get("tenant_id") or "common"
        return RedirectResponse(build_microsoft_authorize_url(client_id, tenant_id, redirect_uri, state, MICROSOFT_MAIL_SCOPE))

    raise HTTPException(status_code=400, detail="This mail provider does not support OAuth connect")


@router.post("/api/mailboxes")
async def create_mailbox(request: Request, payload: MailboxCreateRequest):
    require_capability(request, "system.admin", "Only workspace admins can manage mailboxes.")
    provider = get_provider()
    try:
        return provider.create_mailbox(
            name=payload.name,
            address=payload.address,
            provider=payload.provider,
            inbound_enabled=payload.inbound_enabled,
            outbound_enabled=payload.outbound_enabled,
            config=payload.config,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/api/mailboxes/{mailbox_id}")
async def update_mailbox(mailbox_id: str, request: Request, payload: MailboxUpdateRequest):
    require_capability(request, "system.admin", "Only workspace admins can manage mailboxes.")
    provider = get_provider()
    try:
        return provider.update_mailbox(mailbox_id, payload.model_dump(exclude_unset=True))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/mailboxes/{mailbox_id}")
async def delete_mailbox(mailbox_id: str, request: Request, fallback_mailbox_id: str | None = None):
    require_capability(request, "system.admin", "Only workspace admins can manage mailboxes.")
    provider = get_provider()
    try:
        return provider.delete_mailbox(mailbox_id, fallback_mailbox_id=fallback_mailbox_id)
    except ValueError as error:
        detail = str(error)
        status_code = 400 if "last mailbox" in detail.lower() or "fallback mailbox" in detail.lower() else 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.post("/api/mailboxes/{mailbox_id}/disconnect")
async def disconnect_mailbox(mailbox_id: str, request: Request):
    require_capability(request, "system.admin", "Only workspace admins can manage mailboxes.")
    provider = get_provider()
    try:
        return {"mailbox": provider.disconnect_mailbox(mailbox_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# --- Calendar Endpoints ---

@router.get("/api/calendars")
async def list_calendars():
    provider = get_provider()
    return {"data": provider.list_calendars()}


@router.get("/api/calendar/events")
async def list_calendar_events():
    provider = get_provider()
    return {"data": provider.list_calendar_events()}


@router.post("/api/calendar/events")
async def create_calendar_event(request: Request, payload: dict[str, Any]):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can create calendar events.")
    provider = get_provider()
    auth_store = get_auth_store()
    try:
        tenant = session.get("tenant") or {}
        user = session.get("user") or {}
        created = provider.create_calendar_event(apply_calendar_event_defaults(payload, session_tenant_settings(tenant)))
        provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
        emit_booking_lifecycle_event(
            event_type="booking_created",
            event=created,
            actor=user,
            tenant=tenant,
            provider_config=provider_config,
        )
        return {"data": created}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/api/calendar/events/{event_id}")
async def update_calendar_event(event_id: str, request: Request, payload: CalendarEventUpdateRequest):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can update calendar events.")
    provider = get_provider()
    auth_store = get_auth_store()
    try:
        updated = provider.update_calendar_event(event_id, payload.model_dump(exclude_unset=True))
        tenant = session.get("tenant") or {}
        user = session.get("user") or {}
        provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
        emit_booking_lifecycle_event(
            event_type="booking_cancelled" if str(updated.get("status") or "").strip().lower() == "cancelled" else "booking_updated",
            event=updated,
            actor=user,
            tenant=tenant,
            provider_config=provider_config,
        )
        return updated
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/calendar/events/{event_id}")
async def delete_calendar_event(event_id: str, request: Request):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can delete calendar events.")
    provider = get_provider()
    auth_store = get_auth_store()
    try:
        existing_event = next((item for item in provider.list_calendar_events() if item.get("id") == event_id), None)
        provider.delete_calendar_event(event_id)
        if existing_event:
            tenant = session.get("tenant") or {}
            user = session.get("user") or {}
            provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
            emit_booking_lifecycle_event(
                event_type="booking_cancelled",
                event=existing_event,
                actor=user,
                tenant=tenant,
                provider_config=provider_config,
            )
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/calendar/events/{event_id}/push")
async def push_calendar_event(event_id: str, request: Request, payload: CalendarPushRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can push calendar events.")
    provider = get_provider()
    try:
        return provider.push_calendar_event(event_id, payload.source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/calendar/events/{event_id}/reconcile")
async def reconcile_calendar_event(event_id: str, request: Request, payload: CalendarEventReconcileRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can reconcile calendar events.")
    provider = get_provider()
    try:
        return provider.reconcile_calendar_event(event_id, payload.strategy)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/calendar/sources")
async def list_calendar_sources():
    provider = get_provider()
    return {"data": provider.list_calendar_sources()}


@router.get("/api/calendar/providers")
async def list_calendar_providers():
    provider = get_provider()
    return {"data": provider.get_calendar_provider_catalog()}


@router.get("/api/calendar/sources/{source_id}/authorize")
async def authorize_calendar_source(source_id: str, request: Request):
    require_capability(request, "system.admin", "Only workspace admins can connect calendar sources.")
    provider = get_provider()
    source = next((item for item in provider.list_calendar_sources() if item["id"] == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Calendar source not found")

    config = source.get("config") or {}
    tenant_id = clean_text(getattr(request.state, "tenant_id", None))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Workspace context is required before starting calendar OAuth.")
    state = encode_oauth_state(
        {
            "kind": "calendar",
            "resource_id": source_id,
            "provider": source.get("provider") or "",
            "tenant_id": tenant_id,
        }
    )
    redirect_uri = oauth_callback_url()

    if source.get("provider") in {"google-calendar-oauth", "google-meet-oauth"}:
        client_id = config.get("client_id")
        if not client_id:
            raise HTTPException(status_code=400, detail="Missing Google client_id in calendar source config")
        return RedirectResponse(build_google_authorize_url(client_id, redirect_uri, state, GOOGLE_CALENDAR_SCOPE))

    if source.get("provider") == "microsoft365-calendar":
        client_id = config.get("client_id")
        if not client_id:
            raise HTTPException(status_code=400, detail="Missing Microsoft client_id in calendar source config")
        tenant_id = config.get("tenant_id") or "common"
        return RedirectResponse(build_microsoft_authorize_url(client_id, tenant_id, redirect_uri, state, MICROSOFT_CALENDAR_SCOPE))

    raise HTTPException(status_code=400, detail="This calendar provider does not support OAuth connect")


@router.post("/api/calendar/sources")
async def create_calendar_source(request: Request, payload: CalendarSourceCreateRequest):
    require_capability(request, "system.admin", "Only workspace admins can manage calendar sources.")
    provider = get_provider()
    try:
        return provider.create_calendar_source(
            name=payload.name,
            provider=payload.provider,
            sync_direction=payload.sync_direction,
            config=payload.config,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/api/calendar/sources/{source_id}")
async def update_calendar_source(source_id: str, request: Request, payload: CalendarSourceUpdateRequest):
    require_capability(request, "system.admin", "Only workspace admins can manage calendar sources.")
    provider = get_provider()
    try:
        return provider.update_calendar_source(source_id, payload.model_dump(exclude_unset=True))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/calendar/sources/{source_id}/available-calendars")
async def list_calendar_source_calendars(source_id: str, request: Request):
    require_capability(request, "system.admin", "Only workspace admins can manage calendar sources.")
    provider = get_provider()
    try:
        return {"data": provider.list_calendar_source_calendars(source_id)}
    except ValueError as error:
        detail = str(error)
        status_code = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.delete("/api/calendar/sources/{source_id}")
async def delete_calendar_source(source_id: str, request: Request, fallback_source_id: str | None = None):
    require_capability(request, "system.admin", "Only workspace admins can manage calendar sources.")
    provider = get_provider()
    try:
        return provider.delete_calendar_source(source_id, fallback_source_id=fallback_source_id)
    except ValueError as error:
        detail = str(error)
        status_code = 400 if "fallback" in detail.lower() else 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.post("/api/calendar/sources/{source_id}/disconnect")
async def disconnect_calendar_source(source_id: str, request: Request):
    require_capability(request, "system.admin", "Only workspace admins can manage calendar sources.")
    provider = get_provider()
    try:
        return {"source": provider.disconnect_calendar_source(source_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/calendar/sources/{source_id}/test-connection")
async def test_calendar_source(source_id: str, request: Request):
    require_capability(request, "system.admin", "Only workspace admins can manage calendar sources.")
    provider = get_provider()
    try:
        return provider.test_calendar_source(source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/calendar/sources/{source_id}/sync")
async def sync_calendar_source(source_id: str, request: Request):
    require_capability(request, "system.admin", "Only workspace admins can manage calendar sources.")
    provider = get_provider()
    try:
        return provider.sync_calendar_source(source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/calendar/sources/{source_id}/import")
async def import_calendar_source(source_id: str, request: Request):
    require_capability(request, "system.admin", "Only workspace admins can manage calendar sources.")
    provider = get_provider()
    try:
        return provider.import_calendar_source(source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
