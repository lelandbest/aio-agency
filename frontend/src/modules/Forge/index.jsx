import React, { useCallback, useEffect, useRef, useState } from 'react';
import RichTextEditor from '../../components/RichTextEditor';
import {
  AudioLines,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Mic,
  Play,
  RefreshCw,
  Video,
  Vault,
  Waves,
  Volume2,
  X,
  Send,
  Loader2,
  Download,
  Copy,
  GitMerge,
  ExternalLink,
  Square,
  RotateCcw,
  FastForward,
  Pause,
  Trash2,
  CloudUpload,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Save,
  Zap,
  Bot
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { useNotice } from '../../contexts/NoticeContext';
import {
  getVaultApi,
  getBrainItemsApi,
  saveTranscriptApi,
} from '../../services/backendApi';

// --- APPLIANCE STYLES (3D TACTILE LOOK) ---
const APPLIANCE_SURFACE = "bg-[#0A0A0C] border-[#1E2024] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),_0_10px_30px_rgba(0,0,0,0.5)]";
const RECESSED_PANEL = "bg-[#060608] border-[#16181D] shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)]";
const GLOW_CYAN = "shadow-[0_0_15px_rgba(6,182,212,0.3)] border-cyan-500/40 text-cyan-400";
const GLOW_EMERALD = "shadow-[0_0_15px_rgba(16,185,129,0.3)] border-emerald-500/40 text-emerald-400";

const TRANSCRIPT_DRAFT_HTML_KEY = 'aio_transcript_editor_draft_html';
const TRANSCRIPT_DRAFT_TITLE_KEY = 'aio_transcript_editor_draft_title';

const Forge = () => {
  const { showNotice } = useNotice();
  const [loading, setLoading] = useState(true);
  const [transitState, setTransitState] = useState({
    title: '',
    transcript: '',
    executiveSummary: '',
    keyDecisions: [],
    actionItems: [],
    discussionHighlights: [],
    notesAndObservations: [],
    intentHint: '',
    purposeNote: '',
    priority: '',
    status: 'Draft',
    specialist: 'FORGE',
  });
  
  const [vaultRailItems, setVaultRailItems] = useState([]);
  const [cortexRailItems, setCortexRailItems] = useState([]);
  const [vaultExpandedCats, setVaultExpandedCats] = useState({ audio: true, video: true, images: true, documents: true });
  const [cortexExpandedCats, setCortexExpandedCats] = useState({ summaries: true, notes: true, reports: true });
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch Rail Data
  const loadForgeContext = useCallback(async () => {
    setLoading(true);
    try {
      const [vault, cortex] = await Promise.all([getVaultApi(), getBrainItemsApi()]);
      setVaultRailItems(Array.isArray(vault) ? vault : []);
      setCortexRailItems(Array.isArray(cortex) ? cortex : []);
    } catch (e) {
      showNotice({ type: 'error', message: 'Forge uplink degraded. Some data may be missing.' });
    } finally {
      setLoading(false);
    }
  }, [showNotice]);

  useEffect(() => {
    loadForgeContext();
    // Load draft from session
    const cachedTitle = sessionStorage.getItem(TRANSCRIPT_DRAFT_TITLE_KEY);
    const cachedHtml = sessionStorage.getItem(TRANSCRIPT_DRAFT_HTML_KEY);
    if (cachedTitle || cachedHtml) {
      setTransitState(s => ({ ...s, title: cachedTitle || 'Untitled Session', transcript: cachedHtml || '' }));
    }
  }, [loadForgeContext]);

  // CATEGORY HELPERS
  const getVaultByCategory = (cat) => {
    const map = {
      audio: ['audio'],
      video: ['video'],
      images: ['image'],
      documents: ['script', 'runOfShow', 'publish'],
      transcripts: ['transcript'],
      website: ['website']
    };
    return vaultRailItems.filter(item => (map[cat] || []).includes(item.mediaType || item.type || item.artifactType));
  };

  const getCortexByCategory = (cat) => {
    const map = {
      summaries: ['summary', 'brief'],
      notes: ['note', 'observation'],
      reports: ['report', 'analysis'],
      strategies: ['strategy', 'plan'],
      operations: ['operation', 'manual'],
      other: ['other', 'general']
    };
    return cortexRailItems.filter(item => (map[cat] || []).includes(item.category?.toLowerCase()));
  };

  const handleSaveDraft = () => {
    sessionStorage.setItem(TRANSCRIPT_DRAFT_TITLE_KEY, transitState.title);
    sessionStorage.setItem(TRANSCRIPT_DRAFT_HTML_KEY, transitState.transcript);
    showNotice({ type: 'success', message: 'Forge session cached locally.' });
  };

  const handlePushToCortex = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = { ...transitState, status: 'Pushed' };
      const res = await saveTranscriptApi(payload);
      if (res) {
        setTransitState(s => ({ ...s, status: 'Pushed' }));
        showNotice({ type: 'success', message: 'Cognitive load committed to Cortex.' });
      }
    } catch (e) {
      showNotice({ type: 'error', message: 'Uplink failed. Retain local draft.' });
    } finally {
      setSaving(false);
    }
  };

  const RailHeader = ({ title, icon: Icon, colorClass }) => (
    <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-black/40">
      <div className="flex items-center gap-2">
        <Icon size={14} className={colorClass} />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/90">{title}</span>
      </div>
      <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
    </div>
  );

  const CategoryToggle = ({ title, count, isOpen, onToggle }) => (
    <button 
      onClick={onToggle}
      className="w-full px-4 py-2 flex items-center justify-between hover:bg-white/[0.02] transition-colors group"
    >
      <div className="flex items-center gap-2">
        {isOpen ? <ChevronDown size={10} className="text-slate-500" /> : <ChevronRight size={10} className="text-slate-500" />}
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-200">{title}</span>
      </div>
      <span className="text-[8px] font-mono text-slate-600">[{count || 0}]</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-[#070708] text-slate-300 select-none overflow-hidden font-sans">
      <ModuleHeader 
        title="Forge" 
        subtitle="3D Cognitive Assembler // Charlie → Alpha → Specialist"
        leftActions={[
          { label: 'UPLINK REFRESH', icon: RefreshCw, onClick: loadForgeContext, variant: 'secondary' }
        ]}
      />

      <div className="flex-1 flex min-h-0 relative">
        
        {/* LEFT RAIL: VAULT APPLIANCE */}
        <div className={`w-[260px] flex-shrink-0 flex flex-col border-r ${APPLIANCE_SURFACE} z-20`}>
          <RailHeader title="Mission Vault" icon={Vault} colorClass="text-emerald-400" />
          
          <div className="flex-1 overflow-y-auto no-scrollbar py-2">
            {[
              { id: 'audio', label: 'Audio Stream', icon: AudioLines },
              { id: 'video', label: 'Video Feed', icon: Video },
              { id: 'images', label: 'Imaging', icon: ImageIcon },
              { id: 'documents', label: 'Documents', icon: FileText },
              { id: 'transcripts', label: 'Symbiology', icon: Mic },
              { id: 'website', label: 'Web Artifacts', icon: Globe }
            ].map(cat => {
              const items = getVaultByCategory(cat.id);
              return (
                <div key={cat.id} className="mb-1">
                  <CategoryToggle 
                    title={cat.label} 
                    count={items.length} 
                    isOpen={vaultExpandedCats[cat.id]}
                    onToggle={() => setVaultExpandedCats(s => ({ ...s, [cat.id]: !s[cat.id] }))}
                  />
                  {vaultExpandedCats[cat.id] && (
                    <div className="px-2 pb-2 space-y-1">
                      {items.map(item => (
                        <div 
                          key={item.assetId} 
                          className={`p-2 rounded border border-transparent hover:border-white/10 hover:bg-white/[0.03] cursor-pointer group transition-all translate-x-0 active:scale-[0.98] active:translate-y-0.5`}
                          onClick={() => {
                            setTransitState(s => ({ ...s, title: item.title, status: 'Draft' }));
                            showNotice({ type: 'info', message: `Mounted: ${item.title}` });
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black text-slate-300 truncate w-[140px] uppercase tracking-tight group-hover:text-cyan-400">{item.title}</span>
                            <item.icon size={10} className="text-slate-600 group-hover:text-cyan-500" />
                          </div>
                          <div className="flex items-center gap-2">
                             <span className="text-[6px] font-mono text-slate-600 uppercase">{new Date(item.createdAt).toLocaleDateString()}</span>
                             <span className="text-[6px] font-mono text-cyan-600 uppercase">{item.mediaType || 'RAW'}</span>
                          </div>
                        </div>
                      ))}
                      {items.length === 0 && (
                        <div className="px-4 py-2 text-[7px] font-mono text-white/5 uppercase tracking-widest italic">No Data Signal...</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER: THE FORGE WORKBENCH */}
        <div className="flex-1 flex flex-col min-w-0 bg-black/60 relative p-4 gap-4 overflow-hidden">
          
          {/* TOP BAR / TITLE */}
          <div className={`${APPLIANCE_SURFACE} p-4 rounded-xl flex items-center justify-between border`}>
             <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                   <Cpu size={20} className="animate-pulse" />
                </div>
                <div>
                   <input 
                      value={transitState.title}
                      onChange={(e) => setTransitState(s => ({ ...s, title: e.target.value }))}
                      className="bg-transparent border-none text-xl font-black uppercase tracking-tighter text-white focus:outline-none w-[400px]"
                      placeholder="NEW FORGE SESSION..."
                   />
                   <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest leading-none">POSTURE // {transitState.status}</span>
                      <span className="text-[9px] font-mono text-slate-700 leading-none">// {new Date().toLocaleTimeString()}</span>
                   </div>
                </div>
             </div>
             
             <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsEditorFullscreen(true)}
                  className="h-9 px-4 rounded border border-white/10 text-slate-400 text-[10px] font-black hover:bg-white/5 hover:text-white transition-all uppercase tracking-widest"
                >
                  Focus Mode
                </button>
             </div>
          </div>

          {/* MAIN EDITOR APPLIANCE */}
          <div className={`flex-1 flex flex-col min-h-0 rounded-2xl border ${RECESSED_PANEL} overflow-hidden`}>
             <div className="bg-black/40 border-b border-white/5 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="flex items-center gap-1.5 grayscale opacity-50">
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                      <div className="h-2 w-2 rounded-full bg-yellow-500" />
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                   </div>
                   <span className="text-[8px] font-mono text-slate-500 uppercase tracking-[0.4em]">Cognitive Core // Active</span>
                </div>
                <div className="flex items-center gap-3">
                   <div className="h-1 w-20 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-cyan-500 w-[65%] animate-pulse" />
                   </div>
                   <span className="text-[8px] font-mono text-cyan-500/80 uppercase">Buffer: 65%</span>
                </div>
             </div>
             <div className="flex-1 overflow-hidden">
                <RichTextEditor 
                  value={transitState.transcript}
                  onChange={(val) => setTransitState(s => ({ ...s, transcript: val }))}
                  minHeight="100%"
                  tools="full"
                />
             </div>
          </div>
        </div>

        {/* RIGHT RAIL: CORTEX INTELLIGENCE */}
        <div className={`w-[320px] flex-shrink-0 flex flex-col border-l ${APPLIANCE_SURFACE} z-20`}>
          <RailHeader title="Cortex™ Intelligence" icon={Bot} colorClass="text-cyan-400" />
          
          <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-6">
            
            {/* SPECIALIST ROUTE (APPLIANCE STYLE) */}
            <div className={`p-4 rounded-xl border ${RECESSED_PANEL} space-y-3`}>
               <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                  <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Routing Schema</span>
                  <Zap size={12} className="text-amber-500" />
               </div>
               
               <div>
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-2">TARGET SPECIALIST</label>
                  <select
                    value={transitState.specialist}
                    onChange={(e) => setTransitState(s => ({ ...s, specialist: e.target.value }))}
                    className="w-full bg-black border border-[#2A2D35] text-white text-[10px] font-black uppercase p-2.5 rounded focus:border-cyan-500/50 outline-none transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] cursor-pointer"
                  >
                    <option value="FORGE">FORGE (CONTENTS + ARTIFACTS)</option>
                    <option value="GHOST">GHOST (CODE + TECHNICAL)</option>
                    <option value="OMEGA">OMEGA (GOVERNANCE + DNA)</option>
                  </select>
                  <div className="mt-2 p-2 bg-cyan-500/5 border border-cyan-500/10 rounded flex items-center gap-2">
                     <span className="text-[7px] font-mono text-cyan-400/80 uppercase">Uplink: Charlie → Alpha → {transitState.specialist}</span>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">INTENT</label>
                    <select
                      value={transitState.intentHint}
                      onChange={(e) => setTransitState(s => ({ ...s, intentHint: e.target.value }))}
                      className="w-full bg-black/60 border border-[#2A2D35] text-[9px] text-white p-2 rounded focus:border-cyan-500/30 outline-none uppercase font-black"
                    >
                      <option value="">AUTO</option>
                      <option value="MEETING">MEETING</option>
                      <option value="DOC">DOC</option>
                      <option value="CODE">CODE</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">PRIORITY</label>
                    <select
                      value={transitState.priority}
                      onChange={(e) => setTransitState(s => ({ ...s, priority: e.target.value }))}
                      className="w-full bg-black/60 border border-[#2A2D35] text-[9px] text-white p-2 rounded focus:border-cyan-500/30 outline-none uppercase font-black"
                    >
                      <option value="">NORMAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>
               </div>
            </div>

            {/* CORTEX ITEMS */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Knowledge Feed</span>
              </div>
              <div className="space-y-1">
                {[
                  { id: 'summaries', label: 'Summaries' },
                  { id: 'reports', label: 'Analysis Reports' },
                  { id: 'strategies', label: 'Tactical Strategies' }
                ].map(cat => {
                  const items = getCortexByCategory(cat.id);
                  return (
                    <div key={cat.id}>
                      <CategoryToggle 
                        title={cat.label} 
                        count={items.length} 
                        isOpen={cortexExpandedCats[cat.id]}
                        onToggle={() => setCortexExpandedCats(s => ({ ...s, [cat.id]: !s[cat.id] }))}
                      />
                      {cortexExpandedCats[cat.id] && (
                        <div className="px-2 pb-2 space-y-1 mt-1">
                           {items.map(item => (
                             <div 
                                key={item.id}
                                className="p-2.5 rounded bg-white/[0.01] border border-white/5 hover:border-cyan-500/30 transition-all cursor-pointer group"
                                onClick={() => showNotice({ type: 'info', message: `Reference Loaded: ${item.title}` })}
                             >
                                <div className="text-[9px] font-black text-slate-200 uppercase tracking-tight mb-1 group-hover:text-cyan-400">{item.title}</div>
                                <div className="text-[8px] text-slate-500 line-clamp-2 leading-relaxed font-mono">{item.content_excerpt || item.content}</div>
                             </div>
                           ))}
                           {items.length === 0 && (
                             <div className="px-4 py-3 text-[7px] font-mono text-white/5 uppercase tracking-[0.3em] text-center border border-dashed border-white/5 rounded-lg">Void Cluster</div>
                           )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ACTION BUTTONS (FORGE APPLIANCE) */}
          <div className="p-4 border-t border-white/5 bg-black/40 space-y-3">
             <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => showNotice({ type: 'info', message: 'Cognitive run triggered...' })}
                  className={`h-11 rounded-lg border-2 ${GLOW_EMERALD} bg-emerald-500/5 hover:bg-emerald-500/10 transition-all text-[11px] font-black uppercase tracking-[0.1em] flex items-center justify-center gap-2 translate-y-0 active:translate-y-1 active:shadow-none shadow-[0_4px_0_rgba(16,185,129,0.3)]`}
                >
                  <Cpu size={16} /> FORGE
                </button>
                <button 
                  onClick={handleSaveDraft}
                  className={`h-11 rounded-lg border-2 border-white/10 bg-white/5 hover:bg-white/10 transition-all text-[11px] font-black uppercase tracking-[0.1em] text-white flex items-center justify-center gap-2 translate-y-0 active:translate-y-1 active:shadow-none shadow-[0_4px_0_rgba(255,255,255,0.05)]`}
                >
                  <Save size={16} /> SAVE
                </button>
             </div>
             <button 
                onClick={handlePushToCortex}
                disabled={saving}
                className={`w-full h-12 rounded-lg border-2 ${GLOW_CYAN} bg-cyan-500/10 hover:bg-cyan-500/20 transition-all text-[12px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 translate-y-0 active:translate-y-1 active:shadow-none shadow-[0_5px_0_rgba(6,182,212,0.3)] disabled:opacity-50`}
             >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Bot size={18} />} PUSH TO CORTEX
             </button>
          </div>
        </div>

        {/* FULLSCREEN EDITOR OVERLAY */}
        {isEditorFullscreen && (
          <div className="fixed inset-0 z-[100] bg-[#070708] flex flex-col p-8 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
               <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                     <Cpu size={24} className="animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{transitState.title || 'FORGE SESSION'}</h2>
                    <p className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-[0.5em]">Cognitive Focus // Area 51 Isolation</p>
                  </div>
               </div>
               <button 
                  onClick={() => setIsEditorFullscreen(false)}
                  className="h-12 px-8 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all flex items-center gap-3 text-[12px] font-black uppercase tracking-widest shadow-xl"
               >
                  DISENGAGE FOCUS <X size={18} />
               </button>
            </div>
            <div className={`flex-1 rounded-3xl overflow-hidden border-4 border-white/5 ${RECESSED_PANEL}`}>
               <RichTextEditor 
                  value={transitState.transcript}
                  onChange={(val) => setTransitState(s => ({ ...s, transcript: val }))}
                  minHeight="100%"
                  tools="full"
               />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Forge;
