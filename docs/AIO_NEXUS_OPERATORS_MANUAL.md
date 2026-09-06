# AIO NEXUS v2 — Operator's Manual & Complete System Guide
**Version**: 2.0.0 // **Classification**: Solo Operator Appliance // **Platform**: Local-First & Cloud-Agnostic

---

## Executive Summary: The Local Appliance Philosophy

**AIO Nexus v2** is a private, zero-cloud-rent neural appliance engineered exclusively for **Single Operator Businesses (SOBs)**:
* **Podcasters & Content Creators:** Automated guest intake, local speech-to-text, AI show notes, audiogram generation, and 5-channel social distribution.
* **Live Event Technical Directors:** On-set Run-of-Show cue sheets, high-contrast OLED countdown timers, slide cue notes, and real-time contingency orchestration.
* **Video Editors & Multimedia Producers:** Local Remotion automated video renders, BOOM local recorder, subtitle generation, and Forge asset synthesis.
* **Graphic & Presentation Designers:** Rapid brief intake, brand kit management, local image asset pipelines, and client review surfaces.

### Core Principles
1. **Zero Cloud Rent:** No recurring monthly SaaS subscriptions, no third-party database fees, and no per-token hosted LLM bills. AI runs locally on your machine via Ollama and local models.
2. **Local Data Sovereignty:** All contacts, conversation logs, media clips, and knowledge memories reside strictly on your physical machine in high-performance SQLite databases.
3. **Dual-Surface Operations:** A high-density **Desktop Cockpit** for deep studio execution and a touch-first **Mobile Pocket Cockpit** (PWA) for when the operator is on set, backstage, or in transit.

---

## 1. System Quickstart & Daily Boot

### Starting the Appliance
To start both the FastAPI backend and the Vite React frontend in one click, run:
```cmd
cd d:\AIOCRM
start-nexus.bat
```

The launcher will:
1. Verify Python 3.11+ and Node.js environments.
2. Probe your local Ollama instance on `http://localhost:11434` to verify neural embedding status.
3. Launch the modular FastAPI backend on port `8001`.
4. Poll the backend health check until verified healthy.
5. Launch the Vite React frontend on port `3000`.
6. Automatically open your default browser to `http://localhost:3000`.

### Active Service Endpoints
| Component | URL | Purpose |
| :--- | :--- | :--- |
| **Desktop Cockpit** | `http://localhost:3000` | Full studio workstation with sidebar, tabs, and canvases |
| **Pocket Cockpit** | `http://localhost:3000?view=pocket` | Touch-first mobile cockpit for smartphones and tablets |
| **Backend REST API** | `http://localhost:8001/api/health` | Diagnostic telemetry and appliance status |

### Default Operator Credentials
* **Email:** `support@aiocrm.org` *(or `admin@aio.com`)*
* **Password:** `aioadmin123`

*(You can change your password at any time under **Settings -> Profile**).*

---

## 2. System Architecture & Workstation Layout

The workstation layout is organized into 5 primary operational centers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AIO NEXUS DESKTOP COCKPIT                       │
├───────────────┬────────────────────────────────────────────────────────┤
│ SIDEBAR       │ TOPBAR: System Status • Charlie Voice • Dialer • Boom  │
│ ├─ Cortex     ├────────────────────────────────────────────────────────┤
│ ├─ Studio     │                                                        │
│ ├─ Flows      │                   ACTIVE DOMAIN MODULE                 │
│ ├─ CRM        │                                                        │
│ ├─ Comms      │  (Cortex Vault / Media Studio / Run-of-Show / Flows)   │
│ ├─ Signals    │                                                        │
│ ├─ Agents     │                                                        │
│ └─ Settings   │                                                        │
├───────────────┴────────────────────────────────────────────────────────┤
│ STATUS BAR: Ollama Status • Queue • Active Tenant • Local SQLite Sync │
└────────────────────────────────────────────────────────────────────────┘
```

### Navigation Map
* **Cortex (Brain):** The global knowledge vault, vector retrieval, transcripts, and contextual memory.
* **Studio (Media):** Audio/video player, Remotion template renderer, waveform trimmer, and Forge asset pipeline.
* **Flows:** Node-based automation canvas for chaining triggers, AI specialists, and output actions.
* **CRM:** Contact dossiers, customer lifecycles, deal stages, and custom intake forms.
* **Comms:** Unified 2-way SMS threads, voice calls with dialer, mailboxes, and calendar appointments.
* **Signals:** Real-time event triage, automated background alerts, and execution logs.
* **Agents:** Specialist roster, execution policies, personality configuration, and prompt contracts.
* **Settings:** Branding, local variables, operator profiles, and emergency governance.

---

## 3. The Neural Cortex & Knowledge Retrieval

The **Cortex** is the persistent memory bank of the appliance. Whenever you ingest transcripts, client briefs, tech riders, or show notes, Cortex indexes them for instant retrieval.

### Local Vector Embeddings (Zero Cloud Rent)
* **Model:** Ollama `nomic-embed-text` (768-dimensional local vectors).
* **Hybrid Search (RRF):** Combines dense vector cosine similarity with fast SQLite BM25 keyword matching. If Ollama is offline or suspended, Cortex automatically falls back to keyword matching seamlessly.
* **Push to Brain:** Any transcript generated in Studio or note taken on mobile can be pushed into Cortex with one click, immediately making it queryable by all 14 AI specialist agents.

---

## 4. The 14 AI Specialists & Autonomous Workflows

AIO Nexus features 14 specialized autonomous personas. You can direct them via natural language commands, voice directives, or node flows:

| Specialist | Role | Core Capabilities |
| :--- | :--- | :--- |
| **CHARLIE** | Intake & Commander | Natural language command parsing, voice directives, morning briefings |
| **ALPHA** | Execution Chief | Multi-step task decomposition, workflow sequencing, error recovery |
| **VECTOR** | Visual & Design | Graphic hierarchy, layout evaluation, asset styling, slide deck themes |
| **STRIKER** | Sales & Closing | Proposal generation, negotiation scripts, objection handling |
| **HAMMER** | Integration & Tech | Webhooks, data formatting, schema validation, payload conversion |
| **GHOST** | Stealth Research | Deep intelligence gathering, competitor dossier synthesis |
| **ARCHER** | Copywriting | Hook generation, newsletter writing, video titles, social captions |
| **ATLAS** | Architecture & Ops | Run-of-show sequencing, resource planning, project governance |
| **RANGER** | Outreach | Cold email sequences, SMS follow-up templates, contact enrichment |
| **SCOUT** | Lead Discovery | Contact discovery, signal detection, prospect scoring |
| **ECHO** | Audio & Speech | Show notes extraction, quote puller, audiogram snippet selection |
| **DELTA** | Analytics | Conversion telemetry, signal frequency analysis, system metrics |
| **BRAVO** | Support & Help | Technical troubleshooting, knowledge base lookup, client FAQs |
| **OMEGA** | Governance | Failsafe controls, emergency local purge, boundary security |

---

## 5. Creative & Media Studio Workflows

### BOOM Local Recorder
* Accessible from the top navigation bar at any time.
* Directly records microphone audio, webcam video, or screen shares without leaving the browser.
* Automatically saves raw recordings into the local appliance media storage (`backend/data/video/` and `backend/data/audio/`).

### Local Speech-to-Text Transcription
* **Vosk / Whisper Engine:** Ingests recorded audio or uploaded MP3/MP4 files and transcribes them locally without uploading your audio to third-party cloud services.
* Generates synchronized `.vtt` and `.srt` subtitle files.

### Remotion Local Video Rendering
* Renders high-resolution social video snippets, audiograms, and lower-thirds directly using the bundled local Chromium engine.
* No rendering queue wait times or per-minute video SaaS charges.

---

## 6. Turnkey SOB Blueprints

AIO Nexus comes pre-configured with two turnkey blueprint architectures:

### Blueprint A: Solo Podcaster & Content Creator Studio (`podcast_creator`)
1. **Intake:** Guest fills out custom intake form with bio, headshot, and topics.
2. **Recording:** Audio recorded or imported directly into Studio.
3. **Transcription:** Local speech-to-text transcribes the full conversation.
4. **Knowledge Push:** Transcript is automatically indexed in Cortex Vault.
5. **Asset Generation:**
   - **Echo** extracts the 3 best soundbites and episode summary.
   - **Remotion** renders vertical audiogram clips with animated captions.
   - **Archer** generates show notes, timestamps, and title options.
6. **Distribution:** PostBot queues 5 staged social media announcements ready for 1-tap mobile approval.

### Blueprint B: Live Event Technical Director & Run-of-Show (`tech_director`)
1. **Intake:** Production rider, slide decks, and presenter briefs ingested into Cortex.
2. **Timeline Generation:** **Atlas** synthesizes a synchronized cue sheet broken down by segment, presenter, audio feed, visual deck, and stage lighting.
3. **On-Set Execution:** Operator opens **Pocket Cue Sheet** on an iPad or tablet.
4. **Live Cue Advancing:** High-contrast OLED countdown timer with one-tap `GO` button to advance to next cue.
5. **Contingency Trigger:** Instant alert triggers backup video loop or intermission slide if a presenter goes overtime.

---

## 7. The Mobile "Pocket Cockpit" (Away from Studio)

When working on set, backstage, or in transit, the desktop canvas is replaced by the touch-first **Pocket Cockpit**.

To open on any device:
* Navigate to `http://<machine-ip>:3000?view=pocket`
* Or access from any mobile browser where viewport width is `< 768px`.

### 4 Core Pocket Surfaces:
1. **Approvals Feed:** Staged actions that require human clearance appear as swipeable cards. Review copy, destination, and attachments, then tap **Approve** or **Reject**.
2. **Charlie Voice Shell:** Press and hold the microphone button to dictate directives (e.g., *"Charlie, what cues are scheduled after lunch?"* or *"Stage an outreach email to Emily"*).
3. **Live Cue Sheet:** High-contrast dark mode display with large font size for stage visibility, active cue duration countdown, and green **GO** advance button.
4. **Quick Vault Capture:** Instantly snap a stage setup photo, record a voice memo, or type a tech note and upload directly to Cortex Vault.

---

## 8. Remote Access Setup (Tailscale & Cloudflare)

To access your studio appliance securely from your phone anywhere in the world without exposing open ports:

### Recommended: Tailscale Mesh VPN
1. Install [Tailscale](https://tailscale.com) on your studio computer and your phone.
2. Log into the same account on both devices.
3. On your phone's browser, navigate to:
   ```text
   http://<tailscale-ip>:3000?view=pocket
   ```
4. Tap **Share -> Add to Home Screen** on iOS Safari (or **Install App** on Android) to install the native PWA.

*(For full setup instructions including Cloudflare Zero Trust Tunnel with Google SSO, consult [`docs/REMOTE_OPERATOR_ACCESS_GUIDE.md`](file:///d:/AIOCRM/docs/REMOTE_OPERATOR_ACCESS_GUIDE.md)).*

---

## 9. Data Maintenance, Backups & Sovereignty

All application data is isolated in your local directory:
* **Authentication & Workspaces:** `backend/data/aio_auth.db`
* **CRM, Flows & Cortex:** `backend/data/aio_crm.db`
* **Media Assets & Renders:** `backend/data/` (`audio`, `video`, `image`)

### Creating a Snapshot Backup
To back up your entire appliance, simply copy the `backend/data/` directory to an external drive or encrypted storage:
```cmd
xcopy /E /I /H /Y d:\AIOCRM\backend\data d:\Backups\AIOCRM-data-%date:~-4,4%%date:~-10,2%%date:~-7,2%
```

To restore on any new computer, install Python and Node, paste the `backend/data/` folder, and launch `start-nexus.bat`.

---

## 10. Frequently Asked Questions (FAQ)

**Q: Do I need an active internet connection to run AIO Nexus?**  
A: No. All core services (CRM, media renderer, Cortex vault, local Ollama embeddings, database operations) execute 100% offline on your local loopback (`localhost`). Internet is only required if you explicitly send external emails, live SMS, or call external cloud LLM APIs.

**Q: Can I use this for client portals?**  
A: Yes. The built-in client access policy (`client.access`) allows you to generate lightweight external links for guest prep sheets, quote approvals, and asset review links without exposing internal operator tools.

**Q: What local LLM models work best with AIO Nexus?**  
A: We recommend running Ollama with:
* Embeddings: `nomic-embed-text`
* Chat/Specialists: `llama3.2:3b` (for fast responses on laptops) or `llama3.1:8b` (for high-reasoning studio workstations).
