/**
 * Flow Builder Header
 * Compact header with clear action hierarchy
 */

import React from 'react';
import { ArrowLeft, Info, History, Save, Upload, Download, PanelRightClose, PanelRight } from 'lucide-react';

const FlowBuilderHeader = ({
  flowName = 'Untitled Flow',
  status = 'Draft',
  onExit,
  onSave,
  onToggleDetails,
  isDetailsOpen = false,
  onOpenHistory,
  aiAssistSlot = null,
  onImport,
  onExport,
}) => {
  return (
    <div className="h-12 shrink-0 flex items-center justify-between gap-4 px-5 mx-1 mt-1 border border-[var(--color-border)]/50 bg-[var(--color-bg-tertiary)]/90 backdrop-blur-md overflow-hidden rounded-xl shadow-island-sm transition-all duration-300">
      {/* Left: Single context-aware button */}
      <div className="flex items-center gap-2 min-w-0 h-full">
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="btn-secondary h-8 flex items-center gap-2 whitespace-nowrap text-[10px] px-3 font-bold uppercase tracking-tight"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to List</span>
          </button>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex flex-wrap items-center justify-end gap-1.5 h-full flex-shrink-0">
        {onImport && (
          <button
            type="button"
            onClick={onImport}
            className="btn-secondary h-8 flex items-center gap-2 whitespace-nowrap text-[10px] px-3 font-bold uppercase tracking-tight"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Import</span>
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="btn-secondary h-8 flex items-center gap-2 whitespace-nowrap text-[10px] px-3 font-bold uppercase tracking-tight"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export</span>
          </button>
        )}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className="btn-primary-skeuo h-8 flex items-center gap-2 whitespace-nowrap text-[10px] px-3 font-bold uppercase tracking-tight"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
        )}
        {onToggleDetails && (
          <button
            type="button"
            onClick={onToggleDetails}
            className={`h-8 flex items-center gap-2 whitespace-nowrap text-[10px] px-4 font-bold uppercase tracking-tight rounded-[var(--radius-card)] transition-all shadow-sm ${
              isDetailsOpen
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                : 'btn-secondary'
            }`}
          >
            {isDetailsOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">{isDetailsOpen ? 'Hide' : 'Details'}</span>
          </button>
        )}
        {aiAssistSlot}
      </div>
    </div>
  );
};

export default FlowBuilderHeader;
