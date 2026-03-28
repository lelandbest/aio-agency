import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileJson, Play, Terminal } from 'lucide-react';

const toneClassByStatus = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  failed: 'border-red-500/30 bg-red-500/10 text-red-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
  blocked: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  paused: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  executing: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  unknown: 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]',
};

const formatStamp = (value) => {
  if (!value) return 'Unavailable';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const collectIds = (step) => {
  const data = step?.data && typeof step.data === 'object' ? step.data : {};
  const jobs = [];
  const artifacts = [];

  if (data.job?.id) jobs.push(data.job.id);
  if (data.transcript_job?.id) jobs.push(data.transcript_job.id);
  if (data.artifact?.id) artifacts.push(data.artifact.id);
  if (data.transcript_artifact?.id) artifacts.push(data.transcript_artifact.id);
  if (Array.isArray(data.assets)) {
    data.assets.forEach((asset) => {
      if (asset?.id) artifacts.push(asset.id);
    });
  }

  return {
    jobs: Array.from(new Set(jobs)),
    artifacts: Array.from(new Set(artifacts)),
  };
};

const RunDetailInspector = ({ run }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const steps = useMemo(() => (Array.isArray(run?.steps) ? run.steps : []), [run?.steps]);

  if (!run) return null;

  const toneClass = toneClassByStatus[run.status] || toneClassByStatus.unknown;

  return (
    <div className="fixed bottom-[22rem] right-4 z-50 w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/80 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-sky-300" />
            <span className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--color-text-primary)]">Run Inspector</span>
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
            Latest manual run
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="rounded-lg p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {!collapsed ? (
        <div className="max-h-[32rem] overflow-y-auto p-3 crm-scroll-hidden">
          <section className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Run Id</div>
                <div className="truncate font-mono text-xs text-[var(--color-text-primary)]">{run.runId || 'Unavailable'}</div>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${toneClass}`}>
                {run.status || 'unknown'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Trigger</div>
                <div className="mt-1 text-[var(--color-text-primary)]">{run.triggerType || 'manual_trigger'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Started</div>
                <div className="mt-1 text-[var(--color-text-primary)]">{formatStamp(run.startedAt)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Finished</div>
                <div className="mt-1 text-[var(--color-text-primary)]">{formatStamp(run.finishedAt)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Steps</div>
                <div className="mt-1 text-[var(--color-text-primary)]">{steps.length}</div>
              </div>
            </div>
            {run.error ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {run.error}
              </div>
            ) : null}
          </section>

          <section className="mt-3 space-y-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Step Results</div>
            {steps.length ? steps.map((step) => {
              const { jobs, artifacts } = collectIds(step);
              const stepToneClass = toneClassByStatus[step.status] || toneClassByStatus.unknown;
              return (
                <div key={step.id || `${step.intent}-${step.nodeLabel || 'step'}`} className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--color-text-primary)]">{step.nodeLabel || step.intent || step.id || 'Step'}</div>
                      <div className="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{step.intent || 'action'}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${stepToneClass}`}>
                      {step.status || 'unknown'}
                    </span>
                  </div>
                  {(step.startedAt || step.completedAt) ? (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-secondary)]">
                      <span>Started: {formatStamp(step.startedAt)}</span>
                      <span>Finished: {formatStamp(step.completedAt)}</span>
                    </div>
                  ) : null}
                  {jobs.length ? (
                    <div className="mt-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Jobs</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {jobs.map((jobId) => (
                          <span key={jobId} className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 font-mono text-[11px] text-sky-200">{jobId}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {artifacts.length ? (
                    <div className="mt-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Artifacts</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {artifacts.map((artifactId) => (
                          <span key={artifactId} className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 font-mono text-[11px] text-violet-200">{artifactId}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {step.error ? (
                    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      {step.error}
                    </div>
                  ) : null}
                </div>
              );
            }) : (
              <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 px-3 py-4 text-sm text-[var(--color-text-secondary)]">
                No step data was returned for this run.
              </div>
            )}
          </section>

          <section className="mt-3">
            <button
              type="button"
              onClick={() => setShowRaw((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            >
              <FileJson size={14} />
              {showRaw ? 'Hide Raw Payload' : 'Show Raw Payload'}
            </button>
            {showRaw ? (
              <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-3 font-mono text-[11px] text-[var(--color-text-secondary)] crm-scroll-hidden">
                {JSON.stringify(run.raw || run, null, 2)}
              </pre>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-[var(--color-text-secondary)]">
          <Terminal size={14} />
          <span>{run.runId || 'Latest run'} · {steps.length} step{steps.length === 1 ? '' : 's'}</span>
        </div>
      )}
    </div>
  );
};

export default RunDetailInspector;
