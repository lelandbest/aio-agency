# AIO Nexus v2 — Remote Operator Access & Mobile Pocket Cockpit Guide

This guide details how solo operators (podcasters, technical directors, video editors, and creative directors) can securely connect their smartphone or tablet to their home or studio **AIO Nexus Neural Appliance** when away from their primary workstation.

---

## 1. Architectural Overview

The **Pocket Cockpit** is engineered as a lightweight, touch-first PWA interface (`< 768px` viewport or `?view=pocket`) that connects directly back to your local appliance. It eliminates heavy canvas nodes and instead provides 4 high-leverage workflows:

1. **The Approvals Feed:** One-tap clearance cards to approve/reject staged social posts, outgoing emails, and automated booking triggers.
2. **Charlie Push-to-Talk:** Voice directives to query the knowledge vault, check today's schedule, or trigger background workflows while in transit.
3. **On-Set Run-of-Show Cue Sheet:** High-contrast OLED live cue viewer with a live countdown timer and `GO` advance button for live event directors.
4. **Quick Vault Capture:** Instant photo, video, and audio memo ingestion straight into your local appliance's Cortex Vault.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   REMOTE "POCKET COCKPIT" ARCHITECTURE                 │
│                                                                        │
│   MOBILE DEVICE / TABLET (Away from Studio)                            │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │ PWA Standalone App (iOS / Android)                           │     │
│   │ ├─ Approvals Feed (Swipe to approve/reject)                  │     │
│   │ ├─ Charlie Voice Directives (Push-to-talk audio)             │     │
│   │ ├─ Live Run-of-Show Cue Sheet (High-contrast on-set timer)   │     │
│   │ └─ Quick Media Capture (Camera/Audio -> Vault Push)          │     │
│   └──────────────────────────────┬───────────────────────────────┘     │
│                                  │                                     │
│                     End-to-End Encrypted Tunnel                        │
│            (Tailscale Mesh / Cloudflare Zero Trust Tunnel)             │
│                                  │                                     │
│                                  ▼                                     │
│   LOCAL APPLIANCE (Home Studio / Local Server)                         │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │ FastAPI Modular Backend (:8001)                              │     │
│   │ ├─ Routes & API Token Validation                             │     │
│   │ ├─ Execution Engine & Background Resume Worker               │     │
│   │ ├─ Local Ollama LLM & Vector Embeddings                      │     │
│   │ ├─ Remotion Video Renderer & Vosk Transcription              │     │
│   │ └─ SQLite Databases (aio_auth.db & aio_crm.db)               │     │
│   └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Remote Access Method A: Tailscale Private Mesh (Recommended)

**Why Tailscale?**
* **100% Free & Private:** No open ports on your studio router.
* **Encrypted WireGuard:** Direct point-to-point mesh network between your phone and studio computer.
* **Native Apps:** Available on iOS, Android, macOS, Windows, and Linux.

### Setup Instructions:

1. **On your Appliance Machine (Studio PC / Mac):**
   - Download and install [Tailscale](https://tailscale.com/download).
   - Sign in and start Tailscale.
   - Note your machine's Tailscale 100.x.y.z IP address or MagicDNS name (e.g. `studio-pc.tailnet.ts.net`).

2. **Launch the Appliance:**
   - Run `start-nexus.bat` on Windows (or `python backend/server.py` + `npm run dev -- --host 0.0.0.0`).
   - Both the backend (:8001) and frontend (:3000) bind to `0.0.0.0`, allowing access from your private Tailscale network.

3. **On your Mobile Device (iPhone or Android):**
   - Install the **Tailscale** app from the App Store or Google Play.
   - Sign into the same Tailscale account and connect.
   - Open Safari or Chrome and navigate to:
     ```text
     http://100.x.y.z:3000?view=pocket
     ```
     *(replace `100.x.y.z` with your host machine's Tailscale IP or MagicDNS)*

4. **Install as a Home Screen App (PWA):**
   - **iOS Safari:** Tap the **Share** button -> Tap **Add to Home Screen**.
   - **Android Chrome:** Tap the three dots menu -> Tap **Install App** or **Add to Home screen**.
   - Launch from your home screen for an edge-to-edge, native mobile experience.

---

## 3. Remote Access Method B: Cloudflare Zero Trust Tunnel

**Why Cloudflare Tunnel?**
* Provides a clean public domain (e.g., `https://nexus.yourbrand.com`) without installing a VPN app on guest or client devices.
* Free Zero Trust access controls (Email One-Time PIN or Google OAuth) prevent unauthorized access.

### Setup Instructions:

1. **Install `cloudflared`:**
   ```cmd
   winget install Cloudflare.cloudflared
   ```
2. **Authenticate with Cloudflare:**
   ```cmd
   cloudflared tunnel login
   ```
3. **Create a Tunnel:**
   ```cmd
   cloudflared tunnel create aio-nexus
   ```
4. **Create Configuration File (`config.yml`):**
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: C:\Users\<Username>\.cloudflared\<TUNNEL_ID>.json

   ingress:
     - hostname: nexus.yourbrand.com
       service: http://localhost:3000
     - hostname: api-nexus.yourbrand.com
       service: http://localhost:8001
     - service: http_status:404
   ```
5. **Route DNS & Run:**
   ```cmd
   cloudflared tunnel route dns aio-nexus nexus.yourbrand.com
   cloudflared tunnel run aio-nexus
   ```
6. **Configure Cloudflare Access Policy:**
   - In Cloudflare Zero Trust dashboard -> **Access** -> **Applications**.
   - Add an application for `nexus.yourbrand.com`.
   - Set Policy: **Allow** if user email matches `your-email@gmail.com`.
   - Now, visiting `https://nexus.yourbrand.com?view=pocket` prompts for a secure one-time PIN sent to your email before granting access to your home appliance.

---

## 4. Mobile Pocket Surfaces & Operations

| Surface | Purpose | Mobile Gesture / Interaction |
| :--- | :--- | :--- |
| **Approvals** | Clear paused or blocked AI execution runs | Swipe card / Tap **Approve** or **Reject** |
| **Voice** | Charlie AI conversational directives | Press & Hold / Push-to-Talk microphone |
| **Cues** | Live on-set Run-of-Show timeline | Tap **GO** to advance to next production cue |
| **Capture** | Ingest media directly into Cortex Vault | Tap Camera, Mic, or Note to upload instantly |

---

## 5. Security Invariants

1. **Never Port Forward Raw Ports:** Do not forward port `8001` or `3000` on your home router directly to the open internet. Always use Tailscale or Cloudflare Zero Trust.
2. **Local Data Isolation:** All captured media, voice recordings, transcripts, and CRM contacts remain stored exclusively in your local SQLite databases and local media directory.
3. **Zero Cloud Rent:** No monthly SaaS fees, no third-party database bills, and no hosted GPU compute fees.
