import React, { useEffect, useMemo, useState } from 'react';
import { Activity, History, MessageSquare, Phone, PhoneCall, PhoneOff, Plus, RefreshCw, Send, X } from 'lucide-react';
import { useNotice } from '../../contexts/NoticeContext';
import ModuleHeader from '../../components/ModuleHeader';
import SystemConfirmModal from '../../components/Modals/SystemConfirmModal';
import {
  checkOptOutApi,
  createPhoneNumberApi,
  createSmsThreadApi,
  deleteCommsProviderConfigApi,
  deletePhoneNumberApi,
  endCallSessionApi,
  getCallSessionsApi,
  getCommsIntegrationInfoApi,
  getCommsOverviewApi,
  getCommsProviderConfigsApi,
  getCommsRoutesApi,
  getContactsWithPhoneApi,
  getPhoneNumbersApi,
  getSmsMessagesApi,
  getSmsThreadsApi,
  saveCommsProviderConfigApi,
  sendSmsApi,
  startOutboundCallApi,
  updatePhoneNumberApi,
} from '../../services/backendApi';

const shellClass = 'h-full min-h-0 overflow-hidden rounded-[var(--radius-outer)] border border-[var(--color-border)] bg-[#050608] text-[var(--color-text-primary)]';
const islandClass = 'rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(18,22,29,0.94),rgba(8,10,14,0.98))] shadow-[0_18px_45px_rgba(0,0,0,0.35)]';
const cardClass = 'rounded-xl border border-white/8 bg-white/[0.03]';
const inputClass = 'w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary)]/45';
const buttonClass = 'rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const liveProviders = ['telnyx', 'twilio'];

function navigate(detail) {
  window.dispatchEvent(new CustomEvent('aio:navigate', { detail }));
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value || 'Unknown';
}

function formatTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRelative(value) {
  if (!value) return 'No activity';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity';
  const delta = Date.now() - date.getTime();
  if (delta < 60_000) return 'Just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '--';
  const total = Number(seconds);
  if (!Number.isFinite(total)) return '--';
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function peerNumber(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.direction === 'inbound' && message.senderNumber) return message.senderNumber;
    if (message.direction === 'outbound' && message.recipientNumber) return message.recipientNumber;
  }
  return '';
}

function byPhone(contacts, number) {
  const normalized = String(number || '').replace(/\D/g, '');
  return contacts.find((contact) => String(contact.phone || '').replace(/\D/g, '') === normalized) || null;
}

function toneClass(tone) {
  if (tone === 'success') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
  if (tone === 'warning') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
  return 'border-white/10 bg-white/5 text-slate-200';
}

function normalizeProvider(record) {
  return {
    id: record?.id || '',
    providerType: record?.providerType || '',
    hasConfig: Boolean(record?.hasConfig),
    isActive: Boolean(record?.isActive),
    status: String(record?.status || '').toLowerCase(),
    healthStatus: String(record?.healthStatus || '').toLowerCase(),
  };
}

function providerState(providerType, activeProviderType, configs) {
  const config = configs.find((item) => item.providerType === providerType);
  if (!config) return { label: 'Not Connected', tone: 'neutral', detail: 'No saved config record exists.' };
  if (config.healthStatus.includes('error') || config.healthStatus.includes('unauthor') || config.status.includes('error')) {
    return { label: 'Reconnect Required', tone: 'warning', detail: 'Backend marked this provider as unhealthy or unauthorized.' };
  }
  if (!config.hasConfig) return { label: 'Needs Config', tone: 'warning', detail: 'Credentials were not detected on the saved record.' };
  if (config.isActive && activeProviderType === providerType) {
    return { label: 'Connected', tone: 'success', detail: 'This is the active runtime transport. No dedicated test endpoint exists.' };
  }
  return { label: 'Not Connected', tone: 'neutral', detail: 'Credentials are saved, but this provider is not active.' };
}

function providerFields(providerType) {
  if (providerType === 'telnyx') {
    return [
      { name: 'label', label: 'Connection Label', required: true, defaultValue: 'Telnyx' },
      { name: 'apiKey', label: 'API Key', required: true },
      { name: 'phoneNumber', label: 'Default From Number' },
      { name: 'connectionId', label: 'Connection ID' },
      { name: 'messagingProfileId', label: 'Messaging Profile ID' },
    ];
  }
  return [
    { name: 'label', label: 'Connection Label', required: true, defaultValue: 'Twilio' },
    { name: 'apiKey', label: 'Account SID', required: true },
    { name: 'apiSecret', label: 'Auth Token', required: true, type: 'password' },
    { name: 'phoneNumber', label: 'Default From Number', required: true },
  ];
}

function emptyProviderForm(providerType) {
  return providerFields(providerType).reduce((accumulator, field) => {
    accumulator[field.name] = field.defaultValue || '';
    return accumulator;
  }, {});
}

function providerPayload(form) {
  const mapping = {
    apiKey: 'api_key',
    apiSecret: 'api_secret',
    phoneNumber: 'phone_number',
    connectionId: 'connection_id',
    messagingProfileId: 'messaging_profile_id',
  };
  const payload = {};
  Object.entries(form || {}).forEach(([key, value]) => {
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '' || normalized === null || normalized === undefined) return;
    payload[mapping[key] || key] = normalized;
  });
  return payload;
}

function SectionTitle({ eyebrow, title, detail, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">{eyebrow}</div>
        <div className="mt-1 text-xl font-semibold text-white">{title}</div>
        {detail ? <div className="mt-2 text-sm text-[var(--color-text-secondary)]">{detail}</div> : null}
      </div>
      {action}
    </div>
  );
}

function OverviewTab({ setTab }) {
  const { showNotice } = useNotice();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState({});
  const [integrationInfo, setIntegrationInfo] = useState({});
  const [providerConfigs, setProviderConfigs] = useState([]);
  const [routes, setRoutes] = useState({ extensions: [], ringGroups: [], phoneNumbers: [] });

  const load = async () => {
    setLoading(true);
    try {
      const [overviewData, integrationData, providerData, routesData] = await Promise.all([
        getCommsOverviewApi(),
        getCommsIntegrationInfoApi(),
        getCommsProviderConfigsApi(),
        getCommsRoutesApi(),
      ]);
      setOverview(overviewData || {});
      setIntegrationInfo(integrationData || {});
      setProviderConfigs((providerData || []).map(normalizeProvider));
      setRoutes(routesData || { extensions: [], ringGroups: [], phoneNumbers: [] });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to load communications overview.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeProviderType = integrationInfo.providerStatus && integrationInfo.providerStatus !== 'stub'
    ? integrationInfo.providerStatus
    : providerConfigs.find((config) => config.isActive)?.providerType || 'stub';

  if (loading) return <div className={`${islandClass} flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]`}>Loading communications control surface...</div>;

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(22rem,1fr)]">
      <div className="space-y-4">
        <div className={`${islandClass} p-4`}>
          <SectionTitle
            eyebrow="Runtime"
            title="SMS / VoIP Control Surface"
            detail="This page only exposes repo-backed communications APIs. Provider credentials can be managed here or from Integrations."
            action={(
              <div className="flex gap-2">
                <button onClick={() => navigate({ module: 'integrations', integrationCategory: 'communications' })} className="rounded-full border border-[var(--color-primary)]/35 bg-[var(--color-primary)]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-primary)] transition hover:bg-[var(--color-primary)]/20">Open Integrations</button>
                <button onClick={load} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)] transition hover:text-white"><span className="inline-flex items-center gap-1.5"><RefreshCw size={12} /> Refresh</span></button>
              </div>
            )}
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className={`${cardClass} p-3`}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Active Provider</div><div className="mt-1 text-lg font-semibold text-white">{activeProviderType === 'stub' ? 'Stub (Simulated)' : activeProviderType}</div><div className="mt-1 text-xs text-[var(--color-text-secondary)]">{activeProviderType === 'stub' ? 'Send and call flows will simulate.' : 'Backend will attempt live transport.'}</div></div>
            <div className={`${cardClass} p-3`}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Numbers</div><div className="mt-1 text-lg font-semibold text-white">{overview.activeNumbers || 0}</div><div className="mt-1 text-xs text-[var(--color-text-secondary)]">{overview.smsEnabledCount || 0} SMS enabled, {overview.callsEnabledCount || 0} voice enabled</div></div>
            <div className={`${cardClass} p-3`}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Traffic (7d)</div><div className="mt-1 text-lg font-semibold text-white">{overview.recentThreadsCount || 0} SMS</div><div className="mt-1 text-xs text-[var(--color-text-secondary)]">{overview.recentCallsCount || 0} calls in history</div></div>
            <div className={`${cardClass} p-3`}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Routing</div><div className="mt-1 text-lg font-semibold text-white">{routes.extensions?.length || 0} Extensions</div><div className="mt-1 text-xs text-[var(--color-text-secondary)]">{routes.ringGroups?.length || 0} ring groups, {routes.phoneNumbers?.length || 0} number records</div></div>
          </div>
        </div>

        <div className={`${islandClass} p-4`}>
          <SectionTitle eyebrow="Providers" title="Twilio / Telnyx" detail="These are the live-capable provider adapters present in the repo today." />
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {liveProviders.map((providerType) => {
              const state = providerState(providerType, activeProviderType, providerConfigs);
              return (
                <div key={providerType} className={`${cardClass} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{providerType === 'twilio' ? 'Twilio' : 'Telnyx'}</div>
                      <div className="mt-1 text-sm text-[var(--color-text-secondary)]">{providerType === 'twilio' ? 'SMS, calls, and webhook normalization are implemented.' : 'SMS, calls, and webhook normalization are implemented.'}</div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClass(state.tone)}`}>{state.label}</span>
                  </div>
                  <div className="mt-3 text-sm text-[var(--color-text-secondary)]">{state.detail}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-3 text-sm text-amber-100">The repo does not expose a dedicated communications provider test endpoint. Save and delete flows are real; runtime health beyond active-provider selection is not available from this UI.</div>
        </div>
      </div>

      <div className="space-y-4">
        <div className={`${islandClass} p-4`}>
          <SectionTitle eyebrow="Truth" title="Operational Status" />
          <div className="mt-3 space-y-3">
            <div className={`${cardClass} p-3 text-sm text-[var(--color-text-secondary)]`}>CRM integration: {integrationInfo.crmIntegration || 'unknown'}<br />Signals integration: {integrationInfo.signalsIntegration || 'unknown'}<br />Flow triggers: {integrationInfo.flowsTriggerReadiness || 'unknown'}</div>
            <div className={`${cardClass} p-3 text-sm text-[var(--color-text-secondary)]`}>Webhook ingest route exists at <code>/api/comms/webhook/{"{provider}"}</code> for the active adapter. This page reports the capability but does not fake inbound traffic.</div>
            <div className="grid gap-2">
              <button onClick={() => setTab('inbox')} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white transition hover:bg-white/[0.08]">Open SMS Inbox</button>
              <button onClick={() => setTab('numbers')} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white transition hover:bg-white/[0.08]">Manage Numbers</button>
              <button onClick={() => setTab('dialer')} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white transition hover:bg-white/[0.08]">Open Dialer</button>
              <button onClick={() => setTab('history')} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white transition hover:bg-white/[0.08]">Review Call History</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProvidersTab() {
  const { showNotice } = useNotice();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState([]);
  const [integrationInfo, setIntegrationInfo] = useState({});
  const [selectedProvider, setSelectedProvider] = useState('telnyx');
  const [form, setForm] = useState(emptyProviderForm('telnyx'));
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [configData, integrationData] = await Promise.all([getCommsProviderConfigsApi(), getCommsIntegrationInfoApi()]);
      setConfigs((configData || []).map(normalizeProvider));
      setIntegrationInfo(integrationData || {});
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to load provider config state.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setForm(emptyProviderForm(selectedProvider)); }, [selectedProvider]);

  const currentState = providerState(selectedProvider, integrationInfo.providerStatus || 'stub', configs);
  const existingConfig = configs.find((config) => config.providerType === selectedProvider) || null;

  const save = async () => {
    const required = providerFields(selectedProvider).filter((field) => field.required && !String(form[field.name] || '').trim());
    if (required.length) {
      showNotice({ type: 'warning', message: `Missing required fields: ${required.map((field) => field.label).join(', ')}` });
      return;
    }
    setSaving(true);
    try {
      await saveCommsProviderConfigApi(selectedProvider, providerPayload(form), true);
      showNotice({ type: 'success', message: `${selectedProvider === 'twilio' ? 'Twilio' : 'Telnyx'} saved as the active communications provider.` });
      await load();
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to save provider config.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteCommsProviderConfigApi(selectedProvider);
      setForm(emptyProviderForm(selectedProvider));
      showNotice({ type: 'success', message: `${selectedProvider === 'twilio' ? 'Twilio' : 'Telnyx'} provider config removed.` });
      await load();
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to delete provider config.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.6fr)]">
      <div className={`${islandClass} flex min-h-0 flex-col p-4`}>
        <SectionTitle eyebrow="Providers" title="Twilio / Telnyx" detail="Save and delete flows are live. This repo does not expose a communications provider test endpoint, so testing is truthfully unavailable." action={<button onClick={load} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)] transition hover:text-white">Refresh</button>} />
        <div className="mt-4 space-y-3">
          {liveProviders.map((providerType) => {
            const state = providerState(providerType, integrationInfo.providerStatus || 'stub', configs);
            return (
              <button key={providerType} onClick={() => setSelectedProvider(providerType)} className={`w-full rounded-xl border px-3 py-3 text-left transition ${selectedProvider === providerType ? 'border-[var(--color-primary)]/45 bg-[var(--color-primary)]/12' : 'border-white/8 bg-white/[0.03] hover:border-[var(--color-primary)]/25'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{providerType === 'twilio' ? 'Twilio' : 'Telnyx'}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{state.detail}</div>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${toneClass(state.tone)}`}>{state.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`${islandClass} p-4`}>
        <SectionTitle eyebrow="Provider Config" title={selectedProvider === 'twilio' ? 'Twilio' : 'Telnyx'} detail={existingConfig ? 'Backend readback for saved comms config is partial. Re-enter all required values when updating to avoid wiping provider settings.' : 'Saving here writes to /api/comms/provider-configs and activates this provider.'} />
        <div className="mt-4 grid gap-3">
          <div className={`${cardClass} grid gap-3 p-3 md:grid-cols-3`}>
            <div><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-1 text-sm text-white">{currentState.label}</div></div>
            <div><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Active Runtime</div><div className="mt-1 text-sm text-white">{integrationInfo.providerStatus === selectedProvider ? 'Yes' : 'No'}</div></div>
            <div><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Test Endpoint</div><div className="mt-1 text-sm text-white">Unavailable</div></div>
          </div>
          {providerFields(selectedProvider).map((field) => (
            <div key={field.name}>
              <label className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</label>
              <input type={field.type === 'password' ? 'password' : 'text'} value={form[field.name] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-primary)]/45" placeholder={field.defaultValue || field.placeholder || ''} />
            </div>
          ))}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-3 text-sm text-amber-100">Testing is intentionally disabled because the backend exposes no communications provider test route. Save and delete actions are wired to the real API.</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className={`${buttonClass} border-[var(--color-primary)]/35 bg-[var(--color-primary)]/12 text-[var(--color-text-primary)]`}>{saving ? 'Saving...' : 'Save and Activate'}</button>
            <button onClick={remove} disabled={saving || !existingConfig} className={`${buttonClass} border-red-500/30 bg-red-500/10 text-red-100`}>Delete Provider Config</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumbersTab() {
  const { showNotice } = useNotice();
  const [loading, setLoading] = useState(true);
  const [numbers, setNumbers] = useState([]);
  const [form, setForm] = useState({ number: '', displayLabel: '', owner: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, label: '' });

  const load = async () => {
    setLoading(true);
    try {
      setNumbers((await getPhoneNumbersApi()) || []);
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to load number records.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (event) => {
    event.preventDefault();
    if (!form.number.trim()) return;
    setSaving(true);
    try {
      await createPhoneNumberApi({ number: form.number.trim(), displayLabel: form.displayLabel.trim(), owner: form.owner.trim() });
      setForm({ number: '', displayLabel: '', owner: '' });
      await load();
      showNotice({ type: 'success', message: 'Number record attached to the workspace.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to attach number record.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleCapability = async (numberId, field, value) => {
    try {
      await updatePhoneNumberApi(numberId, { [field]: value });
      setNumbers((current) => current.map((item) => (item.id === numberId ? { ...item, [field]: value } : item)));
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to update number capability.' });
    }
  };

  const deactivate = async () => {
    try {
      await deletePhoneNumberApi(confirmDelete.id);
      setNumbers((current) => current.filter((item) => item.id !== confirmDelete.id));
      showNotice({ type: 'success', message: 'Number record deactivated.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to deactivate number record.' });
    } finally {
      setConfirmDelete({ open: false, id: null, label: '' });
    }
  };

  return (
    <>
      <SystemConfirmModal
        isOpen={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, id: null, label: '' })}
        onConfirm={deactivate}
        title="Deactivate Number"
        message={`Deactivate ${confirmDelete.label || 'this number'}? This UI manages local number records only; it does not buy or release provider inventory.`}
        confirmText="Deactivate"
        cancelText="Cancel"
        variant="danger"
      />

      <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(22rem,1fr)_minmax(0,1.8fr)]">
        <div className={`${islandClass} p-4`}>
          <SectionTitle eyebrow="Attach Existing Number" title="Number Records" detail="This creates local AIO CRM number records and capability flags. It does not provision numbers from Twilio or Telnyx." />
          <form onSubmit={create} className="mt-4 space-y-3">
            <input value={form.number} onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))} className={inputClass} placeholder="+15551234567" />
            <input value={form.displayLabel} onChange={(event) => setForm((current) => ({ ...current, displayLabel: event.target.value }))} className={inputClass} placeholder="Display label" />
            <input value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} className={inputClass} placeholder="Assigned owner or team" />
            <button type="submit" disabled={saving || !form.number.trim()} className={`${buttonClass} w-full border-[var(--color-primary)]/35 bg-[var(--color-primary)]/12 text-[var(--color-text-primary)]`}>{saving ? 'Saving...' : 'Attach Number Record'}</button>
          </form>
        </div>

        <div className={`${islandClass} flex min-h-0 flex-col p-4`}>
          <SectionTitle eyebrow="Inventory" title="Active Number Records" action={<button onClick={load} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)] transition hover:text-white">Refresh</button>} />
          <div className="mt-4 flex-1 overflow-auto">
            {loading ? <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">Loading number records...</div> : null}
            {!loading && numbers.length === 0 ? <div className={`${cardClass} flex h-full min-h-[18rem] items-center justify-center px-6 text-center text-sm text-[var(--color-text-secondary)]`}>No active number records were found for this workspace.</div> : null}
            {!loading && numbers.length > 0 ? (
              <div className="space-y-3">
                {numbers.map((number) => (
                  <div key={number.id} className={`${cardClass} p-4`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-white">{formatPhone(number.number)}</div>
                        <div className="mt-1 text-sm text-[var(--color-text-secondary)]">{number.displayLabel || 'Unlabeled'} {number.owner ? `| ${number.owner}` : ''}</div>
                        <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Record ID {number.id}</div>
                      </div>
                      <button onClick={() => setConfirmDelete({ open: true, id: number.id, label: formatPhone(number.number) })} className="rounded-full border border-red-500/25 bg-red-500/8 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-red-100 transition hover:bg-red-500/16">Deactivate</button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className={`${cardClass} flex items-center justify-between gap-3 px-3 py-2`}><span className="text-sm text-white">SMS enabled</span><input type="checkbox" checked={Boolean(number.smsEnabled)} onChange={(event) => toggleCapability(number.id, 'smsEnabled', event.target.checked)} /></label>
                      <label className={`${cardClass} flex items-center justify-between gap-3 px-3 py-2`}><span className="text-sm text-white">Voice enabled</span><input type="checkbox" checked={Boolean(number.callsEnabled)} onChange={(event) => toggleCapability(number.id, 'callsEnabled', event.target.checked)} /></label>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function InboxTab() {
  const { showNotice } = useNotice();
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [senderNumbers, setSenderNumbers] = useState([]);
  const [replyBody, setReplyBody] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newMessage, setNewMessage] = useState({ phoneNumber: '', contactId: '', body: '', fromNumber: '' });
  const [sending, setSending] = useState(false);

  const selectedThread = useMemo(() => threads.find((thread) => thread.id === selectedThreadId) || null, [threads, selectedThreadId]);
  const remoteNumber = useMemo(() => peerNumber(messages), [messages]);
  const linkedContact = useMemo(() => byPhone(contacts, remoteNumber), [contacts, remoteNumber]);

  const load = async (threadId = null) => {
    setLoading(true);
    try {
      const [threadData, numberData, contactData] = await Promise.all([getSmsThreadsApi(100), getPhoneNumbersApi(), getContactsWithPhoneApi()]);
      const smsNumbers = (numberData || []).filter((item) => item.smsEnabled);
      const nextThreadId = threadId || selectedThreadId || threadData?.[0]?.id || null;
      setThreads(threadData || []);
      setContacts(contactData || []);
      setSenderNumbers(smsNumbers);
      setSelectedThreadId(nextThreadId);
      setNewMessage((current) => ({ ...current, fromNumber: current.fromNumber || smsNumbers[0]?.number || '' }));
      if (nextThreadId) setMessages((await getSmsMessagesApi(nextThreadId)) || []);
      else setMessages([]);
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to load SMS threads.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sendNewThread = async () => {
    if (!newMessage.phoneNumber.trim() || !newMessage.body.trim()) return;
    setSending(true);
    try {
      const optOut = await checkOptOutApi(newMessage.phoneNumber.trim());
      if (optOut?.optedOut) {
        showNotice({ type: 'error', message: `Cannot send SMS. Opt-out keyword detected: ${optOut.keyword || 'STOP'}.` });
        return;
      }
      const contact = contacts.find((item) => item.id === newMessage.contactId) || byPhone(contacts, newMessage.phoneNumber);
      const thread = await createSmsThreadApi({ contactId: contact?.id || null, subject: `SMS with ${newMessage.phoneNumber.trim()}` });
      const result = await sendSmsApi({ threadId: thread?.id, contactId: contact?.id || null, phoneNumber: newMessage.phoneNumber.trim(), body: newMessage.body.trim(), fromNumber: newMessage.fromNumber || senderNumbers[0]?.number || '' });
      if (!result?.success) {
        showNotice({ type: 'error', message: result?.error || 'Unable to send SMS.' });
        return;
      }
      setShowNew(false);
      setNewMessage((current) => ({ ...current, phoneNumber: '', contactId: '', body: '' }));
      await load(result.threadId || result.thread_id || thread?.id);
      showNotice({ type: result.provider === 'Stub' ? 'info' : 'success', message: result.provider === 'Stub' ? 'SMS sent through stub transport.' : 'SMS queued through the active provider.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to send SMS.' });
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!selectedThread?.id || !replyBody.trim() || !remoteNumber) return;
    setSending(true);
    try {
      const optOut = await checkOptOutApi(remoteNumber);
      if (optOut?.optedOut) {
        showNotice({ type: 'error', message: `Cannot send SMS. Opt-out keyword detected: ${optOut.keyword || 'STOP'}.` });
        return;
      }
      const result = await sendSmsApi({ threadId: selectedThread.id, contactId: linkedContact?.id || selectedThread.contactId || null, phoneNumber: remoteNumber, body: replyBody.trim(), fromNumber: senderNumbers[0]?.number || '' });
      if (!result?.success) {
        showNotice({ type: 'error', message: result?.error || 'Unable to send reply.' });
        return;
      }
      setReplyBody('');
      await load(selectedThread.id);
      showNotice({ type: result.provider === 'Stub' ? 'info' : 'success', message: result.provider === 'Stub' ? 'Reply sent through stub transport.' : 'Reply queued through the active provider.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to send reply.' });
    } finally {
      setSending(false);
    }
  };

  const selectThread = async (threadId) => {
    setSelectedThreadId(threadId);
    try {
      setMessages((await getSmsMessagesApi(threadId)) || []);
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to load thread messages.' });
    }
  };

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(22rem,0.95fr)_minmax(0,1.55fr)]">
      <div className={`${islandClass} flex min-h-0 flex-col p-4`}>
        <SectionTitle eyebrow="SMS Threads" title="Inbox" detail="Backed by /api/comms/sms-threads and /api/comms/sms/send." action={<button onClick={() => setShowNew((current) => !current)} className="rounded-full border border-[var(--color-primary)]/35 bg-[var(--color-primary)]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-primary)] transition hover:bg-[var(--color-primary)]/20"><span className="inline-flex items-center gap-1.5"><Plus size={12} /> New SMS</span></button>} />
        {showNew ? (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
            <div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-white">New outbound thread</div><button onClick={() => setShowNew(false)} className="rounded-full border border-white/10 bg-white/5 p-1 text-[var(--color-text-secondary)] transition hover:text-white"><X size={14} /></button></div>
            <div className="mt-3 grid gap-3">
              <select value={newMessage.contactId} onChange={(event) => { const contact = contacts.find((item) => item.id === event.target.value) || null; setNewMessage((current) => ({ ...current, contactId: event.target.value, phoneNumber: contact?.phone || current.phoneNumber })); }} className={inputClass}>
                <option value="">Select contact (optional)</option>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{`${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.id} | {contact.phone}</option>)}
              </select>
              <input value={newMessage.phoneNumber} onChange={(event) => setNewMessage((current) => ({ ...current, phoneNumber: event.target.value }))} className={inputClass} placeholder="Recipient phone number" />
              <select value={newMessage.fromNumber} onChange={(event) => setNewMessage((current) => ({ ...current, fromNumber: event.target.value }))} className={inputClass}>
                <option value="">Select sender number</option>
                {senderNumbers.map((number) => <option key={number.id} value={number.number}>{formatPhone(number.number)}</option>)}
              </select>
              <textarea value={newMessage.body} onChange={(event) => setNewMessage((current) => ({ ...current, body: event.target.value }))} className={`${inputClass} min-h-[7rem] resize-y`} placeholder="Type the first outbound message..." />
              <button onClick={sendNewThread} disabled={sending || !newMessage.phoneNumber.trim() || !newMessage.body.trim()} className={`${buttonClass} border-[var(--color-primary)]/35 bg-[var(--color-primary)]/12 text-[var(--color-text-primary)]`}>{sending ? 'Sending...' : 'Create Thread and Send'}</button>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex-1 overflow-auto">
          {loading ? <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">Loading SMS threads...</div> : null}
          {!loading && threads.length === 0 ? <div className={`${cardClass} flex h-full min-h-[18rem] items-center justify-center px-6 text-center text-sm text-[var(--color-text-secondary)]`}>No SMS threads are stored yet for this workspace.</div> : null}
          {!loading && threads.length > 0 ? <div className="space-y-2">{threads.map((thread) => <button key={thread.id} onClick={() => selectThread(thread.id)} className={`w-full rounded-xl border px-3 py-3 text-left transition ${selectedThreadId === thread.id ? 'border-[var(--color-primary)]/45 bg-[var(--color-primary)]/12' : 'border-white/8 bg-white/[0.025] hover:border-[var(--color-primary)]/25 hover:bg-white/[0.04]'}`}><div className="text-sm font-semibold text-white">{thread.subject || 'SMS Thread'}</div><div className="mt-1 text-xs text-[var(--color-text-secondary)]">{thread.messageCount || 0} messages | {formatRelative(thread.lastMessageAt)}</div></button>)}</div> : null}
        </div>
      </div>

      <div className={`${islandClass} flex min-h-0 flex-col p-4`}>
        {selectedThread ? (
          <>
            <SectionTitle eyebrow="Thread Detail" title={selectedThread.subject || 'SMS Thread'} detail={remoteNumber ? `Remote number ${formatPhone(remoteNumber)}` : 'Remote number cannot be derived from stored message history yet.'} action={<div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">{selectedThread.id}</div>} />
            <div className="mt-4 flex-1 overflow-auto space-y-3">
              {messages.length === 0 ? <div className={`${cardClass} flex min-h-[14rem] items-center justify-center px-6 text-center text-sm text-[var(--color-text-secondary)]`}>This thread exists, but no message records are stored yet.</div> : null}
              {messages.map((message) => {
                const outbound = message.direction === 'outbound';
                return (
                  <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl border px-4 py-3 ${outbound ? 'border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10' : 'border-white/8 bg-white/[0.04]'}`}>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{outbound ? `Outbound${message.recipientNumber ? ` | ${formatPhone(message.recipientNumber)}` : ''}` : `Inbound${message.senderNumber ? ` | ${formatPhone(message.senderNumber)}` : ''}`}</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white">{message.body}</div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--color-text-tertiary)]"><span>{formatTime(message.createdAt)}</span><span className={`rounded-full border px-2 py-0.5 uppercase tracking-[0.16em] ${message.deliveryStatus === 'provider_error' ? 'border-red-500/25 bg-red-500/10 text-red-100' : message.deliveryStatus === 'simulated' ? 'border-amber-500/25 bg-amber-500/10 text-amber-100' : 'border-white/10 bg-white/5 text-slate-200'}`}>{message.deliveryStatus || 'pending'}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 border-t border-white/8 pt-4">
              <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} className={`${inputClass} min-h-[7rem] resize-y`} placeholder={remoteNumber ? 'Type a reply...' : 'This thread has no routable peer number yet.'} disabled={!remoteNumber || sending} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[var(--color-text-secondary)]">Sender: {senderNumbers[0]?.number ? formatPhone(senderNumbers[0].number) : 'No SMS-enabled number configured'} {linkedContact ? `| Linked contact ${`${linkedContact.firstName || ''} ${linkedContact.lastName || ''}`.trim()}` : ''}</div>
                <button onClick={sendReply} disabled={sending || !replyBody.trim() || !remoteNumber} className={`${buttonClass} border-[var(--color-primary)]/35 bg-[var(--color-primary)]/12 text-[var(--color-text-primary)]`}><span className="inline-flex items-center gap-2"><Send size={14} /> {sending ? 'Sending...' : 'Send Reply'}</span></button>
              </div>
            </div>
          </>
        ) : <div className="flex h-full items-center justify-center text-center text-sm text-[var(--color-text-secondary)]">Select a stored SMS thread to view messages.</div>}
      </div>
    </div>
  );
}

function DialerTab() {
  const { showNotice } = useNotice();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState({ extensions: [], ringGroups: [], phoneNumbers: [] });
  const [contacts, setContacts] = useState([]);
  const [providerInfo, setProviderInfo] = useState({});
  const [dialer, setDialer] = useState({ phoneNumber: '', fromNumber: '', extensionId: '' });
  const [activeCall, setActiveCall] = useState(null);
  const [pending, setPending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [routesData, contactsData, integrationData] = await Promise.all([getCommsRoutesApi(), getContactsWithPhoneApi(), getCommsIntegrationInfoApi()]);
      const numbers = (routesData?.phoneNumbers || []).filter((item) => item.callsEnabled);
      setRoutes(routesData || { extensions: [], ringGroups: [], phoneNumbers: [] });
      setContacts(contactsData || []);
      setProviderInfo(integrationData || {});
      setDialer((current) => ({ ...current, fromNumber: current.fromNumber || numbers[0]?.number || '' }));
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to load dialer routes.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const voiceNumbers = useMemo(() => (routes.phoneNumbers || []).filter((item) => item.callsEnabled), [routes.phoneNumbers]);

  const startCall = async () => {
    if (!dialer.phoneNumber.trim()) return;
    setPending(true);
    try {
      const contact = byPhone(contacts, dialer.phoneNumber);
      const result = await startOutboundCallApi({ phoneNumber: dialer.phoneNumber.trim(), fromNumber: dialer.fromNumber || '', contactId: contact?.id || null, extensionId: dialer.extensionId || null });
      setActiveCall(result);
      showNotice({ type: providerInfo.providerStatus === 'stub' ? 'info' : 'success', message: providerInfo.providerStatus === 'stub' ? 'Call started through stub transport.' : 'Outbound call requested through the active provider.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to start outbound call.' });
    } finally {
      setPending(false);
    }
  };

  const endCall = async () => {
    if (!activeCall?.id) return;
    setPending(true);
    try {
      await endCallSessionApi(activeCall.id, { disposition: 'completed', durationSeconds: activeCall.durationSeconds || 0 });
      setActiveCall(null);
      showNotice({ type: 'success', message: 'Call session ended.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to end call session.' });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.6fr)]">
      <div className={`${islandClass} p-4`}>
        <SectionTitle eyebrow="Dialer" title="Outbound Call Surface" detail="Uses /api/comms/calls/start and /api/comms/calls/{id}/end. Stub mode is truthful when no live provider is active." />
        {loading ? <div className="mt-6 text-sm text-[var(--color-text-secondary)]">Loading routes...</div> : (
          <div className="mt-4 space-y-3">
            <input value={dialer.phoneNumber} onChange={(event) => setDialer((current) => ({ ...current, phoneNumber: event.target.value }))} className={inputClass} placeholder="Destination phone number" disabled={pending || Boolean(activeCall)} />
            <select value={dialer.fromNumber} onChange={(event) => setDialer((current) => ({ ...current, fromNumber: event.target.value }))} className={inputClass} disabled={pending || Boolean(activeCall)}>
              <option value="">Select caller ID</option>
              {voiceNumbers.map((number) => <option key={number.id} value={number.number}>{formatPhone(number.number)}</option>)}
            </select>
            <select value={dialer.extensionId} onChange={(event) => setDialer((current) => ({ ...current, extensionId: event.target.value }))} className={inputClass} disabled={pending || Boolean(activeCall)}>
              <option value="">No extension override</option>
              {(routes.extensions || []).map((extension) => <option key={extension.id} value={extension.id}>{extension.extensionNumber} | {extension.displayName || 'Unlabeled extension'}</option>)}
            </select>
            {activeCall ? (
              <button onClick={endCall} disabled={pending} className={`${buttonClass} w-full border-red-500/30 bg-red-500/10 text-red-100`}><span className="inline-flex items-center gap-2"><PhoneOff size={14} /> {pending ? 'Ending...' : 'End Call'}</span></button>
            ) : (
              <button onClick={startCall} disabled={pending || !dialer.phoneNumber.trim()} className={`${buttonClass} w-full border-emerald-500/30 bg-emerald-500/10 text-emerald-100`}><span className="inline-flex items-center gap-2"><PhoneCall size={14} /> {pending ? 'Dialing...' : 'Start Call'}</span></button>
            )}
            <div className={`${cardClass} p-3 text-sm text-[var(--color-text-secondary)]`}>Active provider: <span className="font-semibold text-white">{providerInfo.providerName || 'Stub'}</span><br />Runtime mode: {providerInfo.providerStatus === 'stub' ? 'simulated' : 'live provider requested'}</div>
          </div>
        )}
      </div>

      <div className="grid min-h-0 gap-4 lg:grid-cols-2">
        <div className={`${islandClass} flex min-h-0 flex-col p-4`}>
          <SectionTitle eyebrow="Routing Inventory" title="Routes" />
          <div className="mt-4 grid gap-3">
            <div className={`${cardClass} p-3`}><div className="text-sm font-semibold text-white">Voice numbers</div><div className="mt-2 space-y-2 text-sm text-[var(--color-text-secondary)]">{voiceNumbers.length === 0 ? <div>No call-enabled numbers are attached.</div> : voiceNumbers.map((number) => <div key={number.id}>{formatPhone(number.number)} {number.displayLabel ? `| ${number.displayLabel}` : ''}</div>)}</div></div>
            <div className={`${cardClass} p-3`}><div className="text-sm font-semibold text-white">Extensions</div><div className="mt-2 space-y-2 text-sm text-[var(--color-text-secondary)]">{(routes.extensions || []).length === 0 ? <div>No extensions stored.</div> : (routes.extensions || []).map((extension) => <div key={extension.id}>{extension.extensionNumber} | {extension.displayName || 'Unlabeled extension'}</div>)}</div></div>
            <div className={`${cardClass} p-3`}><div className="text-sm font-semibold text-white">Ring groups</div><div className="mt-2 space-y-2 text-sm text-[var(--color-text-secondary)]">{(routes.ringGroups || []).length === 0 ? <div>No ring groups stored.</div> : (routes.ringGroups || []).map((group) => <div key={group.id}>{group.name} | {group.ringStrategy || 'simultaneous'}</div>)}</div></div>
          </div>
        </div>

        <div className={`${islandClass} flex min-h-0 flex-col p-4`}>
          <SectionTitle eyebrow="Contact Shortlist" title="Contacts With Phones" />
          <div className="mt-4 flex-1 overflow-auto space-y-2">
            {contacts.length === 0 ? <div className="text-sm text-[var(--color-text-secondary)]">No contacts with phone numbers are available.</div> : contacts.map((contact) => <button key={contact.id} onClick={() => setDialer((current) => ({ ...current, phoneNumber: contact.phone || current.phoneNumber }))} className="w-full rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition hover:border-[var(--color-primary)]/25 hover:bg-white/[0.05]"><div className="text-white">{`${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.id}</div><div className="mt-1 text-sm text-[var(--color-text-secondary)]">{formatPhone(contact.phone)}</div></button>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryTab() {
  const { showNotice } = useNotice();
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState([]);
  const [selectedCallId, setSelectedCallId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = (await getCallSessionsApi(100)) || [];
      setCalls(data);
      setSelectedCallId((current) => current || data[0]?.id || null);
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to load call history.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selectedCall = useMemo(() => calls.find((call) => call.id === selectedCallId) || null, [calls, selectedCallId]);

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(22rem,0.95fr)_minmax(0,1.55fr)]">
      <div className={`${islandClass} flex min-h-0 flex-col p-4`}>
        <SectionTitle eyebrow="Call Sessions" title="History" detail="Backed by /api/comms/call-sessions." action={<button onClick={load} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)] transition hover:text-white">Refresh</button>} />
        <div className="mt-4 flex-1 overflow-auto">
          {loading ? <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">Loading call history...</div> : null}
          {!loading && calls.length === 0 ? <div className={`${cardClass} flex h-full min-h-[18rem] items-center justify-center px-6 text-center text-sm text-[var(--color-text-secondary)]`}>No call sessions are stored yet.</div> : null}
          {!loading && calls.length > 0 ? <div className="space-y-2">{calls.map((call) => <button key={call.id} onClick={() => setSelectedCallId(call.id)} className={`w-full rounded-xl border px-3 py-3 text-left transition ${selectedCallId === call.id ? 'border-[var(--color-primary)]/45 bg-[var(--color-primary)]/12' : 'border-white/8 bg-white/[0.025] hover:border-[var(--color-primary)]/25 hover:bg-white/[0.04]'}`}><div className="text-sm font-semibold text-white">{call.direction === 'outbound' ? 'Outbound Call' : 'Inbound Call'}</div><div className="mt-1 text-xs text-[var(--color-text-secondary)]">{formatTime(call.startTime)} | duration {formatDuration(call.durationSeconds)}</div></button>)}</div> : null}
        </div>
      </div>

      <div className={`${islandClass} flex min-h-0 flex-col p-4`}>
        {selectedCall ? (
          <div className="space-y-4">
            <SectionTitle eyebrow="Call Detail" title={selectedCall.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <div className={`${cardClass} p-3`}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Direction</div><div className="mt-1 text-sm text-white">{selectedCall.direction || 'Unknown'}</div></div>
              <div className={`${cardClass} p-3`}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-1 text-sm text-white">{selectedCall.status || 'Unknown'}</div></div>
              <div className={`${cardClass} p-3`}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Started</div><div className="mt-1 text-sm text-white">{formatTime(selectedCall.startTime)}</div></div>
              <div className={`${cardClass} p-3`}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Duration</div><div className="mt-1 text-sm text-white">{formatDuration(selectedCall.durationSeconds)}</div></div>
              <div className={`${cardClass} p-3`}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Disposition</div><div className="mt-1 text-sm text-white">{selectedCall.disposition || 'Not set'}</div></div>
              <div className={`${cardClass} p-3`}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Extension</div><div className="mt-1 text-sm text-white">{selectedCall.extensionId || 'None'}</div></div>
            </div>
            <div className={`${cardClass} p-3 text-sm text-[var(--color-text-secondary)]`}>Recording URL: {selectedCall.recordingUrl || 'Not provided by backend'}<br />Transcript URL: {selectedCall.transcriptUrl || 'Not provided by backend'}</div>
          </div>
        ) : <div className="flex h-full items-center justify-center text-center text-sm text-[var(--color-text-secondary)]">Select a call session to inspect backend metadata.</div>}
      </div>
    </div>
  );
}

const tabs = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'providers', label: 'Providers', icon: Plus },
  { id: 'inbox', label: 'SMS', icon: MessageSquare },
  { id: 'numbers', label: 'Numbers', icon: Phone },
  { id: 'dialer', label: 'Dialer', icon: PhoneCall },
  { id: 'history', label: 'History', icon: History },
];

export default function SmsVoipModule() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="module-root-standard">
      <ModuleHeader
        showTitle={false}
        actions={[
          { label: 'Open Dispatch', onClick: () => navigate({ module: 'chat' }), variant: 'secondary' },
          { label: 'Provider Settings', onClick: () => navigate({ module: 'integrations', integrationCategory: 'communications' }), variant: 'primary' }
        ]}
        toolbarCenterSlot={(
          <div className="flex flex-wrap justify-center gap-1.5">
            {tabs.map((entry) => {
              const Icon = entry.icon;
              const active = entry.id === tab;
              return (
                <button
                  key={entry.id}
                  onClick={() => setTab(entry.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${active ? 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/12 text-white' : 'border-white/10 bg-white/5 text-[var(--color-text-secondary)] hover:text-white'}`}
                >
                  <span className="inline-flex items-center gap-1.5"><Icon size={12} /> {entry.label}</span>
                </button>
              );
            })}
          </div>
        )}
      />

      <div className={`${shellClass} module-content-stage p-3`}>
        {tab === 'overview' ? <OverviewTab setTab={setTab} /> : null}
        {tab === 'providers' ? <ProvidersTab /> : null}
        {tab === 'numbers' ? <NumbersTab /> : null}
        {tab === 'inbox' ? <InboxTab /> : null}
        {tab === 'dialer' ? <DialerTab /> : null}
        {tab === 'history' ? <HistoryTab /> : null}
      </div>
    </div>
  );
}
