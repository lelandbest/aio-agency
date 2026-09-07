from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Request
from pydantic import BaseModel

from backend.deps import (
    clean_text,
    get_auth_store,
    get_provider,
    get_request_tenant_id,
    require_capability,
    require_operator,
    reset_request_tenant,
    set_request_tenant_id,
    utcnow_iso,
)
from backend.email_verifier_service import (
    create_bulk_task as create_email_verifier_bulk_task,
    get_bulk_results as get_email_verifier_bulk_results,
    verify_single_email as verify_single_email_address,
)
from backend.orchestration import ExecutionEngine

logger = logging.getLogger(__name__)

router = APIRouter(tags=["crm"])


# --- Models ---

class ContactActivityCreateRequest(BaseModel):
    activityType: str = "note"
    title: str = "Note"
    description: str = ""
    metadata: dict[str, Any] | None = None


class TagCreateRequest(BaseModel):
    name: str
    label: str | None = None
    description: str | None = None
    color: str | None = None
    type: str = "user"


class TagUpdateRequest(BaseModel):
    label: str | None = None
    description: str | None = None
    color: str | None = None


class FormSubmissionRequest(BaseModel):
    formData: dict[str, Any]
    flowRunId: str | None = None


class EmailVerifierConfigUpdateRequest(BaseModel):
    apiKey: str | None = None
    enabled: bool | None = None
    autoVerifyContacts: bool | None = None
    defaultMode: str | None = None


class EmailVerifierSingleRequest(BaseModel):
    email: str | None = None
    contactId: str | None = None
    mode: str | None = None


class EmailVerifierBulkRequest(BaseModel):
    contactIds: list[str] | None = None
    emails: list[str] | None = None
    mode: str | None = None


# --- Helper Functions ---

def normalize_email_verifier_mode(value: str | None, *, default: str = "quick", bulk: bool = False) -> str:
    normalized = str(value or default).strip().lower() or default
    if bulk:
        return "power"
    return "power" if normalized == "power" else "quick"


def _email_verifier_internal_config(config: dict[str, Any] | None) -> dict[str, Any]:
    source = config or {}
    return {
        "id": source.get("id"),
        "tenant_id": source.get("tenantId"),
        "provider": source.get("provider"),
        "api_key": source.get("apiKey"),
        "has_api_key": source.get("hasApiKey"),
        "enabled": source.get("enabled"),
        "auto_verify_contacts": source.get("autoVerifyContacts"),
        "default_mode": source.get("defaultMode"),
        "last_tested_at": source.get("lastTestedAt"),
        "status": source.get("status"),
        "last_error": source.get("lastError"),
    }


def schedule_contact_email_auto_verify(background_tasks: BackgroundTasks, request: Request, contact: dict[str, Any]) -> None:
    provider = get_provider()
    tenant_id = getattr(request.state, "tenant_id", None)
    contact_id = str(contact.get("id") or "").strip()
    email = str(contact.get("email") or "").strip()
    if not tenant_id or not contact_id or not email:
        return
    config = _email_verifier_internal_config(provider.get_email_verifier_config(include_secret=True))
    if not config.get("enabled") or not config.get("auto_verify_contacts", True) or not config.get("api_key"):
        return
    background_tasks.add_task(run_contact_email_auto_verify, tenant_id, contact_id, email)


def run_contact_email_auto_verify(tenant_id: str, contact_id: str, email: str) -> None:
    from backend.data_provider import create_provider
    context_token = set_request_tenant_id(tenant_id)
    background_provider = create_provider()
    try:
        config = _email_verifier_internal_config(background_provider.get_email_verifier_config(include_secret=True))
        if not config.get("enabled") or not config.get("auto_verify_contacts", True) or not config.get("api_key"):
            return
        result = verify_single_email_address(config["api_key"], email, "quick")
        background_provider.apply_email_verification_result(contact_id, result, expected_email=email)
        background_provider.mark_email_verifier_config_status(status="active", last_tested_at=result.get("verifiedAt"))
    except Exception as exc:
        logger.warning("Background email verification failed for contact %s: %s", contact_id, exc)
        try:
            background_provider.mark_email_verifier_config_status(status="error", last_tested_at=utcnow_iso())
        except Exception:
            pass
    finally:
        reset_request_tenant(context_token)


# --- Contact Routes ---

@router.get("/api/contacts")
async def list_contacts():
    provider = get_provider()
    return {"data": provider.list_contacts()}


@router.post("/api/contacts")
async def create_contact(request: Request, background_tasks: BackgroundTasks, payload: dict[str, Any]):
    require_capability(request, "crm.edit", "Only workspace staff or higher can create contacts.")
    provider = get_provider()
    try:
        created = provider.create_contact(payload)
        schedule_contact_email_auto_verify(background_tasks, request, created)
        return {"data": created}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/api/contacts/{contact_id}")
async def update_contact(contact_id: str, request: Request, background_tasks: BackgroundTasks, payload: dict[str, Any]):
    require_capability(request, "crm.edit", "Only workspace staff or higher can update contacts.")
    provider = get_provider()
    try:
        updated = provider.update_contact(contact_id, payload)
        if "email" in payload:
            schedule_contact_email_auto_verify(background_tasks, request, updated)
        return {"data": updated}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/contacts/{contact_id}")
async def delete_contact(contact_id: str, request: Request):
    require_capability(request, "crm.edit", "Only workspace staff or higher can delete contacts.")
    provider = get_provider()
    try:
        provider.delete_contact(contact_id)
        logger.info(f"[DELETE] Contact deleted: {contact_id}")
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/contacts/{contact_id}/restore")
async def restore_contact(contact_id: str, request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can restore contacts.")
    provider = get_provider()
    try:
        provider.restore_contact(contact_id)
        logger.info(f"[RESTORE] Contact restored: {contact_id}")
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/contacts/deleted")
async def list_deleted_contacts(request: Request):
    require_capability(request, "system.view", "Only workspace members can view deleted contacts.")
    provider = get_provider()
    return {"data": provider.list_deleted_contacts()}


@router.delete("/api/contacts")
async def bulk_delete_contacts(request: Request, payload: dict[str, Any] = Body(...)):
    require_capability(request, "system.manage", "Only workspace admins can bulk delete contacts.")
    provider = get_provider()
    ids = payload.get("ids", [])
    confirm = payload.get("confirm", "")
    
    try:
        if ids:
            result = provider.bulk_delete_contacts(ids)
            return {"success": True, "data": result}
        
        if confirm == "DELETE_ALL_CONTACTS":
            all_contacts = provider.list_contacts()
            contact_ids = [c["id"] for c in all_contacts]
            result = provider.bulk_delete_contacts(contact_ids)
            return {"success": True, "data": result}
            
        raise HTTPException(status_code=400, detail="Either 'ids' list or 'confirm' string 'DELETE_ALL_CONTACTS' is required.")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/contacts/{contact_id}/activities")
async def list_contact_activities(contact_id: str):
    provider = get_provider()
    return {"data": provider.list_contact_activities(contact_id)}


@router.post("/api/contacts/{contact_id}/activities")
async def create_contact_activity(contact_id: str, request: Request, payload: ContactActivityCreateRequest):
    require_capability(request, "crm.edit", "Only workspace staff or higher can add CRM activities.")
    provider = get_provider()
    try:
        return {"data": provider.create_contact_activity(contact_id, payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/contacts/{contact_id}/form-submissions")
async def list_contact_form_submissions(contact_id: str):
    provider = get_provider()
    return {"data": provider.list_form_submissions(contact_id)}


# --- Company Routes ---

@router.get("/api/companies")
async def list_companies(request: Request):
    require_capability(request, "system.view", "Only workspace members can view companies.")
    provider = get_provider()
    return {"data": provider.list_companies()}


@router.get("/api/companies/{company_id}")
async def get_company(company_id: str, request: Request):
    require_capability(request, "system.view", "Only workspace members can view companies.")
    provider = get_provider()
    company = provider.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found.")
    return {"data": company}


@router.patch("/api/companies/{company_id}")
async def update_company(company_id: str, request: Request, payload: dict[str, Any]):
    require_capability(request, "system.manage", "Only workspace staff or higher can update companies.")
    provider = get_provider()
    updated = provider.update_company(company_id, payload)
    return {"data": updated}


# --- Tag Routes ---

@router.get("/api/tags")
async def list_tags(prefix: str | None = None):
    provider = get_provider()
    if prefix:
        return {"data": provider.get_tags_by_prefix(prefix)}
    return {"data": provider.list_tags()}


@router.post("/api/tags")
async def create_tag(request: Request, payload: TagCreateRequest):
    require_capability(request, "system.manage", "Only workspace editors or higher can manage tags.")
    provider = get_provider()
    try:
        return {"data": provider.create_tag(payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/api/tags/{tag_id}")
async def update_tag(tag_id: str, request: Request, payload: TagUpdateRequest):
    require_capability(request, "system.manage", "Only workspace editors or higher can manage tags.")
    provider = get_provider()
    try:
        return {"data": provider.update_tag(tag_id, payload.model_dump(exclude_unset=True))}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/tags/{tag_id}")
async def delete_tag(tag_id: str, request: Request):
    require_capability(request, "system.admin", "Only workspace admins can delete tags.")
    provider = get_provider()
    try:
        provider.delete_tag(tag_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# --- Form & CMS Routes ---

@router.get("/api/form-folders")
async def list_form_folders():
    provider = get_provider()
    return {"data": provider.list_form_folders()}


@router.post("/api/form-folders")
async def create_form_folder(request: Request, payload: dict[str, Any]):
    require_capability(request, "crm.edit", "Only workspace staff or higher can manage forms.")
    provider = get_provider()
    try:
        return {"data": provider.create_form_folder(payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/api/form-folders/{folder_id}")
async def update_form_folder(folder_id: str, request: Request, payload: dict[str, Any]):
    require_capability(request, "crm.edit", "Only workspace staff or higher can manage forms.")
    provider = get_provider()
    try:
        return {"data": provider.update_form_folder(folder_id, payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/form-folders/{folder_id}")
async def delete_form_folder(folder_id: str, request: Request):
    require_capability(request, "crm.edit", "Only workspace staff or higher can manage forms.")
    provider = get_provider()
    try:
        return {"data": provider.delete_form_folder(folder_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/forms")
async def list_forms(summary: bool = False):
    provider = get_provider()
    if summary:
        return {"data": provider.list_forms_summary()}
    return {"data": provider.list_forms()}


@router.post("/api/forms")
async def create_form(request: Request, payload: dict[str, Any]):
    require_capability(request, "crm.edit", "Only workspace staff or higher can manage forms.")
    provider = get_provider()
    try:
        return {"data": provider.create_form(payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/api/forms/{form_id}")
async def update_form(form_id: str, request: Request, payload: dict[str, Any]):
    require_capability(request, "crm.edit", "Only workspace staff or higher can manage forms.")
    provider = get_provider()
    try:
        return {"data": provider.update_form(form_id, payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/forms/{form_id}")
async def delete_form(form_id: str, request: Request):
    require_capability(request, "crm.edit", "Only workspace staff or higher can manage forms.")
    provider = get_provider()
    try:
        provider.delete_form(form_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/forms")
async def bulk_delete_forms(request: Request, payload: dict[str, Any] = Body(...)):
    require_capability(request, "system.manage", "Only workspace admins can bulk delete forms.")
    provider = get_provider()
    ids = payload.get("ids", [])
    confirm = payload.get("confirm", "")
    
    try:
        if ids:
            result = provider.bulk_delete_forms(ids)
            return {"success": True, "data": result}
        
        if confirm == "DELETE_ALL_FORMS":
            all_forms = provider.list_forms()
            form_ids = [f["id"] for f in all_forms]
            result = provider.bulk_delete_forms(form_ids)
            return {"success": True, "data": result}
            
        raise HTTPException(status_code=400, detail="Either 'ids' list or 'confirm' string 'DELETE_ALL_FORMS' is required.")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/cms/tables")
async def list_cms_tables(request: Request):
    require_capability(request, "crm.view", "Only workspace members can view CMS tables.")
    provider = get_provider()
    return {"data": provider.list_cms_tables()}


@router.get("/api/cms/tables/{slug}")
async def list_cms_table_data(slug: str, request: Request):
    require_capability(request, "system.view", "Only workspace members can view CMS table data.")
    provider = get_provider()
    return {"data": provider.list_cms_table_data(slug)}


@router.get("/api/forms/by-slug/{slug}")
async def get_form_by_slug(slug: str):
    provider = get_provider()
    form = provider.get_form_by_slug(slug)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return {"data": form}


@router.get("/api/forms/{form_id}")
async def get_form_by_id(form_id: str):
    provider = get_provider()
    form = provider.get_form_by_id(form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return {"data": form}


@router.post("/api/forms/{form_id}/submit")
async def submit_form(form_id: str, request: FormSubmissionRequest):
    provider = get_provider()
    try:
        res = provider.submit_form(form_id, request.formData)
        if request.flowRunId:
            try:
                engine = ExecutionEngine(provider)
                engine.run(
                    raw_steps=[],
                    mode="resume",
                    command="Resuming from form submission",
                    context={"form_data": request.formData},
                    actor={"id": "system"},
                    tenant={"id": get_request_tenant_id()},
                    run_id=request.flowRunId
                )
            except Exception as rex:
                logger.error(f"Failed to resume flow {request.flowRunId} after form submission: {rex}")
        return res
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/forms/by-slug/{slug}/submit")
async def submit_form_by_slug(slug: str, request: FormSubmissionRequest):
    provider = get_provider()
    form = provider.get_form_by_slug(slug)
    if not form:
        raise HTTPException(status_code=404, detail=f"Form with slug '{slug}' not found")
    form_id = str(form.get("id"))
    return await submit_form(form_id, request)


# --- Email Verifier Routes ---

@router.get("/api/email-verifier/config")
async def get_email_verifier_config(request: Request):
    require_operator(request, "Only operators can manage email verification.")
    require_capability(request, "system.view", "Only workspace members can view email verification settings.")
    provider = get_provider()
    return {"data": provider.get_email_verifier_config(include_secret=False)}


@router.patch("/api/email-verifier/config")
async def update_email_verifier_config(request: Request, payload: EmailVerifierConfigUpdateRequest):
    require_operator(request, "Only operators can manage email verification.")
    require_capability(request, "system.admin", "Only workspace admins can update email verification settings.")
    provider = get_provider()
    data = payload.model_dump(exclude_unset=True)
    data["defaultMode"] = normalize_email_verifier_mode(data.get("defaultMode"), default="quick")
    if "enabled" in data and data.get("enabled") and not str(data.get("apiKey") or provider.get_email_verifier_config(include_secret=True).get("apiKey") or "").strip():
        raise HTTPException(status_code=400, detail="An API key is required to enable email verification.")
    return {"data": provider.upsert_email_verifier_config(data)}


@router.post("/api/email-verifier/config/test")
async def test_email_verifier_config(request: Request):
    require_operator(request, "Only operators can manage email verification.")
    require_capability(request, "system.admin", "Only workspace admins can test email verification settings.")
    provider = get_provider()
    config = provider.get_email_verifier_config(include_secret=True)
    if not str(config.get("apiKey") or "").strip():
        raise HTTPException(status_code=400, detail="Email verification is not configured for this tenant.")
    try:
        verify_single_email_address(config["apiKey"], "support@reoon.com", "quick")
        updated = provider.upsert_email_verifier_config({
            "apiKey": config.get("apiKey") or "",
            "enabled": config.get("enabled", False),
            "autoVerifyContacts": config.get("autoVerifyContacts", True),
            "defaultMode": config.get("defaultMode", "quick"),
            "lastTestedAt": utcnow_iso(),
            "status": "active" if config.get("enabled") else "disabled",
            "lastError": None,
        })
        return {
            "result": {"success": True, "message": "Reoon connection verified."},
            "data": updated,
        }
    except ValueError as error:
        provider.mark_email_verifier_config_status(status="error", last_tested_at=utcnow_iso(), last_error=str(error))
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.delete("/api/email-verifier/config")
async def delete_email_verifier_config(request: Request):
    require_operator(request, "Only operators can manage email verification.")
    require_capability(request, "system.admin", "Only workspace admins can update email verification settings.")
    provider = get_provider()
    return {"data": provider.delete_email_verifier_config()}


@router.post("/api/email-verifier/verify")
async def verify_email_address_endpoint(request: Request, payload: EmailVerifierSingleRequest):
    require_operator(request, "Only operators can verify emails.")
    require_capability(request, "system.manage", "Only workspace staff or higher can verify emails.")
    provider = get_provider()
    config = _email_verifier_internal_config(provider.get_email_verifier_config(include_secret=True))
    if not config.get("enabled") or not config.get("api_key"):
        raise HTTPException(status_code=400, detail="Email verification is not configured for this tenant.")

    resolved_email = str(payload.email or "").strip().lower()
    if payload.contactId and not resolved_email:
        targets = provider.resolve_email_verification_targets(contact_ids=[payload.contactId])
        if not targets:
            raise HTTPException(status_code=400, detail="The contact does not have a verifiable email address.")
        resolved_email = str(targets[0].get("email") or "").strip().lower()
    if not resolved_email:
        raise HTTPException(status_code=400, detail="Email is required.")

    mode = normalize_email_verifier_mode(payload.mode, default=config.get("default_mode") or "quick")
    try:
        result = verify_single_email_address(config["api_key"], resolved_email, mode)
        provider.mark_email_verifier_config_status(status="active", last_tested_at=result.get("verifiedAt"))
        if payload.contactId:
            updated_contact = provider.apply_email_verification_result(payload.contactId, result, expected_email=resolved_email)
            return {"data": {**result, "contact": updated_contact}}
        return {"data": result}
    except ValueError as error:
        provider.mark_email_verifier_config_status(status="error", last_tested_at=utcnow_iso())
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/api/email-verifier/bulk")
async def create_email_verifier_bulk(request: Request, payload: EmailVerifierBulkRequest):
    require_operator(request, "Only operators can verify emails.")
    require_capability(request, "system.manage", "Only workspace staff or higher can verify emails.")
    provider = get_provider()
    config = _email_verifier_internal_config(provider.get_email_verifier_config(include_secret=True))
    if not config.get("enabled") or not config.get("api_key"):
        raise HTTPException(status_code=400, detail="Email verification is not configured for this tenant.")

    targets = provider.resolve_email_verification_targets(contact_ids=payload.contactIds, emails=payload.emails)
    if not targets:
        raise HTTPException(status_code=400, detail="No verifiable emails were provided.")

    emails = [str(item.get("email") or "").strip().lower() for item in targets if str(item.get("email") or "").strip()]
    try:
        remote_task = create_email_verifier_bulk_task(
            config["api_key"],
            emails,
            normalize_email_verifier_mode(payload.mode, default="power", bulk=True),
            task_name=f"crm-{get_request_tenant_id()}",
        )
        provider.mark_email_verifier_config_status(status="active", last_tested_at=utcnow_iso())
        task = provider.create_email_verification_task({
            "provider_task_id": remote_task["providerTaskId"],
            "status": "queued",
            "mode": remote_task["mode"],
            "submitted_count": remote_task["submittedCount"],
            "completed_count": 0,
            "targets": targets,
        })
        return {"data": task}
    except ValueError as error:
        provider.mark_email_verifier_config_status(status="error", last_tested_at=utcnow_iso())
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.get("/api/email-verifier/bulk/{task_id}")
async def get_email_verifier_bulk_task(task_id: str, request: Request):
    require_operator(request, "Only operators can verify emails.")
    require_capability(request, "system.view", "Only workspace members can view email verification tasks.")
    provider = get_provider()
    task = provider.get_email_verification_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Email verification task not found.")
    if task.get("status") in {"completed", "failed"} and task.get("completed_at"):
        return {"data": task}

    config = _email_verifier_internal_config(provider.get_email_verifier_config(include_secret=True))
    if not config.get("api_key"):
        task = provider.update_email_verification_task(task_id, {"status": "failed", "completed_at": utcnow_iso(), "last_error": "Email verifier API key is missing."})
        raise HTTPException(status_code=400, detail="Email verification is not configured for this tenant.")

    try:
        remote = get_email_verifier_bulk_results(config["api_key"], task.get("provider_task_id"))
        updates = {
            "status": remote["status"],
            "submitted_count": remote["submittedCount"] or task.get("submitted_count") or 0,
            "completed_count": remote["completedCount"],
            "valid_count": remote["validCount"],
            "risky_count": remote["riskyCount"],
            "invalid_count": remote["invalidCount"],
            "unknown_count": remote["unknownCount"],
            "last_error": None,
        }
        if remote["status"] == "completed":
            updates["completed_at"] = utcnow_iso()
            provider.apply_email_verification_task_results(task_id, remote["results"])
        task = provider.update_email_verification_task(task_id, updates)
        provider.mark_email_verifier_config_status(status="active", last_tested_at=utcnow_iso())
        return {"data": task}
    except ValueError as error:
        task = provider.update_email_verification_task(task_id, {"status": "failed", "completed_at": utcnow_iso(), "last_error": str(error)})
        provider.mark_email_verifier_config_status(status="error", last_tested_at=utcnow_iso())
        return {"data": task}


# --- Orders Endpoints ---

@router.get("/api/orders")
async def list_orders():
    provider = get_provider()
    return {"data": provider.list_orders()}


@router.post("/api/orders")
async def create_order(request: Request, payload: dict[str, Any] = Body(...)):
    require_capability(request, "crm.edit", "Only workspace staff or higher can manage orders.")
    provider = get_provider()
    try:
        return {"data": provider.create_order(payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/orders/{order_id}")
async def get_order(order_id: str):
    provider = get_provider()
    order = provider.get_order_by_id(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"data": order}


@router.put("/api/orders/{order_id}")
@router.patch("/api/orders/{order_id}")
async def update_order(order_id: str, request: Request, payload: dict[str, Any] = Body(...)):
    require_capability(request, "crm.edit", "Only workspace staff or higher can manage orders.")
    provider = get_provider()
    try:
        return {"data": provider.update_order(order_id, payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/orders/{order_id}")
async def delete_order(order_id: str, request: Request):
    require_capability(request, "crm.edit", "Only workspace staff or higher can manage orders.")
    provider = get_provider()
    provider.delete_order(order_id)
    return {"success": True}
