"""
Cortex Normalizer — Canonical ingest normalization layer.

All raw ingest payloads pass through here before reaching the Brain.
Ensures structured, predictable records regardless of source.
"""

from datetime import datetime, timezone


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _auto_detect_intent(payload: dict) -> str:
    """Guess intent from payload shape/content when no hint provided."""
    text = (
        payload.get("transcript")
        or payload.get("content")
        or payload.get("rawTranscript")
        or ""
    ).lower()

    if any(kw in text for kw in ["meeting", "discussion", "sync", "standup", "review"]):
        return "meeting"
    if any(kw in text for kw in ["interview", "q&a", "question", "answer"]):
        return "interview"
    if any(kw in text for kw in ["presentation", "talk", "lecture", "webinar"]):
        return "presentation"
    if any(kw in text for kw in ["call", "phone", "conversation"]):
        return "call"
    return "document"


def normalize_ingest_payload(payload: dict) -> dict:
    """
    Normalize any ingest payload into the canonical meeting transcript structure.

    Priority for intent:
    1. payload["intentHint"]
    2. auto-detect from content
    3. default = "document"

    Always returns full structure. Missing fields → null / [].
    Raw content preserved in `raw`, never stored as primary.
    """
    now = utcnow()
    intent_hint = payload.get("intentHint") or payload.get("intent_hint")
    intent = intent_hint if intent_hint else _auto_detect_intent(payload)

    # Extract transcript content
    raw_transcript = (
        payload.get("transcript")
        or payload.get("rawTranscript")
        or payload.get("raw_transcript")
        or payload.get("content")
        or payload.get("text")
        or ""
    )

    # Extract structured fields if already present
    executive_summary = payload.get("executiveSummary") or payload.get("executive_summary")
    key_decisions = payload.get("keyDecisions") or payload.get("key_decisions") or []
    action_items = payload.get("actionItems") or payload.get("action_items") or []
    discussion_highlights = payload.get("discussionHighlights") or payload.get("discussion_highlights") or []
    notes_and_observations = payload.get("notesAndObservations") or payload.get("notes_and_observations") or []

    # Ensure lists
    if not isinstance(key_decisions, list):
        key_decisions = [str(key_decisions)] if key_decisions else []
    if not isinstance(action_items, list):
        action_items = [str(action_items)] if action_items else []
    if not isinstance(discussion_highlights, list):
        discussion_highlights = [str(discussion_highlights)] if discussion_highlights else []
    if not isinstance(notes_and_observations, list):
        notes_and_observations = [str(notes_and_observations)] if notes_and_observations else []

    # Title from payload or auto-generate
    title = payload.get("title") or payload.get("subject") or None

    # Tags based on intent
    intent_tags = {
        "meeting": ["MTG:TRANSCRIPT", "MTG:SUMMARY"],
        "interview": ["INT:TRANSCRIPT", "INT:SUMMARY"],
        "presentation": ["PRES:TRANSCRIPT", "PRES:SUMMARY"],
        "call": ["CALL:TRANSCRIPT", "CALL:SUMMARY"],
    }
    tags = intent_tags.get(intent, ["DOC:TRANSCRIPT", "DOC:SUMMARY"])

    # Merge any user-provided tags
    user_tags = payload.get("tags") or []
    for t in user_tags:
        if t not in tags:
            tags.append(t)

    return {
        "type": intent,
        "title": title,
        "executiveSummary": executive_summary,
        "keyDecisions": key_decisions,
        "actionItems": action_items,
        "discussionHighlights": discussion_highlights,
        "transcript": raw_transcript or None,
        "notesAndObservations": notes_and_observations,
        "tags": tags,
        "metadata": {
            "intentHint": intent_hint,
            "purposeNote": payload.get("purposeNote") or payload.get("purpose_note"),
            "priority": payload.get("priority"),
            "source": {
                "assetId": payload.get("assetId") or payload.get("asset_id"),
                "filename": payload.get("filename") or payload.get("fileName"),
            },
        },
        "raw": {
            "rawTranscript": raw_transcript or None,
            "rawPayload": payload,
        },
        "createdAt": now,
        "updatedAt": now,
    }
