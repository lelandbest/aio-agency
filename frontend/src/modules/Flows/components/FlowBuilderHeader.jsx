/**
 * Flow Builder Header
 * Compact header with clear action hierarchy
 */

import React from 'react';
import { ChevronRight, ArrowLeft, Info, History, Save, Upload, Download, PanelRightClose, PanelRight } from 'lucide-react';

const FlowBuilderHeader = ({
  flowName = 'Untitled Flow',
  status = 'Draft',
  onExit,
  onSave,
  onToggleDetails,
  isDetailsOpen = false,
  onOpenHistory,
  onBreadcrumbClick,
  breadcrumbs = [],
  aiAssistSlot = null,
  onImport,
  onExport,
}) => {
  return (
    <div className="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] h-10 flex items-center justify-between px-3">
      {/* Left: Back + Breadcrumbs */}
      <div className="flex items-center gap-2">
        {onExit && (
          <button
            onClick={onExit}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back</span>
          </button>
        )}
        <div className="flex items-center gap-1 text-[11px]">
          <button
            onClick={() => onBreadcrumbClick?.(null)}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            Flows
          </button>
          <ChevronRight className="w-3 h-3 text-[var(--color-text-tertiary)]" />
          <span className="font-medium text-[var(--color-text-primary)]">
            {flowName}
          </span>
          {breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="w-3 h-3 text-[var(--color-text-tertiary)]" />
              <button
                onClick={() => onBreadcrumbClick?.(crumb.id)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                {crumb.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {aiAssistSlot}
        {onSave && (
          <button
            onClick={onSave}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Save</span>
          </button>
        )}
        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Export</span>
          </button>
        )}
        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors"
          >
            <History className="w-3.5 h-3.5" />
          </button>
        )}
        {onToggleDetails && (
          <button
            onClick={onToggleDetails}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
              isDetailsOpen
                ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
            }`}
          >
            {isDetailsOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">{isDetailsOpen ? 'Hide' : 'Details'}</span>
          </button>
        )}
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ml-1 ${
            status === 'Active'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)] border border-[var(--color-border)]'
          }`}
        >
          {status}
        </span>
      </div>
    </div>
  );
};

export default FlowBuilderHeader;
