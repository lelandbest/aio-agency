# VTT Phase 1 — Implementation Report

## Goal

Full-stack implementation of a VTT (Voice-to-Command + Conversational "Charlie") system for AIO CRM. Phase 1: command registry parser, PTT keyboard capture, backend service, frontend chat panel, and ElevenLabs voice synthesis playback. Followed by a CTRL PTT switch + voice directory path update.

## Instructions

- No redesigns — implementation only
- Exact-match command parsing, no fuzzy matching
- Charlie handles non-commands only
- VTT commands editable via `VTT_COMMANDS` env var (comma-separated phrases)
- Reserved commands (stop, escape, cancel, abort) are locked
- PTT: hold key 2s to arm, release to capture
- TTS ≤600 chars; fallback to system TTS if ElevenLabs fails
- Voice files saved to `backend/data/voice/`, served at `/api/media/voice/{filename}`
- No contract changes — audioUrl is additive
- Surgical enforcement passes for Integrations status model
- Stage/commit/push after each logical piece

## Discoveries

- `VTTProvider` was added to App.jsx with complex nested edits that required multiple fix-up passes to correct the provider/context tree
- `orchestration.py` already uses `get_media_engine().render_audio()` for ElevenLabs TTS; `ElevenLabsTTSProvider.renderAudio()` saves to `backend/data/audio/` and returns a URL
- `media_engine.py` already has `ElevenLabsTTSProvider` with `DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"` (Rachel) and a `_VOICE_NAME_MAP`
- `_check_provider_connected` in orchestration uses `auth_store.get_social_provider_config(tenant_id, provider_key)` — that method was added in the same session
- `POST /api/media/publish-jobs` was a bypass risk — calls `get_media_engine().publish_asset()` directly, bypassing orchestration guards
- `AIAssistProvider` and `OrchestrationProvider` share `AuthContext.Provider` as a parent in App.jsx
- `aio:navigate` custom event is the standard way modules navigate each other
- `.opencode/` was missing from `.gitignore` — added alongside existing `.codex-runtime/`
- The Media module's `MEDIA_PILL_BASE` was the single source of truth for pill sizing — normalizing it to `min-h-3 px-1.5 py-px text-[5px]` cascaded through all 28 instances

## Accomplished

### VTT Phase 1 — Complete
- `backend/vtt_service.py` — command registry, `parse_command`, `execute_command`, `process_transcript`, `synthesize_voice`
- `backend/server.py` — `POST /api/vtt/command`, `GET /api/vtt/providers`, `VTTRequest` model with `voiceEnabled/voiceProvider/voiceAutoPlay`
- `frontend/src/contexts/VTTContext.jsx` — React context with isOpen/isListening/isArmed/messages/arm/disarm state
- `frontend/src/hooks/useVoiceCommand.js` — PTT keyboard hook (Space, then switched to Ctrl)
- `frontend/src/modules/VoiceCommand/index.jsx` — floating chat panel, command results, Charlie responses, mic toggle, PTT indicator, `<audio>` element, voice settings toggle
- `frontend/src/App.jsx` — VTTProvider + VoiceCommandModule rendered at app root level

### Voice Wiring — Complete
- Mic toggle button removed from input area (header voice toggle only)
- Instruction text updated: `SPACE` → `CTRL`
- Placeholder text updated: `hold Space` → `hold CTRL`
- `voices` state + voice load `useEffect` for race condition handling
- `speakWithSystemVoice()` added: `speechSynthesis.cancel()` guard + Google UK English Female priority
- `request` exported from `backendApi.js`

### Charlie Behavior Lock — Complete
- `backend/agent_runtime.py` `_build_prompt_contract`: when `surface == 'vtt'`, appends BOARDROOM OPERATIONS MODE directive
- Directive classifies into 5 modes: COMMAND / ASSIST / CONFIRMATION / RESULT / CLARIFICATION
- Tone rules: 1–3 sentences, no over-explanation, no role-play, no filler, no fake success
- Confirmation style locked: single sentence, prepared state, "Confirm send?" — never "Are you sure you want me to..."
- Interrupt responses locked: one word only ("Stopped." "Closed." "Canceled.")
- No chatbot, therapist, or hype-coach tone — executive assistant identity preserved
- `synthesize_voice` in vtt_service.py — ElevenLabs direct API call, saves to `backend/data/voice/`, returns `/api/media/voice/{filename}`, graceful fallback
- `voiceEnabled/voiceProvider/voiceAutoPlay` in VTTRequest — gates TTS synthesis
- Frontend plays `audioUrl` via `<audio>` element; system TTS fallback for `voiceEnabled && voiceAutoPlay` when no `audioUrl`
- Mic toggle button in panel header

### CTRL PTT Patch — Complete
- `useVoiceCommand.js` rewritten: Ctrl-only, ignores inputs, no Ctrl shortcut interference, preventDefault only after armed
- `backend/data/voice/` path updated in vtt_service.py
- `/api/media/voice/{filename}` route added to server.py
- `synthesize_voice` URL updated to `/api/media/voice/{filename}`

### Integrations Status Enforcement — Complete
- `_check_provider_connected` in orchestration.py — applied to `_generate_postbot_content`, `_try_publish_to_youtube`, `_publish_asset`
- `get_social_provider_config` in auth_store.py
- `GET /api/flows/{id}/provider-statuses` in server.py
- Provider status warning badge in CustomNode.jsx
- `providerStatuses` state + useEffect injection in FlowBuilder.jsx
- Bypass fix on `POST /api/media/publish-jobs`

### Media Module — Complete
- Top gap: `gap-0` root, removed `pe-4` from content panel
- MON A/B/Control Deck containers: `overflow-hidden`
- UPLINK STATUS: moved to `toolbarRightSlot`, centered, `text-[7px]` pills
- `MEDIA_PILL_BASE`: `min-h-3 px-1.5 py-px text-[5px]`
- All 28 `min-h-6/5`, `px-2.5/3`, `py-1`, `text-[7px]` overrides removed
- Job Queue / Asset Cache / Library cards: equal 2-row structure, trash lower-right, type+time on left
- `.opencode/` added to `.gitignore`

### Recovery — Complete
- FlowBuilder files restored from `33bbc63` (the good recovery commit)
- `orchestration.py` and `server.py` also restored (contained deleted execution visual plumbing)

## Relevant files / directories

### Backend
- `backend/vtt_service.py` — VTT service (command registry, parser, executor, synthesize_voice)
- `backend/server.py` — VTT endpoints, bypass fix, integrations enforcement, `/api/media/voice/` route
- `backend/orchestration.py` — `_check_provider_connected`, guarded execution paths
- `backend/auth_store.py` — `get_auth_store` singleton, `get_social_provider_config` helper
- `backend/agent_runtime.py` — BOARDROOM OPERATIONS MODE injection for `surface == 'vtt'`

### Frontend
- `frontend/src/modules/VoiceCommand/index.jsx` — VTT chat panel
- `frontend/src/contexts/VTTContext.jsx` — VTT React context
- `frontend/src/hooks/useVoiceCommand.js` — CTRL PTT hook
- `frontend/src/App.jsx` — VTTProvider + VoiceCommandModule wired at root
- `frontend/src/services/backendApi.js` — `getFlowProviderStatusesApi`, `runAiCommandApi`
- `frontend/src/modules/Flows/FlowBuilder.jsx` — providerStatuses state + useEffect
- `frontend/src/modules/Flows/components/nodes/CustomNode.jsx` — AlertTriangle warning badge
- `frontend/src/modules/Media/index.jsx` — pill density, uplink toolbar, card layout
- `frontend/src/components/ModuleHeader.jsx` — toolbarCenterSlot always visible (lg:flex → flex)

### Config
- `.gitignore` — added `.opencode/`

## Current State

All Phase 1 files committed and pushed to `main`. Backend and frontend servers running.

**Remaining for Phase 1:**
- Ensure `backend/data/voice/` directory exists (mkdir -p on startup or in vtt_service.py)
- Actually test the full flow: PTT → transcript → command parse → ElevenLabs → playback
- Config: `VTT_COMMANDS` env var support in vtt_service.py (currently hardcoded)
