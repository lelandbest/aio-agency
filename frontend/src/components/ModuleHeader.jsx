import React from 'react';
import { ChevronRight } from 'lucide-react';
import { normalizeDisplayText } from '../utils/text';

const StatusBadge = ({ statusBadge }) => {
  if (!statusBadge) return null;

  return (
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
  );
};

const Breadcrumbs = ({ breadcrumbs }) => {
  if (!breadcrumbs.length) return null;

  return (
    <div className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] flex-wrap">
      {breadcrumbs.map((crumb, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight size={14} className="flex-shrink-0" />
          <button
            onClick={crumb.onClick}
            className={`hover:text-[var(--color-text-primary)] transition truncate ${
              idx === breadcrumbs.length - 1 ? 'text-[var(--color-text-primary)] font-medium' : ''
            }`}
          >
            {normalizeDisplayText(crumb.label)}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

const Actions = ({ actions }) => {
  if (!actions.length) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {actions.map((action, idx) => {
        const ActionIcon = action.icon;
        const isVariant = action.variant === 'primary' || (action.variant !== 'secondary' && action.variant !== 'ghost');

        return (
          <button
            key={idx}
            onClick={action.onClick}
            disabled={action.disabled}
            className={`
              px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-all
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
              <span>{normalizeDisplayText(action.label)}</span>
          </button>
        );
      })}
    </div>
  );
};

const ModuleHeader = ({
  title,
  titleIcon: TitleIcon,
  breadcrumbs = [],
  actions = [],
  statusBadge = null,
  showTitle = true,
  showActions = true,
  aiAssistSlot = null,
  className = ''
}) => {
  const hasToolbar = (showActions && actions.length > 0) || breadcrumbs.length > 0 || statusBadge || aiAssistSlot;

  if (!showTitle && !hasToolbar) {
    return null;
  }

  if (!showTitle) {
    return (
      <div className={`border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)] ${className}`}>
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            <Breadcrumbs breadcrumbs={breadcrumbs} />
            {showActions && <Actions actions={actions} />}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <StatusBadge statusBadge={statusBadge} />
            {aiAssistSlot}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex flex-col ${className}`}>
      {hasToolbar && (
        <div className="px-6 py-4 flex items-center justify-between gap-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            <Breadcrumbs breadcrumbs={breadcrumbs} />
            {showActions && <Actions actions={actions} />}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <StatusBadge statusBadge={statusBadge} />
            {aiAssistSlot}
          </div>
        </div>
      )}

      <div className="px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {TitleIcon && <TitleIcon size={20} className="text-[var(--color-primary)] flex-shrink-0" />}
          <h1 className="text-lg font-bold text-[var(--color-text-primary)] truncate">
            {normalizeDisplayText(title)}
          </h1>
          <Breadcrumbs breadcrumbs={breadcrumbs} />
        </div>
        <StatusBadge statusBadge={statusBadge} />
      </div>
    </div>
  );
};

export default ModuleHeader;
