from typing import Any
from datetime import datetime, timezone

from backend.data_provider import create_provider, unique_suffix


def get_comms_overview() -> dict[str, Any]:
    provider = create_provider()
    return provider.get_comms_overview()


def list_phone_numbers() -> list[dict[str, Any]]:
    provider = create_provider()
    return provider.list_comms_phone_numbers()


def create_phone_number(number: str, display_label: str | None = None, owner: str | None = None) -> dict[str, Any]:
    provider = create_provider()
    return provider.create_comms_phone_number(number, display_label, owner)


def update_phone_number(id: str, **kwargs) -> dict[str, Any]:
    provider = create_provider()
    return provider.update_comms_phone_number(id, **kwargs)


def delete_phone_number(id: str) -> None:
    provider = create_provider()
    provider.delete_comms_phone_number(id)


def list_sms_threads(limit: int = 50) -> list[dict[str, Any]]:
    provider = create_provider()
    return provider.list_sms_threads(limit)


def create_sms_thread(contact_id: str | None = None, phone_number_id: str | None = None, subject: str | None = None) -> dict[str, Any]:
    provider = create_provider()
    return provider.create_sms_thread(contact_id, phone_number_id, subject)


def add_sms_message(thread_id: str, body: str, direction: str, sender_number: str | None = None, recipient_number: str | None = None) -> dict[str, Any]:
    from comms_integration import emit_sms_message_sent, emit_sms_message_failed
    provider = create_provider()
    result = provider.add_sms_message(thread_id, body, direction, sender_number, recipient_number)
    return result


def list_sms_plans() -> list[dict[str, Any]]:
    provider = create_provider()
    return provider.list_sms_plans()


def create_sms_plan(name: str, brand_name: str, campaign_type: str | None = None) -> dict[str, Any]:
    provider = create_provider()
    return provider.create_sms_plan(name, brand_name, campaign_type)


def update_sms_plan(id: str, **kwargs) -> dict[str, Any]:
    provider = create_provider()
    return provider.update_sms_plan(id, **kwargs)


def list_extensions() -> list[dict[str, Any]]:
    provider = create_provider()
    return provider.list_comms_extensions()


def create_extension(extension_number: str, display_name: str | None = None, user_id: str | None = None) -> dict[str, Any]:
    provider = create_provider()
    return provider.create_comms_extension(extension_number, display_name, user_id)


def list_ring_groups() -> list[dict[str, Any]]:
    provider = create_provider()
    return provider.list_comms_ring_groups()


def create_ring_group(name: str, extensions: list[str], ring_strategy: str = "simultaneous") -> dict[str, Any]:
    provider = create_provider()
    return provider.create_comms_ring_group(name, extensions, ring_strategy)


def list_call_sessions(limit: int = 50) -> list[dict[str, Any]]:
    provider = create_provider()
    return provider.list_call_sessions(limit)


def create_call_session(direction: str, contact_id: str | None = None, phone_number_id: str | None = None) -> dict[str, Any]:
    provider = create_provider()
    return provider.create_call_session(direction, contact_id, phone_number_id)


def update_call_session(id: str, **kwargs) -> dict[str, Any]:
    provider = create_provider()
    return provider.update_call_session(id, **kwargs)


def start_outbound_call(phone_number: str, from_number: str | None = None, contact_id: str | None = None, extension_id: str | None = None) -> dict[str, Any]:
    provider = create_provider()
    
    now = datetime.now(timezone.utc).isoformat()
    call_id = f"call-{unique_suffix()}"
    
    with provider._connect() as conn:
        conn.execute(
            """INSERT INTO call_sessions 
               (id, tenantId, contactId, phoneNumberId, extensionId, direction, status, startTime, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, 'simulated_ringing', ?, ?, ?)""",
            (call_id, provider._tenantId(), contact_id, None, extension_id, direction, now, now, now)
        )
        conn.commit()
    
    return dict(conn.execute("SELECT * FROM call_sessions WHERE id = ?", (call_id,)).fetchone())


def end_call_session(call_id: str, disposition: str | None = None, duration_seconds: int | None = None) -> dict[str, Any]:
    provider = create_provider()
    now = datetime.now(timezone.utc).isoformat()
    
    with provider._connect() as conn:
        conn.execute(
            "UPDATE call_sessions SET status = 'ended', endTime = ?, durationSeconds = ?, disposition = ?, updatedAt = ? WHERE id = ?",
            (now, duration_seconds, disposition or 'completed', now, call_id)
        )
        conn.commit()
    
    return dict(conn.execute("SELECT * FROM call_sessions WHERE id = ?", (call_id,)).fetchone())


def get_call_session(call_id: str) -> dict[str, Any]:
    provider = create_provider()
    with provider._connect() as conn:
        row = conn.execute("SELECT * FROM call_sessions WHERE id = ? AND tenantId = ?", (call_id, provider._tenantId())).fetchone()
        if not row:
            raise ValueError(f"Call session not found: {call_id}")
        return dict(row)


def get_routes_for_ui() -> dict[str, Any]:
    provider = create_provider()
    extensions = provider.list_comms_extensions()
    ring_groups = provider.list_comms_ring_groups()
    numbers = provider.list_comms_phone_numbers()
    return {"extensions": extensions, "ringGroups": ring_groups, "phoneNumbers": numbers}


def get_sms_thread(thread_id: str) -> dict[str, Any]:
    provider = create_provider()
    threads = provider.list_sms_threads(limit=1000)
    for thread in threads:
        if thread.get("id") == thread_id:
            return thread
    raise ValueError(f"Thread not found: {thread_id}")


def get_sms_messages(thread_id: str) -> list[dict[str, Any]]:
    provider = create_provider()
    with provider._connect() as conn:
        rows = conn.execute(
            "SELECT * FROM sms_messages WHERE tenantId = ? AND threadId = ? ORDER BY createdAt ASC",
            (provider._tenantId(), thread_id)
        ).fetchall()
        return [dict(row) for row in rows]


def check_opt_out(phone_number: str) -> dict[str, Any]:
    provider = create_provider()
    with provider._connect() as conn:
        opt_out_keywords = ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]
        result = conn.execute(
            "SELECT m.body, m.direction, m.createdAt FROM sms_messages m WHERE m.senderNumber = ? OR m.recipientNumber = ? ORDER BY m.createdAt DESC LIMIT 10",
            (phone_number, phone_number)
        ).fetchall()
        for row in result:
            msg_body = (row["body"] or "").upper()
            if any(kw in msg_body for kw in opt_out_keywords):
                return {"opted_out": True, "keyword": next(kw for kw in opt_out_keywords if kw in msg_body)}
    return {"opted_out": False}


def send_sms_message(thread_id: str | None, phone_number: str, body: str, from_number: str | None = None, contact_id: str | None = None) -> dict[str, Any]:
    provider = create_provider()
    
    opt_out_check = check_opt_out(phone_number)
    if opt_out_check.get("opted_out"):
        return {
            "success": False,
            "error": "Phone number has opted out",
            "reason": f"Keyword '{opt_out_check.get('keyword')}' detected"
        }
    
    if not thread_id:
        thread = provider.create_sms_thread(contact_id=contact_id, phone_number_id=None, subject=f"SMS with {phone_number}")
        thread_id = thread["id"]
    
    message = provider.add_sms_message(
        thread_id=thread_id,
        body=body,
        direction="outbound",
        sender_number=from_number,
        recipient_number=phone_number
    )
    
    provider.update_sms_message_status(message["id"], "simulated")
    
    return {"success": True, "thread_id": thread_id, "message_id": message["id"], "status": "simulated"}


def get_contacts_with_phone() -> list[dict[str, Any]]:
    provider = create_provider()
    with provider._connect() as conn:
        rows = conn.execute(
            "SELECT id, firstName, lastName, phone FROM contacts WHERE tenantId = ? AND phone IS NOT NULL AND phone != '' ORDER BY lastName",
            (provider._tenantId(),)
        ).fetchall()
        return [dict(row) for row in rows]