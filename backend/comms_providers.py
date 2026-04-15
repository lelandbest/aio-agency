from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from datetime import datetime, timezone


class SmsSendRequest:
    def __init__(
        self,
        to_number: str,
        from_number: str,
        body: str,
        thread_id: str | None = None,
        contact_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ):
        self.to_number = to_number
        self.from_number = from_number
        self.body = body
        self.thread_id = thread_id
        self.contact_id = contact_id
        self.metadata = metadata or {}


class SmsSendResult:
    def __init__(
        self,
        success: bool,
        message_id: str | None = None,
        provider_message_id: str | None = None,
        status: str = "pending",
        error: str | None = None,
        raw_response: dict[str, Any] | None = None,
    ):
        self.success = success
        self.message_id = message_id
        self.provider_message_id = provider_message_id
        self.status = status
        self.error = error
        self.raw_response = raw_response


class CallStartRequest:
    def __init__(
        self,
        to_number: str,
        from_number: str,
        contact_id: str | None = None,
        phone_number_id: str | None = None,
        extension_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ):
        self.to_number = to_number
        self.from_number = from_number
        self.contact_id = contact_id
        self.phone_number_id = phone_number_id
        self.extension_id = extension_id
        self.metadata = metadata or {}


class CallStartResult:
    def __init__(
        self,
        success: bool,
        call_id: str | None = None,
        provider_call_id: str | None = None,
        status: str = "initiated",
        error: str | None = None,
        raw_response: dict[str, Any] | None = None,
    ):
        self.success = success
        self.call_id = call_id
        self.provider_call_id = provider_call_id
        self.status = status
        self.error = error
        self.raw_response = raw_response


class CallEndResult:
    def __init__(
        self,
        success: bool,
        status: str = "ended",
        error: str | None = None,
    ):
        self.success = success
        self.status = status
        self.error = error


class ProviderConfig:
    def __init__(
        self,
        api_key: str | None = None,
        api_secret: str | None = None,
        auth_token: str | None = None,
        messaging_profile_id: str | None = None,
        connection_id: str | None = None,
        phone_number: str | None = None,
        **kwargs,
    ):
        self.api_key = api_key
        self.api_secret = api_secret
        self.auth_token = auth_token
        self.messaging_profile_id = messaging_profile_id
        self.connection_id = connection_id
        self.phone_number = phone_number
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if v is not None}


class ProviderHealth:
    def __init__(
        self,
        status: str = "unknown",
        message: str | None = None,
        last_check: str | None = None,
    ):
        self.status = status
        self.message = message
        self.last_check = last_check or datetime.now(timezone.utc).isoformat()


class WebhookEvent:
    def __init__(
        self,
        event_type: str,
        provider: str,
        raw_payload: dict[str, Any],
        normalized: dict[str, Any] | None = None,
    ):
        self.event_type = event_type
        self.provider = provider
        self.raw_payload = raw_payload
        self.normalized = normalized or {}


class CommsProviderAdapter(ABC):
    """Base interface for all comms providers."""

    def __init__(self, config: ProviderConfig, tenant_id: str = "default"):
        self.config = config
        self.tenant_id = tenant_id
        self._last_health: ProviderHealth | None = None

    @property
    @abstractmethod
    def provider_type(self) -> str:
        """Unique identifier for this provider."""
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Display name for this provider."""
        pass

    @abstractmethod
    def validate_config(self) -> tuple[bool, str]:
        """
        Validate provider configuration.
        Returns (is_valid, error_message).
        """
        pass

    @abstractmethod
    def get_health(self) -> ProviderHealth:
        """
        Check provider health status.
        """
        pass

    @abstractmethod
    def send_sms(self, request: SmsSendRequest) -> SmsSendResult:
        """
        Send SMS message through provider.
        """
        pass

    @abstractmethod
    def start_call(self, request: CallStartRequest) -> CallStartResult:
        """
        Initiate outbound call through provider.
        """
        pass

    @abstractmethod
    def end_call(self, call_id: str) -> CallEndResult:
        """
        End an active call.
        """
        pass

    @abstractmethod
    def parse_webhook(self, payload: dict[str, Any], headers: dict[str, str] | None = None) -> WebhookEvent | None:
        """
        Parse incoming webhook payload and normalize to internal event.
        Returns None if payload is not relevant to this provider.
        """
        pass

    def is_available(self) -> bool:
        """Check if provider is currently available for requests."""
        health = self.get_health()
        return health.status in ("healthy", "degraded")


class StubProviderAdapter(CommsProviderAdapter):
    """Stub provider that simulates all operations."""

    def __init__(self, config: ProviderConfig, tenant_id: str = "default"):
        super().__init__(config, tenant_id)

    @property
    def provider_type(self) -> str:
        return "stub"

    @property
    def provider_name(self) -> str:
        return "Stub"

    def validate_config(self) -> tuple[bool, str]:
        return True, ""

    def get_health(self) -> ProviderHealth:
        return ProviderHealth(status="healthy", message="Stub provider always available")

    def send_sms(self, request: SmsSendRequest) -> SmsSendResult:
        import uuid
        msg_id = f"stub-{uuid.uuid4().hex[:12]}"
        return SmsSendResult(
            success=True,
            message_id=msg_id,
            provider_message_id=msg_id,
            status="simulated",
            raw_response={"stub": True},
        )

    def start_call(self, request: CallStartRequest) -> CallStartResult:
        import uuid
        call_id = f"stub-call-{uuid.uuid4().hex[:12]}"
        return CallStartResult(
            success=True,
            call_id=call_id,
            provider_call_id=call_id,
            status="simulated_ringing",
            raw_response={"stub": True},
        )

    def end_call(self, call_id: str) -> CallEndResult:
        return CallEndResult(success=True, status="simulated_ended")

    def parse_webhook(self, payload: dict[str, Any], headers: dict[str, str] | None = None) -> WebhookEvent | None:
        return None


class TelnyxProviderAdapter(CommsProviderAdapter):
    """Telnyx provider adapter for SMS and voice."""

    def __init__(self, config: ProviderConfig, tenant_id: str = "default"):
        super().__init__(config, tenant_id)
        self._base_url = "https://api.telnyx.com/v2"

    @property
    def provider_type(self) -> str:
        return "telnyx"

    @property
    def provider_name(self) -> str:
        return "Telnyx"

    def validate_config(self) -> tuple[bool, str]:
        print("TELNYX VERIFY START")

        if not self.config.api_key:
            print("TELNYX VERIFY FAIL: api_key missing")
            return False, "Telnyx API key is required"
        if not self.config.api_key.startswith("KEY"):
            print("TELNYX VERIFY FAIL: invalid key format")
            return False, "Invalid Telnyx API key format (must start with KEY)"
        url = f"{self._base_url}/messaging_profiles?page[size]=1"
        masked_key = f"****{self.config.api_key[-4:]}" if len(self.config.api_key) >= 4 else "****"
        print(f"  URL: {url}")
        print(f"  API Key: {masked_key}")

        try:
            import urllib.request
            import json

            req = urllib.request.Request(url, method="GET")
            req.add_header("Authorization", f"Bearer {self.config.api_key}")

            with urllib.request.urlopen(req, timeout=10) as response:
                status_code = response.status
                body = response.read().decode()[:500]
                print(f"  Response Status: {status_code}")
                print(f"  Response Body: {body}")

                if status_code == 200:
                    print("TELNYX VERIFY END: SUCCESS")
                    return True, ""
                else:
                    print(f"TELNYX VERIFY END: FAIL (HTTP {status_code})")
                    return False, f"Telnyx API returned HTTP {status_code}"
        except urllib.error.HTTPError as e:
            error_body = e.read().decode()[:500] if e.fp else ""
            print(f"  Response Status: {e.code}")
            print(f"  Response Body: {error_body}")
            if e.code == 401:
                print("TELNYX VERIFY END: FAIL (Unauthorized)")
                return False, "Invalid Telnyx API key (Unauthorized)"
            print(f"TELNYX VERIFY END: FAIL (HTTP {e.code})")
            return False, f"Telnyx API returned HTTP {e.code}: {error_body}"
        except Exception as e:
            error_msg = str(e)
            print(f"  Response Status: ERROR")
            print(f"  Error: {error_msg}")
            print("TELNYX VERIFY END: FAIL (Network Error)")
            return False, f"Telnyx API connection failed: {error_msg}"

    def get_health(self) -> ProviderHealth:
        if not self.config.api_key:
            return ProviderHealth(status="not_configured", message="API key not set")

        print("TELNYX HEALTH CHECK START")
        url = f"{self._base_url}/messaging_profiles?page[size]=1"
        masked_key = f"****{self.config.api_key[-4:]}" if len(self.config.api_key) >= 4 else "****"
        print(f"  URL: {url}")
        print(f"  API Key: {masked_key}")

        try:
            import urllib.request
            import json

            req = urllib.request.Request(url, method="GET")
            req.add_header("Authorization", f"Bearer {self.config.api_key}")

            with urllib.request.urlopen(req, timeout=10) as response:
                status_code = response.status
                body = response.read().decode()[:500]
                print(f"  Response Status: {status_code}")
                print(f"  Response Body: {body}")
                if status_code == 200:
                    print("TELNYX HEALTH CHECK END: healthy")
                    return ProviderHealth(status="healthy", message="Telnyx API verified")
                print(f"TELNYX HEALTH CHECK END: unhealthy (HTTP {status_code})")
                return ProviderHealth(status="unhealthy", message=f"API returned {status_code}")
        except urllib.error.HTTPError as e:
            error_body = e.read().decode()[:500] if e.fp else ""
            print(f"  Response Status: {e.code}")
            print(f"  Response Body: {error_body}")
            if e.code == 401:
                print("TELNYX HEALTH CHECK END: unhealthy (Unauthorized)")
                return ProviderHealth(status="unhealthy", message="Invalid API Key (Unauthorized)")
            print(f"TELNYX HEALTH CHECK END: unhealthy (HTTP {e.code})")
            return ProviderHealth(status="unhealthy", message=f"API returned HTTP {e.code}: {error_body}")
        except Exception as e:
            error_msg = str(e)
            print(f"  Response Status: ERROR")
            print(f"  Error: {error_msg}")
            print("TELNYX HEALTH CHECK END: unhealthy (Network Error)")
            return ProviderHealth(status="unhealthy", message=f"Connection failed: {error_msg}")

    def send_sms(self, request: SmsSendRequest) -> SmsSendResult:
        if not self.config.api_key:
            return SmsSendResult(success=False, error="Provider not configured")

        try:
            import urllib.request
            import json
            
            payload = {
                "from": request.from_number,
                "to": request.to_number,
                "body": request.body,
            }
            
            if self.config.messaging_profile_id:
                payload["messaging_profile_id"] = self.config.messaging_profile_id
            
            body = json.dumps(payload).encode()
            
            req = urllib.request.Request(
                f"{self._base_url}/messages",
                data=body,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.config.api_key}",
                }
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode())
                return SmsSendResult(
                    success=True,
                    message_id=data.get("id"),
                    provider_message_id=data.get("id"),
                    status="sent_provider",
                    raw_response=data,
                )
        except urllib.error.HTTPError as e:
            error_body = e.read().decode() if e.fp else "{}"
            try:
                error_data = json.loads(error_body)
                error_msg = error_data.get("errors", [{}])[0].get("detail", str(e))
            except:
                error_msg = str(e)
            return SmsSendResult(success=False, error=error_msg, status="provider_error")
        except Exception as e:
            return SmsSendResult(success=False, error=str(e), status="provider_error")

    def start_call(self, request: CallStartRequest) -> CallStartResult:
        if not self.config.api_key:
            return CallStartResult(success=False, error="Provider not configured")

        try:
            import urllib.request
            import json
            
            payload = {
                "connection_id": self.config.connection_id,
                "from": request.from_number,
                "to": request.to_number,
            }
            
            body = json.dumps(payload).encode()
            
            req = urllib.request.Request(
                f"{self._base_url}/calls",
                data=body,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.config.api_key}",
                }
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode())
                return CallStartResult(
                    success=True,
                    call_id=data.get("call_id"),
                    provider_call_id=data.get("call_id"),
                    status="ringing",
                    raw_response=data,
                )
        except urllib.error.HTTPError as e:
            error_body = e.read().decode() if e.fp else "{}"
            try:
                error_data = json.loads(error_body)
                error_msg = error_data.get("errors", [{}])[0].get("detail", str(e))
            except:
                error_msg = str(e)
            return CallStartResult(success=False, error=error_msg, status="provider_error")
        except Exception as e:
            return CallStartResult(success=False, error=str(e), status="provider_error")

    def end_call(self, call_id: str) -> CallEndResult:
        if not self.config.api_key:
            return CallEndResult(success=False, error="Provider not configured")

        try:
            import urllib.request
            
            req = urllib.request.Request(
                f"{self._base_url}/calls/{call_id}/actions",
                data=json.dumps({"action": "hangup"}).encode(),
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.config.api_key}",
                }
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                return CallEndResult(success=True, status="ended")
        except Exception as e:
            return CallEndResult(success=False, error=str(e))

    def parse_webhook(self, payload: dict[str, Any], headers: dict[str, str] | None = None) -> WebhookEvent | None:
        event_type = payload.get("data", {}).get("event_type")
        if not event_type:
            return None

        normalized = {}
        
        if event_type == "message.updated":
            msg_data = payload.get("data", {}).get("payload", {})
            normalized = {
                "event_type": "sms_status_update",
                "message_id": msg_data.get("id"),
                "status": msg_data.get("status"),
                "to": msg_data.get("to"),
                "from": msg_data.get("from"),
            }
        elif event_type == "message.received":
            msg_data = payload.get("data", {}).get("payload", {})
            normalized = {
                "event_type": "sms_received",
                "message_id": msg_data.get("id"),
                "from": msg_data.get("from"),
                "to": msg_data.get("to"),
                "body": msg_data.get("text") or msg_data.get("body"),
            }
        elif event_type == "call.initiated":
            call_data = payload.get("data", {}).get("payload", {})
            normalized = {
                "event_type": "call_update",
                "call_id": call_data.get("call_id"),
                "status": call_data.get("state"),
            }
        elif event_type == "call.answered":
            call_data = payload.get("data", {}).get("payload", {})
            normalized = {
                "event_type": "call_answered",
                "call_id": call_data.get("call_id"),
                "status": "answered",
            }
        elif event_type == "call.hangup":
            call_data = payload.get("data", {}).get("payload", {})
            normalized = {
                "event_type": "call_ended",
                "call_id": call_data.get("call_id"),
                "status": "ended",
                "duration": call_data.get("duration"),
            }
        
        if not normalized:
            return None
            
        return WebhookEvent(
            event_type=event_type,
            provider=self.provider_type,
            raw_payload=payload,
            normalized=normalized,
        )


class TwilioProviderAdapter(CommsProviderAdapter):
    """Twilio provider adapter for SMS and voice."""

    def __init__(self, config: ProviderConfig, tenant_id: str = "default"):
        super().__init__(config, tenant_id)

    @property
    def provider_type(self) -> str:
        return "twilio"

    @property
    def provider_name(self) -> str:
        return "Twilio"

    def _get_account_sid(self) -> str:
        return self.config.api_key or ""

    def _get_auth_token(self) -> str:
        return self.config.api_secret or ""

    def _get_from_number(self) -> str:
        return self.config.phone_number or ""

    def validate_config(self) -> tuple[bool, str]:
        if not self.config.api_key:
            return False, "Account SID is required"
        if not self.config.api_secret:
            return False, "Auth token is required"
        if not self.config.phone_number:
            return False, "From phone number is required"
        return True, ""

    def get_health(self) -> ProviderHealth:
        if not self.config.api_key or not self.config.api_secret:
            return ProviderHealth(status="not_configured", message="Credentials not set")

        try:
            import urllib.request
            import base64
            
            credentials = f"{self.config.api_key}:{self.config.api_secret}".encode()
            auth = base64.b64encode(credentials).decode()
            
            req = urllib.request.Request(
                f"https://api.twilio.com/2010-04-01/Accounts/{self.config.api_key}.json",
                method="GET"
            )
            req.add_header("Authorization", f"Basic {auth}")
            
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    return ProviderHealth(status="healthy", message="Twilio API reachable")
                return ProviderHealth(status="unhealthy", message=f"API returned {response.status}")
        except Exception as e:
            return ProviderHealth(status="unhealthy", message=str(e))

    def send_sms(self, request: SmsSendRequest) -> SmsSendResult:
        if not self.config.api_key or not self.config.api_secret:
            return SmsSendResult(success=False, error="Provider not configured")

        try:
            import urllib.request
            import urllib.parse
            import base64
            
            credentials = f"{self.config.api_key}:{self.config.api_secret}".encode()
            auth = base64.b64encode(credentials).decode()
            
            values = {
                "To": request.to_number,
                "From": request.from_number,
                "Body": request.body,
            }
            
            data = urllib.parse.urlencode(values).encode()
            
            req = urllib.request.Request(
                f"https://api.twilio.com/2010-04-01/Accounts/{self.config.api_key}/Messages.json",
                data=data,
                method="POST"
            )
            req.add_header("Authorization", f"Basic {auth}")
            
            with urllib.request.urlopen(req, timeout=30) as response:
                import json
                data = json.loads(response.read().decode())
                return SmsSendResult(
                    success=True,
                    message_id=data.get("sid"),
                    provider_message_id=data.get("sid"),
                    status="sent_provider",
                    raw_response=data,
                )
        except urllib.error.HTTPError as e:
            import json
            error_body = e.read().decode() if e.fp else "{}"
            try:
                error_data = json.loads(error_body)
                error_msg = error_data.get("message", str(e))
            except:
                error_msg = str(e)
            return SmsSendResult(success=False, error=error_msg, status="provider_error")
        except Exception as e:
            return SmsSendResult(success=False, error=str(e), status="provider_error")

    def start_call(self, request: CallStartRequest) -> CallStartResult:
        if not self.config.api_key or not self.config.api_secret:
            return CallStartResult(success=False, error="Provider not configured")

        try:
            import urllib.request
            import urllib.parse
            import base64
            import json
            
            credentials = f"{self.config.api_key}:{self.config.api_secret}".encode()
            auth = base64.b64encode(credentials).decode()
            
            values = {
                "To": request.to_number,
                "From": request.from_number,
                "Twiml": "<Response><Say>Call initiated</Say></Response>",
            }
            
            data = urllib.parse.urlencode(values).encode()
            
            req = urllib.request.Request(
                f"https://api.twilio.com/2010-04-01/Accounts/{self.config.api_key}/Calls.json",
                data=data,
                method="POST"
            )
            req.add_header("Authorization", f"Basic {auth}")
            
            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode())
                return CallStartResult(
                    success=True,
                    call_id=data.get("sid"),
                    provider_call_id=data.get("sid"),
                    status="ringing",
                    raw_response=data,
                )
        except Exception as e:
            return CallStartResult(success=False, error=str(e), status="provider_error")

    def end_call(self, call_id: str) -> CallEndResult:
        if not self.config.api_key or not self.config.api_secret:
            return CallEndResult(success=False, error="Provider not configured")

        try:
            import urllib.request
            import urllib.parse
            import base64
            
            credentials = f"{self.config.api_key}:{self.config.api_secret}".encode()
            auth = base64.b64encode(credentials).decode()
            
            values = {"Status": "completed"}
            data = urllib.parse.urlencode(values).encode()
            
            req = urllib.request.Request(
                f"https://api.twilio.com/2010-04-01/Accounts/{self.config.api_key}/Calls/{call_id}.json",
                data=data,
                method="POST"
            )
            req.add_header("Authorization", f"Basic {auth}")
            
            with urllib.request.urlopen(req, timeout=30):
                return CallEndResult(success=True, status="ended")
        except Exception as e:
            return CallEndResult(success=False, error=str(e))

    def parse_webhook(self, payload: dict[str, Any], headers: dict[str, str] | None = None) -> WebhookEvent | None:
        message_sid = payload.get("MessageSid")
        call_sid = payload.get("CallSid")
        
        if message_sid:
            return WebhookEvent(
                event_type="sms_status",
                provider=self.provider_type,
                raw_payload=payload,
                normalized={
                    "event_type": "sms_status_update",
                    "message_id": message_sid,
                    "status": payload.get("MessageStatus"),
                    "to": payload.get("To"),
                    "from": payload.get("From"),
                },
            )
        elif call_sid:
            return WebhookEvent(
                event_type="call_status",
                provider=self.provider_type,
                raw_payload=payload,
                normalized={
                    "event_type": "call_update",
                    "call_id": call_sid,
                    "status": payload.get("CallStatus"),
                    "duration": payload.get("Duration"),
                },
            )
        
        return None


ADAPTERS: dict[str, type[CommsProviderAdapter]] = {
    "stub": StubProviderAdapter,
    "telnyx": TelnyxProviderAdapter,
    "twilio": TwilioProviderAdapter,
}


def create_provider_adapter(provider_type: str, config: ProviderConfig, tenant_id: str = "default") -> CommsProviderAdapter:
    """Factory function to create provider adapter instances."""
    adapter_class = ADAPTERS.get(provider_type.lower())
    if not adapter_class:
        return StubProviderAdapter(config, tenant_id)
    return adapter_class(config, tenant_id)


def get_available_providers() -> list[dict[str, str]]:
    """Return list of available provider types and names."""
    return [
        {"type": "stub", "name": "Stub (Simulated)"},
        {"type": "telnyx", "name": "Telnyx"},
        {"type": "twilio", "name": "Twilio"},
    ]
