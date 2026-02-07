import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * ModuleHeader
 * Standardized 2-row header component used consistently across all modules
 * 
 * Row 1: Context-aware action buttons (Create, Import, Export, Search, Filter, etc.)
 * Row 2: Module title (with icon) + Breadcrumbs + Status indicators
 * 
 * Props:
 * - title: Module title (string)
 * - titleIcon: Icon component for title
 * - breadcrumbs: Array of {label, onClick} objects for navigation
 * - actions: Array of {label, icon: Component, onClick, variant?, disabled?}
 * - statusBadge: {label, color} object for status display
 * - showActions: Boolean to control action visibility
 * - aiAssistSlot: React component (AIAssistButton) to place in Row 1
 * - className: Additional CSS classes
 */
const ModuleHeader = ({
  title,
  titleIcon: TitleIcon,
  breadcrumbs = [],
  actions = [],
  statusBadge = null,
  showActions = true,
  aiAssistSlot = null,
  className = ''
}) => {
  return (
    <div className={`border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex flex-col ${className}`}>
      {/* Row 1: Actions Bar */}
      {showActions && (
        <div className="px-6 py-4 flex items-center justify-between gap-4 border-b border-[var(--color-border)]">
          {/* Left: Primary action or context label */}
          <div className="flex items-center gap-3">
            {actions.length > 0 && (
              <div className="flex gap-2">
                {actions.map((action, idx) => {
                  const ActionIcon = action.icon;
                  const isVariant = action.variant === 'primary' || (action.variant !== 'secondary' && action.variant !== 'ghost');
                  
                  return (
                    <button
                      key={idx}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      className={`
                        px-4 py-2 rounded text-sm font-medium flex items-center gap-2
                        transition-all
                        ${isVariant
                          ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)] disabled:opacity-50'
                          : action.variant === 'secondary'
                          ? 'bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)] disabled:opacity-50'
                          : 'bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-50'
                        }
                      `}
                      title={action.title}
                    >
                      {ActionIcon && <ActionIcon size={16} />}
                      <span>{action.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: AI Assist + Additional Controls */}
          {aiAssistSlot && (
            <div className="flex items-center gap-2">
              {aiAssistSlot}
            </div>
          )}
        </div>
      )}

      {/* Row 2: Title + Breadcrumbs + Status */}
      <div className="px-6 py-3 flex items-center justify-between gap-4">
        {/* Left: Title with icon */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {TitleIcon && (
            <TitleIcon size={20} className="text-[var(--color-primary)] flex-shrink-0" />
          )}
          <h1 className="text-lg font-bold text-[var(--color-text-primary)] truncate">
            {title}
          </h1>

          {/* Breadcrumbs */}
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1 ml-2 text-sm text-[var(--color-text-secondary)] flex-wrap">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  <ChevronRight size={14} className="flex-shrink-0" />
                  <button
                    onClick={crumb.onClick}
                    className={`hover:text-[var(--color-text-primary)] transition truncate ${
                      idx === breadcrumbs.length - 1 ? 'text-[var(--color-text-primary)] font-medium' : ''
                    }`}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Right: Status Badge */}
        {statusBadge && (
          <div
            className={`
              px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0
              ${statusBadge.color === 'success'
                ? 'bg-green-500/20 text-green-400'
                : statusBadge.color === 'warning'
                ? 'bg-yellow-500/20 text-yellow-400'
                : statusBadge.color === 'error'
                ? 'bg-red-500/20 text-red-400'
                : statusBadge.color === 'info'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
              }
            `}
          >
            {statusBadge.label}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModuleHeader;
