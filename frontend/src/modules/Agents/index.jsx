import React, { useState, useEffect } from 'react';
import { Play, Pause, Edit2, Trash2, Plus, Settings, MessageSquare, Bot, Target, Users, ArrowRight, Terminal, Layers, Cpu, ShieldCheck, UploadCloud, Workflow } from 'lucide-react';
import { mockSupabase } from '../../services/mockSupabase';
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

  useEffect(() => {
    // Fetch agents from mock DB
    mockSupabase.from('aio_agents').select().then(({ data }) => setAgents(data));
  }, []);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    setMessages([...messages, { role: 'user', content: chatInput, timestamp: 'Now' }]);
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: `[Mock AI Response for "${chatInput}"]`, timestamp: 'Now', rank: activeAgent?.rank || 'AI' }]);
    }, 1000);
    setChatInput('');
  };

  const updateAgentRegistryKey = (agentId, registryKey) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId ? { ...agent, registryKey, name: registryKey } : agent
      )
    );
    if (activeAgent?.id === agentId) {
      setActiveAgent((prev) => ({ ...prev, registryKey, name: registryKey }));
    }
  };

  const openDraftInFlowBuilder = (agent) => {
    const draft = flowDraftRepository.createDraftFromAgent(agent, `Draft from ${agent.name}`);
    flowDraftRepository.setActiveDraft(draft.id);
    window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'flows', flowId: null } }));
  };

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] font-sans selection:bg-purple-900/50">
      <ModuleHeader
        title="AIO Command Center"
        titleIcon={Bot}
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
        
        {/* BARRACKS VIEW (Agent List) */}
        {view === 'barracks' && (
          <div className="flex-1 p-8 overflow-y-auto">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {agents.map(agent => (
                  <div 
                    key={agent.id} 
                    onClick={() => { setActiveAgent(agent); setView('command'); setMessages([]); }}
                    className="group bg-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-xl p-1 relative cursor-pointer transition-all hover:shadow-[0_0_20px_rgba(147,51,234,0.1)]"
                  >
                     {/* "Holographic" Header */}
                     <div className="bg-[var(--color-bg-primary)] rounded-t-lg p-4 border-b border-[var(--color-border)] group-hover:bg-[var(--color-hover)] transition-colors">
                        <div className="flex items-start justify-between mb-3">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-center text-xs font-bold text-[var(--color-text-primary)]">
                                 {agent.name?.slice(0, 2)}
                              </div>
                              <div>
                                 <h3 className="text-lg font-bold text-white leading-tight">{agent.name}</h3>
                                 <p className="text-xs text-gray-500 font-mono">{agent.model}</p>
                              </div>
                           </div>
                           <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                              agent.rank === 'General' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 
                              agent.rank === 'SpecOps' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                              'bg-gray-800 text-gray-400 border-gray-700'
                           }`}>
                              {agent.rank}
                           </div>
                           <div className={`w-2 h-2 rounded-full ${agent.status === 'Deployed' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-[var(--color-text-tertiary)]'}`}></div>
                        </div>
                     </div>
                     
                     {/* Body */}
                     <div className="p-4 space-y-4">
                        <div className="flex items-center gap-3 text-sm text-gray-400">
                           <Target size={16} className="text-purple-500" />
                           <span>{agent.specialization}</span>
                        </div>
                        {agent.subordinates && agent.subordinates.length > 0 && (
                           <div className="flex items-center gap-3 text-sm text-gray-400">
                              <Users size={16} className="text-blue-500" />
                              <span>{agent.subordinates.length} Sub-ordinates</span>
                           </div>
                        )}
                     </div>

                     {/* Footer Actions */}
                     <div className="p-3 border-t border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-primary)]/50 rounded-b-lg">
                        <span className="text-[10px] text-gray-600 uppercase tracking-wider font-bold">ID: AGT-{agent.id}00X</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDraftInFlowBuilder(agent);
                            }}
                            className="text-[10px] px-2 py-1 rounded bg-[var(--color-primary)] text-white hover:opacity-90"
                          >
                            Draft Flow
                          </button>
                          <div className="text-purple-400 text-xs font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                             Command <ArrowRight size={12} />
                          </div>
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        )}

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
                        {Object.keys(SPECIALIST_REGISTRY).map((key) => (
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
