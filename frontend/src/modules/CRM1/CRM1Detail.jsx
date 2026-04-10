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
} from 'lucide-react';

const shellPanelClass = 'rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-sm';
const innerPanelClass = 'rounded-[var(--radius-card)] border border-[var(--color-border)]/70 bg-[var(--color-bg-primary)]/80';

const formatDate = (value) => {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const detailSections = [
  { key: 'identity', label: 'Identity' },
  { key: 'activity', label: 'Activity' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'forms', label: 'Forms' },
  { key: 'orders', label: 'Orders' },
];

export default function CRM1Detail({ contact }) {
  const [activeTab, setActiveTab] = useState('activity');
  const [detailPanels, setDetailPanels] = useState({
    profile: true,
    userAccess: true,
    pipelines: true,
    billing: true,
    attribution: true,
  });

  const methods = useMemo(() => ({
    emails: contact?.email ? [contact.email] : [],
    phones: contact?.phone ? [contact.phone] : [],
  }), [contact]);

  const toggleDetailPanel = (key) => setDetailPanels((current) => ({ ...current, [key]: !current[key] }));

  if (!contact) {
    return (
      <div className={`${shellPanelClass} flex min-h-[420px] items-center justify-center p-6`}>
        <div className="max-w-sm text-center">
          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">CRM1 Snapshot</div>
          <h2 className="mt-3 text-xl font-semibold text-[var(--color-text-primary)]">Select a legacy contact</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">This module is a static visual recovery of the previous CRM dossier surface.</p>
        </div>
      </div>
    );
  }

  const currentTabLabel = detailSections.find((item) => item.key === activeTab)?.label || 'Activity';

  return (
    <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
      {/* Island 1: Identity & Activity */}
      <div className={`${shellPanelClass} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 bg-[var(--color-bg-primary)]/40">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--color-text-tertiary)] opacity-70">Identity & Timeline</div>
            <div className="text-[14px] font-black text-[var(--color-text-primary)] leading-tight">{contact.displayName}</div>
          </div>
          <div className="flex items-center gap-1">
            {[
              ['Email', Mail],
              ['Call', Phone],
              ['SMS', MessageSquareText],
              ['Book MTG', CalendarDays],
            ].map(([label, Icon]) => (
              <button key={label} type="button" className="flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-primary)] hover:text-[var(--color-text-primary)] transition-all">
                <Icon size={10} className="opacity-60" />
                <span>{label}</span>
              </button>
            ))}
            <button type="button" className="flex items-center gap-1.5 rounded border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-all ml-1">
              <Plus size={10} />
              <span>Add to Flow</span>
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 gap-2 overflow-hidden p-2">
          {/* Left Sub-Rail */}
          <div className="w-[300px] min-w-[300px] space-y-2 overflow-y-auto pr-1">
            <div className={`${innerPanelClass} p-3`}>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-md font-bold text-[var(--color-text-primary)]">
                  {contact.firstName?.[0]}{contact.lastName?.[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--color-text-tertiary)] opacity-60">{contact.title}</div>
                  <div className="text-[16px] font-black text-[var(--color-text-primary)] leading-none mt-0.5">{contact.displayName}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(contact.tags || []).map((tag) => (
                      <span key={tag} className="rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-1.5 text-[12px] text-[var(--color-text-secondary)]">
                <div className="inline-flex items-center gap-2"><Mail size={12} className="opacity-50" />{contact.email}</div>
                <div className="inline-flex items-center gap-2"><Phone size={12} className="opacity-50" />{contact.phone}</div>
                <div className="inline-flex items-center gap-2"><Building2 size={12} className="opacity-50" />{contact.company}</div>
                <div className="inline-flex items-center gap-2"><UserRound size={12} className="opacity-50" />Owner: {contact.owner}</div>
              </div>
            </div>
            <div className={`${innerPanelClass} p-3`}>
              <button type="button" onClick={() => toggleDetailPanel('profile')} className="flex w-full items-center justify-between text-[11px] font-black uppercase tracking-[0.15em] text-[var(--color-text-primary)]">
                <span>System Profile</span>
                <ChevronDown size={12} className={detailPanels.profile ? 'rotate-180' : ''} />
              </button>
              {detailPanels.profile ? (
                <div className="mt-2 space-y-2 text-[11px]">
                  {[
                    ['Ref ID', contact.externalReferenceId],
                    ['Validation', contact.validationStatus],
                    ['Click ID', contact.clickId],
                    ['Source Code', contact.sourceCode],
                    ['Sub 1', contact.subId1],
                    ['Sub 2', contact.subId2],
                    ['Sub 3', contact.subId3],
                    ['Sub 4', contact.subId4],
                    ['Sub 5', contact.subId5],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b border-[var(--color-border)]/20 pb-1 last:border-0">
                      <span className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">{label}</span>
                      <span className="font-medium text-[var(--color-text-primary)] truncate max-w-[140px] text-right">{value || '--'}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-1 pt-1">
                    {[
                      ['DNE', contact.doNotEmail],
                      ['DNS', contact.doNotSms],
                      ['MKT', contact.optedIntoMarketing],
                      ['OPT', contact.optedIntoSms],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1.5 py-1 flex justify-between">
                        <span className="text-[8px] font-black uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">{label}</span>
                        <span className="text-[9px] font-bold text-[var(--color-text-primary)]">{value ? 'Y' : 'N'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className={`${innerPanelClass} p-3`}>
              <button type="button" onClick={() => toggleDetailPanel('userAccess')} className="flex w-full items-center justify-between text-[11px] font-black uppercase tracking-[0.15em] text-[var(--color-text-primary)]">
                <span>User Access</span>
                <ChevronDown size={12} className={detailPanels.userAccess ? 'rotate-180' : ''} />
              </button>
              {detailPanels.userAccess ? (
                <div className="mt-2 space-y-2">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">State</div>
                    <div className="text-[11px] font-bold text-[var(--color-text-primary)]">{contact.userAccess.state}</div>
                  </div>
                  <div className="space-y-1">
                    {(contact.userAccess.memberships || []).length ? contact.userAccess.memberships.map((membership) => (
                      <div key={membership} className="inline-flex items-center gap-1.5 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-secondary)]">
                        <KeyRound size={10} />{membership}
                      </div>
                    )) : (
                      <button type="button" className="w-full rounded border border-emerald-500/40 bg-emerald-500/10 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-400">
                        Create Login
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {/* Main Activity Area */}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-2 flex flex-wrap items-center gap-1">
              {detailSections.slice(0, 3).map((section) => (
                <button key={section.key} type="button" onClick={() => setActiveTab(section.key)} className={`rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] transition-all ${activeTab === section.key ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/20 text-[var(--color-text-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}>
                  {section.label}
                </button>
              ))}
              <button type="button" className="rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-all">PHONE</button>
              <button type="button" className="rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-all">SMS</button>
              {detailSections.slice(3).map((section) => (
                <button key={section.key} type="button" onClick={() => setActiveTab(section.key)} className={`rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] transition-all ${activeTab === section.key ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/20 text-[var(--color-text-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}>
                  {section.label}
                </button>
              ))}
            </div>
            <div className={`${innerPanelClass} p-3`}>
              {activeTab === 'identity' ? (
                <div className="grid gap-1.5 md:grid-cols-2">
                  <div className="space-y-1 rounded border border-[var(--color-border)]/40 bg-[var(--color-bg-primary)]/40 p-2">
                    <div className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">ALLOWED</div>
                    {methods.emails.map((email) => <div key={email} className="inline-flex items-center gap-2 text-[11px] text-[var(--color-text-primary)]"><Mail size={11} className="opacity-40" />{email}</div>)}
                    {methods.phones.map((phone) => <div key={phone} className="inline-flex items-center gap-2 text-[11px] text-[var(--color-text-primary)]"><Phone size={11} className="opacity-40" />{phone}</div>)}
                  </div>
                  <div className="space-y-1 rounded border border-[var(--color-border)]/40 bg-[var(--color-bg-primary)]/40 p-2">
                    <div className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">COMPANY</div>
                    <div className="inline-flex items-center gap-2 text-[11px] text-[var(--color-text-primary)]"><Building2 size={11} className="opacity-40" />{contact.company}</div>
                    <div className="inline-flex items-center gap-2 text-[11px] text-[var(--color-text-primary)]"><MapPin size={11} className="opacity-40" />Office</div>
                  </div>
                </div>
              ) : null}
              {activeTab === 'activity' ? (
                <div className="space-y-0.5">
                  <div className="mb-2 flex items-center gap-2 border-b border-[var(--color-border)]/30 pb-2">
                    <div className="text-[10px] uppercase font-black text-[var(--color-primary)] opacity-60 px-1">{'>'}</div>
                    <input
                      type="text"
                      placeholder="Append Note to Timeline..."
                      className="flex-1 bg-transparent px-1 py-0.5 text-[11px] font-medium text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] transition-all"
                    />
                    <button type="button" className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] opacity-50 hover:opacity-100 pr-2">Log Action</button>
                  </div>
                  {(contact.timeline || []).map((activity) => {
                    const ActivityIcon = { note: FileText, email: Mail, meeting: CalendarDays, call: Phone }[activity.type] || MessageSquareText;
                    return (
                      <div key={activity.id} className="group flex flex-col gap-0.5 py-1 px-2 border-l border-transparent hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 transition-all text-[transparent] hover:text-[var(--color-primary)]/10">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <ActivityIcon size={10} className="text-[var(--color-primary)] opacity-60 shrink-0" />
                            <span className="text-[11px] font-extrabold text-[var(--color-primary)]/90 tracking-tight glow-text-sm truncate">{activity.title}</span>
                          </div>
                          <span className="text-[9px] font-mono text-[var(--color-text-tertiary)] opacity-40 shrink-0 whitespace-nowrap">{formatDate(activity.createdAt).split(',')[0]}</span>
                        </div>
                        <div className="text-[10px] text-[var(--color-text-secondary)] truncate ml-4.5 opacity-60 group-hover:opacity-100 group-hover:text-[var(--color-text-primary)] transition-all">{activity.description}</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {activeTab === 'bookings' ? (
                <div className="space-y-1">
                  {(contact.bookings || []).map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/20 py-1.5 px-2 hover:bg-[var(--color-bg-primary)]/20 transition-all">
                      <div className="inline-flex items-center gap-2 min-w-0">
                        <CalendarDays size={12} className="text-[var(--color-text-tertiary)] opacity-60" />
                        <span className="truncate text-[11px] font-bold text-[var(--color-text-primary)]">{booking.title}</span>
                        <span className="text-[9px] font-mono text-[var(--color-text-tertiary)] opacity-50">/ {booking.time}</span>
                      </div>
                      <span className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">{booking.status}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {activeTab === 'forms' ? (
                <div className="space-y-1">
                  {(contact.forms || []).map((form) => (
                    <div key={form.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/20 py-1.5 px-2 hover:bg-[var(--color-bg-primary)]/20 transition-all">
                      <div className="inline-flex items-center gap-2 min-w-0">
                        <FileText size={12} className="text-[var(--color-text-tertiary)] opacity-60" />
                        <span className="truncate text-[11px] font-bold text-[var(--color-text-primary)]">{form.name}</span>
                        <span className="text-[9px] font-mono text-[var(--color-text-tertiary)] opacity-50">/ {formatDate(form.submittedAt).split(',')[0]}</span>
                      </div>
                      <span className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">{form.status}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {activeTab === 'orders' ? (
                <div className="space-y-1">
                  {(contact.orders || []).map((order) => (
                    <div key={order.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/20 py-1.5 px-2 hover:bg-[var(--color-bg-primary)]/20 transition-all">
                      <div className="inline-flex items-center gap-2 min-w-0">
                        <CreditCard size={12} className="text-[var(--color-text-tertiary)] opacity-60" />
                        <span className="truncate text-[11px] font-bold text-[var(--color-text-primary)]">{order.id}</span>
                        <span className="text-[9px] font-mono text-[var(--color-text-tertiary)] opacity-50">/ {order.total}</span>
                      </div>
                      <span className="text-[9px] font-black uppercase text-[var(--color-text-secondary)]">{order.status}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className={`${innerPanelClass} mt-2 p-2.5 bg-transparent border-t border-[var(--color-border)]/20 rounded-none`}>
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] opacity-60">Log Supplement / Internal Context</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[var(--color-text-secondary)] opacity-70 italic">
                {contact.notes}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Island 2: Dossier Metadata */}
      <div className={`${shellPanelClass} flex min-h-0 w-[240px] min-w-[240px] flex-col overflow-hidden`}>
        <div className="border-b border-[var(--color-border)] px-3 py-1.5 bg-[var(--color-bg-primary)]/40 flex items-center justify-between">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Dossier Metadata</div>
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
            {contact.status}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          <div className={`${innerPanelClass} p-2.5`}>
            <button type="button" onClick={() => toggleDetailPanel('pipelines')} className="flex w-full items-center justify-between text-[10px] font-black uppercase tracking-[0.12em] text-[var(--color-text-primary)]">
              <span>Pipelines</span>
              <ChevronDown size={10} className={detailPanels.pipelines ? 'rotate-180' : ''} />
            </button>
            {detailPanels.pipelines ? (
              <div className="mt-2 rounded bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 p-2">
                <div className="text-[8px] font-black uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">Lead Phase</div>
                <div className="mt-0.5 text-[11px] font-bold text-[var(--color-text-primary)]">{contact.pipelineStage}</div>
              </div>
            ) : null}
          </div>
          <div className={`${innerPanelClass} p-2.5`}>
            <button type="button" onClick={() => toggleDetailPanel('billing')} className="flex w-full items-center justify-between text-[10px] font-black uppercase tracking-[0.12em] text-[var(--color-text-primary)]">
              <span>Billing / Fiscal</span>
              <ChevronDown size={10} className={detailPanels.billing ? 'rotate-180' : ''} />
            </button>
            {detailPanels.billing ? (
              <div className="mt-2 space-y-1">
                {[
                  ['Status', contact.billing.customerStatus],
                  ['Profile', contact.billing.paymentProfile],
                  ['Balance', contact.billing.balance],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center py-0.5 border-b border-[var(--color-border)]/20 last:border-0 pb-0.5">
                    <span className="text-[8px] font-black uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">{label}</span>
                    <span className="text-[10px] font-bold text-[var(--color-text-primary)]">{value}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className={`${innerPanelClass} p-2.5`}>
            <button type="button" onClick={() => toggleDetailPanel('attribution')} className="flex w-full items-center justify-between text-[10px] font-black uppercase tracking-[0.12em] text-[var(--color-text-primary)]">
              <span>System Attribution</span>
              <ChevronDown size={10} className={detailPanels.attribution ? 'rotate-180' : ''} />
            </button>
            {detailPanels.attribution ? (
              <div className="mt-2 space-y-1.5 text-[10px]">
                {[
                  ['Source', contact.source],
                  ['Created', formatDate(contact.createdAt).split(',')[0]],
                  ['Updated', formatDate(contact.updatedAt).split(',')[0]],
                  ['Contacted', formatDate(contact.lastContactedAt).split(',')[0]],
                ].map(([label, value]) => (
                  <div key={label} className="border-b border-[var(--color-border)]/20 last:border-0 pb-1">
                    <div className="text-[8px] font-black uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">{label}</div>
                    <div className="font-medium text-[var(--color-text-secondary)]">{value}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className={`${innerPanelClass} p-2.5`}>
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">Legacy Utility</div>
            <div className="mt-2 grid grid-cols-1 gap-1">
              {[
                ['Comms Summary', MessageSquareText],
                ['Portal Security', ShieldCheck],
                ['Login Status', KeyRound],
              ].map(([label, Icon]) => (
                <div key={label} className="inline-flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-[10px] text-[var(--color-text-secondary)]">
                  <Icon size={10} className="opacity-50" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
