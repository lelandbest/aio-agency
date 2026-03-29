import React from 'react';
import { ChevronRight, Brain, Crosshair } from 'lucide-react';
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
  if (!breadcrumbs || !breadcrumbs.length) return null;

  return (
    <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)] flex-wrap">
      {breadcrumbs.map((crumb, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight size={12} className="flex-shrink-0" />
          <button
            onClick={crumb.onClick}
            className={`hover:text-[var(--color-text-primary)] transition truncate uppercase tracking-widest ${
              idx === breadcrumbs.length - 1 ? 'text-[var(--color-text-primary)] font-bold' : ''
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
  if (!actions || !actions.length) return null;

  return (
    <div className="flex max-w-full items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap">
      {actions.map((action, idx) => {
        if (React.isValidElement(action)) {
          return <React.Fragment key={idx}>{action}</React.Fragment>;
        }
        const ActionIcon = action.icon;
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
                shrink-0 whitespace-nowrap
                text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2
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
  leftActions = [],
  statusBadge = null,
  showTitle = true,
  showCompactTitle = false,
  showActions = true,
  toolbarLeftSlot = null,
  toolbarCenterSlot = null,
  toolbarRightSlot = null,
  aiAssistSlot = null,
  executeSlot = null,
  hasSelection = false,
  className = '',
}) => {
  // Industrial Island Standard: 48px height, rounded corners, floating background
  return (
    <div className={`h-12 shrink-0 flex items-center justify-between gap-4 px-5 border border-[var(--color-border)]/50 bg-[var(--color-bg-tertiary)]/90 backdrop-blur-md overflow-hidden rounded-xl shadow-island-sm transition-all duration-300 ${className}`}>
      <div className="flex items-center gap-4 min-w-0 flex-1 h-full font-bold">
        {toolbarLeftSlot}
        {leftActions.length > 0 && <Actions actions={leftActions} />}
        {TitleIcon && <TitleIcon size={16} className="text-[var(--color-primary)] flex-shrink-0" />}
        {(title && showTitle) && (
          <h1 className="text-[10px] font-black text-[var(--color-text-primary)] truncate uppercase tracking-[0.24em] leading-none">
            {normalizeDisplayText(title)}
          </h1>
        )}
        <Breadcrumbs breadcrumbs={breadcrumbs} />
      </div>

      {toolbarCenterSlot && (
        <div className="hidden lg:flex flex-1 justify-center items-center h-full min-w-0">{toolbarCenterSlot}</div>
      )}

      <div className="flex items-center gap-3 flex-shrink-0 h-full">
        <div className="flex items-center gap-2">
          {toolbarRightSlot}
          {showActions && <Actions actions={actions} />}
        </div>
        {aiAssistSlot}
        {executeSlot && (
          <div className={hasSelection ? '' : 'opacity-40 pointer-events-none'}>
            {executeSlot}
          </div>
        )}
      </div>
    </div>
  );
};

export { Brain, Crosshair };
export default ModuleHeader;
