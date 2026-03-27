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
    <div className="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] px-3 py-2">
      {/* Left: Back + Breadcrumbs */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}
            <div className="flex min-w-0 items-center gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => onBreadcrumbClick?.(null)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                Flows
              </button>
              <ChevronRight className="w-3 h-3 text-[var(--color-text-tertiary)]" />
              <span className="truncate font-medium text-[var(--color-text-primary)]">
                {flowName}
              </span>
              {breadcrumbs.map((crumb) => (
                <React.Fragment key={crumb.id}>
                  <ChevronRight className="w-3 h-3 text-[var(--color-text-tertiary)]" />
                  <button
                    type="button"
                    onClick={() => onBreadcrumbClick?.(crumb.id)}
                    className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center justify-end gap-1">
          {aiAssistSlot}
          {onImport && (
            <button
              type="button"
              onClick={onImport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-all shadow-premium border border-[var(--color-border)] font-black uppercase tracking-widest text-[10px]"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>Import</span>
            </button>
          )}
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-all shadow-premium border border-emerald-400/30 font-black uppercase tracking-widest text-[10px]"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          )}
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Export</span>
            </button>
          )}
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          )}
          {onToggleDetails && (
            <button
              type="button"
              onClick={onToggleDetails}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                isDetailsOpen
                  ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] border border-transparent'
              }`}
            >
              {isDetailsOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">{isDetailsOpen ? 'Hide' : 'Details'}</span>
            </button>
          )}
          <span
            className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ml-1 border ${
              status === 'Active'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)] border-[var(--color-border)]'
            }`}
          >
            {status}
          </span>
        </div>
      </div>
    </div>
  );
};

export default FlowBuilderHeader;
