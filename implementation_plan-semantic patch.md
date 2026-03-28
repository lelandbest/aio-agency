# UI Overflow + Row Discipline Audit Plan (Read-Only)

This plan outlines the research and documentation process to produce a high-precision audit of the AIO CRM UI, adhering to the strict enforcement rules provided.

## Phase 1: Deep Research & Code Mapping

For each major UI surface, I will perform a combined Browser + Code analysis:

1.  **Integrations (`/integrations`):**
    *   Inspect `ActiveIntegrations.jsx`, `AddIntegrationPanel.jsx`, and `IntegrationCard.jsx`.
    *   Analyze `overflow` settings and `flex` layouts.
    *   Identify root causes for Issue UI-001 (Automation Control Plane scroll) and UI-002 (Delete button placement).
2.  **Settings (`/settings`):**
    *   Inspect `Settings/index.jsx`.
    *   Map Issue UI-003 (Archive Workspace placement) and UI-004 (Omega scroll).
    *   Look for SYSTEMIC ISSUES in the settings card layout.
3.  **AIO Agents (`/agents`):**
    *   Inspect `Agents/index.jsx`.
    *   Analyze the "Specialist Arena" and "Admin Log" for Issue UI-005 (Nested Scroll).
4.  **Global Components:**
    *   Inspect `Sidebar.jsx`, `TopBar.jsx`, and `OperatorAssistDock.jsx` (Assist Drawer).
    *   Analyze Issue UI-006 (Assist Drawer scroll-through).

## Phase 2: Stacking & Row Discipline Sweep

I will systematically resize the browser viewport to identify:
*   Buttons stacking at >1024px width.
*   Action groups wrapping when >200px of whitespace remains.
*   Labels/text breaking prematurely in `Flexible` or `Grid` containers.

## Phase 3: Danger Zone Identification

I will grep for destructive keywords (`delete`, `purge`, `archive`, `remove`, `reset`) associated with UI components to ensure they are properly isolated and styled.

## Phase 4: Audit Report Generation

I will compile the final report in the exact format requested, ensuring:
*   Exact file paths and UI regions are listed.
*   Root causes are identified (no symptoms-only reports).
*   Shared components and systemic issues are clearly marked.
*   Classification (A/B/C or FIXABLE/VALID) is applied to every item.
*   Fix strategies are limited to layout/sizing/overflow corrections.

## Open Questions
*   Are there any specific "Mobile" viewports (e.g., <768px) that should be excluded, or is the audit strictly for Desktop/Tablet (1024px+)?
