# STUDIO OPERATIONS MANUAL: Multimodal Transformation Appliance
**Version**: 1.0.0 // **Classification**: Industrial Operations // **Module**: STUDIO (Media)

---

## 1. OPERATIONAL OVERVIEW
The Studio is a high-precision media workstation designed for the ingestion, transformation, and generation of multimodal assets. It operates as a centered "Appliance," concentrating all tactical controls into a static island while distributing monitoring and review data to flanking virtual displays.

## 2. HARDWARE LAYOUT (THE WORKSTATION)
The Studio is divided into three primary functional zones:

### A. MONITOR A // PROG (LEFT)
The primary playback and visualization monitor.
- **Visual Feedback**: Real-time rendering of active video, audio, or image assets.
- **State Indicator**: Status lights (ROSE for Program, CYAN for Review) indicate the current workstation mode.

### B. THE CONTROL DECK // CENTER ISLAND (TACTICAL)
The core operational appliance where all transformations are initiated.
- **IMAGE ADJUSTMENTS (Top)**: Fine-grained control over Brightness, Contrast, Saturation, Hue, and Opacity.
- **MATRIX PADS (Middle)**: A 4x4 Quick Action grid for triggering generation scripts:
    - **Generate Script**: Create copy from raw context.
    - **Run of Show**: Generate timing and pacing for productions.
    - **Voice Synthesis**: Render text-to-speech assets.
    - **Thumbnail Gen**: Visual asset creation via DALL-E/Midjourney bridges.
- **NEXUS HUB (Core)**: The multimodal ingestion portal:
    - **FILE**: Drag-and-drop local assets.
    - **WEB**: Ingest from URL or public endpoints.
    - **MCP**: Direct link to the Model Control Protocol bus.
- **TACTICAL FORM**: Adaptive input area for configuration parameters.
- **PRIMARY ACTION BUTTON**: The floating "EXECUTE" anchor at the island's base.

### C. MONITOR B // REVIEW (RIGHT)
The artifact management and production monitor.
- **TXT READOUT**: Live view of transcripts, scripts, and textual job outputs.
- **JOB QUEUE**: Status tracking for all active background renders.
- **ARTIFACT VAULT**: Navigation of generated outputs and raw assets.
- **CONSULT (Monitor C)**: AI-driven strategic advice synchronized with the current workstation context.

## 3. CORE WORKFLOWS

### I. INGESTION (NEXUS PORTAL)
1. Ensure no action is pinned (Press **CLEAR** on the Nexus bar if necessary).
2. Drag media artifacts directly into the **NEXUS DROP ZONE**.
3. Monitoring A will indicate the load status. Assets are stored in the local cache immediately.

### II. TRANSFORMATION (MATRIX EXECUTION)
1. Select an Output Artifact from the **VAULT** (Monitor B).
2. Select a **MATRIX PAD** action (e.g., Generate Script).
3. Populate the **TACTICAL FORM** with mission objectives (Topic, Tone, Duration).
4. Tap the floating **PRIMARY ACTION BUTTON** to initiate the job.

### III. PRODUCTION (PUSH TO BRAIN)
1. Locate the completed job in the **JOB QUEUE**.
2. Review the resulting ARTIFACT in the **VAULT**.
3. Use the **OPEN EDITOR** to refine transcripts or scripts.
4. Select **PUSH TO BRAIN** to ingest the artifact into the global AIO knowledge graph.

## 4. SYSTEM CONSTRAINTS
- **Appliance Integrity**: The workstation layout is fixed for "industrial" use; do not attempt to resize panels via flex stretching.
- **Vertical Thresholds**: Forms terminate 10px above the primary action button to prevent interaction overlap.
- **Mode Logic**: Transformations can only be executed when a valid target asset is loaded into the **GLOBAL_BUS**.

---
*End of Operational Manual // AIO CRM*
