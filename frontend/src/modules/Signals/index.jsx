import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Users, MessageSquare, Zap, X, 
  BarChart3, Activity, Brain, Target, Send, 
  Save, Grid3x3, RefreshCw, FileText, AlertCircle, 
  ChevronRight, Play, Wand2, Clock, Star, Settings
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import AIAssistButton from '../../components/AIAssistButton';
import { assistAiApi, getAiRunsApi, getCommsSnapshotApi, getContactsApi } from '../../services/backendApi';
import { executeHelpAction } from '../Help/actions/helpActions';

/**
 * SIGNAL ENGINE CORE LOGIC
 * Interprets raw system data into actionable intelligence.
 */
const mapDataToSignals = (rawData) => {
  const { contacts = [], threads = [], aiRuns = [] } = rawData;
  const signals = [];
  const now = Date.now();

  // 1. Pipeline Signals (Stalled Deals)
  const stalledDeals = contacts.filter(c => {
    if (!c.pipeline_stage || ['Closed Won', 'Closed Lost'].includes(c.pipeline_stage)) return false;
    const lastUpdate = new Date(c.updated_at || c.created_at).getTime();
    return (now - lastUpdate) > (48 * 60 * 60 * 1000); // 48h limit
  });

  if (stalledDeals.length > 0) {
    signals.push({
      id: `stalled-deals-${now}`,
      type: 'pipeline',
      severity: stalledDeals.length > 2 ? 'critical' : 'attention',
      title: `${stalledDeals.length} deals stalled for 48+ hours`,
      description: `Multiple leads in your pipeline haven't moved despite recent activity.`,
      impact: 'Potential revenue stagnation and decreased conversion probability.',
      primaryAction: {
        label: 'Open Pipeline',
        action: { type: 'open_module', payload: { module: 'pipelines' } }
      },
      recommendedActions: [
        { label: 'Generate Follow-ups', action: { type: 'create_flow_dynamic', payload: { intent: 'follow up stalled deals', source: 'signals' } } },
        { label: 'Assign Agent', action: { type: 'assign_agent', payload: { context: 'pipeline_signal' } } }
      ],
      count: stalledDeals.length,
      entities: stalledDeals,
      source: 'CRM Pulse',
      timestamp: now
    });
  }

  // 2. Comms Signals (Missed Follow-ups)
  const unreadThreads = threads.filter(t => t.status === 'unread' || t.lastMessageSource === 'external');
  if (unreadThreads.length > 0) {
    signals.push({
      id: `unread-threads-${now}`,
      type: 'comms',
      severity: unreadThreads.length > 5 ? 'critical' : 'attention',
      title: `${unreadThreads.length} threads require attention`,
      description: `New messages or unread threads are piling up in your inbox.`,
      impact: 'Delayed response times impact customer satisfaction and lead trust.',
      primaryAction: {
        label: 'Open Inbox',
        action: { type: 'open_module', payload: { module: 'chat' } }
      },
      recommendedActions: [
        { label: 'AI Draft Replies', action: { type: 'create_flow_dynamic', payload: { intent: 'draft replies for unread messages', source: 'signals' } } }
      ],
      count: unreadThreads.length,
      entities: unreadThreads,
      source: 'Comms Engine',
      timestamp: now
    });
  }

  // 3. System Signals (AI Efficiency)
  const failedRuns = aiRuns.filter(r => r.status === 'failed');
  if (failedRuns.length > 0) {
    signals.push({
      id: `failed-runs-${now}`,
      type: 'system',
      severity: 'critical',
      title: `${failedRuns.length} AI automations failed`,
      description: `Critical workflow nodes failed to execute in the last 24 hours.`,
      impact: 'Operational breakage in automated lead nurturing pipelines.',
      primaryAction: {
        label: 'Review Automation',
        action: { type: 'open_module', payload: { module: 'flows' } }
      },
      recommendedActions: [
        { label: 'Debug Intent', action: { type: 'create_flow_dynamic', payload: { intent: 'debug the most recent failed automation runs', source: 'signals' } } }
      ],
      count: failedRuns.length,
      source: 'Neural Monitoring',
      timestamp: now
    });
  }

  // 4. Normal Updates (Informational)
  if (aiRuns.length > 10) {
    signals.push({
      id: `ai-velocity-${now}`,
      type: 'ai',
      severity: 'normal',
      title: 'High AI execution velocity',
      description: `Your neural engine processed ${aiRuns.length} triggers successfully.`,
      impact: 'System is operating at peak efficiency under current load.',
      primaryAction: {
        label: 'View Logs',
        action: { type: 'open_module', payload: { module: 'flows' } }
      },
      source: 'Brain Stats',
      timestamp: now
    });
  }

  return signals;
};

/**
 * UI COMPONENTS
 */

const PrioritySignalStrip = ({ signals }) => {
  const prioritySignals = signals
    .filter(s => s.severity === 'critical' || s.severity === 'attention')
    .slice(0, 3);

  if (prioritySignals.length === 0) return null;

  return (
    <div className="px-6 py-4 border-b border-[var(--color-border)] bg-red-500/5">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle size={14} className="text-red-400" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">Priority Signals</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {prioritySignals.map(signal => (
          <div key={signal.id} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5 shadow-2xl">
            <div className="min-w-0">
              <p className="text-[10px] font-black text-white uppercase tracking-widest truncate">{signal.title}</p>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">{signal.source}</p>
            </div>
            <button
              onClick={() => executeHelpAction(signal.primaryAction.action)}
              className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg"
            >
              {signal.primaryAction.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const SignalCard = ({ signal }) => {
  const severityColor = {
    critical: 'border-red-500/30 bg-red-500/5 text-red-400',
    attention: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    normal: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
  }[signal.severity];

  const iconColor = {
    critical: 'text-red-400 bg-red-400/10',
    attention: 'text-amber-400 bg-amber-400/10',
    normal: 'text-emerald-400 bg-emerald-400/10',
  }[signal.severity];

  return (
    <div className={`p-6 rounded-2xl border ${severityColor} transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColor}`}>
            <Zap size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest">{signal.title}</h3>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]">{signal.source}</p>
          </div>
        </div>
        <div className={`px-2 py-0.5 rounded-md text-[7px] font-black uppercase border ${severityColor}`}>
          {signal.severity}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] text-[var(--color-text-secondary)] font-medium leading-relaxed">
            {signal.description}
          </p>
          <div className="pt-2">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Impact Analysis:</span>
            <p className="text-[10px] text-white/70 italic">{signal.impact}</p>
          </div>
        </div>

        <div className="pt-4 border-t border-white/5 space-y-3">
          <button
            onClick={() => executeHelpAction(signal.primaryAction.action)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-[0.2em] transition-all"
          >
            <Play size={10} />
            {signal.primaryAction.label}
          </button>

          <div className="flex gap-2">
            {signal.recommendedActions?.map((action, idx) => (
              <button
                key={idx}
                onClick={() => executeHelpAction(action.action)}
                className="flex-1 py-2 rounded-lg bg-black/20 border border-white/5 hover:border-[var(--color-primary)] text-slate-400 hover:text-[var(--color-primary)] text-[9px] font-bold uppercase transition-all"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const SignalHistory = ({ signals }) => {
  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xl">
      <div className="flex items-center gap-2 mb-6">
        <Clock size={16} className="text-sky-400" />
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--color-text-primary)]">Signal Intelligence Feed</h3>
      </div>
      <div className="space-y-6">
        {signals.length > 0 ? signals.map((signal, i) => (
          <div key={i} className="group relative flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full border-2 border-black ${
                signal.severity === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                signal.severity === 'attention' ? 'bg-amber-500' : 'bg-emerald-500'
              }`} />
              {i < signals.length - 1 && <div className="w-px h-full bg-white/5 my-2" />}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-black text-white uppercase tracking-widest group-hover:text-[var(--color-primary)] transition-colors">{signal.title}</p>
                <span className="text-[8px] font-bold text-slate-600 uppercase">{new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed font-medium line-clamp-2">{signal.description}</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[7px] font-black text-slate-700 uppercase tracking-widest">{signal.source}</span>
                <ChevronRight size={10} className="text-slate-800" />
                <button 
                  onClick={() => executeHelpAction(signal.primaryAction.action)}
                  className="text-[7px] font-black text-[var(--color-primary)] uppercase tracking-widest hover:underline"
                >
                  EXECUTE {signal.primaryAction.label}
                </button>
              </div>
            </div>
          </div>
        )) : (
          <div className="flex flex-col items-center justify-center py-12 text-center opacity-30">
            <Brain size={32} className="mb-4" />
            <p className="text-xs font-black uppercase tracking-widest">No Signals Detected</p>
          </div>
        )}
      </div>
    </div>
  );
};

const PulseCard = ({ title, value, icon: Icon, color = 'purple', live = false }) => {
  const colorClass = {
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
    sky: 'text-sky-400',
    cyan: 'text-cyan-400',
    amber: 'text-amber-400',
  }[color] || 'text-purple-400';

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-black/20 rounded-xl border border-white/5 hover:border-white/10 transition-all">
      <div className={`${colorClass} shrink-0`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{title}</p>
        <p className="text-lg font-black text-white">{value}</p>
      </div>
      {live && (
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
      )}
    </div>
  );
};

const PulseBand = ({ stats, loading }) => {
  const [timestamp, setTimestamp] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTimestamp(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="px-6 py-4 border-b border-[var(--color-border)] bg-black/10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[var(--color-primary)]" />
          <span className="text-[10px] font-black text-[var(--color-text-primary)] uppercase tracking-[0.3em]">System Pulse</span>
        </div>
        <div className="flex items-center gap-2 text-[8px] font-black text-slate-500 uppercase tracking-widest">
          <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
          Neural Link: Established
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PulseCard title="Contacts" value={stats.contacts} icon={Users} color="purple" live={false} />
        <PulseCard title="Pipelines" value={stats.pipeline} icon={Target} color="green" live={true} />
        <PulseCard title="Threads" value={stats.comms} icon={MessageSquare} color="sky" live={true} />
        <PulseCard title="AI Runs" value={stats.aiRuns} icon={Brain} color="cyan" live={false} />
      </div>
    </div>
  );
};

/**
 * MAIN MODULE
 */
const SignalsModule = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ contacts: 0, pipeline: 0, comms: 0, aiRuns: 0 });
  const [signals, setSignals] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const loadEngineData = async () => {
      setLoading(true);
      try {
        const [contactsRes, commsRes, aiRunsRes] = await Promise.all([
          getContactsApi().catch(() => []),
          getCommsSnapshotApi().catch(() => ({ threads: [] })),
          getAiRunsApi(50).catch(() => []),
        ]);

        const rawData = {
          contacts: contactsRes || [],
          threads: commsRes?.threads || commsRes?.allThreads || [],
          aiRuns: aiRunsRes || []
        };

        const generatedSignals = mapDataToSignals(rawData);

        setStats({
          contacts: rawData.contacts.length,
          pipeline: rawData.contacts.filter(c => c.pipeline_stage && !['Closed Won', 'Closed Lost'].includes(c.pipeline_stage)).length,
          comms: rawData.threads.length,
          aiRuns: rawData.aiRuns.length,
        });

        setSignals(generatedSignals);
        setHistory(generatedSignals.sort((a, b) => b.timestamp - a.timestamp));

      } catch (err) {
        console.error('Signal Engine failure:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEngineData();
  }, []);

  const quickActions = [
    { id: 'new-contact', label: 'New Contact', icon: Users, action: { type: 'open_module', payload: { module: 'crm' } } },
    { id: 'send-msg', label: 'Send Message', icon: Send, action: { type: 'open_module', payload: { module: 'chat' } } },
    { id: 'new-deal', label: 'New Deal', icon: Target, action: { type: 'open_module', payload: { module: 'pipelines' } } },
    { id: 'new-flow', label: 'Create Flow', icon: Zap, action: { type: 'open_module', payload: { module: 'flows' } } },
  ];

  return (
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Action Header */}
      <div className="px-6 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-4 bg-black/5">
        <div className="flex items-center gap-3">
          {quickActions.map(action => (
            <button
              key={action.id}
              onClick={() => executeHelpAction(action.action)}
              className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[var(--color-primary)] text-slate-500 hover:text-[var(--color-primary)] flex items-center justify-center transition-all shadow-sm"
              title={action.label}
            >
              <action.icon size={16} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mr-2">Signal Capacity: Nominal</div>
          <button
            className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/10 text-slate-500 hover:text-white flex items-center justify-center transition-all"
            title="System Diagnostics"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <PulseBand stats={stats} loading={loading} />
      
      {!loading && <PrioritySignalStrip signals={signals} />}

      <div className="flex-1 overflow-y-auto p-8 no-scrollbar bg-gradient-to-b from-transparent to-black/10">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
            <RefreshCw className="animate-spin" size={24} />
            <p className="text-[10px] font-black uppercase tracking-[0.3em]">Synching Neural Engine...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 max-w-[1600px] mx-auto">
            {/* Main Intelligence Grid */}
            <div className="lg:col-span-8 space-y-10">
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-[var(--color-primary)]" />
                    <h2 className="text-[12px] font-black text-white uppercase tracking-[0.4em]">Active Signals</h2>
                  </div>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{signals.length} Conditions Interpreted</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {signals.length > 0 ? (
                    signals.map(signal => (
                      <SignalCard key={signal.id} signal={signal} />
                    ))
                  ) : (
                    <div className="col-span-full py-20 rounded-3xl border border-dashed border-white/5 flex flex-col items-center justify-center text-slate-600 gap-4">
                      <TrendingUp size={48} className="opacity-20" />
                      <div className="text-center">
                        <p className="text-sm font-black uppercase tracking-widest">AIO Signal Engine: Clear</p>
                        <p className="text-[10px] uppercase tracking-widest opacity-50">No urgent follow-ups or stalling detected.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Intelligence Feed */}
            <div className="lg:col-span-4 h-fit sticky top-0">
              <SignalHistory signals={history} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalsModule;
