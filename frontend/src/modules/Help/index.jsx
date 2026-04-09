import React, { useState, useEffect, useRef } from 'react';
import { 
  GraduationCap, Search, FileText, ChevronRight, X, Bot, 
  Loader2, ArrowLeft, ExternalLink, HelpCircle, AlertCircle, 
  CheckCircle2, Info, MessageSquare, Plus, Clock, Star,
  Grid, List, Zap, Play
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { 
  getHelpArticlesApi,
  createHelpTicketApi,
  getOperatorAssistResponseApi,
  getHelpTicketsApi,
  getHelpBroadcastsApi
} from '../../services/backendApi';
import { dispatchAction } from '../../orchestration';
import { helpTemplates } from './templates/helpTemplates';
import { 
  getRecentArticles, 
  trackArticleVisit, 
  trackActionExecution,
  getRecentActions
} from './state/helpState';

const HelpModule = ({ activeModule = 'dashboard' }) => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ articles: [], actions: [], templates: [] });
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [aiActive, setAiActive] = useState(false);
  const [checkingAi, setCheckingAi] = useState(true);
  const [charlieResponse, setCharlieResponse] = useState(null);
  const [askingCharlie, setAskingCharlie] = useState(false);
  const [recentArticles, setRecentArticles] = useState([]);
  const [recentActions, setRecentActions] = useState([]);

  const [viewMode, setViewMode] = useState('grid');
  const [showTicketsView, setShowTicketsView] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

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
        getHelpArticlesApi()
      ]);
      
      const itemsData = results[0].status === 'fulfilled' ? results[0].value : [];
      
      // Tag-driven: /api/help/articles returns only items tagged META:DOC:HELP
      const helpArticles = itemsData || [];
      setArticles(helpArticles);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    checkAiStatus();
    setRecentArticles(getRecentArticles());
    setRecentActions(getRecentActions());
  }, []);

  useEffect(() => {
    if (showTicketsView) {
      const fetchTicketsAndBroadcasts = async () => {
        setTicketsLoading(true);
        try {
          const [ticketsData, broadcastsData] = await Promise.allSettled([
            getHelpTicketsApi(),
            getHelpBroadcastsApi()
          ]);
          if (ticketsData.status === 'fulfilled') setTickets(ticketsData.value || []);
          if (broadcastsData.status === 'fulfilled') setBroadcasts(broadcastsData.value || []);
        } catch (err) {
          console.error('Failed to fetch tickets/broadcasts:', err);
        } finally {
          setTicketsLoading(false);
        }
      };
      fetchTicketsAndBroadcasts();
    }
  }, [showTicketsView]);

  // Intent Engine: Search Articles, Actions, and Templates
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ articles: [], actions: [], templates: [] });
      return;
    }

    const query = searchQuery.toLowerCase();
    
    // 1. Filter Articles (Module-Aware Boosting)
    const filteredArticles = articles.filter(a => 
      (a.title || '').toLowerCase().includes(query) || 
      (a.content || '').toLowerCase().includes(query)
    ).sort((a, b) => {
      // Boost if category matches activeModule
      const aBoost = a.category === activeModule ? 2 : 1;
      const bBoost = b.category === activeModule ? 2 : 1;
      return bBoost - aBoost;
    }).map(a => ({ type: 'article', id: a.id, title: a.title, payload: a }));

    // 2. Search Global Actions
    const globalActions = [
      { type: 'action', id: 'create_flow', title: 'Create SMS Flow', payload: { type: 'create_flow', payload: { template: 'lead_capture' } } },
      { type: 'action', id: 'open_crm', title: 'Open CRM Contacts', payload: { type: 'open_module', payload: { module: 'crm' } } },
      { type: 'action', id: 'add_contact', title: 'Add New Contact', payload: { type: 'navigate', payload: { route: '/crm' } } },
      { type: 'action', id: 'open_comms', title: 'Open Message Inbox', payload: { type: 'open_module', payload: { module: 'chat' } } }
    ].filter(a => a.title.toLowerCase().includes(query));

    // 3. Search Templates
    const templateResults = Object.entries(helpTemplates)
      .filter(([id, t]) => t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query))
      .map(([id, t]) => ({ type: 'template', id, title: t.name, payload: t }));

    setSearchResults({
      articles: filteredArticles.slice(0, 5),
      actions: globalActions.slice(0, 3),
      templates: templateResults.slice(0, 3)
    });
  }, [searchQuery, articles, activeModule]);

  const handleAskCharlie = async () => {
    if (!searchQuery.trim() || askingCharlie) return;
    
    setAskingCharlie(true);
    try {
      const response = await getOperatorAssistResponseApi({
        message: searchQuery,
        context: {
          module: 'help',
          surface: 'knowledge-panel',
          topic: activeModule
        }
      });

      // Analyzed intent for dynamic generation
      const isFlowRequest = /flow|automate|trigger|sms|email|deal|form|lead|missed|call|tag/i.test(searchQuery);
      let dynamicAction = null;
      
      if (isFlowRequest) {
        dynamicAction = {
          id: 'dynamic-flow-gen',
          type: 'action',
          title: 'Generate Custom Flow',
          isDynamic: true,
          payload: {
            type: 'create_flow_dynamic',
            payload: {
              intent: searchQuery,
              source: 'helpdesk',
              requiresOrchestration: true
            }
          }
        };
      }

      // Unified AI Response Structure
      setCharlieResponse({
        answer: response?.answer || "I don't have enough data to confirm that.",
        insights: Array.isArray(response?.insights) ? response.insights : [],
        articles: searchResults.articles.slice(0, 2),
        actions: dynamicAction
          ? [dynamicAction, ...searchResults.actions.slice(0, 1)]
          : searchResults.actions.slice(0, 2),
        suggestedActions: Array.isArray(response?.suggestedActions) ? response.suggestedActions : [],
        templates: searchResults.templates.slice(0, 1)
      });
    } catch (err) {
      console.error('Charlie failed:', err);
    } finally {
      setAskingCharlie(false);
    }
  };

  const handleSelectArticle = (article) => {
    setSelectedArticle(article);
    trackArticleVisit(article);
    setRecentArticles(getRecentArticles());
  };

  const handleRunAction = (action, label) => {
    dispatchAction(action, { source: 'helpdesk' });
    trackActionExecution(action.type, label);
    setRecentActions(getRecentActions());
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      open: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Open' },
      pending: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Pending' },
      resolved: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Resolved' },
      closed: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30', label: 'Closed' },
      sent: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Sent' },
      failed: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: 'Failed' },
      scheduled: { bg: 'bg-sky-500/20', text: 'text-sky-400', border: 'border-sky-500/30', label: 'Scheduled' }
    };
    const config = statusConfig[status?.toLowerCase()] || statusConfig.open;
    return (
      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${config.bg} ${config.text} border ${config.border}`}>
        {config.label}
      </span>
    );
  };

  if (showTicketsView) {
    return (
      <div className="h-full flex flex-col animate-in fade-in duration-300">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest">
            <button onClick={() => setShowTicketsView(false)} className="hover:text-[var(--color-primary)] transition-colors">HOME</button>
            <ChevronRight size={10} />
            <span className="text-[var(--color-text-primary)]">My Tickets</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto no-scrollbar">
          {ticketsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
            </div>
          ) : (
            <div className="space-y-8">
              {broadcasts.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-[11px] font-black text-[var(--color-text-primary)] uppercase tracking-widest">
                    <MessageSquare size={16} className="text-sky-400" />
                    Broadcasts
                    <span className="text-[var(--color-text-tertiary)]">({broadcasts.length})</span>
                  </div>
                  <div className="grid gap-4">
                    {broadcasts.map(broadcast => (
                      <div key={broadcast.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-sky-500/20 transition-all">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-[var(--color-text-primary)] truncate">{broadcast.title || 'Untitled Broadcast'}</h4>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 line-clamp-2">{broadcast.message || broadcast.content || 'No message'}</p>
                            <div className="flex items-center gap-3 mt-2 text-[8px] text-slate-500">
                              {broadcast.recipients_count !== undefined && <span>{broadcast.recipients_count} recipients</span>}
                              {broadcast.sent_at && <span>Sent: {new Date(broadcast.sent_at).toLocaleDateString()}</span>}
                            </div>
                          </div>
                          {getStatusBadge(broadcast.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tickets.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-[11px] font-black text-[var(--color-text-primary)] uppercase tracking-widest">
                    <FileText size={16} className="text-[var(--color-primary)]" />
                    Support Tickets
                    <span className="text-[var(--color-text-tertiary)]">({tickets.length})</span>
                  </div>
                  <div className="grid gap-4">
                    {tickets.map(ticket => (
                      <div key={ticket.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-[var(--color-primary)]/20 transition-all">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-[var(--color-text-primary)] truncate">{ticket.subject || 'Untitled Ticket'}</h4>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 line-clamp-2">{ticket.description || ticket.content || 'No description'}</p>
                            <div className="flex items-center gap-3 mt-2 text-[8px] text-slate-500">
                              {ticket.priority && <span className="uppercase">{ticket.priority}</span>}
                              {ticket.created_at && <span>Created: {new Date(ticket.created_at).toLocaleDateString()}</span>}
                            </div>
                          </div>
                          {getStatusBadge(ticket.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                broadcasts.length === 0 && (
                  <div className="text-center py-16 text-[var(--color-text-tertiary)]">
                    <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
                    <p className="text-xs font-bold uppercase tracking-widest">No tickets or broadcasts</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    );
  }


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
            <div className="max-w-4xl mx-auto space-y-10">
              <div className="prose prose-invert font-medium leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap text-lg">
                {selectedArticle.content?.split(/(!\[.*?\]\(.*?\))/g).map((part, index) => {
                  const match = part.match(/!\[(.*?)\]\((.*?)\)/);
                  if (match) {
                    return (
                      <div key={index} className="my-8 rounded-[var(--radius-panel)] border border-[var(--color-border)] overflow-hidden shadow-[var(--shadow-elevated)] bg-[var(--color-bg-primary)]/40">
                        <img src={match[2]} alt={match[1]} className="w-full h-auto cursor-zoom-in hover:scale-[1.01] transition-transform duration-500" />
                        {match[1] && <div className="p-3 bg-[var(--color-bg-primary)]/50 text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest text-center border-t border-[var(--color-border)]">{match[1]}</div>}
                      </div>
                    );
                  }
                  return <span key={index}>{part}</span>;
                }) || "No content found for this article."}
              </div>

              {/* Action Layer: Inline Actions & Templates */}
              {(selectedArticle.actions?.length > 0 || selectedArticle.templates?.length > 0) && (
                <div className="border-t border-[var(--color-border)] pt-8 space-y-6">
                  <div className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-[0.3em]">Execution Pathways</div>
                  <div className="flex flex-wrap gap-4">
                    {selectedArticle.actions?.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleRunAction(action, action.label)}
                        className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-all font-bold text-xs uppercase tracking-widest"
                      >
                        <Play size={14} />
                        {action.label}
                      </button>
                    ))}
                    {selectedArticle.templates?.map((tpl, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleRunAction({ type: 'create_flow', payload: { template: tpl.id } }, `Use ${tpl.name}`)}
                        className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 transition-all font-bold text-xs uppercase tracking-widest"
                      >
                        <Zap size={14} />
                        Use {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="module-root-standard">
      <ModuleHeader
        showTitle={false}
        actions={[]}
        toolbarLeftSlot={(
          <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest">
            <span className="opacity-50">Support</span>
            <ChevronRight size={10} className="opacity-30" />
            <span className="text-[var(--color-text-primary)]">Home</span>
          </div>
        )}
        toolbarCenterSlot={(
          <div className="flex items-center gap-2 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1.5 overflow-hidden">
            <span className="text-[8px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest mr-1 shrink-0">System Status:</span>
            <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-widest truncate">AIO Neural Network</span>
            <div className={`ml-1 px-2 py-0.5 rounded-full text-[7px] font-black border transition-all duration-1000 ${
              aiActive
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.4)] animate-pulse'
                : 'bg-emerald-500/5 text-emerald-500/40 border-emerald-500/10'
            }`}>
              {aiActive ? 'ACTIVE' : 'IDLE'}
            </div>
          </div>
        )}
      />

      <div className="module-content-stage overflow-auto no-scrollbar space-y-2 px-1.5 pb-1.5">
        {/* Hero Section */}
        <div className="text-center space-y-2 pt-2 pb-0">
          <h1 className="text-4xl font-black text-[var(--color-text-primary)] uppercase tracking-tighter leading-none">
            How can we help?
          </h1>

          <div className="max-w-2xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-[var(--color-primary)] to-sky-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
            <div className="relative bg-[var(--color-bg-secondary)] border border-white/10 rounded-2xl shadow-2xl flex items-center px-5 py-3">
              <Search className="text-[var(--color-text-tertiary)] mr-3" size={20} />
              <input
                type="text"
                placeholder={`Search ${activeModule.toUpperCase()} Intel & Actions...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-md font-medium text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]/50"
              />
              <button
                onClick={handleAskCharlie}
                disabled={askingCharlie}
                className={`ml-4 flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                  aiActive && searchQuery.trim()
                  ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20 hover:scale-105 active:scale-95'
                  : 'bg-white/5 text-[var(--color-text-tertiary)] cursor-not-allowed'
                }`}
              >
                {askingCharlie ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                {askingCharlie ? 'CONSULTING...' : 'Ask Assist'}
              </button>
            </div>

            {/* Intent Engine: Multi-Type Search Results */}
            {searchQuery.trim() && !askingCharlie && (
              <div className="floating-surface absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden rounded-[var(--radius-modal)] animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="p-4 max-h-[400px] overflow-auto no-scrollbar space-y-4">
                  {searchResults.actions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[8px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest px-2">Instant Actions</div>
                      {searchResults.actions.map(action => (
                        <button 
                          key={action.id}
                          onClick={() => handleRunAction(action.payload, action.title)}
                          className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-card)] hover:bg-[var(--color-hover)] text-left group transition-all"
                        >
                          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)] group-hover:bg-[var(--color-primary)] group-hover:text-white transition-all">
                            <Zap size={14} />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-[var(--color-text-primary)]">{action.title}</div>
                            <div className="text-[8px] text-[var(--color-text-tertiary)] uppercase tracking-widest">Execute Intent</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.templates.length > 0 && (
                    <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
                      <div className="text-[8px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest px-2">Rapid Templates</div>
                      {searchResults.templates.map(tpl => (
                        <button 
                          key={tpl.id}
                          onClick={() => handleRunAction({ type: 'create_flow', payload: { template: tpl.id } }, `Use ${tpl.title}`)}
                          className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-card)] hover:bg-[var(--color-hover)] text-left group transition-all"
                        >
                          <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition-all">
                            <Grid size={14} />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-[var(--color-text-primary)]">{tpl.title}</div>
                            <div className="text-[8px] text-[var(--color-text-tertiary)] uppercase tracking-widest">Inject into {activeModule}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
                    <div className="text-[8px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest px-2">Intel Modules</div>
                    {searchResults.articles.length > 0 ? (
                      searchResults.articles.map(article => (
                        <button 
                          key={article.id}
                          onClick={() => handleSelectArticle(article.payload)}
                          className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-card)] hover:bg-[var(--color-hover)] text-left group transition-all"
                        >
                          <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-primary)] flex items-center justify-center text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-primary)] transition-all">
                            <FileText size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-[var(--color-text-primary)] truncate">{article.title}</div>
                            <div className="text-[8px] text-[var(--color-text-tertiary)] uppercase tracking-widest">Read Article</div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-widest">No matching intel</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Grounded assist mode: canonical `/api/assist` response plus local help actions/templates. */}
          {charlieResponse && (
            <div className="max-w-2xl mx-auto bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 rounded-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-500">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
                  <Bot size={18} />
                </div>
                <div className="text-[10px] font-black text-[var(--color-text-primary)] uppercase tracking-widest">Assist Guidance</div>
                <button onClick={() => setCharlieResponse(null)} className="ml-auto text-slate-500 hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
              <p className="text-sm font-medium text-[var(--color-text-secondary)] leading-relaxed italic">
                "{charlieResponse.answer}"
              </p>

              {charlieResponse.insights?.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Grounded Insights</div>
                  <div className="space-y-2">
                    {charlieResponse.insights.map((insight, index) => (
                      <div key={`insight-${index}`} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-[var(--color-text-secondary)]">
                        {insight}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 pt-2">
                {charlieResponse.actions.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Recommended Actions</div>
                    {charlieResponse.actions.map(action => (
                      <button 
                        key={action.id}
                        onClick={() => handleRunAction(action.payload, action.title)}
                        className={`w-full flex items-center gap-2 p-2 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-widest ${
                          action.isDynamic 
                          ? 'bg-gradient-to-r from-[var(--color-primary)] to-sky-500 text-white border-white/20 shadow-lg shadow-[var(--color-primary)]/20 hover:scale-[1.02]' 
                          : 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 shadow-none'
                        }`}
                      >
                        {action.isDynamic ? <Zap size={10} className="animate-pulse" /> : <Zap size={10} />}
                        {action.title}
                      </button>
                    ))}
                  </div>
                )}
                {charlieResponse.templates.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Suggested Patterns</div>
                    {charlieResponse.templates.map(tpl => (
                      <button 
                        key={tpl.id}
                        onClick={() => handleRunAction({ type: 'create_flow', payload: { template: tpl.id } }, `Use ${tpl.title}`)}
                        className="w-full flex items-center gap-2 p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20 transition-all text-[10px] font-bold uppercase tracking-widest"
                      >
                        <Grid size={10} />
                        Use {tpl.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {charlieResponse.suggestedActions?.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Suggested Actions</div>
                  <div className="space-y-2">
                    {charlieResponse.suggestedActions.map((action, index) => (
                      <div key={`suggested-${index}`} className="rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/8 px-3 py-2 text-[10px] text-[var(--color-text-primary)]">
                        {action}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setShowTicketsView(true)}
              className="group flex items-center gap-3 px-6 py-3 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-sky-500/10 hover:border-sky-500/30 transition-all text-left"
            >
              <MessageSquare size={16} className="text-sky-400 group-hover:scale-110 transition-transform" />
              <div>
                <div className="text-[10px] font-black text-[var(--color-text-primary)] uppercase tracking-widest">My Tickets</div>
              </div>
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('aio:open-ticket'))}
              className="group flex items-center gap-3 px-6 py-3 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)]/30 transition-all text-left"
            >
              <Plus size={16} className="text-[var(--color-primary)] group-hover:scale-110 transition-transform" />
              <div>
                <div className="text-[10px] font-black text-[var(--color-text-primary)] uppercase tracking-widest">Submit Ticket</div>
              </div>
            </button>
          </div>

          {/* Recent + Recommended Layer */}
          {(recentArticles.length > 0 || recentActions.length > 0) && (
            <div className="max-w-4xl mx-auto grid grid-cols-2 gap-8 pt-4 pb-2">
              {recentArticles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[8px] font-black text-slate-500 uppercase tracking-widest border-l-2 border-[var(--color-primary)] pl-2">
                    <Clock size={10} />
                    Recently Viewed Intel
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentArticles.map(article => (
                      <button
                        key={article.id}
                        onClick={() => handleSelectArticle(articles.find(a => a.id === article.id))}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold text-white hover:bg-white/10 transition-all truncate max-w-[150px]"
                      >
                        {article.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {recentActions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[8px] font-black text-slate-500 uppercase tracking-widest border-l-2 border-sky-500 pl-2">
                    <Star size={10} />
                    Frequent Actions
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentActions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleRunAction({ type: action.type, payload: action.payload }, action.label)}
                        className="px-3 py-1.5 rounded-lg bg-sky-500/5 border border-sky-500/10 text-[9px] font-bold text-sky-400 hover:bg-sky-500/10 transition-all"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
          </div>                   {viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,225px)] justify-center gap-8">
              {articles.filter(a => 
                (a.title || '').toLowerCase().includes(searchQuery.toLowerCase())
              ).map(item => (
                <div 
                  key={item.id}
                  onClick={() => handleSelectArticle(item)}
                  className="group relative w-[225px] h-[300px] rounded-[2rem] bg-white/[0.02] border border-white/5 p-6 hover:bg-white/[0.04] hover:border-sky-500/30 transition-all duration-500 cursor-pointer overflow-hidden shadow-2xl hover:shadow-sky-500/10 flex flex-col"
                >
                  {/* Visual Accent */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 blur-[40px] -mr-12 -mt-12 group-hover:bg-sky-500/15 transition-all duration-700" />
                  
                  <div className="relative flex-1 flex flex-col items-center justify-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform duration-500 shadow-lg shrink-0">
                      <GraduationCap size={22} />
                    </div>
                    
                    <div className="space-y-1">
                      <h3 className="text-[11px] font-black text-white uppercase tracking-widest leading-relaxed line-clamp-2">
                        {item.title || "Untitled Intelligence"}
                      </h3>
                      <p className="text-[9px] text-slate-500 line-clamp-2 px-2 leading-relaxed">
                        {item.description || "Comprehensive guide and action pathways for this system module."}
                      </p>
                    </div>
                  </div>

                  {/* Quick Actions Injection */}
                  <div className="border-t border-white/5 pt-4 mt-auto space-y-2 translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                    <div className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Quick Actions</div>
                    <div className="flex gap-2 justify-center">
                       {item.actions?.slice(0, 2).map((action, idx) => (
                         <button 
                            key={idx}
                            onClick={(e) => { e.stopPropagation(); handleRunAction(action, action.label); }}
                            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all shadow-lg"
                         >
                           <Zap size={12} />
                         </button>
                       ))}
                       <button 
                          onClick={(e) => { e.stopPropagation(); handleSelectArticle(item); }}
                          className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-sky-400 hover:bg-sky-400 hover:text-white transition-all shadow-lg"
                       >
                         <ExternalLink size={12} />
                       </button>
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


    </div>
  );
};

export default HelpModule;
