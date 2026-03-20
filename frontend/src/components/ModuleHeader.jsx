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
          <React.Fragment key={idx}>
            {action.groupStart ? (
              <div className="mx-1 hidden h-8 w-px self-center rounded-full bg-slate-700/70 xl:block" />
            ) : null}
            <button
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
                ${action.className || ''}
              `}
              title={action.title}
            >
              {ActionIcon && <ActionIcon size={16} />}
                <span>{normalizeDisplayText(action.label)}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const ModuleHeader = ({
  title,
  subtitle = '',
  titleIcon: TitleIcon,
  breadcrumbs = [],
  actions = [],
  statusBadge = null,
  showTitle = true,
  showCompactTitle = false,
  showActions = true,
  toolbarRightSlot = null,
  aiAssistSlot = null,
  className = ''
}) => {
  const hasToolbar = (showActions && actions.length > 0) || breadcrumbs.length > 0 || statusBadge || toolbarRightSlot || aiAssistSlot;

  if (!showTitle && !hasToolbar && !subtitle) {
    return null;
  }

  if (!showTitle) {
    return (
      <div className={`border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)] ${className}`}>
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            {showCompactTitle ? (
              <div className="min-w-0 mr-2">
                <div className="text-lg font-bold text-[var(--color-text-primary)] truncate">
                  {normalizeDisplayText(title)}
                </div>
                {subtitle ? (
                  <div className="mt-0.5 text-sm text-[var(--color-text-secondary)] truncate">
                    {subtitle}
                  </div>
                ) : null}
              </div>
            ) : null}
            <Breadcrumbs breadcrumbs={breadcrumbs} />
            {showActions && <Actions actions={actions} />}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {toolbarRightSlot}
            <StatusBadge statusBadge={statusBadge} />
            {aiAssistSlot}
          </div>
        </div>
        {subtitle && !showCompactTitle ? (
          <div className="px-6 pb-3 text-sm text-[var(--color-text-secondary)]">
            {subtitle}
          </div>
        ) : null}
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
            {toolbarRightSlot}
            <StatusBadge statusBadge={statusBadge} />
            {aiAssistSlot}
          </div>
        </div>
      )}

      <div className="px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {TitleIcon && <TitleIcon size={20} className="text-[var(--color-primary)] flex-shrink-0" />}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[var(--color-text-primary)] truncate">
              {normalizeDisplayText(title)}
            </h1>
            {subtitle ? (
              <div className="mt-0.5 text-sm text-[var(--color-text-secondary)] truncate">
                {subtitle}
              </div>
            ) : null}
          </div>
          <Breadcrumbs breadcrumbs={breadcrumbs} />
        </div>
        {!hasToolbar ? <StatusBadge statusBadge={statusBadge} /> : null}
      </div>
    </div>
  );
};

export default ModuleHeader;
