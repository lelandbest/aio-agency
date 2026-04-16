import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  FileText,
  Filter,
  Globe,
  Hash,
  Import,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Play,
  Plus,
  PlusCircle,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Shield,
  Star,
  Tag,
  Trash2,
  UserCheck,
  UserPlus,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  bulkDeleteContactsApi,
  createContactActivityApi,
  createContactApi,
  createEmailVerificationBulkTaskApi,
  deleteContactApi,
  getCalendarEventsApi,
  getCompaniesApi,
  getCommsContactSummaryApi,
  getContactActivitiesApi,
  getContactFormSubmissionsApi,
  getContactsApi,
  getFlowsApi,
  getFormsApi,
  getOrdersApi,
  getTagsApi,
  listDeletedContactsApi,
  openThreadForContactApi,
  restoreContactApi,
  triggerFlowManualApi,
  updateContactApi,
} from '../../services/backendApi';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNotice } from '../../contexts/NoticeContext';
import { BrainIcon, Crosshair } from '../../components/ui/icons';
import SystemConfirmModal from '../../components/Modals/SystemConfirmModal';
import ModuleHeader from '../../components/ModuleHeader';
import { CRM_CONTACT_SOURCES, CRM_CONTACT_STATUSES, createContactDraft } from './schemaContract';

const shellPanelClass = 'rounded-[28px] border border-slate-900/90 bg-[#0b0b0b] shadow-[0_24px_90px_rgba(0,0,0,0.55)]';
const innerPanelClass = 'rounded-[22px] border border-slate-900/80 bg-[#050505] shadow-[0_14px_32px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.02)]';
const inputClass = 'h-8 w-full rounded border border-slate-800 bg-[#060606] px-2.5 text-[11px] font-medium text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none disabled:opacity-60';
const textareaClass = 'w-full rounded border border-slate-800 bg-[#060606] px-2.5 py-2 text-[11px] font-medium text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none disabled:opacity-60 resize-none';
const selectClass = 'h-8 w-full rounded border border-slate-800 bg-[#060606] px-2.5 text-[11px] font-medium text-slate-100 focus:border-emerald-500/40 focus:outline-none disabled:opacity-60';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.18em] text-slate-500';
const lifecycleStatuses = CRM_CONTACT_STATUSES.includes('active') ? CRM_CONTACT_STATUSES : ['active', ...CRM_CONTACT_STATUSES];
const phoneLabels = ['Main', 'Mobile', 'Office', 'Home', 'Alt'];
const feedTabs = ['Activity', 'Notes', 'Forms', 'Emails', 'Comms', 'Automations'];

const normalizeText = (value) => String(value || '').trim();
const splitMultiline = (value) => String(value || '').split('\n').map((item) => item.trim()).filter(Boolean);
const uniqueValues = (values) => Array.from(new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
const contactListIdSnippet = (value) => {
  const token = String(value || '').split('-').filter(Boolean).pop() || String(value || '');
  const raw = token.replace(/[^a-zA-Z0-9]/g, '');
  if (!raw) return '';
  return raw.length <= 4 ? raw : `${raw.slice(0, 4)}...`;
};

const formatDateTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const formatDateOnly = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
};

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numeric);
  }
  return normalizeText(value);
};

const formatScore = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const clamped = Math.max(0, Math.min(100, numeric));
    return { label: String(Math.round(clamped)), width: `${clamped}%` };
  }
  const normalized = String(value).trim();
  const mapped = {
    cold: 20,
    cool: 35,
    warm: 68,
    hot: 88,
    low: 24,
    medium: 56,
    high: 84,
  }[normalized.toLowerCase()];
  return { label: normalized, width: mapped ? `${mapped}%` : null };
};

const normalizeMethodEntries = (values, fallbackLabel) => {
  if (!Array.isArray(values)) return [];
  return values
    .map((entry, index) => {
      if (typeof entry === 'string') {
        return { value: entry.trim(), label: index === 0 ? fallbackLabel : '' };
      }
      if (entry && typeof entry === 'object') {
        return {
          value: normalizeText(entry.value || entry.number || entry.email || entry.address || entry.phone),
          label: normalizeText(entry.label || entry.type || ''),
        };
      }
      return { value: '', label: '' };
    })
    .filter((entry) => entry.value);
};

const readContactMethods = (contact) => {
  const custom = contact?.customFields || {};
  const phoneEntries = normalizeMethodEntries(custom.phones, 'Main');
  const emailEntries = normalizeMethodEntries(custom.emails, 'Primary');
  return {
    phones: phoneEntries.length ? phoneEntries : (normalizeText(contact?.phone) ? [{ value: normalizeText(contact.phone), label: 'Main' }] : []),
    emails: emailEntries.length ? emailEntries : (normalizeText(contact?.email) ? [{ value: normalizeText(contact.email), label: 'Primary' }] : []),
    notes: normalizeText(custom.notes),
    displayName: normalizeText(custom.displayName),
  };
};

const contactDisplayName = (contact) => {
  const methods = readContactMethods(contact);
  const fullName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim();
  return methods.displayName || fullName || contact?.email || contact?.phone || 'Untitled contact';
};

const draftFromContact = (contact, companies) => {
  const methods = readContactMethods(contact);
  const company = companies.find((item) => item.id === contact?.companyId);
  const address = contact?.address || contact?.customFields?.address || {};
  return {
    displayName: methods.displayName,
    firstName: contact?.firstName || '',
    lastName: contact?.lastName || '',
    title: contact?.title || '',
    department: contact?.department || '',
    phonesText: methods.phones.map((entry) => entry.value).join('\n'),
    emailsText: methods.emails.map((entry) => entry.value).join('\n'),
    companyName: company?.name || contact?.company || '',
    owner: contact?.owner || '',
    status: contact?.status || 'active',
    source: contact?.source || 'manual',
    tagsText: Array.isArray(contact?.tags) ? contact.tags.join(', ') : '',
    notes: methods.notes,
    website: contact?.website || '',
    aiEmployee: contact?.aiEmployee || '',
    quality: contact?.quality ?? '',
    engagement: contact?.engagement ?? '',
    pipelineStage: contact?.pipelineStage || '',
    addressLabel: normalizeText(address.label) || 'Business Address',
    addressLine1: normalizeText(address.line1 || address.address1 || address.street1 || address.street),
    addressLine2: normalizeText(address.line2 || address.address2 || address.street2),
    addressCity: normalizeText(address.city),
    addressState: normalizeText(address.state || address.region),
    addressPostalCode: normalizeText(address.postalCode || address.zip || address.zipCode),
    addressCountry: normalizeText(address.country),
  };
};

const buildContactPayload = (draft, companies) => {
  const firstName = normalizeText(draft.firstName);
  const lastName = normalizeText(draft.lastName);
  const displayName = normalizeText(draft.displayName);
  const phones = splitMultiline(draft.phonesText);
  const emails = splitMultiline(draft.emailsText).map((item) => item.toLowerCase());
  if (!displayName && !firstName && !lastName && !phones.length && !emails.length) {
    throw new Error('A contact requires a name, email, or phone number.');
  }
  const companyName = normalizeText(draft.companyName);
  const companyMatch = companies.find((company) => company.name?.toLowerCase() === companyName.toLowerCase());
  const qualityText = normalizeText(draft.quality);
  const engagementText = normalizeText(draft.engagement);
  const normalizedQuality = qualityText === '' ? null : (Number.isFinite(Number(qualityText)) ? Number(qualityText) : qualityText);
  const normalizedEngagement = engagementText === '' ? null : (Number.isFinite(Number(engagementText)) ? Number(engagementText) : engagementText);
  const address = {
    label: normalizeText(draft.addressLabel) || 'Business Address',
    line1: normalizeText(draft.addressLine1),
    line2: normalizeText(draft.addressLine2),
    city: normalizeText(draft.addressCity),
    state: normalizeText(draft.addressState),
    postalCode: normalizeText(draft.addressPostalCode),
    country: normalizeText(draft.addressCountry),
  };
  const hasAddress = Object.values(address).some(Boolean);
  return {
    displayName: displayName || null,
    firstName: firstName || null,
    lastName: lastName || null,
    title: normalizeText(draft.title) || null,
    department: normalizeText(draft.department) || null,
    email: emails[0] || null,
    phone: phones[0] || null,
    company: companyName || null,
    companyId: companyMatch?.id || null,
    owner: normalizeText(draft.owner) || null,
    status: draft.status || 'active',
    source: normalizeText(draft.source) || null,
    tags: String(draft.tagsText || '').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean),
    website: normalizeText(draft.website) || null,
    aiEmployee: normalizeText(draft.aiEmployee) || null,
    quality: normalizedQuality,
    engagement: normalizedEngagement,
    pipelineStage: normalizeText(draft.pipelineStage) || null,
    address: hasAddress ? address : {},
    customFields: {
      displayName: displayName || null,
      emails,
      phones,
      notes: normalizeText(draft.notes) || null,
    },
  };
};

const orderContactKeys = (contact) => uniqueValues([contact?.id, contact?.contactId, contact?.email]);

const matchesContactReference = (candidate, contact) => {
  const values = uniqueValues([candidate]).map((value) => value.toLowerCase());
  const keys = orderContactKeys(contact).map((value) => String(value).toLowerCase());
  return values.some((value) => keys.includes(value));
};

const compactSubmissionSummary = (submissionData) => {
  const pairs = Object.entries(submissionData || {}).filter(([, value]) => value !== null && value !== undefined && `${value}`.trim() !== '');
  return pairs.slice(0, 2).map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value)}`).join(' • ');
};

const normalizeFeedItem = (item, formsById) => {
  const metadata = item?.metadata || {};
  const rawType = String(item?.activityType || item?.activity_type || item?.type || '').trim().toLowerCase();
  const automated = Boolean(
    item?.source === 'automation' ||
    metadata?.source === 'automation' ||
    metadata?.automationId ||
    metadata?.automation_id ||
    rawType === 'automation' ||
    rawType === 'workflow' ||
    rawType === 'flow' ||
    rawType === 'auto'
  );

  if (item?.feedType === 'form_submission') {
    const formName = formsById.get(item.formId)?.name || normalizeText(item.formName) || 'Form submission';
    return {
      id: `form-submission-${item.id}`,
      createdAt: item.submittedAt || item.createdAt,
      title: formName,
      description: compactSubmissionSummary(item.submissionData) || 'Submitted via connected form.',
      filter: 'Forms',
      typeLabel: 'Forms',
      icon: FileText,
      iconClassName: 'text-blue-500/60',
      accentClassName: 'text-blue-300',
    };
  }

  let filter = 'Activity';
  let typeLabel = 'Activity';
  let icon = Clock;
  let iconClassName = 'text-emerald-500/60';
  let accentClassName = 'text-emerald-400';

  if (rawType === 'note') {
    filter = 'Notes';
    typeLabel = 'Notes';
    icon = FileText;
  } else if (rawType === 'email') {
    filter = 'Emails';
    typeLabel = 'Emails';
    icon = Mail;
    iconClassName = 'text-cyan-500/60';
  } else if (['call', 'sms', 'meeting'].includes(rawType)) {
    filter = automated ? 'Automations' : 'Comms';
    typeLabel = automated ? 'Automations' : 'Comms';
    icon = rawType === 'call' ? Phone : rawType === 'meeting' ? CalendarDays : MessageSquareText;
    iconClassName = 'text-blue-500/60';
    accentClassName = automated ? 'text-amber-300' : 'text-emerald-400';
  } else if (automated) {
    filter = 'Automations';
    typeLabel = 'Automations';
    icon = Zap;
    iconClassName = 'text-amber-500/60';
    accentClassName = 'text-amber-300';
  } else if (rawType === 'form') {
    filter = 'Forms';
    typeLabel = 'Forms';
    icon = FileText;
    iconClassName = 'text-blue-500/60';
    accentClassName = 'text-blue-300';
  }

  return {
    id: item?.id || `${rawType || 'activity'}-${item?.createdAt || Math.random()}`,
    createdAt: item?.createdAt,
    title: normalizeText(item?.title) || 'Untitled activity',
    description: normalizeText(item?.description) || '',
    filter,
    typeLabel,
    icon,
    iconClassName,
    accentClassName,
  };
};

function ContactFields({ draft, setDraft, companies, disabled = false }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div><div className={labelClass}>Display Name</div><input disabled={disabled} value={draft.displayName} onChange={(event) => update('displayName', event.target.value)} className={inputClass} placeholder="Preferred dossier name" /></div>
        <div><div className={labelClass}>Company</div><input disabled={disabled} list="crm-company-options" value={draft.companyName} onChange={(event) => update('companyName', event.target.value)} className={inputClass} placeholder="Optional linked company" /></div>
        <div><div className={labelClass}>First Name</div><input disabled={disabled} value={draft.firstName} onChange={(event) => update('firstName', event.target.value)} className={inputClass} /></div>
        <div><div className={labelClass}>Last Name</div><input disabled={disabled} value={draft.lastName} onChange={(event) => update('lastName', event.target.value)} className={inputClass} /></div>
        <div><div className={labelClass}>Owner</div><input disabled={disabled} value={draft.owner} onChange={(event) => update('owner', event.target.value)} className={inputClass} /></div>
        <div><div className={labelClass}>Status</div><select disabled={disabled} value={draft.status} onChange={(event) => update('status', event.target.value)} className={selectClass}>{lifecycleStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
        <div><div className={labelClass}>Source</div><select disabled={disabled} value={draft.source} onChange={(event) => update('source', event.target.value)} className={selectClass}>{CRM_CONTACT_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}</select></div>
        <div><div className={labelClass}>Tags</div><input disabled={disabled} value={draft.tagsText} onChange={(event) => update('tagsText', event.target.value)} className={inputClass} placeholder="comma,separated,tags" /></div>
      </div>
      <datalist id="crm-company-options">{companies.map((company) => <option key={company.id} value={company.name} />)}</datalist>
      <div className="grid gap-4 md:grid-cols-2">
        <div><div className={labelClass}>Emails</div><textarea disabled={disabled} value={draft.emailsText} onChange={(event) => update('emailsText', event.target.value)} className={`${textareaClass} min-h-[120px]`} placeholder="One email per line" /></div>
        <div><div className={labelClass}>Phones</div><textarea disabled={disabled} value={draft.phonesText} onChange={(event) => update('phonesText', event.target.value)} className={`${textareaClass} min-h-[120px]`} placeholder="One phone per line" /></div>
      </div>
      <div><div className={labelClass}>Notes</div><textarea disabled={disabled} value={draft.notes} onChange={(event) => update('notes', event.target.value)} className={`${textareaClass} min-h-[120px]`} placeholder="Internal context only. This does not create timeline events." /></div>
    </div>
  );
}

function ModalShell({ title, subtitle, widthClass = 'max-w-xl', onClose, children }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
      <div className={`w-full ${widthClass} rounded-[26px] border border-slate-900 bg-[#0b0b0b] shadow-[0_24px_80px_rgba(0,0,0,0.55)]`}>
        <div className="flex items-center justify-between border-b border-slate-900 px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{title}</div>
            {subtitle ? <h2 className="mt-1 text-lg font-semibold text-slate-100">{subtitle}</h2> : null}
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-slate-100"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateContactModal({ companies, saving, onClose, onCreate }) {
  const [draft, setDraft] = useState({ ...createContactDraft(), displayName: '', phonesText: '', emailsText: '', companyName: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setError('');
      await onCreate(buildContactPayload(draft, companies));
    } catch (issue) {
      setError(issue.message || 'Unable to create contact.');
    }
  };

  return (
    <ModalShell title="Create Contact" subtitle="Create a real dossier" widthClass="max-w-3xl" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
        <ContactFields draft={draft} setDraft={setDraft} companies={companies} />
        {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
        <div className="flex items-center justify-between gap-3 border-t border-slate-900 pt-4">
          <p className="text-sm text-slate-400">Minimal identity is required: name, email, or phone.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-400 hover:text-slate-100">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary-skeuo !px-4 !py-2 !text-sm !font-medium">{saving ? 'Creating...' : 'Create Contact'}</button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
function BulkTagModal({ saving, onClose, onConfirm }) {
  const [tagsText, setTagsText] = useState('');
  return (
    <ModalShell title="Bulk Tag" subtitle="Apply tags to selected contacts" onClose={onClose}>
      <div className="space-y-4 px-5 py-5">
        <div>
          <div className={labelClass}>Tags</div>
          <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} className={`${inputClass} mt-2`} placeholder="comma,separated,tags" />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-900 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-400 hover:text-slate-100">Cancel</button>
          <button type="button" disabled={saving || !normalizeText(tagsText)} onClick={() => onConfirm(tagsText)} className="btn-primary-skeuo !px-4 !py-2 !text-sm !font-medium">{saving ? 'Applying...' : 'Apply Tags'}</button>
        </div>
      </div>
    </ModalShell>
  );
}

function AddToFlowModal({ flows, saving, onClose, onConfirm }) {
  const selectableFlows = flows.filter((flow) => String(flow?.status || '').toLowerCase() !== 'archived');
  const [selectedFlowId, setSelectedFlowId] = useState(selectableFlows[0]?.id || '');
  return (
    <ModalShell title="Add To Flow" subtitle="Trigger an existing flow for selected contacts" onClose={onClose}>
      <div className="space-y-4 px-5 py-5">
        <div>
          <div className={labelClass}>Flow</div>
          <select value={selectedFlowId} onChange={(event) => setSelectedFlowId(event.target.value)} className={`${selectClass} mt-2`}>
            {selectableFlows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name || flow.id}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-900 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-400 hover:text-slate-100">Cancel</button>
          <button type="button" disabled={saving || !selectedFlowId} onClick={() => onConfirm(selectedFlowId)} className="btn-primary-skeuo !px-4 !py-2 !text-sm !font-medium">{saving ? 'Launching...' : 'Add To Flow'}</button>
        </div>
      </div>
    </ModalShell>
  );
}

function BookingModal({ bookings, onClose }) {
  return (
    <ModalShell title="Bookings" subtitle="Live contact-linked bookings" onClose={onClose}>
      <div className="space-y-4 px-5 py-5">
        {bookings.length ? (
          <div className="space-y-2">
            {bookings.map((booking) => (
              <div key={booking.id} className="rounded border border-blue-500/20 bg-[#050505] px-3 py-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.28)]">
                <div className="truncate text-[11px] font-black text-blue-300">{normalizeText(booking.title) || 'Untitled booking'}</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{formatDateTime(booking.startTime || booking.start_time)}</div>
                <div className="mt-1 text-[10px] text-slate-400">{normalizeText(booking.status) || 'Scheduled'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded border border-slate-900 bg-[#050505] px-4 py-10 text-center text-[10px] font-medium italic text-slate-600">No contact-linked bookings found.</div>
        )}
        <div className="flex items-center justify-end border-t border-slate-900 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-400 hover:text-slate-100">Close</button>
        </div>
      </div>
    </ModalShell>
  );
}
function CRMContactList({
  contacts,
  loading,
  showDeleted,
  selectedContactId,
  selectedIds,
  onSelectContact,
  onToggleSelect,
  onToggleSelectAll,
  onBulkTag,
  onBulkDelete,
  onBulkVerify,
  onBulkAddToFlow,
}) {
  const allSelected = contacts.length > 0 && contacts.every((contact) => selectedIds.includes(contact.id));

  if (loading) {
    return (
      <div className={`${shellPanelClass} flex min-h-0 flex-col overflow-hidden !bg-transparent !shadow-none border-slate-900/80`}>
        <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading contacts...</div>
      </div>
    );
  }

  return (
    <div className={`${shellPanelClass} flex min-h-0 flex-col overflow-visible !bg-transparent !shadow-none border-slate-900/80`}>
      <div className="flex items-center justify-between px-3 py-2">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 opacity-70 italic">{showDeleted ? 'Deleted Dossiers' : 'Operator Index'}</div>
          <div className="text-[12px] font-bold text-slate-400">{showDeleted ? 'Deleted Contacts' : 'Operator Index'}</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled className="h-6 rounded border border-slate-800 bg-[#111] px-2 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 opacity-40">Import</button>
          <button type="button" disabled className="h-6 rounded border border-slate-800 bg-[#111] px-2 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 opacity-40">Export</button>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">{contacts.length} Rows</div>
        </div>
      </div>

      {!showDeleted && selectedIds.length > 0 ? (
        <div className="mx-1 mb-2 flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 shadow-[0_4px_12px_rgba(16,185,129,0.15)]">
          <div className="shrink-0 text-[10px] font-black uppercase tracking-tighter text-emerald-400">{selectedIds.length} Selected</div>
          <div className="h-3 w-px bg-emerald-500/20" />
          <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
            <button type="button" onClick={onBulkTag} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.05em] text-emerald-400/80 hover:text-emerald-300"><Tag size={10} />Tag</button>
            <button type="button" onClick={onBulkDelete} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.05em] text-emerald-400/80 hover:text-emerald-300"><Trash2 size={10} />Delete</button>
            <button type="button" onClick={onBulkVerify} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.05em] text-emerald-400/80 hover:text-emerald-300"><Shield size={10} />Verify</button>
            <button type="button" onClick={onBulkAddToFlow} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.05em] text-emerald-400/80 hover:text-emerald-300"><Play size={10} />Add to Flow</button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-[32px_45px_1.5fr_1.2fr_0.8fr_1fr_80px] items-center gap-2 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
        <div className="flex justify-center">
          {!showDeleted ? (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleSelectAll}
              className="h-3 w-3 cursor-pointer rounded border-slate-700 bg-black accent-emerald-500"
            />
          ) : null}
        </div>
        <div className="pl-1">#</div>
        <div>First / Last</div>
        <div>Company</div>
        <div>Methods</div>
        <div>Owner</div>
        <div className="text-right">Status</div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {contacts.length ? contacts.map((contact) => {
          const methods = readContactMethods(contact);
          const active = selectedContactId === contact.id;
          const isSelected = selectedIds.includes(contact.id);
          const isVerified = contact.emailVerified === true || String(contact.emailVerificationStatus || '').toLowerCase() === 'verified';
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => onSelectContact(contact.id)}
              className={`group relative grid w-full grid-cols-[32px_1fr] items-center gap-0 px-3 py-1 text-left transition-all ${active ? 'rounded-lg border border-slate-700/80 bg-[#161616] shadow-[0_8px_30px_rgba(0,0,0,0.5)]' : 'rounded-lg border border-slate-800/40 bg-[#0a0a0a]/40 hover:border-slate-800 hover:bg-[#111] hover:shadow-lg'} ${isSelected ? 'border-emerald-500/20' : ''}`}
            >
              {active ? <div className="absolute left-0 top-1 bottom-1 w-1 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]" /> : null}
              <div className="z-20 flex justify-center">
                {!showDeleted ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(event) => {
                      event.stopPropagation();
                      onToggleSelect(contact.id);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="h-3 w-3 cursor-pointer rounded border-slate-700 bg-black accent-emerald-500"
                  />
                ) : null}
              </div>

              <div className={`grid grid-cols-[45px_1.5fr_1.2fr_0.8fr_1fr_80px] items-center gap-2 transition-transform duration-200 ${active ? 'translate-x-2' : 'group-hover:translate-x-1'}`}>
                <div className={`text-[10px] font-black font-mono uppercase ${active ? 'text-emerald-500' : 'text-slate-600 opacity-80'}`}>
                  {contactListIdSnippet(contact.id)}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`truncate text-[11px] font-extrabold ${active ? 'text-emerald-400' : 'text-slate-200'}`}>{contactDisplayName(contact)}</span>
                    {isVerified ? <Star size={9} className="shrink-0 fill-emerald-400/20 text-emerald-500" /> : null}
                  </div>
                  {showDeleted && contact.deletedAt ? <div className="mt-0.5 text-[9px] text-slate-600">{formatDateOnly(contact.deletedAt)}</div> : null}
                </div>
                <div className="truncate text-[10px] font-medium text-slate-400">{normalizeText(contact.company)}</div>
                <div className="flex items-center gap-2 text-slate-600">
                  {methods.emails.length ? <Mail size={10} className={active ? 'text-emerald-400/80' : 'text-slate-600'} /> : null}
                  {methods.phones.length ? <Phone size={10} className={active ? 'text-emerald-400/80' : 'text-slate-600'} /> : null}
                  {!methods.emails.length && !methods.phones.length ? <span className="text-[9px] italic text-slate-700">--</span> : null}
                </div>
                <div className="truncate text-[10px] font-medium text-slate-400">{normalizeText(contact.owner)}</div>
                <div className="flex items-center justify-end gap-1.5 pr-1">
                  <span className={`truncate text-[8px] font-black uppercase tracking-[0.1em] ${active ? 'text-emerald-400' : 'text-slate-600'}`}>{normalizeText(contact.status)}</span>
                  <ChevronRight size={10} className={`text-slate-600 opacity-0 transition-all group-hover:opacity-100 ${active ? 'translate-x-0.5 text-emerald-400 opacity-100' : ''}`} />
                </div>
              </div>
            </button>
          );
        }) : (
          <div className="px-4 py-10 text-center text-sm text-slate-500">{showDeleted ? 'No deleted contacts.' : 'No contacts found.'}</div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-slate-950 px-3 py-1.5">
        <div className="text-[9px] font-medium italic text-slate-600">{showDeleted ? 'Soft-deleted records only' : 'Live CRM dossiers only'}</div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{showDeleted ? 'Archive View' : 'Live Index'}</span>
        </div>
      </div>
    </div>
  );
}

function CRMModule({ initialContactId = null, onSelectContact = null }) {
  const { tenant, tenants = [] } = useAuth();
  const { openAIAssist } = useAIAssist();
  const { showNotice } = useNotice();

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [contacts, setContacts] = useState([]);
  const [deletedContacts, setDeletedContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [tags, setTags] = useState([]);
  const [orders, setOrders] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [flows, setFlows] = useState([]);
  const [forms, setForms] = useState([]);

  const [contactActivities, setContactActivities] = useState([]);
  const [contactFormSubmissions, setContactFormSubmissions] = useState([]);
  const [commsSummary, setCommsSummary] = useState({ smsThreadCount: 0, callCount: 0, lastSmsAt: null, lastCallAt: null });

  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState(initialContactId);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editDraft, setEditDraft] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [detailPanels, setDetailPanels] = useState({
    dossier: false,
    address: false,
    consent: false,
    automations: true,
    accounting: true,
    bookings: true,
    comms: true,
    pipelines: true,
    related: false,
  });
  const [activeFeedTab, setActiveFeedTab] = useState('Activity');
  const [noteDraft, setNoteDraft] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const mountRef = React.useRef(false);
  const prevShowDeletedRef = React.useRef(showDeleted);

  const allAvailableTags = useMemo(() => {
    const set = new Set();
    contacts.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [contacts]);

  const visibleContacts = showDeleted ? deletedContacts : contacts;
  const selectedContact = useMemo(() => visibleContacts.find((contact) => contact.id === selectedContactId) || null, [visibleContacts, selectedContactId]);
  const selectedCompany = useMemo(() => companies.find((company) => company.id === selectedContact?.companyId) || null, [companies, selectedContact]);
  const formsById = useMemo(() => new Map(forms.map((form) => [form.id, form])), [forms]);

  const filteredContacts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return visibleContacts;
    return visibleContacts.filter((contact) => [contactDisplayName(contact), contact.email, contact.phone, contact.company, contact.owner, contact.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [visibleContacts, searchTerm]);

  const liveContactMap = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const selectedMethods = readContactMethods(selectedContact);
  const qualityScore = formatScore(selectedContact?.quality);
  const engagementScore = formatScore(selectedContact?.engagement);

  const feedItems = useMemo(() => {
    const activityItems = contactActivities.map((item) => normalizeFeedItem(item, formsById));
    const formItems = contactFormSubmissions.map((item) => normalizeFeedItem({ ...item, feedType: 'form_submission' }, formsById));
    return [...activityItems, ...formItems].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
  }, [contactActivities, contactFormSubmissions, formsById]);

  const filteredFeedItems = useMemo(() => {
    if (activeFeedTab === 'Activity') return feedItems;
    return feedItems.filter((item) => item.filter === activeFeedTab);
  }, [activeFeedTab, feedItems]);

  const toggleDetailPanel = (key) => setDetailPanels((current) => ({ ...current, [key]: !current[key] }));

  const automationItems = useMemo(() => feedItems.filter((item) => item.filter === 'Automations').slice(0, 3), [feedItems]);

  const bookingItems = useMemo(() => {
    if (!selectedContact) return [];
    const normalizedEmail = normalizeText(selectedContact.email).toLowerCase();
    const contactKeys = orderContactKeys(selectedContact).map((value) => String(value).toLowerCase());
    return calendarEvents
      .filter((event) => {
        const candidates = uniqueValues([
          event?.contactId,
          event?.contact_id,
          event?.guestEmail,
          event?.guest_email,
        ]).map((value) => String(value).toLowerCase());
        return candidates.some((value) => contactKeys.includes(value)) || (normalizedEmail && candidates.includes(normalizedEmail));
      })
      .sort((left, right) => new Date(left?.startTime || left?.start_time || 0).getTime() - new Date(right?.startTime || right?.start_time || 0).getTime());
  }, [calendarEvents, selectedContact]);

  const billingItems = useMemo(() => {
    if (!selectedContact) return [];
    return orders.filter((order) => matchesContactReference(order?.contactId || order?.contact_id || order?.email || order?.customerEmail, selectedContact));
  }, [orders, selectedContact]);

  const toolbarSelectionIds = useMemo(() => {
    if (selectedIds.length) return selectedIds;
    return selectedContact?.id ? [selectedContact.id] : [];
  }, [selectedIds, selectedContact]);
  const hasToolbarSelection = toolbarSelectionIds.length > 0;

  const totalBilling = useMemo(() => billingItems.reduce((sum, order) => {
    const amount = Number(order?.totalAmount ?? order?.total_amount ?? order?.amount ?? 0);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0), [billingItems]);
  const activeContactCount = contacts.length;
  const qualifiedContactCount = useMemo(() => contacts.filter((contact) => /qualif/i.test(`${contact?.status || ''} ${contact?.pipelineStage || ''}`)).length, [contacts]);
  const bookingsPendingCount = useMemo(() => calendarEvents.filter((event) => /pending/i.test(String(event?.status || ''))).length, [calendarEvents]);
  const atRiskContactCount = useMemo(() => contacts.filter((contact) => /at[- ]?risk|risk/i.test(`${contact?.status || ''} ${contact?.pipelineStage || ''}`)).length, [contacts]);
  const selectedAddress = useMemo(() => {
    if (!selectedContact) return null;
    const source = selectedContact.address || selectedContact.customFields?.address || null;
    if (!source) return null;
    if (typeof source === 'string') {
      const lines = splitMultiline(source);
      return lines.length ? { label: 'Business Address', lines, country: '' } : null;
    }
    const line1 = normalizeText(source.line1 || source.address1 || source.street1 || source.street);
    const line2 = normalizeText(source.line2 || source.address2 || source.street2);
    const localityParts = [normalizeText(source.city), [normalizeText(source.state || source.region), normalizeText(source.postalCode || source.zip || source.zipCode)].filter(Boolean).join(' ')].filter(Boolean);
    const locality = localityParts.join(', ');
    const lines = [line1, line2, locality].filter(Boolean);
    if (!lines.length) return null;
    return {
      label: normalizeText(source.label) || 'Business Address',
      lines,
      country: normalizeText(source.country),
    };
  }, [selectedContact]);
  const consentRows = useMemo(() => [
    { label: 'Email Opt-In', enabled: selectedContact ? selectedContact.doNotEmail === false : false },
    { label: 'SMS Opt-In', enabled: selectedContact ? (selectedContact.doNotSms === false || selectedContact.optedIntoSms === true) : false },
    { label: 'Call Opt-In', enabled: selectedContact ? selectedContact.doNotCall === false : false },
    { label: 'Automation', enabled: selectedContact ? Boolean(selectedContact.optedIntoMarketing) : false },
  ], [selectedContact]);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [nextContacts, nextDeletedContacts, nextCompanies, nextTags] = await Promise.all([
        getContactsApi(),
        listDeletedContactsApi(),
        getCompaniesApi(),
        getTagsApi(),
      ]);

      const secondaryResults = await Promise.allSettled([
        getOrdersApi(),
        getCalendarEventsApi(),
        getFlowsApi(),
        getFormsApi(true),
      ]);

      // Batched State Update
      const finalContacts = Array.isArray(nextContacts) ? nextContacts.filter((contact) => !contact.deletedAt) : [];
      setContacts(finalContacts);
      setDeletedContacts(Array.isArray(nextDeletedContacts) ? nextDeletedContacts : []);
      setCompanies(Array.isArray(nextCompanies) ? nextCompanies : []);
      setTags(Array.isArray(nextTags) ? nextTags : []);

      setOrders(secondaryResults[0].status === 'fulfilled' && Array.isArray(secondaryResults[0].value) ? secondaryResults[0].value : []);
      setCalendarEvents(secondaryResults[1].status === 'fulfilled' && Array.isArray(secondaryResults[1].value) ? secondaryResults[1].value : []);
      setFlows(secondaryResults[2].status === 'fulfilled' && Array.isArray(secondaryResults[2].value) ? secondaryResults[2].value : []);
      setForms(secondaryResults[3].status === 'fulfilled' && Array.isArray(secondaryResults[3].value) ? secondaryResults[3].value : []);

      setSelectedContactId((current) => {
        const target = current || initialContactId;
        if (!target) return null;
        const pool = [...finalContacts, ...(Array.isArray(nextDeletedContacts) ? nextDeletedContacts : [])];
        return pool.some((contact) => contact.id === target) ? target : null;
      });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to load CRM records.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsInitialLoad(false);
    }
  }, [initialContactId, showNotice]);

  const loadSelectedContactData = useCallback(async (contactId) => {
    if (!contactId) {
      setContactActivities([]);
      setContactFormSubmissions([]);
      setCommsSummary({ smsThreadCount: 0, callCount: 0, lastSmsAt: null, lastCallAt: null });
      return;
    }
    setDetailLoading(true);
    const [activitiesResult, submissionsResult, commsResult] = await Promise.allSettled([
      getContactActivitiesApi(contactId),
      getContactFormSubmissionsApi(contactId),
      getCommsContactSummaryApi(contactId),
    ]);
    setContactActivities(activitiesResult.status === 'fulfilled' && Array.isArray(activitiesResult.value) ? activitiesResult.value : []);
    setContactFormSubmissions(submissionsResult.status === 'fulfilled' && Array.isArray(submissionsResult.value) ? submissionsResult.value : []);
    setCommsSummary(commsResult.status === 'fulfilled' && commsResult.value ? commsResult.value : { smsThreadCount: 0, callCount: 0, lastSmsAt: null, lastCallAt: null });
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (mountRef.current) return;
    mountRef.current = true;
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (onSelectContact) onSelectContact(selectedContactId || null);
  }, [onSelectContact, selectedContactId]);

  useEffect(() => {
    setEditDraft(selectedContact ? draftFromContact(selectedContact, companies) : null);
    setEditMode(false);
    setActiveFeedTab('Activity');
    setNoteDraft('');
  }, [selectedContact, companies]);

  useEffect(() => {
    if (prevShowDeletedRef.current !== showDeleted) {
      setSelectedIds([]);
      setSelectedContactId(null);
      prevShowDeletedRef.current = showDeleted;
    }
  }, [showDeleted]);

  useEffect(() => {
    if (!selectedContact || showDeleted) {
      setContactActivities([]);
      setContactFormSubmissions([]);
      setCommsSummary({ smsThreadCount: 0, callCount: 0, lastSmsAt: null, lastCallAt: null });
      setDetailLoading(false);
      return;
    }
    loadSelectedContactData(selectedContact.id);
  }, [selectedContact, showDeleted, loadSelectedContactData]);

  const openCrmAssist = () => toggleAIAssist({
    mode: 'help',
    context: {
      module: 'crm',
      selectedContactId: selectedContact?.id || null,
      selectedContactName: selectedContact ? contactDisplayName(selectedContact) : null,
      contactCount: contacts.length,
    },
  });

  const handleCreateContact = async (payload) => {
    setCreating(true);
    try {
      const created = await createContactApi(payload);
      setShowCreateModal(false);
      setShowDeleted(false);
      await loadData({ silent: true });
      if (created?.id) setSelectedContactId(created.id);
      showNotice({ type: 'success', message: 'Contact created.' });
    } finally {
      setCreating(false);
    }
  };

  const handleSaveContact = async () => {
    if (!selectedContact || !editDraft || showDeleted) return;
    let payload;
    try {
      payload = buildContactPayload(editDraft, companies);
    } catch (issue) {
      showNotice({ type: 'error', message: issue.message || 'Unable to save contact.' });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateContactApi(selectedContact.id, payload);
      setContacts((current) => current.map((contact) => (contact.id === updated.id ? updated : contact)));
      setEditDraft(draftFromContact(updated, companies));
      setEditMode(false);
      showNotice({ type: 'success', message: 'Contact updated.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to save contact.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveTag = async (contactId, tagToRemove) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    const nextTags = (contact.tags || []).filter((t) => t !== tagToRemove);
    try {
      await updateContactApi(contactId, { tags: nextTags });
      await loadData({ silent: true });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to remove tag.' });
    }
  };

  const handleAddTag = async (contactId, newTag) => {
    const trimmed = newTag.trim().toUpperCase();
    if (!trimmed) return;
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    if ((contact.tags || []).includes(trimmed)) {
      setTagInput('');
      setShowTagDropdown(false);
      return;
    }
    const nextTags = uniqueValues([...(contact.tags || []), trimmed]);
    try {
      await updateContactApi(contactId, { tags: nextTags });
      setTagInput('');
      setShowTagDropdown(false);
      await loadData({ silent: true });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to apply tag.' });
    }
  };

  const handleDeleteContact = async () => {
    if (!selectedContact) return;
    const deletedSnapshot = selectedContact;
    setDeleting(true);
    try {
      await deleteContactApi(deletedSnapshot.id);
      setConfirmDelete(false);
      setSelectedContactId(null);
      setContacts((current) => current.filter((contact) => contact.id !== deletedSnapshot.id));
      await loadData({ silent: true });
      showNotice({
        type: 'success',
        message: 'Contact deleted.',
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await restoreContactApi(deletedSnapshot.id);
              setShowDeleted(false);
              await loadData({ silent: true });
              setSelectedContactId(deletedSnapshot.id);
              showNotice({ type: 'success', message: 'Contact restored.' });
            } catch (error) {
              showNotice({ type: 'error', message: error.message || 'Unable to restore contact.' });
            }
          },
        },
      });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to delete contact.' });
    } finally {
      setDeleting(false);
    }
  };

  const handleRestoreContact = async (contactId) => {
    if (!contactId) return;
    setRestoring(true);
    try {
      await restoreContactApi(contactId);
      setShowDeleted(false);
      await loadData({ silent: true });
      setSelectedContactId(contactId);
      showNotice({ type: 'success', message: 'Contact restored.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to restore contact.' });
    } finally {
      setRestoring(false);
    }
  };

  const handleToggleSelect = (contactId) => {
    setSelectedIds((current) => current.includes(contactId) ? current.filter((id) => id !== contactId) : [...current, contactId]);
  };

  const handleToggleSelectAll = () => {
    setSelectedIds((current) => {
      const visibleIds = filteredContacts.map((contact) => contact.id);
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => current.includes(id));
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return uniqueValues([...current, ...visibleIds]);
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    setBulkSaving(true);
    try {
      await bulkDeleteContactsApi(selectedIds);
      setSelectedIds([]);
      if (selectedContact && selectedIds.includes(selectedContact.id)) setSelectedContactId(null);
      await loadData({ silent: true });
      showNotice({ type: 'success', message: 'Selected contacts deleted.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to delete selected contacts.' });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkVerify = async () => {
    if (!selectedIds.length) return;
    setBulkSaving(true);
    try {
      await createEmailVerificationBulkTaskApi({ contactIds: selectedIds, mode: 'power' });
      showNotice({ type: 'success', message: 'Bulk verification queued.' });
      await loadData({ silent: true });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to queue bulk verification.' });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkTag = async (tagsText) => {
    const nextTags = String(tagsText || '').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
    if (!nextTags.length) return;
    setBulkSaving(true);
    try {
      await Promise.all(selectedIds.map((contactId) => {
        const existing = liveContactMap.get(contactId);
        const merged = uniqueValues([...(existing?.tags || []), ...nextTags]);
        return updateContactApi(contactId, { tags: merged });
      }));
      setShowTagModal(false);
      await loadData({ silent: true });
      showNotice({ type: 'success', message: 'Tags applied.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to apply tags.' });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleTriggerFlow = async (flowId, contactIds) => {
    if (!flowId || !contactIds.length) return;
    setBulkSaving(true);
    try {
      await triggerFlowManualApi(flowId, { contactIds });
      setShowFlowModal(false);
      showNotice({ type: 'success', message: 'Flow triggered.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to trigger flow.' });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleOpenFlowModalForSelection = () => {
    if (!flows.length) {
      showNotice({ type: 'error', message: 'No live flows available.' });
      return;
    }
    setShowFlowModal(true);
  };
  const handleToolbarVerify = async () => {
    if (!toolbarSelectionIds.length) return;
    setBulkSaving(true);
    try {
      await createEmailVerificationBulkTaskApi({ contactIds: toolbarSelectionIds, mode: 'power' });
      showNotice({ type: 'success', message: 'Bulk verification queued.' });
      await loadData({ silent: true });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to queue bulk verification.' });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleToolbarTag = () => {
    if (!toolbarSelectionIds.length) return;
    setSelectedIds(toolbarSelectionIds);
    setShowTagModal(true);
  };

  const handleToolbarDelete = async () => {
    if (!toolbarSelectionIds.length) return;
    if (toolbarSelectionIds.length === 1 && selectedContact?.id === toolbarSelectionIds[0]) {
      setConfirmDelete(true);
      return;
    }
    setBulkSaving(true);
    try {
      await bulkDeleteContactsApi(toolbarSelectionIds);
      setSelectedIds([]);
      if (selectedContact && toolbarSelectionIds.includes(selectedContact.id)) setSelectedContactId(null);
      await loadData({ silent: true });
      showNotice({ type: 'success', message: 'Selected contacts deleted.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to delete selected contacts.' });
    } finally {
      setBulkSaving(false);
    }
  };
  const handleOpenBookingModal = () => {
    setShowBookingModal(true);
  };

  const handleOpenForm = () => {
    const latestSubmission = [...contactFormSubmissions].sort((left, right) => new Date(right?.submittedAt || right?.createdAt || 0).getTime() - new Date(left?.submittedAt || left?.createdAt || 0).getTime())[0];
    const linkedForm = latestSubmission ? formsById.get(latestSubmission.formId) : null;
    if (linkedForm?.slug || linkedForm?.id) {
      window.open(`/form/${linkedForm.slug || linkedForm.id}`, '_blank', 'noopener,noreferrer');
      return;
    }
    window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'forms' } }));
  };

  const handleCreateNote = async () => {
    if (!selectedContact || !normalizeText(noteDraft) || showDeleted) return;
    setNoteSaving(true);
    try {
      const created = await createContactActivityApi(selectedContact.id, {
        activityType: 'note',
        title: 'Operator note',
        description: noteDraft,
      });
      setContactActivities((current) => [created, ...current]);
      setNoteDraft('');
      showNotice({ type: 'success', message: 'Note added.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to add note.' });
    } finally {
      setNoteSaving(false);
    }
  };

  const openThreadForSelectedContact = async (channelType) => {
    if (!selectedContact) return;
    try {
      const thread = await openThreadForContactApi({
        contactId: selectedContact.id,
        channelType,
        subject: `${channelType.toUpperCase()} follow-up for ${contactDisplayName(selectedContact)}`,
      });
      window.dispatchEvent(new CustomEvent('aio:navigate', {
        detail: {
          module: channelType === 'sms' ? 'sms_voip' : 'comms',
          threadId: thread.id,
        },
      }));
    } catch (error) {
      showNotice({ type: 'error', message: error.message || `Unable to open ${channelType} thread.` });
    }
  };

  const updateMethodRow = (field, index, value) => {
    setEditDraft((current) => {
      const values = splitMultiline(current?.[field] || '');
      while (values.length <= index) values.push('');
      values[index] = value;
      return { ...current, [field]: values.filter((entry, rowIndex) => normalizeText(entry) || rowIndex === index).join('\n') };
    });
  };

  const handleAddressAdd = () => {
    if (showDeleted || !selectedContact) return;
    setEditDraft((current) => ({
      ...(current || draftFromContact(selectedContact, companies)),
      addressLabel: normalizeText(current?.addressLabel) || 'Business Address',
    }));
    setEditMode(true);
  };

  const editEmailValues = editDraft ? splitMultiline(editDraft.emailsText) : [];
  const editPhoneValues = editDraft ? splitMultiline(editDraft.phonesText) : [];
  const renderedEmailRows = editMode && !showDeleted ? [...editEmailValues, ''].slice(0, Math.max(editEmailValues.length + 1, 5)) : selectedMethods.emails;
  const renderedPhoneRows = editMode && !showDeleted ? [...editPhoneValues, ''].slice(0, Math.max(editPhoneValues.length + 1, 5)) : selectedMethods.phones;

  return (
    <div className="module-root-standard">
      <ModuleHeader
        title="CRM Operator Index"
        showTitle={false}
        showActions={true}
        className=""
        leftActions={[
          {
            label: 'Create',
            icon: Plus,
            onClick: () => setShowCreateModal(true),
            variant: 'primary'
          }
        ]}
        toolbarLeftSlot={
          <div className="relative min-w-[240px] max-w-[360px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={showDeleted ? 'Search deleted contacts...' : 'Search live CRM contacts...'}
              className="h-8 w-full rounded border border-slate-800 bg-[#0a0a0a] pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none"
            />
          </div>
        }
        toolbarCenterSlot={
          <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
            <button
              type="button"
              onClick={() => setShowDeleted(false)}
              className={`px-3 py-1 text-[10px] uppercase font-bold tracking-widest rounded transition-all ${!showDeleted ? 'bg-[var(--color-primary)] text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setShowDeleted(true)}
              className={`px-3 py-1 text-[10px] uppercase font-bold tracking-widest rounded transition-all ${showDeleted ? 'bg-[var(--color-primary)] text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Deleted
            </button>
          </div>
        }
        actions={[
          {
            label: 'Filter',
            icon: Filter,
            disabled: true,
            variant: 'secondary'
          },
          {
            label: 'Verify',
            icon: Shield,
            onClick: handleToolbarVerify,
            disabled: !hasToolbarSelection || bulkSaving,
            variant: 'secondary'
          },
          {
            label: 'Tag',
            icon: Tag,
            onClick: handleToolbarTag,
            disabled: !hasToolbarSelection || bulkSaving,
            variant: 'secondary'
          },
          {
            label: 'Delete',
            icon: Trash2,
            onClick: handleToolbarDelete,
            disabled: !hasToolbarSelection || bulkSaving || showDeleted,
            variant: 'secondary'
          },
          {
            label: 'Refresh',
            icon: RefreshCw,
            onClick: () => loadData({ silent: true }),
            variant: 'secondary'
          }
        ]}
        onModuleAi={openCrmAssist}
      />

      <div className="module-content-stage px-2 pb-2">
        <div className="mb-1.5 grid gap-1.5 md:grid-cols-4">
          {[
            { label: 'Active Contacts', value: activeContactCount },
            { label: 'Qualified', value: qualifiedContactCount },
            { label: 'Bookings Pending', value: bookingsPendingCount },
            { label: 'At-Risk Accounts', value: atRiskContactCount },
          ].map((item) => (
            <div key={item.label} className="rounded border border-slate-800/60 bg-[#0d0d0d] px-2.5 py-1.5 shadow-lg">
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 opacity-60">{item.label}</div>
              <div className="mt-0.5 text-lg font-black leading-none text-slate-100">{item.value}</div>
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[520px_minmax(0,1fr)]">
          <CRMContactList
            contacts={filteredContacts}
            loading={loading}
            showDeleted={showDeleted}
            selectedContactId={selectedContactId}
            selectedIds={selectedIds}
            onSelectContact={setSelectedContactId}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onBulkTag={() => setShowTagModal(true)}
            onBulkDelete={handleBulkDelete}
            onBulkVerify={handleBulkVerify}
            onBulkAddToFlow={handleOpenFlowModalForSelection}
          />

          {(!selectedContact && !selectedContactId) ? (
            <div className={`${shellPanelClass} flex min-h-[420px] items-center justify-center bg-[#090909]/50 p-6`}>
              <div className="max-w-sm text-center">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">CRM Operator Surface</div>
                <h2 className="mt-3 text-xl font-bold text-slate-100">Select a contact</h2>
                <p className="mt-2 text-sm text-slate-500">{showDeleted ? 'Choose a deleted dossier to inspect or restore it.' : 'Choose a live contact to open the dossier, activity feed, and operational rail.'}</p>
              </div>
            </div>
          ) : !selectedContact ? (
            <div className="flex min-h-0 flex-1 gap-2 overflow-hidden select-none animate-pulse">
              <div className={`${shellPanelClass} flex min-h-0 flex-1 flex-col overflow-hidden`}>
                <div className="h-10 border-b border-slate-900 bg-[#090909]/70" />
                <div className="flex flex-1 p-2 gap-2">
                  <div className="w-[340px] rounded-[22px] border border-slate-900/80 bg-[#050505]" />
                  <div className="flex-1 rounded-[28px] border border-slate-900/80 bg-transparent" />
                </div>
              </div>
              <div className={`${shellPanelClass} w-[300px] h-full bg-[#090909]/70`} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 gap-2 overflow-hidden select-none">
              <div className={`${shellPanelClass} flex min-h-0 flex-1 flex-col overflow-hidden !bg-transparent !shadow-none border-slate-900/80`}>
                <div className="flex items-center justify-between border-b border-slate-900 px-3 py-1.5 bg-[#090909]/70">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 opacity-60 italic">Operator Surface</div>
                    <div className="h-4 w-px bg-slate-900" />
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => openThreadForSelectedContact('email')} disabled={showDeleted} className="flex items-center gap-1 rounded px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-cyan-500/10 hover:text-cyan-400 disabled:opacity-40"><Mail size={10} /><span>Email</span></button>
                      <button type="button" onClick={() => openThreadForSelectedContact('sms')} disabled={showDeleted} className="flex items-center gap-1 rounded px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-blue-500/10 hover:text-blue-400 disabled:opacity-40"><MessageSquareText size={10} /><span>SMS</span></button>
                      <button type="button" onClick={handleOpenBookingModal} disabled={showDeleted} className="flex items-center gap-1 rounded px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-40"><CalendarDays size={10} /><span>Meet</span></button>
                      <button type="button" onClick={handleOpenForm} disabled={showDeleted} className="flex items-center gap-1 rounded px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-40"><FileText size={10} /><span>Form</span></button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!showDeleted ? (
                      <>
                        <button type="button" onClick={() => setEditMode((current) => !current)} className="rounded-full border border-slate-800 bg-[#101010] px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-300 hover:border-slate-700 hover:text-white">
                          <span className="inline-flex items-center gap-1.5"><Edit3 size={10} />{editMode ? 'Close Edit' : 'Edit'}</span>
                        </button>
                        {editMode ? (
                          <>
                            <button type="button" onClick={() => { setEditDraft(draftFromContact(selectedContact, companies)); setEditMode(false); }} className="rounded-full border border-slate-800 bg-[#101010] px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-300 hover:border-slate-700 hover:text-white">Reset</button>
                            <button type="button" onClick={handleSaveContact} disabled={saving} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
                          </>
                        ) : null}
                        <button type="button" onClick={() => setShowFlowModal(true)} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/20">
                          <span className="inline-flex items-center gap-1.5"><PlusCircle size={10} />Add to Flow</span>
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-red-300 hover:bg-red-500/20">
                          <span className="inline-flex items-center gap-1.5"><Trash2 size={10} />Delete</span>
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => handleRestoreContact(selectedContact.id)} disabled={restoring} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50">{restoring ? 'Restoring...' : 'Restore'}</button>
                    )}
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 gap-2 overflow-hidden p-2">
                  <div className="w-[340px] min-w-[340px] space-y-2 overflow-y-auto pr-1">
                    <div className={`${innerPanelClass} overflow-hidden shadow-inner`}>
                      <div className="flex items-center justify-between border-b border-slate-900/80 bg-emerald-500/5 px-3 py-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-400/80">Identity Dossier</div>
                        <div className="flex items-center gap-2">
                          {selectedContact.emailVerified === true ? <div className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black text-emerald-400">Verified</div> : null}
                          {selectedContact.emailVerificationStatus && selectedContact.emailVerified !== true ? <div className="rounded border border-slate-700 bg-[#111] px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-400">{selectedContact.emailVerificationStatus}</div> : null}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="flex items-center gap-4">
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-800 bg-gradient-to-br from-[#101010] to-[#050505] text-xl font-black text-slate-100">
                            {(selectedContact.firstName || selectedContact.lastName) ? `${selectedContact.firstName?.[0] || ''}${selectedContact.lastName?.[0] || ''}` : '#'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 leading-none">{normalizeText(selectedContact.title)}</div>
                            <div className="text-2xl font-black leading-none tracking-tighter text-slate-100">{contactDisplayName(selectedContact)}</div>
                            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                              <Tag size={10} className="text-slate-500 mr-0.5 opacity-60" />
                              {Array.isArray(selectedContact.tags) && selectedContact.tags.map((tag) => (
                                <div key={tag} className="flex items-center gap-1 rounded bg-[#0d0d0d] border border-slate-800 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tighter text-slate-400 group/tag shadow-sm hover:border-slate-700 transition-all">
                                  <span>{tag}</span>
                                  <button type="button" onClick={() => handleRemoveTag(selectedContact.id, tag)} className="opacity-40 hover:opacity-100 transition-opacity flex items-center justify-center p-0.5" title="Remove Tag">
                                    <X size={8} />
                                  </button>
                                </div>
                              ))}

                              <div className="relative min-w-[140px] flex-1">
                                <input
                                  type="text"
                                  value={tagInput}
                                  onChange={(e) => {
                                    setTagInput(e.target.value);
                                    setShowTagDropdown(true);
                                  }}
                                  onFocus={() => setShowTagDropdown(true)}
                                  onBlur={() => setTimeout(() => setShowTagDropdown(false), 200)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleAddTag(selectedContact.id, tagInput);
                                    }
                                  }}
                                  placeholder="Tags (Separated by ',', or ':' or ';')"
                                  className="w-full bg-transparent text-[9px] font-black uppercase tracking-widest text-slate-500 placeholder:text-slate-800 outline-none border-b border-transparent focus:border-emerald-500/30 transition-all py-0.5"
                                />

                                {showTagDropdown && (tagInput.trim() || allAvailableTags.length > 0) && (
                                  <div className="absolute top-full left-0 mt-1 max-h-48 w-48 overflow-y-auto z-[100] rounded-sm border border-slate-900 bg-[#080808] shadow-[0_12px_32px_rgba(0,0,0,0.6)] py-1 no-scrollbar">
                                    {allAvailableTags
                                      .filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !(selectedContact.tags || []).includes(t))
                                      .map(t => (
                                        <button
                                          key={t}
                                          type="button"
                                          onClick={() => handleAddTag(selectedContact.id, t)}
                                          className="w-full text-left px-3 py-1.5 text-[9px] uppercase font-black tracking-widest text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all border-b border-slate-900 last:border-0"
                                        >
                                          {t}
                                        </button>
                                      ))
                                    }
                                    {tagInput.trim() && !allAvailableTags.includes(tagInput.toUpperCase()) && (
                                      <button
                                        type="button"
                                        onClick={() => handleAddTag(selectedContact.id, tagInput)}
                                        className="w-full text-left px-3 py-1.5 text-[9px] uppercase font-black tracking-widest text-emerald-500 hover:bg-emerald-500/10 transition-all"
                                      >
                                        + CREATE "{tagInput.toUpperCase()}"
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 space-y-1">
                              {selectedMethods.emails.length ? <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400"><Mail size={11} className="text-blue-500 opacity-60" /><span className="truncate">{selectedMethods.emails[0].value}</span></div> : null}
                              {selectedMethods.phones.length ? <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400"><Phone size={11} className="text-blue-500 opacity-60" /><span className="truncate">{selectedMethods.phones[0].value}</span></div> : null}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <div className="space-y-0.5">
                            <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Quality</div>
                            {qualityScore ? (
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-slate-800 bg-[#060606]">
                                  {qualityScore.width ? <div className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" style={{ width: qualityScore.width }} /> : null}
                                </div>
                                <span className="text-[10px] font-black text-emerald-400">{qualityScore.label}</span>
                              </div>
                            ) : <div className="h-4" />}
                          </div>
                          <div className="space-y-0.5">
                            <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Engagement</div>
                            {engagementScore ? (
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-slate-800 bg-[#060606]">
                                  {engagementScore.width ? <div className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ width: engagementScore.width }} /> : null}
                                </div>
                                <span className="text-[10px] font-black text-blue-400">{engagementScore.label}</span>
                              </div>
                            ) : <div className="h-4" />}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`${innerPanelClass} p-3`}>
                      <button type="button" onClick={() => toggleDetailPanel('dossier')} className="flex w-full items-center justify-between group">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-100">Contact Details</span>
                        <ChevronDown size={14} className={`text-slate-500 transition-transform ${detailPanels.dossier ? 'rotate-180' : ''}`} />
                      </button>
                      {detailPanels.dossier ? (
                        <>
                          <div className="mt-3 space-y-3">
                            {[
                              ['Owner', editDraft?.owner || '', UserCheck, 'owner'],
                              ['Company', editDraft?.companyName || '', Building2, 'companyName'],
                              ['Department', editDraft?.department || '', Briefcase, 'department'],
                              ['Job Title', editDraft?.title || '', Hash, 'title'],
                              ['AI Employee', editDraft?.aiEmployee || '', Zap, 'aiEmployee'],
                              ['Website', editDraft?.website || '', Globe, 'website'],
                            ].map(([label, value, Icon, key]) => (
                              <div key={label} className="grid grid-cols-[100px_1fr] items-center gap-2 border-b border-slate-900/60 pb-1.5 last:border-0 last:pb-0">
                                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                  <Icon size={10} className="shrink-0 opacity-40" /> {label}
                                </span>
                                {editMode && !showDeleted ? (
                                  <input value={value} onChange={(event) => setEditDraft((current) => ({ ...current, [key]: event.target.value }))} className={`${inputClass} text-right`} />
                                ) : (
                                  <span className="truncate text-right text-[11px] font-bold text-slate-300">{value}</span>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="my-3 h-px bg-slate-900/60" />

                          <div className="space-y-2">
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 opacity-60">Communication Channels</div>
                            <div className="space-y-1">
                              {renderedEmailRows.length ? renderedEmailRows.map((entry, index) => {
                                const value = typeof entry === 'string' ? entry : entry.value;
                                return (
                                  <div key={`email-${index}`} className={`flex items-center justify-between rounded border px-1.5 py-1.5 ${value ? 'border-slate-800/60 bg-[#060606]/70' : 'border-slate-900/80 bg-[#060606]/30 text-slate-600 italic'}`}>
                                    <div className="flex min-w-0 items-center gap-2">
                                      <Mail size={12} className={`${value ? 'text-blue-500 opacity-60' : 'opacity-30'}`} />
                                      {editMode && !showDeleted ? (
                                        <input value={value} onChange={(event) => updateMethodRow('emailsText', index, event.target.value)} className="h-6 w-full min-w-0 bg-transparent text-[11px] font-medium text-slate-100 outline-none placeholder:text-slate-600" placeholder="Add alternative email..." />
                                      ) : (
                                        <span className="truncate text-[11px] font-medium text-slate-200">{value}</span>
                                      )}
                                    </div>
                                    <span className="text-[8px] font-black uppercase tracking-tighter text-emerald-500">{index === 0 ? 'Primary' : 'Alt'}</span>
                                  </div>
                                );
                              }) : <div className="rounded border border-slate-900/80 bg-[#060606]/30 px-1.5 py-1.5 text-[10px] italic text-slate-600">No email on file</div>}
                            </div>

                            <div className="mt-2 space-y-1">
                              {renderedPhoneRows.length ? renderedPhoneRows.map((entry, index) => {
                                const value = typeof entry === 'string' ? entry : entry.value;
                                const label = typeof entry === 'string' ? phoneLabels[index] || 'Alt' : (entry.label || phoneLabels[index] || 'Alt');
                                return (
                                  <div key={`phone-${index}`} className={`flex items-center justify-between rounded border px-1.5 py-1.5 ${value ? 'border-slate-800/60 bg-[#060606]/70' : 'border-slate-900/80 bg-[#060606]/30 text-slate-600 italic'}`}>
                                    <div className="flex min-w-0 items-center gap-2">
                                      <Phone size={12} className={`${value ? 'text-blue-500 opacity-60' : 'opacity-30'}`} />
                                      {editMode && !showDeleted ? (
                                        <input value={value} onChange={(event) => updateMethodRow('phonesText', index, event.target.value)} className="h-6 w-full min-w-0 bg-transparent text-[11px] font-medium text-slate-100 outline-none placeholder:text-slate-600" placeholder="Add alt phone..." />
                                      ) : (
                                        <span className="truncate text-[11px] font-medium text-slate-200">{value}</span>
                                      )}
                                    </div>
                                    <span className="text-[8px] font-black uppercase tracking-tighter text-blue-400">{label}</span>
                                  </div>
                                );
                              }) : <div className="rounded border border-slate-900/80 bg-[#060606]/30 px-1.5 py-1.5 text-[10px] italic text-slate-600">No phone on file</div>}
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>

                    <div className={`${innerPanelClass} p-3`}>
                      <button type="button" onClick={() => toggleDetailPanel('address')} className="flex w-full items-center justify-between group">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-100">Physical Localization</span>
                        <ChevronDown size={14} className={`text-slate-500 transition-transform ${detailPanels.address ? 'rotate-180' : ''}`} />
                      </button>
                      {detailPanels.address ? (
                        <div className="mt-3 space-y-3">
                          {selectedAddress ? (
                            <div className="rounded border border-slate-800/60 bg-[#060606]/60 px-2 py-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
                              <div className="mb-1.5 flex items-center justify-between">
                                <div className="text-[9px] font-black uppercase tracking-widest text-blue-400">{selectedAddress.label}</div>
                                <MapPin size={10} className="text-blue-400/60" />
                              </div>
                              <div className="space-y-0.5 text-[11px] font-medium leading-tight text-slate-300">
                                {selectedAddress.lines.map((line) => <div key={line}>{line}</div>)}
                                {selectedAddress.country ? <div className="text-[9px] font-black uppercase text-slate-500">{selectedAddress.country}</div> : null}
                              </div>
                            </div>
                          ) : null}
                          {editMode && !showDeleted ? (
                            <div className="rounded border border-slate-800/60 bg-[#060606]/40 px-2 py-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
                              <div className="grid gap-2">
                                <input value={editDraft?.addressLabel || ''} onChange={(event) => setEditDraft((current) => ({ ...current, addressLabel: event.target.value }))} className={inputClass} placeholder="Address label" />
                                <input value={editDraft?.addressLine1 || ''} onChange={(event) => setEditDraft((current) => ({ ...current, addressLine1: event.target.value }))} className={inputClass} placeholder="Street address" />
                                <input value={editDraft?.addressLine2 || ''} onChange={(event) => setEditDraft((current) => ({ ...current, addressLine2: event.target.value }))} className={inputClass} placeholder="Suite, unit, or floor" />
                                <div className="grid grid-cols-2 gap-2">
                                  <input value={editDraft?.addressCity || ''} onChange={(event) => setEditDraft((current) => ({ ...current, addressCity: event.target.value }))} className={inputClass} placeholder="City" />
                                  <input value={editDraft?.addressState || ''} onChange={(event) => setEditDraft((current) => ({ ...current, addressState: event.target.value }))} className={inputClass} placeholder="State" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <input value={editDraft?.addressPostalCode || ''} onChange={(event) => setEditDraft((current) => ({ ...current, addressPostalCode: event.target.value }))} className={inputClass} placeholder="Postal code" />
                                  <input value={editDraft?.addressCountry || ''} onChange={(event) => setEditDraft((current) => ({ ...current, addressCountry: event.target.value }))} className={inputClass} placeholder="Country" />
                                </div>
                              </div>
                            </div>
                          ) : null}
                          <button type="button" onClick={handleAddressAdd} disabled={showDeleted} className="flex w-full items-center justify-between rounded border border-slate-900/80 bg-[#060606]/20 px-2 py-2 text-left text-[10px] italic text-slate-600 transition hover:border-slate-800 hover:text-slate-400 disabled:opacity-40">
                            <span>{selectedAddress ? 'No home address on file' : 'No address on file'}</span>
                            <span className="text-[9px] font-black uppercase not-italic text-cyan-400">+ Add</span>
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className={`${innerPanelClass} p-3`}>
                      <button type="button" onClick={() => toggleDetailPanel('consent')} className="flex w-full items-center justify-between group">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-100">Consent & Opt-In</span>
                        <ChevronDown size={14} className={`text-slate-500 transition-transform ${detailPanels.consent ? 'rotate-180' : ''}`} />
                      </button>
                      {detailPanels.consent ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {consentRows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between rounded border border-slate-800/60 bg-[#060606]/50 px-2 py-2">
                              <span className="text-[9px] font-black uppercase tracking-tight text-slate-500">{row.label}</span>
                              <div className={`relative h-4 w-7 rounded-full border ${row.enabled ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-slate-700 bg-slate-800/60'}`}>
                                <div className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${row.enabled ? 'right-0.5' : 'left-0.5'}`} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className={`${innerPanelClass} p-3 opacity-70`}>
                      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
                        <span>External Reference: {normalizeText(selectedContact.externalReferenceId || selectedContact.externalReference || selectedContact.referenceId) || '--'}</span>
                        <span>Source: {normalizeText(selectedContact.source) || '--'}</span>
                      </div>
                      <div className="mt-1 text-[9px] text-slate-500">Created: {formatDateTime(selectedContact.createdAt)}</div>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-slate-900/80 bg-transparent shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
                    <div className="flex items-center justify-center gap-1 overflow-x-auto border-b border-slate-900/40 px-2 py-1 bg-transparent no-scrollbar">
                      {feedTabs.map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setActiveFeedTab(tab)}
                          className={`whitespace-nowrap rounded-sm px-2 py-0.5 text-[8px] font-black uppercase tracking-widest transition-all ${activeFeedTab === tab ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'border border-transparent text-slate-500/60 hover:text-slate-300'}`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    <div className="border-b border-slate-900/40 bg-transparent px-4 py-1.5">
                      <div className="flex items-center gap-3 rounded-sm border border-slate-800/60 bg-transparent px-3 py-1 focus-within:border-emerald-500/30 transition-all">
                        <Plus size={12} className="text-emerald-500/40" />
                        <input
                          type="text"
                          value={noteDraft}
                          onChange={(event) => setNoteDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                              event.preventDefault();
                              handleCreateNote();
                            }
                          }}
                          disabled={showDeleted}
                          placeholder={showDeleted ? 'Disabled' : 'Rapid entry...'}
                          className="flex-1 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-700 disabled:opacity-40"
                        />
                        <div className="flex items-center gap-2">
                          <div className="text-[8px] font-black uppercase text-slate-700">Ctrl + Enter</div>
                          <button type="button" disabled={showDeleted || noteSaving || !normalizeText(noteDraft)} onClick={handleCreateNote} className="text-slate-600 transition hover:text-emerald-400 disabled:opacity-20"><Send size={11} /></button>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-2">
                      {detailLoading ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading activity...</div>
                      ) : filteredFeedItems.length ? (
                        <div className="flex flex-col px-1">
                          {filteredFeedItems.map((item) => {
                            const Icon = item.icon;
                            return (
                              <div key={item.id} className="group flex items-start gap-3 border-b border-slate-900/30 px-4 py-1.5 transition-colors hover:bg-emerald-500/[0.04]">
                                <div className="mt-1 flex-shrink-0">
                                  <Icon size={12} className={item.iconClassName} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="text-[8px] font-black uppercase tracking-tighter text-emerald-500/80">{item.typeLabel}</span>
                                      <div className="h-2 w-px bg-slate-800" />
                                      <span className={`truncate text-[11px] font-bold leading-none tracking-tight group-hover:text-emerald-400 transition-colors ${item.accentClassName}`}>{item.title}</span>
                                    </div>
                                    <span className="whitespace-nowrap font-mono text-[9px] text-slate-600 opacity-40 transition-opacity group-hover:opacity-100">{formatDateTime(item.createdAt)}</span>
                                  </div>
                                  <div className="mt-0.5 line-clamp-1 text-[10px] leading-normal text-slate-400 opacity-60 transition-opacity group-hover:opacity-100">{item.description}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center bg-[#050505] py-20">
                          <Clock size={48} className="mb-4 text-slate-700" />
                          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">No activity found in filter</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${shellPanelClass} flex min-h-0 w-[300px] min-w-[300px] flex-col overflow-hidden bg-[#090909]/70`}>
                <div className="flex items-center justify-between border-b border-slate-900 px-3 py-2 bg-[#090909]/60">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Operational View</div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  <div className={`${innerPanelClass} p-2.5`}>
                    <button type="button" onClick={() => toggleDetailPanel('automations')} className="flex w-full items-center justify-between group">
                      <div className="flex items-center gap-2">
                        <Zap size={12} className="text-amber-500/60" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-100">Automations</span>
                      </div>
                      <ChevronDown size={14} className={`text-slate-500 transition-transform ${detailPanels.automations ? 'rotate-180' : ''}`} />
                    </button>
                    {detailPanels.automations && (
                      automationItems.length ? (
                        <div className="mt-3 space-y-2">
                          {automationItems.map((item) => (
                            <div key={item.id} className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
                              <div className="truncate text-[10px] font-bold text-amber-300">{item.title}</div>
                              <div className="mt-1 line-clamp-2 text-[9px] text-slate-400">{item.description}</div>
                              <div className="mt-1 text-[8px] uppercase tracking-widest text-amber-500/70">{formatDateTime(item.createdAt)}</div>
                            </div>
                          ))}
                        </div>
                      ) : <div className="mt-3 rounded border border-slate-900 bg-[#060606]/40 px-2 py-4 text-center text-[10px] italic text-slate-600">No automation history linked yet.</div>
                    )}
                  </div>

                  <div className={`${innerPanelClass} p-2.5`}>
                    <button type="button" onClick={() => toggleDetailPanel('accounting')} className="flex w-full items-center justify-between group">
                      <div className="flex items-center gap-2">
                        <Receipt size={12} className="text-emerald-500/60" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-100">Accounting</span>
                      </div>
                      <ChevronDown size={14} className={`text-slate-500 transition-transform ${detailPanels.accounting ? 'rotate-180' : ''}`} />
                    </button>
                    {detailPanels.accounting && (
                      billingItems.length ? (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded border border-slate-900 bg-[#060606]/60 p-2">
                              <div className="text-[8px] font-black uppercase text-slate-500">Balance</div>
                              <div className="text-[12px] font-black text-slate-100">{formatCurrency(totalBilling)}</div>
                            </div>
                            <div className="rounded border border-slate-900 bg-[#060606]/60 p-2">
                              <div className="text-[8px] font-black uppercase text-slate-500">Orders</div>
                              <div className="text-[12px] font-black text-slate-100">{billingItems.length}</div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {billingItems.slice(0, 3).map((order) => (
                              <div key={order.id} className="flex items-center justify-between rounded px-1.5 py-1.5 transition-all hover:bg-emerald-500/5">
                                <span className="text-[10px] font-medium text-slate-300">{normalizeText(order.id)}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-slate-100">{formatCurrency(order.totalAmount ?? order.total_amount ?? order.amount)}</span>
                                  <span className="text-[8px] font-black uppercase text-slate-500">{normalizeText(order.paymentStatus || order.payment_status || order.status)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : <div className="mt-3 rounded border border-slate-900 bg-[#060606]/40 px-2 py-4 text-center text-[10px] italic text-slate-600">No billing records linked to this contact.</div>
                    )}
                  </div>

                  <div className={`${innerPanelClass} p-2.5`}>
                    <button type="button" onClick={() => toggleDetailPanel('bookings')} className="flex w-full items-center justify-between group">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={12} className="text-blue-500/60" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-100">Bookings</span>
                      </div>
                      <ChevronDown size={14} className={`text-slate-500 transition-transform ${detailPanels.bookings ? 'rotate-180' : ''}`} />
                    </button>
                    {detailPanels.bookings && (
                      bookingItems.length ? (
                        <div className="mt-3 space-y-2">
                          {bookingItems.slice(0, 3).map((booking) => (
                            <div key={booking.id} className="rounded border border-blue-500/20 bg-blue-500/5 p-2">
                              <div className="truncate text-[10px] font-bold text-blue-300">{normalizeText(booking.title)}</div>
                              <div className="mt-1 text-[9px] uppercase tracking-widest text-slate-500">{formatDateTime(booking.startTime || booking.start_time)}</div>
                              <div className="mt-1 text-[9px] font-black uppercase text-slate-400">{normalizeText(booking.status)}</div>
                            </div>
                          ))}
                        </div>
                      ) : <div className="mt-3 rounded border border-slate-900 bg-[#060606]/40 px-2 py-4 text-center text-[10px] italic text-slate-600">No contact-linked bookings found.</div>
                    )}
                  </div>

                  <div className={`${innerPanelClass} p-2.5`}>
                    <button type="button" onClick={() => toggleDetailPanel('comms')} className="flex w-full items-center justify-between group">
                      <div className="flex items-center gap-2">
                        <MessageSquareText size={12} className="text-emerald-500/60" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-100">Comms Signal</span>
                      </div>
                      <ChevronDown size={14} className={`text-slate-500 transition-transform ${detailPanels.comms ? 'rotate-180' : ''}`} />
                    </button>
                    {detailPanels.comms && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded border border-slate-900 bg-[#060606]/60 p-2">
                            <div className="text-[8px] font-black uppercase text-slate-500">SMS Threads</div>
                            <div className="text-[12px] font-black text-slate-100">{commsSummary.smsThreadCount || 0}</div>
                          </div>
                          <div className="rounded border border-slate-900 bg-[#060606]/60 p-2">
                            <div className="text-[8px] font-black uppercase text-slate-500">Calls</div>
                            <div className="text-[12px] font-black text-slate-100">{commsSummary.callCount || 0}</div>
                          </div>
                        </div>
                        <div className="mt-2 space-y-1 text-[9px] text-slate-500">
                          <div>Last SMS: {formatDateTime(commsSummary.lastSmsAt) || 'None'}</div>
                          <div>Last Call: {formatDateTime(commsSummary.lastCallAt) || 'None'}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={`${innerPanelClass} p-2.5`}>
                    <button type="button" onClick={() => toggleDetailPanel('pipelines')} className="flex w-full items-center justify-between group">
                      <div className="flex items-center gap-2">
                        <BarChart3 size={12} className="text-cyan-500/60" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-100">Pipelines</span>
                      </div>
                      <ChevronDown size={14} className={`text-slate-500 transition-transform ${detailPanels.pipelines ? 'rotate-180' : ''}`} />
                    </button>
                    {detailPanels.pipelines && (
                      normalizeText(selectedContact.pipelineStage) ? (
                        <div className="mt-3 space-y-2">
                          <div className="rounded border border-cyan-500/20 bg-cyan-500/5 p-2">
                            <div className="text-[8px] font-black uppercase text-cyan-500 opacity-60">Current Stage</div>
                            <div className="mt-0.5 text-[11px] font-bold text-cyan-300">{selectedContact.pipelineStage}</div>
                            <div className="mt-1 text-[9px] uppercase tracking-widest text-slate-500">Status: {normalizeText(selectedContact.status)}</div>
                          </div>
                          <div className="rounded border border-slate-900 bg-[#060606]/60 p-2 text-[10px] text-slate-400">
                            {selectedContact.lastContactedAt ? `Last contacted ${formatDateTime(selectedContact.lastContactedAt)}` : 'No last-contact timestamp recorded.'}
                          </div>
                        </div>
                      ) : <div className="mt-3 rounded border border-slate-900 bg-[#060606]/40 px-2 py-4 text-center text-[10px] italic text-slate-600">No pipeline linkage on this contact.</div>
                    )}
                  </div>

                  <div className={`${innerPanelClass} p-2.5`}>
                    <button type="button" onClick={() => toggleDetailPanel('related')} className="flex w-full items-center justify-between group">
                      <div className="flex items-center gap-2">
                        <Hash size={12} className="text-emerald-500/60" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-100">Related Track</span>
                      </div>
                      <ChevronDown size={14} className={`text-slate-500 transition-transform ${detailPanels.related ? 'rotate-180' : ''}`} />
                    </button>
                    {detailPanels.related && (
                      <div className="mt-3 space-y-2">
                        <div className="rounded border border-slate-900/40 border-dashed bg-[#050505] px-2 py-4 text-center text-[10px] italic text-slate-600">No active tracking segments</div>
                        <button type="button" className="flex w-full items-center justify-center gap-2 rounded border border-slate-800 py-1.5 text-[9px] font-black uppercase text-slate-400 transition-all hover:bg-[#111] hover:text-slate-200">
                          <Plus size={10} /> Link Contact
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showBookingModal ? <BookingModal bookings={bookingItems} onClose={() => setShowBookingModal(false)} /> : null}
      {showCreateModal ? <CreateContactModal companies={companies} saving={creating} onClose={() => setShowCreateModal(false)} onCreate={handleCreateContact} /> : null}
      {showTagModal ? <BulkTagModal saving={bulkSaving} onClose={() => setShowTagModal(false)} onConfirm={handleBulkTag} /> : null}
      {showFlowModal ? <AddToFlowModal flows={flows} saving={bulkSaving} onClose={() => setShowFlowModal(false)} onConfirm={(flowId) => handleTriggerFlow(flowId, selectedIds.length ? selectedIds : (selectedContact ? [selectedContact.id] : []))} /> : null}

      <SystemConfirmModal
        isOpen={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        onConfirm={handleDeleteContact}
        title="Delete Contact"
        message="Delete this contact? This will move it to Deleted."
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

export default CRMModule;





