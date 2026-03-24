/**
 * Flow Builder Header
 * 2-row layout:
 * Row 1: Save button + Activate/Deactivate toggle
 * Row 2: Module name + breadcrumbs
 */

import React from 'react';
import { ChevronRight, ArrowLeft, Info, History, Maximize2, Minimize2, Save, Upload, Download } from 'lucide-react';

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
  onToggleFullscreen,
  isFullscreen = false,
}) => {
  return (
    <div className="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
      {/* Row 1: Toolbar */}
      <div className="h-11 flex items-center justify-between px-4 gap-2">
        {/* Left: Exit + Fullscreen */}
        <div className="flex items-center gap-2">
          {onExit && (
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium text-xs bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Exit
            </button>
          )}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium text-xs bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
          )}
        </div>

        {/* Center: Breadcrumbs */}
        <div className="flex items-center gap-1.5 text-xs">
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
          {breadcrumbs.map((crumb, idx) => (
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

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {aiAssistSlot}
          {onSave && (
            <button
              onClick={onSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium text-xs bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
          )}
          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium text-xs bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          )}
          {onImport && (
            <button
              onClick={onImport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium text-xs bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
          )}
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium text-xs bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50"
            >
              <History className="w-3.5 h-3.5" />
              History
            </button>
          )}
          {onToggleDetails && (
            <button
              onClick={onToggleDetails}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium text-xs transition-all ${
                isDetailsOpen
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              Details
            </button>
          )}
          <span
            className={`text-[10px] font-medium px-2.5 py-1 rounded-full ${
              status === 'Active'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)] border border-[var(--color-border)]'
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
