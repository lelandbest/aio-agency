# Charlie VTT — Verbal Command Reference

> Matching is **exact phrase only** (case-insensitive). Say the phrase exactly as listed.
> Hold **CTRL** for ~1s to arm, release to capture.

---

## System Controls
*Always active. Highest priority. No confirmation required.*

| Say | What happens |
|---|---|
| `stop` | Interrupts any running operation |
| `abort` | Same as stop |
| `escape` | Closes / dismisses current UI state |
| `cancel` | Cancels current UI state |

---

## Navigation

| Say | Opens |
|---|---|
| `open brain` | Brain module |
| `open crm` | CRM / Contacts |
| `open contacts` | CRM (alias) |
| `open flows` | Flows list |
| `open flow builder` | Flow builder |
| `open forms` | Forms |
| `open form builder` | Form builder |
| `open media` | Media module |
| `open integrations` | Integrations |
| `open signals` | Signals / Dashboard |
| `open comms` | Comms / Chat |
| `open pipeline` | Pipeline |
| `open orders` | Orders |
| `open help` | Help docs |
| `search contacts` | CRM search view |

---

## Workflows
*Staged for confirmation before executing.*

| Say | What happens |
|---|---|
| `start postbot` | Stages PostBot workflow |
| `start script generator` | Stages script generator |
| `stop script generator` | Stops script generator |
| `start podcast` | Stages podcast workflow |

---

## Staged Actions
*High-impact. Requires confirmation after staging.*

| Say | What happens |
|---|---|
| `send email` | Stages email send |
| `create image` | Stages image generation |
| `create video` | Stages video generation |
| `summarize` | Stages summarization |
| `transcribe media` | Stages media transcription |
| `run flow <name>` | Stages named flow for execution |

---

## Confirmation Keywords
After a staged command, say any of:

`yes` · `confirm` · `go` · `do it` · `sure` · `ok` · `execute` · `run it` · `send it` · `publish it`

---

## Audio Output
Voice responses require:
- ElevenLabs API key configured (`ELEVEN_LABS_API_KEY`)
- Voice toggle **enabled** in the Charlie modal header
- Auto-play **on** — both must be active for audio to play
- Falls back to browser TTS if ElevenLabs is unavailable
