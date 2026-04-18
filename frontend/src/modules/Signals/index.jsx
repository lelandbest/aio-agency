import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ChevronDown,
  Clock3,
  Copy,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { BullseyeIcon, BrainIcon, Crosshair, CommandSurfaceIcon } from '../../components/ui/icons';
import { openGlobalOverlay } from '../../components/GlobalOverlay';
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
  dismissSignalApi,
  getSignalsApi,
  getSystemHealthApi,
  triggerFlowManualApi,
} from '../../services/backendApi';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const DISMISSED_SIGNAL_STORAGE_KEY = 'aio.signals.dismissed.v1';
const DISMISSED_SIGNAL_RETENTION_MS = 24 * 60 * 60 * 1000;

function pruneDismissedSignals(items) {
  const now = Date.now();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const dismissedAt = new Date(item?.dismissedAt || '').getTime();
    return Number.isFinite(dismissedAt) && dismissedAt > 0 && now - dismissedAt < DISMISSED_SIGNAL_RETENTION_MS;
  });
}

function readDismissedSignals() {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(DISMISSED_SIGNAL_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return pruneDismissedSignals(JSON.parse(raw));
  } catch {
    return [];
  }
}

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
      shell: 'border-slate-500/20 bg-slate-500/[0.04]',
      pill: 'border-slate-500/25 bg-slate-500/10 text-slate-300',
      accent: 'text-slate-400 bg-slate-500/10',
      button: 'border-slate-500/35 bg-slate-500/15 hover:bg-slate-500/20 text-slate-100',
    },
  }[String(severity || '').toLowerCase()] || {
    shell: 'border-slate-500/20 bg-slate-500/[0.04]',
    pill: 'border-slate-500/25 bg-slate-500/10 text-slate-300',
    accent: 'text-slate-400 bg-slate-500/10',
    button: 'border-slate-500/35 bg-slate-500/15 hover:bg-slate-500/20 text-slate-100',
  };
}

function severityIcon(severity) {
  return {
    critical: ShieldAlert,
    high: AlertTriangle,
    medium: CircleAlert,
    low: CheckCircle2,
    healthy: CheckCircle2,
  }[String(severity || '').toLowerCase()] || CircleAlert;
}

const SIGNALS_PILL_BASE = 'inline-flex items-center rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] transition-all shadow-sm whitespace-nowrap cursor-pointer';

const SignalsDropdown = ({ label, value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label || value;

  return (
    <div className="relative flex flex-col gap-1 min-w-[140px]" ref={containerRef}>
      <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest block ml-0.5">{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-8 rounded bg-black/60 border px-3 flex items-center justify-between gap-2 text-left transition-all group ${isOpen ? 'border-cyan-500' : 'border-[#2A2D35] hover:border-cyan-500/50'}`}
      >
        <span className={`truncate text-[9px] font-black uppercase tracking-widest ${isOpen ? 'text-cyan-400' : 'text-slate-200'}`}>
          {selectedLabel}
        </span>
        <ChevronDown size={10} className={`shrink-0 text-cyan-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-[100] overflow-hidden rounded border border-[#2A2D35] bg-[#0A0C10] shadow-[0_12px_32px_rgba(0,0,0,0.8)]">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`flex w-full items-center px-3 py-2 text-left transition-all border-b border-white/5 last:border-0 ${
                value === opt.value
                  ? 'bg-cyan-950/40 text-cyan-200'
                  : 'text-slate-400 hover:bg-[#11151c] hover:text-white'
              }`}
            >
              <span className="truncate text-[9px] font-bold uppercase tracking-wider">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const HEARTBEAT_PULSE = `
  @keyframes heartbeat-pulse {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
    100% { transform: scale(1); opacity: 1; }
  }
  .heartbeat-active {
    animation: heartbeat-pulse 2s infinite ease-in-out;
  }
`;

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
    comms: 'Comms',
    signals: 'Signals',
    'system-health': 'Signals',
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
  if (!signal || !signal.id) {
    return (
      <div className="rounded-lg border border-dashed border-cyan-500/20 bg-cyan-500/5 p-4 text-center h-full flex flex-col items-center justify-center">
        <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-cyan-400/40">Select a signal</span>
      </div>
    );
  }

  const metadataRows = buildMetadataRows(signal);
  const contextSummary = summarizeContext(signal);
  const tone = severityClasses(signal.severity);

  return (
    <div className={`rounded-lg border ${tone.shell} p-3`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-bold text-cyan-100 truncate">{signal.title}</span>
        <span className={`text-[8px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded ${tone.pill}`}>
          {signal.severity}
        </span>
      </div>

      <div className="space-y-2 text-[10px]">
        <div className="text-cyan-200/80 line-clamp-2">{signal.description}</div>
        
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="bg-cyan-500/5 rounded px-2 py-1.5">
            <span className="text-[8px] uppercase tracking-[0.14em] text-cyan-400/60">Context</span>
            <div className="text-[10px] font-medium text-cyan-100">{contextSummary.moduleLabel}</div>
          </div>
          <div className="bg-cyan-500/5 rounded px-2 py-1.5">
            <span className="text-[8px] uppercase tracking-[0.14em] text-cyan-400/60">Source</span>
            <div className="text-[10px] font-medium text-cyan-100">{signal.source}</div>
          </div>
        </div>

        {metadataRows.length > 0 && (
          <div className="bg-cyan-500/5 rounded p-2 pt-1.5">
            <span className="text-[8px] uppercase tracking-[0.14em] text-cyan-400/60">Metadata</span>
            <div className="mt-1.5 space-y-1">
              {metadataRows.slice(0, 5).map((row) => (
                <div key={row.key} className="flex justify-between gap-2 text-[9px]">
                  <span className="text-cyan-400/60 uppercase tracking-[0.1em]">{row.label}</span>
                  <span className="text-cyan-200/80 truncate max-w-[100px]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 text-[8px] text-cyan-400/50">
          <span>{formatRelativeTime(signal.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

function TactileRow({ icon: Icon, label, meta, status, onClick, isOpen, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border transition-all duration-150 text-left ${
        isOpen
          ? 'bg-emerald-950 border-emerald-400/50'
          : status === 'healthy' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-transparent border-transparent'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <span className={status === 'healthy' ? 'text-emerald-400' : status === 'degraded' ? 'text-amber-400' : status === 'critical' ? 'text-rose-400' : 'text-cyan-400'}>
              <Icon size={13} />
            </span>
          )}
          <span className="text-xs font-semibold text-cyan-100 truncate">{label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {meta !== undefined && meta !== null && <span className="text-[10px] font-medium text-cyan-400/70 tabular-nums">{meta}</span>}
          {status && (
            <span className={`text-[9px] font-bold uppercase tracking-[0.14em] ${
              status === 'healthy' ? 'text-emerald-400' : status === 'degraded' ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {status}
            </span>
          )}
        </div>
      </div>
      {children && isOpen && (
        <div className="border-t border-cyan-500/20 px-3 py-2 bg-cyan-950/50">
          {children}
        </div>
      )}
    </button>
  );
}

function HealthDetailDrawer({
  derivedFrom,
  timeWindow,
  threshold,
  evidence,
  lastUpdated,
  failureReason,
  status,
  isStatic
}) {
  return (
    <div className="space-y-1.5 text-[9px] cursor-default" onClick={(e) => e.stopPropagation()}>
      {isStatic && (
        <div className="text-amber-400/80 italic mb-2 border border-amber-500/20 bg-amber-500/5 p-1.5 rounded">
          Current source is frontend-derived/static. Not yet backed by live subsystem evidence.
        </div>
      )}
      <div className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1 mt-1">
        <span className="text-cyan-400/50 uppercase tracking-wider font-bold">Status:</span>
        <span className={status === 'healthy' ? 'text-emerald-400' : status === 'degraded' ? 'text-amber-400' : 'text-rose-400 capitalize'}>{status}</span>

        <span className="text-cyan-400/50 uppercase tracking-wider font-bold">Source:</span>
        <span className="text-cyan-100 truncate" title={derivedFrom}>{derivedFrom}</span>

        <span className="text-cyan-400/50 uppercase tracking-wider font-bold">Window:</span>
        <span className="text-cyan-100">{timeWindow}</span>

        <span className="text-cyan-400/50 uppercase tracking-wider font-bold">Rule:</span>
        <span className="text-cyan-100">{threshold}</span>

        <span className="text-cyan-400/50 uppercase tracking-wider font-bold">Evidence:</span>
        <span className="text-cyan-100">{evidence}</span>

        <span className="text-cyan-400/50 uppercase tracking-wider font-bold">Updated:</span>
        <span className="text-cyan-100">{lastUpdated || '--'}</span>

        {failureReason && (
          <>
            <span className="text-cyan-400/50 uppercase tracking-wider font-bold">Reason:</span>
            <span className="text-rose-300">{failureReason}</span>
          </>
        )}
      </div>
    </div>
  );
}

function SignalRow({ signal, onAction, busyActionType }) {
  const tone = severityClasses(signal.severity);
  const Icon = severityIcon(signal.severity);
  const contextSummary = summarizeContext(signal);
  const [primaryAction] = Array.isArray(signal.actions) ? signal.actions : [];
  const isBusy = busyActionType && busyActionType === (primaryAction?.actionType || 'dismiss');

  return (
    <div className={`flex items-center gap-3 px-3 py-2 border-b border-white/[0.03] hover:bg-white/[0.02] group transition-colors`}>
      <div className={`shrink-0 w-1.5 h-8 rounded-full ${
        signal.severity === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 
        signal.severity === 'high' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : 
        signal.severity === 'medium' ? 'bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.2)]' :
        'bg-slate-500'
      }`} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-100 truncate">{signal.title}</span>
          <span className="text-[9px] text-slate-500 font-mono uppercase shrink-0">{signal.source}</span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-slate-400/70">
          <span className="truncate">{contextSummary.moduleLabel} • {contextSummary.detail}</span>
          <span className="shrink-0">• {formatRelativeTime(signal.createdAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
        {primaryAction && (
          <button
            onClick={() => onAction(primaryAction, signal)}
            disabled={Boolean(busyActionType)}
            className={`px-2 py-1 rounded border text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm ${tone.button}`}
          >
            {primaryAction.label === 'Fix Config' ? 'Fix' : primaryAction.label}
          </button>
        )}
        <button
          onClick={() => onAction({ actionType: 'open_comms' }, signal)}
          className="px-2 py-1 rounded border border-slate-700/50 bg-slate-800/50 text-[9px] font-bold uppercase tracking-wider text-slate-300 hover:bg-slate-700"
        >
          Open
        </button>
        <button
          onClick={() => onAction({ actionType: 'dismiss' }, signal)}
          disabled={Boolean(busyActionType)}
          className="px-2 py-1 rounded border border-red-500/20 bg-red-500/5 text-[9px] font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/20"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function SignalsModule() {
  const { openAIAssist, toggleAIAssist } = useAIAssist();
  const { showNotice } = useNotice();
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [dismissedSignals, setDismissedSignals] = useState(() => readDismissedSignals());
  const [showArchived, setShowArchived] = useState(false);
  const hasArchivedSignals = dismissedSignals.length > 0;
  const [openHealthRow, setOpenHealthRow] = useState(null);

  const [selectedSignalId, setSelectedSignalId] = useState('');
  const [busySignalId, setBusySignalId] = useState('');
  const [busyActionType, setBusyActionType] = useState('');

  // Filters
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({ critical: false, high: false, medium: false, low: false });

  const filteredSignals = useMemo(() => {
    return signals.filter(s => {
      if (filterSeverity !== 'all' && s.severity !== filterSeverity) return false;
      if (filterSource !== 'all' && s.source !== filterSource) return false;
      if (searchQuery && !s.title.toLowerCase().includes(searchQuery.toLowerCase()) && !s.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [signals, filterSeverity, filterSource, searchQuery]);

  const sources = useMemo(() => {
    const s = new Set(signals.map(sig => sig.source));
    return ['all', ...Array.from(s)];
  }, [signals]);

  useEffect(() => {
    if (!hasArchivedSignals && showArchived) {
      setShowArchived(false);
    }
  }, [hasArchivedSignals, showArchived]);

  useEffect(() => {
    const nextDismissedSignals = pruneDismissedSignals(dismissedSignals);
    if (nextDismissedSignals.length !== dismissedSignals.length) {
      setDismissedSignals(nextDismissedSignals);
      return;
    }
    window.localStorage.setItem(DISMISSED_SIGNAL_STORAGE_KEY, JSON.stringify(nextDismissedSignals));
  }, [dismissedSignals]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDismissedSignals((current) => pruneDismissedSignals(current));
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSignals = async (isRefresh = false) => {
      try {
        if (!isRefresh) setLoading(true);
        if (isRefresh) setRefreshing(true);
        const nextSignals = await getSignalsApi();
        if (cancelled) return;
        setSignals(Array.isArray(nextSignals) ? nextSignals : []);
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
    const signalsTimer = window.setInterval(() => loadSignals(true), 45000);

    const loadHealth = async () => {
      try {
        const next = await getSystemHealthApi();
        setHealth(next || null);
      } catch {
        setHealth(null);
      } finally {
        setHealthLoading(false);
      }
    };
    loadHealth();
    const healthTimer = window.setInterval(loadHealth, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(signalsTimer);
      window.clearInterval(healthTimer);
    };
  }, []);

  const capturedErrorsRef = useRef([]);
  useEffect(() => {
    const handler = (event) => {
      const errorInfo = {
        message: event.error?.message || String(event.error),
        stack: event.error?.stack || '',
        timestamp: new Date().toISOString(),
      };
      capturedErrorsRef.current.push(errorInfo);
      if (capturedErrorsRef.current.length > 50) {
        capturedErrorsRef.current = capturedErrorsRef.current.slice(-50);
      }
    };
    window.addEventListener('error', handler);
    window.addEventListener('unhandledrejection', (event) => {
      const errorInfo = {
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack || '',
        timestamp: new Date().toISOString(),
      };
      capturedErrorsRef.current.push(errorInfo);
      if (capturedErrorsRef.current.length > 50) {
        capturedErrorsRef.current = capturedErrorsRef.current.slice(-50);
      }
    });
    return () => {
      window.removeEventListener('error', handler);
    };
  }, []);

  const copyErrors = useCallback(() => {
    const errors = capturedErrorsRef.current.map(e => `[${e.timestamp}] ${e.message}\n${e.stack}`).join('\n---\n');
    navigator.clipboard.writeText(errors || 'No errors captured');
    return errors;
  }, []);

  const pushToGhost = useCallback(async () => {
    const errors = copyErrors();
    window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'comms', threadId: null } }));
    window.dispatchEvent(new CustomEvent('aio:notification', { detail: { type: 'info', message: 'Errors copied - paste to Ghost' } }));
  }, [copyErrors]);

  const openGhostConvo = useCallback(() => {
    window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'comms' } }));
  }, []);

  useEffect(() => {
    window.copyErrors = copyErrors;
    window.getCapturedErrors = () => capturedErrorsRef.current;
  }, [copyErrors]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        copyErrors();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copyErrors]);

  const reloadSignals = async (isRefresh = true) => {
    if (isRefresh) setRefreshing(true);
    try {
      const nextSignals = await getSignalsApi();
      setSignals(Array.isArray(nextSignals) ? nextSignals : []);
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
          module: 'comms',
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
      } else if (action.actionType === 'dismiss') {
        await dismissSignalApi(signal.id);
        setDismissedSignals((prev) =>
          pruneDismissedSignals([{ ...signal, dismissedAt: new Date().toISOString() }, ...prev]).slice(0, 50)
        );
        setSignals(prev => prev.filter(s => s.id !== signal.id));
        showNotice({
          type: 'info',
          message: 'Signal dismissed - archived.',
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
    <div className="module-root-standard relative">
      {HEARTBEAT_PULSE && <style>{HEARTBEAT_PULSE}</style>}
      {/* Toolbar */}
      <div className="module-toolbar">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="heartbeat-active w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
          <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Signals Interface</span>
          <div className="h-4 w-px bg-white/10" />
          <button
            onClick={() => reloadSignals(true)}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex flex-1 justify-center items-center h-full min-w-0 gap-4">
          <SignalsDropdown 
            label="SEVERITY"
            value={filterSeverity}
            onChange={setFilterSeverity}
            options={[
              { value: 'all', label: 'ANY SEVERITY' },
              { value: 'critical', label: 'CRITICAL' },
              { value: 'high', label: 'HIGH' },
              { value: 'medium', label: 'MEDIUM' },
              { value: 'low', label: 'LOW' }
            ]}
          />

          <SignalsDropdown 
            label="SOURCE CHANNEL"
            value={filterSource}
            onChange={setFilterSource}
            options={sources.map(s => ({ value: s, label: s === 'all' ? 'ANY SOURCE' : s.toUpperCase() }))}
          />

          <div className="h-4 w-px bg-white/10 shrink-0 mt-4" />

          <div className="flex flex-col gap-1 min-w-[160px]">
            <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest block ml-0.5">SUBJECT FILTER</span>
            <input 
              placeholder="Search sequence..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 rounded bg-black/40 border border-[#2A2D35] px-3 py-1.5 text-[10px] uppercase font-bold tracking-widest text-cyan-300 outline-none w-32 placeholder:text-slate-800 focus:w-48 focus:border-cyan-500/50 transition-all"
            />
          </div>
        </div>

        <div className="flex min-w-0 items-center h-full gap-2 shrink-0">
          <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-400">
            {signals.length} Actionable
          </div>
        </div>
      </div>

      <div className="module-content-stage">
        {loading || healthLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="inline-flex items-center gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/60">
              <RefreshCw size={12} className="animate-spin" />
              Loading console
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-0 gap-4 p-2 xl:grid-cols-[1fr_2fr_1fr]">
            {/* LEFT RAIL: TRIAGE STATS & MODE */}
            <div className="rounded-lg border border-white/[0.05] bg-black/20 p-4 space-y-6 overflow-y-auto no-scrollbar">
              <section>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mb-4">Signal Thresholds</div>
                <div className="space-y-2">
                  {['critical', 'high', 'medium', 'low'].map(sev => (
                    <button 
                      key={sev}
                      onClick={() => setFilterSeverity(sev === filterSeverity ? 'all' : sev)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                        filterSeverity === sev 
                          ? (sev === 'critical' ? 'bg-red-500/10 border-red-500/40' : 
                             sev === 'high' ? 'bg-amber-500/10 border-amber-500/40' : 
                             sev === 'medium' ? 'bg-cyan-500/10 border-cyan-500/40' : 
                             'bg-slate-500/10 border-slate-500/40')
                          : 'bg-white/[0.03] border-transparent hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          sev === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 
                          sev === 'high' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : 
                          sev === 'medium' ? 'bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.2)]' : 
                          'bg-slate-500'
                        }`} />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">{sev}</span>
                      </div>
                      <span className={`text-xs font-mono ${filterSeverity === sev ? (sev === 'critical' ? 'text-red-400' : sev === 'high' ? 'text-amber-400' : sev === 'medium' ? 'text-cyan-400' : 'text-slate-400') : 'text-slate-500'}`}>
                        {signals.filter(s => s.severity === sev).length}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mb-4">Central Instructions</div>
                <div className="p-3 rounded-lg border border-dashed border-white/10 bg-white/[0.02] text-[10px] text-slate-500 leading-relaxed italic">
                  Signals are real-time operational artifacts. Triage items by severity. Acknowledge healthy states to clear the surface. High-severity failures require immediate Fix or Escalation.
                </div>
              </section>
            </div>

            {/* CENTER RAIL: UNIFIED CONTROL SURFACE */}
            <div className="rounded-lg border border-white/[0.05] bg-black/10 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto no-scrollbar py-2">
                {['critical', 'high', 'medium', 'low'].map(sev => {
                  const groupSignals = filteredSignals.filter(s => s.severity === sev);
                  if (groupSignals.length === 0) return null;
                  const isCollapsed = collapsedGroups[sev];

                  return (
                    <div key={sev} className="mb-4">
                      <button 
                        onClick={() => setCollapsedGroups(prev => ({ ...prev, [sev]: !isCollapsed }))}
                        className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.04] border-y border-white/[0.04] hover:bg-white/[0.06] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                            sev === 'critical' ? 'text-red-400' : 
                            sev === 'high' ? 'text-amber-400' : 
                            sev === 'medium' ? 'text-cyan-400' : 
                            'text-slate-400'
                          }`}>
                            {sev} Intensity Signals
                          </span>
                          <span className="text-[10px] text-slate-600 font-mono">[{groupSignals.length}]</span>
                        </div>
                        <span className="text-slate-600 text-[10px]">{isCollapsed ? 'EXPAND' : 'COLLAPSE'}</span>
                      </button>
                      
                      {!isCollapsed && (
                        <div className="divide-y divide-white/[0.02]">
                          {groupSignals.map(sig => (
                            <SignalRow 
                              key={sig.id} 
                              signal={sig} 
                              onAction={handleAction} 
                              busyActionType={busySignalId === sig.id ? busyActionType : ''}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredSignals.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center space-y-3 opacity-30">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">System Nominal</span>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT RAIL: HEALTH MONITOR */}
            <div className="rounded-lg border border-emerald-500/30 overflow-y-auto px-2 py-1 h-full">
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400/50 mb-2">Health Monitor</div>
              
              <div className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="signals-health-monitor-title text-sm font-bold text-emerald-400 capitalize">{health?.status || 'healthy'}</span>
                  <div className="flex items-center gap-1.5 text-[9px] text-emerald-400/60">
                    <Clock3 size={10} />
                    {health?.generatedAt ? new Date(health.generatedAt).toLocaleTimeString() : '--:--'}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <TactileRow
                  icon={AlertTriangle}
                  label="Failed Runs"
                  meta={health?.summary?.failedRuns24h ?? 0}
                  status={(health?.summary?.failedRuns24h ?? 0) > 0 ? 'degraded' : 'healthy'}
                  isOpen={openHealthRow === 'failedRuns'}
                  onClick={() => setOpenHealthRow(prev => prev === 'failedRuns' ? null : 'failedRuns')}
                >
                  <HealthDetailDrawer
                    status={(health?.summary?.failedRuns24h ?? 0) > 0 ? 'degraded' : 'healthy'}
                    derivedFrom="health.summary.failedRuns24h"
                    timeWindow="Rolling 24 hours"
                    threshold="> 0 indicates degraded"
                    evidence={`${health?.summary?.failedRuns24h ?? 0} runs failed`}
                    lastUpdated={health?.generatedAt ? new Date(health.generatedAt).toLocaleTimeString() : undefined}
                    failureReason={(health?.summary?.failedRuns24h ?? 0) > 0 ? 'Failures detected in the last 24h' : undefined}
                    isStatic={false}
                  />
                </TactileRow>
                <TactileRow
                  icon={AlertTriangle}
                  label="Degraded Flows"
                  meta={health?.summary?.degradedFlows ?? 0}
                  status={(health?.summary?.degradedFlows ?? 0) > 0 ? 'degraded' : 'healthy'}
                  isOpen={openHealthRow === 'degradedFlows'}
                  onClick={() => setOpenHealthRow(prev => prev === 'degradedFlows' ? null : 'degradedFlows')}
                >
                  <HealthDetailDrawer
                    status={(health?.summary?.degradedFlows ?? 0) > 0 ? 'degraded' : 'healthy'}
                    derivedFrom="health.summary.degradedFlows"
                    timeWindow="Current state"
                    threshold="> 0 indicates degraded"
                    evidence={`${health?.summary?.degradedFlows ?? 0} flows in degraded state`}
                    lastUpdated={health?.generatedAt ? new Date(health.generatedAt).toLocaleTimeString() : undefined}
                    failureReason={(health?.summary?.degradedFlows ?? 0) > 0 ? 'One or more flows are currently degraded' : undefined}
                    isStatic={false}
                  />
                </TactileRow>
                <TactileRow
                  icon={CheckCircle2}
                  label="Inactive Flows"
                  meta={health?.summary?.inactiveExpectedFlows ?? 0}
                  status={(health?.summary?.inactiveExpectedFlows ?? 0) > 0 ? 'degraded' : 'healthy'}
                  isOpen={openHealthRow === 'inactiveFlows'}
                  onClick={() => setOpenHealthRow(prev => prev === 'inactiveFlows' ? null : 'inactiveFlows')}
                >
                  <HealthDetailDrawer
                    status={(health?.summary?.inactiveExpectedFlows ?? 0) > 0 ? 'degraded' : 'healthy'}
                    derivedFrom="health.summary.inactiveExpectedFlows"
                    timeWindow="Current state"
                    threshold="> 0 indicates degraded"
                    evidence={`${health?.summary?.inactiveExpectedFlows ?? 0} expected flows are inactive`}
                    lastUpdated={health?.generatedAt ? new Date(health.generatedAt).toLocaleTimeString() : undefined}
                    failureReason={(health?.summary?.inactiveExpectedFlows ?? 0) > 0 ? 'Expected background flows are not running' : undefined}
                    isStatic={false}
                  />
                </TactileRow>
                <TactileRow
                  icon={AlertTriangle}
                  label="Deploy Failures"
                  meta={health?.summary?.deploymentFailures7d ?? 0}
                  status={(health?.summary?.deploymentFailures7d ?? 0) > 0 ? 'critical' : 'healthy'}
                  isOpen={openHealthRow === 'deployFailures'}
                  onClick={() => setOpenHealthRow(prev => prev === 'deployFailures' ? null : 'deployFailures')}
                >
                  <HealthDetailDrawer
                    status={(health?.summary?.deploymentFailures7d ?? 0) > 0 ? 'critical' : 'healthy'}
                    derivedFrom="health.summary.deploymentFailures7d"
                    timeWindow="Rolling 7 days"
                    threshold="> 0 indicates critical"
                    evidence={`${health?.summary?.deploymentFailures7d ?? 0} deployment failures`}
                    lastUpdated={health?.generatedAt ? new Date(health.generatedAt).toLocaleTimeString() : undefined}
                    failureReason={(health?.summary?.deploymentFailures7d ?? 0) > 0 ? 'Recent deployment instability detected' : undefined}
                    isStatic={false}
                  />
                </TactileRow>
              </div>

              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-400/50 mt-3 mb-1">Subsystems</div>
              <div className="space-y-1">
                {[
                  { id: 'subCRM', label: 'CRM', idx: 0 },
                  { id: 'subSignals', label: 'Signals', idx: 1 },
                  { id: 'subFlows', label: 'Flows', idx: 2 },
                  { id: 'subIntegrations', label: 'Integrations', idx: 3 }
                ].map(({ id, label, idx }) => {
                  const status = health?.subsystems?.[idx]?.status || 'healthy';
                  return (
                    <TactileRow
                      key={id}
                      label={label}
                      status={status}
                      isOpen={openHealthRow === id}
                      onClick={() => setOpenHealthRow(prev => prev === id ? null : id)}
                    >
                      <HealthDetailDrawer
                        status={status}
                        derivedFrom={`health.subsystems[${idx}].status`}
                        timeWindow="Current state"
                        threshold="Any non-healthy state cascades to degraded"
                        evidence={`Status reads: ${status}`}
                        lastUpdated={health?.generatedAt ? new Date(health.generatedAt).toLocaleTimeString() : undefined}
                        failureReason={status !== 'healthy' ? 'Subsystem reported non-healthy state' : undefined}
                        isStatic={true}
                      />
                    </TactileRow>
                  );
                })}
              </div>

              {health?.alerts?.length > 0 && (
                <>
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-rose-400/60 mt-3 mb-1">Active Alerts</div>
                  <div className="space-y-1">
                    {health.alerts.slice(0, 3).map((alert, alertIdx) => (
                      <TactileRow
                        key={alert.id || alertIdx}
                        icon={alert.severity === 'critical' ? ShieldAlert : AlertTriangle}
                        label={alert.title}
                        status={alert.severity === 'critical' ? 'critical' : 'degraded'}
                        isOpen={openHealthRow === `alert-${alertIdx}`}
                        onClick={() => setOpenHealthRow(prev => prev === `alert-${alertIdx}` ? null : `alert-${alertIdx}`)}
                      >
                        <HealthDetailDrawer
                          status={alert.severity === 'critical' ? 'critical' : 'degraded'}
                          derivedFrom="health.alerts"
                          timeWindow="Current active alert"
                          threshold="Alert presence indicates degraded/critical"
                          evidence={`Alert severity: ${alert.severity}`}
                          lastUpdated={health?.generatedAt ? new Date(health.generatedAt).toLocaleTimeString() : undefined}
                          failureReason={alert.description || alert.title || 'System alert active'}
                          isStatic={false}
                        />
                      </TactileRow>
                    ))}
                  </div>
                </>
              )}

            </div>
          </div>
        )}

        {showArchived && hasArchivedSignals ? (
          <div className="fixed bottom-[88px] right-6 z-[9999] w-[320px] rounded-lg border border-rose-500/30 bg-slate-950/96 p-3 shadow-2xl backdrop-blur">
            <div className="mb-2 flex items-center gap-2">
              <Trash2 size={16} className="text-rose-300" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-300">
                Archive ({dismissedSignals.length})
              </span>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {dismissedSignals.map((sig, i) => (
                <div key={i} className="flex justify-between gap-2 rounded-md border border-rose-500/10 bg-rose-500/[0.04] px-2 py-1.5 text-[10px]">
                  <span className="truncate text-rose-100/80">{sig.title}</span>
                  <span className="shrink-0 text-rose-300/50">
                    {sig.dismissedAt ? new Date(sig.dismissedAt).toLocaleTimeString() : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => hasArchivedSignals && setShowArchived((current) => !current)}
          disabled={!hasArchivedSignals}
          className={`fixed bottom-6 right-6 z-[9999] flex h-14 w-14 items-center justify-center rounded-full border shadow-2xl transition ${
            hasArchivedSignals
              ? 'border-rose-400/50 bg-rose-500/18 text-rose-200 hover:bg-rose-500/24'
              : 'border-slate-600/60 bg-slate-900/90 text-slate-400 opacity-90'
          }`}
          title={hasArchivedSignals ? `Open archive (${dismissedSignals.length})` : 'Archive is empty'}
          aria-label={hasArchivedSignals ? `Open archive with ${dismissedSignals.length} items` : 'Archive is empty'}
        >
          <div className="relative">
            <Trash2 size={22} />
            {hasArchivedSignals ? (
              <span className="absolute -right-3 -top-3 min-w-[1.25rem] rounded-full border border-rose-200/20 bg-rose-300 px-1 py-0.5 text-center text-[9px] font-black leading-none text-slate-950">
                {dismissedSignals.length}
              </span>
            ) : null}
          </div>
        </button>
      </div>
    </div>
  );
}
