import React, { useState, useEffect } from 'react';
import { Play, Pause, Edit2, Trash2, Plus, Settings, MessageSquare, Bot, Target, Users, ArrowRight, Terminal, Layers, Cpu, ShieldCheck, UploadCloud, Workflow, Activity, Radiation, Lock } from 'lucide-react';
import { mockSupabase } from '../../services/mockSupabase';
import { getAiAgentsApi, getAiRunsApi, runAiCommandApi } from '../../services/backendApi';
import ModuleHeader from '../../components/ModuleHeader';
import flowDraftRepository from '../Flows/utils/flowDraftRepository';
import { SPECIALIST_REGISTRY } from './data/agentRegistry';

const ROW_COLOR_LANES = [
  [
    { bg: 'bg-blue-950/50', border: 'border-blue-600/40', shadow: 'rgba(37,99,235,0.2)', icon: 'text-blue-300' },
    { bg: 'bg-blue-900/50', border: 'border-blue-500/40', shadow: 'rgba(59,130,246,0.2)', icon: 'text-blue-200' },
    { bg: 'bg-blue-800/45', border: 'border-blue-400/40', shadow: 'rgba(96,165,250,0.22)', icon: 'text-blue-200' },
  ],
  [
    { bg: 'bg-cyan-950/50', border: 'border-cyan-600/40', shadow: 'rgba(8,145,178,0.2)', icon: 'text-cyan-300' },
    { bg: 'bg-cyan-900/50', border: 'border-cyan-500/40', shadow: 'rgba(6,182,212,0.2)', icon: 'text-cyan-200' },
    { bg: 'bg-cyan-800/45', border: 'border-cyan-400/40', shadow: 'rgba(34,211,238,0.22)', icon: 'text-cyan-200' },
  ],
  [
    { bg: 'bg-emerald-950/45', border: 'border-emerald-600/40', shadow: 'rgba(16,185,129,0.2)', icon: 'text-emerald-300' },
    { bg: 'bg-emerald-900/45', border: 'border-emerald-500/40', shadow: 'rgba(16,185,129,0.2)', icon: 'text-emerald-200' },
    { bg: 'bg-emerald-800/45', border: 'border-emerald-400/40', shadow: 'rgba(52,211,153,0.22)', icon: 'text-emerald-200' },
  ],
  [
    { bg: 'bg-amber-950/45', border: 'border-amber-600/40', shadow: 'rgba(217,119,6,0.2)', icon: 'text-amber-300' },
    { bg: 'bg-amber-900/45', border: 'border-amber-500/40', shadow: 'rgba(245,158,11,0.2)', icon: 'text-amber-200' },
    { bg: 'bg-amber-800/45', border: 'border-amber-400/40', shadow: 'rgba(251,191,36,0.22)', icon: 'text-amber-200' },
  ],
];

// 8. AIO AGENTS MODULE
const AIOAgentsModule = () => {
  const [activeAgent, setActiveAgent] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your configured agent. How can I help-' }
  ]);
  const [agents, setAgents] = useState([]);
  const [view, setView] = useState('barracks'); // 'barracks' (list) or 'command' (detail)
  const [aiRuns, setAiRuns] = useState([]);
  const [aiRunsError, setAiRunsError] = useState('');

  const normalizeAgentRecord = (agent = {}) => ({
    ...agent,
    registryKey: agent.registryKey || agent.registry_key || agent.name || '',
    registry_key: agent.registry_key || agent.registryKey || agent.name || '',
    name: agent.name || agent.registry_key || agent.registryKey || '',
  });

  useEffect(() => {
    getAiAgentsApi()
      .then((data) => setAgents(Array.isArray(data) ? data.map(normalizeAgentRecord) : []))
      .catch(() => {
        mockSupabase.from('aio_agents').select().then(({ data }) => setAgents((data || []).map(normalizeAgentRecord)));
      });
    getAiRunsApi(12)
      .then((data) => setAiRuns(Array.isArray(data) ? data : []))
      .catch((error) => setAiRunsError(error.message || 'Unable to load AI activity.'));
  }, []);

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const nextMessage = chatInput.trim();
    setMessages((prev) => [...prev, { role: 'user', content: nextMessage, timestamp: 'Now' }]);
    setChatInput('');
    try {
      const response = await runAiCommandApi({
        module: 'agents',
        surface: 'command',
        command_text: nextMessage,
        requested_agent: activeAgent?.registry_key || activeAgent?.registryKey || activeAgent?.name || null,
        context: {
          requested_agent: activeAgent?.registry_key || activeAgent?.registryKey || activeAgent?.name || '',
          active_agent: activeAgent?.registry_key || activeAgent?.registryKey || activeAgent?.name || '',
        }
      });
      const routing = response?.routing || {};
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response?.suggestion || 'No agent output returned.',
          timestamp: 'Now',
          rank: routing.executing_agent || activeAgent?.name || 'AI',
          chain: (response?.run?.delegate_chain || routing.delegate_chain || []).join(' -> ')
        }
      ]);
      const latestRuns = await getAiRunsApi(12);
      setAiRuns(Array.isArray(latestRuns) ? latestRuns : []);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: error.message || 'Unable to run the selected agent command.',
          timestamp: 'Now',
          rank: 'SYSTEM'
        }
      ]);
    }
  };

  const updateAgentRegistryKey = (agentId, registryKey) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId ? { ...agent, registryKey, registry_key: registryKey, name: registryKey } : agent
      )
    );
    if (activeAgent?.id === agentId) {
      setActiveAgent((prev) => ({ ...prev, registryKey, registry_key: registryKey, name: registryKey }));
    }
  };

  const openDraftInFlowBuilder = (agent) => {
    const draft = flowDraftRepository.createDraftFromAgent(agent, `Draft from ${agent.name}`);
    flowDraftRepository.setActiveDraft(draft.id);
    window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'flows', flowId: null } }));
  };

  return (
     <div className="h-full flex flex-col bg-[var(--color-bg-tertiary)] rounded-[var(--radius-outer)] text-[var(--color-text-primary)] font-sans selection:bg-purple-900/50 overflow-hidden shadow-island border border-[var(--color-border)]">
      <ModuleHeader
        title="Agent Control"
        titleIcon={Bot}
        showTitle={false}
        statusBadge={{ label: 'Systems Online', color: 'success' }}
        actions={[
          {
            label: 'Barracks',
            icon: Target,
            onClick: () => setView('barracks'),
            variant: view === 'barracks' ? 'primary' : 'secondary'
          },
          {
            label: 'Add Agent',
            icon: Plus,
            onClick: () => {},
            variant: 'secondary'
          }
        ]}
        showActions={true}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* BARRACKS VIEW */}
        {view === 'barracks' && (() => {
          const alpha = agents.find(a => (a.registryKey || a.registry_key) === 'ALPHA');
          const regularAgents = agents.filter(a => {
            const key = a.registryKey || a.registry_key;
            return key !== 'ALPHA' && key !== 'OMEGA';
          });
          const alphaRegistry = SPECIALIST_REGISTRY['ALPHA'];
          
          const userRuns = aiRuns.filter(r => !r.agent_role || r.agent_role === 'User');
          const charlieRuns = aiRuns.filter(r => r.agent_role === 'CHARLIE');
          const alphaRuns = aiRuns.filter(r => r.agent_role === 'ALPHA');

          const formatRunTime = (value) => {
            if (!value) return '--:--:--';
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) return '--:--:--';
            return parsed.toLocaleTimeString([], { hour12: false });
          };

          const formatToken = (value, fallback) => {
            const token = value || fallback || '';
            return String(token).toUpperCase();
          };

          const formatAction = (value) => {
            if (!value) return 'TASK';
            return String(value).replace(/_/g, ' ').toUpperCase();
          };

          const formatStatus = (value) => {
            if (!value) return 'RUNNING';
            return String(value).replace(/_/g, ' ').toUpperCase();
          };

          const buildRunRoute = (run = {}) => {
            const chain = Array.isArray(run.delegate_chain) ? run.delegate_chain : [];
            const source = run.intake_agent || run.dispatcher_agent || chain[0] || run.requested_agent || run.agent_role || 'USER';
            const target = run.executing_agent || chain[chain.length - 1] || run.agent_role || run.requested_agent || 'SYSTEM';
            return {
              id: run.id || `${source}-${target}-${run.created_at || ''}`,
              time: formatRunTime(run.created_at),
              source: formatToken(source, 'USER'),
              target: formatToken(target, 'SYSTEM'),
              action: formatAction(run.intent || run.field || run.module || run.surface),
              status: formatStatus(run.status),
            };
          };

          const adminRuns = userRuns.length > 0 ? userRuns : aiRuns;
          const adminEvents = adminRuns.slice(0, 8).map(buildRunRoute);
          const charlieEvents = charlieRuns.slice(0, 8).map(buildRunRoute);
          const alphaEvents = alphaRuns.slice(0, 8).map(buildRunRoute);

          const activeStatuses = new Set(['running', 'queued', 'pending', 'active', 'in_progress']);
          const activeRuns = aiRuns.filter(run => {
            const status = (run.status || '').toLowerCase();
            return !status || activeStatuses.has(status);
          });
          const executionRoutes = activeRuns.slice(0, 6).map(buildRunRoute);

          return (
            <div className="flex-1 flex gap-2 p-1.5 overflow-hidden relative">
              <style>{`
                @keyframes route-flow {
                  0% { transform: translateX(-10%); opacity: 0.25; }
                  40% { opacity: 0.8; }
                  100% { transform: translateX(110%); opacity: 0.2; }
                }
                .route-flow {
                  animation: route-flow linear infinite;
                }
              `}</style>
              {/* LEFT - Roster */}
              <div className="flex-1 w-1/2 p-2 lg:p-3 overflow-y-auto no-scrollbar border border-[var(--color-border)] rounded-[var(--radius-panel)] bg-[var(--color-bg-secondary)] flex flex-col gap-2 shadow-sm">

                {/* ALPHA - Full-Width Leadership Card */}
                {alpha && (
                  <div
                    onClick={() => { setActiveAgent(alpha); setView('command'); setMessages([]); }}
                    className="group min-h-[104px] cursor-pointer rounded-[var(--radius-panel)] border border-green-500/30 bg-gradient-to-br from-green-500/5 via-[var(--color-bg-primary)] to-[var(--color-bg-primary)] hover:border-green-500/60 transition-all duration-500 overflow-hidden shrink-0 shadow-sm"
                  >
                    <div className="px-3 py-1 flex items-center gap-3 border-b border-green-500/10">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-green-500/10 border-2 border-green-500/40 flex items-center justify-center text-sm font-black text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                          AL
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[var(--color-bg-secondary)] shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                      </div>

                      {/* Identity */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h2 className="text-sm font-black text-[var(--color-text-primary)] tracking-wide">{alpha.name || 'ALPHA'}</h2>
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-[0.2em] bg-green-500/15 text-green-400 border border-green-500/30">
                            Lead Agent
                          </span>
                        </div>
                      <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-[0.22em] font-bold">AGT-CMD-001 - HQ</p>
                      </div>

                      {/* Action */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); openDraftInFlowBuilder(alpha); }}
                          className="text-[8px] px-3 py-1.5 rounded-full btn-secondary !bg-green-500/10 !border-green-500/20 !text-green-400 hover:!bg-green-500/20 transition-colors font-bold uppercase tracking-wider"
                        >
                          Draft Flow
                        </button>
                        <div className="text-yellow-400/70 text-[8px] font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          Run <ArrowRight size={8} />
                        </div>
                      </div>
                    </div>

                    {/* Subordinates */}
                    <div className="px-3 py-0.5 bg-yellow-500/5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[8px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)] flex items-center gap-1 mr-1">
                          <Users size={8} /> Direct ({alphaRegistry?.subordinates?.length || 0}):
                        </span>
                        {(alphaRegistry?.subordinates || []).map(key => (
                          <span
                            key={key}
                            className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:border-[var(--color-primary)]/30 hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                          >
                            {key}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex-1 flex flex-col justify-center min-h-0">
                  {/* Roster label */}
                  <div className="mb-1 flex items-center gap-2 shrink-0">
                    <Target size={10} className="text-[var(--color-primary)]" />
                    <span className="text-[9px] font-black uppercase tracking-[0.28em] text-[var(--color-text-tertiary)]">
                      Active Roster: {regularAgents.length} Specialists
                    </span>
                  </div>

                  {/* Regular Agents Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 shrink-0">
                    {regularAgents.map((agent, idx) => {
                      const agentKey = agent.registryKey || agent.registry_key;
                      const row = Math.floor(idx / 3);
                      const col = idx % 3;
                      const c = (ROW_COLOR_LANES[row] && ROW_COLOR_LANES[row][col]) || ROW_COLOR_LANES[0][0];
                      return (
                      <div
                        key={agentKey || agent.id || idx}
                        onClick={() => { setActiveAgent(agent); setView('command'); setMessages([]); }}
                        className="group bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-[var(--radius-card)] p-0.5 cursor-pointer transition-all hover:shadow-[0_0_12px_rgba(147,51,234,0.1)] flex flex-col"
                      >
                        <div className="bg-[var(--color-bg-secondary)] rounded-t-lg p-2 border-b border-[var(--color-border)] group-hover:bg-[var(--color-hover)] transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full ${c.bg} border ${c.border} flex items-center justify-center shadow-[0_0_10px_${c.shadow}]`}>
                                <svg className={`w-4 h-4 ${c.icon}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                  <circle cx="12" cy="7" r="4" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="text-[10px] font-bold text-[var(--color-text-primary)] leading-tight">{agent.name}</h3>
                              </div>
                            </div>
                            <div className={`w-1.5 h-1.5 rounded-full mt-1 ${agent.status === 'Deployed' ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]' : 'bg-[var(--color-text-tertiary)]'}`} />
                          </div>
                        </div>
                        <div className="px-2 py-1.5 flex-1">
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                            <Target size={9} className={`${c.icon} shrink-0`} />
                            <span className="truncate">{agent.specialization}</span>
                          </div>
                        </div>
                        <div className={`px-2 py-1.5 border-t ${c.border} flex justify-between items-center ${c.bg} rounded-b-lg`}>
                          <span className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-wider font-mono font-bold opacity-70">
                            ID: {agent.id}
                          </span>
                          <div className="text-[var(--color-text-primary)] text-[10px] font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                            Run <ArrowRight size={8} />
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>

                {/* OMEGA - Locked Card */}
                <div className="relative rounded-[var(--radius-card)] min-h-[104px] border border-red-900/40 bg-gradient-to-br from-red-950/20 via-[var(--color-bg-primary)] to-[var(--color-bg-primary)] overflow-hidden select-none shrink-0">
                  <div className="absolute inset-0 pointer-events-none" style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.02) 2px, rgba(255,0,0,0.02) 4px)',
                    zIndex: 1
                  }} />

                  <div className="relative z-10 px-4 py-2 flex items-center gap-4 border-b border-red-900/20">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-red-950/40 border-2 border-red-800/50 flex items-center justify-center shadow-[0_0_15px_rgba(127,29,29,0.35)]">
                        <Radiation className="w-6 h-6 text-red-400" />
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-600/40 border-2 border-[var(--color-bg-secondary)]" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h2 className="text-sm font-black tracking-[0.15em]" style={{ color: 'rgba(239,68,68,0.4)', textShadow: '0 0 10px rgba(239,68,68,0.3)', filter: 'blur(0.3px)' }}>
                          REDACTED
                        </h2>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-[0.2em] bg-red-950/60 text-red-400 border border-red-700/50">
                          CLASSIFIED
                        </span>
                      </div>
                      <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-[0.22em] font-bold mt-0.5">AGT-OPS-999 - REDACTED</p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-6 h-6 rounded-full bg-red-950/30 border border-red-800/30 flex items-center justify-center">
                          <Lock size={12} className="text-red-400" />
                        </div>
                        <span className="text-[8px] text-red-400 uppercase tracking-widest font-bold">Locked</span>
                      </div>
                    </div>
                  </div>
                  <div className="relative z-10 px-4 py-1 flex items-center justify-between">
                    <p className="text-[9px] text-red-400 uppercase tracking-[0.24em] font-bold">
                      REDACTED clearance required
                    </p>
                    <span className="text-[8px] text-red-400 font-mono">OMEGA-SYS // DO NOT ACCESS</span>
                  </div>
                </div>

              </div>

              {/* RIGHT - Activity Panel (Monitors & Lightbars) */}
              <div className="flex-1 w-1/2 flex flex-col overflow-hidden bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] shadow-sm">
                
                {/* TOP: COMMAND MONITORS */}
                <div className="h-[45%] flex gap-2 p-2 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/30">
                  
                  {/* USER MONITOR */}
                  <div className="flex-1 flex flex-col bg-[#0a0a0d] rounded-[var(--radius-card)] border border-white/10 overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.35)] relative">
                    <div className="absolute inset-0 pointer-events-none opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.08) 1px, rgba(255,255,255,0.08) 2px)', backgroundSize: '100% 2px' }}></div>
                    <div className="relative z-10 bg-black/40 border-b border-white/10 p-2 flex items-center justify-center gap-2 text-white/80 font-mono text-[9px] uppercase tracking-widest">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-[0_0_5px_rgba(255,255,255,0.4)] animate-pulse"></div>
                      ADMIN
                    </div>
                    <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
                      <div className="grid grid-cols-[52px_1fr_1fr_1fr_58px] gap-2 text-[8px] font-mono text-white/40 uppercase tracking-[0.22em] px-1 pb-1">
                        <span>TIME</span>
                        <span>SOURCE</span>
                        <span>ACTION</span>
                        <span>TARGET</span>
                        <span className="text-right">STATE</span>
                      </div>
                      {adminEvents.map(event => (
                        <div key={event.id} className="grid grid-cols-[52px_1fr_1fr_1fr_58px] gap-2 text-[9px] font-mono text-white/80 px-1 py-1 border-t border-white/5">
                          <span className="text-white/40">{event.time}</span>
                          <span className="truncate">{event.source}</span>
                          <span className="truncate">{event.action}</span>
                          <span className="truncate text-white/70">{event.target}</span>
                          <span className="text-right text-white/50">{event.status}</span>
                        </div>
                      ))}
                      {adminEvents.length === 0 && (
                        <div className="text-[9px] font-mono text-white/40 p-2 text-center">AWAITING COMMANDS...</div>
                      )}
                    </div>
                  </div>

                  {/* CHARLIE MONITOR */}
                  <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)] dark:bg-[#0a0a14] rounded-[var(--radius-card)] border border-blue-500/20 overflow-hidden shadow-[inset_0_0_20px_rgba(59,130,246,0.03)] relative">
                    <div className="relative z-10 bg-blue-950/40 border-b border-blue-500/20 p-2 flex items-center justify-center gap-2 text-blue-400 font-mono text-[9px] uppercase tracking-widest">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)] animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                      CHARLIE INTAKE
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)] animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                    <div className="flex-1 p-2 space-y-1 overflow-y-auto">
                      {charlieEvents.map(event => (
                        <div key={event.id} className="flex items-center gap-2 text-[8px] font-mono text-blue-400 border border-blue-500/20 bg-blue-900/10 p-1.5 rounded">
                          <span className="text-blue-300/60">[{event.time}]</span>
                          <span className="uppercase">{event.source}</span>
                          <span className="text-blue-300/50">-&gt;</span>
                          <span className="uppercase">{event.target}</span>
                          <span className="text-blue-300/50">|</span>
                          <span className="uppercase truncate">{event.action}</span>
                          <span className="ml-auto text-blue-300/60">{event.status}</span>
                        </div>
                      ))}
                      {charlieEvents.length === 0 && <div className="text-[8px] font-mono text-blue-500/40 p-2 text-center">NO ACTIVE INTAKE</div>}
                    </div>
                   </div>

                   {/* ALPHA MONITOR */}
                  <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)] dark:bg-[#0a140a] rounded-[var(--radius-card)] border border-green-500/20 overflow-hidden shadow-[inset_0_0_20px_rgba(34,197,94,0.03)] relative">
                    <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, #166534 1px, #166534 2px)', backgroundSize: '100% 2px' }}></div>
                    <div className="relative z-10 bg-green-950/40 border-b border-green-500/20 p-2 flex items-center justify-center gap-2 text-green-400 font-mono text-[9px] uppercase tracking-widest">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.8)] animate-pulse" style={{ animationDelay: '0.7s' }}></div>
                      ALPHA
                    </div>
                    <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                      {alphaEvents.map(event => (
                        <div key={event.id} className="flex items-center gap-2 text-[8px] font-mono text-green-400 border border-green-500/20 bg-green-900/10 p-1.5 rounded">
                          <span className="text-green-300/60">[{event.time}]</span>
                          <span className="uppercase">{event.source}</span>
                          <span className="text-green-300/50">-&gt;</span>
                          <span className="uppercase">{event.target}</span>
                          <span className="text-green-300/50">|</span>
                          <span className="uppercase truncate">{event.action}</span>
                          <span className="ml-auto text-green-300/60">{event.status}</span>
                        </div>
                      ))}
                      {alphaEvents.length === 0 && <div className="text-[8px] font-mono text-green-500/40 p-2 text-center">NO ACTIVE EXECUTION</div>}
                    </div>
                  </div>
                </div>

                {/* BOTTOM: SPECIALIST LIGHTBARS */}
                <div className="h-[55%] flex flex-col relative px-4 py-2">
                  <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-bg-primary)]/60 to-[var(--color-bg-primary)]/10 z-0 pointer-events-none"></div>
                  
                  <div className="relative z-10 flex items-center justify-between mb-2 shrink-0">
                    <h3 className="text-[9px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)] font-bold flex items-center gap-2">
                      <Activity size={10} className="text-blue-500" /> Execution Stream
                    </h3>
                  </div>

                  <div className="relative z-10 flex-1 flex flex-col justify-between overflow-hidden">
                    {executionRoutes.length > 0 ? (
                      executionRoutes.map((route, i) => {
                        const animDur = 1.4 + (i % 4) * 0.35;
                        return (
                          <div key={route.id} className="flex items-center gap-3 py-1 group shrink-0">
                            <div className="w-16 text-[8px] font-black text-[var(--color-text-secondary)] uppercase tracking-[0.15em] text-right group-hover:text-[var(--color-text-primary)] transition-colors shrink-0">
                              {route.source}
                            </div>
                            <div className="flex-1 h-2 rounded-full relative overflow-hidden border border-[var(--color-border)]/60 dark:border-white/5 bg-[var(--color-bg-primary)]/70 dark:bg-black/60 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]">
                              <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-50"></div>
                              <div
                                className="absolute top-0 bottom-0 w-2 bg-blue-500/90 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)] route-flow"
                                style={{ animationDuration: `${animDur}s` }}
                              />
                            </div>
                            <div className="w-16 text-[8px] font-black text-[var(--color-text-secondary)] uppercase tracking-[0.15em] text-left group-hover:text-[var(--color-text-primary)] transition-colors shrink-0">
                              {route.target}
                            </div>
                            <div className="w-16 text-[8px] font-mono tracking-wider text-blue-400 shrink-0 text-right">
                              {route.status}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-[9px] uppercase tracking-[0.3em] text-[var(--color-text-tertiary)] font-bold">
                        No active routes
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

        {/* COMMAND VIEW (Detail/Chat) */}
        {view === 'command' && activeAgent && (
          <div className="flex-1 flex overflow-hidden">
             {/* Left: Intel / Config */}
             <div className="w-80 border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]/50 flex flex-col">
                <div className="p-6 border-b border-[var(--color-border)]">
                   <h3 className="text-2xl font-bold text-[var(--color-text-primary)] uppercase tracking-tight">{activeAgent.name}</h3>
                   <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-purple-900/30 border border-purple-500/30 text-purple-400 text-[10px] font-bold uppercase rounded-full">{activeAgent.rank}</span>
                      <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest opacity-60">{activeAgent.model}</span>
                   </div>
                   <div className="mt-6">
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-black mb-2 opacity-70">Registry Mapping</label>
                      <select
                        value={activeAgent.registryKey || activeAgent.name}
                        onChange={(e) => updateAgentRegistryKey(activeAgent.id, e.target.value)}
                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-[10px] font-bold text-[var(--color-text-primary)] uppercase tracking-wider focus:outline-none focus:border-[var(--color-primary)]/50"
                      >
                        {Object.keys(SPECIALIST_REGISTRY).filter((key) => SPECIALIST_REGISTRY[key].visibility !== 'hidden').map((key) => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                   </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                   {/* Directive */}
                   <div>
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Terminal size={14} className="text-purple-500" /> Execution Directive
                      </h4>
                      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] p-4 text-[11px] text-gray-300 font-mono leading-relaxed shadow-inner">
                         DESIGNATED AS {activeAgent.rank} SPECIALIST. PRIMARY CAPABILITY: {activeAgent.specialization}. 
                         EXECUTE WITH MAXIMUM PRECISION.
                      </div>
                   </div>

                   {/* Subordinates */}
                   <div>
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Layers size={14} className="text-blue-500" /> Chain of Command
                      </h4>
                      {activeAgent.subordinates && activeAgent.subordinates.length > 0 ? (
                         <div className="grid gap-2">
                            {activeAgent.subordinates.map(subId => {
                               const sub = agents.find(a => a.id === subId);
                               return (
                                  <div key={subId} className="flex items-center gap-3 bg-[var(--color-bg-primary)] border border-[var(--color-border)] p-2 rounded-[var(--radius-card)] hover:border-blue-500/30 transition-colors">
                                     <div className="w-6 h-6 rounded-full bg-blue-900/20 border border-blue-500/20 flex items-center justify-center text-[10px] font-black text-blue-400">{sub?.name?.charAt(0)}</div>
                                     <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">{sub?.name}</span>
                                  </div>
                               )
                            })}
                         </div>
                      ) : (
                         <div className="text-[10px] text-gray-600 italic p-3 border border-dashed border-[var(--color-border)] rounded-lg text-center font-bold">NO SUBORDINATES IN CHAIN</div>
                      )}
                   </div>

                   {/* Tools */}
                   <div>
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Cpu size={14} className="text-yellow-500" /> Assigned Tools
                      </h4>
                      <div className="flex flex-wrap gap-2">
                         {(SPECIALIST_REGISTRY[activeAgent?.registryKey || activeAgent?.name]?.tools || []).map((tool) => (
                           <span
                             key={tool}
                             className="px-3 py-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-full text-[9px] font-bold text-gray-400 uppercase tracking-wider"
                           >
                             {tool}
                           </span>
                         ))}
                      </div>
                   </div>
                </div>
             </div>

             {/* Center: Mission Control (Chat) */}
             <div className="flex-1 flex flex-col bg-[var(--color-bg-tertiary)]/30 backdrop-blur-sm relative overflow-hidden">
                <div className="p-5 border-b border-[var(--color-border)]/50 flex items-center justify-between bg-[var(--color-bg-primary)]/20">
                  <div>
                    <h4 className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest">Command Console</h4>
                    <p className="text-[11px] text-[var(--color-text-secondary)] font-medium mt-0.5">Direct link to {activeAgent.name}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openDraftInFlowBuilder(activeAgent)}
                      className="btn-primary-skeuo !text-[10px] !px-4 !py-2"
                    >
                      Draft Flow
                    </button>
                    <button
                      onClick={() => openDraftInFlowBuilder(activeAgent)}
                      className="btn-secondary !text-[10px] !px-4 !py-2"
                    >
                      Open Builder
                    </button>
                  </div>
                </div>

                {/* Chat Feed */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                   {messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                         <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                            <div className={`flex items-center gap-2 mb-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                               <span className={`text-[9px] font-black uppercase tracking-widest ${msg.role === 'user' ? 'text-purple-400' : 'text-brass'}`}>
                                  {msg.role === 'user' ? 'OPERATOR' : msg.rank}
                               </span>
                               {msg.chain ? (
                                 <span className="text-[9px] uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-50 px-2 border-l border-[var(--color-border)] font-mono">
                                   {msg.chain}
                                 </span>
                               ) : null}
                               <span className="text-[8px] text-gray-600 font-mono tracking-tighter">[{msg.timestamp}]</span>
                            </div>
                            <div className={`p-5 rounded-[var(--radius-panel)] text-sm leading-relaxed shadow-island ${
                               msg.role === 'user' 
                               ? 'bg-purple-900/10 border border-purple-500/40 text-purple-100 rounded-tr-none' 
                               : 'bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-gray-300 rounded-tl-none border-t-white/10'
                            }`}>
                               {msg.content}
                            </div>
                         </div>
                      </div>
                   ))}
                </div>

                {/* Input Area */}
                <div className="p-5 border-t border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/40 backdrop-blur-xl">
                   <div className="relative group">
                      <input 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        type="text" 
                        placeholder="Send command..." 
                        className="w-full bg-[var(--color-bg-primary)]/70 dark:bg-black/40 border border-[var(--color-border)] rounded-[var(--radius-card)] pl-5 pr-14 py-5 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] dark:placeholder-gray-600 focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20 font-mono uppercase tracking-wider transition-all"
                      />
                      <button 
                        onClick={handleSendMessage}
                        className="absolute right-3 top-3 p-3 btn-primary-skeuo !rounded-lg"
                      >
                         <ArrowRight size={18} />
                      </button>
                   </div>
                   <div className="flex justify-between items-center mt-4 px-1">
                      <div className="flex gap-6">
                         <button className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] flex items-center gap-2 transition-colors"><UploadCloud size={14} className="text-blue-500"/> Upload Brief</button>
                         <button className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] flex items-center gap-2 transition-colors"><Workflow size={14} className="text-yellow-500"/> Link Flow</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-[8px] text-gray-600 font-mono font-bold tracking-widest uppercase">Channel: Encrypted-Alpha-01</span>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIOAgentsModule;
