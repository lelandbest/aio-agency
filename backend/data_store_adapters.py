from __future__ import annotations

import base64
import json
import re
from typing import Any
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _camel_key(value: Any) -> str:
    parts = re.findall(r"[A-Za-z0-9]+", _clean(value))
    if not parts:
        return ""
    normalized = [part.lower() for part in parts]
    return normalized[0] + "".join(part[:1].upper() + part[1:] for part in normalized[1:])


def _camelize(value: Any) -> Any:
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            camel_key = _camel_key(key) or _clean(key)
            normalized[camel_key] = _camelize(item)
        return normalized
    if isinstance(value, list):
        return [_camelize(item) for item in value]
    return value


def _result(rows: list[dict[str, Any]]) -> dict[str, Any]:
    normalized_rows = [_camelize(row) for row in rows]
    return {"rows": normalized_rows, "count": len(normalized_rows)}


def _provider_field(config: dict[str, Any] | None, *keys: str) -> Any:
    if not isinstance(config, dict):
        return None
    for key in keys:
        if key in config and config.get(key) not in (None, ""):
            return config.get(key)
    return None


def _config_value(config: dict[str, Any], *keys: str) -> Any:
    nested = config.get("config") or {}
    for key in keys:
        if nested.get(key) not in (None, ""):
            return nested.get(key)
        snake = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key).lower()
        if nested.get(snake) not in (None, ""):
            return nested.get(snake)
    return _provider_field(config, *keys)


def _build_headers(config: dict[str, Any], content_type: str = "application/json") -> dict[str, str]:
    headers: dict[str, str] = {"Accept": "application/json"}
    if content_type:
        headers["Content-Type"] = content_type
    api_key = _clean(_provider_field(config, "apiKey", "api_key"))
    nested = config.get("config") or {}
    username = _clean(_provider_field(nested, "username"))
    password = _clean(_provider_field(nested, "password"))
    auth_header_name = _clean(_provider_field(nested, "authHeaderName")) or "Authorization"
    auth_scheme = _clean(_provider_field(nested, "authScheme")) or "Bearer"
    if api_key:
        headers[auth_header_name] = f"{auth_scheme} {api_key}".strip()
        if auth_header_name.lower() != "x-api-key":
            headers.setdefault("X-API-Key", api_key)
    elif username or password:
        token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        headers["Authorization"] = f"Basic {token}"
    return headers


def _request_json(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, payload: Any = None) -> dict[str, Any]:
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urlrequest.urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"HTTP {exc.code} from {url}: {detail}") from exc
    except urlerror.URLError as exc:
        raise ValueError(f"Unable to reach {url}: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"{url} returned unreadable JSON.") from exc


def _quote_sheet_range(value: str) -> str:
    return urlparse.quote(value, safe="!:$'")


def _column_letter(index: int) -> str:
    result = ""
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result or "A"


def _google_auth_params(config: dict[str, Any]) -> str:
    params = urlparse.parse_qs("")
    api_key = _clean(_provider_field(config, "apiKey", "api_key"))
    if api_key:
        params["key"] = [api_key]
    return urlparse.urlencode(params, doseq=True)


def _google_headers(config: dict[str, Any], *, content_type: str = "application/json") -> dict[str, str]:
    headers = _build_headers(config, content_type)
    access_token = _clean(_config_value(config, "accessToken"))
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def _google_sheet_values(config: dict[str, Any]) -> tuple[list[str], list[dict[str, Any]], str]:
    spreadsheet_id = _clean(_config_value(config, "spreadsheetId"))
    sheet_name = _clean(_config_value(config, "sheetName")) or "Sheet1"
    range_a1 = _clean(_config_value(config, "rangeA1")) or f"{sheet_name}!A:ZZ"
    if not spreadsheet_id:
        raise ValueError("Google Sheets requires spreadsheetId.")
    query = _google_auth_params(config)
    suffix = f"?{query}" if query else ""
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{urlparse.quote(spreadsheet_id, safe='')}/values/{_quote_sheet_range(range_a1)}{suffix}"
    payload = _request_json(url, headers=_google_headers(config, content_type=""))
    values = payload.get("values") or []
    headers = [str(item or "").strip() for item in (values[0] if values else [])]
    rows: list[dict[str, Any]] = []
    for index, row in enumerate(values[1:], start=2):
        record: dict[str, Any] = {"recordId": str(index)}
        for col_index, header in enumerate(headers):
            if not header:
                continue
            record[header] = row[col_index] if col_index < len(row) else ""
        rows.append(record)
    return headers, rows, sheet_name


def _google_ensure_headers(config: dict[str, Any], headers: list[str], incoming_row: dict[str, Any], sheet_name: str) -> list[str]:
    next_headers = [header for header in headers if header]
    for key in incoming_row.keys():
        if key not in next_headers and key != "recordId":
            next_headers.append(key)
    if next_headers == headers:
        return next_headers
    spreadsheet_id = _clean(_config_value(config, "spreadsheetId"))
    query = _google_auth_params(config)
    suffix = f"?valueInputOption=USER_ENTERED{('&' + query) if query else ''}"
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{urlparse.quote(spreadsheet_id, safe='')}/values/{_quote_sheet_range(f'{sheet_name}!A1:{_column_letter(len(next_headers))}1')}{suffix}"
    _request_json(
        url,
        method="PUT",
        headers=_google_headers(config),
        payload={"range": f"{sheet_name}!A1:{_column_letter(len(next_headers))}1", "majorDimension": "ROWS", "values": [next_headers]},
    )
    return next_headers


def _google_append_row(config: dict[str, Any], headers: list[str], row: dict[str, Any], sheet_name: str) -> dict[str, Any]:
    spreadsheet_id = _clean(_config_value(config, "spreadsheetId"))
    query = _google_auth_params(config)
    suffix = f"?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS{('&' + query) if query else ''}"
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{urlparse.quote(spreadsheet_id, safe='')}/values/{_quote_sheet_range(f'{sheet_name}!A:ZZ')}:append{suffix}"
    values = [[row.get(header, "") for header in headers]]
    response = _request_json(
        url,
        method="POST",
        headers=_google_headers(config),
        payload={"range": f"{sheet_name}!A:ZZ", "majorDimension": "ROWS", "values": values},
    )
    updated_range = (((response.get("updates") or {}).get("updatedRange")) or "")
    match = re.search(r"![A-Z]+(\d+):", updated_range)
    record_id = match.group(1) if match else ""
    saved = {**row}
    if record_id:
        saved["recordId"] = record_id
    return saved


def _google_update_row(config: dict[str, Any], headers: list[str], record_id: str, row: dict[str, Any], sheet_name: str) -> dict[str, Any]:
    spreadsheet_id = _clean(_config_value(config, "spreadsheetId"))
    end_col = _column_letter(len(headers))
    row_number = _clean(record_id)
    if not row_number.isdigit():
        raise ValueError("Google Sheets update requires a numeric recordId.")
    query = _google_auth_params(config)
    suffix = f"?valueInputOption=USER_ENTERED{('&' + query) if query else ''}"
    target_range = f"{sheet_name}!A{row_number}:{end_col}{row_number}"
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{urlparse.quote(spreadsheet_id, safe='')}/values/{_quote_sheet_range(target_range)}{suffix}"
    _request_json(
        url,
        method="PUT",
        headers=_google_headers(config),
        payload={"range": target_range, "majorDimension": "ROWS", "values": [[row.get(header, "") for header in headers]]},
    )
    return {"recordId": row_number, **row}


def _airtable_base_url(config: dict[str, Any]) -> str:
    provider_key = _clean(_provider_field(config, "providerKey", "provider_key")).lower()
    fallback = "https://api.airtable.com/v0" if provider_key == "airtable" else ""
    return _clean(_provider_field(config, "baseUrl", "base_url")) or fallback


def _airtable_endpoint(config: dict[str, Any], record_id: str | None = None) -> str:
    base_url = _airtable_base_url(config).rstrip("/")
    base_id = _clean(_config_value(config, "baseId"))
    table_id = _clean(_config_value(config, "tableId"))
    if not base_url or not base_id or not table_id:
        raise ValueError("Airtable-style providers require baseUrl, baseId, and tableId.")
    endpoint = f"{base_url}/{urlparse.quote(base_id, safe='')}/{urlparse.quote(table_id, safe='')}"
    if record_id:
        endpoint = f"{endpoint}/{urlparse.quote(record_id, safe='')}"
    return endpoint


def _extract_records_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(payload.get("records"), list):
        return payload.get("records") or []
    data = payload.get("data")
    if isinstance(data, dict) and isinstance(data.get("records"), list):
        return data.get("records") or []
    if isinstance(data, list):
        return data
    if isinstance(payload.get("rows"), list):
        return payload.get("rows") or []
    return []


def _normalize_airtable_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in records:
        fields = item.get("fields") or {}
        record = {**fields}
        record["recordId"] = item.get("id") or fields.get("recordId") or fields.get("record_id") or ""
        if item.get("createdTime"):
            record.setdefault("createdAt", item.get("createdTime"))
        normalized.append(record)
    return normalized


def _find_row_by_match(rows: list[dict[str, Any]], match_field: str, match_value: Any) -> dict[str, Any] | None:
    target_field = _camel_key(match_field)
    target_value = "" if match_value is None else str(match_value)
    for row in rows:
        for key, value in row.items():
            if _camel_key(key) == target_field and str(value) == target_value:
                return row
    return None


def test_data_store_provider(config: dict[str, Any]) -> dict[str, Any]:
    provider_key = _clean(_provider_field(config, "providerKey", "provider_key")).lower()
    label = _clean(_provider_field(config, "label")) or provider_key or "data store"
    rows = read_data_store_records(config, {})
    return {
        "status": "ok",
        "message": f"{label} responded successfully.",
        "count": rows["count"],
    }


def read_data_store_records(config: dict[str, Any], payload: dict[str, Any] | None = None) -> dict[str, Any]:
    provider_key = _clean(_provider_field(config, "providerKey", "provider_key")).lower()
    request_payload = payload or {}

    if provider_key == "googlesheets":
        _, rows, _ = _google_sheet_values(config)
        limit = request_payload.get("limit")
        if isinstance(limit, int) and limit > 0:
            rows = rows[:limit]
        return _result(rows)

    if provider_key in {"airtable", "aitable"}:
        endpoint = _airtable_endpoint(config)
        params = {}
        if request_payload.get("viewName"):
            params["view"] = request_payload.get("viewName")
        if request_payload.get("maxRecords"):
            params["maxRecords"] = request_payload.get("maxRecords")
        if params:
            endpoint = f"{endpoint}?{urlparse.urlencode(params)}"
        payload_json = _request_json(endpoint, headers=_build_headers(config, ""))
        return _result(_normalize_airtable_records(_extract_records_from_payload(payload_json)))

    raise ValueError(f"Unsupported data store provider: {provider_key}")


def create_data_store_record(config: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    provider_key = _clean(_provider_field(config, "providerKey", "provider_key")).lower()

    if provider_key == "googlesheets":
        headers, _, sheet_name = _google_sheet_values(config)
        next_headers = _google_ensure_headers(config, headers, row, sheet_name)
        saved = _google_append_row(config, next_headers, {k: v for k, v in row.items() if k != "recordId"}, sheet_name)
        return _result([saved])

    if provider_key in {"airtable", "aitable"}:
        endpoint = _airtable_endpoint(config)
        payload_json = _request_json(
            endpoint,
            method="POST",
            headers=_build_headers(config),
            payload={"records": [{"fields": {k: v for k, v in row.items() if k != "recordId"}}], "typecast": True},
        )
        return _result(_normalize_airtable_records(_extract_records_from_payload(payload_json)))

    raise ValueError(f"Unsupported data store provider: {provider_key}")


def update_data_store_record(config: dict[str, Any], record_id: str, row: dict[str, Any]) -> dict[str, Any]:
    provider_key = _clean(_provider_field(config, "providerKey", "provider_key")).lower()

    if provider_key == "googlesheets":
        headers, rows, sheet_name = _google_sheet_values(config)
        existing = next((item for item in rows if str(item.get("recordId")) == str(record_id)), None)
        if not existing:
            raise ValueError("Google Sheets record not found.")
        merged = {**{k: v for k, v in existing.items() if k != "recordId"}, **{k: v for k, v in row.items() if k != "recordId"}}
        next_headers = _google_ensure_headers(config, headers, merged, sheet_name)
        saved = _google_update_row(config, next_headers, str(record_id), merged, sheet_name)
        return _result([saved])

    if provider_key in {"airtable", "aitable"}:
        endpoint = _airtable_endpoint(config, record_id=record_id)
        payload_json = _request_json(
            endpoint,
            method="PATCH",
            headers=_build_headers(config),
            payload={"fields": {k: v for k, v in row.items() if k != "recordId"}, "typecast": True},
        )
        records = payload_json if isinstance(payload_json, list) else [payload_json]
        return _result(_normalize_airtable_records(records))

    raise ValueError(f"Unsupported data store provider: {provider_key}")


def upsert_data_store_record(config: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    row = payload.get("row") or {}
    record_id = _clean(payload.get("recordId") or row.get("recordId"))
    if record_id:
        return update_data_store_record(config, record_id, row)

    match_field = _clean(payload.get("matchField") or payload.get("match_field"))
    match_value = payload.get("matchValue") if "matchValue" in payload else payload.get("match_value")
    if match_field:
        existing = read_data_store_records(config, {}).get("rows") or []
        matched = _find_row_by_match(existing, match_field, match_value)
        if matched and matched.get("recordId"):
            return update_data_store_record(config, str(matched.get("recordId")), row)
    return create_data_store_record(config, row)
