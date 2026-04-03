import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { BullseyeIcon } from '../../components/ui/icons';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { useNotice } from '../../contexts/NoticeContext';
import {
  createEmailVerificationBulkTaskApi,
  createMediaAudioRenderJobApi,
  createMediaPublishJobApi,
  createMediaRenderJobApi,
  createMediaRunOfShowJobApi,
  createMediaScriptJobApi,
  createMediaTranscriptJobApi,
  getSignalsApi,
  triggerFlowManualApi,
} from '../../services/backendApi';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

function formatSeverityLabel(severity) {
  return {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  }[String(severity || '').toLowerCase()] || 'Signal';
}

function severityClasses(severity) {
  return {
    critical: {
      shell: 'border-red-500/30 bg-red-500/[0.05]',
      pill: 'border-red-500/35 bg-red-500/10 text-red-200',
      accent: 'text-red-300 bg-red-500/10',
      button: 'border-red-500/35 bg-red-500/15 hover:bg-red-500/20 text-red-100',
    },
    high: {
      shell: 'border-amber-500/25 bg-amber-500/[0.04]',
      pill: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      accent: 'text-amber-300 bg-amber-500/10',
      button: 'border-amber-500/35 bg-amber-500/15 hover:bg-amber-500/20 text-amber-100',
    },
    medium: {
      shell: 'border-cyan-500/20 bg-cyan-500/[0.04]',
      pill: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200',
      accent: 'text-cyan-300 bg-cyan-500/10',
      button: 'border-cyan-500/35 bg-cyan-500/15 hover:bg-cyan-500/20 text-cyan-100',
    },
    low: {
      shell: 'border-white/10 bg-white/[0.02]',
      pill: 'border-white/10 bg-white/[0.05] text-slate-200',
      accent: 'text-slate-300 bg-white/5',
      button: 'border-white/15 bg-white/[0.06] hover:bg-white/[0.1] text-slate-100',
    },
  }[String(severity || '').toLowerCase()] || {
    shell: 'border-white/10 bg-white/[0.02]',
    pill: 'border-white/10 bg-white/[0.05] text-slate-200',
    accent: 'text-slate-300 bg-white/5',
    button: 'border-white/15 bg-white/[0.06] hover:bg-white/[0.1] text-slate-100',
  };
}

function severityIcon(severity) {
  return {
    critical: ShieldAlert,
    high: AlertTriangle,
    medium: CircleAlert,
    low: CheckCircle2,
  }[String(severity || '').toLowerCase()] || CircleAlert;
}

function formatRelativeTime(value) {
  const timestamp = Date.parse(String(value || ''));
  if (Number.isNaN(timestamp)) {
    return 'Now';
  }
  const deltaMs = Date.now() - timestamp;
  const minutes = Math.max(Math.round(deltaMs / 60000), 0);
  if (minutes < 1) {
    return 'Now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatModuleLabel(moduleId) {
  return {
    flows: 'Flows',
    media: 'Media',
    integrations: 'Integrations',
    crm: 'CRM',
    chat: 'Comms',
    comms: 'Comms',
    'system-health': 'System Health',
  }[String(moduleId || '').toLowerCase()] || 'Workspace';
}

function summarizeContext(signal) {
  const moduleLabel = formatModuleLabel(signal?.context?.module);
  const metadata = signal?.context?.metadata && typeof signal.context.metadata === 'object'
    ? signal.context.metadata
    : {};
  const summaryParts = [];

  if (metadata.flowName) summaryParts.push(String(metadata.flowName));
  else if (metadata.providerKey) summaryParts.push(String(metadata.providerKey));
  else if (metadata.jobType) summaryParts.push(String(metadata.jobType));
  else if (metadata.alertType) summaryParts.push(String(metadata.alertType).replace(/_/g, ' '));

  if (metadata.status) summaryParts.push(String(metadata.status).replace(/_/g, ' '));
  if (metadata.mailboxId && !summaryParts.includes(String(metadata.mailboxId))) summaryParts.push(`Mailbox ${metadata.mailboxId}`);
  if (metadata.sourceId && !summaryParts.includes(String(metadata.sourceId))) summaryParts.push(`Source ${metadata.sourceId}`);

  return {
    moduleLabel,
    detail: summaryParts.filter(Boolean).slice(0, 2).join(' • '),
  };
}

function buildMetadataRows(signal) {
  const metadata = signal?.context?.metadata && typeof signal.context.metadata === 'object'
    ? signal.context.metadata
    : {};
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0))
    .slice(0, 8)
    .map(([key, value]) => ({
      key,
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()),
      value: Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
}

async function retrySignal(payload) {
  const retryType = String(payload?.retryType || '').trim();
  if (retryType === 'verification_bulk') {
    return createEmailVerificationBulkTaskApi({
      contactIds: Array.isArray(payload?.contactIds) ? payload.contactIds : [],
      emails: Array.isArray(payload?.emails) ? payload.emails : [],
      mode: payload?.mode || 'power',
    });
  }

  if (retryType === 'media_job') {
    const inputPayload = payload?.inputPayload && typeof payload.inputPayload === 'object' ? payload.inputPayload : null;
    if (!inputPayload) {
      throw new Error('Missing media retry payload.');
    }
    switch (String(payload?.jobType || '')) {
      case 'render':
        return createMediaRenderJobApi(inputPayload);
      case 'transcript':
        return createMediaTranscriptJobApi(inputPayload);
      case 'script':
        return createMediaScriptJobApi(inputPayload);
      case 'runOfShow':
        return createMediaRunOfShowJobApi(inputPayload);
      case 'audioRender':
        return createMediaAudioRenderJobApi(inputPayload);
      case 'publish':
        return createMediaPublishJobApi(inputPayload);
      default:
        throw new Error('Unsupported media retry type.');
    }
  }

  throw new Error('Unsupported retry action.');
}

function DetailInspector({ signal }) {
  if (!signal) {
    return (
      <div className="rounded-[var(--radius-outer)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 shadow-island">
        <div className="rounded-[var(--radius-inner)] border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[var(--color-text-tertiary)]">Inspector</p>
          <p className="mt-3 text-sm font-semibold text-[var(--color-text-secondary)]">Select a signal to inspect context.</p>
        </div>
      </div>
    );
  }

  const metadataRows = buildMetadataRows(signal);
  const contextSummary = summarizeContext(signal);

  return (
    <div className="rounded-[var(--radius-outer)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 shadow-island">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[var(--color-text-tertiary)]">Inspector</p>
          <h3 className="mt-2 text-xl font-black text-[var(--color-text-primary)]">{signal.title}</h3>
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${severityClasses(signal.severity).pill}`}>
          {formatSeverityLabel(signal.severity)}
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <div className="rounded-[var(--radius-inner)] border border-white/8 bg-black/25 p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Reason</p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{signal.description}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[var(--radius-inner)] border border-white/8 bg-black/25 p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Context</p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{contextSummary.moduleLabel}</p>
            {contextSummary.detail ? (
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{contextSummary.detail}</p>
            ) : null}
          </div>
          <div className="rounded-[var(--radius-inner)] border border-white/8 bg-black/25 p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Source</p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{signal.source}</p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{signal.sourceId}</p>
          </div>
        </div>

        <div className="rounded-[var(--radius-inner)] border border-white/8 bg-black/25 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Metadata</p>
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{formatRelativeTime(signal.createdAt)}</span>
          </div>
          {metadataRows.length ? (
            <div className="mt-3 space-y-2">
              {metadataRows.map((row) => (
                <div key={row.key} className="flex items-start justify-between gap-4 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{row.label}</span>
                  <span className="text-right text-sm text-[var(--color-text-secondary)]">{row.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--color-text-secondary)]">No additional metadata.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalCard({ signal, busyActionType, onAction }) {
  const tone = severityClasses(signal.severity);
  const Icon = severityIcon(signal.severity);
  const contextSummary = summarizeContext(signal);
  const [primaryAction, ...secondaryActions] = Array.isArray(signal.actions) ? signal.actions : [];
  const isBusy = busyActionType && busyActionType === primaryAction?.actionType;

  return (
    <article className={`rounded-[var(--radius-outer)] border p-5 shadow-island transition-colors ${tone.shell}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-inner)] border border-white/10 ${tone.accent}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black text-[var(--color-text-primary)]">{signal.title}</h3>
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${tone.pill}`}>
                {formatSeverityLabel(signal.severity)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{signal.description}</p>
          </div>
        </div>
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
          {formatRelativeTime(signal.createdAt)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-[var(--radius-inner)] border border-white/8 bg-black/20 px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Context</p>
          <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{contextSummary.moduleLabel}</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {contextSummary.detail || signal.sourceId || 'Operator review required.'}
          </p>
        </div>
        <div className="rounded-[var(--radius-inner)] border border-white/8 bg-black/20 px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Source</p>
          <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{signal.source}</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{signal.sourceId}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {primaryAction ? (
          <button
            type="button"
            onClick={() => onAction(primaryAction, signal)}
            disabled={Boolean(busyActionType)}
            className={`inline-flex items-center gap-2 rounded-[var(--radius-inner)] border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-colors disabled:cursor-wait disabled:opacity-60 ${tone.button}`}
          >
            {busyActionType ? <RefreshCw size={12} className="animate-spin" /> : <BullseyeIcon size={12} />}
            {isBusy ? 'Working' : primaryAction.label}
          </button>
        ) : null}
        {secondaryActions.map((action) => (
          <button
            key={`${signal.id}-${action.actionType}-${action.label}`}
            type="button"
            onClick={() => onAction(action, signal)}
            disabled={Boolean(busyActionType)}
            className="inline-flex items-center gap-2 rounded-[var(--radius-inner)] border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-text-secondary)] transition-colors hover:border-white/20 hover:bg-white/5 hover:text-[var(--color-text-primary)] disabled:opacity-60"
          >
            {action.actionType === 'view_detail' ? <ExternalLink size={12} /> : null}
            {action.label}
          </button>
        ))}
      </div>
    </article>
  );
}

export default function SignalsModule() {
  const { openAIAssist } = useAIAssist();
  const { showNotice } = useNotice();
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState('');
  const [busySignalId, setBusySignalId] = useState('');
  const [busyActionType, setBusyActionType] = useState('');

  const selectedSignal = useMemo(
    () => signals.find((signal) => signal.id === selectedSignalId) || signals[0] || null,
    [selectedSignalId, signals],
  );

  useEffect(() => {
    let cancelled = false;

    const loadSignals = async (isRefresh = false) => {
      try {
        if (!isRefresh) setLoading(true);
        if (isRefresh) setRefreshing(true);
        const nextSignals = await getSignalsApi();
        if (cancelled) return;
        setSignals(Array.isArray(nextSignals) ? nextSignals : []);
        setSelectedSignalId((current) => {
          if (current && nextSignals.some((signal) => signal.id === current)) {
            return current;
          }
          return nextSignals[0]?.id || '';
        });
      } catch (error) {
        if (cancelled) return;
        showNotice({
          type: 'error',
          message: error.message || 'Signals failed to load.',
        });
      } finally {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      }
    };

    loadSignals(false);
    const timer = window.setInterval(() => loadSignals(true), 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const reloadSignals = async (isRefresh = true) => {
    if (isRefresh) setRefreshing(true);
    try {
      const nextSignals = await getSignalsApi();
      setSignals(Array.isArray(nextSignals) ? nextSignals : []);
      setSelectedSignalId((current) => {
        if (current && nextSignals.some((signal) => signal.id === current)) {
          return current;
        }
        return nextSignals[0]?.id || '';
      });
    } catch (error) {
      showNotice({
        type: 'error',
        message: error.message || 'Signals failed to refresh.',
        persistent: true,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleAction = async (action, signal) => {
    if (!action || !signal) {
      return;
    }

    if (action.actionType === 'view_detail') {
      setSelectedSignalId(signal.id);
      return;
    }

    if (action.actionType === 'open_comms') {
      window.dispatchEvent(new CustomEvent('aio:navigate', {
        detail: {
          module: 'chat',
          threadId: action.payload?.threadId || signal.context?.entityId || null,
        },
      }));
      return;
    }

    if (action.actionType === 'fix_config') {
      window.dispatchEvent(new CustomEvent('aio:navigate', {
        detail: {
          module: 'integrations',
          integrationCategory: action.payload?.integrationCategory || 'llms',
        },
      }));
      return;
    }

    setBusySignalId(signal.id);
    setBusyActionType(action.actionType);
    try {
      if (action.actionType === 'run_flow') {
        const payload = action.payload && typeof action.payload === 'object' ? action.payload : {};
        await triggerFlowManualApi(payload.flowId, {
          command: payload.command || `Signals retry for ${signal.title}`,
          context: payload.context || {},
        });
        showNotice({
          type: 'success',
          message: 'Flow triggered successfully.',
          persistent: false,
        });
      } else if (action.actionType === 'retry') {
        await retrySignal(action.payload || {});
        showNotice({
          type: 'success',
          message: 'Retry dispatched successfully.',
          persistent: false,
        });
      } else {
        throw new Error(`Unsupported action: ${action.actionType}`);
      }
      await reloadSignals(true);
    } catch (error) {
      showNotice({
        type: 'error',
        message: error.message || 'Action failed.',
        persistent: true,
      });
    } finally {
      setBusySignalId('');
      setBusyActionType('');
    }
  };

  const counts = useMemo(() => {
    const base = { critical: 0, high: 0, medium: 0, low: 0 };
    signals.forEach((signal) => {
      const key = String(signal.severity || '').toLowerCase();
      if (key in base) base[key] += 1;
    });
    return base;
  }, [signals]);

  const toolbarSummary = `${signals.length} actionable • ${counts.critical} critical • ${counts.high} high`;

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <ModuleHeader
        showTitle={false}
        leftActions={[
          {
            label: 'Refresh',
            icon: RefreshCw,
            onClick: () => reloadSignals(true),
            variant: 'secondary',
          },
        ]}
        toolbarCenterSlot={(
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
            {refreshing ? 'Refreshing signals' : toolbarSummary}
          </div>
        )}
        onModuleAi={() => openAIAssist({ context: { module: 'signals', surface: 'action-feed', signalCount: signals.length } })}
        hasSelection={false}
      />

      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-outer)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-island">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="inline-flex items-center gap-3 rounded-[var(--radius-inner)] border border-white/10 bg-black/20 px-5 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
              <RefreshCw size={14} className="animate-spin" />
              Loading signals
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-0 grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-h-0 overflow-y-auto pr-1">
              {signals.length ? (
                <div className="space-y-4">
                  {signals.map((signal) => (
                    <SignalCard
                      key={signal.id}
                      signal={signal}
                      busyActionType={busySignalId === signal.id ? busyActionType : ''}
                      onAction={handleAction}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex h-full min-h-[280px] items-center justify-center rounded-[var(--radius-inner)] border border-dashed border-white/10 bg-black/20">
                  <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--color-text-tertiary)]">Signals Clear</p>
                    <p className="mt-3 text-sm font-semibold text-[var(--color-text-secondary)]">No actionable items are waiting right now.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="min-h-0 overflow-y-auto pl-1">
              <DetailInspector signal={selectedSignal} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
