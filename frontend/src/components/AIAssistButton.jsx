import React from 'react';
import { Crosshair, Wand2, Sparkles } from 'lucide-react';

/**
 * AIAssistButton
 * Premium "rifle sight" button for AI assistance throughout the app
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
 * - iconType: 'crosshair' | 'wand' | 'sparkles' (determines icon style)
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
  const getIcon = () => {
    switch (iconType) {
      case 'wand':
        return <Wand2 size={variant === 'inline' ? 14 : 16} />;
      case 'sparkles':
        return <Sparkles size={variant === 'inline' ? 14 : 16} />;
      case 'crosshair':
      default:
        return <Crosshair size={variant === 'inline' ? 14 : 16} />;
    }
  };

  // Full-size button (for headers, action bars)
  if (variant === 'icon') {
    return (
      <button
        onClick={onAssist}
        disabled={disabled || loading}
        className={`
          p-2 rounded-[var(--radius-card)] transition-all relative
          ${loading
            ? 'bg-gray-500/20 text-gray-300 animate-pulse'
            : disabled
            ? 'bg-[var(--color-bg-primary)] text-gray-500 cursor-not-allowed opacity-50'
            : 'bg-gray-500/10 text-gray-300 hover:bg-gray-500/20 hover:shadow-island-sm'
          }
        `}
        title={tooltip}
      >
        {loading && (
          <div className="absolute inset-0 rounded-[var(--radius-card)] animate-spin">
            <div className="absolute inset-0 border-2 border-transparent border-t-gray-400 rounded-[var(--radius-card)]" />
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
        p-1.5 rounded-[var(--radius-card)] transition-all flex-shrink-0
        ${loading
          ? 'bg-[var(--color-primary)]/30 text-[var(--color-primary)] animate-pulse'
          : disabled
          ? 'bg-transparent text-[var(--color-text-tertiary)] cursor-not-allowed opacity-30'
          : 'bg-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10'
        }
      `}
      title={tooltip}
    >
      {getIcon()}
    </button>
  );
};

export default AIAssistButton;
