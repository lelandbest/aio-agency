from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class PhoneNumber(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tenant_id: str
    number: str
    display_label: str | None = None
    owner: str | None = None
    workspace: str | None = None
    sms_enabled: bool = False
    calls_enabled: bool = False
    route_target: str | None = None
    tags_json: str | None = None
    is_active: bool = True
    created_at: str | None = None
    updated_at: str | None = None


class SmsThread(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tenant_id: str
    contact_id: str | None = None
    phone_number_id: str | None = None
    direction: Literal["inbound", "outbound"]
    status: str = "open"
    subject: str | None = None
    last_message_at: str | None = None
    message_count: int = 0
    tags_json: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class SmsMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tenant_id: str
    thread_id: str
    direction: Literal["inbound", "outbound", "system"]
    sender_name: str | None = None
    sender_number: str | None = None
    recipient_number: str | None = None
    body: str
    delivery_status: str = "pending"
    error_message: str | None = None
    created_at: str | None = None


class SmsPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tenant_id: str
    name: str
    brand_name: str
    registration_status: str = "pending"
    campaign_type: str | None = None
    approved_numbers_json: str | None = None
    daily_limit: int | None = None
    opt_out_keywords_json: str | None = None
    help_response: str | None = None
    compliance_notes: str | None = None
    is_active: bool = True
    created_at: str | None = None
    updated_at: str | None = None


class Extension(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tenant_id: str
    extension_number: str
    display_name: str | None = None
    user_id: str | None = None
    forward_to: str | None = None
    ring_timeout_seconds: int = 30
    is_active: bool = True
    created_at: str | None = None
    updated_at: str | None = None


class RingGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tenant_id: str
    name: str
    extensions_json: str
    ring_strategy: str = "simultaneous"
    ring_timeout_seconds: int = 30
    is_active: bool = True
    created_at: str | None = None
    updated_at: str | None = None


class CallSession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tenant_id: str
    contact_id: str | None = None
    phone_number_id: str | None = None
    extension_id: str | None = None
    direction: Literal["inbound", "outbound"]
    status: str = "initiated"
    duration_seconds: int | None = None
    start_time: str | None = None
    end_time: str | None = None
    recording_url: str | None = None
    transcript_url: str | None = None
    disposition: str | None = None
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class VerifiedCallerId(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tenant_id: str
    phone_number_id: str
    caller_id_name: str | None = None
    verification_status: str = "pending"
    verified_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class CommsProviderConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tenant_id: str
    provider_type: str
    provider_name: str
    config_json: str | None = None
    status: str = "stub"
    is_active: bool = False
    last_health_check: str | None = None
    health_status: str = "unknown"
    created_at: str | None = None
    updated_at: str | None = None


class CommsOverview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    active_numbers: int = 0
    sms_enabled_count: int = 0
    calls_enabled_count: int = 0
    active_extensions: int = 0
    active_ring_groups: int = 0
    active_plans: int = 0
    provider_status: str = "stub"
    recent_threads_count: int = 0
    recent_calls_count: int = 0