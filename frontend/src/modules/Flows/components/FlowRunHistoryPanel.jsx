import React from 'react';
import { GitCompare, History, Loader2, RotateCw, Search, Workflow, X } from 'lucide-react';

const toneByStatus = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  failed: 'border-red-500/30 bg-red-500/10 text-red-200',
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
  paused: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  executing: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  blocked: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
};

const formatStamp = (value) => {
  if (!value) return 'Unknown';
  try {
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const FlowRunHistoryPanel = ({
  runs,
  loading,
  error,
  activeRunId,
  compareRunId,
  inspectingRunId,
  comparingRunId,
  rerunningRunId,
  onInspect,
  onCompare,
  onRerun,
}) => (
  <div className="w-[24rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/95 shadow-2xl backdrop-blur-xl">
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/80 px-4 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-violet-300" />
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--color-text-primary)]">Flow Runs</span>
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Stored execution history for this flow
        </div>
      </div>
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-tertiary)]" /> : null}
    </div>

    <div className="max-h-[20rem] overflow-y-auto p-3 crm-scroll-hidden">
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!error && !loading && !runs.length ? (
        <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 px-3 py-4 text-sm text-[var(--color-text-secondary)]">
          No stored runs yet for this flow.
        </div>
      ) : null}

      <div className="space-y-2">
        {runs.map((run) => {
          const statusKey = String(run.status || 'unknown').toLowerCase();
          const toneClass = toneByStatus[statusKey] || 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]';
          const isBase = activeRunId && activeRunId === run.id;
          const isCompare = compareRunId && compareRunId === run.id;
          return (
            <div
              key={run.id}
              className={`rounded-xl border p-3 ${isBase ? 'border-violet-500/40 bg-violet-500/10' : isCompare ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Workflow className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                    <div className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                      {run.command_text || run.flow_name || 'Flow Run'}
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                    {formatStamp(run.created_at)} | {run.step_count || (Array.isArray(run.steps) ? run.steps.length : 0)} step{(run.step_count || (Array.isArray(run.steps) ? run.steps.length : 0)) === 1 ? '' : 's'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {isBase ? (
                      <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100">
                        Base
                      </span>
                    ) : null}
                    {isCompare ? (
                      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                        Compare
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${toneClass}`}>
                  {run.status || 'unknown'}
                </span>
              </div>

              {run.result ? (
                <div className="mt-2 line-clamp-2 text-xs text-[var(--color-text-secondary)]">
                  {run.result}
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onInspect?.(run)}
                  disabled={inspectingRunId === run.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {inspectingRunId === run.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  {isBase ? 'Base Selected' : 'Set Base'}
                </button>
                <button
                  type="button"
                  onClick={() => onCompare?.(run)}
                  disabled={comparingRunId === run.id || isBase}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                    isCompare
                      ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20'
                      : 'border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                  }`}
                >
                  {comparingRunId === run.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isCompare ? <X className="h-3.5 w-3.5" /> : <GitCompare className="h-3.5 w-3.5" />}
                  {isCompare ? 'Clear Compare' : 'Set Compare'}
                </button>
                <button
                  type="button"
                  onClick={() => onRerun?.(run)}
                  disabled={rerunningRunId === run.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rerunningRunId === run.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                  Rerun
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export default FlowRunHistoryPanel;
