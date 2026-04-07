from typing import Any
from datetime import datetime, timezone

from backend.data_provider import create_provider, unique_suffix
from comms_providers import (
    create_provider_adapter,
    ProviderConfig,
    StubProviderAdapter,
    get_available_providers,
)


_active_adapter: Any = None
_active_provider_type: str = "stub"


def _get_active_adapter() -> Any:
    """Get or create the active provider adapter."""
    global _active_adapter, _active_provider_type
    
    provider = create_provider()
    tenant_id = provider._tenantId()
    
    with provider._connect() as conn:
        row = conn.execute(
            "SELECT providerType, configJson FROM comms_provider_configs WHERE tenantId = ? AND isActive = 1 LIMIT 1",
            (tenant_id,)
        ).fetchone()
    
    if row:
        provider_type = row["providerType"]
        config_json = row["configJson"]
        
        if config_json:
            import json
            try:
                config_data = json.loads(config_json)
            except:
                config_data = {}
        else:
            config_data = {}
        
        if provider_type != _active_provider_type or _active_adapter is None:
            _active_provider_type = provider_type
            config = ProviderConfig(**config_data)
            _active_adapter = create_provider_adapter(provider_type, config, tenant_id)
    else:
        _active_provider_type = "stub"
        _active_adapter = StubProviderAdapter(ProviderConfig(), tenant_id)
    
    return _active_adapter


def _refresh_active_adapter() -> None:
    """Force refresh of the active adapter."""
    global _active_adapter, _active_provider_type
    _active_adapter = None
    _active_provider_type = "stub"


def get_provider_info() -> dict[str, Any]:
    """Get current provider information."""
    adapter = _get_active_adapter()
    return {
        "providerType": adapter.provider_type,
        "providerName": adapter.provider_name,
        "isActive": adapter.provider_type != "stub",
    }


def list_provider_configs() -> list[dict[str, Any]]:
    """List all provider configurations."""
    provider = create_provider()
    tenant_id = provider._tenantId()
    
    with provider._connect() as conn:
        rows = conn.execute(
            "SELECT * FROM comms_provider_configs WHERE tenantId = ?",
            (tenant_id,)
        ).fetchall()
    
    results = []
    for row in rows:
        result = dict(row)
        if result.get("configJson"):
            import json
            try:
                config = json.loads(result["configJson"])
                result["hasConfig"] = bool(config.get("api_key") or config.get("api_secret"))
                result["configJson"] = json.dumps({k: v for k, v in config.items() if k in ("api_key", "api_secret")})
            except:
                result["hasConfig"] = False
        results.append(result)
    
    return results


def save_provider_config(
    provider_type: str,
    config: dict[str, Any],
    is_active: bool = False,
) -> dict[str, Any]:
    """Save provider configuration."""
    import json
    
    provider = create_provider()
    tenant_id = provider._tenantId()
    now = datetime.now(timezone.utc).isoformat()
    config_id = f"provider-{provider_type}-{tenant_id}"
    
    with provider._connect() as conn:
        existing = conn.execute(
            "SELECT id FROM comms_provider_configs WHERE id = ?",
            (config_id,)
        ).fetchone()
        
        if existing:
            conn.execute(
                """UPDATE comms_provider_configs 
                   SET configJson = ?, isActive = ?, updatedAt = ?
                   WHERE id = ?""",
                (json.dumps(config), 1 if is_active else 0, now, config_id)
            )
        else:
            conn.execute(
                """INSERT INTO comms_provider_configs 
                   (id, tenantId, providerType, providerName, configJson, status, isActive, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, 'configured', ?, ?, ?)""",
                (config_id, tenant_id, provider_type, provider_type.title(), json.dumps(config), 1 if is_active else 0, now, now)
            )
        
        if is_active:
            conn.execute(
                "UPDATE comms_provider_configs SET isActive = 0 WHERE tenantId = ? AND id != ?",
                (tenant_id, config_id)
            )
        
        conn.commit()
    
    _refresh_active_adapter()
    
    return {"id": config_id, "providerType": provider_type, "isActive": is_active}


def delete_provider_config(provider_type: str) -> None:
    """Delete provider configuration."""
    provider = create_provider()
    tenant_id = provider._tenantId()
    config_id = f"provider-{provider_type}-{tenant_id}"
    
    with provider._connect() as conn:
        conn.execute("DELETE FROM comms_provider_configs WHERE id = ?", (config_id,))
        conn.commit()
    
    _refresh_active_adapter()


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


def _dispatch_signal_event(event: Any) -> None:
    """Route comms event into existing signal → ExecutionEngine pathway."""
    try:
        from orchestration import emit_system_event
        signal_event = {
            "type": event.event_type,
            "payload": event.to_dict(),
            "meta": {"depth": 0, "source": "comms"},
        }
        provider = create_provider()
        emit_system_event(provider, signal_event)
    except Exception:
        pass


def add_sms_message(thread_id: str, body: str, direction: str, sender_number: str | None = None, recipient_number: str | None = None) -> dict[str, Any]:
    from comms_integration import emit_sms_message_sent, emit_sms_message_failed, emit_sms_received
    provider = create_provider()
    result = provider.add_sms_message(thread_id, body, direction, sender_number, recipient_number)
    
    message_id = result.get("id", "")
    thread = provider.list_sms_threads(limit=1000)
    thread_data = next((t for t in thread if t.get("id") == thread_id), {})
    contact_id = thread_data.get("contactId")
    tenant_id = provider._tenantId()
    
    if direction == "inbound":
        event = emit_sms_received(
            tenant_id=tenant_id,
            thread_id=thread_id,
            message_id=message_id,
            contact_id=contact_id,
            phone_number=sender_number,
        )
        _dispatch_signal_event(event)
    elif direction == "outbound":
        event = emit_sms_message_sent(
            tenant_id=tenant_id,
            thread_id=thread_id,
            message_id=message_id,
            contact_id=contact_id,
            phone_number=recipient_number,
        )
        _dispatch_signal_event(event)
    
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
    from comms_providers import CallStartRequest
    
    provider = create_provider()
    adapter = _get_active_adapter()
    tenant_id = provider._tenantId()
    
    call_request = CallStartRequest(
        to_number=phone_number,
        from_number=from_number or "",
        contact_id=contact_id,
        phone_number_id=None,
        extension_id=extension_id,
    )
    
    result = adapter.start_call(call_request)
    
    now = datetime.now(timezone.utc).isoformat()
    call_id = result.call_id or f"call-{unique_suffix()}"
    
    status = result.status if result.success else "failed"
    
    with provider._connect() as conn:
        conn.execute(
            """INSERT INTO call_sessions 
               (id, tenantId, contactId, phoneNumberId, extensionId, direction, status, startTime, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (call_id, tenant_id, contact_id, None, extension_id, "outbound", status, now, now, now)
        )
        conn.commit()
    
    return dict(conn.execute("SELECT * FROM call_sessions WHERE id = ?", (call_id,)).fetchone())


def end_call_session(call_id: str, disposition: str | None = None, duration_seconds: int | None = None) -> dict[str, Any]:
    from comms_providers import CallEndResult
    
    provider = create_provider()
    adapter = _get_active_adapter()
    now = datetime.now(timezone.utc).isoformat()
    
    if adapter.provider_type != "stub":
        end_result = adapter.end_call(call_id)
        if not end_result.success:
            disposition = "provider_error"
    
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


def send_sms_message(thread_id: str | None, phone_number: str, body: str, from_number: str | None = None, contact_id: str | None = None, execution_context: bool = False) -> dict[str, Any]:
    """Send SMS — must be called via ExecutionEngine.
    
    execution_context=True when called from ExecutionEngine._send_sms.
    Direct invocation without execution_context is rejected.
    """
    if not execution_context:
        return {
            "success": False,
            "error": "SMS must be sent via ExecutionEngine. Use action_type: send_sms in a flow.",
            "reason": "execution_context_required"
        }
    
    from comms_providers import SmsSendRequest
    from comms_integration import emit_sms_message_sent, emit_sms_message_failed
    
    provider = create_provider()
    adapter = _get_active_adapter()
    tenant_id = provider._tenantId()
    
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
    
    sms_request = SmsSendRequest(
        to_number=phone_number,
        from_number=from_number or "",
        body=body,
        thread_id=thread_id,
        contact_id=contact_id,
    )
    
    result = adapter.send_sms(sms_request)
    
    message = provider.add_sms_message(
        thread_id=thread_id,
        body=body,
        direction="outbound",
        sender_number=from_number,
        recipient_number=phone_number
    )
    
    message_id = message.get("id", "")
    
    if result.success:
        provider.update_sms_message_status(message_id, result.status)
        event = emit_sms_message_sent(
            tenant_id=tenant_id,
            thread_id=thread_id,
            message_id=message_id,
            contact_id=contact_id,
            phone_number=phone_number,
        )
        _dispatch_signal_event(event)
    else:
        provider.update_sms_message_status(message_id, "provider_error")
        event = emit_sms_message_failed(
            tenant_id=tenant_id,
            thread_id=thread_id,
            message_id=message_id,
            error_message=result.error or "Provider send failed",
            contact_id=contact_id,
            phone_number=phone_number,
        )
        _dispatch_signal_event(event)
        if adapter.provider_type != "stub":
            return {
                "success": False,
                "error": result.error or "Provider send failed",
                "status": result.status,
                "message_id": message_id,
            }
    
    return {"success": True, "thread_id": thread_id, "message_id": message_id, "status": result.status}


def get_contacts_with_phone() -> list[dict[str, Any]]:
    provider = create_provider()
    with provider._connect() as conn:
        rows = conn.execute(
            "SELECT id, firstName, lastName, phone FROM contacts WHERE tenantId = ? AND phone IS NOT NULL AND phone != '' ORDER BY lastName",
            (provider._tenantId(),)
        ).fetchall()
        return [dict(row) for row in rows]