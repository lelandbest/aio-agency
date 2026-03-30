import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, MessageSquare, AlertTriangle,
  Activity, Brain, Crosshair, Send,
  RefreshCw, AlertCircle, Target,
  ChevronRight, Play, Clock, Plus, Loader2, Zap
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { getAiRunsApi, getCalendarEventsApi, getCommsSnapshotApi, getContactsApi } from '../../services/backendApi';
import { dispatchAction } from '../../orchestration';

const executeSignalApi = async (signalType, action, target, input, context = {}) => {
  const response = await fetch('/api/signals/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signalType,
      action,
      target: target || null,
      input: input || '',
      context,
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Signal execution failed');
  }
  return response.json();
};

const runSignalAction = async (signal, onResult) => {
  if (!signal?.primaryAction?.action) {
    return;
  }
  
  const action = signal.primaryAction.action;
  
  // Check if this is an execution action
  if (action.type === 'execute_agent' && action.agent) {
    try {
      const result = await executeSignalApi(
        signal.type,
        'agent',
        action.agent,
        action.input || `Process ${signal.title}`,
        action.context || {}
      );
      if (onResult) onResult(result);
      return result;
    } catch (error) {
      console.error('Signal execution failed:', error);
      throw error;
    }
  }
  
  if (action.type === 'execute_flow' && action.flowId) {
    try {
      const result = await executeSignalApi(
        signal.type,
        'flow',
        action.flowId,
        action.input || '',
        action.context || {}
      );
      if (onResult) onResult(result);
      return result;
    } catch (error) {
      console.error('Signal execution failed:', error);
      throw error;
    }
  }
  
  if (action.type === 'execute_command') {
    try {
      const result = await executeSignalApi(
        signal.type,
        'command',
        null,
        action.input || `Process ${signal.title}`,
        action.context || {}
      );
      if (onResult) onResult(result);
      return result;
    } catch (error) {
      console.error('Signal execution failed:', error);
      throw error;
    }
  }
  
  // Fallback to navigation/dispatch for non-execution actions
  if (action.type === 'open_module' || action.type === 'navigate') {
    dispatchAction(action, { ...(action.payload || {}), source: 'signals' });
    return { status: 'navigated' };
  }
  
  // Default dispatch
  dispatchAction(action, { ...(action.payload || {}), source: 'signals' });
  return { status: 'dispatched' };
};

/**
 * SIGNAL ENGINE CORE LOGIC
 * Interprets raw workspace data into operator-facing heuristics.
 */
const mapDataToSignals = (rawData) => {
  const { contacts = [], threads = [], aiRuns = [], bookings = [] } = rawData;
  const signals = [];
  const now = Date.now();

  // 1. Pipeline Signals (Stalled Deals)
  const stalledDeals = contacts.filter(c => {
    if (!c.pipelineStage || ['Closed Won', 'Closed Lost'].includes(c.pipelineStage)) return false;
    const lastUpdate = new Date(c.updatedAt || c.createdAt).getTime();
    return (now - lastUpdate) > (48 * 60 * 60 * 1000); // 48h limit
  });

  if (stalledDeals.length > 0) {
    signals.push({
      id: `stalled-deals-${now}`,
      type: 'pipeline',
      severity: stalledDeals.length > 2 ? 'critical' : 'warning',
      title: `${stalledDeals.length} deals stalled 48+ hours`,
      description: `No stage movement on these deals in 48+ hours.`,
      impact: 'Revenue at risk as stages age.',
      timeContext: 'Window: 48h without movement',
      primaryAction: {
        label: 'Open Pipeline',
        action: { type: 'open_module', payload: { module: 'pipelines' } }
      },
      count: stalledDeals.length,
      entities: stalledDeals,
      timestamp: now
    });
  }

  // 2. Comms Signals (Missed Follow-ups)
  const unreadThreads = threads.filter(t => t.status === 'unread' || t.lastMessageSource === 'external');
  if (unreadThreads.length > 0) {
    signals.push({
      id: `unread-threads-${now}`,
      type: 'comms',
      severity: unreadThreads.length > 5 ? 'critical' : 'warning',
      title: `${unreadThreads.length} threads need response`,
      description: `Unread threads are waiting in Comms.`,
      impact: 'Response SLAs at risk.',
      timeContext: 'Queue state: awaiting reply now',
      primaryAction: {
        label: 'Open Comms',
        action: { type: 'open_module', payload: { module: 'chat' } }
      },
      count: unreadThreads.length,
      entities: unreadThreads,
      timestamp: now
    });
  }

  // 3. System Signals (Run Health)
  const failedRuns = aiRuns.filter(r => r.status === 'failed');
  if (failedRuns.length > 0) {
    signals.push({
      id: `failed-runs-${now}`,
      type: 'system',
      severity: 'critical',
      title: `${failedRuns.length} automations failed`,
      description: `Flow nodes failed in the last 24 hours.`,
      impact: 'Automations stalled; follow-ups may slip.',
      timeContext: 'Window: last 24 hours',
      primaryAction: {
        label: 'Open Flows',
        action: { type: 'open_module', payload: { module: 'flows' } }
      },
      count: failedRuns.length,
      timestamp: now
    });
  }

  // 4. Normal Updates (Informational)
  if (aiRuns.length > 10) {
    signals.push({
      id: `ai-velocity-${now}`,
      type: 'ai',
      severity: 'info',
      title: 'High run throughput',
      description: `${aiRuns.length} recorded runs completed recently.`,
      impact: 'Recent execution volume is elevated.',
      timeContext: 'Recent execution window',
      primaryAction: {
        label: 'View Runs',
        action: { type: 'open_module', payload: { module: 'flows' } }
      },
      timestamp: now
    });
  }

  // Add execution-capable signals
  // Example: Quick AI Analysis signal
  if (threads.length > 0 || contacts.length > 0) {
    signals.push({
      id: `quick-analysis-${now}`,
      type: 'ai_analysis',
      severity: 'info',
      title: 'Quick AI Analysis Available',
      description: 'Analyze current workspace state with AI.',
      impact: 'Get instant insights on contacts and conversations.',
      timeContext: 'On-demand',
      primaryAction: {
        label: 'Run Analysis',
        action: { type: 'execute_agent', agent: 'ALPHA', input: 'Analyze the current workspace state and provide insights on contacts, conversations, and opportunities.' }
      },
      timestamp: now
    });
  }

  const activeBookings = bookings.filter((booking) => !['cancelled'].includes(String(booking.status || '').toLowerCase()));
  const upcoming24h = activeBookings.filter((booking) => {
    const start = new Date(booking.startTime).getTime();
    return start >= now && start <= now + (24 * 60 * 60 * 1000);
  });
  if (upcoming24h.length > 0) {
    signals.push({
      id: `booking-upcoming-24h-${now}`,
      type: 'booking_upcoming',
      severity: 'info',
      title: `${upcoming24h.length} bookings scheduled in the next 24h`,
      description: `Upcoming bookings are live on the calendar.`,
      impact: 'Operators have live meeting demand queued.',
      timeContext: 'Window: next 24h',
      primaryAction: {
        label: 'Open Calendar',
        action: { type: 'open_module', payload: { module: 'calendar' } }
      },
      count: upcoming24h.length,
      entities: upcoming24h,
      timestamp: now
    });
  }

  const upcoming7d = activeBookings.filter((booking) => {
    const start = new Date(booking.startTime).getTime();
    return start >= now && start <= now + (7 * 24 * 60 * 60 * 1000);
  });
  const missedBookings = activeBookings.filter((booking) => {
    const end = new Date(booking.endTime || booking.startTime).getTime();
    return end < now && !['completed'].includes(String(booking.status || '').toLowerCase());
  });
  if (missedBookings.length > 0) {
    signals.push({
      id: `booking-missed-${now}`,
      type: 'booking_missed',
      severity: 'warning',
      title: `${missedBookings.length} missed bookings`,
      description: `Scheduled bookings ended without being marked completed.`,
      impact: 'Follow-up risk is increasing on booked meetings.',
      timeContext: 'Past-due booking audit',
      primaryAction: {
        label: 'Review Calendar',
        action: { type: 'open_module', payload: { module: 'calendar' } }
      },
      count: missedBookings.length,
      entities: missedBookings,
      timestamp: now
    });
  }

  if (upcoming7d.length === 0) {
    signals.push({
      id: `booking-gap-${now}`,
      type: 'booking_gap',
      severity: 'warning',
      title: 'No bookings scheduled in the next 7 days',
      description: 'The booking calendar is empty for the upcoming week.',
      impact: 'Pipeline conversion and meeting momentum may stall.',
      timeContext: 'Window: next 7d',
      primaryAction: {
        label: 'Open Calendar',
        action: { type: 'open_module', payload: { module: 'calendar' } }
      },
      timestamp: now
    });
  }

  const cancelledBookings = bookings.filter((booking) => String(booking.status || '').toLowerCase() === 'cancelled');
  if (cancelledBookings.length > 0) {
    signals.push({
      id: `booking-cancelled-${now}`,
      type: 'booking_cancelled',
      severity: cancelledBookings.length > 2 ? 'warning' : 'info',
      title: `${cancelledBookings.length} cancelled bookings detected`,
      description: `Cancelled bookings are present in the active calendar dataset.`,
      impact: 'Reschedule coverage should be checked.',
      timeContext: 'Current booking state',
      primaryAction: {
        label: 'Open Calendar',
        action: { type: 'open_module', payload: { module: 'calendar' } }
      },
      count: cancelledBookings.length,
      entities: cancelledBookings,
      timestamp: now
    });
  }

  const severityRank = { critical: 0, warning: 1, info: 2 };
  return signals.sort((a, b) => {
    const rankDelta = severityRank[a.severity] - severityRank[b.severity];
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return b.timestamp - a.timestamp;
  });
};

/**
 * UI COMPONENTS
 */

const SignalSummaryStrip = ({ signals, compact = false }) => {
  const counts = signals.reduce(
    (acc, signal) => {
      acc[signal.severity] += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 }
  );

  if (!signals.length) return null;

  return (
    <div className={compact ? 'flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar' : 'px-6 py-3 border-b border-[var(--color-border)] bg-black/10'}>
      <div className={`flex ${compact ? 'flex-nowrap' : 'flex-wrap'} items-center gap-2`}>
        <div className={`inline-flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 ${compact ? 'px-3 py-2 shrink-0' : 'px-3 py-2'}`}>
          <AlertCircle size={12} className="text-[var(--color-text-tertiary)]" />
          <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Signal Summary</span>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-red-300 ${compact ? 'shrink-0' : ''}`}>
          Critical {counts.critical}
        </div>
        <div className={`inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-amber-300 ${compact ? 'shrink-0' : ''}`}>
          Warning {counts.warning}
        </div>
        <div className={`inline-flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300 ${compact ? 'shrink-0' : ''}`}>
          Info {counts.info}
        </div>
      </div>
    </div>
  );
};

const SignalCard = ({ signal, onExecute }) => {
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  
  const severityColor = {
    critical: 'border-red-500/35 bg-red-500/6 text-red-300',
    warning: 'border-amber-500/35 bg-amber-500/6 text-amber-300',
    info: 'border-cyan-500/30 bg-cyan-500/6 text-cyan-300',
  }[signal.severity];

  const iconColor = {
    critical: 'text-red-400 bg-red-400/10',
    warning: 'text-amber-400 bg-amber-400/10',
    info: 'text-cyan-400 bg-cyan-400/10',
  }[signal.severity];
  const severityLabel = {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info'
  }[signal.severity] || 'Status';
  const actionTone = {
    critical: 'bg-red-500 hover:bg-red-600 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-black',
    info: 'bg-cyan-500 hover:bg-cyan-600 text-slate-950',
  }[signal.severity];

  const isExecutionAction = signal.primaryAction?.action?.type?.startsWith('execute_');
  
  const handleAction = async () => {
    if (isExecutionAction) {
      setExecuting(true);
      setResult(null);
      try {
        const execResult = await runSignalAction(signal);
        setResult(execResult);
        if (onExecute) onExecute(execResult);
      } catch (error) {
        setResult({ error: error.message });
      } finally {
        setExecuting(false);
      }
    } else {
      runSignalAction(signal);
    }
  };

  return (
    <div className={`relative rounded-2xl border ${severityColor} p-4 pr-[148px] transition-all duration-300 shadow-[0_12px_28px_rgba(0,0,0,0.14)]`}>
      <div className={`absolute right-4 top-4 px-2 py-1 rounded-lg text-[7px] font-black uppercase tracking-[0.18em] border ${severityColor}`}>
        {severityLabel}
      </div>
      <div className="flex items-start gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconColor}`}>
          <AlertTriangle size={16} />
        </div>
        <div>
          <h3 className="text-[13px] font-black text-white uppercase tracking-[0.16em]">{signal.title}</h3>
          <p className="mt-1 text-[10px] text-[var(--color-text-secondary)] font-medium leading-relaxed">
            {signal.description}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.22em]">Impact</span>
            <p className="mt-1 text-[10px] text-white/80 leading-relaxed">{signal.impact}</p>
          </div>
          <div>
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.22em]">Time Context</span>
            <p className="mt-1 text-[10px] text-[var(--color-text-secondary)] leading-relaxed">
              {signal.timeContext || `Detected ${new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
        </div>
      </div>
      {result && (
        <div className="mt-3 p-2 rounded-lg bg-black/20 text-[9px] text-white/70">
          {result.runId ? `Executed: ${result.runId}` : result.error ? `Error: ${result.error}` : 'Executed'}
        </div>
      )}
      <button
        onClick={handleAction}
        disabled={executing}
        className={`absolute right-4 bottom-4 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[8px] font-black uppercase tracking-[0.18em] transition-all ${actionTone} ${executing ? 'opacity-50 cursor-wait' : ''}`}
      >
        {executing ? <Loader2 size={9} className="animate-spin" /> : isExecutionAction ? <Zap size={9} /> : <Play size={9} />}
        {executing ? 'Executing...' : signal.primaryAction.label}
      </button>
    </div>
  );
};

const SignalHistory = ({ signals }) => {
  return (
    <div className="bg-black/10 border border-white/5 rounded-2xl p-5 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
      <div className="flex items-center gap-2 mb-5">
        <Clock size={14} className="text-slate-500" />
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--color-text-tertiary)]">Signal Feed</h3>
      </div>
      <div className="space-y-5">
        {signals.length > 0 ? signals.map((signal, i) => (
          <div key={i} className="group relative flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full border-2 border-black ${
                signal.severity === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                signal.severity === 'warning' ? 'bg-amber-500' : 'bg-cyan-500'
              }`} />
              {i < signals.length - 1 && <div className="w-px h-full bg-white/5 my-2" />}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-black text-white uppercase tracking-[0.16em] group-hover:text-[var(--color-primary)] transition-colors">{signal.title}</p>
                <span className="text-[8px] font-bold text-slate-600 uppercase">{new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed font-medium line-clamp-2">{signal.impact}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[7px] font-black text-slate-700 uppercase tracking-widest">{signal.timeContext}</span>
                <ChevronRight size={10} className="text-slate-800 shrink-0" />
                <button 
                  onClick={() => runSignalAction(signal.primaryAction.action)}
                  className="text-[7px] font-black text-[var(--color-primary)] uppercase tracking-widest hover:underline"
                >
                  RUN {signal.primaryAction.label}
                </button>
              </div>
            </div>
          </div>
        )) : (
          <div className="flex flex-col items-center justify-center py-12 text-center opacity-30">
            <Brain size={32} className="mb-4" />
            <p className="text-xs font-black uppercase tracking-widest">No active signals</p>
          </div>
        )}
      </div>
    </div>
  );
};

const PulseCard = ({ title, value, icon: Icon, color = 'purple', live = false, compact = false }) => {
  const colorClass = {
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
    sky: 'text-sky-400',
    cyan: 'text-cyan-400',
    amber: 'text-amber-400',
  }[color] || 'text-purple-400';

  return (
    <div className={`flex items-center gap-2.5 bg-black/15 rounded-xl border border-white/5 ${compact ? 'min-w-[170px] shrink-0 px-3 py-2' : 'px-3 py-2'}`}>
      <div className={`${colorClass} shrink-0`}>
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-500">{title}</p>
        <p className="text-sm font-black text-white">{value}</p>
      </div>
      {live && (
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
      )}
    </div>
  );
};

const PulseBand = ({ stats, compact = false }) => {
  return (
    <div className={compact ? 'flex flex-nowrap items-center gap-3 overflow-x-auto no-scrollbar' : 'px-6 py-3 border-b border-[var(--color-border)] bg-black/10'}>
      <div className={`flex items-center ${compact ? 'gap-3 shrink-0' : 'justify-between mb-2'}`}>
        <div className="flex items-center gap-2">
          <Activity size={12} className="text-[var(--color-primary)]" />
          <span className="text-[9px] font-black text-[var(--color-text-tertiary)] uppercase tracking-[0.3em]">Ops Pulse</span>
        </div>
        <div className="flex items-center gap-2 text-[7px] font-black text-slate-500 uppercase tracking-widest">
          <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
          Workspace Feed
        </div>
      </div>
      <div className={compact ? 'flex flex-nowrap items-center gap-3 overflow-x-auto no-scrollbar' : 'grid grid-cols-2 lg:grid-cols-4 gap-3'}>
        <PulseCard title="Contacts" value={stats.contacts} icon={Users} color="purple" live={false} compact={compact} />
        <PulseCard title="Pipelines" value={stats.pipeline} icon={Target} color="green" live={true} compact={compact} />
        <PulseCard title="Threads" value={stats.comms} icon={MessageSquare} color="sky" live={true} compact={compact} />
        <PulseCard title="Runs" value={stats.aiRuns} icon={Brain} color="cyan" live={false} compact={compact} />
      </div>
    </div>
  );
};

/**
 * MAIN MODULE
 */
const SignalsModule = () => {
  const { openAIAssist } = useAIAssist();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ contacts: 0, pipeline: 0, comms: 0, aiRuns: 0 });
  const [signals, setSignals] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const loadEngineData = async () => {
      setLoading(true);
      try {
        const [contactsRes, commsRes, aiRunsRes, bookingsRes] = await Promise.all([
          getContactsApi().catch(() => []),
          getCommsSnapshotApi().catch(() => ({ threads: [] })),
          getAiRunsApi(50).catch(() => []),
          getCalendarEventsApi().catch(() => []),
        ]);

        const rawData = {
          contacts: contactsRes || [],
          threads: commsRes?.threads || commsRes?.allThreads || [],
          aiRuns: aiRunsRes || [],
          bookings: bookingsRes || [],
        };

        const generatedSignals = mapDataToSignals(rawData);

        setStats({
          contacts: rawData.contacts.length,
          pipeline: rawData.contacts.filter(c => c.pipelineStage && !['Closed Won', 'Closed Lost'].includes(c.pipelineStage)).length,
          comms: rawData.threads.length,
          aiRuns: rawData.aiRuns.length,
        });

        setSignals(generatedSignals);
        setHistory(generatedSignals.sort((a, b) => b.timestamp - a.timestamp));

      } catch (err) {
        console.error('Signal load failed:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEngineData();
  }, []);

  const quickActions = [
    { id: 'new-contact', label: 'New Contact', icon: Users, action: { type: 'open_module', payload: { module: 'crm' } } },
    { id: 'send-msg', label: 'Send Message', icon: Send, action: { type: 'open_module', payload: { module: 'chat' } } },
    { id: 'new-deal', label: 'New Deal', icon: Crosshair, action: { type: 'open_module', payload: { module: 'pipelines' } } },
  ];

  return (
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-[var(--radius-outer)] border border-[var(--color-border)] flex flex-col overflow-hidden shadow-island">
      <ModuleHeader
        showTitle={false}
        leftActions={quickActions.map(action => ({
          label: action.label,
          icon: action.icon,
          onClick: () => runSignalAction(action.action),
          variant: 'secondary'
        }))}
        toolbarLeftSlot={(
          <div className="ml-2">
            <PulseBand stats={stats} compact />
          </div>
        )}
        toolbarCenterSlot={(
          <div className="flex min-w-0 items-center overflow-x-auto no-scrollbar">
            {!loading ? <SignalSummaryStrip signals={signals} compact /> : null}
          </div>
        )}
        aiAssistSlot={(
          <button
            onClick={openAIAssist}
            className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-hover)] transition"
            title="Brain"
          >
            <Brain size={16} />
          </button>
        )}
        executeSlot={(
          <button
            disabled={true}
            className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-hover)] transition disabled:opacity-40"
            title="Execute"
          >
            <Crosshair size={16} />
          </button>
        )}
        hasSelection={false}
      />

      <div className="flex-1 min-h-0 p-6 bg-gradient-to-b from-transparent to-black/10">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
            <RefreshCw className="animate-spin" size={24} />
            <p className="text-[10px] font-black uppercase tracking-[0.3em]">Syncing signal feeds...</p>
          </div>
        ) : (
          <div className="grid h-full min-h-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] max-w-[1600px] mx-auto">
            {/* Main Intelligence Grid */}
            <div className="min-h-0 overflow-y-auto no-scrollbar pr-1">
              <div className="space-y-10">
              <section className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-[var(--color-primary)]" />
                    <h2 className="text-[12px] font-black text-white uppercase tracking-[0.4em]">Priority Signals</h2>
                  </div>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{signals.length} Signals</span>
                </div>
                
                <div className="space-y-6">
                  {signals.length > 0 ? (
                    signals.map(signal => (
                      <SignalCard key={signal.id} signal={signal} />
                    ))
                  ) : (
                    <div className="py-20 rounded-3xl border border-dashed border-white/5 flex flex-col items-center justify-center text-slate-600 gap-4">
                      <TrendingUp size={48} className="opacity-20" />
                      <div className="text-center">
                        <p className="text-sm font-black uppercase tracking-widest">Signals Clear</p>
                        <p className="text-[10px] uppercase tracking-widest opacity-50">No urgent items detected.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
              </div>
            </div>

            {/* Intelligence Feed */}
            <div className="min-h-0 overflow-y-auto no-scrollbar pl-1">
              <SignalHistory signals={history} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalsModule;
