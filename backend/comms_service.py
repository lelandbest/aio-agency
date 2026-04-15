from typing import Any
from datetime import datetime, timezone

from backend.data_provider import create_provider, unique_suffix, parse_string_list
from backend.comms_providers import (
    create_provider_adapter,
    ProviderConfig,
    StubProviderAdapter,
    get_available_providers,
)


_active_adapter: Any = None
_active_provider_type: str = "stub"

# Canonical field mapping contract (Frontend camelCase <-> Backend snake_case)
CONFIG_MAPPING = {
    "apiKey": "api_key",
    "apiSecret": "api_secret",
    "phoneNumber": "phone_number",
    "accountSid": "account_sid",
    "authToken": "auth_token",
    "publicApiKey": "public_key",
    "publicKey": "public_key",
    "messagingProfileId": "messaging_profile_id",
    "connectionId": "connection_id",
    "authId": "auth_id",
    "accountId": "account_id",
    "clientSecret": "client_secret",
    "clientId": "client_id",
}
CONFIG_REVERSE_MAPPING = {v: k for k, v in CONFIG_MAPPING.items()}
# Precision override for ambiguous mappings
CONFIG_REVERSE_MAPPING["public_key"] = "publicApiKey"


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
    """Get current provider information with live health verification."""
    adapter = _get_active_adapter()
    health_status = "not_configured"
    is_active = False

    if adapter.provider_type != "stub":
        health = adapter.get_health()
        health_status = health.status
        is_active = health.status == "healthy"
        print(f"COMMS PROVIDER INFO: type={adapter.provider_type} health={health.status} isActive={is_active}")

    return {
        "providerType": adapter.provider_type,
        "providerName": adapter.provider_name,
        "isActive": is_active,
        "healthStatus": health_status,
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
        # Ensure 'providerKey' alias is available for frontend backward compatibility
        result["providerKey"] = result.get("providerType")
        
        if result.get("configJson"):
            import json
            try:
                raw_config = json.loads(result["configJson"])
                
                # Pre-normalize: resolve legacy key duplicates in favor of canonical snake_case
                config = {}
                for k, v in raw_config.items():
                    config[CONFIG_MAPPING.get(k, k)] = v
                
                result["hasConfig"] = bool(config.get("api_key") or config.get("api_secret") or config.get("auth_token"))

                if result["hasConfig"] and result.get("providerType") in ("telnyx", "twilio"):
                    print(f"COMMS CONFIG LOAD: live health check for {result['providerType']}")
                    try:
                        config_obj = ProviderConfig(**config)
                        adapter = create_provider_adapter(result["providerType"], config_obj, tenant_id)
                        health = adapter.get_health()
                        result["healthStatus"] = health.status
                        result["status"] = "verified" if health.status == "healthy" else "configured"
                        result["lastHealthCheck"] = datetime.now(timezone.utc).isoformat()
                        print(f"COMMS CONFIG LOAD: {result['providerType']} health={health.status} status={result['status']}")
                        try:
                            with provider._connect() as conn2:
                                conn2.execute(
                                    "UPDATE comms_provider_configs SET status = ?, healthStatus = ?, lastHealthCheck = ? WHERE id = ?",
                                    (result["status"], health.status, result["lastHealthCheck"], result["id"])
                                )
                                conn2.commit()
                        except Exception:
                            pass
                    except Exception as e:
                        print(f"COMMS CONFIG LOAD: {result['providerType']} health check error: {e}")
                        result["healthStatus"] = "unhealthy"
                        result["status"] = "error"

                masked_config = {}
                sensitive_keys = ("api_key", "api_secret", "auth_token", "public_key")
                for k, v in config.items():
                    ui_key = CONFIG_REVERSE_MAPPING.get(k, k)
                    if k in sensitive_keys and v:
                        masked_config[ui_key] = "********"
                    else:
                        masked_config[ui_key] = v
                result["config"] = masked_config
            except:
                result["hasConfig"] = False
                result["config"] = {}
        else:
            result["hasConfig"] = False
            result["config"] = {}
        results.append(result)
    
    return results


def verify_provider_config(
    provider_type: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    """Verify provider credentials against live API. Does NOT persist or modify DB."""
    print(f"COMMS VERIFY-ONLY: {provider_type}")

    normalized_config = {}
    for k, v in config.items():
        normalized_config[CONFIG_MAPPING.get(k, k)] = v

    config_obj = ProviderConfig(**normalized_config)
    adapter = create_provider_adapter(provider_type, config_obj, "default")

    valid, err = adapter.validate_config()
    if not valid:
        print(f"COMMS VERIFY-ONLY: {provider_type} validate_config FAILED: {err}")
        return {"status": "failed", "healthStatus": "unhealthy", "message": err}

    health = adapter.get_health()
    print(f"COMMS VERIFY-ONLY: {provider_type} health={health.status}")

    if health.status == "healthy":
        return {
            "status": "verified",
            "healthStatus": "healthy",
            "message": health.message or "Provider verified successfully",
        }
    return {
        "status": "failed",
        "healthStatus": health.status,
        "message": health.message or f"Health check returned {health.status}",
    }


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
    
    # Verify health if config is provided
    try:
        provider_inst = create_provider()
        
        normalized_config = {}
        for k, v in config.items():
            normalized_config[CONFIG_MAPPING.get(k, k)] = v
        
        # Load existing config for merging
        existing_config = {}
        with provider_inst._connect() as conn:
            row = conn.execute("SELECT configJson FROM comms_provider_configs WHERE id = ?", (config_id,)).fetchone()
            if row and row["configJson"]:
                try:
                    existing_config = json.loads(row["configJson"])
                except:
                    existing_config = {}
        
        # Merge logic: canonicalize existing keys to purge legacy 'poison' (camelCase keys)
        # and ensure we only persist snake_case at rest.
        base_config = {}
        for k, v in existing_config.items():
            # Map existing keys to snake_case; if unmapped, keep as is
            base_config[CONFIG_MAPPING.get(k, k)] = v
            
        final_config = base_config.copy()
        sensitive_keys = ("api_key", "api_secret", "auth_token", "public_key")
        
        for k, v in normalized_config.items():
            is_sensitive = k in sensitive_keys
            # If sensitive and (masked or empty), keep existing
            if is_sensitive and (v == "********" or not v):
                continue
            # Otherwise overwrite
            final_config[k] = v

        config_obj = ProviderConfig(**final_config)
        adapter = create_provider_adapter(provider_type, config_obj, tenant_id)
        valid, err = adapter.validate_config()
        
        if not valid:
            raise ValueError(f"Provider verification failed: {err}")

        health = adapter.get_health()
        health_status = health.status
        health_msg = health.message

        if health_status != "healthy":
            raise ValueError(f"Provider health check failed: {health_msg}")

        status = "verified"
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Provider verification error: {str(e)}")

    with provider._connect() as conn:
        existing = conn.execute(
            "SELECT id FROM comms_provider_configs WHERE id = ?",
            (config_id,)
        ).fetchone()
        
        if existing:
            conn.execute(
                """UPDATE comms_provider_configs 
                   SET configJson = ?, isActive = ?, status = ?, healthStatus = ?, lastHealthCheck = ?, updatedAt = ?
                   WHERE id = ?""",
                (json.dumps(final_config), 1 if is_active else 0, status, health_status, now, now, config_id)
            )
        else:
            conn.execute(
                """INSERT INTO comms_provider_configs 
                   (id, tenantId, providerType, providerName, configJson, status, isActive, healthStatus, lastHealthCheck, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (config_id, tenant_id, provider_type, provider_type.title(), json.dumps(final_config), status, 1 if is_active else 0, health_status, now, now, now)
            )
        
        if is_active:
            conn.execute(
                "UPDATE comms_provider_configs SET isActive = 0 WHERE tenantId = ? AND id != ?",
                (tenant_id, config_id)
            )
        
        conn.commit()
    
    _refresh_active_adapter()
    
    return {
        "id": config_id, 
        "providerType": provider_type, 
        "isActive": is_active, 
        "status": status, 
        "healthStatus": health_status,
        "message": health_msg
    }


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
        from backend.orchestration import emit_system_event
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
    from backend.comms_integration import emit_sms_message_sent, emit_sms_message_failed, emit_sms_received
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
    from backend.comms_providers import CallStartRequest
    
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
    from backend.comms_providers import CallEndResult
    
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


def send_email_message(
    thread_id: str | None, 
    recipients: list[str] | Any, 
    subject: str, 
    body: str, 
    mailbox_id: str | None = None, 
    sender_name: str | None = None, 
    sender_email: str | None = None, 
    contact_id: str | None = None,
    company_id: str | None = None,
    execution_context: bool = False
) -> dict[str, Any]:
    """
    CANONICAL EMAIL EXECUTION AUTHORITY
    
    Standardized entry point for Dispatch, Flows, and Agents.
    """
    # 1. INPUT VALIDATION
    # Normalize recipients
    if isinstance(recipients, str):
        recipient_list = [r.strip() for r in parse_string_list(recipients) if r.strip()]
    elif isinstance(recipients, list):
        recipient_list = [str(r).strip() for r in recipients if str(r).strip()]
    else:
        recipient_list = []

    msg_subject = (str(subject or "")).strip()
    msg_body = (str(body or "")).strip()

    if not recipient_list:
        return {"success": False, "error": "At least one recipient is required.", "reason": "missing_recipient"}
    if not msg_body:
        return {"success": False, "error": "Message body is required.", "reason": "missing_body"}
    
    provider = create_provider()

    # 2. THREAD RESOLUTION / CREATION
    if not thread_id:
        # If no thread_id, we must have at least a contact or basic context if not in execution_context
        if not contact_id and not execution_context:
            return {"success": False, "error": "Email requires a thread or contact context.", "reason": "missing_context"}
        
        created_thread = provider.create_thread(
            subject=msg_subject or "New Message",
            channel_type="email",
            contact_id=contact_id,
            company_id=company_id,
            body="",
            mailbox_id=mailbox_id,
        )
        thread_id = created_thread.get("id")

    # 3. MAILBOX RESOLUTION & EXECUTION
    try:
        result = provider.send_thread_via_mailbox(
            thread_id=thread_id,
            body=msg_body,
            mailbox_id=mailbox_id,
            sender_name=(sender_name or "AIO Flow").strip(),
            sender_email=sender_email.strip() if sender_email else None,
            recipients=recipient_list,
        )
        
        # Result normalization
        if isinstance(result, dict) and (result.get("success") or "id" in result):
            return {
                "success": True,
                "thread_id": thread_id,
                "message_id": result.get("latestMessage", {}).get("id") or result.get("internalMessageId"),
                "providerMessageId": result.get("providerMessageId"),
                "mailbox_id": result.get("mailboxId") or mailbox_id
            }
        return {"success": False, "error": "Email delivery failed", "reason": "provider_error"}
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "reason": "execution_failed"
        }


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
    """
    CANONICAL SMS EXECUTION AUTHORITY (Alpha Gate Lite)
    
    Standardized entry point for Dispatch, Flows, and Agents.
    """
    # 1. AUTHORIZATION/CONTEXT VALIDATION
    # We allow sending if either execution_context is True (Flows/Agents)
    # or if it's an authorized internal call.
    if not execution_context and not thread_id and not contact_id:
        # If no context at all is provided, we require execution_context
        # to prevent unauthorized or context-less direct API abuse.
        return {
            "success": False,
            "error": "SMS execution requires valid context or execution engine authority.",
            "reason": "missing_authorization_context"
        }

    # 2. INPUT VALIDATION (RECIPIENT & BODY)
    recipient = (str(phone_number or "")).strip()
    message_body = (str(body or "")).strip()

    if not recipient:
        return {"success": False, "error": "Recipient phone number is required.", "reason": "missing_recipient"}
    if not message_body:
        return {"success": False, "error": "Message body is required.", "reason": "missing_body"}

    # 3. PROVIDER SELECTION & AVAILABILITY
    adapter = _get_active_adapter()
    if not adapter or adapter.provider_type == "stub" and not execution_context:
         # Note: We allow stub in execution_context for testing flows without live creds,
         # but Dispatch usually wants a real provider or explicit acknowledgment.
         pass

    # 4. OPT-OUT PASSIVE GATE
    opt_out_check = check_opt_out(recipient)
    if opt_out_check.get("opted_out"):
        return {
            "success": False,
            "error": "Phone number has opted out of communication.",
            "reason": f"Opt-out keyword '{opt_out_check.get('keyword')}' detected"
        }

    # 5. THREAD & RECORD PREPARATION
    provider = create_provider()
    tenant_id = provider._tenantId()

    if not thread_id:
        thread = provider.create_sms_thread(contact_id=contact_id, phone_number_id=None, subject=f"SMS with {recipient}")
        thread_id = thread["id"]

    # 6. EXECUTION
    from backend.comms_providers import SmsSendRequest
    from backend.comms_integration import emit_sms_message_sent, emit_sms_message_failed
    
    sms_request = SmsSendRequest(
        to_number=recipient,
        from_number=(from_number or "").strip(),
        body=message_body,
        thread_id=thread_id,
        contact_id=contact_id,
    )
    
    result = adapter.send_sms(sms_request)
    
    # 7. PERSISTENCE (CRM LOGGING)
    message = provider.add_sms_message(
        thread_id=thread_id,
        body=message_body,
        direction="outbound",
        sender_number=from_number,
        recipient_number=recipient
    )
    
    message_id = message.get("id", "")
    
    # 8. RESULT NORMALIZATION & SIGNAL EMISSION
    if result.success:
        provider.update_sms_message_status(message_id, result.status)
        event = emit_sms_message_sent(
            tenant_id=tenant_id,
            thread_id=thread_id,
            message_id=message_id,
            contact_id=contact_id,
            phone_number=recipient,
        )
        _dispatch_signal_event(event)
        
        return {
            "success": True, 
            "thread_id": thread_id, 
            "message_id": message_id, 
            "status": result.status,
            "provider": adapter.provider_name
        }
    else:
        provider.update_sms_message_status(message_id, "provider_error")
        event = emit_sms_message_failed(
            tenant_id=tenant_id,
            thread_id=thread_id,
            message_id=message_id,
            error_message=result.error or "Provider send failed",
            contact_id=contact_id,
            phone_number=recipient,
        )
        _dispatch_signal_event(event)
        
        return {
            "success": False,
            "error": result.error or "Provider send failed",
            "reason": "provider_rejection",
            "status": result.status,
            "message_id": message_id,
            "provider": adapter.provider_name
        }


def get_contacts_with_phone() -> list[dict[str, Any]]:
    provider = create_provider()
    with provider._connect() as conn:
        rows = conn.execute(
            "SELECT id, firstName, lastName, phone FROM contacts WHERE tenantId = ? AND phone IS NOT NULL AND phone != '' ORDER BY lastName",
            (provider._tenantId(),)
        ).fetchall()
        return [dict(row) for row in rows]