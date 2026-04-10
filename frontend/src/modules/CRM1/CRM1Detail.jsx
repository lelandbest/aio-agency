import React, { useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  FileText,
  Globe,
  KeyRound,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
  CheckCircle2,
  XCircle,
  Hash,
  Briefcase,
  Zap,
  Clock,
  ExternalLink,
  Target,
  BarChart3,
  Receipt,
  ArrowRight,
  PlusCircle,
  Send,
  UserCheck,
} from 'lucide-react';

const shellPanelClass = 'rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-sm';
const innerPanelClass = 'rounded-[var(--radius-card)] border border-[var(--color-border)]/70 bg-[var(--color-bg-primary)]/80';

const formatDate = (value) => {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
  } catch {
    return String(value);
  }
};

export default function CRM1Detail({ contact }) {
  const [activeFilter, setActiveFilter] = useState('Activity');
  const [detailPanels, setDetailPanels] = useState({
    dossier: true,
    address: true,
    consent: true,
    related: true,
    automations: true,
    booking: true,
    pipelines: true,
    billing: true,
  });

  const toggleDetailPanel = (key) => setDetailPanels((current) => ({ ...current, [key]: !current[key] }));

  if (!contact) {
    return (
      <div className={`${shellPanelClass} flex min-h-[420px] items-center justify-center p-6 bg-[var(--color-bg-primary)]/20`}>
        <div className="max-w-sm text-center">
          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">CRM1 Snapshot</div>
          <h2 className="mt-3 text-xl font-bold text-[var(--color-text-primary)]">Select a contact</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)] opacity-60">High-density operator surface for dossier review.</p>
        </div>
      </div>
    );
  }

  // Unified Feed Logic
  const feedItems = useMemo(() => {
    const items = [...(contact.timeline || [])];
    // In a real app, we'd add calls, sms, etc here.
    // Sorting by date desc
    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [contact]);

  const filteredFeed = useMemo(() => {
    if (activeFilter === 'Activity') return feedItems;
    if (activeFilter === 'Calls') {
      return feedItems.filter(item => item.type === 'call' && item.source !== 'automation');
    }
    if (activeFilter === 'SMS') {
      return feedItems.filter(item => item.type === 'sms' && item.source !== 'automation');
    }
    if (activeFilter === 'Automations') {
      return feedItems.filter(item => item.source === 'automation' || item.type === 'automation' || item.type === 'flow' || item.type === 'auto');
    }
    return feedItems.filter(item => item.type.toLowerCase() === activeFilter.toLowerCase().replace(/s$/, ''));
  }, [feedItems, activeFilter]);

  return (
    <div className="flex min-h-0 flex-1 gap-2 overflow-hidden select-none">
      {/* Island 1: Identity & Activity */}
      <div className={`${shellPanelClass} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        {/* Action Row */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 bg-[var(--color-bg-primary)]/60">
          <div className="flex items-center gap-3">
             <div className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--color-text-tertiary)] opacity-60 italic shrink-0">Operator Surface</div>
             <div className="h-4 w-px bg-[var(--color-border)]" />
             <div className="flex items-center gap-1.5">
                {[
                  { label: 'Note', icon: FileText },
                  { label: 'Email', icon: Mail },
                  { label: 'SMS', icon: MessageSquareText },
                  { label: 'Meet', icon: CalendarDays },
                  { label: 'Form', icon: FileText },
                ].map(({ label, icon: Icon }) => (
                  <button key={label} className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--color-primary)]/10 text-[9px] font-black uppercase tracking-widest text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-all">
                    <Icon size={10} />
                    <span>{label}</span>
                  </button>
                ))}
             </div>
          </div>
          <button type="button" className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/20 transition-all shadow-[0_0_10px_-4px_rgba(16,185,129,0.4)]">
            <PlusCircle size={10} />
            <span>Add to Flow</span>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 gap-2 overflow-hidden p-2">
          {/* Left Sub-Rail: Identity Dossier */}
          <div className="w-[340px] min-w-[340px] space-y-2 overflow-y-auto no-scrollbar pr-1">
            
            {/* Core Identity Panel */}
            <div className={`${innerPanelClass} overflow-hidden shadow-inner`}>
              <div className="bg-[var(--color-primary)]/5 px-3 py-2 border-b border-[var(--color-border)]/30 flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--color-primary)] opacity-80">Identity Dossier</div>
                <div className="flex items-center gap-2">
                  <div className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Verified</div>
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-lg bg-gradient-to-br from-[var(--color-bg-secondary)] to-[var(--color-bg-primary)] border border-[var(--color-border)] flex items-center justify-center text-xl font-black text-[var(--color-text-primary)] shadow-sm">
                    {contact.firstName?.[0]}{contact.lastName?.[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] opacity-60 leading-none mb-1">{contact.title || 'Unknown Title'}</div>
                    <div className="text-2xl font-black text-[var(--color-text-primary)] tracking-tighter leading-none">{contact.displayName}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(contact.tags || []).map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[8px] font-black uppercase tracking-tighter text-[var(--color-text-tertiary)]">{tag}</span>
                      ))}
                    </div>
                    {/* Comm References on Face */}
                    <div className="mt-3 space-y-1">
                       <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                          <Mail size={11} className="text-blue-500 opacity-60" />
                          <span className="truncate">{contact.email}</span>
                       </div>
                       <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                          <Phone size={11} className="text-blue-500 opacity-60" />
                          <span className="truncate">{contact.phone}</span>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                   <div className="space-y-0.5">
                      <div className="text-[8px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Quality</div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg-secondary)] overflow-hidden border border-[var(--color-border)]/30">
                          <div className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" style={{ width: '88%' }} />
                        </div>
                        <span className="text-[10px] font-black text-emerald-400">88</span>
                      </div>
                   </div>
                   <div className="space-y-0.5">
                      <div className="text-[8px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Engagement</div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg-secondary)] overflow-hidden border border-[var(--color-border)]/30">
                          <div className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ width: '72%' }} />
                        </div>
                        <span className="text-[10px] font-black text-blue-400">72</span>
                      </div>
                   </div>
                </div>
              </div>
            </div>

            {/* Dossier Details */}
            <div className={`${innerPanelClass} p-3`}>
              <button type="button" onClick={() => toggleDetailPanel('dossier')} className="flex w-full items-center justify-between group">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-primary)]">Contact Details</span>
                <ChevronDown size={14} className={`text-[var(--color-text-tertiary)] transition-transform ${detailPanels.dossier ? 'rotate-180' : ''}`} />
              </button>
              {detailPanels.dossier && (
                <div className="mt-3 space-y-3">
                  {/* Expanded Fields */}
                  <div className="grid gap-y-2">
                    {[
                      ['Owner', contact.owner, UserCheck],
                      ['Company', contact.company, Building2],
                      ['Department', 'Operations', Briefcase],
                      ['Job Title', contact.title, Hash],
                      ['AI Employee', 'Alex (Automated)', Zap],
                      ['Website', 'northstarhvac.com', Globe],
                    ].map(([label, value, Icon]) => (
                      <div key={label} className="grid grid-cols-[100px_1fr] items-center gap-2 border-b border-[var(--color-border)]/10 pb-1.5 last:border-0 last:pb-0">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                          <Icon size={10} className="shrink-0 opacity-40" /> {label}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--color-text-secondary)] truncate text-right">{value || '--'}</span>
                      </div>
                    ))}
                  </div>

                  <div className="h-px bg-[var(--color-border)]/20" />

                  {/* Contact Methods */}
                  <div className="space-y-2">
                    <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-60">Communication Channels</div>
                    
                    <div className="space-y-1">
                      <div className="group flex items-center justify-between p-1.5 rounded border border-[var(--color-border)]/40 bg-[var(--color-bg-primary)]/40 hover:bg-[var(--color-bg-secondary)] transition-all">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail size={12} className="text-[var(--color-primary)] opacity-50" />
                          <span className="text-[11px] font-medium text-[var(--color-text-primary)] truncate">{contact.email}</span>
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-tighter text-emerald-500 bg-emerald-500/10 px-1 rounded">Primary</span>
                      </div>
                      <div className="group flex items-center justify-between p-1.5 rounded border border-[var(--color-border)]/10 bg-[var(--color-bg-primary)]/20 text-slate-500 italic">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail size={12} className="opacity-30" />
                          <span className="text-[10px]">Add alternative email...</span>
                        </div>
                        <Plus size={12} className="opacity-40 cursor-pointer hover:opacity-100" />
                      </div>
                    </div>

                    <div className="space-y-1 mt-2">
                      <div className="group flex items-center justify-between p-1.5 rounded border border-[var(--color-border)]/40 bg-[var(--color-bg-primary)]/40 hover:bg-[var(--color-bg-secondary)] transition-all">
                        <div className="flex items-center gap-2 min-w-0">
                          <Phone size={12} className="text-[var(--color-primary)] opacity-50" />
                          <span className="text-[11px] font-medium text-[var(--color-text-primary)] truncate">{contact.phone}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] font-black uppercase tracking-tighter text-blue-400 bg-blue-400/10 px-1 rounded">Mobile</span>
                          <ChevronDown size={10} className="text-slate-500" />
                        </div>
                      </div>
                      <div className="group flex items-center justify-between p-1.5 rounded border border-[var(--color-border)]/10 bg-[var(--color-bg-primary)]/20 text-slate-500 italic">
                        <div className="flex items-center gap-2 min-w-0">
                          <Phone size={12} className="opacity-30" />
                          <span className="text-[10px]">Add alt phone...</span>
                        </div>
                        <Plus size={12} className="opacity-40 cursor-pointer hover:opacity-100" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Address Blocks */}
            <div className={`${innerPanelClass} p-3`}>
              <button type="button" onClick={() => toggleDetailPanel('address')} className="flex w-full items-center justify-between group">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-primary)]">Physical Localization</span>
                <ChevronDown size={14} className={`text-[var(--color-text-tertiary)] transition-transform ${detailPanels.address ? 'rotate-180' : ''}`} />
              </button>
              {detailPanels.address && (
                <div className="mt-3 space-y-3">
                  <div className="p-2 rounded border border-[var(--color-border)]/30 bg-[var(--color-bg-primary)]/40 shadow-inner">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[9px] font-black uppercase tracking-widest text-blue-400">Business Address</div>
                      <MapPin size={10} className="text-blue-400/50" />
                    </div>
                    <div className="text-[11px] text-[var(--color-text-secondary)] space-y-0.5 font-medium leading-tight">
                      <div>4200 Northstar Ave, Ste 204</div>
                      <div>Minneapolis, MN 55401</div>
                      <div className="text-[9px] font-black text-[var(--color-text-tertiary)] opacity-60 uppercase">United States</div>
                    </div>
                  </div>
                  <div className="p-2 rounded border border-[var(--color-border)]/10 bg-[var(--color-bg-primary)]/10 italic text-[11px] text-[var(--color-text-tertiary)] flex justify-between items-center">
                    <span>No home address on file</span>
                    <button className="text-[9px] font-black uppercase text-[var(--color-primary)]">+ Add</button>
                  </div>
                </div>
              )}
            </div>

            {/* Consent Controls */}
            <div className={`${innerPanelClass} p-3`}>
               <button type="button" onClick={() => toggleDetailPanel('consent')} className="flex w-full items-center justify-between group">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-primary)]">Consent & Opt-In</span>
                <ChevronDown size={14} className={`text-[var(--color-text-tertiary)] transition-transform ${detailPanels.consent ? 'rotate-180' : ''}`} />
              </button>
              {detailPanels.consent && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                   {[
                     { label: 'Email Opt-in', state: !contact.doNotEmail },
                     { label: 'SMS Opt-in', state: !contact.doNotSms },
                     { label: 'Call Opt-in', state: true },
                     { label: 'Automation', state: contact.optedIntoMarketing },
                   ].map(({ label, state }) => (
                     <div key={label} className="flex items-center justify-between p-2 rounded border border-[var(--color-border)]/30 bg-[var(--color-bg-primary)]/40">
                        <span className="text-[9px] font-black uppercase tracking-tighter text-[var(--color-text-tertiary)]">{label}</span>
                        <div className={`h-4 w-7 rounded-full relative transition-colors ${state ? 'bg-emerald-500/30 border-emerald-500/50' : 'bg-slate-700/50 border-slate-600/50'} border`}>
                           <div className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-all ${state ? 'right-0.5' : 'left-0.5'}`} />
                        </div>
                     </div>
                   ))}
                </div>
              )}
            </div>

            {/* System Attribution (Collapsed default) */}
             <div className={`${innerPanelClass} p-3 opacity-60 hover:opacity-100 transition-opacity`}>
              <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">
                <span>External Reference: {contact.externalReferenceId}</span>
                <span>Source: {contact.source}</span>
              </div>
              <div className="mt-1 text-[9px] text-[var(--color-text-tertiary)]">Created: {formatDate(contact.createdAt)}</div>
            </div>

          </div>

          {/* Main Area: High-Density Activity Feed */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[var(--color-bg-primary)]/20 rounded-[var(--radius-panel)] border border-[var(--color-border)]/40 shadow-inner">
            
            {/* Feed Tabs / Filters */}
            <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 border-b border-[var(--color-border)]/40 bg-[var(--color-bg-primary)]/40 overflow-x-auto no-scrollbar">
              {['Activity', 'Notes', 'Forms', 'Emails', 'Calls', 'SMS', 'Automations'].map(tab => (
                 <button 
                  key={tab} 
                  onClick={() => setActiveFilter(tab)}
                  className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeFilter === tab ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_-2px_rgba(16,185,129,0.3)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] border border-transparent'}`}
                 >
                   {tab}
                 </button>
              ))}
            </div>

            {/* Inline Note Input */}
            <div className="px-4 py-2 border-b border-[var(--color-border)]/30 bg-[var(--color-bg-primary)]/10">
               <div className="flex items-center gap-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)]/60 rounded px-3 py-1.5 shadow-sm focus-within:border-emerald-500/50 transition-all">
                  <Plus size={14} className="text-emerald-500/60" />
                  <input 
                    type="text" 
                    placeholder="Add rapid note to timeline..." 
                    className="flex-1 bg-transparent border-none outline-none text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
                  />
                  <div className="flex items-center gap-2">
                     <div className="text-[9px] font-black uppercase text-slate-500">Ctrl + Enter</div>
                     <Send size={12} className="text-[var(--color-text-tertiary)] cursor-pointer hover:text-emerald-400" />
                  </div>
               </div>
            </div>

            {/* The Emerald Feed */}
            <div className="flex-1 overflow-y-auto no-scrollbar py-2">
               {filteredFeed.length > 0 ? (
                 <div className="flex flex-col gap-0.5 px-1">
                    {filteredFeed.map((item) => {
                       const isNote = item.type === 'note';
                       const isEmail = item.type === 'email';
                       const isMeet = item.type === 'meeting';
                       const isCall = item.type === 'call';
                       const isSms = item.type === 'sms';
                       const isAuto = item.source === 'automation' || item.type === 'automation';
                       
                       return (
                         <div key={item.id} className="group relative flex items-start gap-3 px-4 py-2.5 rounded-md border-b border-slate-800/10 hover:border-slate-700/40 hover:bg-emerald-500/[0.02] transition-all">
                            <div className="mt-1 flex-shrink-0">
                               {isNote && <FileText size={14} className="text-emerald-500/60" />}
                               {isEmail && <Mail size={14} className="text-cyan-500/60" />}
                               {isMeet && <CalendarDays size={14} className="text-amber-500/60" />}
                               {(isCall || isSms) && <MessageSquareText size={14} className="text-blue-500/60" />}
                            </div>
                            <div className="flex-1 min-w-0">
                               <div className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2">
                                     <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500/80">{item.type}</span>
                                     {isAuto && <Zap size={10} className="text-amber-500 animate-pulse" />}
                                     <div className="h-1 w-1 rounded-full bg-slate-700" />
                                     <span className="text-[12px] font-bold text-emerald-400 tracking-tight leading-none truncate">{item.title}</span>
                                  </div>
                                  <span className="text-[9px] font-mono text-[var(--color-text-tertiary)] opacity-40 group-hover:opacity-80 transition-opacity whitespace-nowrap">{formatDate(item.createdAt)}</span>
                               </div>
                               <div className="mt-1 text-[11px] text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed opacity-70 group-hover:opacity-100 transition-all">
                                  {item.description}
                               </div>
                            </div>
                            <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-emerald-500 scale-y-0 group-hover:scale-y-100 transition-transform origin-top rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                         </div>
                       );
                    })}
                 </div>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale py-20">
                    <Clock size={48} className="mb-4" />
                    <div className="text-[10px] font-black uppercase tracking-[0.3em]">No activity found in filter</div>
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* Island 2: Expand Shells (Right Rail) */}
      <div className={`${shellPanelClass} flex min-h-0 w-[300px] min-w-[300px] flex-col overflow-hidden bg-[var(--color-bg-primary)]/10 shadow-lg`}>
        <div className="border-b border-[var(--color-border)] px-3 py-2 bg-[var(--color-bg-primary)]/60 flex items-center justify-between">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Operational View</div>
          <Target size={12} className="text-[var(--color-primary)] opacity-60" />
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
          
          {/* Related Track */}
          <div className={`${innerPanelClass} p-2.5`}>
            <button type="button" onClick={() => toggleDetailPanel('related')} className="flex w-full items-center justify-between group">
              <div className="flex items-center gap-2">
                <Hash size={12} className="text-emerald-500/60" />
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-primary)]">Related Track</span>
              </div>
              <ChevronDown size={14} className={`text-[var(--color-text-tertiary)] transition-transform ${detailPanels.related ? 'rotate-180' : ''}`} />
            </button>
            {detailPanels.related && (
               <div className="mt-3 space-y-2">
                  <div className="text-[10px] text-[var(--color-text-tertiary)] italic px-2 py-4 border border-[var(--color-border)]/20 border-dashed rounded text-center">No active tracking segments</div>
                  <button className="w-full flex items-center justify-center gap-2 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-primary)] text-[9px] font-black uppercase text-[var(--color-text-secondary)] transition-all">
                     <Plus size={10} /> Link Contact
                  </button>
               </div>
            )}
          </div>

          {/* Automations */}
          <div className={`${innerPanelClass} p-2.5`}>
            <button type="button" onClick={() => toggleDetailPanel('automations')} className="flex w-full items-center justify-between group">
              <div className="flex items-center gap-2">
                <Zap size={12} className="text-amber-500/60" />
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-primary)]">Automations</span>
              </div>
              <ChevronDown size={14} className={`text-[var(--color-text-tertiary)] transition-transform ${detailPanels.automations ? 'rotate-180' : ''}`} />
            </button>
            {detailPanels.automations && (
               <div className="mt-3 space-y-2">
                   <div className="flex items-center justify-between p-2 rounded bg-amber-500/5 border border-amber-500/20">
                      <div className="min-w-0">
                         <div className="text-[10px] font-bold text-amber-500 truncate">Inbound Routing Flow</div>
                         <div className="text-[8px] text-amber-500/60 uppercase font-black">Waiting for response</div>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_var(--amber-500)]" />
                   </div>
                   <button className="w-full py-1.5 rounded border border-amber-500/30 text-amber-500/80 text-[9px] font-black uppercase hover:bg-amber-500/10 transition-all">Manage Sequences</button>
               </div>
            )}
          </div>

          {/* Booking */}
          <div className={`${innerPanelClass} p-2.5`}>
            <button type="button" onClick={() => toggleDetailPanel('booking')} className="flex w-full items-center justify-between group">
              <div className="flex items-center gap-2">
                <CalendarDays size={12} className="text-blue-500/60" />
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-primary)]">Booking</span>
              </div>
              <ChevronDown size={14} className={`text-[var(--color-text-tertiary)] transition-transform ${detailPanels.booking ? 'rotate-180' : ''}`} />
            </button>
            {detailPanels.booking && (
               <div className="mt-3 space-y-2">
                  <div className="text-[10px] font-black text-[var(--color-text-secondary)] opacity-40 uppercase tracking-tighter text-center py-4">No appointments scheduled</div>
                  <button className="w-full flex items-center justify-center gap-2 py-1.5 rounded border border-blue-500/30 text-blue-400 text-[9px] font-black uppercase hover:bg-blue-500/10 transition-all">
                     <Plus size={10} /> Schedule Meeting
                  </button>
               </div>
            )}
          </div>

          {/* Pipelines */}
          <div className={`${innerPanelClass} p-2.5`}>
            <button type="button" onClick={() => toggleDetailPanel('pipelines')} className="flex w-full items-center justify-between group">
              <div className="flex items-center gap-2">
                <BarChart3 size={12} className="text-cyan-500/60" />
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-primary)]">Pipelines</span>
              </div>
              <ChevronDown size={14} className={`text-[var(--color-text-tertiary)] transition-transform ${detailPanels.pipelines ? 'rotate-180' : ''}`} />
            </button>
            {detailPanels.pipelines && (
               <div className="mt-3 space-y-2">
                  <div className="p-2 rounded bg-cyan-500/5 border border-cyan-500/20">
                     <div className="text-[8px] font-black uppercase text-cyan-500 opacity-60">Sales Engine v2</div>
                     <div className="text-[11px] font-bold text-cyan-400 mt-0.5 whitespace-nowrap overflow-hidden">Step 4: Contract Generation</div>
                     <div className="mt-1.5 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                        <div className="h-full bg-cyan-500" style={{ width: '65%' }} />
                     </div>
                  </div>
                  <button className="w-full py-1.5 rounded border border-cyan-500/30 text-cyan-400 text-[9px] font-black uppercase hover:bg-cyan-500/10 transition-all">View Opportunities</button>
               </div>
            )}
          </div>

          {/* Billing / Fiscal */}
          <div className={`${innerPanelClass} p-2.5`}>
            <button type="button" onClick={() => toggleDetailPanel('billing')} className="flex w-full items-center justify-between group">
              <div className="flex items-center gap-2">
                <Receipt size={12} className="text-emerald-500/60" />
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-primary)]">Billing & Fiscal</span>
              </div>
              <ChevronDown size={14} className={`text-[var(--color-text-tertiary)] transition-transform ${detailPanels.billing ? 'rotate-180' : ''}`} />
            </button>
            {detailPanels.billing && (
               <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                     <div className="p-2 rounded border border-[var(--color-border)]/30 bg-[var(--color-bg-primary)]/40">
                        <div className="text-[8px] font-black text-slate-500 uppercase">Balance</div>
                        <div className="text-[12px] font-black text-[var(--color-text-primary)]">$0.00</div>
                     </div>
                     <div className="p-2 rounded border border-[var(--color-border)]/30 bg-[var(--color-bg-primary)]/40">
                        <div className="text-[8px] font-black text-slate-500 uppercase">Invoices</div>
                        <div className="text-[12px] font-black text-[var(--color-text-primary)]">02</div>
                     </div>
                  </div>
                  <div className="space-y-1">
                     <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 px-1 mb-1">Recent Invoices</div>
                     <div className="flex items-center justify-between p-1.5 rounded hover:bg-emerald-500/5 transition-all group/row cursor-pointer">
                        <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">INV-20411</span>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-black text-[var(--color-text-primary)]">$2,400.00</span>
                           <ArrowRight size={10} className="text-emerald-500 opacity-0 group-hover/row:opacity-100 transition-all -translate-x-2 group-hover/row:translate-x-0" />
                        </div>
                     </div>
                     <div className="flex items-center justify-between p-1.5 rounded hover:bg-emerald-500/5 transition-all group/row cursor-pointer">
                        <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">INV-19902</span>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-black text-[var(--color-text-primary)]">$1,150.00</span>
                           <ArrowRight size={10} className="text-emerald-500 opacity-0 group-hover/row:opacity-100 transition-all -translate-x-2 group-hover/row:translate-x-0" />
                        </div>
                     </div>
                  </div>
                  <button className="w-full py-1.5 rounded border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase hover:bg-emerald-500/10 transition-all">Generate Invoice</button>
               </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
