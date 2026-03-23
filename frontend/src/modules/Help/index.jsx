import React, { useState, useEffect, useRef } from 'react';
import { 
  GraduationCap, Search, FileText, ChevronRight, X, Bot, 
  Loader2, ArrowLeft, ExternalLink, HelpCircle, AlertCircle, 
  CheckCircle2, Info, MessageSquare, Plus, Clock, Star,
  Grid, List
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { 
  getHelpArticlesApi,
  getHelpBroadcastsApi, 
  getHelpTicketsApi, 
  createHelpTicketApi 
} from '../../services/backendApi';

const HelpModule = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [aiActive, setAiActive] = useState(false);
  const [checkingAi, setCheckingAi] = useState(true);
  const [broadcasts, setBroadcasts] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'row'

  const checkAiStatus = async () => {
    try {
      const { getAiProviderConfigsApi } = await import('../../services/backendApi');
      const configs = await getAiProviderConfigsApi();
      const isActive = configs && configs.length > 0;
      setAiActive(isActive);
    } catch (err) {
      console.error('Failed to check AI status:', err);
      setAiActive(false);
    } finally {
      setCheckingAi(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        getHelpArticlesApi(),
        getHelpBroadcastsApi(),
        getHelpTicketsApi()
      ]);
      
      const itemsData = results[0].status === 'fulfilled' ? results[0].value : [];
      const broadcastsData = results[1].status === 'fulfilled' ? results[1].value : [];
      const ticketsData = results[2].status === 'fulfilled' ? results[2].value : [];
      
      // Tag-driven: /api/help/articles returns only items tagged META:DOC:HELP
      const helpArticles = itemsData || [];
      setArticles(helpArticles);
      setBroadcasts(broadcastsData);
      setTickets(ticketsData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    checkAiStatus();
  }, []);

  const handleTicketSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      subject: formData.get('subject'),
      content: formData.get('content'),
      priority: formData.get('priority'),
      category: formData.get('category')
    };

    try {
      await createHelpTicketApi(payload);
      setShowTicketForm(false);
      fetchData(); // Refresh tickets
    } catch (err) {
      console.error('Failed to submit ticket:', err);
    }
  };


  if (selectedArticle) {
    return (
      <div className="h-full flex flex-col animate-in fade-in duration-300">
        <div className="mb-4 flex items-center gap-2 text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest">
          <button onClick={() => setSelectedArticle(null)} className="hover:text-[var(--color-primary)] transition-colors">HOME</button>
          <ChevronRight size={10} />
          <button onClick={() => setSelectedArticle(null)} className="hover:text-[var(--color-primary)] transition-colors">KNOWLEDGEBASE</button>
          <ChevronRight size={10} />
          <span className="text-[var(--color-text-primary)]">{selectedArticle.title}</span>
        </div>

        <div className="flex-1 bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)] overflow-hidden flex flex-col shadow-xl">
          <div className="p-8 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/30">
            <h1 className="text-3xl font-black text-[var(--color-text-primary)] uppercase tracking-tight mb-2">
              {selectedArticle.title}
            </h1>
            <div className="flex items-center gap-4 text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest">
              <span>Last Updated: {new Date(selectedArticle.updated_at || selectedArticle.created_at).toLocaleDateString()}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Star size={10} className="text-amber-400" /> Rated 5/5</span>
            </div>
          </div>

          <div className="flex-1 p-10 overflow-auto no-scrollbar">
            <div className="max-w-4xl mx-auto prose prose-invert font-medium leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap text-lg">
              {selectedArticle.content?.split(/(!\[.*?\]\(.*?\))/g).map((part, index) => {
                const match = part.match(/!\[(.*?)\]\((.*?)\)/);
                if (match) {
                  return (
                    <div key={index} className="my-8 rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-black/20">
                      <img src={match[2]} alt={match[1]} className="w-full h-auto cursor-zoom-in hover:scale-[1.01] transition-transform duration-500" />
                      {match[1] && <div className="p-3 bg-black/40 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-t border-white/5">{match[1]}</div>}
                    </div>
                  );
                }
                return <span key={index}>{part}</span>;
              }) || "No content found for this article."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col no-scrollbar">
      {/* Breadcrumbs & Status Row */}
      <div className="mb-4 flex items-center justify-between h-5">
        <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest">
          <span className="opacity-50">Support</span>
          <ChevronRight size={10} className="opacity-30" />
          <span className="text-[var(--color-text-primary)]">Home</span>
        </div>

        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 px-3 py-1.5 rounded-full overflow-hidden">
          <span className="text-[8px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest mr-1 shrink-0">SYSTEM STATUS:</span>
          <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-widest truncate">
            AIO Neural Network
          </span>
          <div className={`ml-1 px-2 py-0.5 rounded-full text-[7px] font-black border transition-all duration-1000 ${
            aiActive 
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.4)] animate-pulse' 
            : 'bg-emerald-500/5 text-emerald-500/40 border-emerald-500/10'
          }`}>
            {aiActive ? 'ACTIVE' : 'IDLE'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto no-scrollbar space-y-2 pb-20">
        {/* Hero Section */}
        <div className="text-center space-y-2 pt-2 pb-0">
          <h1 className="text-4xl font-black text-[var(--color-text-primary)] uppercase tracking-tighter leading-none">
            How can we help?
          </h1>

          <div className="max-w-2xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-[var(--color-primary)] to-sky-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
            <div className="relative bg-[var(--color-bg-secondary)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex items-center px-5 py-3">
              <Search className="text-[var(--color-text-tertiary)] mr-3" size={20} />
              <input
                type="text"
                placeholder="Search the Knowledgebase..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-md font-medium text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]/50"
              />
              <button
                onClick={() => aiActive && console.log('Charlie triggered')}
                className={`ml-4 flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                  aiActive
                  ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20 hover:scale-105 active:scale-95'
                  : 'bg-white/5 text-[var(--color-text-tertiary)] cursor-not-allowed'
                }`}
              >
                <Bot size={14} />
                Ask Charlie
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setShowTicketForm(true)}
              className="group flex items-center gap-3 px-6 py-3 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)]/30 transition-all text-left"
            >
              <Plus size={16} className="text-[var(--color-primary)] group-hover:scale-110 transition-transform" />
              <div>
                <div className="text-[10px] font-black text-[var(--color-text-primary)] uppercase tracking-widest">Submit Ticket</div>
              </div>
            </button>

            <button className="group flex items-center gap-3 px-6 py-3 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-sky-400/10 hover:border-sky-400/30 transition-all text-left">
              <MessageSquare size={16} className="text-sky-400 group-hover:scale-110 transition-transform" />
              <div>
                <div className="text-[10px] font-black text-[var(--color-text-primary)] uppercase tracking-widest">My Tickets</div>
              </div>
            </button>
          </div>
        </div>

        {/* Library Cards Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
             <div className="text-[11px] font-black text-[var(--color-text-primary)] uppercase tracking-[0.3em] flex items-center gap-3">
               <GraduationCap size={16} className="text-[var(--color-primary)]" />
               Knowledgebase Repository
             </div>
             <div className="flex items-center gap-6">
                <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-lg border border-white/5">
                  <button 
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-[var(--color-primary)] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Grid size={14} />
                  </button>
                  <button 
                    onClick={() => setViewMode('row')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'row' ? 'bg-[var(--color-primary)] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <List size={14} />
                  </button>
                </div>
                <div className="text-[9px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest opacity-50">
                  {articles.length} Intel Modules
                </div>
             </div>
          </div>          
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,225px)] justify-center gap-8">
              {articles.filter(a => 
                (a.title || '').toLowerCase().includes(searchQuery.toLowerCase())
              ).map(item => (
                <div 
                  key={item.id}
                  onClick={() => setSelectedArticle(item)}
                  className="group relative w-[225px] h-[225px] rounded-[2rem] bg-white/[0.02] border border-white/5 p-6 hover:bg-white/[0.04] hover:border-sky-500/30 transition-all duration-500 cursor-pointer overflow-hidden shadow-2xl hover:shadow-sky-500/10"
                >
                  {/* Visual Accent */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 blur-[40px] -mr-12 -mt-12 group-hover:bg-sky-500/15 transition-all duration-700" />
                  
                  <div className="relative h-full flex flex-col items-center justify-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform duration-500 shadow-lg shrink-0">
                      <GraduationCap size={22} />
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="text-[11px] font-black text-white uppercase tracking-widest leading-relaxed line-clamp-2">
                        {item.title || "Untitled Intelligence"}
                      </h3>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[7px] font-bold text-sky-500/60 uppercase tracking-widest">Intel Module</span>
                        <div className="w-6 h-0.5 bg-sky-500/20 rounded-full group-hover:w-10 group-hover:bg-sky-500/40 transition-all duration-700" />
                      </div>
                    </div>

                    <div className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-sky-400/70 transition-colors">
                      Open Pathway
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 max-w-6xl mx-auto">
              {articles.filter(a => 
                (a.title || '').toLowerCase().includes(searchQuery.toLowerCase())
              ).map(item => (
                <div 
                  key={item.id}
                  onClick={() => setSelectedArticle(item)}
                  className="group flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-sky-500/30 transition-all duration-300 cursor-pointer shadow-lg"
                >
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform duration-300 shrink-0">
                    <GraduationCap size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[11px] font-black text-white uppercase tracking-widest group-hover:text-sky-400 transition-colors truncate">
                      {item.title || "Untitled Intelligence"}
                    </h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[7px] font-bold text-sky-500/60 uppercase tracking-widest">Intel Module</span>
                      <span className="text-[7px] font-medium text-slate-500 uppercase tracking-widest">ID: {item.id.slice(0, 8)}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-600 group-hover:text-sky-400 group-hover:translate-x-1 transition-all shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ticket Modal */}
      {showTicketForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowTicketForm(false)} />
          <div className="relative w-full max-w-xl bg-[#0f172a] rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-white/5 bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Submit a Ticket</h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Direct Support Protocol</p>
                </div>
                <button onClick={() => setShowTicketForm(false)} className="text-slate-500 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={handleTicketSubmit} className="p-8 space-y-6 overflow-auto no-scrollbar">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Subject</label>
                <input
                  name="subject"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-white focus:border-[var(--color-primary)]/50 focus:bg-white/10 outline-none transition-all font-medium"
                  placeholder="What can we help you with?"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Category</label>
                  <select
                    name="category"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-white focus:border-[var(--color-primary)]/50 focus:bg-white/10 outline-none transition-all font-medium appearance-none"
                  >
                    <option value="general">General Support</option>
                    <option value="technical">Technical Issue</option>
                    <option value="billing">Billing/Account</option>
                    <option value="feature">Feature Request</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Priority</label>
                  <select
                    name="priority"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-white focus:border-[var(--color-primary)]/50 focus:bg-white/10 outline-none transition-all font-medium appearance-none"
                  >
                    <option value="low">Low</option>
                    <option value="normal" selected>Normal</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Description</label>
                <textarea
                  name="content"
                  required
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-white focus:border-[var(--color-primary)]/50 focus:bg-white/10 outline-none transition-all font-medium resize-none"
                  placeholder="Please provide as much detail as possible..."
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full py-5 rounded-2xl bg-gradient-to-r from-[var(--color-primary)] to-sky-600 text-white font-black uppercase tracking-widest shadow-xl shadow-[var(--color-primary)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Send Request
                </button>
                <p className="text-[9px] font-bold text-slate-500 text-center mt-6 uppercase tracking-widest leading-relaxed">
                  Charlie will analyze this request instantly and provide <br/> immediate triage recommendations.
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HelpModule;
