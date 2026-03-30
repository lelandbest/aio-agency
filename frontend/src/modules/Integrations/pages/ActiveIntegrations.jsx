/**
 * LOCKED: AI Provider Unified Architecture - Phase 1 & 2
 * Verified Stable: March 25, 2026
 * DO NOT MODIFY SCHEMA OR STATS LOGIC WITHOUT OPERATOR APPROVAL
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CalendarDays, CheckCircle2, Mail, Plus, RefreshCw, ShieldCheck, Trash2, Zap } from 'lucide-react';
import IntegrationCard from '../components/IntegrationCard';
import IntegrationTabs from '../components/IntegrationTabs';
import AddIntegrationPanel from '../components/AddIntegrationPanel';
import { getAllCategories, getProviderConfig, getProvidersByCategory, INTEGRATION_CATEGORIES, normalizeAiField } from '../utils/integrationConfigs';
import { getBrandIcon } from '../utils/brandIcons.jsx';
import ModuleHeader from '../../../components/ModuleHeader';
import {
  deleteAutomationProviderConfigApi,
  deleteAiProviderConfigApi,
  deleteEmailVerifierConfigApi,
  getAutomationProviderConfigsApi,
  getAiProviderCatalogApi,
  getAiProviderConfigsApi,
  getOllamaModelsApi,
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
  getEmailVerifierConfigApi,
  importCalendarSourceApi,
  listCalendarSourceCalendarsApi,
  syncCalendarSourceApi,
  syncMailboxApi,
  testAutomationProviderConfigApi,
  testCalendarSourceApi,
  testAiProviderConfigApi,
  testEmailVerifierConfigApi,
  testMailboxConnectionApi,
  updateCalendarSourceApi,
  updateEmailVerifierConfigApi,
  updateMailboxApi,
  upsertAutomationProviderConfigApi,
  upsertAiProviderConfigApi,
  getPaymentProviderConfigsApi,
  upsertPaymentProviderConfigApi,
  deletePaymentProviderConfigApi
} from '../../../services/backendApi';
import { openOAuthPopup } from '../../../utils/oauthPopup';

const DEFAULT_MAILBOX_PROVIDERS = [
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
  },
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
  }
];

const DEFAULT_CALENDAR_PROVIDERS = [
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
    id: 'google-meet-oauth',
    label: 'Google Meet',
    fields: [
      { key: 'email', label: 'Google Account' },
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client Secret' },
      { key: 'refresh_token', label: 'Refresh Token' },
      { key: 'calendar_id', label: 'Calendar ID' }
    ]
  },
  {
    id: 'zoom-api',
    label: 'Zoom',
    fields: [
      { key: 'account_id', label: 'Account ID' },
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client Secret' },
      { key: 'user_id', label: 'User ID' }
    ]
  },
  {
    id: 'jitsi-stub',
    label: 'Jitsi',
    fields: [
      { key: 'server_url', label: 'Server URL' },
      { key: 'room_prefix', label: 'Room Prefix' },
      { key: 'api_key', label: 'API Key' }
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
  }
];

const VIDEO_CONFERENCING_PROVIDER_IDS = new Set(['zoom-api', 'google-meet-oauth', 'jitsi-stub']);
const isVideoConferencingProvider = (providerId) => VIDEO_CONFERENCING_PROVIDER_IDS.has(String(providerId || '').trim());

// DEPRECATED: DEFAULT_AI_PROVIDER_CATALOG removed in favor of providerSchema.js

const getAiFieldName = (field) => normalizeAiField(field?.name || field?.key || '');

const createAiProviderDraft = (provider) => {
  const fields = provider?.fields || [];
  const findField = (name) => fields.find((f) => getAiFieldName(f) === name);
  const isOllama = provider?.id === 'ollama' || provider?.key === 'ollama';

  return {
    baseUrl: provider?.defaultBaseUrl || findField('base_url')?.default || '',
    model: provider?.defaultModel || findField('model')?.default || '',
    apiKey: '',
    temperature: findField('temperature')?.default || (isOllama ? '0.2' : ''),
    username: '',
    password: '',
    systemGuardrails: '',
    taskGuardrails: '',
    siteUrl: '',
    appName: 'AIO CRM',
    enabled: isOllama,
    isDefault: isOllama,
    config: isOllama ? { temperature: '0.2', username: '', password: '' } : {}
  };
};

const resolveAiProviderFieldValue = (form, fieldName) => {
  if (!form) return '';
  if (Object.prototype.hasOwnProperty.call(form, fieldName)) {
    return form[fieldName] ?? '';
  }
  const normalized = normalizeAiField(fieldName);
  if (normalized !== fieldName && Object.prototype.hasOwnProperty.call(form, normalized)) {
    return form[normalized] ?? '';
  }
  return '';
};

const sanitizeAiProviderConfig = (rawConfig = {}) => {
  const cleaned = { ...rawConfig };
  ['label', 'api_key', 'apiKey', 'base_url', 'baseUrl', 'model'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(cleaned, key)) {
      delete cleaned[key];
    }
  });
  return cleaned;
};


const createAutomationProviderDraft = (provider) => ({
  label: provider?.name || '',
  baseUrl: provider?.fields?.find((field) => field.name === 'baseUrl')?.default || '',
  apiKey: '',
  enabled: true,
  config: Object.fromEntries(
    (provider?.fields || [])
      .filter((field) => !['label', 'baseUrl', 'apiKey'].includes(field.name))
      .map((field) => [field.name, field.default ?? (field.type === 'checkbox' ? false : '')])
  )
});

const createPaymentProviderDraft = (provider) => ({
  label: provider?.name || '',
  publishableKey: provider?.fields?.find((field) => field.name === 'publishableKey')?.default || '',
  secretKey: '',
  webhookSecret: '',
  enabled: true,
  config: Object.fromEntries(
    (provider?.fields || [])
      .filter((field) => !['label', 'publishableKey', 'secretKey', 'webhookSecret'].includes(field.name))
      .map((field) => [field.name, field.default ?? (field.type === 'checkbox' ? false : '')])
  )
});

const createMailboxDraft = (provider = 'gmail-oauth') => ({
  name: '',
  address: '',
  provider,
  inboundEnabled: true,
  outboundEnabled: true,
  config: {}
});

const createCalendarSourceDraft = (provider = 'google-calendar-oauth') => ({
  name: '',
  provider,
  syncDirection: 'two-way',
  config: {
    authorityMode: 'local-first',
    importPolicy: 'review'
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
const isCalendarOauthProvider = (providerId) => ['google-calendar-oauth', 'google-meet-oauth', 'microsoft365-calendar'].includes(providerId);
const SEEDED_MAILBOX_IDS = new Set(['mailbox-primary', 'mailbox-growth']);
const EMAIL_VERIFIER_RESOURCE_ID = 'reoon-email-verifier';
const isNeedsConfigStatus = (value) => String(value || '').trim().toLowerCase() === 'needs_config';
const AUTH_FAILURE_PATTERN = /(invalid[_\s-]?grant|invalid[_\s-]?client|unauthori[sz]ed|auth(?:entication)?\s+failed|token(?:\s+refresh)?\s+failed|refresh[_\s-]?token|expired|revoked|oauth|reconnect|reauthori[sz]e)/i;
const CANONICAL_STATUS_VALUES = new Set(['connected', 'needs_config', 'reconnect_required', 'unauthorized', 'disconnected']);
const hasConfigValue = (value) => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined && value !== false;
};

const resolveCanonicalStatus = (resource = {}) => {
  const normalized = String(resource.statusCanonical || '').trim().toLowerCase();
  return CANONICAL_STATUS_VALUES.has(normalized) ? normalized : '';
};

const buildCanonicalStateMeta = (machine, { connectedLabel, disconnectedLabel, needsConfigDetail, reconnectDetail, unauthorizedDetail, connectedDetail }) => {
  if (machine === 'disconnected') {
    return {
      machine: 'disconnected',
      label: 'Disconnected',
      detail: disconnectedLabel,
      tone: 'warning',
      authActionsDisabled: true,
      saveDisabled: false,
      primaryActionLabel: 'Connect OAuth'
    };
  }

  if (machine === 'reconnect_required') {
    return {
      machine: 'reconnect_required',
      label: 'Reconnect Required',
      detail: reconnectDetail,
      tone: 'warning',
      authActionsDisabled: true,
      saveDisabled: true,
      primaryActionLabel: 'Reconnect'
    };
  }

  if (machine === 'unauthorized') {
    return {
      machine: 'unauthorized',
      label: 'Unauthorized',
      detail: unauthorizedDetail,
      tone: 'error',
      authActionsDisabled: true,
      saveDisabled: true,
      primaryActionLabel: 'Reconnect'
    };
  }

  if (machine === 'needs_config') {
    return {
      machine: 'needs_config',
      label: 'Needs Config',
      detail: needsConfigDetail,
      tone: 'warning',
      authActionsDisabled: true,
      saveDisabled: false,
      primaryActionLabel: 'Connect OAuth'
    };
  }

  return {
    machine: 'connected',
    label: connectedLabel,
    detail: connectedDetail,
    tone: 'success',
    authActionsDisabled: false,
    saveDisabled: false,
    primaryActionLabel: 'Reconnect'
  };
};

const getMailboxStateMeta = (mailbox = {}) => {
  const config = mailbox.config || {};
  const provider = mailbox.provider;
  const rawStatus = String(mailbox.status || '').trim().toLowerCase();
  const lastError = String(config.lastError || '').trim();
  const connectedIdentity = config.connectedIdentity || config.email || mailbox.address || '';
  const missingRefreshToken = isMailboxOauthProvider(provider) && !hasConfigValue(config.refreshToken);
  const missingCredentials = isMailboxOauthProvider(provider)
    ? ['client_id', 'client_secret'].filter((key) => !hasConfigValue(config[key]))
    : [];
  const missingIdentity = isMailboxOauthProvider(provider) && !hasConfigValue(connectedIdentity);
  const hasAuthFailure = isMailboxOauthProvider(provider) && (rawStatus === 'error' || AUTH_FAILURE_PATTERN.test(lastError));
  const canonicalMachine = resolveCanonicalStatus(mailbox);

  if (canonicalMachine) {
    return buildCanonicalStateMeta(canonicalMachine, {
      connectedLabel: 'Connected',
      disconnectedLabel: 'Mailbox is not connected to a live provider.',
      needsConfigDetail: lastError || 'Required mailbox credentials are incomplete.',
      reconnectDetail: lastError || 'OAuth refresh token is missing. Reconnect to restore mailbox access.',
      unauthorizedDetail: lastError || 'OAuth authorization failed or expired. Reconnect to restore access.',
      connectedDetail: lastError || connectedIdentity || mailbox.address || 'Mailbox is ready.'
    });
  }

  if (rawStatus === 'disconnected') {
    return {
      machine: 'disconnected',
      label: 'Disconnected',
      detail: 'Mailbox is not connected to a live provider.',
      tone: 'warning',
      authActionsDisabled: true,
      saveDisabled: false,
      primaryActionLabel: 'Connect OAuth'
    };
  }

  if (missingRefreshToken) {
    return {
      machine: 'reconnect_required',
      label: 'Reconnect Required',
      detail: lastError || 'OAuth refresh token is missing. Reconnect to restore mailbox access.',
      tone: 'warning',
      authActionsDisabled: true,
      saveDisabled: true,
      primaryActionLabel: 'Reconnect'
    };
  }

  if (hasAuthFailure) {
    return {
      machine: 'unauthorized',
      label: 'Unauthorized',
      detail: lastError || 'OAuth authorization failed or expired. Reconnect to restore access.',
      tone: 'error',
      authActionsDisabled: true,
      saveDisabled: true,
      primaryActionLabel: 'Reconnect'
    };
  }

  if (missingCredentials.length || missingIdentity || rawStatus === 'needs_config') {
    return {
      machine: 'needs_config',
      label: 'Needs Config',
      detail: lastError || 'Required mailbox credentials are incomplete.',
      tone: 'warning',
      authActionsDisabled: true,
      saveDisabled: false,
      primaryActionLabel: 'Connect OAuth'
    };
  }

  return {
    machine: 'connected',
    label: 'Connected',
    detail: lastError || connectedIdentity || mailbox.address || 'Mailbox is ready.',
    tone: 'success',
    authActionsDisabled: false,
    saveDisabled: false,
    primaryActionLabel: 'Reconnect'
  };
};

const getCalendarSourceStateMeta = (source = {}) => {
  const config = source.config || {};
  const provider = source.provider;
  const rawStatus = String(source.status || '').trim().toLowerCase();
  const lastError = String(config.lastError || '').trim();
  const connectedIdentity = config.connectedIdentity || config.email || '';
  const connectedCalendar = config.connectedCalendar || config.calendar_id || '';
  const missingRefreshToken = isCalendarOauthProvider(provider) && !hasConfigValue(config.refreshToken);
  const missingCredentials = provider === 'google-calendar-oauth'
    ? ['client_id', 'client_secret'].filter((key) => !hasConfigValue(config[key]))
    : provider === 'microsoft365-calendar'
      ? ['tenant_id', 'client_id', 'client_secret', 'user_id'].filter((key) => !hasConfigValue(config[key]))
      : [];
  const missingIdentity = isCalendarOauthProvider(provider) && !hasConfigValue(connectedIdentity);
  const missingCalendar = isCalendarOauthProvider(provider) && !hasConfigValue(connectedCalendar);
  const hasAuthFailure = isCalendarOauthProvider(provider) && (rawStatus === 'error' || AUTH_FAILURE_PATTERN.test(lastError));
  const canonicalMachine = resolveCanonicalStatus(source);

  if (canonicalMachine) {
    return buildCanonicalStateMeta(canonicalMachine, {
      connectedLabel: 'Connected',
      disconnectedLabel: 'Calendar source is not connected to a live provider.',
      needsConfigDetail: lastError || 'Required calendar credentials or calendar selection are incomplete.',
      reconnectDetail: lastError || 'OAuth refresh token is missing. Reconnect to restore calendar access.',
      unauthorizedDetail: lastError || 'OAuth authorization failed or expired. Reconnect to restore access.',
      connectedDetail: lastError || config.connectedCalendar || config.connectedIdentity || 'Calendar source is ready.'
    });
  }

  if (rawStatus === 'disconnected') {
    return {
      machine: 'disconnected',
      label: 'Disconnected',
      detail: 'Calendar source is not connected to a live provider.',
      tone: 'warning',
      authActionsDisabled: true,
      saveDisabled: false,
      primaryActionLabel: 'Connect OAuth'
    };
  }

  if (missingRefreshToken) {
    return {
      machine: 'reconnect_required',
      label: 'Reconnect Required',
      detail: lastError || 'OAuth refresh token is missing. Reconnect to restore calendar access.',
      tone: 'warning',
      authActionsDisabled: true,
      saveDisabled: true,
      primaryActionLabel: 'Reconnect'
    };
  }

  if (hasAuthFailure) {
    return {
      machine: 'unauthorized',
      label: 'Unauthorized',
      detail: lastError || 'OAuth authorization failed or expired. Reconnect to restore access.',
      tone: 'error',
      authActionsDisabled: true,
      saveDisabled: true,
      primaryActionLabel: 'Reconnect'
    };
  }

  if (missingCredentials.length || missingIdentity || missingCalendar || rawStatus === 'needs_config') {
    return {
      machine: 'needs_config',
      label: 'Needs Config',
      detail: lastError || 'Required calendar credentials or calendar selection are incomplete.',
      tone: 'warning',
      authActionsDisabled: true,
      saveDisabled: false,
      primaryActionLabel: 'Connect OAuth'
    };
  }

  return {
    machine: 'connected',
    label: 'Connected',
    detail: lastError || config.connectedCalendar || config.connectedIdentity || 'Calendar source is ready.',
    tone: 'success',
    authActionsDisabled: false,
    saveDisabled: false,
    primaryActionLabel: 'Reconnect'
  };
};

const createEmailVerifierDraft = (config = {}) => ({
  apiKey: '',
  enabled: !!config.enabled,
  autoVerifyContacts: config.autoVerifyContacts !== false,
  defaultMode: config.defaultMode === 'power' ? 'power' : 'quick',
});

const getEmailVerifierStatusMeta = (config = {}) => {
  if (!config?.hasApiKey) {
    return { label: 'Disconnected', tone: 'disconnected' };
  }
  if (!config?.enabled) {
    return { label: 'Disabled', tone: 'disabled' };
  }
  if (config?.status === 'error') {
    return { label: 'Test Failed', tone: 'error' };
  }
  return { label: 'Connected', tone: 'connected' };
};

const getEmailVerifierDetail = (config = {}) => {
  if (config?.status === 'error') {
    return config?.lastError || 'The last connection test failed.';
  }
  if (!config?.hasApiKey) {
    return 'Add a Reoon API key to enable tenant-scoped email verification.';
  }
  if (!config?.enabled) {
    return 'Config is saved but verification is currently disabled for this tenant.';
  }
  return 'Used by CRM single verify, bulk verify, and flow nodes through the existing verifier runtime.';
};

const readErrorMessage = (error) => {
  const raw = error?.message || 'Action failed.';
  try {
    const parsed = JSON.parse(raw);
    return parsed.detail || parsed.message || raw;
  } catch {
    return raw;
  }
};

const useTransientSaveFeedback = (duration = 1400) => {
  const [savedKey, setSavedKey] = useState('');
  const timeoutRef = useRef(null);

  useEffect(() => () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
  }, []);

  const triggerSaved = (key) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    setSavedKey(key);
    timeoutRef.current = window.setTimeout(() => {
      setSavedKey('');
      timeoutRef.current = null;
    }, duration);
  };

  return [savedKey, triggerSaved];
};

const saveButtonClassName = (baseClassName, isSaved) => `${baseClassName} save-feedback-btn${isSaved ? ' is-saved' : ''}`;
const SaveFeedbackNote = ({ visible, label = 'Saved' }) => visible ? <span className="save-feedback-note"><CheckCircle2 size={14} /> {label}</span> : null;

const toneClass = (tone) => ({
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200'
}[tone] || 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]');

const providerStateDetail = (config = {}, fallback) => config.lastError || config.connectedIdentity || config.connectedCalendar || fallback;

const ResourceCard = ({ icon: Icon, logoId, title, subtitle, status, detail, selected, onClick, chips = [] }) => (
  <button
    onClick={onClick}
    className={`w-full rounded-2xl border p-4 text-left transition ${
      selected
        ? 'border-[var(--color-primary)] bg-[var(--color-bg-secondary)] shadow-[0_0_0_1px_rgba(59,130,246,0.4),0_18px_36px_rgba(3,7,18,0.45)]'
        : 'border-[var(--color-border)]/40 bg-[var(--color-bg-secondary)]/55 hover:border-[var(--color-primary)]/35 hover:bg-[var(--color-bg-secondary)]/75'
    }`}
  >
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-primary)]">
        {logoId ? getBrandIcon(logoId, 30) : <Icon size={18} />}
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
  const [integrations, setIntegrations] = useState([]);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const [mailboxes, setMailboxes] = useState([]);
  const [mailboxProviders, setMailboxProviders] = useState(DEFAULT_MAILBOX_PROVIDERS);
  const [selectedMailboxId, setSelectedMailboxId] = useState(null);
  const [selectedEmailResourceId, setSelectedEmailResourceId] = useState(null);
  const [mailboxForm, setMailboxForm] = useState(() => createMailboxDraft());
  const [mailboxDraft, setMailboxDraft] = useState(() => createMailboxDraft());
  const [emailVerifierConfig, setEmailVerifierConfig] = useState(null);
  const [emailVerifierForm, setEmailVerifierForm] = useState(() => createEmailVerifierDraft());
  const [emailVerifierConfigEditing, setEmailVerifierConfigEditing] = useState(false);
  const [showMailboxComposer, setShowMailboxComposer] = useState(false);
  const [mailboxConfigEditing, setMailboxConfigEditing] = useState(false);

  const [calendarSources, setCalendarSources] = useState([]);
  const [calendarProviders, setCalendarProviders] = useState(DEFAULT_CALENDAR_PROVIDERS);
  const [selectedCalendarSourceId, setSelectedCalendarSourceId] = useState(null);
  const [calendarSourceForm, setCalendarSourceForm] = useState(() => createCalendarSourceDraft());
  const [calendarSourceDraft, setCalendarSourceDraft] = useState(() => createCalendarSourceDraft());
  const [calendarOptions, setCalendarOptions] = useState([]);
  const [calendarOptionsLoading, setCalendarOptionsLoading] = useState(false);
  const [showCalendarComposer, setShowCalendarComposer] = useState(false);
  const [calendarConfigEditing, setCalendarConfigEditing] = useState(false);

  const [automationProviderConfigs, setAutomationProviderConfigs] = useState([]);
  const [selectedAutomationProviderKey, setSelectedAutomationProviderKey] = useState('n8n');
  const [automationProviderForm, setAutomationProviderForm] = useState(() => createAutomationProviderDraft(getProviderConfig('n8n')));
  const [automationConfigEditing, setAutomationConfigEditing] = useState(false);

  const [paymentProviderConfigs, setPaymentProviderConfigs] = useState([]);
  const [selectedPaymentProviderKey, setSelectedPaymentProviderKey] = useState('stripe');
  const [paymentProviderForm, setPaymentProviderForm] = useState(() => createPaymentProviderDraft(getProviderConfig('stripe')));
  const [paymentConfigEditing, setPaymentConfigEditing] = useState(false);

  const [mediaProviderConfigs, setMediaProviderConfigs] = useState([]);
  const [selectedMediaProviderKey, setSelectedMediaProviderKey] = useState(null);
  const [mediaProviderForm, setMediaProviderForm] = useState({});
  const [mediaProviderConfigEditing, setMediaProviderConfigEditing] = useState(false);

  const [aiProviderCatalog, setAiProviderCatalog] = useState(() => getProvidersByCategory(INTEGRATION_CATEGORIES.LLMS));
  const [aiProviderConfigs, setAiProviderConfigs] = useState([]);
  const [selectedAiProviderKey, setSelectedAiProviderKey] = useState(() => getProvidersByCategory(INTEGRATION_CATEGORIES.LLMS)[0]?.id);
  const [aiProviderForm, setAiProviderForm] = useState(() => createAiProviderDraft(getProvidersByCategory(INTEGRATION_CATEGORIES.LLMS)[0]));
  const [aiProviderConfigEditing, setAiProviderConfigEditing] = useState(false);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();
  const [busyAction, setBusyAction] = useState('');
  const configuredEmailVerifierCount = emailVerifierConfig?.hasApiKey ? 1 : 0;
  const activeEmailVerifierCount = emailVerifierConfig?.hasApiKey && emailVerifierConfig?.enabled ? 1 : 0;
  const standardCalendarSources = useMemo(
    () => calendarSources.filter((source) => !isVideoConferencingProvider(source.provider)),
    [calendarSources]
  );
  const videoConferencingSources = useMemo(
    () => calendarSources.filter((source) => isVideoConferencingProvider(source.provider)),
    [calendarSources]
  );
  const standardCalendarProviders = useMemo(
    () => calendarProviders.filter((provider) => !isVideoConferencingProvider(provider.id)),
    [calendarProviders]
  );
  const videoConferencingProviders = useMemo(
    () => calendarProviders.filter((provider) => isVideoConferencingProvider(provider.id)),
    [calendarProviders]
  );
  const scopedCalendarSources = useMemo(() => {
    if (activeCategory === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING) {
      return videoConferencingSources;
    }
    if (activeCategory === INTEGRATION_CATEGORIES.CALENDAR) {
      return standardCalendarSources;
    }
    return calendarSources;
  }, [activeCategory, calendarSources, standardCalendarSources, videoConferencingSources]);
  const scopedCalendarProviders = useMemo(() => {
    if (activeCategory === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING) {
      return videoConferencingProviders;
    }
    return standardCalendarProviders.length ? standardCalendarProviders : calendarProviders;
  }, [activeCategory, calendarProviders, standardCalendarProviders, videoConferencingProviders]);

  const categories = useMemo(() => {
    const base = getAllCategories();
    return base.map(cat => {
      let count = 0;
      if (cat.id === INTEGRATION_CATEGORIES.AUTOMATION) count = automationProviderConfigs.length;
      if (cat.id === INTEGRATION_CATEGORIES.EMAIL) count = mailboxes.length + configuredEmailVerifierCount;
      if (cat.id === INTEGRATION_CATEGORIES.CALENDAR) count = standardCalendarSources.length;
      if (cat.id === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING) count = videoConferencingSources.length;
      if (cat.id === INTEGRATION_CATEGORIES.LLMS) count = aiProviderConfigs.filter((provider) => provider.enabled || provider.apiKey_present || provider.baseUrl).length;
      if (cat.id === INTEGRATION_CATEGORIES.PAYMENTS) count = paymentProviderConfigs.length;
      // SMS and Tracking are currently placeholders/empty in this version
      if (cat.id === INTEGRATION_CATEGORIES.SMS || cat.id === INTEGRATION_CATEGORIES.TRACKING) count = 0;
      
      return { ...cat, providerCount: count };
    });
  }, [automationProviderConfigs, mailboxes, configuredEmailVerifierCount, standardCalendarSources, videoConferencingSources, aiProviderConfigs, paymentProviderConfigs]);

  const selectedAiProviderConfig = useMemo(
    () => aiProviderConfigs.find((provider) => provider.provider_key === selectedAiProviderKey) || null,
    [aiProviderConfigs, selectedAiProviderKey]
  );

  useEffect(() => {
    setActiveCategory(initialCategory || INTEGRATION_CATEGORIES.AUTOMATION);
  }, [initialCategory]);

  const loadAll = async () => {
    setLoading(true);
    let nextNotice = null;
    setIntegrations([]);

    try {
      setAutomationProviderConfigs(await getAutomationProviderConfigsApi());
    } catch (error) {
      nextNotice = { tone: 'error', message: readErrorMessage(error) };
      setAutomationProviderConfigs([]);
    }

    try {
      setMediaProviderConfigs(await getMediaProviderConfigsApi());
    } catch (error) {
      nextNotice = { tone: 'error', message: readErrorMessage(error) };
      setMediaProviderConfigs([]);
    }

    try {
      const data = await getMailboxesApi();
      setMailboxes((data || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
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
      setEmailVerifierConfig(await getEmailVerifierConfigApi());
    } catch (error) {
      nextNotice = { tone: 'error', message: readErrorMessage(error) };
      setEmailVerifierConfig(null);
    }

    try {
      const data = await getCalendarSourcesApi();
      setCalendarSources((data || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
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

    try {
      const catalog = await getAiProviderCatalogApi();
      const localCatalog = getProvidersByCategory(INTEGRATION_CATEGORIES.LLMS);
      setAiProviderCatalog(catalog?.length ? catalog : localCatalog);
    } catch {
      setAiProviderCatalog(getProvidersByCategory(INTEGRATION_CATEGORIES.LLMS));
    }

    try {
      setAiProviderConfigs(await getAiProviderConfigsApi());
    } catch (error) {
      nextNotice = { tone: 'error', message: readErrorMessage(error) };
      setAiProviderConfigs([]);
    }

    try {
      setPaymentProviderConfigs(await getPaymentProviderConfigsApi());
    } catch (error) {
      setPaymentProviderConfigs([]);
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
    } else if (!mailboxes.some((mailbox) => mailbox.id === selectedMailboxId)) {
      setSelectedMailboxId(mailboxes[0].id);
    }
  }, [mailboxes, selectedMailboxId]);

  useEffect(() => {
    const mailboxSelectionStillExists = mailboxes.some((mailbox) => mailbox.id === selectedEmailResourceId);
    if (selectedEmailResourceId === EMAIL_VERIFIER_RESOURCE_ID || mailboxSelectionStillExists) {
      return;
    }
    if (selectedMailboxId && mailboxes.some((mailbox) => mailbox.id === selectedMailboxId)) {
      setSelectedEmailResourceId(selectedMailboxId);
      return;
    }
    if (mailboxes.length) {
      setSelectedEmailResourceId(mailboxes[0].id);
      return;
    }
    setSelectedEmailResourceId(EMAIL_VERIFIER_RESOURCE_ID);
  }, [mailboxes, selectedMailboxId, selectedEmailResourceId]);

  useEffect(() => {
    if (![INTEGRATION_CATEGORIES.CALENDAR, INTEGRATION_CATEGORIES.VIDEO_CONFERENCING].includes(activeCategory)) {
      return;
    }
    if (!scopedCalendarSources.length) {
      setSelectedCalendarSourceId(null);
      return;
    }
    if (!scopedCalendarSources.some((source) => source.id === selectedCalendarSourceId)) {
      setSelectedCalendarSourceId(scopedCalendarSources[0].id);
    }
  }, [activeCategory, scopedCalendarSources, selectedCalendarSourceId]);

  useEffect(() => {
    const automationProviders = getProvidersByCategory(INTEGRATION_CATEGORIES.AUTOMATION);
    if (!automationProviders.length) return;
    if (!automationProviders.some((provider) => provider.id === selectedAutomationProviderKey)) {
      setSelectedAutomationProviderKey(automationProviders[0].id);
    }
  }, [selectedAutomationProviderKey]);

  useEffect(() => {
    if (!aiProviderCatalog.length) return;
    const defaultProvider = aiProviderConfigs.find((provider) => provider.is_default)?.provider_key;
    if (defaultProvider && defaultProvider !== selectedAiProviderKey) {
      setSelectedAiProviderKey(defaultProvider);
      return;
    }
    if (!aiProviderCatalog.some((provider) => provider.key === selectedAiProviderKey)) {
      setSelectedAiProviderKey(aiProviderCatalog[0].key);
    }
  }, [aiProviderCatalog, aiProviderConfigs, selectedAiProviderKey]);

  const selectedMailbox = useMemo(
    () => mailboxes.find((mailbox) => mailbox.id === selectedMailboxId) || null,
    [mailboxes, selectedMailboxId]
  );

  const emailVerifierProviderConfig = useMemo(
    () => getProviderConfig(EMAIL_VERIFIER_RESOURCE_ID),
    []
  );

  const selectedEmailInfrastructureKind = selectedEmailResourceId === EMAIL_VERIFIER_RESOURCE_ID ? 'email-verifier' : 'mailbox';

  const selectedCalendarSource = useMemo(
    () => calendarSources.find((source) => source.id === selectedCalendarSourceId) || null,
    [calendarSources, selectedCalendarSourceId]
  );

  const loadCalendarOptions = async (sourceId, options = {}) => {
    if (!sourceId) {
      setCalendarOptions([]);
      return [];
    }
    const silent = options.silent !== false;
    setCalendarOptionsLoading(true);
    try {
      const calendars = await listCalendarSourceCalendarsApi(sourceId);
      setCalendarOptions(calendars || []);
      return calendars || [];
    } catch (error) {
      setCalendarOptions([]);
      if (!silent) {
        setNotice({ tone: 'error', message: readErrorMessage(error) });
      }
      return [];
    } finally {
      setCalendarOptionsLoading(false);
    }
  };

  const selectedAiProviderCatalog = useMemo(
    () => aiProviderCatalog.find((provider) => provider.key === selectedAiProviderKey) || aiProviderCatalog[0],
    [aiProviderCatalog, selectedAiProviderKey]
  );

  const automationProviderCatalog = useMemo(
    () => [...getProvidersByCategory(INTEGRATION_CATEGORIES.AUTOMATION)].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  const selectedAutomationProviderCatalog = useMemo(
    () => automationProviderCatalog.find((provider) => provider.id === selectedAutomationProviderKey) || automationProviderCatalog[0] || null,
    [automationProviderCatalog, selectedAutomationProviderKey]
  );

  const selectedAutomationProviderConfig = useMemo(
    () => automationProviderConfigs.find((provider) => provider.provider_key === selectedAutomationProviderKey) || null,
    [automationProviderConfigs, selectedAutomationProviderKey]
  );

  const paymentProviderCatalog = useMemo(
    () => getProvidersByCategory(INTEGRATION_CATEGORIES.PAYMENTS),
    []
  );

  const selectedPaymentProviderCatalog = useMemo(
    () => paymentProviderCatalog.find((provider) => provider.id === selectedPaymentProviderKey) || paymentProviderCatalog[0] || null,
    [paymentProviderCatalog, selectedPaymentProviderKey]
  );

  const selectedPaymentProviderConfig = useMemo(
    () => paymentProviderConfigs.find((provider) => provider.provider_key === selectedPaymentProviderKey) || null,
    [paymentProviderConfigs, selectedPaymentProviderKey]
  );

  useEffect(() => {
    const paymentProviders = getProvidersByCategory(INTEGRATION_CATEGORIES.PAYMENTS);
    if (!paymentProviders.length) return;
    if (!paymentProviders.some((provider) => provider.id === selectedPaymentProviderKey)) {
      setSelectedPaymentProviderKey(paymentProviders[0].id);
    }
  }, [selectedPaymentProviderKey]);

  useEffect(() => {
    if (!selectedPaymentProviderCatalog) {
      setPaymentProviderForm(createPaymentProviderDraft());
      return;
    }
    const existing = selectedPaymentProviderConfig;
    if (!existing) {
      setPaymentProviderForm(createPaymentProviderDraft(selectedPaymentProviderCatalog));
      return;
    }
    setPaymentProviderForm({
      label: existing.label || selectedPaymentProviderCatalog.name,
      publishableKey: existing.publishable_key || selectedPaymentProviderCatalog.fields?.find((field) => field.name === 'publishableKey')?.default || '',
      secretKey: '',
      webhookSecret: existing.config?.webhook_secret || '',
      enabled: existing.enabled,
      config: existing.config || {},
    });
  }, [selectedPaymentProviderCatalog, selectedPaymentProviderConfig]);

  useEffect(() => {
    if (!selectedMailbox) {
      setMailboxForm(createMailboxDraft());
      return;
    }
    setMailboxForm({
      name: selectedMailbox.name || '',
      address: selectedMailbox.address || '',
      provider: selectedMailbox.provider || 'gmail-oauth',
      status: selectedMailbox.status || 'connected',
      inboundEnabled: selectedMailbox.inboundEnabled !== false,
      outboundEnabled: selectedMailbox.outboundEnabled !== false,
      config: selectedMailbox.config || {}
    });
  }, [selectedMailbox]);

  useEffect(() => {
    setEmailVerifierForm(createEmailVerifierDraft(emailVerifierConfig || {}));
  }, [emailVerifierConfig]);

  useEffect(() => {
    setEmailVerifierConfigEditing(!emailVerifierConfig?.hasApiKey);
  }, [emailVerifierConfig]);

  useEffect(() => {
    if (!selectedCalendarSource) {
      setCalendarSourceForm(createCalendarSourceDraft());
      return;
    }
    setCalendarSourceForm({
      name: selectedCalendarSource.name || '',
      provider: selectedCalendarSource.provider || 'google-calendar-oauth',
      syncDirection: selectedCalendarSource.sync_direction || 'two-way',
      config: {
        authorityMode: selectedCalendarSource.authority_mode || selectedCalendarSource.config?.authority_mode || 'local-first',
        importPolicy: selectedCalendarSource.import_policy || selectedCalendarSource.config?.import_policy || 'review',
        ...(selectedCalendarSource.config || {})
      }
    });
  }, [selectedCalendarSource]);

  useEffect(() => {
    if (activeCategory !== INTEGRATION_CATEGORIES.CALENDAR && activeCategory !== INTEGRATION_CATEGORIES.VIDEO_CONFERENCING) {
      return;
    }
    if (!scopedCalendarProviders.length) {
      return;
    }
    if (!scopedCalendarProviders.some((provider) => provider.id === calendarSourceDraft.provider)) {
      setCalendarSourceDraft(createCalendarSourceDraft(scopedCalendarProviders[0].id));
    }
  }, [activeCategory, calendarSourceDraft.provider, scopedCalendarProviders]);

  useEffect(() => {
    if (!selectedCalendarSource || !isCalendarOauthProvider(selectedCalendarSource.provider)) {
      setCalendarOptions([]);
      setCalendarOptionsLoading(false);
      return;
    }
    const hasOAuthBinding = !!(selectedCalendarSource.config?.refreshToken || selectedCalendarSource.config?.connectedIdentity);
    if (!hasOAuthBinding) {
      setCalendarOptions([]);
      setCalendarOptionsLoading(false);
      return;
    }
    let cancelled = false;
    setCalendarOptionsLoading(true);
    listCalendarSourceCalendarsApi(selectedCalendarSource.id)
      .then((items) => {
        if (cancelled) return;
        setCalendarOptions(items || []);
      })
      .catch(() => {
        if (cancelled) return;
        setCalendarOptions([]);
      })
      .finally(() => {
        if (!cancelled) {
          setCalendarOptionsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCalendarSource]);

  useEffect(() => {
    const catalogEntry = selectedAiProviderCatalog || getProvidersByCategory(INTEGRATION_CATEGORIES.LLMS)[0];
    const existing = selectedAiProviderConfig;
    if (!existing) {
      setAiProviderForm(createAiProviderDraft(catalogEntry));
      return;
    }
    
    // Unified form loading using snake_case and normalization fallback
    const config = existing.config || {};
    setAiProviderForm({
      baseUrl: existing.baseUrl || config.baseUrl || catalogEntry.default_base_url || '',
      model: existing.model || config.model || catalogEntry.model || catalogEntry.default_model || '',
      apiKey: '', // Credentials never round-trip into form
      temperature: config.temperature || '0.2',
      username: config.username || '',
      password: '',
      systemGuardrails: existing.system_guardrails || config.system_guardrails || config.systemGuardrails || '',
      taskGuardrails: existing.task_guardrails || config.task_guardrails || config.taskGuardrails || '',
      siteUrl: config.site_url || '',
      appName: config.app_name || 'AIO CRM',
      enabled: !!existing.enabled,
      isDefault: !!existing.is_default,
      config: config
    });
  }, [selectedAiProviderCatalog, selectedAiProviderConfig]);

  useEffect(() => {
    setAiProviderConfigEditing(!selectedAiProviderConfig);
  }, [selectedAiProviderKey, selectedAiProviderConfig]);

  useEffect(() => {
    const catalogEntry = selectedAutomationProviderCatalog;
    if (!catalogEntry) return;
    const existing = selectedAutomationProviderConfig;
    if (!existing) {
      setAutomationProviderForm(createAutomationProviderDraft(catalogEntry));
      return;
    }
    setAutomationProviderForm({
      label: existing.label || catalogEntry.name,
      baseUrl: existing.baseUrl || catalogEntry.fields?.find((field) => field.name === 'baseUrl')?.default || '',
      apiKey: '',
      enabled: existing.enabled,
      config: {
        ...(existing.config || {}),
        inboundWebhookUrl: existing.config?.inboundWebhookUrl || existing.config?.inbound_webhook_url || '',
        outboundWebhookUrl: existing.config?.outboundWebhookUrl || existing.config?.outbound_webhook_url || '',
        signingSecret: existing.config?.signingSecret || existing.config?.signing_secret || '',
        projectId: existing.config?.projectId || existing.config?.project_id || '',
        teamId: existing.config?.teamId || existing.config?.team_id || '',
      },
    });
  }, [selectedAutomationProviderCatalog, selectedAutomationProviderConfig]);

  useEffect(() => {
    setAutomationConfigEditing(!selectedAutomationProviderConfig);
  }, [selectedAutomationProviderKey, selectedAutomationProviderConfig]);

  useEffect(() => {
    setPaymentConfigEditing(!selectedPaymentProviderConfig);
  }, [selectedPaymentProviderKey, selectedPaymentProviderConfig]);

  useEffect(() => {
    setMailboxConfigEditing(false);
  }, [selectedMailboxId]);

  useEffect(() => {
    setCalendarConfigEditing(false);
  }, [selectedCalendarSourceId]);

  useEffect(() => {
    if (emailVerifierConfig && !emailVerifierConfigEditing) {
      setEmailVerifierForm(createEmailVerifierDraft(emailVerifierConfig));
    }
  }, [emailVerifierConfig, emailVerifierConfigEditing]);

  const refreshOllamaModels = async (preferredBaseUrl) => {
    setOllamaModelsLoading(true);
    try {
      const models = await getOllamaModelsApi({
        baseUrl: preferredBaseUrl || aiProviderForm.baseUrl || (aiProviderCatalog.find(p => p.id === 'ollama') || {}).default_base_url,
        apiKey: aiProviderForm.apiKey || '',
        username: aiProviderForm.config?.username || '',
        password: aiProviderForm.config?.password || ''
      });
      setOllamaModels(models);
      if ((!aiProviderForm.model || !models.includes(aiProviderForm.model)) && models.length) {
        setAiProviderForm((current) => ({ ...current, model: current.model && models.includes(current.model) ? current.model : models[0] }));
      }
    } catch {
      setOllamaModels([]);
    } finally {
      setOllamaModelsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAiProviderKey !== 'ollama') {
      setOllamaModels([]);
      setOllamaModelsLoading(false);
      return () => {};
    }

    let cancelled = false;
    const loadModels = async () => {
      setOllamaModelsLoading(true);
      try {
        const models = await getOllamaModelsApi({
          baseUrl: aiProviderForm.baseUrl || (aiProviderCatalog.find(p => p.id === 'ollama') || {}).default_base_url,
          apiKey: aiProviderForm.apiKey || '',
          username: aiProviderForm.config?.username || '',
          password: aiProviderForm.config?.password || ''
        });
        if (cancelled) return;
        setOllamaModels(models);
        if ((!aiProviderForm.model || !models.includes(aiProviderForm.model)) && models.length) {
          setAiProviderForm((current) => ({ ...current, model: current.model && models.includes(current.model) ? current.model : models[0] }));
        }
      } catch {
        if (!cancelled) setOllamaModels([]);
      } finally {
        if (!cancelled) setOllamaModelsLoading(false);
      }
    };

    loadModels();
    return () => {
      cancelled = true;
    };
  }, [selectedAiProviderKey, aiProviderForm.baseUrl, aiProviderForm.apiKey, aiProviderForm.config?.username, aiProviderForm.config?.password, aiProviderCatalog]);


  const selectedMailboxProvider = mailboxProviders.find((provider) => provider.id === mailboxForm.provider) || DEFAULT_MAILBOX_PROVIDERS[0];
  const selectedCalendarProvider = calendarProviders.find((provider) => provider.id === calendarSourceForm.provider) || scopedCalendarProviders[0] || DEFAULT_CALENDAR_PROVIDERS[0];
  const selectedCalendarProviderFields = (selectedCalendarProvider.fields || []).filter(
    (field) => !(isCalendarOauthProvider(calendarSourceForm.provider) && field.key === 'calendar_id')
  );
  const mailboxDraftProvider = mailboxProviders.find((provider) => provider.id === mailboxDraft.provider) || DEFAULT_MAILBOX_PROVIDERS[0];
  const calendarDraftProvider = scopedCalendarProviders.find((provider) => provider.id === calendarSourceDraft.provider) || scopedCalendarProviders[0] || DEFAULT_CALENDAR_PROVIDERS[0];
  const mailboxDeleteTarget = useMemo(
    () => mailboxes.find((mailbox) => mailbox.id !== selectedMailboxId && !SEEDED_MAILBOX_IDS.has(mailbox.id))
      || mailboxes.find((mailbox) => mailbox.id !== selectedMailboxId)
      || null,
    [mailboxes, selectedMailboxId]
  );
  const calendarSourceDeleteTarget = useMemo(
    () => calendarSources.find((source) => source.id !== selectedCalendarSourceId)
      || null,
    [calendarSources, selectedCalendarSourceId]
  );
  const mailboxStateMetaById = useMemo(
    () => Object.fromEntries(mailboxes.map((mailbox) => [mailbox.id, getMailboxStateMeta(mailbox)])),
    [mailboxes]
  );
  const calendarSourceStateMetaById = useMemo(
    () => Object.fromEntries(calendarSources.map((source) => [source.id, getCalendarSourceStateMeta(source)])),
    [calendarSources]
  );
  const selectedMailboxStateMeta = selectedMailbox ? (mailboxStateMetaById[selectedMailbox.id] || getMailboxStateMeta(selectedMailbox)) : getMailboxStateMeta({ provider: mailboxForm.provider, config: mailboxForm.config, status: mailboxForm.status, address: mailboxForm.address });
  const selectedCalendarSourceStateMeta = selectedCalendarSource ? (calendarSourceStateMetaById[selectedCalendarSource.id] || getCalendarSourceStateMeta(selectedCalendarSource)) : getCalendarSourceStateMeta({ provider: calendarSourceForm.provider, config: calendarSourceForm.config, status: selectedCalendarSource?.status });
  const automationNeedsConfig = isNeedsConfigStatus(selectedAutomationProviderConfig?.status);
  const emailVerifierNeedsConfig = emailVerifierConfig?.status === 'error';
  const automationConfigLocked = !!selectedAutomationProviderConfig && !automationConfigEditing;
  const emailVerifierConfigLocked = !!emailVerifierConfig?.hasApiKey && !emailVerifierConfigEditing;
  const mailboxConfigLocked = !!selectedMailbox && !mailboxConfigEditing;
  const calendarConfigLocked = !!selectedCalendarSource && !calendarConfigEditing;
  const aiProviderConfigLocked = !!selectedAiProviderConfig && !aiProviderConfigEditing;
  const paymentConfigLocked = !!selectedPaymentProviderConfig && !paymentConfigEditing;
  const moduleAlerts = useMemo(() => {
    const alerts = [];
    if (activeCategory === INTEGRATION_CATEGORIES.EMAIL) {
      mailboxes.forEach((mailbox) => {
        const meta = mailboxStateMetaById[mailbox.id] || getMailboxStateMeta(mailbox);
        if (meta.machine === 'reconnect_required' || meta.machine === 'unauthorized' || meta.machine === 'needs_config') {
          alerts.push({
            key: `mailbox-${mailbox.id}`,
            tone: meta.tone,
            message: `${mailbox.name}: ${meta.detail}`
          });
        }
      });
      if (emailVerifierConfig?.status === 'error') {
        alerts.push({
          key: 'email-verifier-error',
          tone: 'error',
          message: emailVerifierConfig.lastError || 'Email verification provider test failed.'
        });
      }
    }
    if (activeCategory === INTEGRATION_CATEGORIES.CALENDAR || activeCategory === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING) {
      scopedCalendarSources.forEach((source) => {
        const meta = calendarSourceStateMetaById[source.id] || getCalendarSourceStateMeta(source);
        if (meta.machine === 'reconnect_required' || meta.machine === 'unauthorized' || meta.machine === 'needs_config') {
          alerts.push({
            key: `calendar-${source.id}`,
            tone: meta.tone,
            message: `${source.name}: ${meta.detail}`
          });
        }
      });
    }
    return alerts.slice(0, 4);
  }, [activeCategory, calendarSourceStateMetaById, emailVerifierConfig, mailboxStateMetaById, mailboxes, scopedCalendarSources]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    categories.forEach((category) => {
      if (category.id === INTEGRATION_CATEGORIES.AUTOMATION) {
        counts[category.id] = automationProviderConfigs.length;
      } else if (category.id === INTEGRATION_CATEGORIES.EMAIL) {
        counts[category.id] = mailboxes.length + configuredEmailVerifierCount;
      } else if (category.id === INTEGRATION_CATEGORIES.CALENDAR) {
        counts[category.id] = standardCalendarSources.length;
      } else if (category.id === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING) {
        counts[category.id] = videoConferencingSources.length;
      } else if (category.id === INTEGRATION_CATEGORIES.LLMS) {
        counts[category.id] = aiProviderConfigs.filter((provider) => provider.enabled || provider.apiKey_present || provider.baseUrl).length;
      } else if (category.id === INTEGRATION_CATEGORIES.PAYMENTS) {
        counts[category.id] = paymentProviderConfigs.length;
      } else {
        counts[category.id] = integrations.filter((integration) => integration.category === category.id).length;
      }
    });
    return counts;
  }, [aiProviderConfigs, automationProviderConfigs.length, categories, configuredEmailVerifierCount, integrations, mailboxes.length, paymentProviderConfigs.length, standardCalendarSources.length, videoConferencingSources.length]);

  const currentCategory = categories.find((category) => category.id === activeCategory);
  const currentCategoryIntegrations = integrations.filter((integration) => integration.category === activeCategory);

  const handleToggleIntegration = async (integrationId) => {
    setNotice({ tone: 'warning', message: 'Legacy integration toggles are disabled until backed by workspace APIs.' });
  };

  const handleRemoveIntegration = async (integrationId) => {
    if (!window.confirm('Delete this integration?')) return;
    setNotice({ tone: 'warning', message: 'Legacy integration removal is disabled until backed by workspace APIs.' });
  };

  const handleAddIntegration = async (data) => {
    if (data.category === INTEGRATION_CATEGORIES.AUTOMATION) {
      const providerKey = data.providerId;
      const config = data.config || {};
      const providerCatalogEntry = getProviderConfig(providerKey);
      const payload = {
        label: (providerCatalogEntry?.name || providerCatalogEntry?.label || providerKey).trim(),
        baseUrl: (config.baseUrl || '').trim(),
        apiKey: config.apiKey || undefined,
        enabled: true,
        config: {
          inbound_webhook_url: config.inboundWebhookUrl || '',
          outbound_webhook_url: config.outboundWebhookUrl || '',
          signing_secret: config.signingSecret || '',
          project_id: config.projectId || '',
          team_id: config.teamId || '',
        },
      };

      try {
        await upsertAutomationProviderConfigApi(providerKey, payload);
        setSelectedAutomationProviderKey(providerKey);
        setNotice({ tone: 'success', message: `${payload.label || providerKey} added to this workspace.` });
        await loadAll();
        return true;
      } catch (error) {
        setNotice({ tone: 'error', message: readErrorMessage(error) });
        throw error;
      }
    }

    if (data.category === INTEGRATION_CATEGORIES.LLMS) {
      const providerKey = data.providerId;
      const config = data.config || {};
      const providerCatalogEntry = getProviderConfig(providerKey);
      
      const payload = {
        label: (providerCatalogEntry?.name || providerCatalogEntry?.label || providerKey).trim(),
        baseUrl: (config.baseUrl || providerCatalogEntry?.default_base_url || '').trim(),
        model: (config.model || providerCatalogEntry?.default_model || '').trim(),
        apiKey: config.apiKey || config.apiKey || undefined,
        enabled: true,
        isDefault: !aiProviderConfigs.some((provider) => provider.is_default),
        config: Object.fromEntries(
          Object.entries(config)
            .filter(([key]) => !['label', 'base_url', 'model', 'api_key', 'apiKey'].includes(key))
            .map(([key, val]) => [normalizeAiField(key), val])
        ),
      };

      try {
        await upsertAiProviderConfigApi(providerKey, payload);
        setSelectedAiProviderKey(providerKey);
        setNotice({ tone: 'success', message: `${payload.label || providerKey} added to this workspace.` });
        await loadAll();
        return true;
      } catch (error) {
        setNotice({ tone: 'error', message: readErrorMessage(error) });
        throw error;
      }
    }

    if (data.category === INTEGRATION_CATEGORIES.CALENDAR || data.category === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING) {
      const providerKey = data.providerId;
      const config = data.config || {};
      try {
        const source = await createCalendarSourceApi({
          name: (config.name || config.label || getProviderConfig(providerKey)?.name || providerKey).trim(),
          provider: providerKey,
          syncDirection: 'two-way',
          config: {
            authorityMode: config.authority_mode || 'local-first',
            importPolicy: config.import_policy || 'review',
            ...config,
          },
        });
        setSelectedCalendarSourceId(source?.id || null);
        setNotice({ tone: 'success', message: `${source?.name || providerKey} added to this workspace.` });
        await loadAll();
        return true;
      } catch (error) {
        setNotice({ tone: 'error', message: readErrorMessage(error) });
        throw error;
      }
    }

    setNotice({ tone: 'warning', message: 'This integration category is disabled until a workspace API exists for it.' });
    return false;
  };

  const handleSaveMailbox = async () => {
    if (!selectedMailbox?.id) return;
    if (selectedMailboxStateMeta.saveDisabled) {
      setNotice({ tone: selectedMailboxStateMeta.tone, message: selectedMailboxStateMeta.detail });
      return;
    }
    try {
      await updateMailboxApi(selectedMailbox.id, mailboxForm);
      setMailboxConfigEditing(false);
      setNotice({ tone: 'success', message: 'Mailbox saved.' });
      triggerSavedAction('mailbox-save');
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

  const handleSaveEmailVerifier = async () => {
    try {
      const saved = await updateEmailVerifierConfigApi({
        apiKey: emailVerifierForm.apiKey || undefined,
        enabled: !!emailVerifierForm.enabled,
        autoVerifyContacts: !!emailVerifierForm.autoVerifyContacts,
        defaultMode: emailVerifierForm.defaultMode,
      });
      setEmailVerifierConfig(saved);
      setEmailVerifierForm(createEmailVerifierDraft(saved || {}));
      setEmailVerifierConfigEditing(false);
      setSelectedEmailResourceId(EMAIL_VERIFIER_RESOURCE_ID);
      setNotice({ tone: 'success', message: 'Reoon configuration saved.' });
      triggerSavedAction('email-verifier-save');
      await loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestEmailVerifier = async () => {
    setBusyAction('email-verifier-test');
    try {
      if (emailVerifierForm.apiKey) {
        const saved = await updateEmailVerifierConfigApi({
          apiKey: emailVerifierForm.apiKey,
          enabled: !!emailVerifierForm.enabled,
          autoVerifyContacts: !!emailVerifierForm.auto_verify_contacts,
          defaultMode: emailVerifierForm.default_mode,
        });
        setEmailVerifierConfig(saved);
        setEmailVerifierForm(createEmailVerifierDraft(saved || {}));
      }
      const response = await testEmailVerifierConfigApi();
      const config = response?.data || null;
      if (config) {
        setEmailVerifierConfig(config);
        setEmailVerifierForm(createEmailVerifierDraft(config));
      }
      setNotice({ tone: 'success', message: response?.result?.message || 'Reoon connection verified.' });
      triggerSavedAction('email-verifier-test');
      await loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
      await loadAll();
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteEmailVerifier = async () => {
    if (!window.confirm('Disconnect Reoon for this tenant? Stored API credentials will be removed.')) return;
    try {
      const cleared = await deleteEmailVerifierConfigApi();
      setEmailVerifierConfig(cleared);
      setEmailVerifierForm(createEmailVerifierDraft(cleared || {}));
      setSelectedEmailResourceId(EMAIL_VERIFIER_RESOURCE_ID);
      setNotice({ tone: 'success', message: 'Reoon disconnected.' });
      await loadAll();
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
    if (selectedMailboxStateMeta.authActionsDisabled) {
      setNotice({ tone: selectedMailboxStateMeta.tone, message: selectedMailboxStateMeta.detail });
      return;
    }
    setBusyAction('mailbox-test');
    try {
      await updateMailboxApi(selectedMailbox.id, mailboxForm);
      const response = await testMailboxConnectionApi(selectedMailbox.id);
      setNotice({ tone: response?.result?.status === 'ok' ? 'success' : 'warning', message: response?.result?.message || 'Mailbox test completed.' });
      triggerSavedAction('mailbox-test');
      loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyAction('');
    }
  };

  const handleSyncMailbox = async () => {
    if (!selectedMailbox?.id) return;
    if (selectedMailboxStateMeta.authActionsDisabled) {
      setNotice({ tone: selectedMailboxStateMeta.tone, message: selectedMailboxStateMeta.detail });
      return;
    }
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
    if (selectedMailboxStateMeta.authActionsDisabled) {
      setNotice({ tone: selectedMailboxStateMeta.tone, message: selectedMailboxStateMeta.detail });
      return;
    }
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
    if (selectedCalendarSourceStateMeta.saveDisabled) {
      setNotice({ tone: selectedCalendarSourceStateMeta.tone, message: selectedCalendarSourceStateMeta.detail });
      return;
    }
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, calendarSourceForm);
      setCalendarConfigEditing(false);
      setNotice({ tone: 'success', message: 'Calendar source saved.' });
      triggerSavedAction('calendar-save');
      await loadAll();
      await loadCalendarOptions(selectedCalendarSource.id);
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
      setNotice({
        tone: 'success',
        message: result?.calendarSelectionRequired
          ? `${selectedCalendarSource.name} connected via ${result.provider || selectedCalendarProvider.label}. Select the active calendar before testing or sync.`
          : `${selectedCalendarSource.name} connected via ${result.provider || selectedCalendarProvider.label}.`
      });
      await loadAll();
      await loadCalendarOptions(selectedCalendarSource.id);
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    if (selectedCalendarSourceStateMeta.authActionsDisabled) {
      setNotice({ tone: selectedCalendarSourceStateMeta.tone, message: selectedCalendarSourceStateMeta.detail });
      return;
    }
    setBusyAction('calendar-test');
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, calendarSourceForm);
      const response = await testCalendarSourceApi(selectedCalendarSource.id);
      setNotice({ tone: 'success', message: response?.result?.message || 'Calendar source tested.' });
      triggerSavedAction('calendar-test');
      await loadAll();
      await loadCalendarOptions(selectedCalendarSource.id);
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyAction('');
    }
  };

  const handleSyncCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    if (selectedCalendarSourceStateMeta.authActionsDisabled) {
      setNotice({ tone: selectedCalendarSourceStateMeta.tone, message: selectedCalendarSourceStateMeta.detail });
      return;
    }
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
    if (selectedCalendarSourceStateMeta.authActionsDisabled) {
      setNotice({ tone: selectedCalendarSourceStateMeta.tone, message: selectedCalendarSourceStateMeta.detail });
      return;
    }
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
    if (selectedCalendarSourceStateMeta.authActionsDisabled) {
      setNotice({ tone: selectedCalendarSourceStateMeta.tone, message: selectedCalendarSourceStateMeta.detail });
      return;
    }
    if (!window.confirm(`Disconnect ${selectedCalendarSource.name}? OAuth/feed sync state will be cleared and the source will require reconnect before use.`)) return;
    try {
      const response = await disconnectCalendarSourceApi(selectedCalendarSource.id);
      setNotice({ tone: 'success', message: `${response?.source?.name || selectedCalendarSource.name} disconnected.` });
      await loadAll();
      setCalendarOptions([]);
      setSelectedCalendarSourceId(selectedCalendarSource.id);
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSaveAiProvider = async () => {
    try {
      const providerKey = selectedAiProviderCatalog.id || selectedAiProviderCatalog.key;
      const providerLabel = selectedAiProviderCatalog.name || selectedAiProviderCatalog.label || selectedAiProviderCatalog.displayName || providerKey;
      const sanitizedConfig = sanitizeAiProviderConfig(aiProviderForm.config);
      await upsertAiProviderConfigApi(providerKey, {
        provider_type: providerKey,
        label: providerLabel,
        baseUrl: (aiProviderForm.baseUrl || '').trim(),
        model: (aiProviderForm.model || '').trim(),
        apiKey: aiProviderForm.apiKey || aiProviderForm.apiKey || undefined,
        systemGuardrails: aiProviderForm.system_guardrails || '',
        taskGuardrails: aiProviderForm.task_guardrails || '',
        enabled: !!aiProviderForm.enabled,
        isDefault: !!aiProviderForm.is_default,
        config: {
          ...sanitizedConfig,
          temperature: aiProviderForm.temperature || '0.2',
          username: aiProviderForm.username || '',
          password: aiProviderForm.password || undefined,
          siteUrl: aiProviderForm.site_url || '',
          appName: aiProviderForm.app_name || 'AIO CRM',
        },
      });
      setAiProviderConfigEditing(false);
      setNotice({ tone: 'success', message: `${selectedAiProviderCatalog.displayName || selectedAiProviderCatalog.label} saved.` });
      triggerSavedAction('ai-provider-save');
      await loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestAiProvider = async () => {
    setBusyAction('ai-provider-test');
    try {
      const providerKey = selectedAiProviderCatalog.id || selectedAiProviderCatalog.key;
      const providerLabel = selectedAiProviderCatalog.name || selectedAiProviderCatalog.label || selectedAiProviderCatalog.displayName || providerKey;
      const sanitizedConfig = sanitizeAiProviderConfig(aiProviderForm.config);
      const saved = await upsertAiProviderConfigApi(providerKey, {
        provider_type: providerKey,
        label: providerLabel,
        baseUrl: (aiProviderForm.baseUrl || '').trim(),
        model: (aiProviderForm.model || '').trim(),
        apiKey: aiProviderForm.apiKey || aiProviderForm.apiKey || undefined,
        systemGuardrails: aiProviderForm.system_guardrails || '',
        taskGuardrails: aiProviderForm.task_guardrails || '',
        enabled: !!aiProviderForm.enabled,
        isDefault: !!aiProviderForm.is_default,
        config: {
          ...sanitizedConfig,
          temperature: aiProviderForm.temperature || '0.2',
          username: aiProviderForm.username || '',
          password: aiProviderForm.password || undefined,
          siteUrl: aiProviderForm.site_url || '',
          appName: aiProviderForm.app_name || 'AIO CRM',
        },
      });
      const response = await testAiProviderConfigApi(saved.id);
      setNotice({ tone: 'success', message: response?.result?.message || 'AI provider test completed.' });
      triggerSavedAction('ai-provider-test');
      await loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteAiProvider = async () => {
    if (!selectedAiProviderConfig?.id) return;
    if (!window.confirm(`Disconnect ${selectedAiProviderCatalog.label}? Saved credentials and runtime preference will be removed for this workspace.`)) return;
    try {
      await deleteAiProviderConfigApi(selectedAiProviderConfig.id);
      setNotice({ tone: 'success', message: `${selectedAiProviderCatalog.displayName || selectedAiProviderCatalog.label} removed from this workspace.` });
      await loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSaveAutomationProvider = async () => {
    if (!selectedAutomationProviderCatalog?.id) return;
    try {
      await upsertAutomationProviderConfigApi(selectedAutomationProviderCatalog.id, {
        label: (automationProviderForm.label || selectedAutomationProviderCatalog.name).trim(),
        baseUrl: (automationProviderForm.baseUrl || '').trim(),
        apiKey: automationProviderForm.apiKey || undefined,
        enabled: !!automationProviderForm.enabled,
        status: selectedAutomationProviderConfig?.status,
        config: automationProviderForm.config || {},
      });
      setAutomationConfigEditing(false);
      setNotice({ tone: 'success', message: `${selectedAutomationProviderCatalog.name} saved.` });
      triggerSavedAction('automation-save');
      await loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestAutomationProvider = async () => {
    if (!selectedAutomationProviderCatalog?.id) return;
    setBusyAction('automation-test');
    try {
      const saved = await upsertAutomationProviderConfigApi(selectedAutomationProviderCatalog.id, {
        label: (automationProviderForm.label || selectedAutomationProviderCatalog.name).trim(),
        baseUrl: (automationProviderForm.baseUrl || '').trim(),
        apiKey: automationProviderForm.apiKey || undefined,
        enabled: !!automationProviderForm.enabled,
        status: selectedAutomationProviderConfig?.status || 'configured',
        config: automationProviderForm.config || {},
      });
      const response = await testAutomationProviderConfigApi(saved.id);
      setNotice({ tone: 'success', message: response?.result?.message || 'Automation provider test completed.' });
      triggerSavedAction('automation-test');
      await loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteAutomationProvider = async () => {
    if (!selectedAutomationProviderConfig?.id) return;
    if (!window.confirm(`Disconnect ${selectedAutomationProviderCatalog?.name || 'this automation provider'} from this workspace?`)) return;
    try {
      await deleteAutomationProviderConfigApi(selectedAutomationProviderConfig.id);
      setNotice({ tone: 'success', message: `${selectedAutomationProviderCatalog?.name || 'Automation provider'} removed from this workspace.` });
      await loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSavePaymentProvider = async () => {
    if (!selectedPaymentProviderCatalog?.id) return;
    try {
      const payload = {
        label: (paymentProviderForm.label || selectedPaymentProviderCatalog.name).trim(),
        publishableKey: (paymentProviderForm.publishable_key || '').trim(),
        secretKey: paymentProviderForm.secret_key || undefined,
        webhookSecret: (paymentProviderForm.webhook_secret || '').trim(),
        enabled: !!paymentProviderForm.enabled,
        config: paymentProviderForm.config || {},
      };
      await upsertPaymentProviderConfigApi(selectedPaymentProviderCatalog.id, payload);
      setPaymentConfigEditing(false);
      setNotice({ tone: 'success', message: `${selectedPaymentProviderCatalog.name} payment settings saved.` });
      triggerSavedAction('payment-save');
      await loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleDeletePaymentProvider = async () => {
    if (!selectedPaymentProviderConfig?.id) return;
    if (!window.confirm(`Disconnect ${selectedPaymentProviderCatalog?.name || 'this payment provider'} from this workspace?`)) return;
    try {
      await deletePaymentProviderConfigApi(selectedPaymentProviderConfig.id);
      setNotice({ tone: 'success', message: `${selectedPaymentProviderCatalog?.name || 'Payment provider'} removed from this workspace.` });
      await loadAll();
    } catch (error) {
      setNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const renderAutomationAdmin = () => (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_3fr]">
      <div className="space-y-3 overflow-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Automation Providers</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Hub-and-spoke automation systems with webhook ingress and egress.</div>
        </div>
        {automationProviderCatalog.map((provider) => {
          const config = automationProviderConfigs.find((item) => item.provider_key === provider.id);
          return (
            <ResourceCard
              key={provider.id}
              icon={Zap}
              logoId={provider.id}
              title={config?.label || provider.name}
              subtitle={provider.id}
              status={config?.status || 'not configured'}
              detail={config?.lastError || provider.description}
              selected={selectedAutomationProviderKey === provider.id}
              onClick={() => setSelectedAutomationProviderKey(provider.id)}
              chips={[
                config?.enabled ? 'enabled' : 'disabled',
                config?.config?.outboundWebhookUrl || config?.config?.outbound_webhook_url ? 'outbound webhook' : 'no outbound hook',
                config?.config?.inboundWebhookUrl || config?.config?.inbound_webhook_url ? 'inbound webhook' : 'no inbound hook',
              ]}
            />
          );
        })}
      </div>

      <div className="overflow-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
        {selectedAutomationProviderCatalog ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Automation Control Plane</div>
                <h3 className="mt-2 text-3xl font-semibold text-[var(--color-text-primary)]">{automationProviderForm.label || selectedAutomationProviderCatalog.name}</h3>
                <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">{selectedAutomationProviderCatalog.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedAutomationProviderConfig ? <button onClick={() => setAutomationConfigEditing(true)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)]">Edit</button> : null}
                <button onClick={handleTestAutomationProvider} className={saveButtonClassName("rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)]", savedAction === 'automation-test')}>
                  {busyAction === 'automation-test' ? 'Testing...' : savedAction === 'automation-test' ? 'Tested' : 'TEST CONNECT'}
                </button>
                <button onClick={handleSaveAutomationProvider} disabled={automationConfigLocked} className={saveButtonClassName("rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:cursor-not-allowed disabled:opacity-50", savedAction === 'automation-save')}>
                  {savedAction === 'automation-save' ? 'Saved' : 'Save'}
                </button>
                {selectedAutomationProviderConfig ? <button onClick={handleDeleteAutomationProvider} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300"><Trash2 size={14} />Delete</button> : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">{selectedAutomationProviderConfig?.status || 'standby'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Runtime</div><div className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">{automationProviderForm.enabled ? 'Enabled' : 'Disabled'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{selectedAutomationProviderConfig?.last_tested_at ? new Date(selectedAutomationProviderConfig.last_tested_at).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Delivery</div><div className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{selectedAutomationProviderConfig?.config?.last_delivery_at ? new Date(selectedAutomationProviderConfig.config.last_delivery_at).toLocaleString() : 'No delivery yet'}</div></div>
            </div>

            {selectedAutomationProviderConfig?.lastError ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">{selectedAutomationProviderConfig.lastError}</div>
            ) : null}

            <fieldset disabled={automationConfigLocked} className="space-y-3 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Label</div><input value={automationProviderForm.label} onChange={(event) => setAutomationProviderForm((current) => ({ ...current, label: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Base URL</div><input value={automationProviderForm.baseUrl} onChange={(event) => setAutomationProviderForm((current) => ({ ...current, baseUrl: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
            </div>

            {selectedAutomationProviderCatalog.fields?.some((field) => field.name === 'apiKey') ? (
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">API Key</div><input type="password" autoComplete="new-password" value={automationProviderForm.apiKey} onChange={(event) => setAutomationProviderForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder={selectedAutomationProviderConfig?.apiKey_present ? 'Saved in workspace config' : ''} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {selectedAutomationProviderCatalog.fields?.filter((field) => !['label', 'baseUrl', 'apiKey'].includes(field.name)).map((field) => (
                <label key={field.name} className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div>
                  <input type={field.type === 'password' ? 'password' : 'text'} autoComplete={field.type === 'password' ? 'new-password' : undefined} value={automationProviderForm.config?.[field.name] || ''} onChange={(event) => setAutomationProviderForm((current) => ({ ...current, config: { ...(current.config || {}), [field.name]: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]" />
                </label>
              ))}
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-3 text-[var(--color-text-primary)]"><input type="checkbox" checked={!!automationProviderForm.enabled} onChange={(event) => setAutomationProviderForm((current) => ({ ...current, enabled: event.target.checked }))} /> Enable provider for this workspace</label>
            </fieldset>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">Keep automation systems as spokes around AIO CRM. Outbound tests will POST a sample event to the outbound webhook when present, otherwise they probe the base URL directly.</div>
            <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
              <SaveFeedbackNote visible={savedAction === 'automation-save'} label="Saved" />
              <SaveFeedbackNote visible={savedAction === 'automation-test'} label="Connection OK" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderEmailAdmin = () => (
    <div className="grid h-full min-h-0 grid-cols-1 gap-6 xl:grid-cols-[2fr_3fr]">
      {(() => {
        const emailVerifierStatusMeta = getEmailVerifierStatusMeta(emailVerifierConfig || {});
        const emailVerifierDetail = emailVerifierConfig?.status === 'error'
          ? 'The last verification provider test failed. Update the API key and test again.'
          : (!emailVerifierConfig?.hasApiKey
            ? 'Add a Reoon API key to enable tenant-scoped email verification.'
            : (!emailVerifierConfig?.enabled
              ? 'Config is saved but verification is disabled for this tenant.'
              : 'Used by CRM verification and flow nodes through the existing verifier runtime.'));
        return (
          <>
      <div className="min-h-0 space-y-3 overflow-y-auto no-scrollbar pr-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Managed Mailboxes</div>
            <div className="text-sm text-[var(--color-text-secondary)]">Mailbox accounts and adjacent email infrastructure for sending, syncing, and verification.</div>
          </div>
          <button onClick={() => setShowMailboxComposer((current) => !current)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            {showMailboxComposer ? 'Close' : 'Add Integration'}
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
              <label className="flex items-center gap-2"><input type="checkbox" checked={mailboxDraft.inboundEnabled} onChange={(event) => setMailboxDraft((current) => ({ ...current, inboundEnabled: event.target.checked }))} />Inbound enabled</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={mailboxDraft.outboundEnabled} onChange={(event) => setMailboxDraft((current) => ({ ...current, outboundEnabled: event.target.checked }))} />Outbound enabled</label>
            </div>
            <button onClick={handleCreateMailbox} disabled={!mailboxDraft.name.trim() || !mailboxDraft.address.trim()} className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:opacity-50">Attach</button>
          </div>
        ) : null}
        <div className="space-y-3">
          {mailboxes.map((mailbox) => {
            const mailboxStateMeta = mailboxStateMetaById[mailbox.id] || getMailboxStateMeta(mailbox);
            return (
              <ResourceCard
                key={mailbox.id}
                icon={Mail}
                logoId={mailbox.provider}
                title={mailbox.name}
                subtitle={mailbox.provider}
                status={mailboxStateMeta.label}
                detail={mailboxStateMeta.detail || providerStateDetail(mailbox.config, mailbox.address || 'No address')}
                selected={selectedEmailResourceId === mailbox.id}
                onClick={() => {
                  setSelectedMailboxId(mailbox.id);
                  setSelectedEmailResourceId(mailbox.id);
                }}
                chips={[
                  `Now ${mailbox.queue_counts?.now || 0}`,
                  `Reply ${mailbox.queue_counts?.['needs-reply'] || 0}`,
                  mailbox.inboundEnabled ? 'Inbound On' : 'Inbound Off',
                  mailboxStateMeta.machine === 'connected' ? 'Auth Ready' : mailboxStateMeta.label
                ]}
              />
            );
          })}
          <ResourceCard
            key={EMAIL_VERIFIER_RESOURCE_ID}
            icon={ShieldCheck}
            title={emailVerifierProviderConfig?.name || 'Reoon Email Verification'}
            subtitle={emailVerifierProviderConfig?.subtypeLabel || 'Email Verification Provider'}
            status={emailVerifierStatusMeta.label}
            detail={emailVerifierDetail}
            selected={selectedEmailResourceId === EMAIL_VERIFIER_RESOURCE_ID}
            onClick={() => setSelectedEmailResourceId(EMAIL_VERIFIER_RESOURCE_ID)}
            chips={[
              'Email Verification',
              (emailVerifierConfig?.default_mode || emailVerifierForm.default_mode || 'quick').toUpperCase(),
              emailVerifierForm.auto_verify_contacts ? 'Auto Verify On' : 'Auto Verify Off',
              emailVerifierForm.enabled ? 'Enabled' : 'Disabled'
            ]}
          />
        </div>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto no-scrollbar pl-1">
        {selectedEmailInfrastructureKind === 'email-verifier' ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Managed Mailboxes</div>
                <h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{emailVerifierProviderConfig?.name || 'Reoon Email Verification'}</h3>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{emailVerifierProviderConfig?.description || 'Tenant-scoped verification provider used by CRM single verify, bulk verify, and flow nodes.'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {emailVerifierConfig?.hasApiKey ? <button onClick={() => setEmailVerifierConfigEditing(true)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Edit</button> : null}
                <button onClick={handleTestEmailVerifier} disabled={busyAction === 'email-verifier-test'} className={saveButtonClassName("rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-60 disabled:cursor-not-allowed", savedAction === 'email-verifier-test')}>{busyAction === 'email-verifier-test' ? 'Testing...' : savedAction === 'email-verifier-test' ? 'Tested' : 'TEST CONNECT'}</button>
                <SaveFeedbackNote visible={savedAction === 'email-verifier-test'} label="Connection OK" />
                <button onClick={handleSaveEmailVerifier} disabled={emailVerifierConfigLocked} className={saveButtonClassName("rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:cursor-not-allowed disabled:opacity-50", savedAction === 'email-verifier-save')}>{savedAction === 'email-verifier-save' ? 'Saved' : 'Save'}</button>
                <SaveFeedbackNote visible={savedAction === 'email-verifier-save'} label="Saved" />
                {emailVerifierConfig?.hasApiKey ? <button onClick={handleDeleteEmailVerifier} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300"><Trash2 size={14} />Disconnect</button> : null}
              </div>
            </div>
            {emailVerifierConfig?.status === 'error' ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">Last connection test failed. Update the API key and run a new test.</div> : null}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              This provider is managed here as part of the mail infrastructure layer. CRM verification, bulk tasks, and verification flow nodes all use this saved tenant config.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider State</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{emailVerifierStatusMeta.label}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Default Mode</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{(emailVerifierConfig?.default_mode || emailVerifierForm.default_mode || 'quick').toUpperCase()}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{emailVerifierConfig?.last_tested_at ? new Date(emailVerifierConfig.last_tested_at).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Runtime</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{emailVerifierForm.enabled ? 'Enabled' : 'Disabled'}</div></div>
            </div>
            <fieldset disabled={emailVerifierConfigLocked} className="space-y-3 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1 sm:col-span-2"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">API Key</div><input type="password" autoComplete="new-password" value={emailVerifierForm.apiKey} onChange={(event) => setEmailVerifierForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder={emailVerifierConfig?.hasApiKey ? 'Saved in workspace config' : 'Paste your Reoon API key'} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Default Mode</div><select value={emailVerifierForm.defaultMode} onChange={(event) => setEmailVerifierForm((current) => ({ ...current, defaultMode: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="quick">Quick</option><option value="power">Power</option></select></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm text-[var(--color-text-secondary)]">
              <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><input type="checkbox" checked={!!emailVerifierForm.enabled} onChange={(event) => setEmailVerifierForm((current) => ({ ...current, enabled: event.target.checked }))} /> Enable provider for this tenant</label>
              <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><input type="checkbox" checked={!!emailVerifierForm.autoVerifyContacts} onChange={(event) => setEmailVerifierForm((current) => ({ ...current, autoVerifyContacts: event.target.checked }))} /> Auto-verify contacts on create/update</label>
            </div>
            </fieldset>
          </div>
        ) : selectedMailbox ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Mailbox Control Plane</div><h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{selectedMailbox.name}</h3></div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setMailboxConfigEditing(true)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Edit</button>
                {isMailboxOauthProvider(mailboxForm.provider) ? <button onClick={handleAuthorizeMailbox} className="rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-3 py-2 text-sm text-[var(--color-text-primary)]">{selectedMailboxStateMeta.primaryActionLabel}</button> : null}
                {isMailboxOauthProvider(mailboxForm.provider) ? <button onClick={handleDisconnectMailbox} disabled={selectedMailboxStateMeta.authActionsDisabled} className="rounded-lg border border-amber-500/30 px-3 py-2 text-sm text-amber-200 disabled:cursor-not-allowed disabled:opacity-50">Disconnect</button> : null}
                <button onClick={handleTestMailbox} disabled={busyAction === 'mailbox-test' || selectedMailboxStateMeta.authActionsDisabled} className={saveButtonClassName("rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-60 disabled:cursor-not-allowed", savedAction === 'mailbox-test')}>{busyAction === 'mailbox-test' ? 'Testing...' : savedAction === 'mailbox-test' ? 'Tested' : 'TEST CONNECT'}</button>
                <SaveFeedbackNote visible={savedAction === 'mailbox-test'} label="Connection OK" />
                <button onClick={handleSyncMailbox} disabled={selectedMailboxStateMeta.authActionsDisabled} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50">Sync</button>
                <button onClick={handleSaveMailbox} disabled={selectedMailboxStateMeta.saveDisabled || mailboxConfigLocked} className={saveButtonClassName("rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:cursor-not-allowed disabled:opacity-50", savedAction === 'mailbox-save')}>{savedAction === 'mailbox-save' ? 'Saved' : 'Save'}</button>
                <SaveFeedbackNote visible={savedAction === 'mailbox-save'} label="Saved" />
                <button onClick={handleDeleteMailbox} disabled={mailboxes.length <= 1} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 size={14} />{selectedMailboxStateMeta.authActionsDisabled ? 'Delete / Reset' : 'Delete'}</button>
              </div>
            </div>
            {mailboxForm.config?.lastError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">{mailboxForm.config.lastError}</div> : null}
            {selectedMailboxStateMeta.authActionsDisabled ? <div className={`rounded-xl border px-3 py-3 text-sm ${toneClass(selectedMailboxStateMeta.tone)}`}>{selectedMailboxStateMeta.detail} Test, sync, save, and disconnect are disabled until recovery.</div> : null}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              This page is for connection management. The actual mail reader is the thread workspace in <span className="font-medium text-[var(--color-text-primary)]">Comms</span>.
              {mailboxDeleteTarget ? ` Deleting this mailbox will reassign any linked threads to ${mailboxDeleteTarget.name}.` : ' The last remaining mailbox cannot be deleted.'}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Health</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailboxStateMeta.label}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Sync</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.last_synced_at ? new Date(selectedMailbox.last_synced_at).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Inbound</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.inboundEnabled ? 'Enabled' : 'Disabled'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Outbound</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.outboundEnabled ? 'Enabled' : 'Disabled'}</div></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Connected Account</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{mailboxForm.config?.connectedIdentity || mailboxForm.address || 'Not connected'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{mailboxForm.config?.last_tested_at ? new Date(mailboxForm.config.last_tested_at).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider State</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailboxStateMeta.label}</div></div>
            </div>
            <fieldset disabled={mailboxConfigLocked} className="space-y-3 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Name</div><input value={mailboxForm.name} onChange={(event) => setMailboxForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Address</div><input value={mailboxForm.address} onChange={(event) => setMailboxForm((current) => ({ ...current, address: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><select value={mailboxForm.provider} onChange={(event) => setMailboxForm((current) => ({ ...current, provider: event.target.value, config: {} }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]">{mailboxProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><input value={mailboxForm.status || ''} onChange={(event) => setMailboxForm((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
            </div>
            {selectedMailboxProvider.fields?.length ? <div className="grid gap-3 sm:grid-cols-2 text-sm">{selectedMailboxProvider.fields.map((field) => <label key={field.key} className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div><input value={mailboxForm.config?.[field.key] || ''} onChange={(event) => setMailboxForm((current) => ({ ...current, config: { ...(current.config || {}), [field.key]: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>)}</div> : <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">This provider does not require external credentials.</div>}
            <div className="flex flex-wrap gap-3 text-sm text-[var(--color-text-secondary)]"><label className="flex items-center gap-2"><input type="checkbox" checked={mailboxForm.inboundEnabled} onChange={(event) => setMailboxForm((current) => ({ ...current, inboundEnabled: event.target.checked }))} />Inbound enabled</label><label className="flex items-center gap-2"><input type="checkbox" checked={mailboxForm.outboundEnabled} onChange={(event) => setMailboxForm((current) => ({ ...current, outboundEnabled: event.target.checked }))} />Outbound enabled</label></div>
            </fieldset>
          </div>
        ) : <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 text-center text-[var(--color-text-secondary)]">Create or select a mailbox to manage credentials and sync behavior.</div>}
      </div>
          </>
        );
      })()}
    </div>
  );

  const renderCalendarAdmin = (mode = 'calendar') => {
    const isVideoMode = mode === 'video';
    const scopedSources = isVideoMode ? videoConferencingSources : standardCalendarSources;
    const scopedProviders = isVideoMode ? videoConferencingProviders : standardCalendarProviders;
    const sectionTitle = isVideoMode ? 'Video Conferencing' : 'Calendar Sources';
    const sectionDescription = isVideoMode
      ? 'Meeting platforms, room links, and ingestion authority'
      : 'OAuth, feed, and reconciliation authority';
    const controlPlaneTitle = isVideoMode ? 'Video Conferencing Control Plane' : 'Calendar Control Plane';
    const emptyStateCopy = isVideoMode
      ? 'Create or select a conferencing source to manage API credentials, OAuth, and ingestion readiness.'
      : 'Create or select a calendar source to manage OAuth, sync rules, and import policy.';

    return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-6 xl:grid-cols-[2fr_3fr]">
      <div className="min-h-0 space-y-3 overflow-y-auto no-scrollbar pr-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">{sectionTitle}</div>
            <div className="text-sm text-[var(--color-text-secondary)]">{sectionDescription}</div>
          </div>
          <button onClick={() => setShowCalendarComposer((current) => !current)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            {showCalendarComposer ? 'Close' : 'Add Integration'}
          </button>
        </div>
        {showCalendarComposer ? (
          <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(15,23,42,0.22))] p-4 space-y-3">
            <div className="grid gap-3 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Source Name</div><input value={calendarSourceDraft.name} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><select value={calendarSourceDraft.provider} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, provider: event.target.value, config: { authorityMode: current.config?.authority_mode || 'local-first', importPolicy: current.config?.import_policy || 'review' } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]">{scopedProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Authority Mode</div><select value={calendarSourceDraft.config?.authority_mode || 'local-first'} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, config: { ...(current.config || {}), authorityMode: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="local-first">Local First</option><option value="mirror">Mirror External</option><option value="external-first">External First</option></select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Import Policy</div><select value={calendarSourceDraft.config?.import_policy || 'review'} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, config: { ...(current.config || {}), importPolicy: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="review">Review Before Adopt</option><option value="auto-merge">Auto Merge</option><option value="hold">Hold Imported Only</option></select></label>
            </div>
            {calendarDraftProvider.fields?.length ? <div className="grid gap-3 sm:grid-cols-2 text-sm">{calendarDraftProvider.fields.map((field) => <label key={field.key} className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div><input value={calendarSourceDraft.config?.[field.key] || ''} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, config: { ...(current.config || {}), [field.key]: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>)}</div> : null}
            <button onClick={handleCreateCalendarSource} disabled={!calendarSourceDraft.name.trim()} className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:opacity-50">Attach</button>
          </div>
        ) : null}
        <div className="space-y-3">
          {scopedSources.map((source) => {
            const calendarStateMeta = calendarSourceStateMetaById[source.id] || getCalendarSourceStateMeta(source);
            return (
            <ResourceCard
              key={source.id}
              icon={CalendarDays}
              logoId={source.provider}
              title={source.name}
              subtitle={source.provider}
              status={calendarStateMeta.label}
              detail={calendarStateMeta.detail || providerStateDetail(source.config, source.health?.detail || 'Source ready.')}
              selected={selectedCalendarSourceId === source.id}
              onClick={() => setSelectedCalendarSourceId(source.id)}
              chips={[
                `Events ${source.event_counts?.total || 0}`,
                `Synced ${source.event_counts?.synced || 0}`,
                `Conflicts ${source.event_counts?.conflicts || 0}`,
                calendarStateMeta.machine === 'connected' ? 'Auth Ready' : calendarStateMeta.label
              ]}
            />
            );
          })}
        </div>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto no-scrollbar pl-1">
        {selectedCalendarSource ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">{controlPlaneTitle}</div><h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.name}</h3></div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setCalendarConfigEditing(true)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Edit</button>
                {isCalendarOauthProvider(calendarSourceForm.provider) ? <button onClick={handleAuthorizeCalendarSource} className="rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-3 py-2 text-sm text-[var(--color-text-primary)]">{selectedCalendarSourceStateMeta.primaryActionLabel}</button> : null}
                {isCalendarOauthProvider(calendarSourceForm.provider) ? <button onClick={handleDisconnectCalendarSource} disabled={selectedCalendarSourceStateMeta.authActionsDisabled} className="rounded-lg border border-amber-500/30 px-3 py-2 text-sm text-amber-200 disabled:cursor-not-allowed disabled:opacity-50">Disconnect</button> : null}
                <button onClick={handleTestCalendarSource} disabled={busyAction === 'calendar-test' || selectedCalendarSourceStateMeta.authActionsDisabled} className={saveButtonClassName("rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-60 disabled:cursor-not-allowed", savedAction === 'calendar-test')}>{busyAction === 'calendar-test' ? 'Testing...' : savedAction === 'calendar-test' ? 'Tested' : 'TEST CONNECT'}</button>
                <SaveFeedbackNote visible={savedAction === 'calendar-test'} label="Source OK" />
                <button onClick={handleSyncCalendarSource} disabled={selectedCalendarSourceStateMeta.authActionsDisabled} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50">Sync</button>
                <button onClick={handleImportCalendarSource} disabled={selectedCalendarSourceStateMeta.authActionsDisabled} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50">Import</button>
                <button onClick={handleSaveCalendarSource} disabled={selectedCalendarSourceStateMeta.saveDisabled || calendarConfigLocked} className={saveButtonClassName("rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:cursor-not-allowed disabled:opacity-50", savedAction === 'calendar-save')}>{savedAction === 'calendar-save' ? 'Saved' : 'Save'}</button>
                <SaveFeedbackNote visible={savedAction === 'calendar-save'} label="Saved" />
                <button onClick={handleDeleteCalendarSource} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300"><Trash2 size={14} />{selectedCalendarSourceStateMeta.authActionsDisabled ? 'Delete / Reset' : 'Delete'}</button>
              </div>
            </div>
            {calendarSourceForm.config?.lastError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">{calendarSourceForm.config.lastError}</div> : null}
            {selectedCalendarSourceStateMeta.authActionsDisabled ? <div className={`rounded-xl border px-3 py-3 text-sm ${toneClass(selectedCalendarSourceStateMeta.tone)}`}>{selectedCalendarSourceStateMeta.detail} Test, sync, import, save, and disconnect are disabled until recovery.</div> : null}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              {calendarSourceDeleteTarget ? `Deleting this source will move any linked events to ${calendarSourceDeleteTarget.name}.` : 'If this is the last source, linked events will simply be detached from it.'}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Health</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSourceStateMeta.label}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Events</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.event_counts?.total || 0}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Synced</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.event_counts?.synced || 0}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Conflicts</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.event_counts?.conflicts || 0}</div></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Connected Account</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{calendarSourceForm.config?.connectedIdentity || calendarSourceForm.config?.email || 'Not connected'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Connected Calendar</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{calendarSourceForm.config?.connectedCalendar || 'Not selected'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{calendarSourceForm.config?.last_tested_at ? new Date(calendarSourceForm.config.last_tested_at).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Sync</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.last_synced_at ? new Date(selectedCalendarSource.last_synced_at).toLocaleString() : 'Never'}</div></div>
            </div>
            <fieldset disabled={calendarConfigLocked} className="space-y-3 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Source Name</div><input value={calendarSourceForm.name} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><select value={calendarSourceForm.provider} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, provider: event.target.value, config: { authorityMode: current.config?.authority_mode || 'local-first', importPolicy: current.config?.import_policy || 'review' } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]">{scopedProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Authority Mode</div><select value={calendarSourceForm.config?.authority_mode || 'local-first'} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), authorityMode: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="local-first">Local First</option><option value="mirror">Mirror External</option><option value="external-first">External First</option></select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Import Policy</div><select value={calendarSourceForm.config?.import_policy || 'review'} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), importPolicy: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="review">Review Before Adopt</option><option value="auto-merge">Auto Merge</option><option value="hold">Hold Imported Only</option></select></label>
            </div>
            {isCalendarOauthProvider(calendarSourceForm.provider) ? <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">Connection is read-only at this stage. The platform binds the Google or Microsoft account, loads available calendars, and stores the selected calendar id. No event import, mirror, overwrite, or deletion occurs during connection.</div> : null}
            {isCalendarOauthProvider(calendarSourceForm.provider) ? <div className="grid gap-3 sm:grid-cols-2 text-sm"><label className="space-y-1 sm:col-span-2"><div className="flex items-center justify-between gap-3"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Active Calendar</div>{calendarOptionsLoading ? <span className="text-[11px] text-[var(--color-text-tertiary)]">Loading calendars...</span> : null}</div><select value={calendarSourceForm.config?.calendar_id || ''} onChange={(event) => { const nextId = event.target.value; const selectedOption = calendarOptions.find((item) => String(item.id || '') === nextId) || null; setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), calendar_id: nextId || '', connected_calendar: selectedOption?.label || '' } })); }} disabled={!calendarOptions.length && !calendarOptionsLoading} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="">{calendarOptions.length ? 'Select a calendar' : calendarSourceForm.config?.connectedIdentity ? 'No calendars loaded yet' : 'Connect OAuth first'}</option>{calendarOptions.map((item) => <option key={item.id} value={item.id}>{item.label}{item.primary ? ' (Primary)' : ''}</option>)}</select>{calendarSourceForm.config?.connectedIdentity && !calendarOptions.length && !calendarOptionsLoading ? <div className="text-xs text-[var(--color-text-secondary)]">This source is connected, but the calendar list is not available yet. Save or reconnect to refresh the available calendars.</div> : null}</label></div> : null}
            {selectedCalendarProviderFields?.length ? <div className="grid gap-3 sm:grid-cols-2 text-sm">{selectedCalendarProviderFields.map((field) => <label key={field.key} className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div><input value={calendarSourceForm.config?.[field.key] || ''} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), [field.key]: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>)}</div> : <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">This provider does not require external credentials.</div>}
            </fieldset>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]"><span className="rounded-full border border-[var(--color-border)] px-2 py-1">Authority {sourceRuleLabels[selectedCalendarSource.authority_mode] || selectedCalendarSource.authority_mode}</span><span className="rounded-full border border-[var(--color-border)] px-2 py-1">Import {sourceRuleLabels[selectedCalendarSource.import_policy] || selectedCalendarSource.import_policy}</span></div>
          </div>
        ) : <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 text-center text-[var(--color-text-secondary)]">{emptyStateCopy}</div>}
      </div>
    </div>
  );
  };

  const renderAiAdmin = () => (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_3fr]">
      <div className="space-y-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">LLMs</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Keep one local runtime active for private AI work, and stage external providers here for overflow, experiments, or model-specific tasks.</div>
        </div>
        <div className="space-y-3">
          {aiProviderConfigs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--color-border)] rounded-2xl text-[var(--color-text-secondary)]">
              <Bot size={40} className="mb-3 opacity-20" />
              <p className="text-sm">No LLM runtimes configured.</p>
              <button 
                onClick={() => setPanelOpen(true)}
                className="mt-4 text-[var(--color-primary)] text-sm font-semibold hover:underline"
              >
                + Add Integration
              </button>
            </div>
          ) : (
            aiProviderConfigs.map((config) => {
              const provider = getProviderConfig(config.provider_key) || { 
                name: config.label, 
                description: 'External Provider' 
              };
              return (
                <ResourceCard
                  key={config.id}
                  icon={Bot}
                  logoId={config.provider_key}
                  title={config.label || provider.name}
                  subtitle={config.provider_key}
                  status={config.status || 'Ready'}
                  detail={config.lastError || config.model || provider.description}
                  selected={selectedAiProviderKey === config.provider_key}
                  onClick={() => setSelectedAiProviderKey(config.provider_key)}
                  chips={[
                    config.is_default ? 'Active Runtime' : 'Standby',
                    config.enabled ? 'Enabled' : 'Disabled',
                    config.model || 'No model',
                  ]}
                />
              );
            })
          )}
        </div>
      </div>
      <div className="space-y-4">
        {selectedAiProviderConfig ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">LLM Control Plane</div>
                <h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{selectedAiProviderCatalog.displayName || selectedAiProviderCatalog.label}</h3>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{selectedAiProviderCatalog.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setAiProviderConfigEditing(true)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Edit</button>
                <button onClick={handleTestAiProvider} disabled={busyAction === 'ai-provider-test'} className={saveButtonClassName("rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-60 disabled:cursor-not-allowed", savedAction === 'ai-provider-test')}>{busyAction === 'ai-provider-test' ? 'Testing...' : savedAction === 'ai-provider-test' ? 'Tested' : 'TEST CONNECT'}</button>
                <SaveFeedbackNote visible={savedAction === 'ai-provider-test'} label="Provider OK" />
                <button onClick={handleSaveAiProvider} disabled={aiProviderConfigLocked} className={saveButtonClassName("rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:cursor-not-allowed disabled:opacity-50", savedAction === 'ai-provider-save')}>{savedAction === 'ai-provider-save' ? 'Saved' : 'Save'}</button>
                <SaveFeedbackNote visible={savedAction === 'ai-provider-save'} label="Saved" />
                {selectedAiProviderConfig ? <button onClick={handleDeleteAiProvider} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300"><Trash2 size={14} />Delete</button> : null}
              </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedAiProviderConfig?.status || 'Not configured'}</div></div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Runtime</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedAiProviderConfig?.is_default ? 'Active' : 'Standby'}</div></div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Model</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedAiProviderConfig?.model || selectedAiProviderCatalog.defaultModel || selectedAiProviderCatalog.default_model || 'Unset'}</div></div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedAiProviderConfig?.last_tested_at ? new Date(selectedAiProviderConfig.last_tested_at).toLocaleString() : 'Never'}</div></div>
          </div>
          {selectedAiProviderConfig?.lastError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">{selectedAiProviderConfig.lastError}</div> : null}
          
          <fieldset disabled={aiProviderConfigLocked} className="space-y-3 disabled:opacity-70">
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            {(selectedAiProviderCatalog.fields || []).map((field) => (
              <label key={field.name || field.key} className={`${field.type === 'textarea' ? 'sm:col-span-2' : ''} space-y-1`}>
                {(() => {
                  const fieldName = getAiFieldName(field);
                  return (
                    <>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div>
                </div>
                
                {fieldName === 'model' && selectedAiProviderKey === 'ollama' ? (
                  <select
                    value={aiProviderForm.model || ''}
                    onChange={(event) => setAiProviderForm((current) => ({ ...current, model: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"
                  >
                    {ollamaModelsLoading ? <option value="">Loading Ollama models...</option> : null}
                    {!ollamaModelsLoading && !ollamaModels.length ? <option value="">No models found at this Ollama URL</option> : null}
                    {ollamaModels.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    rows={4}
                    value={resolveAiProviderFieldValue(aiProviderForm, fieldName)}
                    onChange={(event) => setAiProviderForm((current) => ({ ...current, [fieldName]: event.target.value }))}
                    placeholder={field.placeholder || ''}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)] resize-none"
                  />
                ) : (
                  <input
                    type={field.type === 'password' ? 'password' : 'text'}
                    autoComplete={field.type === 'password' ? 'new-password' : undefined}
                    value={resolveAiProviderFieldValue(aiProviderForm, fieldName)}
                    onChange={(event) => setAiProviderForm((current) => ({ ...current, [fieldName]: event.target.value }))}
                    placeholder={fieldName === 'api_key' && selectedAiProviderConfig?.apiKey_present ? 'Saved in workspace config' : field.placeholder || ''}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"
                  />
                )}
                    </>
                  );
                })()}
              </label>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-[var(--color-text-primary)]">
              <input 
                type="checkbox" 
                checked={!!aiProviderForm.enabled} 
                onChange={(event) => setAiProviderForm((current) => ({ 
                  ...current, 
                  enabled: event.target.checked, 
                  isDefault: event.target.checked ? current.is_default : false // Rule 2: If disabled, cannot be default
                }))} 
              /> 
              Enable provider for this workspace
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-[var(--color-text-primary)]">
              <input 
                type="checkbox" 
                checked={!!aiProviderForm.is_default} 
                onChange={(event) => setAiProviderForm((current) => ({ 
                  ...current, 
                  isDefault: event.target.checked, 
                  enabled: event.target.checked ? true : current.enabled // Rule 1: If default, MUST be enabled
                }))} 
              /> 
              Use as the active AI runtime
            </label>
          </div>
          </fieldset>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
            Bullseye assists across CRM, Forms, Calendar, Flows, and Comms will use the active runtime first, then fall back safely if this provider is unavailable.
          </div>
          {selectedAiProviderKey === 'ollama' ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              Use the raw Ollama daemon URL, like <span className="font-medium text-[var(--color-text-primary)]">http://localhost:11434</span> or <span className="font-medium text-[var(--color-text-primary)]">http://LAN-IP:11434</span>. If your Ollama host sits behind a proxy, ensure the Base URL and optional credentials are correct so model refresh and test function as expected.
            </div>
          ) : null}

          </div>
        ) : (
          <div className="h-full rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex flex-col items-center justify-center p-12 text-center">
            <Bot size={64} className="mb-4 opacity-10" />
            <h3 className="text-lg font-medium text-[var(--color-text-primary)]">Select an LLM Runtime</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)] max-w-xs">
              Edit and manage your LLM integrations on the left to see their control plane here.
            </p>
          </div>
        )}
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
          <button className="mt-2 rounded bg-purple-500 px-4 py-2 font-semibold text-white transition-all hover:bg-purple-600" onClick={() => setPanelOpen(true)}>Add Integration</button>
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

  const totalConnected = automationProviderConfigs.length + integrations.filter((integration) => integration.category !== INTEGRATION_CATEGORIES.AUTOMATION).length + mailboxes.length + calendarSources.length + aiProviderConfigs.filter((provider) => provider.enabled || provider.apiKey_present || provider.baseUrl).length + paymentProviderConfigs.length;
  const activeConnected = automationProviderConfigs.filter((provider) => provider.enabled).length
    + integrations.filter((integration) => integration.category !== INTEGRATION_CATEGORIES.AUTOMATION && integration.enabled).length
    + mailboxes.filter((mailbox) => (mailboxStateMetaById[mailbox.id] || getMailboxStateMeta(mailbox)).machine === 'connected').length
    + calendarSources.filter((source) => (calendarSourceStateMetaById[source.id] || getCalendarSourceStateMeta(source)).machine === 'connected').length
    + aiProviderConfigs.filter((provider) => provider.enabled).length
    + paymentProviderConfigs.filter((provider) => provider.enabled).length;

  const renderPaymentsAdmin = () => (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_3fr]">
      <div className="space-y-3 overflow-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Payment Providers</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Collect payments via Stripe, PayPal, and other processors.</div>
        </div>
        {paymentProviderCatalog.map((provider) => {
          const config = paymentProviderConfigs.find((item) => item.provider_key === provider.id);
          return (
            <ResourceCard
              key={provider.id}
              icon={Zap}
              logoId={provider.id}
              title={config?.label || provider.name}
              subtitle={provider.id}
              status={config ? 'configured' : 'not configured'}
              detail={provider.description}
              selected={selectedPaymentProviderKey === provider.id}
              onClick={() => setSelectedPaymentProviderKey(provider.id)}
              chips={[
                config?.enabled ? 'enabled' : 'disabled',
              ]}
            />
          );
        })}
      </div>

      <div className="overflow-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
        {selectedPaymentProviderCatalog ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Payment Control Plane</div>
                <h3 className="mt-2 text-3xl font-semibold text-[var(--color-text-primary)]">{paymentProviderForm.label || selectedPaymentProviderCatalog.name}</h3>
                <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">{selectedPaymentProviderCatalog.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedPaymentProviderConfig ? <button onClick={() => setPaymentConfigEditing(true)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Edit</button> : null}
                <button onClick={handleSavePaymentProvider} disabled={paymentConfigLocked} className={saveButtonClassName("rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:cursor-not-allowed disabled:opacity-50", savedAction === 'payment-save')}>
                  {savedAction === 'payment-save' ? 'Saved' : 'Save'}
                </button>
                {selectedPaymentProviderConfig ? <button onClick={handleDeletePaymentProvider} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300"><Trash2 size={14} />Delete</button> : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">{selectedPaymentProviderConfig ? 'Connected' : 'Standby'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Mode</div><div className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">{paymentProviderForm.config?.mode || 'sandbox'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Currency</div><div className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">{(paymentProviderForm.config?.currency || 'USD').toUpperCase()}</div></div>
            </div>

            <fieldset disabled={paymentConfigLocked} className="space-y-3 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-2">
              {selectedPaymentProviderCatalog.fields?.filter((field) => !['label', 'mode', 'currency'].includes(field.name)).map((field) => (
                <label key={field.name} className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div>
                  {field.type === 'select' ? (
                    <select
                      value={paymentProviderForm.config?.[field.name] || field.default || ''}
                      onChange={(event) => setPaymentProviderForm((current) => ({ ...current, config: { ...(current.config || {}), [field.name]: event.target.value } }))}
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                    >
                      {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'password' ? 'password' : 'text'}
                      autoComplete={field.type === 'password' ? 'new-password' : undefined}
                      value={paymentProviderForm.config?.[field.name] || ''}
                      onChange={(event) => setPaymentProviderForm((current) => ({ ...current, config: { ...(current.config || {}), [field.name]: event.target.value } }))}
                      placeholder={field.default || ''}
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                    />
                  )}
                </label>
              ))}
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-3 text-[var(--color-text-primary)]">
              <input type="checkbox" checked={!!paymentProviderForm.enabled} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, enabled: event.target.checked }))} />
              Enable payment provider for this workspace
            </label>
            </fieldset>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              Enter your payment processor credentials here. Use sandbox mode for testing and switch to live when ready to accept real payments.
            </div>
            <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
              <SaveFeedbackNote visible={savedAction === 'payment-save'} label="Saved" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)]">
      <div className="px-6 pt-4">
        <div className="space-y-3">
          {moduleAlerts.map((alert) => (
            <div key={alert.key} className={`rounded-lg border px-4 py-3 ${toneClass(alert.tone)}`}>
              {alert.message}
            </div>
          ))}
          {notice ? <div className={`rounded-lg border px-4 py-3 ${toneClass(notice.tone)}`}>{notice.message}</div> : null}
        </div>
      </div>
      <ModuleHeader
        showTitle={false}
        className="bg-transparent"
        actions={[
          {
            label: 'Add Integration',
            icon: Plus,
            onClick: () => {
              if (activeCategory === INTEGRATION_CATEGORIES.EMAIL) {
                setShowMailboxComposer(true);
              } else if (activeCategory === INTEGRATION_CATEGORIES.CALENDAR || activeCategory === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING) {
                const nextProvider = activeCategory === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING
                  ? (videoConferencingProviders[0]?.id || 'zoom-api')
                  : (standardCalendarProviders[0]?.id || 'google-calendar-oauth');
                setCalendarSourceDraft(createCalendarSourceDraft(nextProvider));
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
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-6 pt-4">
        <div className="flex flex-nowrap gap-4 overflow-x-auto no-scrollbar">
          <div className="min-w-[220px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"><div className="text-xs font-medium text-[var(--color-text-secondary)]">Total Connections</div><div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{totalConnected}</div></div>
          <div className="min-w-[220px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"><div className="text-xs font-medium text-[var(--color-text-secondary)]">Active</div><div className="mt-2 text-2xl font-bold text-green-500">{activeConnected}</div></div>
          <div className="min-w-[220px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"><div className="text-xs font-medium text-[var(--color-text-secondary)]">Categories</div><div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{categories.length}</div></div>
        </div>
        <IntegrationTabs categories={categories} activeCategory={activeCategory} onCategoryChange={setActiveCategory} counts={categoryCounts} />
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeCategory === INTEGRATION_CATEGORIES.AUTOMATION
            ? renderAutomationAdmin()
            : activeCategory === INTEGRATION_CATEGORIES.EMAIL
            ? renderEmailAdmin()
            : activeCategory === INTEGRATION_CATEGORIES.CALENDAR
              ? renderCalendarAdmin('calendar')
              : activeCategory === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING
                ? renderCalendarAdmin('video')
              : activeCategory === INTEGRATION_CATEGORIES.LLMS
                ? renderAiAdmin()
                : activeCategory === INTEGRATION_CATEGORIES.PAYMENTS
                  ? renderPaymentsAdmin()
                  : activeCategory === INTEGRATION_CATEGORIES.SMS
                    ? renderLegacyCategory()
                    : activeCategory === INTEGRATION_CATEGORIES.TRACKING
                      ? renderLegacyCategory()
                      : renderLegacyCategory()}
        </div>
        <AddIntegrationPanel isOpen={panelOpen} category={activeCategory} onClose={() => setPanelOpen(false)} onSave={handleAddIntegration} onCategoryChange={setActiveCategory} categories={categories} />
      </div>
    </div>
  );
};

export default ActiveIntegrations;
