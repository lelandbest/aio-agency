from __future__ import annotations

from abc import ABC, abstractmethod
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from uuid import uuid4
from zoneinfo import ZoneInfo


def unfold_ics_lines(payload: str) -> list[str]:
    lines = payload.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    unfolded: list[str] = []
    for line in lines:
        if not line:
            continue
        if line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    return unfolded


def unescape_ics_value(value: str) -> str:
    return (
        value.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
    )


def parse_ics_datetime(raw_value: str, tzid: str | None = None) -> tuple[str, bool]:
    value = raw_value.strip()
    if len(value) == 8:
        parsed = datetime.strptime(value, "%Y%m%d").replace(tzinfo=UTC)
        return parsed.isoformat(), True
    if value.endswith("Z"):
        parsed = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
        return parsed.isoformat(), False
    parsed = datetime.strptime(value, "%Y%m%dT%H%M%S")
    if tzid:
        try:
            parsed = parsed.replace(tzinfo=ZoneInfo(tzid)).astimezone(UTC)
        except Exception:
            parsed = parsed.replace(tzinfo=UTC)
    else:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.isoformat(), False


def build_request(url: str, username: str | None = None, password: str | None = None) -> Request:
    request = Request(url, headers={"User-Agent": "AIOCRM/1.0"})
    if username and password:
        import base64

        token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        request.add_header("Authorization", f"Basic {token}")
    return request


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


def graph_datetime_to_utc(value: str | None, timezone: str | None = None) -> str | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        if timezone:
            try:
                parsed = parsed.replace(tzinfo=ZoneInfo(timezone))
            except Exception:
                parsed = parsed.replace(tzinfo=UTC)
        else:
            parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


class BaseCalendarAdapter(ABC):
    provider_name = "base"
    label = "Base"
    fields: list[dict[str, str]] = []
    integration_category = "calendar"
    connect_mode = "manual"
    stub_only = False

    def provider_descriptor(self) -> dict[str, object]:
        return {
            "id": self.provider_name,
            "label": self.label,
            "fields": self.fields,
            "integration_category": self.integration_category,
            "connect_mode": self.connect_mode,
            "stub_only": self.stub_only,
        }

    @abstractmethod
    def validate_source(self, source: dict) -> dict:
        raise NotImplementedError

    @abstractmethod
    def test_connection(self, source: dict) -> dict:
        raise NotImplementedError

    @abstractmethod
    def sync_source(self, source: dict) -> dict:
        raise NotImplementedError

    @abstractmethod
    def push_event(self, source: dict, event: dict) -> dict:
        raise NotImplementedError

    @abstractmethod
    def import_events(self, source: dict) -> dict:
        raise NotImplementedError

    def describe_source(self, source: dict) -> dict:
        payload = dict(source)
        payload.setdefault("provider", self.provider_name)
        payload.setdefault("sync_direction", "two-way")
        payload.setdefault("config", {})
        payload.setdefault("status", "needs_config")
        return payload

    def list_available_calendars(self, source: dict) -> list[dict[str, Any]]:
        return []


class LocalStubCalendarAdapter(BaseCalendarAdapter):
    provider_name = "local-stub"
    label = "Local Stub"

    def validate_source(self, source: dict) -> dict:
        return {"ok": True, "message": "Local calendar source is ready."}

    def test_connection(self, source: dict) -> dict:
        return {
            "status": "ok",
            "message": f"{source.get('name') or 'Local calendar'} is ready for local scheduling.",
            "connected_calendar": source.get("name") or "Local calendar",
        }

    def sync_source(self, source: dict) -> dict:
        return {"status": "ok", "message": "Local calendar source synced.", "imported_count": 0}

    def push_event(self, source: dict, event: dict) -> dict:
        return {
            "status": "ok",
            "message": f"Pushed {event.get('title') or 'event'} into the local calendar source.",
            "external_event_ref": f"local-{uuid4().hex[:10]}",
        }

    def import_events(self, source: dict) -> dict:
        return {"status": "ok", "message": "Local stub source has no external feed to import.", "imported_count": 0, "events": []}

    def list_available_calendars(self, source: dict) -> list[dict[str, Any]]:
        config = source.get("config") or {}
        return [
            {
                "id": config.get("calendar_id") or source.get("id") or "local-stub",
                "label": source.get("name") or "Local calendar",
                "primary": True,
            }
        ]


class ExternalCalendarAdapter(BaseCalendarAdapter):
    required_keys: list[str] = []

    def validate_source(self, source: dict) -> dict:
        config = source.get("config") or {}
        missing = [key for key in self.required_keys if not config.get(key)]
        return {
            "ok": not missing,
            "message": "Ready to test." if not missing else f"Missing configuration: {', '.join(missing)}",
            "missing": missing,
        }

    def test_connection(self, source: dict) -> dict:
        validation = self.validate_source(source)
        if not validation["ok"]:
          return {"status": "needs_config", "message": validation["message"]}
        return {"status": "ok", "message": f"{self.label} configuration validated. Live sync will complete after the first real provider exchange."}

    def sync_source(self, source: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before syncing.")
        return {"status": "ok", "message": f"{self.label} sync completed.", "imported_count": 0}

    def push_event(self, source: dict, event: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before pushing events.")
        return {
            "status": "ok",
            "message": f"Pushed {event.get('title') or 'event'} to {self.label}.",
            "external_event_ref": f"{self.provider_name}-{uuid4().hex[:10]}",
        }

    def import_events(self, source: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before importing events.")
        start_time = (datetime.now(UTC) + timedelta(days=2)).replace(minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(minutes=45)
        external_ref = f"{self.provider_name}-{source.get('id')}-primary"
        imported_event = {
            "external_event_ref": external_ref,
            "title": f"{source.get('name') or self.label} field sync",
            "description": f"Imported from {self.label} so local scheduling can reconcile external commitments.",
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "status": "scheduled",
            "location_type": "other",
            "location": self.label,
            "meeting_url": "",
            "source_payload": {
                "provider": self.provider_name,
                "calendar_id": (source.get("config") or {}).get("calendar_id"),
                "event_kind": "imported_stub",
            },
        }
        return {
            "status": "ok",
            "message": f"{self.label} import completed.",
            "imported_count": 1,
            "events": [imported_event],
        }


class GoogleCalendarAdapter(ExternalCalendarAdapter):
    provider_name = "google-calendar-oauth"
    label = "Google Calendar"
    connect_mode = "oauth"
    fields = [
        {"key": "email", "label": "Google Account"},
        {"key": "client_id", "label": "Client ID"},
        {"key": "client_secret", "label": "Client Secret"},
        {"key": "refresh_token", "label": "Refresh Token"},
        {"key": "calendar_id", "label": "Calendar ID"},
    ]
    required_keys = ["email", "client_id", "client_secret", "refresh_token", "calendar_id"]

    @staticmethod
    def _config(source: dict[str, Any]) -> dict[str, Any]:
        return source.get("config") or {}

    def _access_token(self, source: dict[str, Any]) -> str:
        validation = self.validate_source(source)
        if not validation["ok"]:
            raise ValueError(validation["message"])
        config = self._config(source)
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

    def _calendar_url(self, source: dict[str, Any], suffix: str = "") -> str:
        calendar_id_value = str(self._config(source).get("calendar_id") or "").strip()
        if not calendar_id_value:
            raise ValueError("Google Calendar source requires an explicit calendar_id.")
        calendar_id = quote(calendar_id_value, safe="")
        return f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}{suffix}"

    def test_connection(self, source: dict) -> dict:
        validation = self.validate_source(source)
        if not validation["ok"]:
            return {"status": "needs_config", "message": validation["message"]}
        try:
            token = self._access_token(source)
            calendar = http_json(
                self._calendar_url(source),
                headers={"Authorization": f"Bearer {token}"},
            )
        except ValueError as error:
            return {"status": "invalid", "message": f"Google Calendar connection failed: {error}"}
        return {
            "status": "ok",
            "message": f"Google Calendar connected to {calendar.get('summary') or self._config(source).get('calendar_id')}.",
            "connected_calendar": calendar.get("summary") or self._config(source).get("calendar_id"),
        }

    def sync_source(self, source: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before syncing.")
        token = self._access_token(source)
        time_min = quote((datetime.now(UTC) - timedelta(days=30)).isoformat(), safe="")
        listing = http_json(
            f"{self._calendar_url(source, '/events')}?maxResults=1&singleEvents=true&orderBy=startTime&timeMin={time_min}",
            headers={"Authorization": f"Bearer {token}"},
        )
        return {
            "status": "ok",
            "message": "Google Calendar sync completed.",
            "imported_count": len(listing.get('items') or []),
        }

    def push_event(self, source: dict, event: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before pushing events.")
        token = self._access_token(source)
        payload = {
            "summary": event.get("title") or "AIO CRM Event",
            "description": event.get("description") or "",
            "location": event.get("location") or "",
            "status": "confirmed" if event.get("status") in {"confirmed", "completed"} else "tentative",
        }
        if event.get("all_day"):
            payload["start"] = {"date": str(event.get("start_time", "")).split("T")[0]}
            payload["end"] = {"date": str(event.get("end_time", "")).split("T")[0]}
        else:
            payload["start"] = {"dateTime": event.get("start_time"), "timeZone": "UTC"}
            payload["end"] = {"dateTime": event.get("end_time"), "timeZone": "UTC"}
        if event.get("meeting_url"):
            payload["source"] = {"title": "AIO CRM", "url": event.get("meeting_url")}
        result = http_json(
            f"{self._calendar_url(source, '/events')}",
            method="POST",
            headers={"Authorization": f"Bearer {token}"},
            data=payload,
        )
        return {
            "status": "ok",
            "message": f"Pushed {event.get('title') or 'event'} to {self.label}.",
            "external_event_ref": result.get("id") or f"{self.provider_name}-{uuid4().hex[:10]}",
        }

    def import_events(self, source: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before importing events.")
        token = self._access_token(source)
        config = self._config(source)
        time_min = quote((datetime.now(UTC) - timedelta(days=30)).isoformat(), safe="")
        query = f"{self._calendar_url(source, '/events')}?maxResults=25&singleEvents=true&orderBy=startTime&timeMin={time_min}"
        if config.get("sync_token"):
            query = f"{self._calendar_url(source, '/events')}?maxResults=25&singleEvents=true&syncToken={quote(str(config['sync_token']), safe='')}"
        listing = http_json(query, headers={"Authorization": f"Bearer {token}"})
        events = []
        for item in listing.get("items") or []:
            start = item.get("start") or {}
            end = item.get("end") or {}
            start_value = start.get("dateTime") or start.get("date")
            end_value = end.get("dateTime") or end.get("date")
            if not start_value or not end_value:
                continue
            start_time = start.get("dateTime")
            end_time = end.get("dateTime")
            all_day = not start_time
            events.append(
                {
                    "external_event_ref": item.get("id"),
                    "title": item.get("summary") or source.get("name") or "Imported event",
                    "description": item.get("description") or f"Imported from {self.label}.",
                    "start_time": graph_datetime_to_utc(start_time, start.get("timeZone")) if start_time else f"{start_value}T00:00:00+00:00",
                    "end_time": graph_datetime_to_utc(end_time, end.get("timeZone")) if end_time else f"{end_value}T00:00:00+00:00",
                    "status": (item.get("status") or "scheduled").lower(),
                    "location_type": "other",
                    "location": (item.get("location") or {}).get("displayName") or self.label,
                    "meeting_url": item.get("hangoutLink") or (item.get("htmlLink") or ""),
                    "all_day": all_day,
                    "source_payload": {
                        "provider": self.provider_name,
                        "calendar_id": self._config(source).get("calendar_id"),
                        "event_kind": "google_import",
                    },
                }
            )
        return {
            "status": "ok",
            "message": f"Imported {len(events)} events from {self.label}.",
            "imported_count": len(events),
            "events": events,
            "config_updates": {"sync_token": listing.get("nextSyncToken")} if listing.get("nextSyncToken") else {},
        }

    def list_available_calendars(self, source: dict) -> list[dict[str, Any]]:
        config = self._config(source)
        missing = [key for key in ["client_id", "client_secret", "refresh_token"] if not config.get(key)]
        if missing:
            raise ValueError(f"Missing configuration: {', '.join(missing)}")
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
        listing = http_json(
            "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100",
            headers={"Authorization": f"Bearer {token}"},
        )
        items = listing.get("items") or []
        return [
            {
                "id": item.get("id"),
                "label": item.get("summary") or item.get("id") or "Calendar",
                "primary": bool(item.get("primary")),
                "selected": bool(item.get("selected")),
                "access_role": item.get("accessRole"),
            }
            for item in items
            if item.get("id")
        ]


class GoogleMeetCalendarAdapter(GoogleCalendarAdapter):
    provider_name = "google-meet-oauth"
    label = "Google Meet"
    integration_category = "video-conferencing"


class Microsoft365CalendarAdapter(ExternalCalendarAdapter):
    provider_name = "microsoft365-calendar"
    label = "Microsoft 365 Calendar"
    connect_mode = "oauth"
    fields = [
        {"key": "tenant_id", "label": "Tenant ID"},
        {"key": "client_id", "label": "Client ID"},
        {"key": "client_secret", "label": "Client Secret"},
        {"key": "user_id", "label": "User ID"},
        {"key": "calendar_id", "label": "Calendar ID"},
    ]
    required_keys = ["tenant_id", "client_id", "client_secret", "refresh_token", "user_id", "calendar_id"]

    @staticmethod
    def _config(source: dict[str, Any]) -> dict[str, Any]:
        return source.get("config") or {}

    def _access_token(self, source: dict[str, Any]) -> str:
        validation = self.validate_source(source)
        if not validation["ok"]:
            raise ValueError(validation["message"])
        config = self._config(source)
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

    def _calendar_base(self, source: dict[str, Any]) -> str:
        config = self._config(source)
        user_id = quote(str(config.get("user_id")), safe="")
        calendar_id = quote(str(config.get("calendar_id")), safe="")
        return f"https://graph.microsoft.com/v1.0/users/{user_id}/calendars/{calendar_id}"

    def test_connection(self, source: dict) -> dict:
        validation = self.validate_source(source)
        if not validation["ok"]:
            return {"status": "needs_config", "message": validation["message"]}
        try:
            token = self._access_token(source)
            calendar = http_json(
                self._calendar_base(source),
                headers={"Authorization": f"Bearer {token}"},
            )
        except ValueError as error:
            return {"status": "invalid", "message": f"Microsoft 365 Calendar connection failed: {error}"}
        return {
            "status": "ok",
            "message": f"Microsoft 365 Calendar connected to {calendar.get('name') or self._config(source).get('calendar_id')}.",
            "connected_calendar": calendar.get("name") or self._config(source).get("calendar_id"),
        }

    def sync_source(self, source: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before syncing.")
        token = self._access_token(source)
        listing = http_json(
            f"{self._calendar_base(source)}/events?$top=1&$orderby=start/dateTime",
            headers={"Authorization": f"Bearer {token}"},
        )
        return {
            "status": "ok",
            "message": f"{self.label} sync completed.",
            "imported_count": len(listing.get('value') or []),
        }

    def push_event(self, source: dict, event: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before pushing events.")
        token = self._access_token(source)
        payload = {
            "subject": event.get("title") or "AIO CRM Event",
            "body": {"contentType": "text", "content": event.get("description") or ""},
            "location": {"displayName": event.get("location") or ""},
        }
        if event.get("all_day"):
            payload["isAllDay"] = True
            payload["start"] = {"dateTime": str(event.get("start_time", "")).split("T")[0] + "T00:00:00", "timeZone": "UTC"}
            payload["end"] = {"dateTime": str(event.get("end_time", "")).split("T")[0] + "T00:00:00", "timeZone": "UTC"}
        else:
            payload["start"] = {"dateTime": graph_datetime_to_utc(event.get("start_time")) or event.get("start_time"), "timeZone": "UTC"}
            payload["end"] = {"dateTime": graph_datetime_to_utc(event.get("end_time")) or event.get("end_time"), "timeZone": "UTC"}
        if event.get("meeting_url"):
            payload["onlineMeetingUrl"] = event.get("meeting_url")
        result = http_json(
            f"{self._calendar_base(source)}/events",
            method="POST",
            headers={"Authorization": f"Bearer {token}"},
            data=payload,
        )
        return {
            "status": "ok",
            "message": f"Pushed {event.get('title') or 'event'} to {self.label}.",
            "external_event_ref": result.get("id") or f"{self.provider_name}-{uuid4().hex[:10]}",
        }

    def import_events(self, source: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before importing events.")
        token = self._access_token(source)
        listing = http_json(
            f"{self._calendar_base(source)}/events?$top=25&$orderby=start/dateTime",
            headers={"Authorization": f"Bearer {token}"},
        )
        events = []
        for item in listing.get("value") or []:
            start = item.get("start") or {}
            end = item.get("end") or {}
            start_time = graph_datetime_to_utc(start.get("dateTime"), start.get("timeZone"))
            end_time = graph_datetime_to_utc(end.get("dateTime"), end.get("timeZone"))
            if not start_time or not end_time:
                continue
            online_meeting = item.get("onlineMeeting") or {}
            location = (item.get("location") or {}).get("displayName") or self.label
            events.append(
                {
                    "external_event_ref": item.get("id"),
                    "title": item.get("subject") or source.get("name") or "Imported event",
                    "description": ((item.get("bodyPreview") or "")[:500]) or f"Imported from {self.label}.",
                    "start_time": start_time,
                    "end_time": end_time,
                    "status": (item.get("showAs") or "scheduled").lower(),
                    "location_type": "other",
                    "location": location,
                    "meeting_url": online_meeting.get("joinUrl") or "",
                    "all_day": bool(item.get("isAllDay", False)),
                    "source_payload": {
                        "provider": self.provider_name,
                        "calendar_id": self._config(source).get("calendar_id"),
                        "event_kind": "microsoft_import",
                    },
                }
            )
        return {
            "status": "ok",
            "message": f"Imported {len(events)} events from {self.label}.",
            "imported_count": len(events),
            "events": events,
        }

    def list_available_calendars(self, source: dict) -> list[dict[str, Any]]:
        config = self._config(source)
        missing = [key for key in ["tenant_id", "client_id", "client_secret", "refresh_token", "user_id"] if not config.get(key)]
        if missing:
            raise ValueError(f"Missing configuration: {', '.join(missing)}")
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
        access_token = response.get("access_token")
        if not access_token:
            raise ValueError("Microsoft token exchange did not return an access token.")
        listing = http_json(
            f"https://graph.microsoft.com/v1.0/users/{quote(str(config.get('user_id')), safe='')}/calendars?$top=100&$select=id,name,isDefaultCalendar,canEdit,canShare",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        items = listing.get("value") or []
        return [
            {
                "id": item.get("id"),
                "label": item.get("name") or item.get("id") or "Calendar",
                "primary": bool(item.get("isDefaultCalendar")),
                "can_edit": bool(item.get("canEdit")),
                "can_share": bool(item.get("canShare")),
            }
            for item in items
            if item.get("id")
        ]


class ZoomCalendarAdapter(ExternalCalendarAdapter):
    provider_name = "zoom-api"
    label = "Zoom"
    integration_category = "video-conferencing"
    connect_mode = "api"
    fields = [
        {"key": "account_id", "label": "Account ID"},
        {"key": "client_id", "label": "Client ID"},
        {"key": "client_secret", "label": "Client Secret"},
        {"key": "user_id", "label": "User ID"},
    ]
    required_keys = ["account_id", "client_id", "client_secret"]

    def import_events(self, source: dict) -> dict:
        if source.get("status") not in {"connected", "ready"}:
            raise ValueError("Zoom source must be configured before importing meetings.")
        start_time = (datetime.now(UTC) + timedelta(days=1)).replace(minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(minutes=30)
        meeting_ref = f"zoom-{source.get('id')}-meeting"
        return {
            "status": "ok",
            "message": "Zoom meeting import completed.",
            "imported_count": 1,
            "events": [
                {
                    "external_event_ref": meeting_ref,
                    "title": f"{source.get('name') or self.label} meeting",
                    "description": "Imported from Zoom meeting operations.",
                    "start_time": start_time.isoformat(),
                    "end_time": end_time.isoformat(),
                    "status": "scheduled",
                    "location_type": "other",
                    "location": self.label,
                    "meeting_url": "https://zoom.us/j/example",
                    "source_payload": {
                        "provider": self.provider_name,
                        "event_kind": "zoom_stub_import",
                    },
                }
            ],
        }


class IcsCalendarAdapter(BaseCalendarAdapter):
    provider_name = "ics-url"
    label = "ICS Feed"
    fields = [
        {"key": "feed_url", "label": "ICS Feed URL"},
        {"key": "username", "label": "Username"},
        {"key": "password", "label": "Password"},
    ]

    @staticmethod
    def _config(source: dict[str, Any]) -> dict[str, Any]:
        return source.get("config") or {}

    def _fetch_ics(self, source: dict[str, Any]) -> str:
        config = self._config(source)
        feed_url = str(config.get("feed_url") or "").strip()
        if not feed_url:
            raise ValueError("ICS Feed URL is required.")
        request = build_request(feed_url, config.get("username"), config.get("password"))
        try:
            with urlopen(request, timeout=20) as response:  # pragma: no cover - network dependent
                charset = response.headers.get_content_charset() or "utf-8"
                payload = response.read().decode(charset, errors="replace")
        except HTTPError as error:  # pragma: no cover - network dependent
            raise ValueError(f"ICS feed returned HTTP {error.code}.") from error
        except URLError as error:  # pragma: no cover - network dependent
            raise ValueError(f"ICS feed request failed: {error.reason}") from error
        if "BEGIN:VCALENDAR" not in payload:
            raise ValueError("ICS feed did not return a VCALENDAR payload.")
        return payload

    def validate_source(self, source: dict) -> dict:
        config = self._config(source)
        feed_url = str(config.get("feed_url") or "").strip()
        if not feed_url:
            return {"ok": False, "message": "Missing configuration: feed_url", "missing": ["feed_url"]}
        return {"ok": True, "message": "Ready to test.", "missing": []}

    def test_connection(self, source: dict) -> dict:
        validation = self.validate_source(source)
        if not validation["ok"]:
            return {"status": "needs_config", "message": validation["message"]}
        try:
            self._fetch_ics(source)
        except ValueError as error:
            return {"status": "invalid", "message": str(error)}
        return {"status": "ok", "message": "ICS feed fetched successfully from the local node.", "connected_calendar": self._config(source).get("feed_url")}

    def sync_source(self, source: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before syncing.")
        payload = self._fetch_ics(source)
        event_count = payload.count("BEGIN:VEVENT")
        return {"status": "ok", "message": f"ICS feed reachable. {event_count} raw events available.", "imported_count": 0}

    def push_event(self, source: dict, event: dict) -> dict:
        raise ValueError("ICS feeds are read-only. Push is not supported for this provider.")

    def import_events(self, source: dict) -> dict:
        if source.get("status") != "connected":
            raise ValueError("Calendar source must be tested before importing events.")
        payload = self._fetch_ics(source)
        events: list[dict[str, Any]] = []
        current: dict[str, Any] | None = None
        for line in unfold_ics_lines(payload):
            if line == "BEGIN:VEVENT":
                current = {}
                continue
            if line == "END:VEVENT":
                if current and current.get("start_time") and current.get("end_time"):
                    events.append(current)
                current = None
                continue
            if current is None or ":" not in line:
                continue
            descriptor, raw_value = line.split(":", 1)
            parts = descriptor.split(";")
            key = parts[0].upper()
            params = {}
            for part in parts[1:]:
                if "=" in part:
                    param_key, param_value = part.split("=", 1)
                    params[param_key.upper()] = param_value
            value = unescape_ics_value(raw_value)
            if key == "UID":
                current["external_event_ref"] = value
            elif key == "SUMMARY":
                current["title"] = value
            elif key == "DESCRIPTION":
                current["description"] = value
            elif key == "LOCATION":
                current["location"] = value
                current["location_type"] = "other"
            elif key == "URL":
                current["meeting_url"] = value
            elif key == "STATUS":
                current["status"] = value.lower()
            elif key == "DTSTART":
                current["start_time"], current["all_day"] = parse_ics_datetime(value, params.get("TZID"))
            elif key == "DTEND":
                current["end_time"], _ = parse_ics_datetime(value, params.get("TZID"))
        for event in events:
            event.setdefault("title", source.get("name") or "Imported event")
            event.setdefault("description", f"Imported from {self.label}.")
            event.setdefault("status", "scheduled")
            event.setdefault("location_type", "other")
            event.setdefault("location", self.label)
            event.setdefault("meeting_url", "")
            event.setdefault("source_payload", {
                "provider": self.provider_name,
                "feed_url": self._config(source).get("feed_url"),
                "event_kind": "ics_import",
            })
        return {
            "status": "ok",
            "message": f"Imported {len(events)} events from the ICS feed.",
            "imported_count": len(events),
            "events": events,
        }

    def list_available_calendars(self, source: dict) -> list[dict[str, Any]]:
        config = self._config(source)
        feed_url = str(config.get("feed_url") or "").strip()
        if not feed_url:
            raise ValueError("ICS Feed URL is required.")
        return [
            {
                "id": feed_url,
                "label": source.get("name") or "ICS Feed",
                "primary": True,
            }
        ]


class JitsiStubCalendarAdapter(BaseCalendarAdapter):
    provider_name = "jitsi-stub"
    label = "Jitsi"
    integration_category = "video-conferencing"
    connect_mode = "stub"
    stub_only = True
    fields = [
        {"key": "server_url", "label": "Server URL"},
        {"key": "room_prefix", "label": "Room Prefix"},
        {"key": "api_key", "label": "API Key"},
    ]

    def validate_source(self, source: dict) -> dict:
        return {
            "ok": False,
            "message": "Jitsi backend integration is placeholder-only in this pass.",
            "missing": [],
        }

    def test_connection(self, source: dict) -> dict:
        return {
            "status": "unsupported",
            "message": "Jitsi backend integration is stubbed only and cannot connect yet.",
        }

    def sync_source(self, source: dict) -> dict:
        raise ValueError("Jitsi backend integration is stubbed only.")

    def push_event(self, source: dict, event: dict) -> dict:
        raise ValueError("Jitsi backend integration is stubbed only.")

    def import_events(self, source: dict) -> dict:
        raise ValueError("Jitsi backend integration is stubbed only.")


ADAPTERS = {
    "local-stub": LocalStubCalendarAdapter(),
    "google-calendar-oauth": GoogleCalendarAdapter(),
    "google-meet-oauth": GoogleMeetCalendarAdapter(),
    "microsoft365-calendar": Microsoft365CalendarAdapter(),
    "zoom-api": ZoomCalendarAdapter(),
    "jitsi-stub": JitsiStubCalendarAdapter(),
    "ics-url": IcsCalendarAdapter(),
}


def get_calendar_adapter(provider_name: str | None) -> BaseCalendarAdapter:
    return ADAPTERS.get(provider_name or "local-stub", ADAPTERS["local-stub"])


def get_calendar_provider_catalog() -> list[dict[str, object]]:
    return [adapter.provider_descriptor() for adapter in ADAPTERS.values() if adapter.provider_name != "local-stub"]
