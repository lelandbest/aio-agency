# UI / UX CLEAN SWEEP (POST-HARDENING)

## 1. ERROR SIGNALING (PRIORITY)
- standardize error states (no ad hoc styling)
- enforce high-contrast visibility (no muted/low-opacity errors)
- consistent placement (top bar / inline / toast rules)
- remove any “softened” error variants
- unify wording (no mixed tone)

---

## 2. STATUS SYSTEM (PILLS / STATES)
- define canonical states:
  - active
  - standby
  - error
  - disconnected
  - processing
- consistent color + icon mapping
- no module-specific variants
- ensure dark/light parity

---

## 3. LIGHT / DARK MODE REFACTOR
- eliminate leftover SaaS gray/white artifacts
- unify:
  - backgrounds
  - borders
  - text contrast
- ensure:
  - no washed-out panels
  - no low-contrast inputs
- align with industrial / steampunk dark direction

---

## 4. SIGNAL VISIBILITY (IMPORTANT)
- signals must be:
  - immediate
  - obvious
  - non-ambiguous
- remove subtle indicators
- prioritize operator clarity over aesthetic softness

---

## 5. BUTTON / ACTION CONSISTENCY
- primary actions:
  - always same placement (top-right)
  - always same style
- labels standardized:
  - Save
  - TEST CONNECT
  - Attach
  - Add Integration
- no duplicate action patterns

---

## 6. MODULE PARITY PASS
Run across:
- CRM
- Flows
- Brain
- Integrations
- Comms
- Signals

Check:
- spacing
- header height (~48px)
- padding (p-6 islands)
- scroll behavior (no unnecessary nested scroll)

---

## 7. REMOVE SAAS LOOK
- remove:
  - generic white cards
  - soft shadows
  - bland gray UI
- reinforce:
  - glass / industrial feel
  - depth + structure
  - intentional contrast

---

## RULE

This is POST-STABILIZATION ONLY.

Do NOT:
- mix with runtime hardening
- allow quick UI tweaks mid-debug
- combine visual cleanup with logic fixes

---

## TRIGGER

Run ONLY after:
- no runtime errors
- flows stable
- integrations saving correctly
- navigation clean
