# AIO Nexus v2 — Forms, Workflows & External Integrations Guide
### Turnkey Setup: Website Ingress, Flow Automation, Make.com / n8n Webhooks & Remote Tunneling

This comprehensive guide details how solo operators (podcasters, technical directors, video editors, and creative agencies) can connect their external websites and landing pages (such as `goaio.us`, Webflow, WordPress, or custom HTML) as **inputs** to their local AIO Nexus appliance, process them through **automated flows**, and dispatch data as **outputs** to external workflow tools like **Make.com** and **n8n**.

---

## 1. Architectural Overview

The AIO Nexus Neural Appliance runs locally on your studio workstation or dedicated mini-PC. Because it operates on zero cloud rent without external database hosting, connecting public websites or webhook services requires an encrypted **Ingress Tunnel** to reach your appliance, and an **Outbound Adapter** to send results to third-party tools.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   END-TO-END INGRESS & EGRESS TOPOLOGY                                  │
│                                                                                                         │
│  [PUBLIC INTERNET]                       [SECURE INGRESS]            [LOCAL AIO NEXUS APPLIANCE]        │
│  Website / Landing Page                 Tailscale Funnel             FastAPI Production Server (:8001)  │
│  (e.g., https://goaio.us)                or ngrok Tunnel             ┌────────────────────────────────┐ │
│  ┌──────────────────────┐                ┌────────────────┐          │ 1. Ingress Boundary            │ │
│  │ HTML5 / React Form   │                │ Public HTTPS   │          │    POST /api/forms/by-slug/... │ │
│  │ Contact / Intake Form│──(JSON POST)──▶│ TLS Ingress    │─────────▶│    - Contact deduplication    │ │
│  │ Discovery Booking    │                │ :443 -> :8001  │          │    - Form submission recorded  │ │
│  └──────────────────────┘                └────────────────┘          └───────────────┬────────────────┘ │
│                                                                                      │                  │
│                                                                                      ▼                  │
│                                                                      ┌────────────────────────────────┐ │
│                                                                      │ 2. Orchestration Engine        │ │
│                                                                      │    Event: "form_submitted"     │ │
│                                                                      │    - Flow graph trigger        │ │
│                                                                      │    - Variable token injection  │ │
│                                                                      │    - Optional AI enrichment    │ │
│                                                                      └───────────────┬────────────────┘ │
│                                                                                      │                  │
│                                                                                      ▼                  │
│  [EXTERNAL AUTOMATIONS]                  [OUTBOUND ADAPTERS]         ┌────────────────────────────────┐ │
│  Make.com / n8n / Zapier                 Direct POST Webhook         │ 3. Dispatch Egress             │ │
│  ┌──────────────────────┐                ┌────────────────┐          │    - Direct Form Webhook       │ │
│  │ Make.com Scenario    │◀───────────────│ Urllib Adapter │◀─────────┤      (settings.webhookUrl)     │ │
│  │  - Add to GSheets    │   (JSON POST)  │ Token Replacer │          │    - Flow "http_request" node  │ │
│  │  - Slack / Discord   │                │ Header Auth    │          │      (custom payloads)         │ │
│  │ n8n Automated Canvas │                └────────────────┘          └────────────────────────────────┘ │
│  └──────────────────────┘                                                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Ingress Setup: Exposing Your Local Appliance (Tailscale Funnel & ngrok)

When AIO Nexus is running on your computer (`http://localhost:8001`), external servers (like your website hosting or Make.com) cannot reach your machine by default. You need a secure public tunnel.

### Option A: Tailscale Funnel (Recommended — 100% Free, Permanent, Built-in TLS)

Tailscale Funnel routes public HTTPS traffic to your local node without opening any ports on your home or studio router.

#### Prerequisites
1. Install Tailscale on your appliance machine:
   ```powershell
   winget install tailscale
   ```
2. Log in with your Tailscale account:
   ```powershell
   tailscale up
   ```
3. Enable Funnel in your Tailscale Admin Console:
   - Go to [login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns) and ensure **MagicDNS** is enabled.
   - Go to **Access Controls** and ensure the `funnel` attribute is permitted for your user/node (this is on by default in modern personal tailnets).

#### Launching Funnel on Port 8001
Run the following command in PowerShell:
```powershell
tailscale funnel 8001
```

Tailscale will display your public domain:
```text
Available on the internet:
https://my-studio-node.tailnet-xyz.ts.net/
Press Ctrl-C to exit.
```

Your public endpoints are now immediately accessible to any website worldwide:
* **Appliance Cockpit:** `https://my-studio-node.tailnet-xyz.ts.net/`
* **Health Check:** `https://my-studio-node.tailnet-xyz.ts.net/api/health`
* **Form Submission:** `https://my-studio-node.tailnet-xyz.ts.net/api/forms/by-slug/{slug}/submit`

> [!TIP]
> **Persistent Background Running:** You can run Funnel as a background daemon by running:
> ```powershell
> tailscale funnel --bg 8001
> ```
> This keeps Funnel running even if you close the terminal window.

---

### Option B: ngrok (Instant Public URL for Fast Testing & Demos)

If you want a public URL in 10 seconds without configuring Tailscale:

#### Prerequisites
1. Install ngrok:
   ```powershell
   winget install ngrok
   ```
2. Connect your free ngrok auth token:
   ```powershell
   ngrok config add-authtoken YOUR_AUTHTOKEN
   ```

#### Launching ngrok
```powershell
ngrok http 8001
```

ngrok displays your forwarding URL:
```text
Forwarding   https://a1b2-c3d4.ngrok-free.app -> http://localhost:8001
```

Your form endpoint is now:
`https://a1b2-c3d4.ngrok-free.app/api/forms/by-slug/{slug}/submit`

---

### Option C: Cloudflare Tunnel (Custom Domain e.g., `forms.goaio.us`)

If you manage your domain on Cloudflare and want branded URLs (e.g. `https://api.goaio.us`):
1. Install `cloudflared`:
   ```powershell
   winget install Cloudflare.cloudflared
   ```
2. Log in and route traffic:
   ```powershell
   cloudflared tunnel login
   cloudflared tunnel create aio-appliance
   cloudflared tunnel route dns aio-appliance api.goaio.us
   cloudflared tunnel run --url http://localhost:8001 aio-appliance
   ```

---

## 3. Creating & Configuring Forms in AIO Nexus v2

In AIO Nexus v2, forms serve as universal ingestion gateways for CRM contacts, orders, and event triggers.

### Step-by-Step Configuration:
1. Open the Cockpit at `http://localhost:8001` (or via your tunnel URL).
2. Navigate to **CRM** in the sidebar, then select the **Forms** tab.
3. Click **New Form** or select an existing template (e.g. "Podcast Guest Intake" or "Contact Us").
4. Define your Form Fields:
   * Each field has a **Key** (e.g., `email`, `firstName`, `phone`, `company`, `message`).
   * For the email field, ensure **Map to Contact** is set to `email` and **Is Identifier** is checked.
5. In **Form Settings** (top-right gear icon):
   * **Form Slug:** Set a clean human-readable slug (e.g. `contact-us`, `intake`, `discovery-call`).
   * **Create Contact:** `ON` (automatically adds leads to CRM Contacts).
   * **Update Contact:** `ON` (merges new data into existing contacts by email).
   * **Webhook URL:** *(Optional direct integration)* Paste your Make.com or n8n webhook URL here if you want instant dispatch without creating a Flow.
   * **Thank You Message:** e.g., `"Thank you! Our team has received your message."`

---

## 4. Website & Landing Page Embeds (Inputs)

Any form created in AIO Nexus can receive submissions from any external website via a standard HTTP `POST` request.

### Submission API Specification

* **HTTP Method:** `POST`
* **Endpoint URL:** `https://<YOUR-TUNNEL-URL>/api/forms/by-slug/{slug}/submit`
* **Alternative Endpoint:** `https://<YOUR-TUNNEL-URL>/api/forms/{formId}/submit`
* **Authentication:** **None required** (Public Ingress Endpoint)
* **Headers:**
  ```http
  Content-Type: application/json
  Accept: application/json
  ```
* **Request Body Schema:**
  ```json
  {
    "formData": {
      "first_name": "Jane",
      "last_name": "Doe",
      "email": "jane.doe@example.com",
      "phone": "+1-555-0123",
      "company": "Acme Media",
      "message": "Interested in podcast production services."
    }
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "contactId": "contact-7a8b9c",
    "created": true,
    "submissionId": "submission-123456"
  }
  ```

---

### Implementation Snippet 1: Pure HTML + Vanilla JavaScript (Universal Embed)

Paste this snippet into any landing page (Webflow custom code block, WordPress HTML block, Squarespace code injection, or static HTML):

```html
<!-- AIO Nexus Smart Intake Form -->
<form id="aio-intake-form" style="max-width: 480px; margin: 0 auto; font-family: system-ui, sans-serif; display: flex; flex-direction: column; gap: 14px;">
  <div style="display: flex; gap: 12px;">
    <div style="flex: 1;">
      <label for="first_name" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">First Name *</label>
      <input type="text" id="first_name" name="first_name" required style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;" />
    </div>
    <div style="flex: 1;">
      <label for="last_name" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Last Name</label>
      <input type="text" id="last_name" name="last_name" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;" />
    </div>
  </div>

  <div>
    <label for="email" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Email Address *</label>
    <input type="email" id="email" name="email" required style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;" />
  </div>

  <div>
    <label for="phone" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Phone Number</label>
    <input type="tel" id="phone" name="phone" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;" />
  </div>

  <div>
    <label for="message" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Project Details</label>
    <textarea id="message" name="message" rows="4" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;"></textarea>
  </div>

  <button type="submit" id="aio-submit-btn" style="background: #2563eb; color: #fff; border: none; padding: 12px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s;">
    Submit Inquiry
  </button>

  <div id="aio-form-status" style="display: none; padding: 12px; border-radius: 6px; font-size: 14px; text-align: center;"></div>
</form>

<script>
(function() {
  // CONFIGURATION: Replace with your actual Tailscale Funnel or ngrok URL and form slug
  const NEXUS_BASE_URL = "https://my-studio-node.tailnet-xyz.ts.net"; 
  const FORM_SLUG = "contact-us"; 

  const form = document.getElementById("aio-intake-form");
  const btn = document.getElementById("aio-submit-btn");
  const statusDiv = document.getElementById("aio-form-status");

  form.addEventListener("submit", async function(e) {
    e.preventDefault();
    btn.disabled = true;
    btn.innerText = "Submitting...";
    statusDiv.style.display = "none";

    const formData = {
      first_name: document.getElementById("first_name").value.trim(),
      last_name: document.getElementById("last_name").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      message: document.getElementById("message").value.trim(),
    };

    try {
      const response = await fetch(`${NEXUS_BASE_URL}/api/forms/by-slug/${FORM_SLUG}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ formData: formData })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        statusDiv.style.display = "block";
        statusDiv.style.background = "#dcfce7";
        statusDiv.style.color = "#166534";
        statusDiv.innerText = "Thank you! Your submission has been received.";
        form.reset();
      } else {
        throw new Error(result.detail || "Submission failed. Please try again.");
      }
    } catch (err) {
      statusDiv.style.display = "block";
      statusDiv.style.background = "#fee2e2";
      statusDiv.style.color = "#991b1b";
      statusDiv.innerText = err.message || "Network error. Please try again later.";
    } finally {
      btn.disabled = false;
      btn.innerText = "Submit Inquiry";
    }
  });
})();
</script>
```

---

### Implementation Snippet 2: React Component (For React / Next.js / Vite Landing Pages)

```jsx
import React, { useState } from 'react';

const NEXUS_ENDPOINT = "https://my-studio-node.tailnet-xyz.ts.net/api/forms/by-slug/contact-us/submit";

export default function ContactIntakeForm() {
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', phone: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch(NEXUS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Submission error');
      setStatus({ type: 'success', text: 'Thank you! We will get in touch shortly.' });
      setFormData({ firstName: '', lastName: '', email: '', phone: '', message: '' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <input
        type="text"
        placeholder="First Name"
        required
        value={formData.firstName}
        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
        className="w-full p-2 border rounded"
      />
      <input
        type="email"
        placeholder="Email Address"
        required
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        className="w-full p-2 border rounded"
      />
      <textarea
        placeholder="How can we help?"
        rows={4}
        value={formData.message}
        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
        className="w-full p-2 border rounded"
      />
      <button type="submit" disabled={loading} className="w-full py-2 bg-blue-600 text-white rounded font-medium">
        {loading ? 'Submitting...' : 'Send Message'}
      </button>
      {status && (
        <div className={`p-3 rounded text-sm ${status.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {status.text}
        </div>
      )}
    </form>
  );
}
```

---

## 5. Automated Workflows / Flows (Processing Engine)

When a form is submitted, AIO Nexus automatically emits an internal event of type `form_submitted`. This triggers any active Flow listening for this trigger.

### What Happens Automatically:
1. **Contact Creation / Deduplication:** Searches for existing contact matching `email`. If found, updates fields; if not, inserts new contact marked with source `Form: <Form Name>`.
2. **Internal Communications Thread:** Opens a new unified thread in Comms containing the form details.
3. **Event Dispatch:** Emits system event `form_submitted` with payload:
   * `form_id`: The ID of the form.
   * `form_name`: Human-readable name.
   * `submission_id`: Unique submission identifier.
   * `contact_id`: Associated CRM Contact ID.
   * `form_data`: Full dictionary of submitted values.

### Building an Intake Workflow in AIO Nexus:
1. Go to **Flows** in the Cockpit and click **New Flow**.
2. **Trigger Node:**
   * Node Type: `Trigger`
   * Event Key / Label: `form_submitted`
3. **Downstream Action Nodes:**
   * **Send Auto-Responder Email (`send_email`):**
     * Recipient: `{{form_data.email}}`
     * Subject: `"Thanks for reaching out, {{form_data.first_name}}!"`
     * Body: `"Hi {{form_data.first_name}}, we received your inquiry regarding {{form_data.message}} and will review it shortly."`
   * **Internal SMS Alert (`send_sms`):**
     * Recipient: Operator cell phone number.
     * Message: `"New lead from {{form_data.first_name}} ({{form_data.email}})"`
   * **Outbound Webhook (`http_request`):**
     * Dispatches the enriched payload to Make.com or n8n (detailed in Section 6).

---

## 6. Wiring Outputs to External Integrations (Make.com & n8n)

AIO Nexus provides **two methods** to deliver form data to external services:

---

### Integration Method 1: Direct Form Webhook (Zero Flow Configuration)

If you only need incoming submissions delivered straight to a Make.com scenario or n8n webhook without creating a multi-step canvas flow:

1. In AIO Nexus, go to **CRM** -> **Forms** -> Edit your Form.
2. Click **Settings** (gear icon in the top right).
3. In the **Webhook URL** field, paste your Make.com or n8n Webhook URL:
   * e.g., `https://hook.eu2.make.com/abcdef1234567890`
   * or `https://n8n.yourdomain.com/webhook/aio-lead-intake`
4. Save the form.

Every time a user submits the form on your website, AIO Nexus immediately sends an HTTP POST request to that URL with the following JSON structure:

```json
{
  "event": "form_submission",
  "formId": "form-6fa46f3f1c",
  "formName": "Podcast Guest Intake",
  "formSlug": "podcast-guest-intake",
  "submissionId": "submission-15d89012e3",
  "contactId": "contact-0f9f5cf45d",
  "formData": {
    "first_name": "Leland",
    "last_name": "Best",
    "email": "leland@goaio.us",
    "phone": "+1-555-0199",
    "company": "AIO Agency",
    "message": "Automating podcast operations."
  },
  "submittedAt": "2026-09-06T22:16:24.123456+00:00"
}
```

---

### Integration Method 2: Multi-Step Flow HTTP Request Node (Advanced)

If you want to validate data, run AI classification, create internal tasks, and **then** send custom payloads to Make.com or n8n:

1. In **Flows**, add an `http_request` node connected after your Trigger or AI logic node.
2. In the node configuration drawer:
   * **Method:** `POST`
   * **URL:** `https://hook.eu2.make.com/...` (or n8n URL)
   * **Headers:**
     ```json
     {
       "Content-Type": "application/json"
     }
     ```
   * **Body:**
     ```json
     {
       "lead": {
         "id": "{{contact_id}}",
         "name": "{{form_data.first_name}} {{form_data.last_name}}",
         "email": "{{form_data.email}}",
         "phone": "{{form_data.phone}}"
       },
       "source": "Website Landing Page",
       "inquiry": "{{form_data.message}}"
     }
     ```
3. Activate the Flow (`status: active`).

---

### Step-by-Step: Setting up Make.com

1. In Make.com, create a new scenario.
2. Add the first module: search for **Webhooks**, select **Custom Webhook**.
3. Click **Create a Webhook**, name it `"AIO Nexus Ingress"`, and copy the generated Webhook URL (e.g., `https://hook.us1.make.com/abc123xyz`).
4. Paste this URL into AIO Nexus (either in Form Settings -> `Webhook URL`, or inside an `http_request` Flow node).
5. In Make.com, click **Re-determine data structure**.
6. Submit a test form on your website or run:
   ```bash
   curl -X POST https://<tunnel-url>/api/forms/by-slug/contact-us/submit \
     -H "Content-Type: application/json" \
     -d "{\"formData\": {\"first_name\": \"Test\", \"email\": \"test@goaio.us\"}}"
   ```
7. Make.com will say **"Successfully determined"**.
8. Connect downstream modules in Make:
   * **Google Sheets:** "Add a Row"
   * **Slack / Discord:** "Send a Channel Message"
   * **QuickBooks / Stripe:** "Create Customer"

---

### Step-by-Step: Setting up n8n

1. In n8n, create a new workflow.
2. Add a **Webhook** trigger node.
3. Configure the node:
   * **HTTP Method:** `POST`
   * **Path:** `aio-lead-intake`
   * **Response Mode:** `On Received` with Response Code `200`
4. Copy the **Test URL** or **Production URL**.
5. Paste it into your AIO Nexus Form Settings or Flow `http_request` node.
6. In n8n, click **Listen for test event**, and trigger a submission.
7. n8n will capture the full JSON payload with `formData`, `contactId`, and `submissionId`.
8. Connect downstream nodes:
   * **Notion:** Append page to CRM Database.
   * **OpenAI / Claude:** Generate tailored executive briefing.
   * **Telegram / WhatsApp:** Send instant push alert to operator.

---

## 7. Testing & Verification Runbook

Follow this checklist to verify your end-to-end pipeline before going live:

### 1. Check Local Backend Health
```powershell
curl http://localhost:8001/api/health
```
*Expected output:* `{"status":"healthy", "version":"2.0.0", ...}`

### 2. Check Public Ingress
```powershell
curl https://<your-tailscale-or-ngrok-domain>/api/health
```
*Expected output:* `{"status":"healthy", ...}`

### 3. Test Form Submission via cURL
```powershell
curl -X POST "https://<your-domain>/api/forms/by-slug/contact-us/submit" `
  -H "Content-Type: application/json" `
  -d '{"formData":{"first_name":"Jane","last_name":"Doe","email":"jane@example.com","phone":"+1-555-0100","message":"Testing live pipeline"}}'
```
*Expected output:*
```json
{"success":true,"contactId":"contact-...","created":true,"submissionId":"submission-..."}
```

### 4. Verify in AIO Nexus Cockpit
* Go to **CRM** -> **Contacts**: Verify "Jane Doe" (`jane@example.com`) was created.
* Go to **CRM** -> **Forms** -> Click the form: Verify the responses counter incremented.
* Go to **Comms**: Verify a new intake thread was opened.

### 5. Verify Make.com / n8n
* Open Make.com Scenario History or n8n Executions log.
* Verify the execution status is **Success (200)** with all form fields parsed.

---

## 8. Summary of Public Endpoints

| Endpoint | Method | Auth Required | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | No | Heartbeat check for tunnels & monitors |
| `/api/forms/by-slug/{slug}` | `GET` | No | Fetch dynamic form schema & labels |
| `/api/forms/by-slug/{slug}/submit` | `POST` | No | **Primary public submission endpoint** |
| `/api/forms/{formId}` | `GET` | No | Fetch form schema by ID |
| `/api/forms/{formId}/submit` | `POST` | No | Alternative submission endpoint by ID |
| `/?view=pocket` | `GET` | Session | Touch-first mobile Pocket Cockpit |
| `/` | `GET` | Session | Full Desktop Operations Cockpit |
