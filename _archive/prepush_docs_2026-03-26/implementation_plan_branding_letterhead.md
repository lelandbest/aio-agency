# Implementation Plan: Branding Audit + Letterhead System

## Phase 1: Audit (Required First)

### Step 1.1: Locate Existing Branding
Search for:
- `modules/Settings/*` - all branding/appearance configs
- `whiteLabel|branding|theme` in code
- `logo|color|appearance` in settings
- tenant/workspace config objects
- hardcoded "AIO CRM" / "Best Studios"

### Step 1.2: Document Current State
Create audit summary:
- What exists
- What's missing
- Files to modify

---

## Phase 2: Standardize Brand Config

### Step 2.1: Create Brand Config Object
```javascript
brandConfig = {
  brandName,      // default: "AIO CRM"
  logoUrl,        // uploaded or default
  primaryColor,   // CSS var reference
  secondaryColor,
  accentColor,
  footerText,
  disclaimer,
  contactInfo,
  reportHeaderLabel
}
```

### Step 2.2: Determine Storage
- Check if workspace-level branding exists
- Extend workspace config or create new settings section

---

## Phase 3: Build Letterhead Component

### Step 3.1: Create Template
`frontend/src/templates/ReportLetterheadTemplate.jsx`

### Step 3.2: Props
```javascript
{
  brandConfig,    // brandConfig object
  reportMeta,     // { title, type, generatedAt, accountName }
  reportBody      // AI-generated content
}
```

### Step 3.3: Layout
1. Header (logo + brand + report info)
2. Divider
3. Report body (sanitized)
4. Footer (disclaimer + contact)

---

## Phase 4: Integrate with Cortex

### Step 4.1: Create getBrandConfig() Helper
```javascript
getBrandConfig() {
  // Check workspace/tenant settings
  // Fallback to defaults
}
```

### Step 4.2: Update Report Flow
Wrap output in `<ReportLetterheadTemplate>`

---

## Phase 5: White-Label Readiness

### Step 5.1: Settings Extension
Add editable fields (if missing):
- brand name
- logo upload
- primary color
- footer text
- disclaimer
- contact info

---

## Phase 6: Fallback Compatibility

Wrap fallback reports in same template.

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `modules/Settings/*` | Audit + extend branding |
| `contexts/BrandContext.jsx` | Create brand context |
| `templates/ReportLetterheadTemplate.jsx` | Create |
| `modules/Brain/index.jsx` | Integrate letterhead |
| `services/backendApi.js` | Add branding APIs |

---

## Acceptance Criteria

- [ ] Existing branding system is audited and documented
- [ ] brandConfig is centralized and reusable
- [ ] ReportLetterheadTemplate renders all reports
- [ ] branding is dynamic per tenant/workspace
- [ ] no hardcoded branding remains in report rendering
- [ ] Cortex reports display with consistent letterhead
- [ ] fallback reports use same template
- [ ] system is ready for white-label deployment
