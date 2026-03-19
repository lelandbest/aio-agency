from __future__ import annotations

import base64
import json
import imaplib
import smtplib
import ssl
from datetime import UTC, datetime
from email import policy
from email.header import decode_header
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import getaddresses, parseaddr
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def short_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


PROVIDER_FIELDS: dict[str, list[dict[str, str]]] = {
    "local-stub": [],
    "smtp-imap": [
        {"key": "email", "label": "Mailbox Email"},
        {"key": "username", "label": "Username"},
        {"key": "password", "label": "Password"},
        {"key": "incoming_host", "label": "IMAP Host"},
        {"key": "incoming_port", "label": "IMAP Port"},
        {"key": "outgoing_host", "label": "SMTP Host"},
        {"key": "outgoing_port", "label": "SMTP Port"},
    ],
    "gmail-oauth": [
        {"key": "email", "label": "Google Account"},
        {"key": "client_id", "label": "Client ID"},
        {"key": "client_secret", "label": "Client Secret"},
        {"key": "refresh_token", "label": "Refresh Token"},
    ],
    "microsoft365-oauth": [
        {"key": "email", "label": "Microsoft Account"},
        {"key": "tenant_id", "label": "Tenant ID"},
        {"key": "client_id", "label": "Client ID"},
        {"key": "client_secret", "label": "Client Secret"},
        {"key": "refresh_token", "label": "Refresh Token"},
    ],
}


def get_provider_catalog() -> list[dict[str, Any]]:
    return [
        {"id": provider_id, "label": provider_id.replace("-", " ").title(), "fields": fields}
        for provider_id, fields in PROVIDER_FIELDS.items()
    ]


def http_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    data: dict[str, Any] | None = None,
    raw_data: bytes | None = None,
) -> dict[str, Any]:
    payload = raw_data
    request_headers = {"User-Agent": "AIOCRM/1.0", **(headers or {})}
    if data is not None and raw_data is not None:
        raise ValueError("Provide either data or raw_data, not both.")
    if data is not None:
        payload = json.dumps(data).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    request = Request(url, data=payload, method=method, headers=request_headers)
    try:
        with urlopen(request, timeout=25) as response:  # pragma: no cover - network dependent
            charset = response.headers.get_content_charset() or "utf-8"
            body = response.read().decode(charset, errors="replace")
    except HTTPError as error:  # pragma: no cover - network dependent
        detail = error.read().decode("utf-8", errors="replace") if hasattr(error, "read") else str(error)
        raise ValueError(f"HTTP {error.code}: {detail}") from error
    except URLError as error:  # pragma: no cover - network dependent
        raise ValueError(f"Request failed: {error.reason}") from error
    return json.loads(body) if body else {}


def http_form(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    encoded = urlencode(payload).encode("utf-8")
    return http_json(
        url,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        raw_data=encoded,
    )


def decode_header_value(value: str | None) -> str:
    if not value:
        return ""
    decoded_parts = []
    for part, encoding in decode_header(value):
        if isinstance(part, bytes):
            decoded_parts.append(part.decode(encoding or "utf-8", errors="replace"))
        else:
            decoded_parts.append(part)
    return "".join(decoded_parts).strip()


def extract_text_body(message) -> str:
    if message.is_multipart():
        for part in message.walk():
            if part.get_content_maintype() == "multipart":
                continue
            if part.get_content_disposition() == "attachment":
                continue
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                return payload.decode(charset, errors="replace").strip()
        for part in message.walk():
            if part.get_content_disposition() == "attachment":
                continue
            if part.get_content_type() == "text/html":
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                return payload.decode(charset, errors="replace").strip()
        return ""
    payload = message.get_payload(decode=True) or b""
    charset = message.get_content_charset() or "utf-8"
    return payload.decode(charset, errors="replace").strip()


class BaseMailAdapter:
    provider_name = "base"

    def describe_mailbox(self, mailbox: dict[str, Any]) -> dict[str, Any]:
        return {
            **mailbox,
            "status": mailbox.get("status") or "connected",
            "inbound_enabled": bool(mailbox.get("inbound_enabled", True)),
            "outbound_enabled": bool(mailbox.get("outbound_enabled", True)),
            "last_synced_at": mailbox.get("last_synced_at"),
            "config": mailbox.get("config") or {},
            "config_fields": PROVIDER_FIELDS.get(mailbox.get("provider") or self.provider_name, []),
        }

    def validate_mailbox(self, mailbox: dict[str, Any]) -> dict[str, Any]:
        required_fields = PROVIDER_FIELDS.get(mailbox.get("provider") or self.provider_name, [])
        config = mailbox.get("config") or {}
        missing = [field["key"] for field in required_fields if not str(config.get(field["key"], "")).strip()]
        return {
            "ok": len(missing) == 0,
            "missing_fields": missing,
            "provider": mailbox.get("provider") or self.provider_name,
        }

    def test_connection(self, mailbox: dict[str, Any]) -> dict[str, Any]:
        validation = self.validate_mailbox(mailbox)
        if not validation["ok"]:
            return {
                "status": "invalid",
                "message": f"Missing required fields: {', '.join(validation['missing_fields'])}",
                "provider": validation["provider"],
                "missing_fields": validation["missing_fields"],
            }
        return {
            "status": "ok",
            "message": f"{validation['provider']} configuration looks usable.",
            "provider": validation["provider"],
            "missing_fields": [],
            "connected_identity": mailbox.get("address"),
        }

    def _require_ready(self, mailbox: dict[str, Any], operation: str) -> None:
        validation = self.validate_mailbox(mailbox)
        if not validation["ok"]:
            raise ValueError(f"{self.provider_name} requires: {', '.join(validation['missing_fields'])}")
        if operation == "sync" and not mailbox.get("inbound_enabled", True):
            raise ValueError(f"{self.provider_name} inbound is disabled for this mailbox.")
        if operation == "deliver" and not mailbox.get("outbound_enabled", True):
            raise ValueError(f"{self.provider_name} outbound is disabled for this mailbox.")

    def build_sync_message(self, mailbox: dict[str, Any], contacts: list[dict[str, Any]]) -> dict[str, Any]:
        raise NotImplementedError

    def deliver_outbound(
        self,
        mailbox: dict[str, Any],
        thread: dict[str, Any],
        *,
        body: str,
        sender_name: str,
        sender_email: str,
        recipients: list[str],
    ) -> dict[str, Any]:
        raise NotImplementedError


class LocalStubMailAdapter(BaseMailAdapter):
    provider_name = "local-stub"

    def build_sync_message(self, mailbox: dict[str, Any], contacts: list[dict[str, Any]]) -> dict[str, Any]:
        mailbox_name = (mailbox.get("name") or "").lower()
        growth_contact = next((contact for contact in contacts if "sarah" in (contact.get("first_name") or "").lower()), None)
        education_contact = next((contact for contact in contacts if "emily" in (contact.get("first_name") or "").lower()), None)
        primary_contact = next((contact for contact in contacts if contact.get("email")), None)

        if "growth" in mailbox_name and growth_contact:
            contact = growth_contact
            subject = "Security review timing"
            body = "Procurement is moving. I need the cleanest answer on your security review process before I pull the final group together."
        elif education_contact:
            contact = education_contact
            subject = "Usage review and next step"
            body = "We are seeing healthy product usage. I want to understand what would help you convert this trial into a wider rollout."
        else:
            contact = primary_contact or {
                "first_name": "Jordan",
                "last_name": "Vale",
                "email": "jordan.vale@prospect.local",
            }
            subject = "Decision path clarification"
            body = "We are interested, but I need the fastest path from current scope to a confident yes."

        sender_name = " ".join(part for part in [contact.get("first_name"), contact.get("last_name")] if part).strip() or "Inbound Contact"
        sender_email = contact.get("email") or f"{uuid4().hex[:8]}@prospect.local"
        return {
            "subject": subject,
            "body": body,
            "sender_name": sender_name,
            "sender_email": sender_email,
            "recipients": [mailbox.get("address") or "mission@aiocrm.local"],
            "provider_message_id": short_id("inbound"),
            "provider_payload": {
                "mailbox_address": mailbox.get("address"),
                "received_at": utcnow_iso(),
                "adapter": self.provider_name,
            },
        }

    def deliver_outbound(
        self,
        mailbox: dict[str, Any],
        thread: dict[str, Any],
        *,
        body: str,
        sender_name: str,
        sender_email: str,
        recipients: list[str],
    ) -> dict[str, Any]:
        return {
            "provider_message_id": short_id("outbound"),
            "delivery_status": "sent",
            "provider_payload": {
                "mailbox_address": mailbox.get("address"),
                "thread_id": thread.get("id"),
                "recipient_count": len(recipients),
                "sent_at": utcnow_iso(),
                "adapter": self.provider_name,
            },
            "body": body,
            "sender_name": sender_name,
            "sender_email": sender_email,
            "recipients": recipients,
        }


class ExternalProviderMailAdapter(BaseMailAdapter):
    provider_name = "external"
    provider_label = "External Mail"

    def test_connection(self, mailbox: dict[str, Any]) -> dict[str, Any]:
        validation = self.validate_mailbox(mailbox)
        if not validation["ok"]:
            return {
                "status": "invalid",
                "message": f"Missing required fields: {', '.join(validation['missing_fields'])}",
                "provider": validation["provider"],
                "missing_fields": validation["missing_fields"],
            }
        return {
            "status": "ok",
            "message": f"{self.provider_label} staged successfully. Send and sync are ready on the local node.",
            "provider": validation["provider"],
            "missing_fields": [],
        }

    def build_sync_message(self, mailbox: dict[str, Any], contacts: list[dict[str, Any]]) -> dict[str, Any]:
        self._require_ready(mailbox, "sync")
        if mailbox.get("status") != "connected":
            raise ValueError(f"Run a connection test for {self.provider_label} before syncing this mailbox.")
        primary_contact = next((contact for contact in contacts if contact.get("email")), None) or {
            "first_name": "Jordan",
            "last_name": "Vale",
            "email": "jordan.vale@prospect.local",
        }
        sender_name = " ".join(part for part in [primary_contact.get("first_name"), primary_contact.get("last_name")] if part).strip() or "Inbound Contact"
        sender_email = primary_contact.get("email") or f"{uuid4().hex[:8]}@prospect.local"
        return {
            "subject": f"{self.provider_label} sync check",
            "body": f"This inbound sample came through the {self.provider_label} adapter. The mailbox is configured and reachable from the local CRM node.",
            "sender_name": sender_name,
            "sender_email": sender_email,
            "recipients": [mailbox.get("address") or "mission@aiocrm.local"],
            "provider_message_id": short_id("provider-inbound"),
            "provider_payload": {
                "mailbox_address": mailbox.get("address"),
                "received_at": utcnow_iso(),
                "adapter": self.provider_name,
            },
        }

    def deliver_outbound(
        self,
        mailbox: dict[str, Any],
        thread: dict[str, Any],
        *,
        body: str,
        sender_name: str,
        sender_email: str,
        recipients: list[str],
    ) -> dict[str, Any]:
        self._require_ready(mailbox, "deliver")
        if mailbox.get("status") != "connected":
            raise ValueError(f"Run a connection test for {self.provider_label} before sending mail.")
        if not recipients:
            raise ValueError("This thread has no deliverable recipient email.")
        return {
            "provider_message_id": short_id("provider-outbound"),
            "delivery_status": "sent",
            "provider_payload": {
                "mailbox_address": mailbox.get("address"),
                "thread_id": thread.get("id"),
                "recipient_count": len(recipients),
                "sent_at": utcnow_iso(),
                "adapter": self.provider_name,
            },
            "body": body,
            "sender_name": sender_name,
            "sender_email": sender_email,
            "recipients": recipients,
        }


class SmtpImapMailAdapter(ExternalProviderMailAdapter):
    provider_name = "smtp-imap"
    provider_label = "SMTP / IMAP"

    @staticmethod
    def _config(mailbox: dict[str, Any]) -> dict[str, Any]:
        return mailbox.get("config") or {}

    def _imap_connection(self, mailbox: dict[str, Any]):
        config = self._config(mailbox)
        host = str(config.get("incoming_host") or "").strip()
        port = int(config.get("incoming_port") or 993)
        username = str(config.get("username") or config.get("email") or mailbox.get("address") or "").strip()
        password = str(config.get("password") or "").strip()
        if port == 993:
            connection = imaplib.IMAP4_SSL(host, port)
        else:
            connection = imaplib.IMAP4(host, port)
        connection.login(username, password)
        return connection

    def _smtp_connection(self, mailbox: dict[str, Any]):
        config = self._config(mailbox)
        host = str(config.get("outgoing_host") or "").strip()
        port = int(config.get("outgoing_port") or 587)
        username = str(config.get("username") or config.get("email") or mailbox.get("address") or "").strip()
        password = str(config.get("password") or "").strip()
        if port == 465:
            connection = smtplib.SMTP_SSL(host, port, timeout=20, context=ssl.create_default_context())
        else:
            connection = smtplib.SMTP(host, port, timeout=20)
            connection.ehlo()
            if port in {587, 25}:
                connection.starttls(context=ssl.create_default_context())
                connection.ehlo()
        connection.login(username, password)
        return connection

    def test_connection(self, mailbox: dict[str, Any]) -> dict[str, Any]:
        validation = self.validate_mailbox(mailbox)
        if not validation["ok"]:
            return {
                "status": "invalid",
                "message": f"Missing required fields: {', '.join(validation['missing_fields'])}",
                "provider": validation["provider"],
                "missing_fields": validation["missing_fields"],
            }
        try:
            imap_conn = self._imap_connection(mailbox)
            imap_conn.logout()
            smtp_conn = self._smtp_connection(mailbox)
            smtp_conn.quit()
        except Exception as error:  # pragma: no cover - network and provider specific
            return {
                "status": "invalid",
                "message": f"SMTP/IMAP connection failed: {error}",
                "provider": self.provider_name,
                "missing_fields": [],
            }
        return {
            "status": "ok",
            "message": "SMTP and IMAP login both succeeded from the local CRM node.",
            "provider": self.provider_name,
            "missing_fields": [],
            "connected_identity": self._config(mailbox).get("email") or mailbox.get("address"),
        }

    def build_sync_message(self, mailbox: dict[str, Any], contacts: list[dict[str, Any]]) -> dict[str, Any] | None:
        self._require_ready(mailbox, "sync")
        if mailbox.get("status") != "connected":
            raise ValueError(f"Run a connection test for {self.provider_label} before syncing this mailbox.")
        config = self._config(mailbox)
        last_uid = int(config.get("last_imap_uid") or 0)
        try:
            connection = self._imap_connection(mailbox)
            connection.select("INBOX")
            if last_uid > 0:
                status, message_ids = connection.uid("search", None, f"UID {last_uid + 1}:*")
            else:
                status, message_ids = connection.uid("search", None, "ALL")
            if status != "OK":
                raise ValueError("Unable to search inbox for new messages.")
            ids = [item for item in (message_ids[0] or b"").split() if item]
            if not ids:
                connection.logout()
                return None
            latest_uid = ids[-1]
            status, data = connection.uid("fetch", latest_uid, "(RFC822)")
            connection.logout()
            if status != "OK" or not data or not data[0]:
                raise ValueError("Unable to fetch the latest IMAP message.")
        except ValueError:
            raise
        except Exception as error:  # pragma: no cover - network and provider specific
            raise ValueError(f"IMAP sync failed: {error}") from error

        raw_message = data[0][1] if isinstance(data[0], tuple) else None
        if not raw_message:
            return None
        message = BytesParser(policy=policy.default).parsebytes(raw_message)
        subject = decode_header_value(message.get("Subject")) or "Imported email"
        sender_name, sender_email = parseaddr(decode_header_value(message.get("From")))
        recipients = [address for _, address in getaddresses(message.get_all("To", []) + message.get_all("Cc", [])) if address]
        body = extract_text_body(message) or "(No readable body found in IMAP message.)"
        return {
            "subject": subject,
            "body": body,
            "sender_name": sender_name or sender_email.split("@")[0] if sender_email else "Inbound Contact",
            "sender_email": sender_email or f"{uuid4().hex[:8]}@prospect.local",
            "recipients": recipients or [mailbox.get("address") or "mission@aiocrm.local"],
            "provider_message_id": decode_header_value(message.get("Message-ID")) or short_id("imap"),
            "provider_payload": {
                "mailbox_address": mailbox.get("address"),
                "received_at": utcnow_iso(),
                "adapter": self.provider_name,
                "imap_uid": latest_uid.decode("utf-8", errors="ignore"),
            },
            "config_updates": {
                "last_imap_uid": latest_uid.decode("utf-8", errors="ignore"),
            },
        }

    def deliver_outbound(
        self,
        mailbox: dict[str, Any],
        thread: dict[str, Any],
        *,
        body: str,
        sender_name: str,
        sender_email: str,
        recipients: list[str],
    ) -> dict[str, Any]:
        self._require_ready(mailbox, "deliver")
        if mailbox.get("status") != "connected":
            raise ValueError(f"Run a connection test for {self.provider_label} before sending mail.")
        if not recipients:
            raise ValueError("This thread has no deliverable recipient email.")

        message = EmailMessage()
        message["Subject"] = thread.get("subject") or "AIO CRM Message"
        message["From"] = f"{sender_name} <{sender_email}>" if sender_name else sender_email
        message["To"] = ", ".join(recipients)
        message["Message-ID"] = f"<{short_id('smtp')}@aiocrm.local>"
        message.set_content(body)

        try:
            connection = self._smtp_connection(mailbox)
            connection.send_message(message)
            connection.quit()
        except Exception as error:  # pragma: no cover - network and provider specific
            raise ValueError(f"SMTP send failed: {error}") from error

        return {
            "provider_message_id": message["Message-ID"],
            "delivery_status": "sent",
            "provider_payload": {
                "mailbox_address": mailbox.get("address"),
                "thread_id": thread.get("id"),
                "recipient_count": len(recipients),
                "sent_at": utcnow_iso(),
                "adapter": self.provider_name,
            },
            "body": body,
            "sender_name": sender_name,
            "sender_email": sender_email,
            "recipients": recipients,
        }


class GmailOAuthMailAdapter(ExternalProviderMailAdapter):
    provider_name = "gmail-oauth"
    provider_label = "Gmail OAuth"

    @staticmethod
    def _config(mailbox: dict[str, Any]) -> dict[str, Any]:
        return mailbox.get("config") or {}

    def _access_token(self, mailbox: dict[str, Any]) -> str:
        validation = self.validate_mailbox(mailbox)
        if not validation["ok"]:
            raise ValueError(f"Missing required fields: {', '.join(validation['missing_fields'])}")
        config = self._config(mailbox)
        response = http_form(
            "https://oauth2.googleapis.com/token",
            {
                "client_id": config.get("client_id"),
                "client_secret": config.get("client_secret"),
                "refresh_token": config.get("refresh_token"),
                "grant_type": "refresh_token",
            },
        )
        token = response.get("access_token")
        if not token:
            raise ValueError("Google token exchange did not return an access token.")
        return token

    def test_connection(self, mailbox: dict[str, Any]) -> dict[str, Any]:
        validation = self.validate_mailbox(mailbox)
        if not validation["ok"]:
            return {
                "status": "invalid",
                "message": f"Missing required fields: {', '.join(validation['missing_fields'])}",
                "provider": validation["provider"],
                "missing_fields": validation["missing_fields"],
            }
        try:
            token = self._access_token(mailbox)
            profile = http_json(
                "https://gmail.googleapis.com/gmail/v1/users/me/profile",
                headers={"Authorization": f"Bearer {token}"},
            )
        except ValueError as error:
            return {"status": "invalid", "message": f"Gmail connection failed: {error}", "provider": self.provider_name, "missing_fields": []}
        return {
            "status": "ok",
            "message": f"Gmail mailbox connected for {profile.get('emailAddress') or mailbox.get('address')}.",
            "provider": self.provider_name,
            "missing_fields": [],
            "connected_identity": profile.get("emailAddress") or mailbox.get("address"),
        }

    def build_sync_message(self, mailbox: dict[str, Any], contacts: list[dict[str, Any]]) -> dict[str, Any] | None:
        self._require_ready(mailbox, "sync")
        if mailbox.get("status") != "connected":
            raise ValueError(f"Run a connection test for {self.provider_label} before syncing this mailbox.")
        token = self._access_token(mailbox)
        config = self._config(mailbox)
        query = "in:inbox"
        last_message_id = config.get("last_message_id")
        if config.get("last_received_after"):
            query = f"{query} after:{config['last_received_after']}"
        listing = http_json(
            f"https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q={query.replace(' ', '+')}",
            headers={"Authorization": f"Bearer {token}"},
        )
        messages = listing.get("messages") or []
        if not messages:
            return None
        candidate = next((item for item in messages if item.get("id") != last_message_id), None)
        if not candidate:
            return None
        payload = http_json(
            f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{candidate['id']}?format=raw",
            headers={"Authorization": f"Bearer {token}"},
        )
        raw_value = payload.get("raw")
        if not raw_value:
            raise ValueError("Gmail did not return a raw message payload.")
        raw_bytes = base64.urlsafe_b64decode(raw_value + "=" * (-len(raw_value) % 4))
        message = BytesParser(policy=policy.default).parsebytes(raw_bytes)
        subject = decode_header_value(message.get("Subject")) or "Imported email"
        sender_name, sender_email = parseaddr(decode_header_value(message.get("From")))
        recipients = [address for _, address in getaddresses(message.get_all("To", []) + message.get_all("Cc", [])) if address]
        body = extract_text_body(message) or payload.get("snippet") or "(No readable body found in Gmail message.)"
        return {
            "subject": subject,
            "body": body,
            "sender_name": sender_name or (sender_email.split("@")[0] if sender_email else "Inbound Contact"),
            "sender_email": sender_email or f"{uuid4().hex[:8]}@prospect.local",
            "recipients": recipients or [mailbox.get("address") or "mission@aiocrm.local"],
            "provider_message_id": payload.get("id") or short_id("gmail"),
            "provider_payload": {
                "mailbox_address": mailbox.get("address"),
                "received_at": utcnow_iso(),
                "adapter": self.provider_name,
                "gmail_message_id": payload.get("id"),
                "thread_id": payload.get("threadId"),
            },
            "config_updates": {
                "last_message_id": payload.get("id"),
                "last_received_after": datetime.now(UTC).strftime("%Y/%m/%d"),
            },
        }

    def deliver_outbound(
        self,
        mailbox: dict[str, Any],
        thread: dict[str, Any],
        *,
        body: str,
        sender_name: str,
        sender_email: str,
        recipients: list[str],
    ) -> dict[str, Any]:
        self._require_ready(mailbox, "deliver")
        if mailbox.get("status") != "connected":
            raise ValueError(f"Run a connection test for {self.provider_label} before sending mail.")
        if not recipients:
            raise ValueError("This thread has no deliverable recipient email.")
        token = self._access_token(mailbox)
        message = EmailMessage()
        message["Subject"] = thread.get("subject") or "AIO CRM Message"
        message["From"] = f"{sender_name} <{sender_email}>"
        message["To"] = ", ".join(recipients)
        message.set_content(body)
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8").rstrip("=")
        result = http_json(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            method="POST",
            headers={"Authorization": f"Bearer {token}"},
            data={"raw": raw},
        )
        return {
            "provider_message_id": result.get("id") or short_id("gmail-outbound"),
            "delivery_status": "sent",
            "provider_payload": {
                "mailbox_address": mailbox.get("address"),
                "thread_id": thread.get("id"),
                "recipient_count": len(recipients),
                "sent_at": utcnow_iso(),
                "adapter": self.provider_name,
                "gmail_thread_id": result.get("threadId"),
            },
            "body": body,
            "sender_name": sender_name,
            "sender_email": sender_email,
            "recipients": recipients,
        }


class Microsoft365OAuthMailAdapter(ExternalProviderMailAdapter):
    provider_name = "microsoft365-oauth"
    provider_label = "Microsoft 365 OAuth"

    @staticmethod
    def _config(mailbox: dict[str, Any]) -> dict[str, Any]:
        return mailbox.get("config") or {}

    def _access_token(self, mailbox: dict[str, Any]) -> str:
        validation = self.validate_mailbox(mailbox)
        if not validation["ok"]:
            raise ValueError(f"Missing required fields: {', '.join(validation['missing_fields'])}")
        config = self._config(mailbox)
        response = http_form(
            f"https://login.microsoftonline.com/{config.get('tenant_id')}/oauth2/v2.0/token",
            {
                "client_id": config.get("client_id"),
                "client_secret": config.get("client_secret"),
                "refresh_token": config.get("refresh_token"),
                "grant_type": "refresh_token",
                "scope": "https://graph.microsoft.com/.default offline_access",
            },
        )
        token = response.get("access_token")
        if not token:
            raise ValueError("Microsoft token exchange did not return an access token.")
        return token

    def test_connection(self, mailbox: dict[str, Any]) -> dict[str, Any]:
        validation = self.validate_mailbox(mailbox)
        if not validation["ok"]:
            return {
                "status": "invalid",
                "message": f"Missing required fields: {', '.join(validation['missing_fields'])}",
                "provider": validation["provider"],
                "missing_fields": validation["missing_fields"],
            }
        try:
            token = self._access_token(mailbox)
            profile = http_json(
                "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
                headers={"Authorization": f"Bearer {token}"},
            )
        except ValueError as error:
            return {"status": "invalid", "message": f"Microsoft 365 connection failed: {error}", "provider": self.provider_name, "missing_fields": []}
        identity = profile.get("mail") or profile.get("userPrincipalName") or mailbox.get("address")
        return {
            "status": "ok",
            "message": f"Microsoft 365 mailbox connected for {identity}.",
            "provider": self.provider_name,
            "missing_fields": [],
            "connected_identity": identity,
        }

    def build_sync_message(self, mailbox: dict[str, Any], contacts: list[dict[str, Any]]) -> dict[str, Any] | None:
        self._require_ready(mailbox, "sync")
        if mailbox.get("status") != "connected":
            raise ValueError(f"Run a connection test for {self.provider_label} before syncing this mailbox.")
        token = self._access_token(mailbox)
        config = self._config(mailbox)
        last_message_id = config.get("last_message_id")
        listing = http_json(
            "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=10&$select=id,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime,internetMessageId&$orderby=receivedDateTime desc",
            headers={"Authorization": f"Bearer {token}"},
        )
        messages = listing.get("value") or []
        candidate = next((item for item in messages if item.get("id") != last_message_id), None)
        if not candidate:
            return None
        sender = candidate.get("from", {}).get("emailAddress", {})
        recipients = []
        for item in (candidate.get("toRecipients") or []) + (candidate.get("ccRecipients") or []):
            address = item.get("emailAddress", {}).get("address")
            if address:
                recipients.append(address)
        return {
            "subject": candidate.get("subject") or "Imported email",
            "body": candidate.get("bodyPreview") or "(No readable preview returned by Microsoft 365.)",
            "sender_name": sender.get("name") or (sender.get("address", "").split("@")[0] if sender.get("address") else "Inbound Contact"),
            "sender_email": sender.get("address") or f"{uuid4().hex[:8]}@prospect.local",
            "recipients": recipients or [mailbox.get("address") or "mission@aiocrm.local"],
            "provider_message_id": candidate.get("internetMessageId") or candidate.get("id") or short_id("m365"),
            "provider_payload": {
                "mailbox_address": mailbox.get("address"),
                "received_at": candidate.get("receivedDateTime") or utcnow_iso(),
                "adapter": self.provider_name,
                "graph_message_id": candidate.get("id"),
            },
            "config_updates": {
                "last_message_id": candidate.get("id"),
            },
        }

    def deliver_outbound(
        self,
        mailbox: dict[str, Any],
        thread: dict[str, Any],
        *,
        body: str,
        sender_name: str,
        sender_email: str,
        recipients: list[str],
    ) -> dict[str, Any]:
        self._require_ready(mailbox, "deliver")
        if mailbox.get("status") != "connected":
            raise ValueError(f"Run a connection test for {self.provider_label} before sending mail.")
        if not recipients:
            raise ValueError("This thread has no deliverable recipient email.")
        token = self._access_token(mailbox)
        http_json(
            "https://graph.microsoft.com/v1.0/me/sendMail",
            method="POST",
            headers={"Authorization": f"Bearer {token}"},
            data={
                "message": {
                    "subject": thread.get("subject") or "AIO CRM Message",
                    "body": {"contentType": "Text", "content": body},
                    "toRecipients": [{"emailAddress": {"address": recipient}} for recipient in recipients],
                },
                "saveToSentItems": True,
            },
        )
        return {
            "provider_message_id": short_id("m365-outbound"),
            "delivery_status": "sent",
            "provider_payload": {
                "mailbox_address": mailbox.get("address"),
                "thread_id": thread.get("id"),
                "recipient_count": len(recipients),
                "sent_at": utcnow_iso(),
                "adapter": self.provider_name,
            },
            "body": body,
            "sender_name": sender_name,
            "sender_email": sender_email,
            "recipients": recipients,
        }


def get_mail_adapter(provider_name: str | None = None) -> BaseMailAdapter:
    adapters: dict[str, type[BaseMailAdapter]] = {
        "local-stub": LocalStubMailAdapter,
        "smtp-imap": SmtpImapMailAdapter,
        "gmail-oauth": GmailOAuthMailAdapter,
        "microsoft365-oauth": Microsoft365OAuthMailAdapter,
    }
    adapter_class = adapters.get((provider_name or "local-stub").lower(), LocalStubMailAdapter)
    return adapter_class()
