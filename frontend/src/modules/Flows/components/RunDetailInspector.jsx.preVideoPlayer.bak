import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileJson, GitCompare, Play, Terminal, X } from 'lucide-react';

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

const findCompareStep = (compareSteps, step, index) => {
  if (!Array.isArray(compareSteps) || !step) return null;
  return compareSteps.find((candidate) =>
    candidate?.id === step.id
    || (candidate?.intent === step.intent && candidate?.nodeLabel === step.nodeLabel)
  ) || compareSteps[index] || null;
};

const buildComparisonRows = (baseSteps, compareSteps) => {
  const rows = [];
  const usedCompare = new Set();

  (baseSteps || []).forEach((baseStep, index) => {
    const compareStep = findCompareStep(compareSteps, baseStep, index);
    if (compareStep) {
      usedCompare.add(compareStep.id || `${compareStep.intent}:${compareStep.nodeLabel}:${index}`);
    }
    rows.push({
      key: baseStep?.id || `${baseStep?.intent || 'step'}-${index}`,
      label: baseStep?.nodeLabel || compareStep?.nodeLabel || baseStep?.intent || compareStep?.intent || `Step ${index + 1}`,
      intent: baseStep?.intent || compareStep?.intent || 'action',
      baseStep: baseStep || null,
      compareStep: compareStep || null,
    });
  });

  (compareSteps || []).forEach((compareStep, index) => {
    const key = compareStep.id || `${compareStep.intent}:${compareStep.nodeLabel}:${index}`;
    if (usedCompare.has(key)) {
      return;
    }
    rows.push({
      key: `compare-only-${key}`,
      label: compareStep?.nodeLabel || compareStep?.intent || `Step ${index + 1}`,
      intent: compareStep?.intent || 'action',
      baseStep: null,
      compareStep,
    });
  });

  return rows;
};

const hasText = (value) => String(value || '').trim().length > 0;
const presentLabel = (value) => (hasText(value) ? 'Present' : 'Not present');
const differenceBadgeClass = (changed) => changed
  ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';

const SummaryCard = ({ label, run, toneClass }) => (
  <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-secondary)]/60 p-3">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{label}</div>
        <div className="mt-1 truncate font-mono text-xs text-[var(--color-text-primary)]">{run?.runId || 'Unavailable'}</div>
      </div>
      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${toneClass}`}>
        {run?.status || 'unknown'}
      </span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Trigger</div>
        <div className="mt-1 text-[var(--color-text-primary)]">{run?.triggerType || 'manual_trigger'}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Timestamp</div>
        <div className="mt-1 text-[var(--color-text-primary)]">{formatStamp(run?.finishedAt || run?.startedAt)}</div>
      </div>
    </div>
    {run?.error ? (
      <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
        {run.error}
      </div>
    ) : null}
  </div>
);

const PayloadColumn = ({ label, step, tone = 'base' }) => (
  <div className={`space-y-2 rounded-xl border p-3 ${tone === 'compare' ? 'border-cyan-500/20 bg-cyan-500/5' : 'border-[var(--color-border)]/60 bg-[var(--color-bg-secondary)]/40'}`}>
    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{label}</div>

    <div className="text-xs text-[var(--color-text-secondary)]">Parameters: {step?.parameters ? 'Present' : 'Not present'}</div>
    {step?.parameters ? (
      <pre className="max-h-40 overflow-auto rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-secondary)]/70 p-3 font-mono text-[11px] text-[var(--color-text-secondary)] crm-scroll-hidden">
        {JSON.stringify(step.parameters, null, 2)}
      </pre>
    ) : null}

    <div className="text-xs text-[var(--color-text-secondary)]">Output: {presentLabel(step?.output)}</div>
    {hasText(step?.output) ? (
      <div className="rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/50 px-3 py-2 text-xs text-[var(--color-text-secondary)]">
        {step.output}
      </div>
    ) : null}

    <div className="text-xs text-[var(--color-text-secondary)]">Error: {presentLabel(step?.error)}</div>
    {hasText(step?.error) ? (
      <pre className="max-h-32 overflow-auto rounded-xl border border-red-500/30 bg-red-500/10 p-3 font-mono text-[11px] text-red-200 crm-scroll-hidden">
        {JSON.stringify(step.error, null, 2)}
      </pre>
    ) : null}

    <div className="text-xs text-[var(--color-text-secondary)]">Raw Payload: {step?.raw ? 'Present' : 'Not present'}</div>
    {step?.raw ? (
      <pre className="max-h-48 overflow-auto rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-secondary)]/70 p-3 font-mono text-[11px] text-[var(--color-text-secondary)] crm-scroll-hidden">
        {JSON.stringify(step.raw, null, 2)}
      </pre>
    ) : null}
  </div>
);

const RunDetailInspector = ({ run, compareRun = null, onClearCompare = null }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState({});

  const steps = useMemo(() => (Array.isArray(run?.steps) ? run.steps : []), [run?.steps]);
  const compareSteps = useMemo(() => (Array.isArray(compareRun?.steps) ? compareRun.steps : []), [compareRun?.steps]);
  const comparisonRows = useMemo(() => buildComparisonRows(steps, compareSteps), [steps, compareSteps]);

  if (!run) return null;

  const toneClass = toneClassByStatus[run.status] || toneClassByStatus.unknown;

  const toggleStepExpansion = (stepId) => {
    setExpandedStepIds((current) => ({
      ...current,
      [stepId]: !current[stepId],
    }));
  };

  return (
    <div className="fixed bottom-[22rem] right-4 z-50 w-[34rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/80 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-sky-300" />
            <span className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--color-text-primary)]">Run Inspector</span>
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
            {compareRun ? 'Two-run side-by-side comparison' : 'Current structured run view'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {compareRun && onClearCompare ? (
            <button
              type="button"
              onClick={onClearCompare}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100 hover:bg-cyan-500/20"
            >
              <X size={12} />
              Clear Compare
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="rounded-lg p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="max-h-[34rem] overflow-y-auto p-3 crm-scroll-hidden">
          {compareRun ? (
            <section className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-3">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                <GitCompare size={13} />
                Run Summary
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                <SummaryCard label="Base" run={run} toneClass={toneClass} />
                <SummaryCard label="Compare" run={compareRun} toneClass={toneClassByStatus[compareRun.status] || toneClassByStatus.unknown} />
              </div>
            </section>
          ) : (
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
          )}

          <section className="mt-3 space-y-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
              {compareRun ? 'Step Comparison' : 'Step Results'}
            </div>
            {(compareRun ? comparisonRows : steps).length ? (compareRun ? comparisonRows : steps).map((entry, index) => {
              const baseStep = compareRun ? entry.baseStep : entry;
              const compareStep = compareRun ? entry.compareStep : null;
              const stepKey = compareRun ? entry.key : (baseStep?.id || `step-${index + 1}`);
              const expanded = !!expandedStepIds[stepKey];
              const jobs = compareRun ? [] : collectIds(baseStep).jobs;
              const artifacts = compareRun ? [] : collectIds(baseStep).artifacts;
              const baseToneClass = toneClassByStatus[baseStep?.status] || toneClassByStatus.unknown;
              const compareToneClass = toneClassByStatus[compareStep?.status] || toneClassByStatus.unknown;
              const hasStatusDiff = compareRun ? String(baseStep?.status || 'Not present') !== String(compareStep?.status || 'Not present') : false;
              const hasErrorDiff = compareRun ? presentLabel(baseStep?.error) !== presentLabel(compareStep?.error) : false;
              const hasOutputDiff = compareRun ? presentLabel(baseStep?.output) !== presentLabel(compareStep?.output) : false;
              const hasMissingStep = compareRun ? (!baseStep || !compareStep) : false;
              const hasAnyChange = hasStatusDiff || hasErrorDiff || hasOutputDiff || hasMissingStep;

              return (
                <div key={stepKey} className={`rounded-xl border p-3 ${compareRun && hasAnyChange ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                        {compareRun ? entry.label : baseStep?.nodeLabel || baseStep?.intent || baseStep?.id || 'Step'}
                      </div>
                      <div className="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                        {compareRun ? entry.intent : baseStep?.intent || 'action'}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${compareRun ? differenceBadgeClass(hasAnyChange) : baseToneClass}`}>
                      {compareRun ? (hasAnyChange ? 'Changed' : 'Match') : (baseStep?.status || 'unknown')}
                    </span>
                  </div>

                  {compareRun ? (
                    <div className="mt-3 grid gap-3 xl:grid-cols-2">
                      <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-secondary)]/55 p-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Base</div>
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[var(--color-text-secondary)]">Status</span>
                            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${baseToneClass}`}>{baseStep?.status || 'Not present'}</span>
                          </div>
                          <div className="text-[var(--color-text-secondary)]">Output: <span className="text-[var(--color-text-primary)]">{presentLabel(baseStep?.output)}</span></div>
                          <div className="text-[var(--color-text-secondary)]">Error: <span className="text-[var(--color-text-primary)]">{presentLabel(baseStep?.error)}</span></div>
                          {baseStep?.error ? (
                            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                              {String(baseStep.error)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Compare</div>
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-cyan-100/80">Status</span>
                            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${compareStep ? compareToneClass : toneClassByStatus.unknown}`}>{compareStep?.status || 'Not present'}</span>
                          </div>
                          <div className="text-cyan-100/80">Output: <span className="text-cyan-50">{presentLabel(compareStep?.output)}</span></div>
                          <div className="text-cyan-100/80">Error: <span className="text-cyan-50">{presentLabel(compareStep?.error)}</span></div>
                          {compareStep?.error ? (
                            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                              {String(compareStep.error)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {(baseStep?.startedAt || baseStep?.completedAt) ? (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-secondary)]">
                          <span>Started: {formatStamp(baseStep.startedAt)}</span>
                          <span>Finished: {formatStamp(baseStep.completedAt)}</span>
                        </div>
                      ) : null}
                      {baseStep?.output ? (
                        <div className="mt-2 rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)]/60 px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                          {baseStep.output}
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
                      {baseStep?.error ? (
                        <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                          {String(baseStep.error)}
                        </div>
                      ) : null}
                    </>
                  )}

                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => toggleStepExpansion(stepKey)}
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      <FileJson size={13} />
                      {expanded ? 'Hide Step Payload' : 'Inspect Step Payload'}
                    </button>
                    {expanded ? (
                      <div className={`mt-2 grid gap-2 ${compareRun ? 'xl:grid-cols-2' : ''}`}>
                        <PayloadColumn label={compareRun ? 'Base Payload' : 'Step Payload'} step={baseStep} tone="base" />
                        {compareRun ? <PayloadColumn label="Compare Payload" step={compareStep} tone="compare" /> : null}
                      </div>
                    ) : null}
                  </div>
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
              {showRaw ? 'Hide Raw Payloads' : 'Show Raw Payloads'}
            </button>
            {showRaw ? (
              <div className={`mt-2 grid gap-2 ${compareRun ? 'xl:grid-cols-2' : ''}`}>
                <pre className="max-h-48 overflow-auto rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-3 font-mono text-[11px] text-[var(--color-text-secondary)] crm-scroll-hidden">
                  {JSON.stringify(run.raw || run, null, 2)}
                </pre>
                {compareRun ? (
                  <pre className="max-h-48 overflow-auto rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 font-mono text-[11px] text-cyan-100 crm-scroll-hidden">
                    {JSON.stringify(compareRun.raw || compareRun, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-[var(--color-text-secondary)]">
          <Terminal size={14} />
          <span>{run.runId || 'Latest run'} | {steps.length} step{steps.length === 1 ? '' : 's'}</span>
        </div>
      )}
    </div>
  );
};

export default RunDetailInspector;
