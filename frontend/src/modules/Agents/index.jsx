import React, { useState, useEffect } from 'react';
import { Play, Pause, Edit2, Trash2, Plus, Settings, MessageSquare, Bot, Target, Users, ArrowRight, Terminal, Layers, Cpu, ShieldCheck, UploadCloud, Workflow, Activity } from 'lucide-react';
import { mockSupabase } from '../../services/mockSupabase';
import { getAiAgentsApi, getAiRunsApi, runAiCommandApi } from '../../services/backendApi';
import ModuleHeader from '../../components/ModuleHeader';
import flowDraftRepository from '../Flows/utils/flowDraftRepository';
import { SPECIALIST_REGISTRY } from './data/agentRegistry';

// 8. AIO AGENTS MODULE
const AIOAgentsModule = () => {
  const [activeAgent, setActiveAgent] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your configured agent. How can I help?' }
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
     <div className="h-full flex flex-col bg-[var(--color-bg-tertiary)] rounded-2xl text-[var(--color-text-primary)] font-sans selection:bg-purple-900/50 overflow-hidden shadow-lg border border-[var(--color-border)]">
      <ModuleHeader
        title="AIO Command Center"
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
            label: 'Recruit Agent',
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
          const subRuns = aiRuns.filter(r => r.agent_role && !['ALPHA', 'CHARLIE'].includes(r.agent_role));

          return (
            <div className="flex-1 flex gap-2 p-2 overflow-hidden relative">
              <style>{`
                @keyframes scanner-slide {
                  0% { left: 0%; transform: translateX(0); }
                  100% { left: 100%; transform: translateX(-100%); }
                }
                .agent-scanner {
                  animation: scanner-slide ease-in-out infinite alternate;
                }
              `}</style>
              {/* LEFT — Roster */}
              <div className="flex-1 w-1/2 p-3 lg:p-4 overflow-y-auto no-scrollbar border border-[var(--color-border)] rounded-2xl bg-[var(--color-bg-secondary)] flex flex-col shadow-sm">

                {/* ALPHA — Full-Width Leadership Card */}
                {alpha && (
                  <div
                    onClick={() => { setActiveAgent(alpha); setView('command'); setMessages([]); }}
                    className="group mb-3 cursor-pointer rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 via-[var(--color-bg-primary)] to-[var(--color-bg-primary)] hover:border-yellow-500/60 transition-all duration-500 overflow-hidden shrink-0 shadow-sm"
                  >
                    <div className="px-3 py-2 flex items-center gap-3 border-b border-yellow-500/10">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-yellow-500/10 border-2 border-yellow-500/40 flex items-center justify-center text-sm font-black text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]">
                          AL
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[var(--color-bg-secondary)] shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                      </div>

                      {/* Identity */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h2 className="text-sm font-black text-white tracking-wide">{alpha.name || 'ALPHA'}</h2>
                          <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-[0.2em] bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                            Commander-in-Chief
                          </span>
                        </div>
                        <p className="text-[8px] text-yellow-500/60 uppercase tracking-[0.22em] font-bold">AGT-CMD-001 · HQ</p>
                      </div>

                      {/* Action */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); openDraftInFlowBuilder(alpha); }}
                          className="text-[8px] px-2 py-1.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 transition-colors font-bold uppercase tracking-wider"
                        >
                          Draft Flow
                        </button>
                        <div className="text-yellow-400/70 text-[8px] font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          Command <ArrowRight size={8} />
                        </div>
                      </div>
                    </div>

                    {/* Subordinates */}
                    <div className="px-3 py-1.5 bg-yellow-500/5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[7px] uppercase tracking-[0.24em] text-yellow-500/50 flex items-center gap-1 mr-1">
                          <Users size={8} /> Direct ({alphaRegistry?.subordinates?.length || 0}):
                        </span>
                        {(alphaRegistry?.subordinates || []).map(key => (
                          <span
                            key={key}
                            className="px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider bg-[var(--color-bg-primary)] border border-yellow-500/10 text-yellow-500/70 hover:border-yellow-500/30 hover:text-yellow-400 transition-colors cursor-pointer"
                          >
                            {key}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Roster label */}
                <div className="mb-2 flex items-center gap-2 shrink-0">
                  <Target size={10} className="text-[var(--color-primary)]" />
                  <span className="text-[9px] font-black uppercase tracking-[0.28em] text-[var(--color-text-tertiary)]">
                    Active Roster — {regularAgents.length} Specialists
                  </span>
                </div>

                {/* Regular Agents Grid */}
                <div className="grid grid-cols-3 gap-2 mb-4 shrink-0">
                  {regularAgents.map((agent, idx) => {
                    const agentKey = agent.registryKey || agent.registry_key;
                    const colors = [
                      { bg: 'bg-blue-900/50', border: 'border-blue-600', shadow: 'rgba(59,130,246,0.15)', icon: 'text-blue-400' },
                      { bg: 'bg-purple-900/50', border: 'border-purple-600', shadow: 'rgba(168,85,247,0.15)', icon: 'text-purple-400' },
                      { bg: 'bg-pink-900/50', border: 'border-pink-600', shadow: 'rgba(236,72,153,0.15)', icon: 'text-pink-400' },
                      { bg: 'bg-red-900/50', border: 'border-red-600', shadow: 'rgba(239,68,68,0.15)', icon: 'text-red-400' },
                      { bg: 'bg-orange-900/50', border: 'border-orange-600', shadow: 'rgba(249,115,22,0.15)', icon: 'text-orange-400' },
                      { bg: 'bg-amber-900/50', border: 'border-amber-600', shadow: 'rgba(245,158,11,0.15)', icon: 'text-amber-400' },
                      { bg: 'bg-yellow-900/50', border: 'border-yellow-600', shadow: 'rgba(234,179,8,0.15)', icon: 'text-yellow-400' },
                      { bg: 'bg-lime-900/50', border: 'border-lime-600', shadow: 'rgba(132,204,22,0.15)', icon: 'text-lime-400' },
                      { bg: 'bg-green-900/50', border: 'border-green-600', shadow: 'rgba(34,197,94,0.15)', icon: 'text-green-400' },
                      { bg: 'bg-emerald-900/50', border: 'border-emerald-600', shadow: 'rgba(16,185,129,0.15)', icon: 'text-emerald-400' },
                      { bg: 'bg-teal-900/50', border: 'border-teal-600', shadow: 'rgba(20,184,166,0.15)', icon: 'text-teal-400' },
                      { bg: 'bg-cyan-900/50', border: 'border-cyan-600', shadow: 'rgba(6,182,212,0.15)', icon: 'text-cyan-400' },
                    ];
                    const c = colors[idx % colors.length];
                    return (
                    <div
                      key={agent.id}
                      onClick={() => { setActiveAgent(agent); setView('command'); setMessages([]); }}
                      className="group bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-xl p-0.5 cursor-pointer transition-all hover:shadow-[0_0_12px_rgba(147,51,234,0.1)] flex flex-col"
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
                              <h3 className="text-[10px] font-bold text-white leading-tight">{agent.name}</h3>
                              <p className="text-[8px] text-gray-500 font-mono mt-0.5">{SPECIALIST_REGISTRY[agentKey]?.role || ''}</p>
                            </div>
                          </div>
                          <div className={`w-1.5 h-1.5 rounded-full mt-1 ${agent.status === 'Deployed' ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]' : 'bg-[var(--color-text-tertiary)]'}`} />
                        </div>
                      </div>
                      <div className="px-2 py-1.5 flex-1">
                        <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
                          <Target size={9} className={`${c.icon} shrink-0`} />
                          <span className="truncate">{agent.specialization}</span>
                        </div>
                      </div>
                      <div className={`px-2 py-1.5 border-t ${c.border} flex justify-between items-center ${c.bg} rounded-b-lg`}>
                        <span className={`text-[8px] ${c.icon} uppercase tracking-wider font-mono font-bold opacity-70`}>
                          ID: {agent.id}
                        </span>
                        <div className="text-white text-[8px] font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          Command <ArrowRight size={8} />
                        </div>
                      </div>
                    </div>
                  )})}
                </div>

                {/* OMEGA — Locked Card */}
                <div className="relative rounded-xl border border-red-900/40 bg-gradient-to-br from-red-950/20 via-[var(--color-bg-primary)] to-[var(--color-bg-primary)] overflow-hidden select-none mt-auto shrink-0 mb-1">
                  <div className="absolute inset-0 pointer-events-none" style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.02) 2px, rgba(255,0,0,0.02) 4px)',
                    zIndex: 1
                  }} />

                  <div className="relative z-10 px-4 py-3 flex items-center gap-4 border-b border-red-900/20">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gray-800/40 border-2 border-gray-600/40 flex items-center justify-center shadow-[0_0_15px_rgba(156,163,175,0.15)]">
                        <svg className="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-600/40 border-2 border-[var(--color-bg-secondary)]" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h2 className="text-sm font-black tracking-[0.15em]" style={{ color: 'rgba(239,68,68,0.4)', textShadow: '0 0 10px rgba(239,68,68,0.3)', filter: 'blur(0.3px)' }}>
                          ████████
                        </h2>
                        <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-[0.2em] bg-red-950/60 text-red-400 border border-red-700/50">
                          CLASSIFIED
                        </span>
                      </div>
                      <p className="text-[8px] text-red-400 uppercase tracking-[0.22em] font-bold mt-0.5">AGT-OPS-999 · REDACTED</p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-6 h-6 rounded-full bg-red-950/30 border border-red-800/30 flex items-center justify-center">
                          <span className="text-red-400 text-xs">🔒</span>
                        </div>
                        <span className="text-[7px] text-red-400 uppercase tracking-widest font-bold">Locked</span>
                      </div>
                    </div>
                  </div>
                  <div className="relative z-10 px-4 py-2 flex items-center justify-between">
                    <p className="text-[8px] text-red-400 uppercase tracking-[0.24em] font-bold">
                      ██ ██████ clearance required
                    </p>
                    <span className="text-[7px] text-red-400 font-mono">OMEGA-SYS // DO NOT ACCESS</span>
                  </div>
                </div>

              </div>

              {/* RIGHT — Activity Panel (Monitors & Lightbars) */}
              <div className="flex-1 w-1/2 flex flex-col overflow-hidden bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl shadow-sm">
                
                {/* TOP: COMMAND MONITORS */}
                <div className="h-[45%] flex gap-2 p-3 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/30">
                  
                  {/* USER MONITOR */}
                  <div className="flex-1 flex flex-col bg-[#0a0f0a] rounded-xl border border-green-500/20 overflow-hidden shadow-[inset_0_0_20px_rgba(34,197,94,0.03)] relative">
                    <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, #166534 1px, #166534 2px)', backgroundSize: '100% 2px' }}></div>
                    <div className="relative z-10 bg-green-950/40 border-b border-green-500/20 p-2 flex items-center justify-center gap-2 text-green-400 font-mono text-[9px] uppercase tracking-widest">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.8)] animate-pulse"></div>
                      ADMIN
                    </div>
                    <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                       {userRuns.slice(0, 10).map(run => (
                          <div key={run.id} className="text-[8px] font-mono text-green-500 border border-green-500/20 bg-green-900/10 p-1.5 rounded">
                            <span className="text-green-300 opacity-60">[{new Date(run.created_at).toLocaleTimeString()}]</span> {run.intent || run.status} <span className="text-green-400/50">|</span> {run.surface}
                          </div>
                       ))}
                       {userRuns.length === 0 && <div className="text-[8px] font-mono text-green-500/40 p-2 text-center">AWAITING INPUT...</div>}
                    </div>
                  </div>

                  {/* CHARLIE MONITOR */}
                  <div className="flex-1 flex flex-col bg-[#0a0a14] rounded-xl border border-purple-500/20 overflow-hidden shadow-[inset_0_0_20px_rgba(168,85,247,0.03)] relative">
                    <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, #6b21a8 1px, #6b21a8 2px)', backgroundSize: '100% 2px' }}></div>
                    <div className="relative z-10 bg-purple-950/40 border-b border-purple-500/20 p-2 flex items-center justify-center gap-2 text-purple-400 font-mono text-[9px] uppercase tracking-widest">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_5px_rgba(192,132,252,0.8)] animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                      CHARLIE
                    </div>
                    <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                       {charlieRuns.slice(0, 10).map(run => (
                          <div key={run.id} className="text-[8px] font-mono text-purple-500 border border-purple-500/20 bg-purple-900/10 p-1.5 rounded">
                             <span className="text-purple-300 opacity-60">[{new Date(run.created_at).toLocaleTimeString()}]</span> {run.intent || run.status} <span className="text-purple-400/50">|</span> {run.field}
                          </div>
                       ))}
                       {charlieRuns.length === 0 && <div className="text-[8px] font-mono text-purple-500/40 p-2 text-center">STANDBY...</div>}
                    </div>
                  </div>

                  {/* ALPHA MONITOR */}
                  <div className="flex-1 flex flex-col bg-[#14140a] rounded-xl border border-yellow-500/20 overflow-hidden shadow-[inset_0_0_20px_rgba(234,179,8,0.03)] relative">
                    <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, #854d0e 1px, #854d0e 2px)', backgroundSize: '100% 2px' }}></div>
                    <div className="relative z-10 bg-yellow-950/40 border-b border-yellow-500/20 p-2 flex items-center justify-center gap-2 text-yellow-400 font-mono text-[9px] uppercase tracking-widest">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.8)] animate-pulse" style={{ animationDelay: '0.7s' }}></div>
                      ALPHA
                    </div>
                    <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                       {alphaRuns.slice(0, 10).map(run => (
                          <div key={run.id} className="text-[8px] font-mono text-yellow-500 border border-yellow-500/20 bg-yellow-900/10 p-1.5 rounded">
                             <span className="text-yellow-300 opacity-60">[{new Date(run.created_at).toLocaleTimeString()}]</span> {run.result || run.intent}
                          </div>
                       ))}
                       {alphaRuns.length === 0 && <div className="text-[8px] font-mono text-yellow-500/40 p-2 text-center">IDLE...</div>}
                    </div>
                  </div>
                </div>

                {/* BOTTOM: SPECIALIST LIGHTBARS */}
                <div className="h-[55%] flex flex-col relative px-4 py-3">
                  <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-bg-primary)]/60 to-[var(--color-bg-primary)]/10 z-0 pointer-events-none"></div>
                  
                  <div className="relative z-10 flex items-center justify-between mb-2 shrink-0">
                    <h3 className="text-[9px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)] font-bold flex items-center gap-2">
                      <Activity size={10} className="text-purple-500" /> Specialist Network Stream
                    </h3>
                  </div>

                  <div className="relative z-10 flex-1 flex flex-col justify-between overflow-hidden">
                    {regularAgents.map((agent, i) => {
                      const agentKey = agent.registryKey || agent.registry_key || agent.name.toUpperCase();
                      const hasActivity = subRuns.some(r => r.agent_role === agentKey);
                      // Randomize animation duration slightly so they aren't all in sync, but only calculate once per render
                      const animDur = 1.2 + (i % 5) * 0.3; 
                      
                      return (
                        <div key={agent.id} className="flex items-center gap-3 py-0.5 group">
                          <div className="w-16 text-[8px] font-black text-[var(--color-text-secondary)] uppercase tracking-[0.15em] text-right group-hover:text-[var(--color-text-primary)] transition-colors">
                            {agentKey}
                          </div>
                          <div className="flex-1 h-1.5 bg-black/60 rounded-full relative overflow-hidden border border-white/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]">
                            {hasActivity ? (
                              <div 
                                className="absolute top-0 bottom-0 w-1/4 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.8)] agent-scanner"
                                style={{ animationDuration: `${animDur}s` }}
                              />
                            ) : (
                              <div className="absolute left-0 bottom-0 top-0 w-full bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-50"></div>
                            )}
                          </div>
                          <div className={`w-10 text-[7px] font-mono tracking-wider ${hasActivity ? 'text-purple-400' : 'text-gray-600'}`}>
                            {hasActivity ? 'SYNCING' : 'IDLE'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

        {/* COMMAND VIEW (Detail/Chat) */}
        {view === 'command' && activeAgent && (
          <div className="flex-1 flex">
             {/* Left: Intel / Config */}
             <div className="w-80 border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex flex-col">
                <div className="p-6 border-b border-[var(--color-border)]">
                   <h3 className="text-2xl font-bold text-white">{activeAgent.name}</h3>
                   <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-purple-900/30 border border-purple-500/30 text-purple-400 text-[10px] font-bold uppercase rounded">{activeAgent.rank}</span>
                      <span className="text-xs text-gray-500 font-mono">{activeAgent.model}</span>
                   </div>
                   <div className="mt-3">
                      <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Remap AI Agent</label>
                      <select
                        value={activeAgent.registryKey || activeAgent.name}
                        onChange={(e) => updateAgentRegistryKey(activeAgent.id, e.target.value)}
                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)]"
                      >
                        {Object.keys(SPECIALIST_REGISTRY).filter((key) => SPECIALIST_REGISTRY[key].visibility !== 'hidden').map((key) => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                   </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                   {/* Directive */}
                   <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                         <Terminal size={14} /> Prime Directive
                      </h4>
                      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg p-3 text-xs text-gray-300 font-mono leading-relaxed">
                         You are a {activeAgent.rank} level agent specialized in {activeAgent.specialization}. 
                         Your objective is to execute workflows with precision.
                      </div>
                   </div>

                   {/* Subordinates */}
                   <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                         <Layers size={14} /> Squad (Sub-Agents)
                      </h4>
                      {activeAgent.subordinates && activeAgent.subordinates.length > 0 ? (
                         <div className="space-y-2">
                            {activeAgent.subordinates.map(subId => {
                               const sub = agents.find(a => a.id === subId);
                               return (
                                  <div key={subId} className="flex items-center gap-3 bg-[var(--color-bg-primary)] border border-[var(--color-border)] p-2 rounded-lg">
                                     <div className="w-6 h-6 rounded bg-blue-900/20 flex items-center justify-center text-[10px] font-bold text-blue-400">{sub?.name?.charAt(0)}</div>
                                     <span className="text-sm text-gray-300">{sub?.name}</span>
                                  </div>
                               )
                            })}
                         </div>
                      ) : (
                         <div className="text-xs text-gray-600 italic p-2 border border-dashed border-[var(--color-border)] rounded">No subordinates assigned.</div>
                      )}
                      <button className="mt-2 w-full py-1.5 border border-[var(--color-border)] hover:border-purple-500 text-[10px] text-gray-400 hover:text-white uppercase font-bold tracking-wider rounded transition">
                         + Assign Unit
                      </button>
                   </div>

                   {/* Tools */}
                   <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                         <Cpu size={14} /> Equipped Tools
                      </h4>
                      <div className="flex flex-wrap gap-2">
                         {(SPECIALIST_REGISTRY[activeAgent?.registryKey || activeAgent?.name]?.tools || []).slice(0, 6).map((tool) => (
                           <span
                             key={tool}
                             className="px-2 py-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[10px] text-gray-400"
                           >
                             {tool}
                           </span>
                         ))}
                         {(SPECIALIST_REGISTRY[activeAgent?.registryKey || activeAgent?.name]?.tools || []).length === 0 && (
                           <>
                             <span className="px-2 py-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[10px] text-gray-400">Web Browser</span>
                             <span className="px-2 py-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[10px] text-gray-400">Code Interpreter</span>
                             <span className="px-2 py-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[10px] text-gray-400">CRM Write Access</span>
                           </>
                         )}
                      </div>
                   </div>
                </div>
             </div>

             {/* Center: Mission Control (Chat) */}
             <div className="flex-1 flex flex-col bg-[var(--color-bg-tertiary)] relative">
                <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-widest">Agent Actions</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">Draft, compile, or run workflows</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openDraftInFlowBuilder(activeAgent)}
                      className="px-3 py-2 rounded text-xs font-semibold bg-[var(--color-primary)] text-white hover:opacity-90"
                    >
                      Compile Draft
                    </button>
                    <button
                      onClick={() => openDraftInFlowBuilder(activeAgent)}
                      className="px-3 py-2 rounded text-xs font-semibold bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-hover)]"
                    >
                      Run in Builder
                    </button>
                  </div>
                </div>
                {/* Chat Feed */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                   {messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-gray-600 opacity-50">
                         <ShieldCheck size={64} strokeWidth={1} />
                         <p className="mt-4 text-sm font-mono uppercase tracking-widest">Secure Link Established</p>
                      </div>
                   )}
                   {messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[70%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                            <div className="flex items-center gap-2 mb-1">
                               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                  {msg.role === 'user' ? 'Operator' : msg.rank}
                               </span>
                               {msg.chain ? (
                                 <span className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                                   {msg.chain}
                                 </span>
                               ) : null}
                               <span className="text-[10px] text-gray-600 font-mono">{msg.timestamp}</span>
                            </div>
                            <div className={`p-4 rounded-xl text-sm leading-relaxed ${
                               msg.role === 'user' 
                               ? 'bg-purple-900/20 border border-purple-500/30 text-purple-100 rounded-tr-none' 
                               : 'bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-gray-300 rounded-tl-none'
                            }`}>
                               {msg.content}
                            </div>
                         </div>
                      </div>
                   ))}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                   <div className="relative">
                      <input 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        type="text" 
                        placeholder="Transmit orders..." 
                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg pl-4 pr-12 py-4 text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 font-mono"
                      />
                      <button 
                        onClick={handleSendMessage}
                        className="absolute right-2 top-2 p-2 bg-purple-600 hover:bg-purple-500 text-white rounded transition"
                      >
                         <ArrowRight size={16} />
                      </button>
                   </div>
                   <div className="flex justify-between items-center mt-3 px-1">
                      <div className="flex gap-4">
                         <button className="text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-white flex items-center gap-1"><UploadCloud size={12}/> Upload Intel</button>
                         <button className="text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-white flex items-center gap-1"><Workflow size={12}/> Attach Workflow</button>
                      </div>
                      <span className="text-[10px] text-gray-600 font-mono">ENCRYPTED // CHANNEL 01</span>
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
