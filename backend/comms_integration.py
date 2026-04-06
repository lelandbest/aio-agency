from typing import Any
from datetime import datetime, timezone
from backend.data_provider import create_provider


COMMS_EVENT_TYPES = [
    "sms_received",
    "sms_thread_created",
    "sms_message_sent",
    "sms_message_failed",
    "sms_opt_out_detected",
    "call_session_started",
    "call_session_ended",
    "call_session_failed",
    "recording_linked",
    "transcript_linked",
]

COMMS_ACTIVITY_TYPES = [
    "sms_sent",
    "sms_received",
    "call_outbound",
    "call_inbound",
]

ARTIFACT_CLASSIFICATIONS = {
    "sms_thread": {
        "vault_ready": True,
        "cortex_ready": False,
        "artifact_type": "sms_thread",
    },
    "sms_message": {
        "vault_ready": True,
        "cortex_ready": False,
        "artifact_type": "sms_message",
    },
    "call_recording": {
        "vault_ready": True,
        "cortex_ready": False,
        "artifact_type": "recording",
    },
    "call_transcript": {
        "vault_ready": True,
        "cortex_ready": False,
        "artifact_type": "transcript",
    },
    "call_summary": {
        "vault_ready": False,
        "cortex_ready": True,
        "artifact_type": "summary",
    },
}


class CommsEvent:
    def __init__(
        self,
        event_type: str,
        tenant_id: str,
        contact_id: str | None = None,
        thread_id: str | None = None,
        message_id: str | None = None,
        call_id: str | None = None,
        phone_number: str | None = None,
        direction: str | None = None,
        status: str | None = None,
        metadata: dict[str, Any] | None = None,
    ):
        self.event_type = event_type
        self.tenant_id = tenant_id
        self.contact_id = contact_id
        self.thread_id = thread_id
        self.message_id = message_id
        self.call_id = call_id
        self.phone_number = phone_number
        self.direction = direction
        self.status = status
        self.metadata = metadata or {}
        self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict[str, Any]:
        return {
            "eventType": self.event_type,
            "tenantId": self.tenant_id,
            "contactId": self.contact_id,
            "threadId": self.thread_id,
            "messageId": self.message_id,
            "callId": self.call_id,
            "phoneNumber": self.phone_number,
            "direction": self.direction,
            "status": self.status,
            "metadata": self.metadata,
            "timestamp": self.timestamp,
        }


class CommsArtifact:
    def __init__(
        self,
        artifact_id: str,
        artifact_type: str,
        tenant_id: str,
        contact_id: str | None = None,
        thread_id: str | None = None,
        call_id: str | None = None,
        raw: bool = True,
        metadata: dict[str, Any] | None = None,
    ):
        self.artifact_id = artifact_id
        self.artifact_type = artifact_type
        self.tenant_id = tenant_id
        self.contact_id = contact_id
        self.thread_id = thread_id
        self.call_id = call_id
        self.raw = raw
        self.metadata = metadata or {}
        
        classification = ARTIFACT_CLASSIFICATIONS.get(artifact_type, {})
        self.vault_ready = classification.get("vault_ready", False)
        self.cortex_ready = classification.get("cortex_ready", False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "artifactId": self.artifact_id,
            "artifactType": self.artifact_type,
            "tenantId": self.tenant_id,
            "contactId": self.contact_id,
            "threadId": self.thread_id,
            "callId": self.call_id,
            "raw": self.raw,
            "vaultReady": self.vault_ready,
            "cortexReady": self.cortex_ready,
            "metadata": self.metadata,
        }


class CommsFlowTrigger:
    def __init__(
        self,
        trigger_type: str,
        tenant_id: str,
        contact_id: str | None = None,
        thread_id: str | None = None,
        call_id: str | None = None,
        phone_number: str | None = None,
        direction: str | None = None,
        payload: dict[str, Any] | None = None,
    ):
        self.trigger_type = trigger_type
        self.tenant_id = tenant_id
        self.contact_id = contact_id
        self.thread_id = thread_id
        self.call_id = call_id
        self.phone_number = phone_number
        self.direction = direction
        self.payload = payload or {}
        self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict[str, Any]:
        return {
            "triggerType": self.trigger_type,
            "tenantId": self.tenant_id,
            "contactId": self.contact_id,
            "threadId": self.thread_id,
            "callId": self.call_id,
            "phoneNumber": self.phone_number,
            "direction": self.direction,
            "payload": self.payload,
            "timestamp": self.timestamp,
        }


def emit_sms_received(
    tenant_id: str,
    thread_id: str,
    message_id: str,
    contact_id: str | None = None,
    phone_number: str | None = None,
    body: str | None = None,
) -> CommsEvent:
    return CommsEvent(
        event_type="sms_received",
        tenant_id=tenant_id,
        contact_id=contact_id,
        thread_id=thread_id,
        message_id=message_id,
        phone_number=phone_number,
        direction="inbound",
        status="received",
        metadata={"body": body} if body else {},
    )


def emit_sms_thread_created(
    tenant_id: str,
    thread_id: str,
    contact_id: str | None = None,
    phone_number: str | None = None,
) -> CommsEvent:
    return CommsEvent(
        event_type="sms_thread_created",
        tenant_id=tenant_id,
        contact_id=contact_id,
        thread_id=thread_id,
        phone_number=phone_number,
        status="created",
    )


def emit_sms_message_sent(
    tenant_id: str,
    thread_id: str,
    message_id: str,
    contact_id: str | None = None,
    phone_number: str | None = None,
) -> CommsEvent:
    return CommsEvent(
        event_type="sms_message_sent",
        tenant_id=tenant_id,
        contact_id=contact_id,
        thread_id=thread_id,
        message_id=message_id,
        phone_number=phone_number,
        direction="outbound",
        status="sent",
    )


def emit_sms_message_failed(
    tenant_id: str,
    thread_id: str,
    message_id: str,
    error_message: str,
    contact_id: str | None = None,
    phone_number: str | None = None,
) -> CommsEvent:
    return CommsEvent(
        event_type="sms_message_failed",
        tenant_id=tenant_id,
        contact_id=contact_id,
        thread_id=thread_id,
        message_id=message_id,
        phone_number=phone_number,
        direction="outbound",
        status="failed",
        metadata={"error": error_message},
    )


def emit_sms_opt_out_detected(
    tenant_id: str,
    phone_number: str,
    keyword: str,
) -> CommsEvent:
    return CommsEvent(
        event_type="sms_opt_out_detected",
        tenant_id=tenant_id,
        phone_number=phone_number,
        status="detected",
        metadata={"keyword": keyword},
    )


def emit_call_session_started(
    tenant_id: str,
    call_id: str,
    contact_id: str | None = None,
    phone_number: str | None = None,
    direction: str | None = None,
) -> CommsEvent:
    return CommsEvent(
        event_type="call_session_started",
        tenant_id=tenant_id,
        contact_id=contact_id,
        call_id=call_id,
        phone_number=phone_number,
        direction=direction,
        status="started",
    )


def emit_call_session_ended(
    tenant_id: str,
    call_id: str,
    contact_id: str | None = None,
    phone_number: str | None = None,
    duration_seconds: int | None = None,
    disposition: str | None = None,
) -> CommsEvent:
    return CommsEvent(
        event_type="call_session_ended",
        tenant_id=tenant_id,
        contact_id=contact_id,
        call_id=call_id,
        phone_number=phone_number,
        status="ended",
        metadata={"durationSeconds": duration_seconds, "disposition": disposition},
    )


def emit_call_session_failed(
    tenant_id: str,
    call_id: str,
    error_message: str,
    contact_id: str | None = None,
    phone_number: str | None = None,
) -> CommsEvent:
    return CommsEvent(
        event_type="call_session_failed",
        tenant_id=tenant_id,
        contact_id=contact_id,
        call_id=call_id,
        phone_number=phone_number,
        status="failed",
        metadata={"error": error_message},
    )


def emit_recording_linked(
    tenant_id: str,
    call_id: str,
    recording_url: str,
    contact_id: str | None = None,
) -> CommsEvent:
    return CommsEvent(
        event_type="recording_linked",
        tenant_id=tenant_id,
        contact_id=contact_id,
        call_id=call_id,
        status="linked",
        metadata={"recordingUrl": recording_url},
    )


def emit_transcript_linked(
    tenant_id: str,
    call_id: str,
    transcript_url: str,
    contact_id: str | None = None,
) -> CommsEvent:
    return CommsEvent(
        event_type="transcript_linked",
        tenant_id=tenant_id,
        contact_id=contact_id,
        call_id=call_id,
        status="linked",
        metadata={"transcriptUrl": transcript_url},
    )


def create_crm_activity_from_sms(
    tenant_id: str,
    contact_id: str,
    thread_id: str,
    message_body: str,
    direction: str,
) -> dict[str, Any]:
    provider = create_provider()
    activity_payload = {
        "activityType": "sms_sent" if direction == "outbound" else "sms_received",
        "title": f"SMS {'sent to' if direction == 'outbound' else 'received from'} contact",
        "description": message_body[:200] + ("..." if len(message_body) > 200 else ""),
        "metadata": {
            "threadId": thread_id,
            "direction": direction,
        },
    }
    return provider.create_contact_activity(contact_id, activity_payload)


def create_crm_activity_from_call(
    tenant_id: str,
    contact_id: str,
    call_id: str,
    direction: str,
    duration_seconds: int | None = None,
    disposition: str | None = None,
) -> dict[str, Any]:
    provider = create_provider()
    activity_payload = {
        "activityType": "call_outbound" if direction == "outbound" else "call_inbound",
        "title": f"{'Outbound' if direction == 'outbound' else 'Inbound'} call",
        "description": f"Call duration: {duration_seconds or 0}s, Disposition: {disposition or 'unknown'}",
        "metadata": {
            "callId": call_id,
            "direction": direction,
            "durationSeconds": duration_seconds,
            "disposition": disposition,
        },
    }
    return provider.create_contact_activity(contact_id, activity_payload)


def classify_artifact(
    artifact_id: str,
    artifact_type: str,
    tenant_id: str,
    contact_id: str | None = None,
    thread_id: str | None = None,
    call_id: str | None = None,
    raw: bool = True,
    metadata: dict[str, Any] | None = None,
) -> CommsArtifact:
    return CommsArtifact(
        artifact_id=artifact_id,
        artifact_type=artifact_type,
        tenant_id=tenant_id,
        contact_id=contact_id,
        thread_id=thread_id,
        call_id=call_id,
        raw=raw,
        metadata=metadata,
    )


def get_flow_trigger_from_event(event: CommsEvent) -> CommsFlowTrigger | None:
    event_to_trigger_map = {
        "sms_received": "sms_inbound",
        "sms_thread_created": "sms_inbound" if event.direction == "inbound" else "sms_outbound",
        "sms_message_sent": "sms_outbound",
        "sms_message_failed": "sms_failed",
        "sms_opt_out_detected": "sms_opt_out",
        "call_session_started": "call_started",
        "call_session_ended": "call_ended",
        "call_session_failed": "call_failed",
    }
    
    trigger_type = event_to_trigger_map.get(event.event_type)
    if not trigger_type:
        return None
    
    return CommsFlowTrigger(
        trigger_type=trigger_type,
        tenant_id=event.tenant_id,
        contact_id=event.contact_id,
        thread_id=event.thread_id,
        call_id=event.call_id,
        phone_number=event.phone_number,
        direction=event.direction,
        payload=event.metadata,
    )


def get_communication_summary_for_contact(contact_id: str) -> dict[str, Any]:
    provider = create_provider()
    
    threads = provider.list_sms_threads(limit=1000)
    contact_threads = [t for t in threads if t.get("contactId") == contact_id]
    
    sessions = provider.list_call_sessions(limit=1000)
    contact_sessions = [s for s in sessions if s.get("contactId") == contact_id]
    
    return {
        "contactId": contact_id,
        "smsThreadCount": len(contact_threads),
        "callCount": len(contact_sessions),
        "lastSmsAt": contact_threads[0].get("lastMessageAt") if contact_threads else None,
        "lastCallAt": contact_sessions[0].get("startTime") if contact_sessions else None,
    }
