/**
 * QUICK START GUIDE: Unified Header & Token System
 * ================================================
 * 
 * Use this guide to continue the refactoring work in future sessions.
 */

// ============================================================================
// FILES CREATED THIS SESSION
// ============================================================================

/**
 * 1. /frontend/src/components/ModuleHeader.jsx
 *    - Main header component for all modules
 *    - Props: title, titleIcon, breadcrumbs, actions, statusBadge, aiAssistSlot
 *    - Token-based styling (no hardcodes)
 * 
 * 2. /frontend/src/components/AIAssistButton.jsx
 *    - AI assist button with rifle sight icon
 *    - Variants: 'icon' (full-size) or 'inline' (form field)
 *    - IconTypes: 'crosshair', 'wand', 'sparkles'
 */

// ============================================================================
// FILES MODIFIED THIS SESSION
// ============================================================================

/**
 * 1. /frontend/src/index.css
 *    ADDITIONS:
 *    - --color-neon-magenta, --color-neon-cyan, --color-neon-purple
 *    - --color-neon-*-glow variants
 *    - --shadow-glow-magenta, cyan, purple (light + dark)
 * 
 * 2. /frontend/src/modules/CRM/index.jsx
 *    CHANGES:
 *    - Added ModuleHeader import
 *    - Replaced inline header with <ModuleHeader /> component
 *    - Moved tabs from header to content area
 *    - Updated: main container, bulk action buttons, search bar colors
 *    - REMAINING: ~50 color replacements in table/detail sections
 */

// ============================================================================
// COPY-PASTE SNIPPETS FOR NEXT SESSION
// ============================================================================

/**
 * SNIPPET 1: Complete CRM Table Color Replacements
 * Use these patterns to find/replace remaining hardcoded colors
 * 
 * Search for: bg-[#18181B]
 * Replace with: bg-[var(--color-bg-secondary)]
 * 
 * Search for: bg-[#0A0A0A]
 * Replace with: bg-[var(--color-bg-primary)]
 * 
 * Search for: border-[#27272A]
 * Replace with: border-[var(--color-border)]
 * 
 * Search for: text-gray-400
 * Replace with: text-[var(--color-text-secondary)]
 * 
 * Search for: text-gray-300
 * Replace with: text-[var(--color-text-tertiary)]
 * 
 * Search for: border-purple-500
 * Replace with: border-[var(--color-primary)]
 * 
 * Search for: focus:border-purple-500
 * Replace with: focus:border-[var(--color-primary)]
 * 
 * Search for: text-purple-400 (in tags)
 * Replace with: text-[var(--color-primary)]
 * 
 * Search for: bg-purple-600/20
 * Replace with: bg-[var(--color-primary)]/10
 */

/**
 * SNIPPET 2: ModuleHeader Integration Template
 * Copy this for each module you refactor
 * 
 * import ModuleHeader from '../../components/ModuleHeader';
 * import { Users, Plus, Download, FileInput } from 'lucide-react';
 * 
 * function YourModule() {
 *   return (
 *     <div className="h-full flex flex-col">
 *       <ModuleHeader
 *         title="Module Title"
 *         titleIcon={Users}
 *         actions={[
 *           {
 *             label: 'Import',
 *             icon: FileInput,
 *             onClick: () => handleImport(),
 *             variant: 'secondary'
 *           },
 *           {
 *             label: 'Create',
 *             icon: Plus,
 *             onClick: () => handleCreate(),
 *             variant: 'primary'
 *           }
 *         ]}
 *         breadcrumbs={[
 *           { label: 'Parent', onClick: () => navigate('/parent') }
 *         ]}
 *         statusBadge={{ label: 'Status', color: 'success' }}
 *       />
 *       
 *       {/* Rest of module content */}
 *     </div>
 *   );
 * }
 */

/**
 * SNIPPET 3: AIAssistButton Integration Template
 * 
 * import AIAssistButton from '../../components/AIAssistButton';
 * 
 * <AIAssistButton
 *   onAssist={() => triggerAIHelper('field_name')}
 *   context="field_name"
 *   variant="icon"
 *   tooltip="Get AI suggestions"
 *   iconType="crosshair"
 *   loading={isProcessing}
 * />
 */

// ============================================================================
// REMAINING WORK BREAKDOWN
// ============================================================================

/**
 * PHASE 1B: FINISH CRM COLOR REPLACEMENTS
 * Effort: 20-30 minutes
 * Files: /frontend/src/modules/CRM/index.jsx
 * 
 * Remaining instances:
 * - ~15-20 text-gray-* replacements
 * - ~10-15 bg-[#...] replacements
 * - ~5-10 border color replacements
 * - ~5 focus/hover state replacements
 * - ~3-5 tag styling replacements
 * 
 * Best approach:
 * 1. Use grep_search to find all instances of patterns
 * 2. Group by pattern (e.g., all text-gray-400 together)
 * 3. Use multi_replace_string_in_file for batch operations
 * 4. Test in browser after each batch
 */

/**
 * PHASE 2: APPLY TO OTHER MODULES
 * Effort: 2-3 hours total
 * 
 * Priority order (by frequency of use):
 * 1. Dashboard (429 lines) - 20-30 min
 * 2. Forms (689 lines) - 30-40 min
 * 3. Calendar (1773 lines) - 40-60 min
 * 4. Other modules (Agents, Auth, etc.) - 30-45 min
 * 
 * For each module:
 * 1. Replace old header code with ModuleHeader
 * 2. Update color hardcodes with tokens
 * 3. Quick test in browser
 */

/**
 * PHASE 3: ADD AIASSISTBUTTON
 * Effort: 1-1.5 hours
 * 
 * High-value placement locations:
 * - CRM: Contact name/email fields → "AI naming/writing helper"
 * - Forms: All text input fields → "AI prefill"
 * - Dashboard: Summary fields → "AI insights"
 * - Calendar: Event descriptions → "AI scheduling"
 * 
 * For each location:
 * 1. Import AIAssistButton
 * 2. Wrap input/field with flex container
 * 3. Add button after input
 * 4. Wire onClick to handler (can be placeholder for now)
 */

/**
 * PHASE 4: TESTING
 * Effort: 30-45 minutes
 * 
 * Test matrix:
 * [ ] Light mode - all modules render correctly
 * [ ] Dark mode - tokens apply properly, contrast OK
 * [ ] ModuleHeader - actions, breadcrumbs, status badges work
 * [ ] AIAssistButton - clicks work, loading state animates
 * [ ] Neon colors - visible in dark mode with glow
 * [ ] Mobile - responsive design works
 * [ ] Accessibility - keyboard nav, focus states
 */

// ============================================================================
// COMMON MISTAKES TO AVOID
// ============================================================================

/**
 * ❌ DON'T: Use hardcoded colors
 * <div className="bg-[#18181B]">  // ❌ WRONG
 * 
 * ✅ DO: Use CSS variables
 * <div className="bg-[var(--color-bg-secondary)]">  // ✅ RIGHT
 */

/**
 * ❌ DON'T: Mix token names with hardcodes
 * <button className="bg-purple-600 hover:bg-[var(--color-primary-hover)]">
 * 
 * ✅ DO: Use consistent approach
 * <button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]">
 */

/**
 * ❌ DON'T: Forget to update both light and dark modes
 * :root { --color-primary: #333; }
 * html.dark { /* missing override */ }
 * 
 * ✅ DO: Update both
 * :root { --color-primary: #333; }
 * html.dark { --color-primary: #0066FF; }
 */

/**
 * ❌ DON'T: Create new tokens without documentation
 * --my-custom-color: #FF0000;
 * 
 * ✅ DO: Document intent
 * /* Success state, high visibility */
 * --color-success: #10B981;
 */

// ============================================================================
// HELPFUL REFERENCES
// ============================================================================

/**
 * CSS Token Naming Convention:
 * --color-[category]-[variant]
 * 
 * Examples:
 * --color-bg-primary      (Main background)
 * --color-bg-secondary    (Secondary bg, cards)
 * --color-bg-tertiary     (Tertiary, inputs/hovers)
 * --color-text-primary    (Main text)
 * --color-text-secondary  (Secondary text, metadata)
 * --color-text-tertiary   (Tertiary, placeholders)
 * --color-primary         (Brand color, buttons)
 * --color-primary-hover   (Hover variant of primary)
 * --color-neon-magenta    (Neon accent)
 * --shadow-glow-*         (Glowing shadows)
 */

/**
 * Tailwind Token Class Mapping:
 * 
 * Text colors:
 * text-[var(--color-text-primary)]
 * text-[var(--color-text-secondary)]
 * text-[var(--color-text-tertiary)]
 * 
 * Background colors:
 * bg-[var(--color-bg-primary)]
 * bg-[var(--color-bg-secondary)]
 * bg-[var(--color-bg-tertiary)]
 * 
 * Border colors:
 * border-[var(--color-border)]
 * border-[var(--color-primary)]
 * 
 * Shadows:
 * shadow-[var(--shadow-glow-magenta)]
 * shadow-[var(--shadow-glow-cyan)]
 */

/**
 * Button Styling Pattern:
 * 
 * Primary (CTA):
 * className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)]"
 * 
 * Secondary:
 * className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
 * 
 * Ghost (icon-only):
 * className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
 */

// ============================================================================
// QUICK TEST COMMANDS
// ============================================================================

/**
 * To test in browser:
 * 1. Open DevTools (F12)
 * 2. Go to Console
 * 3. Run these checks:
 * 
 * Check token is applied:
 * const el = document.querySelector('.element-class');
 * window.getComputedStyle(el).backgroundColor
 * 
 * Check dark mode CSS:
 * document.documentElement.classList
 * (should contain 'dark' when dark mode active)
 * 
 * Check token value:
 * getComputedStyle(document.documentElement).getPropertyValue('--color-primary')
 */

export const QUICK_REFERENCE = {
  filesCreated: [
    'ModuleHeader.jsx',
    'AIAssistButton.jsx'
  ],
  filesModified: [
    'index.css',
    'CRM/index.jsx'
  ],
  remainingWork: 'CRM color replacements (50 instances) → Dashboard → Forms → Calendar → Testing'
};
