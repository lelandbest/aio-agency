import React, { useMemo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Copy, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { sanitizeOutput, sanitizeStepData } from '../utils/sanitizeOutput';
import { computeTokenTrace } from '../utils/tokenTrace';

const STATUS_TONE = {
  success: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-300', label: 'Success' },
  completed: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-300', label: 'Completed' },
  failed: { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-300', label: 'Failed' },
  error: { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-300', label: 'Error' },
  blocked: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-300', label: 'Blocked' },
  paused: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-300', label: 'Paused' },
  executing: { border: 'border-sky-500/40', bg: 'bg-sky-500/10', text: 'text-sky-300', label: 'Executing' },
  skipped: { border: 'border-slate-500/40', bg: 'bg-slate-500/10', text: 'text-slate-300', label: 'Skipped' },
  unknown: { border: 'border-[var(--color-border)]', bg: 'bg-[var(--color-bg-secondary)]', text: 'text-[var(--color-text-tertiary)]', label: 'Unknown' },
};

const formatTimestamp = (value) => {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const JsonNode = ({ keyName, value, depth = 0, path = '' }) => {
  const [collapsed, setCollapsed] = useState(depth > 2);
  const [copied, setCopied] = useState(false);

  const fullPath = keyName ? (path ? `${path}.${keyName}` : keyName) : path;

  const handleCopy = useCallback((e) => {
    e.stopPropagation();
    const text = typeof value === 'object' && value !== null
      ? JSON.stringify(value, null, 2)
      : String(value ?? '');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [value]);

  const handleCopyKey = useCallback((e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fullPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [fullPath]);

  if (value === null || value === undefined) {
    return (
      <div className="flex items-center gap-1" style={{ paddingLeft: depth * 12 }}>
        {keyName !== undefined && (
          <span className="text-[var(--color-text-tertiary)] text-[11px] font-mono cursor-pointer hover:text-[var(--color-text-secondary)]" onClick={handleCopyKey} title={fullPath}>{keyName}</span>
        )}
        {keyName !== undefined && <span className="text-[var(--color-text-tertiary)] text-[11px]">:</span>}
        <span className="text-slate-500 text-[11px] font-mono italic">{value === null ? 'null' : 'undefined'}</span>
      </div>
    );
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const displayValue = typeof value === 'string' && value.length > 200
      ? value.slice(0, 200) + '...'
      : String(value);
    const valueColor = typeof value === 'string' ? 'text-emerald-300' : typeof value === 'number' ? 'text-amber-300' : 'text-sky-300';

    return (
      <div className="flex items-start gap-1 group" style={{ paddingLeft: depth * 12 }}>
        {keyName !== undefined && (
          <span className="text-[var(--color-text-tertiary)] text-[11px] font-mono cursor-pointer hover:text-[var(--color-text-secondary)]" onClick={handleCopyKey} title={fullPath}>{keyName}</span>
        )}
        {keyName !== undefined && <span className="text-[var(--color-text-tertiary)] text-[11px]">:</span>}
        <span className={`${valueColor} text-[11px] font-mono break-all`}>{typeof value === 'string' ? <>{'"'}{displayValue}{'"'}</> : displayValue}</span>
        <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0" title="Copy value">
          {copied ? <CheckCircle2 size={10} className="text-emerald-400" /> : <Copy size={10} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]" />}
        </button>
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    const isRedacted = value === '[REDACTED]';

    if (isRedacted) {
      return (
        <div style={{ paddingLeft: depth * 12 }}>
          <span className="text-red-400/60 text-[11px] font-mono">[REDACTED]</span>
        </div>
      );
    }

    return (
      <div>
        <div
          className="flex items-center gap-1 cursor-pointer hover:bg-[var(--color-hover)]/30 rounded px-1 -mx-1"
          style={{ paddingLeft: depth * 12 }}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight size={10} className="text-[var(--color-text-tertiary)] flex-shrink-0" /> : <ChevronDown size={10} className="text-[var(--color-text-tertiary)] flex-shrink-0" />}
          {keyName !== undefined && (
            <>
              <span className="text-[var(--color-text-tertiary)] text-[11px] font-mono cursor-pointer hover:text-[var(--color-text-secondary)]" onClick={(e) => { e.stopPropagation(); handleCopyKey(e); }} title={fullPath}>{keyName}</span>
              <span className="text-[var(--color-text-tertiary)] text-[11px]">:</span>
            </>
          )}
          <span className="text-[var(--color-text-tertiary)] text-[11px]">{collapsed ? `{ ${entries.length} keys }` : '{'}</span>
          <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0" title="Copy value">
            {copied ? <CheckCircle2 size={10} className="text-emerald-400" /> : <Copy size={10} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]" />}
          </button>
        </div>
        {!collapsed && (
          <div>
            {entries.map(([k, v]) => (
              <JsonNode key={k} keyName={k} value={v} depth={depth + 1} path={fullPath} />
            ))}
            <div className="text-[var(--color-text-tertiary)] text-[11px]" style={{ paddingLeft: depth * 12 }}>
              {'}'}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

const NodeOutputInspector = ({ node, nodes, edges, runDetail }) => {
  const [fullOutputCopied, setFullOutputCopied] = useState(false);

  const stepData = useMemo(() => {
    if (!node?.id || !runDetail || !Array.isArray(runDetail.steps)) return null;
    const nodeId = node.id;

    for (const step of runDetail.steps) {
      const stepNodeId = (step?.parameters?.node_id || step?.parameters?.nodeId || '').trim();
      if (stepNodeId === nodeId) return step;
      if (step?.raw) {
        const rawNodeId = (step.raw.parameters?.node_id || step.raw.parameters?.nodeId || '').trim();
        if (rawNodeId === nodeId) return step;
      }
    }
    return null;
  }, [node?.id, runDetail]);

  const tokenTrace = useMemo(() => {
    if (!node?.id) return { downstreamCount: 0, downstreamNodes: [] };
    return computeTokenTrace(node.id, nodes || [], edges || []);
  }, [node?.id, nodes, edges]);

  const sanitizedOutput = useMemo(() => {
    if (!stepData) return null;
    const rawOutput = stepData.output || stepData.data;
    if (rawOutput === null || rawOutput === undefined) return null;

    if (typeof rawOutput === 'string') {
      try {
        const parsed = JSON.parse(rawOutput);
        return sanitizeOutput(parsed);
      } catch {
        return rawOutput;
      }
    }
    return sanitizeOutput(rawOutput);
  }, [stepData]);

  const sanitizedParameters = useMemo(() => {
    if (!stepData?.parameters) return null;
    return sanitizeStepData(stepData.parameters);
  }, [stepData]);

  const executionStatus = stepData?.status || null;
  const toneClass = STATUS_TONE[executionStatus] || STATUS_TONE.unknown;
  const startedAt = formatTimestamp(stepData?.startedAt);
  const completedAt = formatTimestamp(stepData?.completedAt);

  const handleCopyFullOutput = useCallback(() => {
    const text = sanitizedOutput
      ? typeof sanitizedOutput === 'string' ? sanitizedOutput : JSON.stringify(sanitizedOutput, null, 2)
      : '';
    navigator.clipboard.writeText(text).then(() => {
      setFullOutputCopied(true);
      setTimeout(() => setFullOutputCopied(false), 1500);
    }).catch(() => {});
  }, [sanitizedOutput]);

  if (!node) return null;

  const nodeLabel = node.data?.label || node.id;
  const nodeId = node.id;
  const nodeType = node.type;

  const hasExecutionData = !!stepData;
  const hasOutput = sanitizedOutput !== null && sanitizedOutput !== undefined;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] font-semibold">Node Identity</div>
          <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">{nodeType}</span>
        </div>
        <div className="mt-1 text-sm font-medium text-[var(--color-text-primary)] truncate" title={nodeLabel}>{nodeLabel}</div>
        <div className="mt-0.5 text-[11px] font-mono text-[var(--color-text-tertiary)] truncate" title={nodeId}>{nodeId}</div>
      </div>

      {!hasExecutionData ? (
        <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-4 text-center">
          <AlertCircle size={24} className="mx-auto mb-2 text-[var(--color-text-tertiary)] opacity-50" />
          <div className="text-sm text-[var(--color-text-tertiary)]">No execution data available for this node</div>
          <div className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Run the flow to populate execution output.</div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] font-semibold">Execution Status</div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] font-semibold ${toneClass.border} ${toneClass.bg} ${toneClass.text}`}>
                {toneClass.label}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {startedAt && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock size={11} className="text-[var(--color-text-tertiary)] flex-shrink-0" />
                  <span className="text-[var(--color-text-tertiary)]">Started:</span>
                  <span className="text-[var(--color-text-primary)]">{startedAt}</span>
                </div>
              )}
              {completedAt && (
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 size={11} className="text-[var(--color-text-tertiary)] flex-shrink-0" />
                  <span className="text-[var(--color-text-tertiary)]">Finished:</span>
                  <span className="text-[var(--color-text-primary)]">{completedAt}</span>
                </div>
              )}
            </div>
            {stepData?.error && (
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {String(stepData.error)}
              </div>
            )}
          </div>

          {hasOutput && (
            <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] font-semibold">Output Data</div>
                <button
                  onClick={handleCopyFullOutput}
                  className="flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors rounded px-1.5 py-0.5 hover:bg-[var(--color-hover)]"
                  title="Copy full output"
                >
                  {fullOutputCopied ? <CheckCircle2 size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  {fullOutputCopied ? 'Copied' : 'Copy All'}
                </button>
              </div>
              <div className="mt-2 rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-bg-secondary)]/50 p-2 overflow-x-auto max-h-64 overflow-y-auto crm-scroll-hidden">
                {typeof sanitizedOutput === 'string' ? (
                  <div className="text-[11px] text-[var(--color-text-secondary)] font-mono whitespace-pre-wrap break-all">{sanitizedOutput}</div>
                ) : (
                  <JsonNode value={sanitizedOutput} depth={0} />
                )}
              </div>
            </div>
          )}

          {!hasOutput && stepData?.status && (
            <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] font-semibold">Output Data</div>
              <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">No output data captured for this step.</div>
            </div>
          )}
        </>
      )}

      {tokenTrace.downstreamCount > 0 && (
        <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] font-semibold">Token Trace</div>
          <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Output referenced in <span className="font-semibold text-[var(--color-text-primary)]">{tokenTrace.downstreamCount}</span> downstream node{tokenTrace.downstreamCount === 1 ? '' : 's'}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tokenTrace.downstreamNodes.map((n) => (
              <span key={n.id} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[10px] font-mono text-[var(--color-text-secondary)]">
                {n.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {sanitizedParameters && (
        <details className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/70">
          <summary className="p-3 cursor-pointer text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] font-semibold hover:text-[var(--color-text-primary)] transition-colors">
            Step Parameters (read-only)
          </summary>
          <div className="px-3 pb-3 overflow-x-auto max-h-40 overflow-y-auto crm-scroll-hidden">
            <JsonNode value={sanitizedParameters} depth={0} />
          </div>
        </details>
      )}
    </div>
  );
};

export default NodeOutputInspector;