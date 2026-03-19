import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Mail, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import IntegrationCard from '../components/IntegrationCard';
import IntegrationTabs from '../components/IntegrationTabs';
import AddIntegrationPanel from '../components/AddIntegrationPanel';
import { getAllCategories, getProviderConfig, INTEGRATION_CATEGORIES } from '../utils/integrationConfigs';
import { mockSupabase } from '../../../lib/mockSupabase';
import ModuleHeader from '../../../components/ModuleHeader';
import AIAssistButton from '../../../components/AIAssistButton';
import {
  createCalendarSourceApi,
  createMailboxApi,
  deleteMailboxApi,
  deleteCalendarSourceApi,
  disconnectCalendarSourceApi,
  disconnectMailboxApi,
  getCalendarProvidersApi,
  getCalendarSourceAuthorizeUrl,
  getCalendarSourcesApi,
  getMailboxAuthorizeUrl,
  getMailboxProvidersApi,
  getMailboxesApi,
  importCalendarSourceApi,
  syncCalendarSourceApi,
  syncMailboxApi,
  testCalendarSourceApi,
  testMailboxConnectionApi,
  updateCalendarSourceApi,
  updateMailboxApi
} from '../../../services/backendApi';
import { openOAuthPopup } from '../../../utils/oauthPopup';

const DEFAULT_MAILBOX_PROVIDERS = [
  { id: 'local-stub', label: 'Local Stub', fields: [] },
  {
    id: 'smtp-imap',
    label: 'SMTP / IMAP',
    fields: [
      { key: 'email', label: 'Mailbox Email' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password' },
      { key: 'incoming_host', label: 'IMAP Host' },
      { key: 'incoming_port', label: 'IMAP Port' },
      { key: 'outgoing_host', label: 'SMTP Host' },
      { key: 'outgoing_port', label: 'SMTP Port' }
    ]
  },
  {
    id: 'gmail-oauth',
    label: 'Gmail OAuth',
    fields: [
      { key: 'email', label: 'Google Account' },
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client Secret' },
      { key: 'refresh_token', label: 'Refresh Token' }
    ]
  },
  {
    id: 'microsoft365-oauth',
    label: 'Microsoft 365 OAuth',
    fields: [
      { key: 'email', label: 'Microsoft Account' },
      { key: 'tenant_id', label: 'Tenant ID' },
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client Secret' },
      { key: 'refresh_token', label: 'Refresh Token' }
    ]
  }
];

const DEFAULT_CALENDAR_PROVIDERS = [
  { id: 'local-stub', label: 'Local Stub', fields: [] },
  {
    id: 'google-calendar-oauth',
    label: 'Google Calendar',
    fields: [
      { key: 'email', label: 'Google Account' },
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client Secret' },
      { key: 'refresh_token', label: 'Refresh Token' },
      { key: 'calendar_id', label: 'Calendar ID' }
    ]
  },
  {
    id: 'microsoft365-calendar',
    label: 'Microsoft 365 Calendar',
    fields: [
      { key: 'tenant_id', label: 'Tenant ID' },
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client Secret' },
      { key: 'user_id', label: 'User ID' },
      { key: 'calendar_id', label: 'Calendar ID' }
    ]
  },
  {
    id: 'ics-url',
    label: 'ICS Feed',
    fields: [
      { key: 'feed_url', label: 'ICS Feed URL' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password' }
    ]
  }
];

const createMailboxDraft = (provider = 'local-stub') => ({
  name: '',
  address: '',
  provider,
  inbound_enabled: true,
  outbound_enabled: true,
  config: {}
});

const createCalendarSourceDraft = (provider = 'local-stub') => ({
  name: '',
  provider,
  sync_direction: 'two-way',
  config: {
    authority_mode: 'local-first',
    import_policy: 'review'
  }
});

const sourceRuleLabels = {
  'local-first': 'Local First',
  mirror: 'Mirror',
  'external-first': 'External First',
  review: 'Review',
  'auto-merge': 'Auto Merge',
  hold: 'Hold'
};

const isMailboxOauthProvider = (providerId) => ['gmail-oauth', 'microsoft365-oauth'].includes(providerId);
const isCalendarOauthProvider = (providerId) => ['google-calendar-oauth', 'microsoft365-calendar'].includes(providerId);
const SEEDED_MAILBOX_IDS = new Set(['mailbox-primary', 'mailbox-growth']);

const readErrorMessage = (error) => {
  const raw = error?.message || 'Action failed.';
  try {
    const parsed = JSON.parse(raw);
    return parsed.detail || parsed.message || raw;
  } catch {
    return raw;
  }
};

const toneClass = (tone) => ({
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200'
}[tone] || 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]');

const providerStateDetail = (config = {}, fallback) => config.last_error || config.connected_identity || config.connected_calendar || fallback;

const ResourceCard = ({ icon: Icon, title, subtitle, status, detail, selected, onClick, chips = [] }) => (
  <button
    onClick={onClick}
    className={`w-full rounded-2xl border p-4 text-left transition ${
      selected
        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
        : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:border-[var(--color-primary)]/30'
    }`}
  >
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-primary)]">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
          <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">{status}</span>
        </div>
        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{subtitle}</div>
        <div className="mt-2 text-sm text-[var(--color-text-secondary)]">{detail}</div>
        {chips.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span key={chip} className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">{chip}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  </button>
);

export const ActiveIntegrations = ({ initialCategory = INTEGRATION_CATEGORIES.AUTOMATION }) => {
  const categories = getAllCategories();
  const [integrations, setIntegrations] = useState([]);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const [mailboxes, setMailboxes] = useState([]);
  const [mailboxProviders, setMailboxProviders] = useState(DEFAULT_MAILBOX_PROVIDERS);
  const [selectedMailboxId, setSelectedMailboxId] = useState(null);
  const [mailboxForm, setMailboxForm] = useState(() => createMailboxDraft());
  const [mailboxDraft, setMailboxDraft] = useState(() => createMailboxDraft());
  const [showMailboxComposer, setShowMailboxComposer] = useState(false);

  const [calendarSources, setCalendarSources] = useState([]);
  const [calendarProviders, setCalendarProviders] = useState(DEFAULT_CALENDAR_PROVIDERS);
  const [selectedCalendarSourceId, setSelectedCalendarSourceId] = useState(null);
  const [calendarSourceForm, setCalendarSourceForm] = useState(() => createCalendarSourceDraft());
  const [calendarSourceDraft, setCalendarSourceDraft] = useState(() => createCalendarSourceDraft());
  const [showCalendarComposer, setShowCalendarComposer] = useState(false);

  useEffect(() => {
    setActiveCategory(initialCategory || INTEGRATION_CATEGORIES.AUTOMATION);
  }, [initialCategory]);

  const loadAll = async () => {
    setLoading(true);
    let nextNotice = null;

    try {
      const { data, error } = await mockSupabase.from('integrations').select('*');
      if (error) {
        nextNotice = { tone: 'warning', message: 'Legacy integration catalog could not be loaded.' };
        setIntegrations([]);
      } else {
        setIntegrations(data || []);
      }
    } catch {
      nextNotice = { tone: 'warning', message: 'Legacy integration catalog could not be loaded.' };
      setIntegrations([]);
    }

    try {
      setMailboxes(await getMailboxesApi());
    } catch (error) {
      nextNotice = { tone: 'error', message: readErrorMessage(error) };
      setMailboxes([]);
    }

    try {
      const providers = await getMailboxProvidersApi();
      setMailboxProviders(providers?.length ? providers : DEFAULT_MAILBOX_PROVIDERS);
    } catch {
      setMailboxProviders(DEFAULT_MAILBOX_PROVIDERS);
    }

    try {
      setCalendarSources(await getCalendarSourcesApi());
    } catch (error) {
      nextNotice = { tone: 'error', message: readErrorMessage(error) };
      setCalendarSources([]);
    }

    try {
      const providers = await getCalendarProvidersApi();
      setCalendarProviders(providers?.length ? providers : DEFAULT_CALENDAR_PROVIDERS);
    } catch {
      setCalendarProviders(DEFAULT_CALENDAR_PROVIDERS);
    }

    setNotice(nextNotice);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!mailboxes.length) {
      setSelectedMailboxId(null);
      return;
    }
    if (!mailboxes.some((mailbox) => mailbox.id === selectedMailboxId)) {
      setSelectedMailboxId(mailboxes[0].id);
    }
  }, [mailboxes, selectedMailboxId]);

  useEffect(() => {
    if (!calendarSources.length) {
      setSelectedCalendarSourceId(null);
      return;
    }
    if (!calendarSources.some((source) => source.id === selectedCalendarSourceId)) {
      setSelectedCalendarSourceId(calendarSources[0].id);
    }
  }, [calendarSources, selectedCalendarSourceId]);

  const selectedMailbox = useMemo(
    () => mailboxes.find((mailbox) => mailbox.id === selectedMailboxId) || null,
    [mailboxes, selectedMailboxId]
  );

  const selectedCalendarSource = useMemo(
    () => calendarSources.find((source) => source.id === selectedCalendarSourceId) || null,
    [calendarSources, selectedCalendarSourceId]
  );

  useEffect(() => {
    if (!selectedMailbox) {
      setMailboxForm(createMailboxDraft());
      return;
    }
    setMailboxForm({
      name: selectedMailbox.name || '',
      address: selectedMailbox.address || '',
      provider: selectedMailbox.provider || 'local-stub',
      status: selectedMailbox.status || 'connected',
      inbound_enabled: selectedMailbox.inbound_enabled !== false,
      outbound_enabled: selectedMailbox.outbound_enabled !== false,
      config: selectedMailbox.config || {}
    });
  }, [selectedMailbox]);

  useEffect(() => {
    if (!selectedCalendarSource) {
      setCalendarSourceForm(createCalendarSourceDraft());
      return;
    }
    setCalendarSourceForm({
      name: selectedCalendarSource.name || '',
      provider: selectedCalendarSource.provider || 'local-stub',
      sync_direction: selectedCalendarSource.sync_direction || 'two-way',
      config: {
        authority_mode: selectedCalendarSource.authority_mode || selectedCalendarSource.config?.authority_mode || 'local-first',
        import_policy: selectedCalendarSource.import_policy || selectedCalendarSource.config?.import_policy || 'review',
        ...(selectedCalendarSource.config || {})
      }
    });
  }, [selectedCalendarSource]);

  const selectedMailboxProvider = mailboxProviders.find((provider) => provider.id === mailboxForm.provider) || DEFAULT_MAILBOX_PROVIDERS[0];
  const selectedCalendarProvider = calendarProviders.find((provider) => provider.id === calendarSourceForm.provider) || DEFAULT_CALENDAR_PROVIDERS[0];
  const mailboxDraftProvider = mailboxProviders.find((provider) => provider.id === mailboxDraft.provider) || DEFAULT_MAILBOX_PROVIDERS[0];
  const calendarDraftProvider = calendarProviders.find((provider) => provider.id === calendarSourceDraft.provider) || DEFAULT_CALENDAR_PROVIDERS[0];
  const mailboxDeleteTarget = useMemo(
    () => mailboxes.find((mailbox) => mailbox.id !== selectedMailboxId && !SEEDED_MAILBOX_IDS.has(mailbox.id))
      || mailboxes.find((mailbox) => mailbox.id !== selectedMailboxId)
      || null,
    [mailboxes, selectedMailboxId]
  );
  const calendarSourceDeleteTarget = useMemo(
    () => calendarSources.find((source) => source.id !== selectedCalendarSourceId && source.provider !== 'local-stub')
      || calendarSources.find((source) => source.id !== selectedCalendarSourceId)
      || null,
    [calendarSources, selectedCalendarSourceId]
  );

  const categoryCounts = useMemo(() => {
    const counts = {};
    categories.forEach((category) => {
      if (category.id === INTEGRATION_CATEGORIES.EMAIL) {
        counts[category.id] = mailboxes.length;
      } else if (category.id === INTEGRATION_CATEGORIES.CALENDAR) {
        counts[category.id] = calendarSources.length;
      } else {
        counts[category.id] = integrations.filter((integration) => integration.category === category.id).length;
      }
    });
    return counts;
  }, [calendarSources.length, categories, integrations, mailboxes.length]);

  const currentCategory = categories.find((category) => category.id === activeCategory);
  const currentCategoryIntegrations = integrations.filter((integration) => integration.category === activeCategory);

  const handleToggleIntegration = async (integrationId) => {
    try {
      const integration = integrations.find((item) => item.id === integrationId);
      if (!integration) return;
      const updated = { ...integration, enabled: !integration.enabled };
      setIntegrations((current) => current.map((item) => item.id === integrationId ? updated : item));
      const { error } = await mockSupabase.from('integrations').update(integrationId, updated);
      if (error) {
        throw new Error(error);
      }
    } catch (error) {
      setNotice({ tone: 'error', message: `Failed to update integration: ${readErrorMessage(error)}` });
      loadAll();
    }
  };

  const handleRemoveIntegration = async (integrationId) => {
    if (!window.confirm('Remove this integration?')) return;
    try {
      const { error } = await mockSupabase.from('integrations').delete(integrationId);
      if (error) {
        throw new Error(error);
      }
      setIntegrations((current) => current.filter((item) => item.id !== integrationId));
    } catch (error) {
      setNotice({ tone: 'error', message: `Failed to remove integration: ${readErrorMessage(error)}` });
    }
  };

  const handleAddIntegration = async (data) => {
    try {
      const newIntegration = {
        id: Date.now().toString(),
        providerId: data.providerId,
        category: data.category,
        config: data.config,
        customLogo: data.customLogo,
        enabled: true,
        createdAt: new Date().toISOString(),
        configuredAt: new Date().toISOString()
      };
      const { error } = await mockSupabase.from('integrations').insert([newIntegration]);
      if (error) {
        throw new Error(error);
      }
      setIntegrations((current) => [...current, newIntegration]);
      setPanelOpen(false);
      setNotice({ tone: 'success', message: 'Integration added.' });
    } catch (error) {
      setNotice({ tone: 'error', message: `Failed to add integration: ${readErrorMessage(error)}` });
    }
  };

  const handleSaveMailbox = async () => {
    if (!selectedMailbox?.id) return;
    try {
      await updateMailboxApi(selectedMailbox.id, mailboxForm);
      setNotice({ tone: 'success', message: 'Mailbox saved.' });
      loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleCreateMailbox = async () => {
    if (!mailboxDraft.name.trim() || !mailboxDraft.address.trim()) return;
    try {
      const mailbox = await createMailboxApi({
        ...mailboxDraft,
        name: mailboxDraft.name.trim(),
        address: mailboxDraft.address.trim()
      });
      setNotice({ tone: 'success', message: 'Mailbox created.' });
      setShowMailboxComposer(false);
      setMailboxDraft(createMailboxDraft());
      await loadAll();
      setSelectedMailboxId(mailbox?.id || null);
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleAuthorizeMailbox = async () => {
    if (!selectedMailbox?.id || !isMailboxOauthProvider(mailboxForm.provider)) return;
    try {
      await updateMailboxApi(selectedMailbox.id, mailboxForm);
      const result = await openOAuthPopup(getMailboxAuthorizeUrl(selectedMailbox.id), 'mailbox');
      setNotice({ tone: 'success', message: `${selectedMailbox.name} connected via ${result.provider || selectedMailboxProvider.label}.` });
      loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestMailbox = async () => {
    if (!selectedMailbox?.id) return;
    try {
      await updateMailboxApi(selectedMailbox.id, mailboxForm);
      const response = await testMailboxConnectionApi(selectedMailbox.id);
      setNotice({ tone: response?.result?.status === 'ok' ? 'success' : 'warning', message: response?.result?.message || 'Mailbox test completed.' });
      loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSyncMailbox = async () => {
    if (!selectedMailbox?.id) return;
    try {
      const response = await syncMailboxApi(selectedMailbox.id);
      setNotice({ tone: 'success', message: response?.result?.message || 'Mailbox synced.' });
      loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleDeleteMailbox = async () => {
    if (!selectedMailbox?.id) return;
    if (mailboxes.length <= 1) {
      setNotice({ tone: 'warning', message: 'You need to keep at least one mailbox.' });
      return;
    }
    const fallbackMailbox = mailboxDeleteTarget;
    const fallbackLabel = fallbackMailbox?.name ? ` Threads will move to ${fallbackMailbox.name}.` : '';
    if (!window.confirm(`Delete ${selectedMailbox.name}?${fallbackLabel}`)) return;
    try {
      const response = await deleteMailboxApi(selectedMailbox.id, fallbackMailbox?.id);
      setNotice({
        tone: 'success',
        message: `${response?.deleted_mailbox_name || selectedMailbox.name} deleted.${response?.reassigned_threads ? ` ${response.reassigned_threads} thread(s) moved to ${response?.fallback_mailbox_name || fallbackMailbox?.name}.` : ''}`
      });
      await loadAll();
      setSelectedMailboxId(response?.fallback_mailbox_id || fallbackMailbox?.id || null);
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleDisconnectMailbox = async () => {
    if (!selectedMailbox?.id) return;
    if (!window.confirm(`Disconnect ${selectedMailbox.name}? OAuth/session state will be cleared and the mailbox will require reconnect before use.`)) return;
    try {
      const response = await disconnectMailboxApi(selectedMailbox.id);
      setNotice({ tone: 'success', message: `${response?.mailbox?.name || selectedMailbox.name} disconnected.` });
      await loadAll();
      setSelectedMailboxId(selectedMailbox.id);
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSaveCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, calendarSourceForm);
      setNotice({ tone: 'success', message: 'Calendar source saved.' });
      loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleCreateCalendarSource = async () => {
    if (!calendarSourceDraft.name.trim()) return;
    try {
      const source = await createCalendarSourceApi(calendarSourceDraft);
      setNotice({ tone: 'success', message: 'Calendar source created.' });
      setShowCalendarComposer(false);
      setCalendarSourceDraft(createCalendarSourceDraft());
      await loadAll();
      setSelectedCalendarSourceId(source?.id || null);
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleAuthorizeCalendarSource = async () => {
    if (!selectedCalendarSource?.id || !isCalendarOauthProvider(calendarSourceForm.provider)) return;
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, calendarSourceForm);
      const result = await openOAuthPopup(getCalendarSourceAuthorizeUrl(selectedCalendarSource.id), 'calendar');
      setNotice({ tone: 'success', message: `${selectedCalendarSource.name} connected via ${result.provider || selectedCalendarProvider.label}.` });
      loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, calendarSourceForm);
      const response = await testCalendarSourceApi(selectedCalendarSource.id);
      setNotice({ tone: 'success', message: response?.result?.message || 'Calendar source tested.' });
      loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSyncCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    try {
      const response = await syncCalendarSourceApi(selectedCalendarSource.id);
      setNotice({ tone: 'success', message: response?.result?.message || 'Calendar source synced.' });
      loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleImportCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    try {
      const response = await importCalendarSourceApi(selectedCalendarSource.id);
      const conflicts = response?.result?.conflicted_count || 0;
      setNotice({
        tone: conflicts ? 'warning' : 'success',
        message: conflicts
          ? `${response?.result?.imported_count || 0} events imported. ${conflicts} need review.`
          : response?.result?.message || 'Calendar feed imported.'
      });
      loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleDeleteCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    const fallbackSource = calendarSourceDeleteTarget;
    const fallbackLabel = fallbackSource?.name ? ` Events will move to ${fallbackSource.name}.` : ' Events currently tied to it will become unscoped.';
    if (!window.confirm(`Delete ${selectedCalendarSource.name}?${fallbackLabel}`)) return;
    try {
      const response = await deleteCalendarSourceApi(selectedCalendarSource.id, fallbackSource?.id);
      setNotice({
        tone: 'success',
        message: `${response?.deleted_source_name || selectedCalendarSource.name} deleted.${response?.reassigned_events ? ` ${response.reassigned_events} event(s) moved to ${response?.fallback_source_name || fallbackSource?.name}.` : response?.cleared_events ? ` ${response.cleared_events} event(s) were detached from that source.` : ''}`
      });
      await loadAll();
      setSelectedCalendarSourceId(response?.fallback_source_id || fallbackSource?.id || null);
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleDisconnectCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    if (!window.confirm(`Disconnect ${selectedCalendarSource.name}? OAuth/feed sync state will be cleared and the source will require reconnect before use.`)) return;
    try {
      const response = await disconnectCalendarSourceApi(selectedCalendarSource.id);
      setNotice({ tone: 'success', message: `${response?.source?.name || selectedCalendarSource.name} disconnected.` });
      await loadAll();
      setSelectedCalendarSourceId(selectedCalendarSource.id);
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const renderEmailAdmin = () => (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Mailboxes</div>
            <div className="text-sm text-[var(--color-text-secondary)]">Centralized provider credentials and health. Reading and replying happens in Comms.</div>
          </div>
          <button onClick={() => setShowMailboxComposer((current) => !current)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            {showMailboxComposer ? 'Close' : 'New'}
          </button>
        </div>
        {showMailboxComposer ? (
          <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(15,23,42,0.22))] p-4 space-y-3">
            <div className="grid gap-3 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Mailbox Name</div><input value={mailboxDraft.name} onChange={(event) => setMailboxDraft((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Address</div><input value={mailboxDraft.address} onChange={(event) => setMailboxDraft((current) => ({ ...current, address: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><select value={mailboxDraft.provider} onChange={(event) => setMailboxDraft((current) => ({ ...current, provider: event.target.value, config: {} }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]">{mailboxProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
            </div>
            {mailboxDraftProvider.fields?.length ? (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                {mailboxDraftProvider.fields.map((field) => (
                  <label key={field.key} className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div>
                    <input value={mailboxDraft.config?.[field.key] || ''} onChange={(event) => setMailboxDraft((current) => ({ ...current, config: { ...(current.config || {}), [field.key]: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" />
                  </label>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3 text-sm text-[var(--color-text-secondary)]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={mailboxDraft.inbound_enabled} onChange={(event) => setMailboxDraft((current) => ({ ...current, inbound_enabled: event.target.checked }))} />Inbound enabled</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={mailboxDraft.outbound_enabled} onChange={(event) => setMailboxDraft((current) => ({ ...current, outbound_enabled: event.target.checked }))} />Outbound enabled</label>
            </div>
            <button onClick={handleCreateMailbox} disabled={!mailboxDraft.name.trim() || !mailboxDraft.address.trim()} className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:opacity-50">Create Mailbox</button>
          </div>
        ) : null}
        <div className="space-y-3">
          {mailboxes.map((mailbox) => (
            <ResourceCard
              key={mailbox.id}
              icon={Mail}
              title={mailbox.name}
              subtitle={mailbox.provider}
              status={mailbox.health?.label || mailbox.status || 'Unknown'}
              detail={providerStateDetail(mailbox.config, mailbox.address || 'No address')}
              selected={selectedMailboxId === mailbox.id}
              onClick={() => setSelectedMailboxId(mailbox.id)}
              chips={[
                `Now ${mailbox.queue_counts?.now || 0}`,
                `Reply ${mailbox.queue_counts?.['needs-reply'] || 0}`,
                mailbox.inbound_enabled ? 'Inbound On' : 'Inbound Off',
                mailbox.config?.connected_identity ? 'Connected' : 'Needs Auth'
              ]}
            />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {selectedMailbox ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Mailbox Control Plane</div><h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{selectedMailbox.name}</h3></div>
              <div className="flex flex-wrap gap-2">
                {isMailboxOauthProvider(mailboxForm.provider) ? <button onClick={handleAuthorizeMailbox} className="rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-3 py-2 text-sm text-[var(--color-text-primary)]">Connect OAuth</button> : null}
                {isMailboxOauthProvider(mailboxForm.provider) ? <button onClick={handleDisconnectMailbox} className="rounded-lg border border-amber-500/30 px-3 py-2 text-sm text-amber-200">Disconnect</button> : null}
                <button onClick={handleTestMailbox} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Test</button>
                <button onClick={handleSyncMailbox} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Sync</button>
                <button onClick={handleSaveMailbox} className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-on-primary)]">Save</button>
                <button onClick={handleDeleteMailbox} disabled={mailboxes.length <= 1} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 size={14} />Delete</button>
              </div>
            </div>
            {mailboxForm.config?.last_error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">{mailboxForm.config.last_error}</div> : null}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              This page is for connection management. The actual mail reader is the thread workspace in <span className="font-medium text-[var(--color-text-primary)]">Comms</span>.
              {mailboxDeleteTarget ? ` Deleting this mailbox will reassign any linked threads to ${mailboxDeleteTarget.name}.` : ' The last remaining mailbox cannot be deleted.'}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Health</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.health?.label || selectedMailbox.status || 'Unknown'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Sync</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.last_synced_at ? new Date(selectedMailbox.last_synced_at).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Inbound</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.inbound_enabled ? 'Enabled' : 'Disabled'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Outbound</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.outbound_enabled ? 'Enabled' : 'Disabled'}</div></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Connected Account</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{mailboxForm.config?.connected_identity || mailboxForm.address || 'Not connected'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{mailboxForm.config?.last_tested_at ? new Date(mailboxForm.config.last_tested_at).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider State</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{mailboxForm.status || selectedMailbox.status || 'Unknown'}</div></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Name</div><input value={mailboxForm.name} onChange={(event) => setMailboxForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Address</div><input value={mailboxForm.address} onChange={(event) => setMailboxForm((current) => ({ ...current, address: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><select value={mailboxForm.provider} onChange={(event) => setMailboxForm((current) => ({ ...current, provider: event.target.value, config: {} }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]">{mailboxProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><input value={mailboxForm.status || ''} onChange={(event) => setMailboxForm((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
            </div>
            {selectedMailboxProvider.fields?.length ? <div className="grid gap-3 sm:grid-cols-2 text-sm">{selectedMailboxProvider.fields.map((field) => <label key={field.key} className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div><input value={mailboxForm.config?.[field.key] || ''} onChange={(event) => setMailboxForm((current) => ({ ...current, config: { ...(current.config || {}), [field.key]: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>)}</div> : <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">This provider does not require external credentials.</div>}
            <div className="flex flex-wrap gap-3 text-sm text-[var(--color-text-secondary)]"><label className="flex items-center gap-2"><input type="checkbox" checked={mailboxForm.inbound_enabled} onChange={(event) => setMailboxForm((current) => ({ ...current, inbound_enabled: event.target.checked }))} />Inbound enabled</label><label className="flex items-center gap-2"><input type="checkbox" checked={mailboxForm.outbound_enabled} onChange={(event) => setMailboxForm((current) => ({ ...current, outbound_enabled: event.target.checked }))} />Outbound enabled</label></div>
          </div>
        ) : <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 text-center text-[var(--color-text-secondary)]">Create or select a mailbox to manage credentials and sync behavior.</div>}
      </div>
    </div>
  );

  const renderCalendarAdmin = () => (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Calendar Sources</div>
            <div className="text-sm text-[var(--color-text-secondary)]">OAuth, feed, and reconciliation authority</div>
          </div>
          <button onClick={() => setShowCalendarComposer((current) => !current)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            {showCalendarComposer ? 'Close' : 'New'}
          </button>
        </div>
        {showCalendarComposer ? (
          <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(15,23,42,0.22))] p-4 space-y-3">
            <div className="grid gap-3 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Source Name</div><input value={calendarSourceDraft.name} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><select value={calendarSourceDraft.provider} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, provider: event.target.value, config: { authority_mode: current.config?.authority_mode || 'local-first', import_policy: current.config?.import_policy || 'review' } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]">{calendarProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Authority Mode</div><select value={calendarSourceDraft.config?.authority_mode || 'local-first'} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, config: { ...(current.config || {}), authority_mode: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="local-first">Local First</option><option value="mirror">Mirror External</option><option value="external-first">External First</option></select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Import Policy</div><select value={calendarSourceDraft.config?.import_policy || 'review'} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, config: { ...(current.config || {}), import_policy: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="review">Review Before Adopt</option><option value="auto-merge">Auto Merge</option><option value="hold">Hold Imported Only</option></select></label>
            </div>
            {calendarDraftProvider.fields?.length ? <div className="grid gap-3 sm:grid-cols-2 text-sm">{calendarDraftProvider.fields.map((field) => <label key={field.key} className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div><input value={calendarSourceDraft.config?.[field.key] || ''} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, config: { ...(current.config || {}), [field.key]: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>)}</div> : null}
            <button onClick={handleCreateCalendarSource} disabled={!calendarSourceDraft.name.trim()} className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:opacity-50">Create Source</button>
          </div>
        ) : null}
        <div className="space-y-3">
          {calendarSources.map((source) => (
            <ResourceCard
              key={source.id}
              icon={CalendarDays}
              title={source.name}
              subtitle={source.provider}
              status={source.health?.label || source.status || 'Unknown'}
              detail={providerStateDetail(source.config, source.health?.detail || 'Source ready.')}
              selected={selectedCalendarSourceId === source.id}
              onClick={() => setSelectedCalendarSourceId(source.id)}
              chips={[
                `Events ${source.event_counts?.total || 0}`,
                `Synced ${source.event_counts?.synced || 0}`,
                `Conflicts ${source.event_counts?.conflicts || 0}`,
                source.config?.connected_calendar ? 'Connected' : 'Needs Auth'
              ]}
            />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {selectedCalendarSource ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Calendar Control Plane</div><h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.name}</h3></div>
              <div className="flex flex-wrap gap-2">
                {isCalendarOauthProvider(calendarSourceForm.provider) ? <button onClick={handleAuthorizeCalendarSource} className="rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-3 py-2 text-sm text-[var(--color-text-primary)]">Connect OAuth</button> : null}
                {isCalendarOauthProvider(calendarSourceForm.provider) ? <button onClick={handleDisconnectCalendarSource} className="rounded-lg border border-amber-500/30 px-3 py-2 text-sm text-amber-200">Disconnect</button> : null}
                <button onClick={handleTestCalendarSource} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Test</button>
                <button onClick={handleSyncCalendarSource} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Sync</button>
                <button onClick={handleImportCalendarSource} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Import</button>
                <button onClick={handleSaveCalendarSource} className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-on-primary)]">Save</button>
                <button onClick={handleDeleteCalendarSource} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300"><Trash2 size={14} />Delete</button>
              </div>
            </div>
            {calendarSourceForm.config?.last_error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">{calendarSourceForm.config.last_error}</div> : null}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              {calendarSourceDeleteTarget ? `Deleting this source will move any linked events to ${calendarSourceDeleteTarget.name}.` : 'If this is the last source, linked events will simply be detached from it.'}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Health</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.health?.label || selectedCalendarSource.status || 'Unknown'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Events</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.event_counts?.total || 0}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Synced</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.event_counts?.synced || 0}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Conflicts</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.event_counts?.conflicts || 0}</div></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Connected Calendar</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{calendarSourceForm.config?.connected_calendar || 'Not connected'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{calendarSourceForm.config?.last_tested_at ? new Date(calendarSourceForm.config.last_tested_at).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Sync</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.last_synced_at ? new Date(selectedCalendarSource.last_synced_at).toLocaleString() : 'Never'}</div></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Source Name</div><input value={calendarSourceForm.name} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><select value={calendarSourceForm.provider} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, provider: event.target.value, config: { authority_mode: current.config?.authority_mode || 'local-first', import_policy: current.config?.import_policy || 'review' } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]">{calendarProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Authority Mode</div><select value={calendarSourceForm.config?.authority_mode || 'local-first'} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), authority_mode: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="local-first">Local First</option><option value="mirror">Mirror External</option><option value="external-first">External First</option></select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Import Policy</div><select value={calendarSourceForm.config?.import_policy || 'review'} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), import_policy: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="review">Review Before Adopt</option><option value="auto-merge">Auto Merge</option><option value="hold">Hold Imported Only</option></select></label>
            </div>
            {selectedCalendarProvider.fields?.length ? <div className="grid gap-3 sm:grid-cols-2 text-sm">{selectedCalendarProvider.fields.map((field) => <label key={field.key} className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div><input value={calendarSourceForm.config?.[field.key] || ''} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), [field.key]: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>)}</div> : <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">This provider does not require external credentials.</div>}
            <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]"><span className="rounded-full border border-[var(--color-border)] px-2 py-1">Authority {sourceRuleLabels[selectedCalendarSource.authority_mode] || selectedCalendarSource.authority_mode}</span><span className="rounded-full border border-[var(--color-border)] px-2 py-1">Import {sourceRuleLabels[selectedCalendarSource.import_policy] || selectedCalendarSource.import_policy}</span></div>
          </div>
        ) : <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 text-center text-[var(--color-text-secondary)]">Create or select a calendar source to manage OAuth, sync rules, and import policy.</div>}
      </div>
    </div>
  );

  const renderLegacyCategory = () => (
    <div className="flex-1 overflow-auto">
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-blue-500" />
          <p className="text-[var(--color-text-secondary)]">Loading integrations...</p>
        </div>
      ) : currentCategoryIntegrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <ShieldCheck className="text-[var(--color-text-secondary)]" size={48} />
          <h3 className="m-0 text-lg font-semibold text-[var(--color-text-primary)]">No integrations yet</h3>
          <p className="m-0 text-sm text-[var(--color-text-secondary)]">Add your first {currentCategory?.name.toLowerCase()} integration to get started</p>
          <button className="mt-2 rounded bg-purple-500 px-4 py-2 font-semibold text-white transition-all hover:bg-purple-600" onClick={() => setPanelOpen(true)}>Add {currentCategory?.name} Integration</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {currentCategoryIntegrations.map((integration) => {
            const provider = getProviderConfig(integration.providerId);
            if (!provider) return null;
            return <IntegrationCard key={integration.id} integration={integration} provider={provider} isEnabled={integration.enabled} onToggle={handleToggleIntegration} onSettings={() => setPanelOpen(true)} onRemove={handleRemoveIntegration} customLogo={integration.customLogo} />;
          })}
        </div>
      )}
    </div>
  );

  const totalConnected = integrations.length + mailboxes.length + calendarSources.length;
  const activeConnected = integrations.filter((integration) => integration.enabled).length + mailboxes.filter((mailbox) => mailbox.status !== 'disconnected').length + calendarSources.filter((source) => source.status !== 'disconnected').length;

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <ModuleHeader
        title="Integrations"
        showTitle={false}
        actions={[
          {
            label: activeCategory === INTEGRATION_CATEGORIES.EMAIL ? 'New Mailbox' : activeCategory === INTEGRATION_CATEGORIES.CALENDAR ? 'New Source' : 'Add Integration',
            icon: Plus,
            onClick: () => {
              if (activeCategory === INTEGRATION_CATEGORIES.EMAIL) {
                setShowMailboxComposer(true);
              } else if (activeCategory === INTEGRATION_CATEGORIES.CALENDAR) {
                setShowCalendarComposer(true);
              } else {
                setPanelOpen(true);
              }
            },
            variant: 'primary'
          },
          { label: 'Refresh', icon: RefreshCw, onClick: loadAll, variant: 'secondary' }
        ]}
        showActions
        aiAssistSlot={<AIAssistButton onAssist={() => console.log('AI Assist: Integrations')} tooltip="AI Assist" iconType="crosshair" />}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <p className="m-0 text-sm text-[var(--color-text-secondary)]">Admin control plane for mailbox accounts, calendar sources, and every other external system connected to AIO CRM.</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"><div className="text-xs font-medium text-[var(--color-text-secondary)]">Total Connections</div><div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{totalConnected}</div></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"><div className="text-xs font-medium text-[var(--color-text-secondary)]">Active</div><div className="mt-2 text-2xl font-bold text-green-500">{activeConnected}</div></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"><div className="text-xs font-medium text-[var(--color-text-secondary)]">Categories</div><div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{categories.length}</div></div>
        </div>
        {notice ? <div className={`rounded-lg border p-4 ${toneClass(notice.tone)}`}>{notice.message}</div> : null}
        <IntegrationTabs categories={categories} activeCategory={activeCategory} onCategoryChange={setActiveCategory} counts={categoryCounts} />
        <div className="flex-1 overflow-hidden">
          {activeCategory === INTEGRATION_CATEGORIES.EMAIL ? renderEmailAdmin() : activeCategory === INTEGRATION_CATEGORIES.CALENDAR ? renderCalendarAdmin() : renderLegacyCategory()}
        </div>
        <AddIntegrationPanel isOpen={panelOpen} category={activeCategory} onClose={() => setPanelOpen(false)} onSave={handleAddIntegration} onCategoryChange={setActiveCategory} categories={categories} />
      </div>
    </div>
  );
};

export default ActiveIntegrations;
