# AIO CRM UI System Foundation

## Top Bar (Global)
Purpose: System-level identity + global state + global actions

Contains:
- Page Title
- Microcopy
- Primary Actions
- Global Search
- Warning/Status Pill
- Notifications
- Telephony Access (future)
- Light/Dark Toggle
- Workspace Selector
- User Account

---

## Module Header (Toolbar)
Purpose: Local interaction layer

Contains:
- Secondary / scoped search
- Filters / segmentation
- Contextual buttons
- Status pills (LOCAL only)
- Toggles / controls

Does NOT contain:
- Title
- Microcopy
- Global alerts

---

## Alert Layer
Placement: Directly under Top Bar

Purpose: Real system state

Examples:
- Missing refresh_token
- Broken integration auth
- Sync failures
- Config blockers

---

## Body
Contains:
- Stats
- Tabs
- Tables
- Panels
- Workspaces

---

## Final Hierarchy

Top Bar (global)
↓
Alert Layer
↓
Module Header (toolbar)
↓
Body (content)

---

## Core Rules

- Top Bar = Identity
- Module Header = Controls
- Alerts = Real system state
- Body = Work

Nothing leaks upward.
