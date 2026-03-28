import json
import os
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def http_json(url: str, method: str = "GET", headers: dict | None = None, data: dict | None = None) -> dict:
    encoded = None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if data is not None:
        encoded = json.dumps(data).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = Request(url, data=encoded, headers=request_headers, method=method.upper())
    try:
        with urlopen(request, timeout=30) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise ValueError(f"HTTP {error.code} from {url}: {detail or error.reason}") from error
    except URLError as error:
        raise ValueError(f"Network error while calling {url}: {error.reason}") from error


def http_form(url: str, data: dict) -> dict:
    encoded = urlencode({key: value for key, value in data.items() if value is not None}).encode("utf-8")
    request = Request(
        url,
        data=encoded,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise ValueError(f"HTTP {error.code} from {url}: {detail or error.reason}") from error
    except URLError as error:
        raise ValueError(f"Network error while calling {url}: {error.reason}") from error


GOOGLE_MAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email"
GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email"
MICROSOFT_MAIL_SCOPE = "offline_access Mail.Read Mail.Send User.Read"
MICROSOFT_CALENDAR_SCOPE = "offline_access Calendars.ReadWrite User.Read"


def build_google_authorize_url(client_id: str, redirect_uri: str, state: str, scope: str) -> str:
    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "access_type": "offline",
            "prompt": "consent",
            "scope": scope,
            "state": state,
        }
    )
    return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"


def exchange_google_code(client_id: str, client_secret: str, code: str, redirect_uri: str) -> dict:
    return http_form(
        "https://oauth2.googleapis.com/token",
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )


def google_profile(access_token: str) -> dict:
    return http_json(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )


def google_primary_calendar(access_token: str) -> dict | None:
    listing = http_json(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=20",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    items = listing.get("items") or []
    return next((item for item in items if item.get("primary")), items[0] if items else None)


def google_calendar_list(access_token: str) -> list[dict]:
    listing = http_json(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100",
        headers={"Authorization": f"Bearer {access_token}"},
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


def build_microsoft_authorize_url(client_id: str, tenant_id: str, redirect_uri: str, state: str, scope: str) -> str:
    tenant = tenant_id or "common"
    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "response_mode": "query",
            "scope": scope,
            "state": state,
        }
    )
    return f"https://login.microsoftonline.com/{quote(tenant, safe='')}/oauth2/v2.0/authorize?{query}"


def exchange_microsoft_code(client_id: str, client_secret: str, tenant_id: str, code: str, redirect_uri: str) -> dict:
    tenant = tenant_id or "common"
    return http_form(
        f"https://login.microsoftonline.com/{quote(tenant, safe='')}/oauth2/v2.0/token",
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "scope": MICROSOFT_MAIL_SCOPE + " " + MICROSOFT_CALENDAR_SCOPE,
        },
    )


def microsoft_profile(access_token: str) -> dict:
    return http_json(
        "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
        headers={"Authorization": f"Bearer {access_token}"},
    )


def microsoft_primary_calendar(access_token: str, user_id: str) -> dict | None:
    listing = http_json(
        f"https://graph.microsoft.com/v1.0/users/{quote(user_id, safe='')}/calendars?$top=20&$select=id,name,isDefaultCalendar",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    items = listing.get("value") or []
    return next((item for item in items if item.get("isDefaultCalendar")), items[0] if items else None)


def microsoft_calendar_list(access_token: str, user_id: str) -> list[dict]:
    listing = http_json(
        f"https://graph.microsoft.com/v1.0/users/{quote(user_id, safe='')}/calendars?$top=100&$select=id,name,isDefaultCalendar,canEdit,canShare",
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


def backend_base_url() -> str:
    return os.getenv("BACKEND_PUBLIC_URL") or f"http://localhost:{os.getenv('PORT', '8001')}"
