import React from 'react';
import { ChevronRight } from 'lucide-react';
import { normalizeDisplayText } from '../utils/text';

const StatusBadge = ({ statusBadge }) => {
  if (!statusBadge) return null;

  return (
    <div
      className={`
        px-3 py-1 rounded-[var(--radius-pill)] text-xs font-medium whitespace-nowrap flex-shrink-0 border border-current shadow-premium
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

const colorClasses = {
  emerald: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25',
  rose: 'border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
  violet: 'border-violet-500/40 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25',
  sky: 'border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25',
  red: 'border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25',
  slate: 'btn-secondary',
  primary: 'btn-primary-skeuo',
};

const Actions = ({ actions }) => {
  if (!actions.length) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {actions.map((action, idx) => {
        const ActionIcon = action.icon;
        const colorClass = colorClasses[action.color] || colorClasses.slate;
        const isSkeuo = action.variant === 'primary' || action.color === 'primary';

        return (
          <React.Fragment key={idx}>
            {action.groupStart && (
              <div className="mx-1 hidden h-6 w-px self-center rounded-[var(--radius-pill)] bg-[var(--color-border)] opacity-30 xl:block" />
            )}
            <button
              onClick={action.onClick}
              disabled={action.disabled}
              className={`
                ${isSkeuo ? 'btn-primary-skeuo' : 'btn-secondary'}
                text-[10px] sm:text-xs py-1.5 px-3
                ${!isSkeuo && action.color && action.color !== 'slate' ? colorClasses[action.color] : ''}
                disabled:opacity-40 disabled:cursor-not-allowed
                ${action.className || ''}
              `}
              title={action.title}
            >
              {ActionIcon && <ActionIcon size={12} />}
              <span className="font-bold tracking-tight">{normalizeDisplayText(action.label)}</span>
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
  toolbarLeftSlot = null,
  toolbarCenterSlot = null,
  toolbarRightSlot = null,
  aiAssistSlot = null,
  className = ''
}) => {
  const hasToolbar = (showActions && actions.length > 0) || breadcrumbs.length > 0 || statusBadge || toolbarLeftSlot || toolbarCenterSlot || toolbarRightSlot || aiAssistSlot;

  if (!showTitle && !hasToolbar && !subtitle) {
    return null;
  }

  const containerClass = `border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/80 backdrop-blur-md ${className}`;
  const paddingClass = "px-6 py-4 sm:py-5";

  if (!showTitle) {
    return (
      <div className={containerClass}>
        <div className={`${paddingClass} flex items-center justify-between gap-4`}>
          <div className="flex min-w-0 flex-1 items-center gap-4 flex-wrap">
            {showCompactTitle ? (
              <div className="min-w-0 mr-2">
                <div className="text-lg font-black text-[var(--color-text-primary)] truncate uppercase tracking-tight">
                  {normalizeDisplayText(title)}
                </div>
                {subtitle ? (
                  <div className="mt-0.5 text-[10px] text-[var(--color-text-secondary)] truncate uppercase tracking-[0.1em] font-bold">
                    {subtitle}
                  </div>
                ) : null}
              </div>
            ) : null}
            {toolbarLeftSlot}
            <Breadcrumbs breadcrumbs={breadcrumbs} />
            {showActions && <Actions actions={actions} />}
          </div>
          {toolbarCenterSlot ? (
            <div className="hidden min-w-0 flex-1 justify-center xl:flex">
              {toolbarCenterSlot}
            </div>
          ) : null}
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {toolbarRightSlot}
            <StatusBadge statusBadge={statusBadge} />
            {aiAssistSlot}
          </div>
        </div>
        {subtitle && !showCompactTitle ? (
          <div className="px-6 pb-4 text-xs text-[var(--color-text-secondary)] uppercase tracking-widest font-bold opacity-70">
            {subtitle}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`${containerClass} flex flex-col`}>
      {hasToolbar && (
        <div className="px-6 py-3 flex items-center justify-between gap-4 border-b border-[var(--color-border)]/50 shadow-premium">
          <div className="flex min-w-0 flex-1 items-center gap-4 flex-wrap">
            {toolbarLeftSlot}
            <Breadcrumbs breadcrumbs={breadcrumbs} />
            {showActions && <Actions actions={actions} />}
          </div>
          {toolbarCenterSlot ? (
            <div className="hidden min-w-0 flex-1 justify-center xl:flex">
              {toolbarCenterSlot}
            </div>
          ) : null}
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {toolbarRightSlot}
            <StatusBadge statusBadge={statusBadge} />
            {aiAssistSlot}
          </div>
        </div>
      )}

      <div className={`${paddingClass} flex items-center justify-between gap-4`}>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {TitleIcon && <TitleIcon size={24} className="text-[var(--color-primary)] flex-shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text-primary)] truncate uppercase tracking-tight leading-tight">
              {normalizeDisplayText(title)}
            </h1>
            {subtitle ? (
              <div className="mt-1 text-[10px] sm:text-xs text-[var(--color-text-secondary)] truncate uppercase tracking-[0.12em] font-bold opacity-80">
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
