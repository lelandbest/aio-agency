import React from 'react';
import { BullseyeIcon } from './ui/icons';

/**
 * AIAssistButton
 * Premium assist button for AI assistance throughout the app
 * 
 * Strategic placement:
 * - Contact name fields (AI naming suggestions)
 * - Email/description fields (AI writing helper)
 * - CRM record actions (AI field completion)
 * - Form fields (AI prefill)
 * - Code areas (code dropper)
 * 
 * Props:
 * - onAssist: Function to call when button clicked
 * - context: String describing what field/area this assists (e.g., "contact_name")
 * - variant: 'icon' | 'inline' (small inline version in form fields)
 * - tooltip: Custom tooltip text
 * - disabled: Boolean
 * - loading: Boolean (shows spinner while AI processes)
 * - iconType: retained for compatibility; action icon is now locked sitewide
 */
const AIAssistButton = ({
  onAssist,
  context = 'general',
  variant = 'icon',
  tooltip = 'AI Assist',
  disabled = false,
  loading = false,
  iconType = 'crosshair'
}) => {
  const getIcon = () => <BullseyeIcon size={variant === 'inline' ? 14 : 16} />;

  // Full-size button (for headers, action bars)
  if (variant === 'icon') {
    return (
      <button
        onClick={onAssist}
        disabled={disabled || loading}
        className={`
          p-2 rounded-[var(--radius-card)] transition-all relative border
          ${loading
            ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300 animate-pulse shadow-[var(--shadow-base)]'
            : disabled
            ? 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)] cursor-not-allowed opacity-50'
            : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-slate-400 hover:bg-indigo-500/20 hover:text-indigo-300 shadow-[var(--shadow-base)]'
          }
        `}
        title={tooltip}
      >
        {loading && (
          <div className="absolute inset-0 rounded-[var(--radius-card)] animate-spin">
            <div className="absolute inset-0 border-2 border-transparent border-t-[var(--color-primary)] rounded-[var(--radius-card)]" />
          </div>
        )}
        <div className={loading ? 'opacity-50' : ''}>
          {getIcon()}
        </div>
      </button>
    );
  }

  // Inline version (for form fields, small spaces)
  return (
    <button
      onClick={onAssist}
      disabled={disabled || loading}
      className={`
        p-1.5 rounded-[var(--radius-card)] transition-all flex-shrink-0 border
        ${loading
          ? 'bg-indigo-500/20 text-indigo-300 animate-pulse'
          : disabled
          ? 'border-transparent bg-transparent text-[var(--color-text-tertiary)] cursor-not-allowed opacity-30'
          : 'border-transparent bg-transparent text-slate-400 hover:border-[var(--color-border)] hover:bg-indigo-500/20 hover:text-indigo-300'
        }
      `}
      title={tooltip}
    >
      {getIcon()}
    </button>
  );
};

export default AIAssistButton;
