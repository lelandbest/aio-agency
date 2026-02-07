/**
 * Flow Builder Header
 * 2-row layout:
 * Row 1: Save button + Activate/Deactivate toggle
 * Row 2: Module name + breadcrumbs
 */

import React from 'react';
import { ChevronRight, ArrowLeft, Info, History } from 'lucide-react';

const FlowBuilderHeader = ({
  flowName = 'Untitled Flow',
  status = 'Draft',
  onExit,
  onToggleDetails,
  isDetailsOpen = false,
  onOpenHistory,
  onBreadcrumbClick,
  breadcrumbs = [],
}) => {
  return (
    <div className="bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
      {/* Row 1: Actions */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[var(--color-border)]">
        {/* Left: Exit */}
        <div className="flex items-center gap-3">
          {onExit && (
            <button
              onClick={onExit}
              className="flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-hover)]"
            >
              <ArrowLeft className="w-4 h-4" />
              Exit
            </button>
          )}
        </div>

        {/* Right: Details + History */}
        <div className="flex items-center gap-2">
          {onToggleDetails && (
            <button
              onClick={onToggleDetails}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm
                transition-all duration-200
                ${
                  isDetailsOpen
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-hover)]'
                }
              `}
            >
              <Info className="w-4 h-4" />
              Details
            </button>
          )}
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-hover)]"
            >
              <History className="w-4 h-4" />
              History
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Title + Breadcrumbs */}
      <div className="h-10 flex items-center px-6 gap-2 text-sm">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onBreadcrumbClick?.(null)}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            Flows
          </button>

          {breadcrumbs.length > 0 && (
            <>
              <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />
              <span className="font-semibold text-[var(--color-text-primary)]">
                {flowName}
              </span>
            </>
          )}

          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />
              <button
                onClick={() => onBreadcrumbClick?.(crumb.id)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                {crumb.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Status Badge */}
        <div className="ml-auto">
          <span
            className={`
              text-xs font-medium px-2.5 py-1 rounded-full
              ${
                status === 'Active'
                  ? 'bg-[var(--color-success)]'
                  : 'bg-[var(--color-bg-tertiary)]'
              }
              text-white dark:text-white
            `}
          >
            {status}
          </span>
        </div>
      </div>
    </div>
  );
};

export default FlowBuilderHeader;
