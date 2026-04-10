import React from 'react';
import { ChevronRight, Mail, MessageCircle, Phone, Star } from 'lucide-react';

const panelClass = 'rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-sm';

export default function CRM1List({ contacts, selectedContactId, onSelectContact, viewMode }) {
  return (
    <div className={`${panelClass} min-h-0 overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">CRM1 Snapshot</div>
          <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">Legacy contact index</div>
        </div>
        <div className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">{viewMode}</div>
      </div>
      <div className="border-b border-[var(--color-border)]/70 bg-[var(--color-bg-primary)]/40 px-4 py-2 text-[11px] text-[var(--color-text-secondary)]">
        Static visual reference only. No backend, no mutation, no real records.
      </div>
      <div className="grid grid-cols-[24px_1.5fr_1.2fr_0.8fr_1fr_80px] items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)]/20">
        <div />
        <div>NAME/ID</div>
        <div>COMPANY</div>
        <div>ALLOWED</div>
        <div>OWNER</div>
        <div className="text-right">STATUS</div>
      </div>
      <div className="min-h-0 overflow-y-auto">
        {contacts.map((contact) => {
          const active = selectedContactId === contact.id;
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => onSelectContact(contact.id)}
              className={`group grid w-full grid-cols-[24px_1.5fr_1.2fr_0.8fr_1fr_80px] items-center gap-2 border-b border-[var(--color-border)]/20 px-3 py-1.5 text-left transition-all relative ${active ? 'bg-[var(--color-primary)]/10 z-10 shadow-[0_0_15px_-5px_var(--color-primary)]' : 'hover:bg-[var(--color-bg-primary)]/40 hover:z-10 hover:shadow-sm'}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--color-primary)] transition-transform ${active ? 'scale-y-100' : 'scale-y-0 group-hover:scale-y-75'}`} />
              <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[9px] font-bold text-[var(--color-text-secondary)]">
                {contact.firstName?.[0]}{contact.lastName?.[0]}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-[12px] font-bold text-[var(--color-text-primary)]">{contact.displayName}</span>
                {contact.validationStatus === 'Verified' ? <Star size={10} className="text-amber-400 shrink-0" /> : null}
              </div>
              <div className="truncate text-[11px] font-medium text-[var(--color-text-secondary)]">{contact.company}</div>
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-tertiary)] font-mono">
                <Mail size={10} className="shrink-0" />
                <Phone size={10} className="shrink-0" />
              </div>
              <div className="truncate text-[11px] font-medium text-[var(--color-text-secondary)]">{contact.owner}</div>
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--color-primary)]">{contact.status}</span>
                <ChevronRight size={12} className="text-[var(--color-text-tertiary)] opacity-40 shrink-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-text-secondary)]">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]/50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Selected</div>
          <div className="mt-1 font-medium text-[var(--color-text-primary)]">1 snapshot record</div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]/50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Bulk</div>
          <div className="mt-1 font-medium text-[var(--color-text-primary)]">Verify / Tag / Delete</div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]/50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Assist</div>
          <div className="mt-1 inline-flex items-center gap-1 font-medium text-[var(--color-text-primary)]"><MessageCircle size={12} />CRM context</div>
        </div>
      </div>
    </div>
  );
}
