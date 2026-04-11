import React from 'react';
import { 
  ChevronRight, HelpCircle, 
  Search, Bell, Settings, Info, 
  Trash2, Shield, User, Zap, Mail, Plus,
  FileInput, Download, Tag, X, ChevronLeft,
  RefreshCw
} from 'lucide-react';
import { useAIAssist } from '../contexts/AIAssistContext';
import { normalizeDisplayText } from '../utils/text';
import { BrainIcon, Crosshair, CommandSurfaceIcon } from './ui/icons';
import { openGlobalOverlay } from './GlobalOverlay';

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

const Actions = ({ actions, leadIndex = null }) => {
  if (!actions || !actions.length) return null;

  return (
    <div className="flex max-w-full items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap">
      {actions.map((action, idx) => {
        if (React.isValidElement(action)) {
          return <React.Fragment key={idx}>{action}</React.Fragment>;
        }
        const ActionIcon = action.icon;
        const isLeadAction = leadIndex === idx;
        const isSkeuo = !isLeadAction && (action.variant === 'primary' || action.color === 'primary');

        return (
          <React.Fragment key={idx}>
            {action.groupStart && idx > 0 && (
              <div className="mx-1 hidden h-6 w-px self-center rounded-[var(--radius-pill)] bg-[var(--color-border)] opacity-30 xl:block" />
            )}
            <button
              onClick={action.onClick}
              disabled={action.disabled}
              className={`
                ${isLeadAction ? 'btn-toolbar-lead' : isSkeuo ? 'btn-primary-skeuo' : 'btn-secondary'}
                shrink-0 whitespace-nowrap
                text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2
                ${!isLeadAction && !isSkeuo && action.color && action.color !== 'slate' ? colorClasses[action.color] : ''}
                disabled:opacity-40 disabled:cursor-not-allowed
                ${action.className || ''}
              `}
              title={action.title}
            >
              {ActionIcon && <ActionIcon size={12} />}
              <span className="font-bold uppercase tracking-[0.14em]">{normalizeDisplayText(action.label)}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

/**
 * ModuleHeader Toolbar Contract:
 * 
 * Core toolbar actions (always present):
 * - Brain: Global Knowledge Base access
 * - Crosshair: Module-specific AI assistance
 * 
 * System-level icons (allowed additions):
 * - Command Surface: Global overlay / command entry point
 * 
 * The toolbar renders dynamically. Core icons are required.
 * Additional system-level icons are allowed when they provide
 * global functionality (overlay, commands, system-level entry points).
 * 
 * Layout and styling must remain consistent.
 */

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
  onModuleAi = null,
}) => {
  const { openAIAssist } = useAIAssist?.() || {};
  const toolbarIconButtonClass = 'p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all group disabled:opacity-20 disabled:cursor-not-allowed';
  
  return (
    <div className={`module-toolbar shrink-0 overflow-visible transition-all duration-300 ${className}`}>
      <div className="flex items-center gap-4 min-w-0 flex-1 h-full font-bold">
        {leftActions.length > 0 && <Actions actions={leftActions} leadIndex={0} />}
        {toolbarLeftSlot}
        {TitleIcon && <TitleIcon size={16} className="text-[var(--color-primary)] flex-shrink-0" />}
        {(title && showTitle) && (
          <h1 className="text-[10px] font-black text-[var(--color-text-primary)] truncate uppercase tracking-[0.24em] leading-none">
            {normalizeDisplayText(title)}
          </h1>
        )}
        <Breadcrumbs breadcrumbs={breadcrumbs} />
      </div>

      {toolbarCenterSlot && (
        <div className="flex flex-1 justify-center items-center h-full min-w-0">{toolbarCenterSlot}</div>
      )}

      <div className="flex min-w-0 items-center gap-3 flex-shrink-0 h-full">
        <div className="flex min-w-0 items-center gap-1.5">
          {toolbarRightSlot}
          {showActions && <Actions actions={actions} leadIndex={leftActions.length === 0 ? 0 : null} />}
        </div>
        
        {/* Standardized AI Assistance Toolbar */}
        <div className="module-toolbar-utility">
          {/* Brain - Global Knowledge */}
          <button
            onClick={() => {
              if (openAIAssist) openAIAssist();
              else console.warn('AIAssistContext not found');
            }}
            className={toolbarIconButtonClass}
            title="Brain (Global KB)"
          >
            <BrainIcon size={15} />
          </button>
          
          {/* Crosshair - Module Specific Assistance */}
          <button
            onClick={() => onModuleAi?.()}
            disabled={!onModuleAi}
            className={toolbarIconButtonClass}
            title="Crosshair (Module AI)"
          >
            <Crosshair size={15} />
          </button>

          {/* Command Surface - Global Overlay Trigger */}
          <button
            onClick={() => openGlobalOverlay()}
            className={toolbarIconButtonClass}
            title="Command Surface"
          >
            <CommandSurfaceIcon size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModuleHeader;
