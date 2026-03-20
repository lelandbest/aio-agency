import json
from datetime import UTC, datetime
from typing import Any
from urllib import error, request


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def _auth_headers(config: dict[str, Any]) -> dict[str, str]:
    api_key = (config.get("api_key") or "").strip()
    extra = config.get("config") or {}
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["X-API-Key"] = api_key
    signing_secret = (extra.get("signing_secret") or extra.get("signingSecret") or "").strip()
    if signing_secret:
        headers["X-AIO-Signature"] = signing_secret
    return headers


def _safe_url(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None


def test_automation_provider(config: dict[str, Any]) -> dict[str, Any]:
    provider_key = (config.get("provider_key") or "").strip().lower()
    label = config.get("label") or provider_key or "automation"
    base_url = _safe_url(config.get("base_url"))
    extra = config.get("config") or {}
    inbound_webhook_url = _safe_url(extra.get("inbound_webhook_url") or extra.get("inboundWebhookUrl"))
    outbound_webhook_url = _safe_url(extra.get("outbound_webhook_url") or extra.get("outboundWebhookUrl"))

    target_url = outbound_webhook_url or base_url or inbound_webhook_url
    if not target_url:
      raise ValueError("Provide a Base URL or webhook URL before testing this automation provider.")

    headers = {"Content-Type": "application/json", **_auth_headers(config)}
    payload = json.dumps(
        {
            "event": "aio.crm.automation.test",
            "provider": provider_key,
            "label": label,
            "sent_at": utcnow_iso(),
            "message": "Automation provider test from AIO CRM",
        }
    ).encode("utf-8")

    method = "POST" if outbound_webhook_url else "GET"
    body = payload if method == "POST" else None
    req = request.Request(target_url, data=body, headers=headers, method=method)

    try:
        with request.urlopen(req, timeout=20) as response:
            status_code = response.getcode()
            response_body = response.read(240).decode("utf-8", errors="replace")
    except error.HTTPError as exc:
        status_code = exc.code
        response_body = exc.read(240).decode("utf-8", errors="replace")
        if status_code >= 500:
            raise ValueError(f"{label} test failed with HTTP {status_code}.") from exc
    except error.URLError as exc:
        raise ValueError(f"Unable to reach {target_url}: {exc.reason}") from exc

    return {
        "status": "reachable",
        "message": f"{label} responded over {method}.",
        "target_url": target_url,
        "method": method,
        "status_code": status_code,
        "sample": response_body,
        "delivery_at": utcnow_iso(),
    }
