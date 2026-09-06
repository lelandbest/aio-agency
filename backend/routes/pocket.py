from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from backend.deps import get_provider, get_auth_store, require_session, require_capability, utcnow_iso, clean_text
from backend.orchestration import ExecutionEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pocket", tags=["pocket"])


@router.get("/brief")
async def get_pocket_brief(request: Request, session: dict = Depends(require_session)) -> dict[str, Any]:
    """Lightweight morning / on-the-go executive briefing for mobile viewport."""
    provider = get_provider()
    tenant_id = request.state.tenant_id
    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    # 1. Pending Approvals count
    pending_runs = []
    try:
        with provider._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, command, mode, status, pauseReason, stepsJson, artifactsJson, createdAt
                FROM aiEngineRuns
                WHERE (tenantId = ? OR tenantId IS NULL)
                  AND (status IN ('blocked', 'paused', 'awaiting_approval'))
                ORDER BY createdAt DESC
                LIMIT 20
                """,
                (tenant_id,),
            ).fetchall()
            for r in rows:
                steps = json.loads(r["stepsJson"] or "[]")
                staged_step = next((s for s in steps if s.get("requiresApproval") or s.get("status") == "blocked"), None)
                pending_runs.append({
                    "runId": r["id"],
                    "command": r["command"],
                    "status": r["status"],
                    "pauseReason": r["pauseReason"],
                    "createdAt": r["createdAt"],
                    "stagedIntent": staged_step.get("intent") if staged_step else None,
                    "assignedAgent": staged_step.get("assignedAgent") if staged_step else "ALPHA",
                })
    except Exception as e:
        logger.warning(f"Error reading pending runs for brief: {e}")

    # 2. Today's Calendar events
    today_events = []
    try:
        with provider._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, title, startTime, endTime, location, meetingUrl, guestName
                FROM calendar_events
                WHERE startTime >= ? AND startTime <= ?
                ORDER BY startTime ASC
                LIMIT 10
                """,
                (today_start, today_end),
            ).fetchall()
            today_events = [dict(r) for r in rows]
    except Exception as e:
        logger.warning(f"Error reading calendar for brief: {e}")

    # 3. Unread Comms (SMS & Messages)
    unread_threads = 0
    try:
        with provider._connect() as conn:
            row = conn.execute(
                """
                SELECT COUNT(*) as count
                FROM threads
                WHERE status = 'open' OR automationState = 'needs_reply'
                """
            ).fetchone()
            if row:
                unread_threads = row["count"]
    except Exception as e:
        logger.warning(f"Error reading thread count: {e}")

    return {
        "status": "success",
        "timestamp": utcnow_iso(),
        "summary": {
            "pendingApprovalsCount": len(pending_runs),
            "todayEventsCount": len(today_events),
            "openCommsCount": unread_threads,
        },
        "pendingApprovals": pending_runs[:5],
        "todaySchedule": today_events,
    }


@router.get("/approvals")
async def get_pocket_approvals(request: Request, session: dict = Depends(require_session)) -> dict[str, Any]:
    """List all staged actions currently held at human approval gates."""
    provider = get_provider()
    tenant_id = request.state.tenant_id

    items = []
    try:
        with provider._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, command, mode, status, pauseReason, stepsJson, artifactsJson, contextJson, createdAt
                FROM aiEngineRuns
                WHERE (tenantId = ? OR tenantId IS NULL)
                  AND (status IN ('blocked', 'paused', 'awaiting_approval'))
                ORDER BY createdAt DESC
                LIMIT 50
                """,
                (tenant_id,),
            ).fetchall()

            for r in rows:
                steps = json.loads(r["stepsJson"] or "[]")
                context = json.loads(r["contextJson"] or "{}")
                artifacts = json.loads(r["artifactsJson"] or "[]")

                blocked_step = next(
                    (s for s in steps if s.get("requiresApproval") or s.get("status") in ("blocked", "awaiting_approval")),
                    steps[0] if steps else {},
                )

                items.append({
                    "runId": r["id"],
                    "goal": r["command"],
                    "status": r["status"],
                    "pauseReason": r["pauseReason"],
                    "createdAt": r["createdAt"],
                    "stepId": blocked_step.get("id") or blocked_step.get("stepId"),
                    "intent": blocked_step.get("intent") or "action",
                    "assignedAgent": blocked_step.get("assignedAgent") or "ALPHA",
                    "parameters": blocked_step.get("parameters") or {},
                    "preview": (
                        blocked_step.get("parameters", {}).get("body")
                        or blocked_step.get("parameters", {}).get("message")
                        or blocked_step.get("parameters", {}).get("title")
                        or r["command"]
                    ),
                    "artifacts": artifacts,
                })
    except Exception as e:
        logger.error(f"Failed to fetch approvals: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "success", "count": len(items), "items": items}


@router.post("/approvals/{run_id}/action")
async def execute_pocket_approval(
    run_id: str,
    payload: dict = Body(...),
    request: Request = None,
    session: dict = Depends(require_session),
) -> dict[str, Any]:
    """1-Click mobile thumbs-up / thumbs-down action on a staged step."""
    provider = get_provider()
    tenant_id = request.state.tenant_id
    action = clean_text(payload.get("action") or "approve").lower()
    notes = clean_text(payload.get("notes"))

    if action not in ("approve", "reject", "cancel"):
        raise HTTPException(status_code=400, detail="Action must be 'approve', 'reject', or 'cancel'.")

    if action == "approve":
        try:
            engine = ExecutionEngine(provider)
            # Resume the run
            res = engine.run(
                raw_steps=[],
                mode="resume",
                command="",
                context={"approval_notes": notes, "approved_by": session.get("user", {}).get("id")},
                actor=session.get("user") or {},
                tenant={"id": tenant_id},
                run_id=run_id,
            )
            return {"status": "success", "message": "Approved and resumed.", "result": res}
        except Exception as e:
            logger.error(f"Approval resume error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to resume run: {e}")
    else:
        # Mark as cancelled/rejected
        try:
            with provider._connect() as conn:
                conn.execute(
                    """
                    UPDATE aiEngineRuns
                    SET status = 'rejected', pauseReason = ?, updatedAt = ?
                    WHERE id = ?
                    """,
                    (f"Rejected by operator: {notes}" if notes else "Rejected by operator", utcnow_iso(), run_id),
                )
                conn.commit()
            return {"status": "success", "message": "Run rejected and halted."}
        except Exception as e:
            logger.error(f"Rejection error: {e}")
            raise HTTPException(status_code=500, detail=str(e))


@router.post("/capture")
async def pocket_quick_capture(
    request: Request,
    session: dict = Depends(require_session),
) -> dict[str, Any]:
    """Quick mobile capture (photo, audio snippet, or text note) into Cortex Vault.
    Seamlessly handles both multipart/form-data (PWA camera/mic) and JSON.
    """
    provider = get_provider()
    tenant_id = request.state.tenant_id
    content_type = request.headers.get("content-type", "").lower()

    title = ""
    content = ""
    category = "note"
    item_type = "note"
    file_bytes = None
    filename = None
    file_content_type = None

    if "multipart/form-data" in content_type or "urlencoded" in content_type:
        form = await request.form()
        title = form.get("title") or ""
        content = form.get("content") or form.get("text") or ""
        category = form.get("category") or "note"
        item_type = form.get("type") or "note"
        uploaded = form.get("file")
        if hasattr(uploaded, "read"):
            file_bytes = await uploaded.read()
            filename = getattr(uploaded, "filename", "capture.bin")
            file_content_type = getattr(uploaded, "content_type", "application/octet-stream")
    else:
        try:
            data = await request.json()
            title = data.get("title") or ""
            content = data.get("content") or data.get("text") or ""
            category = data.get("category") or "note"
            item_type = data.get("type") or "note"
        except Exception:
            pass

    item_title = clean_text(title) or (f"Mobile Capture — {datetime.now(UTC).strftime('%b %d, %H:%M')}")
    content = clean_text(content)
    asset_id = None

    if file_bytes and filename:
        try:
            from backend.media_engine import get_media_engine
            engine = get_media_engine()
            upload_res = engine.upload_local_media(
                filename=filename,
                data=file_bytes,
                content_type=file_content_type,
                tenant_id=tenant_id,
                metadata={"source": "pocket_capture", "uploadedBy": session.get("user", {}).get("id")},
            )
            asset_id = (upload_res.get("asset") or {}).get("id") or upload_res.get("id")
            if not content:
                content = f"Uploaded mobile file: {filename}"
        except Exception as e:
            logger.error(f"File upload error in quick capture: {e}")

    # Record in Brain items via provider
    item_id = f"brain-cap-{int(datetime.now(UTC).timestamp())}"
    try:
        created = provider.create_brain_item({
            "id": item_id,
            "tenantId": tenant_id,
            "title": item_title,
            "content": content,
            "category": category,
            "tags": ["CAPTURE:MOBILE", "pocket", item_type],
            "metadata": {"assetId": asset_id, "capturedVia": "pocket_mobile", "type": item_type},
        })
    except Exception as e:
        logger.error(f"Error saving mobile capture: {e}")
        raise HTTPException(status_code=500, detail=f"Database write error: {e}")

    return {
        "status": "success",
        "message": "Saved to Cortex Vault",
        "itemId": item_id,
        "assetId": asset_id,
        "item": {
            "id": item_id,
            "title": item_title,
            "content": content,
            "category": category,
        },
    }


@router.get("/cues")
async def get_pocket_cues(request: Request, session: dict = Depends(require_session)) -> dict[str, Any]:
    """High-contrast mobile/tablet Run-of-Show cues for Tech Directors on set."""
    provider = get_provider()
    # Read active run-of-show or latest event schedule
    try:
        with provider._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, title, description, startTime, endTime, location, guestName
                FROM calendar_events
                ORDER BY startTime ASC
                LIMIT 25
                """
            ).fetchall()
            events = [dict(r) for r in rows]
    except Exception as e:
        events = []

    return {
        "status": "success",
        "timestamp": utcnow_iso(),
        "cues": events,
    }
