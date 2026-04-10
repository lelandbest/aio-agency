import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Mail, Phone, Plus, RefreshCw, Search, Tag, Trash2, UserRound, X } from 'lucide-react';
import {
  createContactApi,
  deleteContactApi,
  getCompaniesApi,
  getContactsApi,
  getTagsApi,
  listDeletedContactsApi,
  restoreContactApi,
  updateContactApi,
} from '../../services/backendApi';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNotice } from '../../contexts/NoticeContext';
import { BrainIcon, Crosshair } from '../../components/ui/icons';
import SystemConfirmModal from '../../components/Modals/SystemConfirmModal';
import { CRM_CONTACT_SOURCES, CRM_CONTACT_STATUSES, createContactDraft } from './schemaContract';

const shellPanelClass = 'rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-sm';
const cardClass = 'rounded-[var(--radius-card)] border border-[var(--color-border)]/70 bg-[var(--color-bg-primary)]/80';
const inputClass = 'w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-60';
const labelClass = 'text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]';
const lifecycleStatuses = CRM_CONTACT_STATUSES.includes('active') ? CRM_CONTACT_STATUSES : ['active', ...CRM_CONTACT_STATUSES];

const normalizeText = (value) => String(value || '').trim();
const splitMultiline = (value) => String(value || '').split('\n').map((item) => item.trim()).filter(Boolean);
const formatDate = (value) => {
  if (!value) return 'Not recorded';
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
};
const readContactMethods = (contact) => {
  const custom = contact?.customFields || {};
  const phones = Array.isArray(custom.phones) ? custom.phones.filter(Boolean) : [];
  const emails = Array.isArray(custom.emails) ? custom.emails.filter(Boolean) : [];
  return {
    phones: phones.length ? phones : (contact?.phone ? [contact.phone] : []),
    emails: emails.length ? emails : (contact?.email ? [contact.email] : []),
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
  return {
    displayName: methods.displayName,
    firstName: contact?.firstName || '',
    lastName: contact?.lastName || '',
    phonesText: methods.phones.join('\n'),
    emailsText: methods.emails.join('\n'),
    companyName: company?.name || contact?.company || '',
    owner: contact?.owner || '',
    status: contact?.status || 'active',
    source: contact?.source || 'manual',
    tagsText: Array.isArray(contact?.tags) ? contact.tags.join(', ') : '',
    notes: methods.notes,
  };
};
const buildContactPayload = (draft, companies) => {
  const firstName = normalizeText(draft.firstName);
  const lastName = normalizeText(draft.lastName);
  const displayName = normalizeText(draft.displayName);
  const phones = splitMultiline(draft.phonesText);
  const emails = splitMultiline(draft.emailsText).map((item) => item.toLowerCase());
  if (!displayName && !firstName && !lastName && !phones.length && !emails.length) throw new Error('A contact requires a name, email, or phone number.');
  const companyName = normalizeText(draft.companyName);
  const companyMatch = companies.find((company) => company.name?.toLowerCase() === companyName.toLowerCase());
  return {
    displayName: displayName || null,
    firstName: firstName || null,
    lastName: lastName || null,
    email: emails[0] || null,
    phone: phones[0] || null,
    company: companyName || null,
    companyId: companyMatch?.id || null,
    owner: normalizeText(draft.owner) || null,
    status: draft.status || 'active',
    source: normalizeText(draft.source) || null,
    tags: String(draft.tagsText || '').split(',').map((item) => item.trim()).filter(Boolean),
    customFields: { displayName: displayName || null, emails, phones, notes: normalizeText(draft.notes) || null },
  };
};

function ContactFields({ draft, setDraft, companies, compact = false, disabled = false }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div><div className={labelClass}>Display Name</div><input disabled={disabled} value={draft.displayName} onChange={(e) => update('displayName', e.target.value)} className={inputClass} placeholder="Preferred dossier name" /></div>
        <div><div className={labelClass}>Company</div><input disabled={disabled} list="crm-company-options" value={draft.companyName} onChange={(e) => update('companyName', e.target.value)} className={inputClass} placeholder="Optional linked company" /></div>
        <div><div className={labelClass}>First Name</div><input disabled={disabled} value={draft.firstName} onChange={(e) => update('firstName', e.target.value)} className={inputClass} /></div>
        <div><div className={labelClass}>Last Name</div><input disabled={disabled} value={draft.lastName} onChange={(e) => update('lastName', e.target.value)} className={inputClass} /></div>
        {!compact ? <>
          <div><div className={labelClass}>Owner</div><input disabled={disabled} value={draft.owner} onChange={(e) => update('owner', e.target.value)} className={inputClass} /></div>
          <div><div className={labelClass}>Status</div><select disabled={disabled} value={draft.status} onChange={(e) => update('status', e.target.value)} className={inputClass}>{lifecycleStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <div><div className={labelClass}>Source</div><select disabled={disabled} value={draft.source} onChange={(e) => update('source', e.target.value)} className={inputClass}>{CRM_CONTACT_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}</select></div>
          <div><div className={labelClass}>Tags</div><input disabled={disabled} value={draft.tagsText} onChange={(e) => update('tagsText', e.target.value)} className={inputClass} placeholder="comma,separated,tags" /></div>
        </> : null}
      </div>
      <datalist id="crm-company-options">{companies.map((company) => <option key={company.id} value={company.name} />)}</datalist>
      <div className="grid gap-4 md:grid-cols-2">
        <div><div className={labelClass}>Emails</div><textarea disabled={disabled} value={draft.emailsText} onChange={(e) => update('emailsText', e.target.value)} className={`${inputClass} min-h-[120px] resize-none`} placeholder="One email per line" /></div>
        <div><div className={labelClass}>Phones</div><textarea disabled={disabled} value={draft.phonesText} onChange={(e) => update('phonesText', e.target.value)} className={`${inputClass} min-h-[120px] resize-none`} placeholder="One phone per line" /></div>
      </div>
      {!compact ? <div><div className={labelClass}>Notes</div><textarea disabled={disabled} value={draft.notes} onChange={(e) => update('notes', e.target.value)} className={`${inputClass} min-h-[120px] resize-none`} placeholder="Internal context only. This does not create timeline events." /></div> : null}
    </div>
  );
}

function CreateContactModal({ companies, saving, onClose, onCreate }) {
  const [draft, setDraft] = useState({ ...createContactDraft(), displayName: '', phonesText: '', emailsText: '', companyName: '' });
  const [error, setError] = useState('');
  const handleSubmit = async (event) => {
    event.preventDefault();
    try { setError(''); await onCreate(buildContactPayload(draft, companies)); } catch (issue) { setError(issue.message || 'Unable to create contact.'); }
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[var(--radius-outer)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div><div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Create Contact</div><h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">Create a real dossier</h2></div>
          <button onClick={onClose} className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <ContactFields draft={draft} setDraft={setDraft} companies={companies} />
          {error ? <div className="rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Minimal identity is required: name, email, or phone.</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary-skeuo !px-4 !py-2 !text-sm !font-medium">{saving ? 'Creating...' : 'Create Contact'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CRMModule({ initialContactId = null, onSelectContact = null }) {
  const { tenant, tenants = [] } = useAuth();
  const { openAIAssist } = useAIAssist();
  const { showNotice } = useNotice();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [deletedContacts, setDeletedContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [tags, setTags] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState(initialContactId);
  const [editDraft, setEditDraft] = useState(null);

  const currentWorkspace = tenant || tenants[0] || null;
  const visibleContacts = showDeleted ? deletedContacts : contacts;
  const selectedContact = useMemo(() => visibleContacts.find((contact) => contact.id === selectedContactId) || null, [visibleContacts, selectedContactId]);
  const selectedCompany = useMemo(() => companies.find((company) => company.id === selectedContact?.companyId) || null, [companies, selectedContact]);
  const methods = readContactMethods(selectedContact);
  const filteredContacts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return visibleContacts;
    return visibleContacts.filter((contact) => [contactDisplayName(contact), contact.email, contact.phone, contact.company, contact.owner, contact.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [visibleContacts, searchTerm]);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [nextContacts, nextDeletedContacts, nextCompanies, nextTags] = await Promise.all([getContactsApi(), listDeletedContactsApi(), getCompaniesApi(), getTagsApi()]);
      setContacts(Array.isArray(nextContacts) ? nextContacts : []);
      setDeletedContacts(Array.isArray(nextDeletedContacts) ? nextDeletedContacts : []);
      setCompanies(Array.isArray(nextCompanies) ? nextCompanies : []);
      setTags(Array.isArray(nextTags) ? nextTags : []);
      setSelectedContactId((current) => {
        const target = current || initialContactId;
        if (!target) return null;
        return [...(nextContacts || []), ...(nextDeletedContacts || [])].some((contact) => contact.id === target) ? target : null;
      });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to load CRM records.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [initialContactId, showNotice]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (initialContactId) setSelectedContactId(initialContactId); }, [initialContactId]);
  useEffect(() => { if (onSelectContact) onSelectContact(selectedContactId || null); }, [onSelectContact, selectedContactId]);
  useEffect(() => { setEditDraft(selectedContact ? draftFromContact(selectedContact, companies) : null); }, [selectedContact, companies]);
  useEffect(() => { setSelectedContactId(null); }, [showDeleted]);

  const openCrmAssist = () => openAIAssist({ context: { module: 'crm', selectedContactId: selectedContact?.id || null, selectedContactName: selectedContact ? contactDisplayName(selectedContact) : null, contactCount: contacts.length } });

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
    try { payload = buildContactPayload(editDraft, companies); } catch (issue) { showNotice({ type: 'error', message: issue.message || 'Unable to save contact.' }); return; }
    setSaving(true);
    try {
      const updated = await updateContactApi(selectedContact.id, payload);
      setContacts((current) => current.map((contact) => (contact.id === updated.id ? updated : contact)));
      setEditDraft(draftFromContact(updated, companies));
      showNotice({ type: 'success', message: 'Contact updated.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to save contact.' });
    } finally {
      setSaving(false);
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
        message: 'Contact deleted',
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-[var(--module-stack-gap)]">
      <div className="module-toolbar">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {selectedContact ? <button onClick={() => setSelectedContactId(null)} className="btn-toolbar-lead shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"><ArrowLeft size={12} /><span className="font-bold uppercase tracking-[0.14em]">Back to Index</span></button> : null}
          <button onClick={() => setShowCreateModal(true)} className="btn-toolbar-lead shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"><Plus size={12} /><span className="font-bold uppercase tracking-[0.14em]">Add Contact</span></button>
          <button onClick={() => loadData({ silent: true })} className="btn-secondary shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"><RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /><span className="font-bold uppercase tracking-[0.14em]">Refresh</span></button>
          <button onClick={() => setShowDeleted((current) => !current)} className="btn-secondary shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"><Trash2 size={12} /><span className="font-bold uppercase tracking-[0.14em]">{showDeleted ? 'Show Active' : 'Show Deleted'}</span></button>
        </div>
        <div className="module-toolbar-utility">
          <button onClick={() => openAIAssist()} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all" title="Brain (Global KB)"><BrainIcon size={14} /></button>
          <button onClick={openCrmAssist} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all" title="Crosshair (Module AI)"><Crosshair size={14} /></button>
        </div>
      </div>
      <div className="module-content-stage module-surface-shell">
        <div className="flex h-full min-h-0 overflow-hidden">
          <aside className="w-[320px] min-w-[320px] border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]/92">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">{showDeleted ? 'Deleted Contacts' : 'Contact Index'}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{showDeleted ? deletedContacts.length : contacts.length} {showDeleted ? 'deleted' : 'live'} contact{(showDeleted ? deletedContacts.length : contacts.length) === 1 ? '' : 's'}</div>
              <div className="relative mt-4"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] pl-9 pr-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)]" placeholder={showDeleted ? 'Search deleted contacts' : 'Search real contacts only'} /></div>
            </div>
            <div className="h-[calc(100%-105px)] overflow-y-auto px-3 py-3">
              {loading ? <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-4 text-sm text-[var(--color-text-secondary)]">Loading contacts...</div> : filteredContacts.length ? <div className="space-y-2">{filteredContacts.map((contact) => <button key={contact.id} onClick={() => setSelectedContactId(contact.id)} className={`w-full rounded-[var(--radius-card)] border px-3 py-3 text-left transition ${contact.id === selectedContactId ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary)]/35'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium text-[var(--color-text-primary)]">{contactDisplayName(contact)}</div><div className="mt-1 text-xs text-[var(--color-text-secondary)]">{contact.email || contact.phone || 'No direct method recorded yet'}</div></div>{showDeleted && contact.deletedAt ? <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-red-300">{formatDate(contact.deletedAt)}</span> : null}</div><div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]"><span>{contact.status || 'unclassified'}</span><span>{contact.company || 'no company'}</span></div></button>)}</div> : <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] px-4 py-5 text-sm leading-6 text-[var(--color-text-secondary)]">{searchTerm ? 'No contacts match the current search.' : showDeleted ? 'No deleted contacts.' : 'No contacts yet. Create the first real record to activate the dossier surface.'}</div>}
            </div>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-bg-secondary)]">
            {!showDeleted && contacts.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-6 py-8"><div className={`${shellPanelClass} w-full max-w-2xl p-8 text-center`}><div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">CRM</div><h2 className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">No contacts yet</h2><p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">This workspace has no live contact dossiers. Create the first real contact to activate the index and dossier surface.</p><div className="mt-6 flex items-center justify-center gap-3"><button onClick={() => setShowCreateModal(true)} className="btn-primary-skeuo !px-4 !py-2 !text-sm !font-medium"><span className="inline-flex items-center gap-2"><Plus size={14} />Create Contact</span></button></div></div></div>
            ) : showDeleted && deletedContacts.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-6 py-8"><div className={`${shellPanelClass} w-full max-w-2xl p-8 text-center`}><div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Deleted</div><h2 className="mt-3 text-2xl font-semibold text-[var(--color-text-primary)]">No deleted contacts</h2><p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">Deleted contacts will appear here until they are restored.</p></div></div>
            ) : !selectedContact || !editDraft ? (
              <div className="flex flex-1 items-center justify-center px-6 py-8"><div className={`${shellPanelClass} w-full max-w-2xl p-8 text-center`}><div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Dossier</div><h2 className="mt-3 text-2xl font-semibold text-[var(--color-text-primary)]">Select a contact</h2><p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">Choose a real contact from the left to open the dossier.</p></div></div>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="grid gap-4">
                    <div className={`${shellPanelClass} p-5`}>
                      <div className="flex items-start justify-between gap-4">
                        <div><div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Identity Card</div><h2 className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{contactDisplayName(selectedContact)}</h2><div className="mt-3 flex flex-wrap gap-2">{Array.isArray(selectedContact.tags) && selectedContact.tags.length ? selectedContact.tags.map((tag) => <span key={tag} className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]">{tag}</span>) : <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]">No tags</span>}</div></div>
                        {showDeleted ? <button onClick={() => handleRestoreContact(selectedContact.id)} disabled={restoring} className="rounded-[var(--radius-card)] border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60">{restoring ? 'Restoring...' : 'Restore'}</button> : <button onClick={() => setConfirmDelete(true)} className="rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/20"><span className="inline-flex items-center gap-2"><Trash2 size={12} />Delete</span></button>}
                      </div>
                      <div className="mt-5 grid gap-4 md:grid-cols-2">{[[Mail, 'Primary Email', methods.emails[0] || 'No email'], [Phone, 'Primary Phone', methods.phones[0] || 'No phone'], [UserRound, 'Owner', selectedContact.owner || 'Unassigned'], [Tag, 'Status', selectedContact.status || 'active']].map(([Icon, label, value]) => <div key={label} className={`${cardClass} p-4`}><div className="flex items-center gap-2"><Icon size={14} className="text-[var(--color-text-secondary)]" /><div className={labelClass}>{label}</div></div><div className="mt-2 text-sm text-[var(--color-text-primary)]">{value}</div></div>)}</div>
                    </div>
                    <div className={`${shellPanelClass} p-5`}><div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"><UserRound size={15} />Identity</div>{showDeleted ? <div className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Deleted dossiers are read-only until restored.</div> : null}<div className="mt-4"><ContactFields draft={editDraft} setDraft={setEditDraft} companies={companies} compact disabled={showDeleted} /></div></div>
                    <div className={`${shellPanelClass} p-5`}><div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"><Mail size={15} /><Phone size={15} />Contact Methods</div><div className="mt-4 grid gap-4 md:grid-cols-2"><div className={`${cardClass} p-4`}><div className={labelClass}>Emails</div><textarea disabled={showDeleted} value={editDraft.emailsText} onChange={(e) => setEditDraft((current) => ({ ...current, emailsText: e.target.value }))} className={`${inputClass} mt-3 min-h-[140px] resize-none`} placeholder="One email per line" /></div><div className={`${cardClass} p-4`}><div className={labelClass}>Phones</div><textarea disabled={showDeleted} value={editDraft.phonesText} onChange={(e) => setEditDraft((current) => ({ ...current, phonesText: e.target.value }))} className={`${inputClass} mt-3 min-h-[140px] resize-none`} placeholder="One phone per line" /></div></div></div>
                  </div>
                  <div className="grid gap-4">
                    <div className={`${shellPanelClass} p-5`}><div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"><Building2 size={15} />Organization</div><div className="mt-4 space-y-3"><div className={`${cardClass} p-4`}><div className={labelClass}>Linked Company</div><select disabled={showDeleted} value={editDraft.companyName} onChange={(e) => setEditDraft((current) => ({ ...current, companyName: e.target.value }))} className={`${inputClass} mt-3`}><option value="">No linked company</option>{companies.map((company) => <option key={company.id} value={company.name}>{company.name}</option>)}</select></div><div className={`${cardClass} p-4 text-sm text-[var(--color-text-secondary)]`}>{selectedCompany ? `${selectedCompany.name}${selectedCompany.website ? ` · ${selectedCompany.website}` : ''}` : 'No company dossier linked yet.'}</div></div></div>
                    <div className={`${shellPanelClass} p-5`}><div className="text-sm font-semibold text-[var(--color-text-primary)]">Tags and Ownership</div><div className="mt-4 space-y-4"><div><div className={labelClass}>Tags</div><input disabled={showDeleted} value={editDraft.tagsText} onChange={(e) => setEditDraft((current) => ({ ...current, tagsText: e.target.value }))} className={`${inputClass} mt-2`} placeholder="comma,separated,tags" /><div className="mt-2 text-xs text-[var(--color-text-tertiary)]">Tag library loaded: {tags.length}</div></div><div><div className={labelClass}>Owner</div><input disabled={showDeleted} value={editDraft.owner} onChange={(e) => setEditDraft((current) => ({ ...current, owner: e.target.value }))} className={`${inputClass} mt-2`} /></div><div><div className={labelClass}>Status</div><select disabled={showDeleted} value={editDraft.status} onChange={(e) => setEditDraft((current) => ({ ...current, status: e.target.value }))} className={`${inputClass} mt-2`}>{lifecycleStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div><div><div className={labelClass}>Source</div><select disabled={showDeleted} value={editDraft.source} onChange={(e) => setEditDraft((current) => ({ ...current, source: e.target.value }))} className={`${inputClass} mt-2`}>{CRM_CONTACT_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}</select></div></div></div>
                    <div className={`${shellPanelClass} p-5`}><div className="text-sm font-semibold text-[var(--color-text-primary)]">Notes</div><textarea disabled={showDeleted} value={editDraft.notes} onChange={(e) => setEditDraft((current) => ({ ...current, notes: e.target.value }))} className={`${inputClass} mt-4 min-h-[180px] resize-none`} placeholder="Internal context only. This does not create timeline events." /></div>
                    <div className={`${shellPanelClass} p-5`}><div className="text-sm font-semibold text-[var(--color-text-primary)]">System Metadata</div><div className="mt-4 grid gap-3">{[['Created', selectedContact.createdAt], ['Updated', selectedContact.updatedAt], ['Source', selectedContact.source || 'Not recorded'], ...(selectedContact.deletedAt ? [['Deleted', selectedContact.deletedAt]] : [])].map(([label, value]) => <div key={label} className={`${cardClass} p-4`}><div className={labelClass}>{label}</div><div className="mt-2 text-sm text-[var(--color-text-primary)]">{label === 'Source' ? value : formatDate(value)}</div></div>)}</div></div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3"><div className="text-sm text-[var(--color-text-secondary)]">Workspace: {currentWorkspace?.name || 'Primary workspace'}</div><div className="flex items-center gap-2">{showDeleted ? <button onClick={() => handleRestoreContact(selectedContact.id)} disabled={restoring} className="btn-primary-skeuo !px-4 !py-2 !text-sm !font-medium">{restoring ? 'Restoring...' : 'Restore Contact'}</button> : <><button onClick={() => setEditDraft(draftFromContact(selectedContact, companies))} className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Reset Changes</button><button onClick={handleSaveContact} disabled={saving} className="btn-primary-skeuo !px-4 !py-2 !text-sm !font-medium">{saving ? 'Saving...' : 'Save Contact'}</button></>}</div></div>
              </div>
            )}
          </main>
        </div>
      </div>
      {showCreateModal ? <CreateContactModal companies={companies} saving={creating} onClose={() => setShowCreateModal(false)} onCreate={handleCreateContact} /> : null}
      <SystemConfirmModal isOpen={confirmDelete} onClose={() => !deleting && setConfirmDelete(false)} onConfirm={handleDeleteContact} title="Delete Contact" message="Delete this contact? This will move it to Deleted." confirmText={deleting ? 'Deleting...' : 'Delete'} cancelText="Cancel" variant="danger" />
    </div>
  );
}
