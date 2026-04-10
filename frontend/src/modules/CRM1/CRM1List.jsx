import React, { useState } from 'react';
import { ChevronRight, Mail, MessageCircle, Phone, Star, Tag, Trash2, Shield, Play, UserPlus } from 'lucide-react';

const panelClass = 'bg-transparent overflow-visible';

export default function CRM1List({ contacts, selectedContactId, onSelectContact, viewMode }) {
  const [selectedIds, setSelectedIds] = useState([]);

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === contacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map(c => c.id));
    }
  };

  return (
    <div className={`${panelClass} flex flex-col min-h-0`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 mb-1">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 opacity-70 italic">Legacy Chassis</div>
          <div className="text-[12px] font-bold text-slate-400">{viewMode}</div>
        </div>
        <div className="flex items-center gap-1">
          <button className="h-6 px-2 rounded border border-slate-800 bg-[#111] text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 hover:text-slate-300 transition-all shadow-sm">Import</button>
          <button className="h-6 px-2 rounded border border-slate-800 bg-[#111] text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 hover:text-slate-300 transition-all shadow-sm">Export</button>
        </div>
      </div>

      {/* Bulk Action Strip */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mx-1 mb-2 px-3 py-1.5 animate-in zoom-in-95 duration-200 shadow-[0_4px_12px_rgba(16,185,129,0.15)]">
          <div className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter shrink-0">{selectedIds.length} Selected</div>
          <div className="h-3 w-px bg-emerald-500/20" />
          <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
            <button className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.05em] text-emerald-400/80 hover:text-emerald-300 transition-all">
              <Tag size={10} /> Tag
            </button>
            <button className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.05em] text-emerald-400/80 hover:text-emerald-300 transition-all">
              <Trash2 size={10} /> Delete
            </button>
            <button className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.05em] text-emerald-400/80 hover:text-emerald-300 transition-all">
              <Shield size={10} /> Verify
            </button>
            <button className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.05em] text-emerald-400/80 hover:text-emerald-300 transition-all">
              <Play size={10} /> Add to Flow
            </button>
          </div>
        </div>
      )}

      {/* Table Header */}
      <div className="grid grid-cols-[32px_45px_1.5fr_1.2fr_0.8fr_1fr_80px] items-center gap-2 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 mb-1">
        <div className="flex justify-center">
          <input 
            type="checkbox" 
            checked={selectedIds.length === contacts.length && contacts.length > 0}
            onChange={toggleSelectAll}
            className="h-3 w-3 rounded border-slate-700 bg-black text-emerald-500 focus:ring-0 focus:ring-offset-0 transition-all cursor-pointer accent-emerald-500" 
          />
        </div>
        <div className="pl-1">#</div>
        <div>FIRST / LAST</div>
        <div>COMPANY</div>
        <div>METHODS</div>
        <div>OWNER</div>
        <div className="text-right">STATUS</div>
      </div>

      {/* List Content */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1 pr-1">
        {contacts.map((contact) => {
          const active = selectedContactId === contact.id;
          const isMultiSelected = selectedIds.includes(contact.id);
          
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => onSelectContact(contact.id)}
              className={`group grid w-full grid-cols-[32px_1fr] items-center gap-0 px-3 py-2 text-left transition-all relative rounded-lg border ${active ? 'bg-[#1a1a1a] border-slate-700/80 shadow-[0_8px_30px_rgba(0,0,0,0.5)] z-10' : 'bg-[#0a0a0a]/40 border-slate-800/40 hover:bg-[#111] hover:border-slate-800 hover:shadow-lg'} ${isMultiSelected ? 'border-emerald-500/20' : ''}`}
            >
              {/* Active Indicator */}
              {active && <div className="absolute left-0 top-1 bottom-1 w-1 bg-emerald-500 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.8)]" />}
              
              {/* Multi-select Checkbox (Static) */}
              <div className="flex justify-center z-20">
                <input 
                  type="checkbox" 
                  checked={isMultiSelected}
                  onChange={(e) => toggleSelect(contact.id, e)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-3 w-3 rounded border-slate-700 bg-black text-emerald-500 focus:ring-0 focus:ring-offset-0 transition-all cursor-pointer accent-emerald-500" 
                />
              </div>

              {/* Moving Content Area */}
              <div className={`grid grid-cols-[45px_1.5fr_1.2fr_0.8fr_1fr_80px] items-center gap-2 transition-transform duration-200 ${active ? 'translate-x-2' : 'group-hover:translate-x-1'}`}>
                {/* ID snippet - Now more obvious */}
                <div className={`text-[11px] font-black font-mono transition-colors ${active ? 'text-emerald-500' : 'text-slate-500 opacity-80'}`}>
                  {contact.id.split('-').pop()}
                </div>

                {/* Name/Display */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`truncate text-[11px] font-extrabold ${active ? 'text-emerald-400' : 'text-slate-200'}`}>{contact.displayName}</span>
                  {contact.validationStatus === 'Verified' ? <Star size={9} className="text-emerald-500 shrink-0 fill-emerald-400/20" /> : null}
                </div>

                {/* Company */}
                <div className="truncate text-[10px] font-medium text-slate-400">{contact.company || '--'}</div>

                {/* Methods */}
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail size={10} />
                  <Phone size={10} />
                </div>

                {/* Owner */}
                <div className="truncate text-[10px] font-medium text-slate-400">{contact.owner || 'Unassigned'}</div>

                {/* Status */}
                <div className="flex items-center justify-end gap-1.5 pr-1">
                  <span className={`text-[8px] font-black uppercase tracking-[0.1em] ${active ? 'text-emerald-400' : 'text-slate-600'}`}>{contact.status}</span>
                  <ChevronRight size={10} className={`text-slate-600 opacity-0 group-hover:opacity-100 transition-all ${active ? 'opacity-100 translate-x-0.5 text-emerald-400' : ''}`} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="mt-2 px-3 py-1.5 flex items-center justify-between border-t border-slate-900">
        <div className="text-[9px] font-medium text-slate-600 italic">Static floating chassis • Operator override</div>
        <div className="flex items-center gap-2">
           <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
           <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Recovery Active</span>
        </div>
      </div>
    </div>
  );
}
