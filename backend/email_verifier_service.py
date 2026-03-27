from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest


REOON_SINGLE_VERIFY_URL = "https://emailverifier.reoon.com/api/v1/verify"
REOON_BULK_CREATE_URL = "https://emailverifier.reoon.com/api/v1/create-bulk-verification-task/"
REOON_BULK_RESULT_URL = "https://emailverifier.reoon.com/api/v1/get-result-bulk-verification-task/"

SINGLE_VERIFY_MODES = {"quick", "power"}
BULK_VERIFY_MODES = {"power"}


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def _normalize_email(value: str | None) -> str:
    return str(value or "").strip().lower()


def _parse_score(value: Any) -> float | None:
    if value in {None, ""}:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _request_json(url: str, *, method: str = "GET", payload: dict[str, Any] | None = None, timeout: int = 45) -> dict[str, Any]:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urlrequest.Request(url, data=body, headers=headers, method=method.upper())
    try:
        with urlrequest.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8") or "{}")
    except urlerror.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(error_body or "{}")
        except json.JSONDecodeError:
            payload = {}
        detail = payload.get("reason") or payload.get("detail") or payload.get("message") or error_body or str(exc)
        raise ValueError(detail) from exc
    except urlerror.URLError as exc:
        raise ValueError(str(exc.reason or exc)) from exc


def map_reoon_status(result: dict[str, Any], mode: str = "power") -> dict[str, Any]:
    provider_status = str(result.get("status") or "").strip().lower()
    if provider_status in {"safe", "valid"}:
        normalized_status = "valid"
    elif provider_status in {"catch_all", "role_account", "inbox_full"}:
        normalized_status = "risky"
    elif provider_status in {"invalid", "disabled", "disposable", "spamtrap"}:
        normalized_status = "invalid"
    else:
        normalized_status = "unknown"

    is_safe_to_send = bool(result.get("is_safe_to_send")) if "is_safe_to_send" in result else normalized_status == "valid"
    score = _parse_score(result.get("overall_score"))
    normalized_email = _normalize_email(result.get("email"))

    return {
        "email": normalized_email,
        "providerStatus": provider_status or "unknown",
        "status": normalized_status,
        "is_safe_to_send": is_safe_to_send,
        "score": score,
        "verificationMode": str(result.get("verification_mode") or mode or "quick").strip().lower() or "quick",
        "verifiedAt": utcnow_iso(),
        "flags": {
            "is_valid_syntax": bool(result.get("is_valid_syntax")) if "is_valid_syntax" in result else None,
            "is_disposable": bool(result.get("is_disposable")) if "is_disposable" in result else None,
            "is_role_account": bool(result.get("is_role_account")) if "is_role_account" in result else None,
            "is_catch_all": bool(result.get("is_catch_all")) if "is_catch_all" in result else None,
            "has_inbox_full": bool(result.get("has_inbox_full")) if "has_inbox_full" in result else None,
            "is_disabled": bool(result.get("is_disabled")) if "is_disabled" in result else None,
            "is_deliverable": bool(result.get("is_deliverable")) if "is_deliverable" in result else None,
            "is_spamtrap": bool(result.get("is_spamtrap")) if "is_spamtrap" in result else None,
            "mx_accepts_mail": bool(result.get("mx_accepts_mail")) if "mx_accepts_mail" in result else None,
        },
        "raw": result,
    }


def verify_single_email(api_key: str, email: str, mode: str = "quick") -> dict[str, Any]:
    normalized_mode = str(mode or "quick").strip().lower() or "quick"
    if normalized_mode not in SINGLE_VERIFY_MODES:
        raise ValueError("Unsupported verification mode.")
    normalized_email = _normalize_email(email)
    if not normalized_email:
        raise ValueError("Email is required.")
    if not str(api_key or "").strip():
        raise ValueError("Email verifier API key is missing.")

    query = urlparse.urlencode({
        "email": normalized_email,
        "key": str(api_key).strip(),
        "mode": normalized_mode,
    })
    response = _request_json(f"{REOON_SINGLE_VERIFY_URL}?{query}", timeout=90 if normalized_mode == "power" else 20)
    if str(response.get("status") or "").strip().lower() == "error":
        raise ValueError(str(response.get("reason") or "Email verification failed."))
    return map_reoon_status(response, normalized_mode)


def create_bulk_task(api_key: str, emails: list[str], mode: str = "power", *, task_name: str | None = None) -> dict[str, Any]:
    normalized_mode = str(mode or "power").strip().lower() or "power"
    if normalized_mode not in BULK_VERIFY_MODES:
        raise ValueError("Bulk verification supports power mode only.")
    if not str(api_key or "").strip():
        raise ValueError("Email verifier API key is missing.")

    unique_emails = sorted({_normalize_email(item) for item in (emails or []) if _normalize_email(item)})
    if not unique_emails:
        raise ValueError("At least one email is required.")

    response = _request_json(
        REOON_BULK_CREATE_URL,
        method="POST",
        payload={
            "name": str(task_name or "AIO CRM Bulk Verification")[:25],
            "emails": unique_emails,
            "key": str(api_key).strip(),
        },
    )
    if str(response.get("status") or "").strip().lower() != "success":
        raise ValueError(str(response.get("reason") or "Bulk email verification task creation failed."))
    return {
        "providerTaskId": str(response.get("task_id") or "").strip(),
        "submittedCount": int(response.get("count_submitted") or len(unique_emails)),
        "processingCount": int(response.get("count_processing") or len(unique_emails)),
        "duplicateCount": int(response.get("count_duplicates_removed") or 0),
        "rejectedCount": int(response.get("count_rejected_emails") or 0),
        "mode": normalized_mode,
    }


def _map_bulk_provider_status(status: str) -> str:
    normalized = str(status or "").strip().lower()
    if normalized in {"waiting", "queued"}:
        return "queued"
    if normalized == "running":
        return "running"
    if normalized == "completed":
        return "completed"
    return "failed"


def get_bulk_results(api_key: str, task_id: str) -> dict[str, Any]:
    normalized_task_id = str(task_id or "").strip()
    if not normalized_task_id:
        raise ValueError("Bulk task id is required.")
    if not str(api_key or "").strip():
        raise ValueError("Email verifier API key is missing.")

    query = urlparse.urlencode({
        "key": str(api_key).strip(),
        "task_id": normalized_task_id,
    })
    response = _request_json(f"{REOON_BULK_RESULT_URL}?{query}")
    if str(response.get("status") or "").strip().lower() == "error":
        raise ValueError(str(response.get("reason") or "Bulk email verification task lookup failed."))

    provider_status = str(response.get("status") or "").strip().lower()
    raw_results = response.get("results") if isinstance(response.get("results"), dict) else {}
    normalized_results: dict[str, dict[str, Any]] = {}
    for raw_email, raw_result in raw_results.items():
        if not isinstance(raw_result, dict):
            continue
        normalized = map_reoon_status({**raw_result, "email": raw_result.get("email") or raw_email}, "power")
        if normalized["email"]:
            normalized_results[normalized["email"]] = normalized

    counts = {
        "valid": 0,
        "risky": 0,
        "invalid": 0,
        "unknown": 0,
    }
    for item in normalized_results.values():
        counts[item["status"]] = counts.get(item["status"], 0) + 1

    return {
        "providerTaskId": normalized_task_id,
        "providerStatus": provider_status or "unknown",
        "status": _map_bulk_provider_status(provider_status),
        "submittedCount": int(response.get("count_total") or 0),
        "completedCount": int(response.get("count_checked") or 0),
        "progressPercentage": float(response.get("progress_percentage") or 0),
        "validCount": counts["valid"],
        "riskyCount": counts["risky"],
        "invalidCount": counts["invalid"],
        "unknownCount": counts["unknown"],
        "results": normalized_results,
        "raw": response,
    }
