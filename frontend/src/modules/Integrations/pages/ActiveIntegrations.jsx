/**
 * LOCKED: AI Provider Unified Architecture - Phase 1 & 2
 * Verified Stable: March 25, 2026
 * DO NOT MODIFY SCHEMA OR STATS LOGIC WITHOUT OPERATOR APPROVAL
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Calendar, CalendarDays, CheckCircle2, LogOut, Mail, RefreshCw, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { BrainIcon } from '../../../components/ui/icons';
import IntegrationCard from '../components/IntegrationCard';
import { IntegrationProviderSelector } from '../components/AddIntegrationPanel';
import { getAllCategories, getProviderConfig, getProvidersByCategory, INTEGRATION_CATEGORIES, normalizeAiField } from '../utils/integrationConfigs';
import { getBrandIcon } from '../utils/brandIcons.jsx';
import ModuleHeader from '../../../components/ModuleHeader';
import { useNotice } from '../../../contexts/NoticeContext';
import { useAIAssist } from '../../../contexts/AIAssistContext';
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
  getMediaProviderConfigsApi,
  upsertMediaProviderConfigApi,
  deleteMediaProviderConfigApi,
  testMediaProviderConfigApi,
  getDataStoreProviderConfigsApi,
  upsertDataStoreProviderConfigApi,
  deleteDataStoreProviderConfigApi,
  testDataStoreProviderConfigApi,
  getPaymentProviderConfigsApi,
  upsertPaymentProviderConfigApi,
  getSocialProviderConfigsApi,
  upsertSocialProviderConfigApi,
  deletePaymentProviderConfigApi
} from '../../../services/backendApi';
import { openOAuthPopup } from '../../../utils/oauthPopup';

const DEFAULT_MAILBOX_PROVIDERS = [
  {
    id: 'gmail-oauth',
    label: 'Gmail OAuth',
    fields: [
      { key: 'email', label: 'Google Account' },
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client Secret' },
      { key: 'refreshToken', label: 'Refresh Token' }
    ]
  },
  {
    id: 'microsoft365-oauth',
    label: 'Microsoft 365 OAuth',
    fields: [
      { key: 'email', label: 'Microsoft Account' },
      { key: 'tenantId', label: 'Tenant ID' },
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client Secret' },
      { key: 'refreshToken', label: 'Refresh Token' }
    ]
  },
  {
    id: 'smtp-imap',
    label: 'SMTP / IMAP',
    fields: [
      { key: 'email', label: 'Mailbox Email' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password' },
      { key: 'incomingHost', label: 'IMAP Host' },
      { key: 'incomingPort', label: 'IMAP Port' },
      { key: 'outgoingHost', label: 'SMTP Host' },
      { key: 'outgoingPort', label: 'SMTP Port' }
    ]
  }
];

const DEFAULT_CALENDAR_PROVIDERS = [
  {
    id: 'google-calendar-oauth',
    label: 'Google Calendar',
    fields: [
      { key: 'email', label: 'Google Account' },
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client Secret' },
      { key: 'refreshToken', label: 'Refresh Token' },
      { key: 'calendarId', label: 'Calendar ID' }
    ]
  },
  {
    id: 'google-meet-oauth',
    label: 'Google Meet',
    fields: [
      { key: 'email', label: 'Google Account' },
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client Secret' },
      { key: 'refreshToken', label: 'Refresh Token' },
      { key: 'calendarId', label: 'Calendar ID' }
    ]
  },
  {
    id: 'zoom-api',
    label: 'Zoom',
    fields: [
      { key: 'accountId', label: 'Account ID' },
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client Secret' },
      { key: 'userId', label: 'User ID' }
    ]
  },
  {
    id: 'jitsi-stub',
    label: 'Jitsi',
    fields: [
      { key: 'serverUrl', label: 'Server URL' },
      { key: 'roomPrefix', label: 'Room Prefix' },
      { key: 'apiKey', label: 'API Key' }
    ]
  },
  {
    id: 'ics-url',
    label: 'ICS Feed',
    fields: [
      { key: 'feedUrl', label: 'ICS Feed URL' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password' }
    ]
  },
  {
    id: 'microsoft365-calendar',
    label: 'Microsoft 365 Calendar',
    fields: [
      { key: 'tenantId', label: 'Tenant ID' },
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client Secret' },
      { key: 'userId', label: 'User ID' },
      { key: 'calendarId', label: 'Calendar ID' }
    ]
  }
];

const VIDEO_CONFERENCING_PROVIDER_IDS = new Set(['zoom-api', 'google-meet-oauth', 'jitsi-stub']);
const isVideoConferencingProvider = (providerId) => VIDEO_CONFERENCING_PROVIDER_IDS.has(String(providerId || '').trim());
const toCamelCase = (value) => String(value || '').replace(/[-_]+([a-zA-Z0-9])/g, (_, character) => character.toUpperCase());
const camelizeData = (value) => {
  if (Array.isArray(value)) {
    return value.map(camelizeData);
  }
  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value;
  }
  return Object.entries(value).reduce((result, [key, entryValue]) => {
    result[toCamelCase(key)] = camelizeData(entryValue);
    return result;
  }, {});
};
const EMAIL_SELECTOR_TO_RUNTIME_PROVIDER = {
  gmail: 'gmail-oauth',
  outlook: 'microsoft365-oauth',
  imap: 'smtp-imap',
};
const EMAIL_RUNTIME_TO_SELECTOR_PROVIDER = Object.fromEntries(
  Object.entries(EMAIL_SELECTOR_TO_RUNTIME_PROVIDER).map(([selectorKey, runtimeKey]) => [runtimeKey, selectorKey])
);
const CALENDAR_SELECTOR_TO_RUNTIME_PROVIDER = {
  'google-calendar': 'google-calendar-oauth',
  'outlook-calendar': 'microsoft365-calendar',
  'google-meet-oauth': 'google-meet-oauth',
  'zoom-api': 'zoom-api',
  'jitsi-stub': 'jitsi-stub',
};
const CALENDAR_RUNTIME_TO_SELECTOR_PROVIDER = Object.fromEntries(
  Object.entries(CALENDAR_SELECTOR_TO_RUNTIME_PROVIDER).map(([selectorKey, runtimeKey]) => [runtimeKey, selectorKey])
);
const resolveEmailRuntimeProvider = (providerId) => EMAIL_SELECTOR_TO_RUNTIME_PROVIDER[providerId] || providerId;
const resolveEmailSelectorProvider = (providerId) => EMAIL_RUNTIME_TO_SELECTOR_PROVIDER[providerId] || providerId;
const resolveCalendarRuntimeProvider = (providerId) => CALENDAR_SELECTOR_TO_RUNTIME_PROVIDER[providerId] || providerId;
const resolveCalendarSelectorProvider = (providerId) => CALENDAR_RUNTIME_TO_SELECTOR_PROVIDER[providerId] || providerId;
const resolveMediaRuntimeProvider = (providerId) => {
  const value = String(providerId || '');
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
};
const resolveMediaSelectorProvider = (providerId) => toCamelCase(providerId);

// DEPRECATED: DEFAULT_AI_PROVIDER_CATALOG removed in favor of providerSchema.js

const getAiFieldName = (field) => normalizeAiField(field?.name || field?.key || '');

const createAiProviderDraft = (provider) => {
  const fields = provider?.fields || [];
  const findField = (name) => fields.find((f) => getAiFieldName(f) === name);
  const isOllama = provider?.id === 'ollama' || provider?.key === 'ollama';

  return {
    baseUrl: provider?.defaultBaseUrl || findField('baseUrl')?.default || '',
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
  ['label', 'apiKey', 'baseUrl', 'model'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(cleaned, key)) {
      delete cleaned[key];
    }
  });
  return cleaned;
};

const normalizeAiProviderConfigRecord = (provider = {}) => {
  const config = provider.config || {};
  return {
    ...provider,
    providerKey: provider.providerKey || '',
    isDefault: Boolean(provider.isDefault),
    apiKeyPresent: Boolean(provider.apiKeyPresent),
    systemGuardrails: provider.systemGuardrails || config.systemGuardrails || '',
    taskGuardrails: provider.taskGuardrails || config.taskGuardrails || '',
  };
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

const createDataStoreProviderDraft = (provider) => ({
  label: provider?.fields?.find((field) => field.name === 'label')?.default || provider?.name || '',
  baseUrl: provider?.fields?.find((field) => field.name === 'baseUrl')?.default || '',
  apiKey: '',
  enabled: true,
  config: Object.fromEntries(
    (provider?.fields || [])
      .filter((field) => !['label', 'baseUrl', 'apiKey'].includes(field.name))
      .map((field) => [field.name, field.default ?? (field.type === 'checkbox' ? false : '')])
  )
});

const createMediaProviderDraft = (provider) => ({
  label: provider?.fields?.find((field) => field.name === 'label')?.default || provider?.name || '',
  baseUrl: provider?.fields?.find((field) => field.name === 'baseUrl')?.default || '',
  apiKey: '',
  enabled: true,
  config: Object.fromEntries(
    (provider?.fields || [])
      .filter((field) => !['label', 'baseUrl', 'apiKey'].includes(field.name))
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
  if (machine === 'disconnected' || machine === 'not_connected') {
    return {
      machine: 'not_connected',
      label: 'Not Connected',
      detail: disconnectedLabel,
      tone: 'warning',
      authActionsDisabled: true,
      saveDisabled: false,
      primaryActionLabel: 'Connect OAuth'
    };
  }

  if (machine === 'reconnect_required' || machine === 'unauthorized') {
    return {
      machine: 'reconnect_required',
      label: 'Reconnect Required',
      detail: reconnectDetail || unauthorizedDetail,
      tone: 'warning',
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
    ? ['clientId', 'clientSecret'].filter((key) => !hasConfigValue(config[key]))
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
      machine: 'not_connected',
      label: 'Not Connected',
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
      machine: 'reconnect_required',
      label: 'Reconnect Required',
      detail: lastError || 'OAuth authorization failed or expired. Reconnect to restore access.',
      tone: 'warning',
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
  const connectedCalendar = config.connectedCalendar || config.calendarId || '';
  const missingRefreshToken = isCalendarOauthProvider(provider) && !hasConfigValue(config.refreshToken);
  const missingCredentials = provider === 'google-calendar-oauth'
    ? ['clientId', 'clientSecret'].filter((key) => !hasConfigValue(config[key]))
    : provider === 'microsoft365-calendar'
      ? ['tenantId', 'clientId', 'clientSecret', 'userId'].filter((key) => !hasConfigValue(config[key]))
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
      machine: 'not_connected',
      label: 'Not Connected',
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
      machine: 'reconnect_required',
      label: 'Reconnect Required',
      detail: lastError || 'OAuth authorization failed or expired. Reconnect to restore access.',
      tone: 'warning',
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
  enabled: config.hasApiKey ? !!config.enabled : false,
  autoVerifyContacts: config.autoVerifyContacts !== false,
  defaultMode: config.defaultMode === 'power' ? 'power' : 'quick',
});

const getEmailVerifierStatusMeta = (config = {}) => {
  const lastError = String(config?.lastError || '').trim();
  if (!config?.hasApiKey) {
    return {
      machine: 'not_connected',
      label: 'Not Connected',
      tone: 'disconnected',
      detail: 'Add a Reoon API key to enable tenant-scoped email verification.',
    };
  }
  if (config?.status === 'error') {
    return {
      machine: 'reconnect_required',
      label: 'Reconnect Required',
      tone: 'error',
      detail: lastError || 'The saved Reoon connection failed validation. Update the key and test again.',
    };
  }
  if (!config?.enabled) {
    return {
      machine: 'needs_config',
      label: 'Needs Config',
      tone: 'warning',
      detail: 'Config is saved but verification is disabled for this tenant.',
    };
  }
  return {
    machine: 'connected',
    label: 'Connected',
    tone: 'connected',
    detail: 'Used by CRM single verify, bulk verify, and flow nodes through the existing verifier runtime.',
  };
};

const getEmailVerifierDetail = (config = {}) => {
  return getEmailVerifierStatusMeta(config).detail;
};

const getAutomationProviderStateMeta = (config = null, catalogEntry = null) => {
  if (!config) {
    return {
      machine: 'not_connected',
      label: 'Not Connected',
      detail: catalogEntry?.description || 'No automation provider is configured for this workspace yet.',
    };
  }
  const lastError = String(config?.lastError || '').trim();
  const requiresApiKey = Boolean(catalogEntry?.fields?.find((field) => field.name === 'apiKey')?.required);
  const missingBaseUrl = !hasConfigValue(config?.baseUrl);
  const missingApiKey = requiresApiKey && !Boolean(config?.apiKeyPresent);
  if (String(config?.status || '').trim().toLowerCase() === 'error') {
    return {
      machine: 'reconnect_required',
      label: 'Reconnect Required',
      detail: lastError || 'The automation endpoint or credentials failed validation. Update config and test again.',
    };
  }
  if (missingBaseUrl || missingApiKey) {
    return {
      machine: 'needs_config',
      label: 'Needs Config',
      detail: lastError || 'A base URL or required credentials are still missing.',
    };
  }
  if (!config?.enabled) {
    return {
      machine: 'needs_config',
      label: 'Needs Config',
      detail: 'Config is saved but the automation provider is disabled for this workspace.',
    };
  }
  return {
    machine: 'connected',
    label: 'Connected',
    detail: lastError || config?.baseUrl || 'Automation provider is ready.',
  };
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

const compactPanelClass = 'overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4';
const compactControlPlaneClass = 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3';
const compactMetaGridClass = 'grid gap-2 sm:grid-cols-2 xl:grid-cols-4';
const compactMetaCardClass = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-2';
const compactInputClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-[var(--color-text-primary)]';
const compactInputSecondaryClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-[var(--color-text-primary)]';
const compactActionClass = 'rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]';

const ResourceCard = ({ icon: Icon, logoId, title, subtitle, status, detail, selected, onClick, chips = [] }) => (
  <button
    onClick={onClick}
    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
      selected
        ? 'border-[var(--color-primary)] bg-[var(--color-bg-secondary)] shadow-[0_0_0_1px_rgba(59,130,246,0.4),0_12px_24px_rgba(3,7,18,0.35)]'
        : 'border-[var(--color-border)]/40 bg-[var(--color-bg-secondary)]/55 hover:border-[var(--color-primary)]/35 hover:bg-[var(--color-bg-secondary)]/75'
    }`}
  >
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-primary)]">
        {logoId ? getBrandIcon(logoId, 22) : <Icon size={16} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="text-[13px] font-semibold leading-tight text-[var(--color-text-primary)]">{title}</div>
          <span className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">{status}</span>
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{subtitle}</div>
        <div className="mt-1.5 text-[12px] leading-snug text-[var(--color-text-secondary)]">{detail}</div>
        {chips.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span key={chip} className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">{chip}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  </button>
);

export const ActiveIntegrations = ({ initialCategory = null }) => {
  const { showNotice } = useNotice();
  const { openAIAssist } = useAIAssist();
  const [integrations, setIntegrations] = useState([]);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [selectorProviderKey, setSelectorProviderKey] = useState(null);
  const [legacyActivationSelections, setLegacyActivationSelections] = useState({});
  const [loading, setLoading] = useState(true);

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

  const [dataStoreProviderConfigs, setDataStoreProviderConfigs] = useState([]);
  const [selectedDataStoreProviderKey, setSelectedDataStoreProviderKey] = useState('googleSheets');
  const [dataStoreProviderForm, setDataStoreProviderForm] = useState(() => createDataStoreProviderDraft(getProviderConfig('googleSheets')));
  const [dataStoreConfigEditing, setDataStoreConfigEditing] = useState(false);

  const [mediaProviderConfigs, setMediaProviderConfigs] = useState([]);
  const [selectedMediaProviderKey, setSelectedMediaProviderKey] = useState('elevenlabsScribe');
  const [mediaProviderForm, setMediaProviderForm] = useState(() => createMediaProviderDraft(getProviderConfig('elevenlabsScribe')));
  const [mediaConfigEditing, setMediaConfigEditing] = useState(false);

  const [paymentProviderConfigs, setPaymentProviderConfigs] = useState([]);
  const [socialProviderConfigs, setSocialProviderConfigs] = useState([]);
  const [selectedPaymentProviderKey, setSelectedPaymentProviderKey] = useState('stripe');
  const [selectedSocialProviderKey, setSelectedSocialProviderKey] = useState('youtube');
  const [paymentProviderForm, setPaymentProviderForm] = useState(() => createPaymentProviderDraft(getProviderConfig('stripe')));
  const [paymentConfigEditing, setPaymentConfigEditing] = useState(false);



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
      if (cat.id === INTEGRATION_CATEGORIES.LLMS) count = aiProviderConfigs.filter((provider) => provider.enabled || provider.apiKeyPresent || provider.baseUrl).length;
      if (cat.id === INTEGRATION_CATEGORIES.DATA_STORES) count = dataStoreProviderConfigs.length;
      if (cat.id === INTEGRATION_CATEGORIES.MEDIA) count = mediaProviderConfigs.length;
      if (cat.id === INTEGRATION_CATEGORIES.PAYMENTS) count = paymentProviderConfigs.length;
      if (cat.id === INTEGRATION_CATEGORIES.SOCIAL_NETWORKS) count = socialProviderConfigs.filter((p) => p.enabled || p.configured).length;
      // SMS and Tracking are currently placeholders/empty in this version
      if (cat.id === INTEGRATION_CATEGORIES.SMS || cat.id === INTEGRATION_CATEGORIES.TRACKING) count = 0;
      
      return { ...cat, providerCount: count };
    });
  }, [automationProviderConfigs, mailboxes, configuredEmailVerifierCount, standardCalendarSources, videoConferencingSources, aiProviderConfigs, dataStoreProviderConfigs, mediaProviderConfigs, paymentProviderConfigs]);

  const selectedAiProviderConfig = useMemo(
    () => aiProviderConfigs.find((provider) => provider.providerKey === selectedAiProviderKey) || null,
    [aiProviderConfigs, selectedAiProviderKey]
  );

  useEffect(() => {
    setActiveCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    const scopedProviders = getProvidersByCategory(activeCategory);
    if (!scopedProviders.some((provider) => provider.id === selectorProviderKey)) {
      setSelectorProviderKey(null);
    }
  }, [activeCategory, selectorProviderKey]);

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
      const data = await getMailboxesApi();
      setMailboxes((data || []).map(camelizeData).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
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
      setEmailVerifierConfig(camelizeData(await getEmailVerifierConfigApi()));
    } catch (error) {
      nextNotice = { tone: 'error', message: readErrorMessage(error) };
      setEmailVerifierConfig(null);
    }

    try {
      const data = await getCalendarSourcesApi();
      setCalendarSources((data || []).map(camelizeData).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
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
      setAiProviderConfigs((await getAiProviderConfigsApi()).map((provider) => normalizeAiProviderConfigRecord(camelizeData(provider))));
    } catch (error) {
      nextNotice = { tone: 'error', message: readErrorMessage(error) };
      setAiProviderConfigs([]);
    }

    try {
      setDataStoreProviderConfigs((await getDataStoreProviderConfigsApi()).map(camelizeData));
    } catch (error) {
      nextNotice = { tone: 'error', message: readErrorMessage(error) };
      setDataStoreProviderConfigs([]);
    }

    try {
      setMediaProviderConfigs((await getMediaProviderConfigsApi()).map(camelizeData));
    } catch (error) {
      nextNotice = { tone: 'error', message: readErrorMessage(error) };
      setMediaProviderConfigs([]);
    }

    try {
      setPaymentProviderConfigs((await getPaymentProviderConfigsApi()).map(camelizeData));
    } catch (error) {
      setPaymentProviderConfigs([]);
    }

    try {
      setSocialProviderConfigs((await getSocialProviderConfigsApi()).map(camelizeData));
    } catch (error) {
      setSocialProviderConfigs([]);
    }

    showNotice(nextNotice);
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
    const defaultProvider = aiProviderConfigs.find((provider) => provider.isDefault)?.providerKey;
    if (defaultProvider && defaultProvider !== selectedAiProviderKey) {
      setSelectedAiProviderKey(defaultProvider);
      return;
    }
    if (!aiProviderCatalog.some((provider) => (provider.id || provider.key) === selectedAiProviderKey)) {
      setSelectedAiProviderKey(aiProviderCatalog[0].id || aiProviderCatalog[0].key);
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
        showNotice({ tone: 'error', message: readErrorMessage(error) });
      }
      return [];
    } finally {
      setCalendarOptionsLoading(false);
    }
  };

  const selectedAiProviderCatalog = useMemo(
    () => aiProviderCatalog.find((provider) => (provider.id || provider.key) === selectedAiProviderKey) || aiProviderCatalog[0],
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
    () => automationProviderConfigs.find((provider) => provider.providerKey === selectedAutomationProviderKey) || null,
    [automationProviderConfigs, selectedAutomationProviderKey]
  );
  const selectedAutomationProviderStateMeta = useMemo(
    () => getAutomationProviderStateMeta(selectedAutomationProviderConfig, selectedAutomationProviderCatalog),
    [selectedAutomationProviderCatalog, selectedAutomationProviderConfig]
  );

  const paymentProviderCatalog = useMemo(
    () => getProvidersByCategory(INTEGRATION_CATEGORIES.PAYMENTS),
    []
  );

  const selectedPaymentProviderCatalog = useMemo(
    () => paymentProviderCatalog.find((provider) => provider.id === selectedPaymentProviderKey) || paymentProviderCatalog[0] || null,
    [paymentProviderCatalog, selectedPaymentProviderKey]
  );

  const dataStoreProviderCatalog = useMemo(
    () => getProvidersByCategory(INTEGRATION_CATEGORIES.DATA_STORES),
    []
  );

  const selectedDataStoreProviderCatalog = useMemo(
    () => dataStoreProviderCatalog.find((provider) => provider.id === selectedDataStoreProviderKey) || dataStoreProviderCatalog[0] || null,
    [dataStoreProviderCatalog, selectedDataStoreProviderKey]
  );

  const selectedDataStoreProviderConfig = useMemo(
    () => dataStoreProviderConfigs.find((provider) => provider.providerKey === selectedDataStoreProviderKey) || null,
    [dataStoreProviderConfigs, selectedDataStoreProviderKey]
  );

  const mediaProviderCatalog = useMemo(
    () => getProvidersByCategory(INTEGRATION_CATEGORIES.MEDIA),
    []
  );

  const selectedMediaProviderCatalog = useMemo(
    () => mediaProviderCatalog.find((provider) => provider.id === selectedMediaProviderKey) || mediaProviderCatalog[0] || null,
    [mediaProviderCatalog, selectedMediaProviderKey]
  );

  const selectedMediaProviderConfig = useMemo(
    () => mediaProviderConfigs.find((provider) => resolveMediaSelectorProvider(provider.providerKey) === selectedMediaProviderKey) || null,
    [mediaProviderConfigs, selectedMediaProviderKey]
  );

  const selectedPaymentProviderConfig = useMemo(
    () => paymentProviderConfigs.find((provider) => provider.providerKey === selectedPaymentProviderKey) || null,
    [paymentProviderConfigs, selectedPaymentProviderKey]
  );

  const selectedSelectorProviderKey = useMemo(() => {
    if (activeCategory === INTEGRATION_CATEGORIES.AUTOMATION) return selectedAutomationProviderKey;
    if (activeCategory === INTEGRATION_CATEGORIES.LLMS) return selectedAiProviderKey;
    if (activeCategory === INTEGRATION_CATEGORIES.DATA_STORES) return selectedDataStoreProviderKey;
    if (activeCategory === INTEGRATION_CATEGORIES.MEDIA) return selectedMediaProviderKey;
    if (activeCategory === INTEGRATION_CATEGORIES.PAYMENTS) return selectedPaymentProviderKey;
    if (activeCategory === INTEGRATION_CATEGORIES.EMAIL) {
      if (showMailboxComposer) return resolveEmailSelectorProvider(mailboxDraft.provider);
      return resolveEmailSelectorProvider(selectedMailbox?.provider || selectorProviderKey);
    }
    if (activeCategory === INTEGRATION_CATEGORIES.CALENDAR || activeCategory === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING) {
      if (showCalendarComposer) return resolveCalendarSelectorProvider(calendarSourceDraft.provider);
      return resolveCalendarSelectorProvider(selectedCalendarSource?.provider || selectorProviderKey);
    }
    return selectorProviderKey;
  }, [
    activeCategory,
    calendarSourceDraft.provider,
    mailboxDraft.provider,
    selectedAiProviderKey,
    selectedAutomationProviderKey,
    selectedDataStoreProviderKey,
    selectedMediaProviderKey,
    selectedCalendarSource?.provider,
    selectedMailbox?.provider,
    selectedPaymentProviderKey,
    selectorProviderKey,
    showCalendarComposer,
    showMailboxComposer,
  ]);

  useEffect(() => {
    const paymentProviders = getProvidersByCategory(INTEGRATION_CATEGORIES.PAYMENTS);
    if (!paymentProviders.length) return;
    if (!paymentProviders.some((provider) => provider.id === selectedPaymentProviderKey)) {
      setSelectedPaymentProviderKey(paymentProviders[0].id);
    }
  }, [selectedPaymentProviderKey]);

  useEffect(() => {
    const mediaProviders = getProvidersByCategory(INTEGRATION_CATEGORIES.MEDIA);
    if (!mediaProviders.length) return;
    if (!mediaProviders.some((provider) => provider.id === selectedMediaProviderKey)) {
      setSelectedMediaProviderKey(mediaProviders[0].id);
    }
  }, [selectedMediaProviderKey]);

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
      publishableKey: existing.publishableKey || selectedPaymentProviderCatalog.fields?.find((field) => field.name === 'publishableKey')?.default || '',
      secretKey: '',
      webhookSecret: existing.webhookSecret || existing.config?.webhookSecret || '',
      enabled: existing.enabled,
      config: existing.config || {},
    });
  }, [selectedPaymentProviderCatalog, selectedPaymentProviderConfig]);

  useEffect(() => {
    if (!selectedDataStoreProviderCatalog) {
      setDataStoreProviderForm(createDataStoreProviderDraft());
      return;
    }

    const existing = selectedDataStoreProviderConfig;
    if (!existing) {
      setDataStoreProviderForm(createDataStoreProviderDraft(selectedDataStoreProviderCatalog));
      return;
    }

    setDataStoreProviderForm((current) => ({
      ...createDataStoreProviderDraft(selectedDataStoreProviderCatalog),
      label: current?.label || selectedDataStoreProviderCatalog.name,
      baseUrl: existing.baseUrl || selectedDataStoreProviderCatalog.fields?.find((field) => field.name === 'baseUrl')?.default || '',
      enabled: true,
      apiKey: '',
    }));
  }, [selectedDataStoreProviderCatalog, selectedDataStoreProviderConfig]);

  useEffect(() => {
    if (!selectedMediaProviderCatalog) {
      setMediaProviderForm(createMediaProviderDraft());
      return;
    }

    const existing = selectedMediaProviderConfig;
    if (!existing) {
      setMediaProviderForm(createMediaProviderDraft(selectedMediaProviderCatalog));
      return;
    }

    setMediaProviderForm((current) => ({
      ...createMediaProviderDraft(selectedMediaProviderCatalog),
      label: current?.label || existing.label || selectedMediaProviderCatalog.name,
      baseUrl: existing.baseUrl || selectedMediaProviderCatalog.fields?.find((field) => field.name === 'baseUrl')?.default || '',
      enabled: Boolean(existing.enabled),
      apiKey: '',
      config: {
        ...createMediaProviderDraft(selectedMediaProviderCatalog).config,
        ...(existing.config || {}),
      },
    }));
  }, [selectedMediaProviderCatalog, selectedMediaProviderConfig]);

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
      syncDirection: selectedCalendarSource.syncDirection || 'two-way',
      config: {
        authorityMode: selectedCalendarSource.authorityMode || selectedCalendarSource.config?.authorityMode || 'local-first',
        importPolicy: selectedCalendarSource.importPolicy || selectedCalendarSource.config?.importPolicy || 'review',
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
    
    const config = existing.config || {};
    setAiProviderForm({
      baseUrl: existing.baseUrl || config.baseUrl || catalogEntry.defaultBaseUrl || '',
      model: existing.model || config.model || catalogEntry.model || catalogEntry.defaultModel || '',
      apiKey: '',
      temperature: config.temperature || '0.2',
      username: config.username || '',
      password: '',
      systemGuardrails: existing.systemGuardrails || config.systemGuardrails || '',
      taskGuardrails: existing.taskGuardrails || config.taskGuardrails || '',
      siteUrl: config.siteUrl || '',
      appName: config.appName || 'AIO CRM',
      enabled: !!existing.enabled,
      isDefault: !!existing.isDefault,
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
        inboundWebhookUrl: existing.config?.inboundWebhookUrl || '',
        outboundWebhookUrl: existing.config?.outboundWebhookUrl || '',
        signingSecret: existing.config?.signingSecret || '',
        projectId: existing.config?.projectId || '',
        teamId: existing.config?.teamId || '',
      },
    });
  }, [selectedAutomationProviderCatalog, selectedAutomationProviderConfig]);

  useEffect(() => {
    setAutomationConfigEditing(!selectedAutomationProviderConfig);
  }, [selectedAutomationProviderKey, selectedAutomationProviderConfig]);

  useEffect(() => {
    setDataStoreConfigEditing(!selectedDataStoreProviderConfig);
  }, [selectedDataStoreProviderConfig, selectedDataStoreProviderKey]);

  useEffect(() => {
    setMediaConfigEditing(!selectedMediaProviderConfig);
  }, [selectedMediaProviderConfig, selectedMediaProviderKey]);

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
        baseUrl: preferredBaseUrl || aiProviderForm.baseUrl || (aiProviderCatalog.find((provider) => provider.id === 'ollama') || {}).defaultBaseUrl,
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
          baseUrl: aiProviderForm.baseUrl || (aiProviderCatalog.find((provider) => provider.id === 'ollama') || {}).defaultBaseUrl,
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
    (field) => !(isCalendarOauthProvider(calendarSourceForm.provider) && field.key === 'calendarId')
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
  const dataStoreConfigLocked = !!selectedDataStoreProviderConfig && !dataStoreConfigEditing;
  const paymentConfigLocked = !!selectedPaymentProviderConfig && !paymentConfigEditing;
  const hasProviderSelected = !!(selectedAutomationProviderConfig || selectedAiProviderConfig || selectedDataStoreProviderConfig || selectedMediaProviderConfig || selectedPaymentProviderConfig || selectedMailbox || selectedCalendarSource);
  const showSplash = !activeCategory || !selectorProviderKey;
  const currentCategory = categories.find((category) => category.id === activeCategory);
  const currentCategoryIntegrations = integrations.filter((integration) => integration.category === activeCategory);
  const selectedLegacyProvider = useMemo(() => {
    if (!selectedSelectorProviderKey) return null;
    if (
      activeCategory === INTEGRATION_CATEGORIES.AUTOMATION ||
      activeCategory === INTEGRATION_CATEGORIES.EMAIL ||
      activeCategory === INTEGRATION_CATEGORIES.CALENDAR ||
      activeCategory === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING ||
      activeCategory === INTEGRATION_CATEGORIES.LLMS ||
      activeCategory === INTEGRATION_CATEGORIES.DATA_STORES ||
      activeCategory === INTEGRATION_CATEGORIES.PAYMENTS
    ) {
      return null;
    }
    return getProviderConfig(selectedSelectorProviderKey);
  }, [activeCategory, selectedSelectorProviderKey]);
  const stagedLegacyProvider = useMemo(() => {
    const stagedProviderKey = legacyActivationSelections[activeCategory];
    return stagedProviderKey ? getProviderConfig(stagedProviderKey) : null;
  }, [activeCategory, legacyActivationSelections]);
  const hasSelectedLegacyIntegration = useMemo(
    () => (
      !!selectedLegacyProvider
      && currentCategoryIntegrations.some((integration) => integration.providerId === selectedLegacyProvider.id)
    ),
    [currentCategoryIntegrations, selectedLegacyProvider]
  );
  const hasStagedLegacyIntegration = useMemo(
    () => (
      !!stagedLegacyProvider
      && currentCategoryIntegrations.some((integration) => integration.providerId === stagedLegacyProvider.id)
    ),
    [currentCategoryIntegrations, stagedLegacyProvider]
  );

  const handleSelectorCategoryChange = (categoryId) => {
    setActiveCategory(categoryId);
  };

  const handleSelectorProviderSelect = (providerId, categoryId = activeCategory) => {
    if (categoryId && categoryId !== activeCategory) {
      setActiveCategory(categoryId);
    }
    setSelectorProviderKey(providerId);

    if (categoryId === INTEGRATION_CATEGORIES.AUTOMATION) {
      setSelectedAutomationProviderKey(providerId);
      return;
    }

    if (categoryId === INTEGRATION_CATEGORIES.LLMS) {
      setSelectedAiProviderKey(providerId);
      return;
    }

    if (categoryId === INTEGRATION_CATEGORIES.DATA_STORES) {
      setSelectedDataStoreProviderKey(providerId);
      return;
    }

    if (categoryId === INTEGRATION_CATEGORIES.MEDIA) {
      setSelectedMediaProviderKey(providerId);
      return;
    }

    if (categoryId === INTEGRATION_CATEGORIES.PAYMENTS) {
      setSelectedPaymentProviderKey(providerId);
      return;
    }

    if (categoryId === INTEGRATION_CATEGORIES.EMAIL) {
      const runtimeProviderId = resolveEmailRuntimeProvider(providerId);
      setShowMailboxComposer(true);
      setMailboxDraft(createMailboxDraft(runtimeProviderId));
      return;
    }

    if (categoryId === INTEGRATION_CATEGORIES.CALENDAR || categoryId === INTEGRATION_CATEGORIES.VIDEO_CONFERENCING) {
      const runtimeProviderId = resolveCalendarRuntimeProvider(providerId);
      setShowCalendarComposer(true);
      setCalendarSourceDraft(createCalendarSourceDraft(runtimeProviderId));
    }
  };

  const handleActivateLegacyProvider = () => {
    if (!selectedLegacyProvider || !currentCategory) return;
    setLegacyActivationSelections((current) => ({
      ...current,
      [activeCategory]: selectedLegacyProvider.id,
    }));
    showNotice({
      tone: 'success',
      message: `${selectedLegacyProvider.name} is now locked in as the pending ${currentCategory.name.toLowerCase()} activation.`,
    });
  };

  const handleToggleIntegration = async (integrationId) => {
    showNotice({ tone: 'warning', message: 'Legacy integration toggles are disabled until backed by workspace APIs.' });
  };

  const handleRemoveIntegration = async (integrationId) => {
    if (!window.confirm('Delete this integration?')) return;
    showNotice({ tone: 'warning', message: 'Legacy integration removal is disabled until backed by workspace APIs.' });
  };

  const handleSaveMailbox = async () => {
    if (!selectedMailbox?.id) return;
    if (selectedMailboxStateMeta.saveDisabled) {
      showNotice({ tone: selectedMailboxStateMeta.tone, message: selectedMailboxStateMeta.detail });
      return;
    }
    try {
      await updateMailboxApi(selectedMailbox.id, mailboxForm);
      setMailboxConfigEditing(false);
      showNotice({ tone: 'success', message: 'Mailbox saved.' });
      triggerSavedAction('mailbox-save');
      loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
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
      showNotice({ tone: 'success', message: 'Mailbox created.' });
      setShowMailboxComposer(false);
      setMailboxDraft(createMailboxDraft());
      await loadAll();
      setSelectedMailboxId(mailbox?.id || null);
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSaveEmailVerifier = async () => {
    try {
      const currentApiKey = emailVerifierForm.apiKey || emailVerifierConfig?.apiKey || '';
      const hasNewApiKey = emailVerifierForm.apiKey && emailVerifierForm.apiKey.length > 0;
      const shouldAutoEnable = hasNewApiKey && !emailVerifierForm.enabled;
      const saved = await updateEmailVerifierConfigApi({
        apiKey: currentApiKey,
        enabled: shouldAutoEnable ? true : (emailVerifierForm.enabled || false),
        autoVerifyContacts: !!emailVerifierForm.autoVerifyContacts,
        defaultMode: emailVerifierForm.defaultMode,
      });
      setEmailVerifierConfig(saved);
      setEmailVerifierForm(createEmailVerifierDraft(saved || {}));
      setEmailVerifierConfigEditing(false);
      setSelectedEmailResourceId(EMAIL_VERIFIER_RESOURCE_ID);
      showNotice({
        tone: 'success',
        message: `Reoon ${emailVerifierConfig?.hasApiKey ? 'saved' : 'activated'} for this workspace.`,
      });
      triggerSavedAction('email-verifier-save');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestEmailVerifier = async () => {
    setBusyAction('email-verifier-test');
    try {
      const currentApiKey = emailVerifierForm.apiKey || emailVerifierConfig?.apiKey || '';
      if (currentApiKey) {
        const hasNewApiKey = emailVerifierForm.apiKey && emailVerifierForm.apiKey.length > 0;
        const shouldAutoEnable = hasNewApiKey && !emailVerifierForm.enabled;
        const saved = await updateEmailVerifierConfigApi({
          apiKey: currentApiKey,
          enabled: shouldAutoEnable ? true : (emailVerifierForm.enabled || false),
          autoVerifyContacts: !!emailVerifierForm.autoVerifyContacts,
          defaultMode: emailVerifierForm.defaultMode,
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
      showNotice({ tone: 'success', message: response?.result?.message || 'Reoon connection verified.' });
      triggerSavedAction('email-verifier-test');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
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
      showNotice({ tone: 'success', message: 'Reoon disconnected.' });
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleAuthorizeMailbox = async () => {
    if (!selectedMailbox?.id || !isMailboxOauthProvider(mailboxForm.provider)) return;
    try {
      await updateMailboxApi(selectedMailbox.id, mailboxForm);
      const authorizeUrl = await getMailboxAuthorizeUrl(selectedMailbox.id);
      if (!authorizeUrl) {
        throw new Error('Failed to get authorization URL');
      }
      const result = await openOAuthPopup(authorizeUrl, 'mailbox');
      showNotice({ tone: 'success', message: `${selectedMailbox.name} connected via ${result.provider || selectedMailboxProvider.label}.` });
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestMailbox = async () => {
    if (!selectedMailbox?.id) return;
    if (selectedMailboxStateMeta.authActionsDisabled) {
      showNotice({ tone: selectedMailboxStateMeta.tone, message: selectedMailboxStateMeta.detail });
      return;
    }
    setBusyAction('mailbox-test');
    try {
      await updateMailboxApi(selectedMailbox.id, mailboxForm);
      const response = await testMailboxConnectionApi(selectedMailbox.id);
      showNotice({ tone: response?.result?.status === 'ok' ? 'success' : 'warning', message: response?.result?.message || 'Mailbox test completed.' });
      triggerSavedAction('mailbox-test');
      loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyAction('');
    }
  };

  const handleSyncMailbox = async () => {
    if (!selectedMailbox?.id) return;
    if (selectedMailboxStateMeta.authActionsDisabled) {
      showNotice({ tone: selectedMailboxStateMeta.tone, message: selectedMailboxStateMeta.detail });
      return;
    }
    try {
      const response = await syncMailboxApi(selectedMailbox.id);
      showNotice({ tone: 'success', message: response?.result?.message || 'Mailbox synced.' });
      loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleDeleteMailbox = async () => {
    if (!selectedMailbox?.id) return;
    if (mailboxes.length <= 1) {
      showNotice({ tone: 'warning', message: 'You need to keep at least one mailbox.' });
      return;
    }
    const fallbackMailbox = mailboxDeleteTarget;
    const fallbackLabel = fallbackMailbox?.name ? ` Threads will move to ${fallbackMailbox.name}.` : '';
    if (!window.confirm(`Delete ${selectedMailbox.name}?${fallbackLabel}`)) return;
    try {
      const response = camelizeData(await deleteMailboxApi(selectedMailbox.id, fallbackMailbox?.id));
      showNotice({
        tone: 'success',
        message: `${response?.deletedMailboxName || selectedMailbox.name} deleted.${response?.reassignedThreads ? ` ${response.reassignedThreads} thread(s) moved to ${response?.fallbackMailboxName || fallbackMailbox?.name}.` : ''}`
      });
      await loadAll();
      setSelectedMailboxId(response?.fallbackMailboxId || fallbackMailbox?.id || null);
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleDisconnectMailbox = async () => {
    if (!selectedMailbox?.id) return;
    if (selectedMailboxStateMeta.authActionsDisabled) {
      showNotice({ tone: selectedMailboxStateMeta.tone, message: selectedMailboxStateMeta.detail });
      return;
    }
    if (!window.confirm(`Disconnect ${selectedMailbox.name}? OAuth/session state will be cleared and the mailbox will require reconnect before use.`)) return;
    try {
      const response = await disconnectMailboxApi(selectedMailbox.id);
      showNotice({ tone: 'success', message: `${response?.mailbox?.name || selectedMailbox.name} disconnected.` });
      await loadAll();
      setSelectedMailboxId(selectedMailbox.id);
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSaveCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    if (selectedCalendarSourceStateMeta.saveDisabled) {
      showNotice({ tone: selectedCalendarSourceStateMeta.tone, message: selectedCalendarSourceStateMeta.detail });
      return;
    }
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, calendarSourceForm);
      setCalendarConfigEditing(false);
      showNotice({ tone: 'success', message: 'Calendar source saved.' });
      triggerSavedAction('calendar-save');
      await loadAll();
      await loadCalendarOptions(selectedCalendarSource.id);
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleCreateCalendarSource = async () => {
    if (!calendarSourceDraft.name.trim()) return;
    try {
      const source = await createCalendarSourceApi(calendarSourceDraft);
      showNotice({ tone: 'success', message: 'Calendar source created.' });
      setShowCalendarComposer(false);
      setCalendarSourceDraft(createCalendarSourceDraft());
      await loadAll();
      setSelectedCalendarSourceId(source?.id || null);
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleAuthorizeCalendarSource = async () => {
    if (!selectedCalendarSource?.id || !isCalendarOauthProvider(calendarSourceForm.provider)) return;
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, calendarSourceForm);
      const authorizeUrl = await getCalendarSourceAuthorizeUrl(selectedCalendarSource.id);
      if (!authorizeUrl) {
        throw new Error('Failed to get authorization URL');
      }
      const result = await openOAuthPopup(authorizeUrl, 'calendar');
      showNotice({
        tone: 'success',
        message: result?.calendarSelectionRequired
          ? `${selectedCalendarSource.name} connected via ${result.provider || selectedCalendarProvider.label}. Select the active calendar before testing or sync.`
          : `${selectedCalendarSource.name} connected via ${result.provider || selectedCalendarProvider.label}.`
      });
      await loadAll();
      await loadCalendarOptions(selectedCalendarSource.id);
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    if (selectedCalendarSourceStateMeta.authActionsDisabled) {
      showNotice({ tone: selectedCalendarSourceStateMeta.tone, message: selectedCalendarSourceStateMeta.detail });
      return;
    }
    setBusyAction('calendar-test');
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, calendarSourceForm);
      const response = await testCalendarSourceApi(selectedCalendarSource.id);
      showNotice({ tone: 'success', message: response?.result?.message || 'Calendar source tested.' });
      triggerSavedAction('calendar-test');
      await loadAll();
      await loadCalendarOptions(selectedCalendarSource.id);
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyAction('');
    }
  };

  const handleSyncCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    if (selectedCalendarSourceStateMeta.authActionsDisabled) {
      showNotice({ tone: selectedCalendarSourceStateMeta.tone, message: selectedCalendarSourceStateMeta.detail });
      return;
    }
    try {
      const response = await syncCalendarSourceApi(selectedCalendarSource.id);
      showNotice({ tone: 'success', message: response?.result?.message || 'Calendar source synced.' });
      loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleImportCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    if (selectedCalendarSourceStateMeta.authActionsDisabled) {
      showNotice({ tone: selectedCalendarSourceStateMeta.tone, message: selectedCalendarSourceStateMeta.detail });
      return;
    }
    try {
      const response = camelizeData(await importCalendarSourceApi(selectedCalendarSource.id));
      const conflicts = response?.result?.conflictedCount || 0;
      showNotice({
        tone: conflicts ? 'warning' : 'success',
        message: conflicts
          ? `${response?.result?.importedCount || 0} events imported. ${conflicts} need review.`
          : response?.result?.message || 'Calendar feed imported.'
      });
      loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleDeleteCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    const fallbackSource = calendarSourceDeleteTarget;
    const fallbackLabel = fallbackSource?.name ? ` Events will move to ${fallbackSource.name}.` : ' Events currently tied to it will become unscoped.';
    if (!window.confirm(`Delete ${selectedCalendarSource.name}?${fallbackLabel}`)) return;
    try {
      const response = camelizeData(await deleteCalendarSourceApi(selectedCalendarSource.id, fallbackSource?.id));
      showNotice({
        tone: 'success',
        message: `${response?.deletedSourceName || selectedCalendarSource.name} deleted.${response?.reassignedEvents ? ` ${response.reassignedEvents} event(s) moved to ${response?.fallbackSourceName || fallbackSource?.name}.` : response?.clearedEvents ? ` ${response.clearedEvents} event(s) were detached from that source.` : ''}`
      });
      await loadAll();
      setSelectedCalendarSourceId(response?.fallbackSourceId || fallbackSource?.id || null);
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleDisconnectCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    if (selectedCalendarSourceStateMeta.authActionsDisabled) {
      showNotice({ tone: selectedCalendarSourceStateMeta.tone, message: selectedCalendarSourceStateMeta.detail });
      return;
    }
    if (!window.confirm(`Disconnect ${selectedCalendarSource.name}? OAuth/feed sync state will be cleared and the source will require reconnect before use.`)) return;
    try {
      const response = await disconnectCalendarSourceApi(selectedCalendarSource.id);
      showNotice({ tone: 'success', message: `${response?.source?.name || selectedCalendarSource.name} disconnected.` });
      await loadAll();
      setCalendarOptions([]);
      setSelectedCalendarSourceId(selectedCalendarSource.id);
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSaveAiProvider = async () => {
    try {
      const providerKey = selectedAiProviderCatalog.id || selectedAiProviderCatalog.key;
      const providerLabel = selectedAiProviderCatalog.name || selectedAiProviderCatalog.label || selectedAiProviderCatalog.displayName || providerKey;
      const sanitizedConfig = sanitizeAiProviderConfig(aiProviderForm.config);
      await upsertAiProviderConfigApi(providerKey, {
        label: providerLabel,
        baseUrl: (aiProviderForm.baseUrl || '').trim(),
        model: (aiProviderForm.model || '').trim(),
        apiKey: aiProviderForm.apiKey || undefined,
        systemGuardrails: aiProviderForm.systemGuardrails || '',
        taskGuardrails: aiProviderForm.taskGuardrails || '',
        enabled: !!aiProviderForm.enabled,
        isDefault: !!aiProviderForm.isDefault,
        config: {
          ...sanitizedConfig,
          temperature: aiProviderForm.temperature || '0.2',
          username: aiProviderForm.username || '',
          password: aiProviderForm.password || undefined,
          siteUrl: aiProviderForm.siteUrl || '',
          appName: aiProviderForm.appName || 'AIO CRM',
        },
      });
      setAiProviderConfigEditing(false);
      showNotice({ tone: 'success', message: `${selectedAiProviderCatalog.displayName || selectedAiProviderCatalog.label} saved.` });
      triggerSavedAction('ai-provider-save');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestAiProvider = async () => {
    setBusyAction('ai-provider-test');
    try {
      const providerKey = selectedAiProviderCatalog.id || selectedAiProviderCatalog.key;
      const providerLabel = selectedAiProviderCatalog.name || selectedAiProviderCatalog.label || selectedAiProviderCatalog.displayName || providerKey;
      const sanitizedConfig = sanitizeAiProviderConfig(aiProviderForm.config);
      const saved = await upsertAiProviderConfigApi(providerKey, {
        label: providerLabel,
        baseUrl: (aiProviderForm.baseUrl || '').trim(),
        model: (aiProviderForm.model || '').trim(),
        apiKey: aiProviderForm.apiKey || undefined,
        systemGuardrails: aiProviderForm.systemGuardrails || '',
        taskGuardrails: aiProviderForm.taskGuardrails || '',
        enabled: !!aiProviderForm.enabled,
        isDefault: !!aiProviderForm.isDefault,
        config: {
          ...sanitizedConfig,
          temperature: aiProviderForm.temperature || '0.2',
          username: aiProviderForm.username || '',
          password: aiProviderForm.password || undefined,
          siteUrl: aiProviderForm.siteUrl || '',
          appName: aiProviderForm.appName || 'AIO CRM',
        },
      });
      const response = await testAiProviderConfigApi(saved.id);
      showNotice({ tone: 'success', message: response?.result?.message || 'AI provider test completed.' });
      triggerSavedAction('ai-provider-test');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteAiProvider = async () => {
    if (!selectedAiProviderConfig?.id) return;
    if (!window.confirm(`Disconnect ${selectedAiProviderCatalog.label}? Saved credentials and runtime preference will be removed for this workspace.`)) return;
    try {
      await deleteAiProviderConfigApi(selectedAiProviderConfig.id);
      showNotice({ tone: 'success', message: `${selectedAiProviderCatalog.displayName || selectedAiProviderCatalog.label} removed from this workspace.` });
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
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
      showNotice({
        tone: 'success',
        message: `${selectedAutomationProviderCatalog.name} ${selectedAutomationProviderConfig ? 'saved' : 'activated'} for this workspace.`,
      });
      triggerSavedAction('automation-save');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
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
      showNotice({ tone: 'success', message: response?.result?.message || 'Automation provider test completed.' });
      triggerSavedAction('automation-test');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteAutomationProvider = async () => {
    if (!selectedAutomationProviderConfig?.id) return;
    if (!window.confirm(`Disconnect ${selectedAutomationProviderCatalog?.name || 'this automation provider'} from this workspace?`)) return;
    try {
      await deleteAutomationProviderConfigApi(selectedAutomationProviderConfig.id);
      showNotice({ tone: 'success', message: `${selectedAutomationProviderCatalog?.name || 'Automation provider'} removed from this workspace.` });
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSavePaymentProvider = async () => {
    if (!selectedPaymentProviderCatalog?.id) return;
    try {
      const payload = {
        label: (paymentProviderForm.label || selectedPaymentProviderCatalog.name).trim(),
        publishableKey: (paymentProviderForm.publishableKey || '').trim(),
        secretKey: paymentProviderForm.secretKey || undefined,
        webhookSecret: (paymentProviderForm.webhookSecret || '').trim(),
        enabled: !!paymentProviderForm.enabled,
        config: paymentProviderForm.config || {},
      };
      await upsertPaymentProviderConfigApi(selectedPaymentProviderCatalog.id, payload);
      setPaymentConfigEditing(false);
      showNotice({ tone: 'success', message: `${selectedPaymentProviderCatalog.name} payment settings saved.` });
      triggerSavedAction('payment-save');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleDeletePaymentProvider = async () => {
    if (!selectedPaymentProviderConfig?.id) return;
    if (!window.confirm(`Disconnect ${selectedPaymentProviderCatalog?.name || 'this payment provider'} from this workspace?`)) return;
    try {
      await deletePaymentProviderConfigApi(selectedPaymentProviderConfig.id);
      showNotice({ tone: 'success', message: `${selectedPaymentProviderCatalog?.name || 'Payment provider'} removed from this workspace.` });
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  // Social Networks state
  const [socialConfigEditing, setSocialConfigEditing] = useState(false);
  const [socialProviderForm, setSocialProviderForm] = useState({ label: '', enabled: false });
  const socialProviderCatalog = useMemo(
    () => getProvidersByCategory(INTEGRATION_CATEGORIES.SOCIAL_NETWORKS).find((p) => p.id === selectedSocialProviderKey) || getProvidersByCategory(INTEGRATION_CATEGORIES.SOCIAL_NETWORKS)[0] || null,
    [selectedSocialProviderKey]
  );
  const selectedSocialProviderConfig = useMemo(
    () => socialProviderConfigs.find((p) => p.providerKey === selectedSocialProviderKey) || null,
    [socialProviderConfigs, selectedSocialProviderKey]
  );
  useEffect(() => {
    if (selectedSocialProviderConfig) {
      setSocialProviderForm({
        label: selectedSocialProviderConfig.label || '',
        enabled: !!selectedSocialProviderConfig.enabled,
        ...(selectedSocialProviderConfig.config || {}),
      });
    } else {
      const defaults = {};
      (socialProviderCatalog?.fields || []).forEach(f => { if (f.default !== undefined) defaults[f.name] = f.default; });
      setSocialProviderForm({ label: socialProviderCatalog?.name || '', enabled: false, ...defaults });
    }
    setSocialConfigEditing(false);
  }, [selectedSocialProviderKey, selectedSocialProviderConfig]);

  const handleSaveSocialProvider = async () => {
    if (!socialProviderCatalog?.id) return;
    try {
      const fieldNames = (socialProviderCatalog.fields || []).map(f => f.name);
      const config = {};
      fieldNames.forEach(name => {
        if (socialProviderForm[name] !== undefined) config[name] = socialProviderForm[name];
      });
      const payload = {
        label: (socialProviderForm.label || socialProviderCatalog.name).trim(),
        enabled: !!socialProviderForm.enabled,
        config,
      };
      await upsertSocialProviderConfigApi(socialProviderCatalog.id, payload);
      setSocialConfigEditing(false);
      showNotice({ tone: 'success', message: `${socialProviderCatalog.name} social settings saved.` });
      triggerSavedAction('social-save');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSaveDataStoreProvider = async () => {
    if (!selectedDataStoreProviderCatalog?.id) return;
    try {
      await upsertDataStoreProviderConfigApi(selectedDataStoreProviderCatalog.id, {
        label: (dataStoreProviderForm.label || selectedDataStoreProviderCatalog.name).trim(),
        baseUrl: (dataStoreProviderForm.baseUrl || '').trim(),
        apiKey: dataStoreProviderForm.apiKey || undefined,
        enabled: !!dataStoreProviderForm.enabled,
        config: dataStoreProviderForm.config || {},
      });
      setDataStoreConfigEditing(false);
      showNotice({
        tone: 'success',
        message: `${selectedDataStoreProviderCatalog.name} ${selectedDataStoreProviderConfig ? 'saved' : 'activated'} for this workspace.`,
      });
      triggerSavedAction('data-store-save');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestDataStoreProvider = async () => {
    if (!selectedDataStoreProviderCatalog?.id) return;
    setBusyAction('data-store-test');
    try {
      await upsertDataStoreProviderConfigApi(selectedDataStoreProviderCatalog.id, {
        label: (dataStoreProviderForm.label || selectedDataStoreProviderCatalog.name).trim(),
        baseUrl: (dataStoreProviderForm.baseUrl || '').trim(),
        apiKey: dataStoreProviderForm.apiKey || undefined,
        enabled: !!dataStoreProviderForm.enabled,
        config: dataStoreProviderForm.config || {},
      });
      const response = await testDataStoreProviderConfigApi(selectedDataStoreProviderCatalog.id);
      showNotice({
        tone: response?.lastError ? 'warning' : 'success',
        message: response?.lastError || `${selectedDataStoreProviderCatalog.name} connection verified.`,
      });
      triggerSavedAction('data-store-test');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteDataStoreProvider = async () => {
    if (!selectedDataStoreProviderConfig?.providerKey) return;
    if (!window.confirm(`Disconnect ${selectedDataStoreProviderCatalog?.name || 'this data store'} from this workspace?`)) return;
    try {
      await deleteDataStoreProviderConfigApi(selectedDataStoreProviderConfig.providerKey);
      setDataStoreConfigEditing(true);
      setDataStoreProviderForm(createDataStoreProviderDraft(selectedDataStoreProviderCatalog));
      showNotice({
        tone: 'success',
        message: `${selectedDataStoreProviderCatalog?.name || 'Data store'} removed from this workspace.`,
      });
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleSaveMediaProvider = async () => {
    if (!selectedMediaProviderCatalog?.id) return;
    try {
      await upsertMediaProviderConfigApi(resolveMediaRuntimeProvider(selectedMediaProviderCatalog.id), {
        label: (mediaProviderForm.label || selectedMediaProviderCatalog.name).trim(),
        baseUrl: (mediaProviderForm.baseUrl || '').trim(),
        apiKey: mediaProviderForm.apiKey || undefined,
        enabled: !!mediaProviderForm.enabled,
        config: mediaProviderForm.config || {},
      });
      setMediaConfigEditing(false);
      showNotice({
        tone: 'success',
        message: `${selectedMediaProviderCatalog.name} ${selectedMediaProviderConfig ? 'saved' : 'activated'} for this workspace.`,
      });
      triggerSavedAction('media-save');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const handleTestMediaProvider = async () => {
    if (!selectedMediaProviderCatalog?.id) return;
    setBusyAction('media-test');
    try {
      const saved = await upsertMediaProviderConfigApi(resolveMediaRuntimeProvider(selectedMediaProviderCatalog.id), {
        label: (mediaProviderForm.label || selectedMediaProviderCatalog.name).trim(),
        baseUrl: (mediaProviderForm.baseUrl || '').trim(),
        apiKey: mediaProviderForm.apiKey || undefined,
        enabled: !!mediaProviderForm.enabled,
        config: mediaProviderForm.config || {},
      });
      await testMediaProviderConfigApi(saved?.id || selectedMediaProviderConfig?.id);
      showNotice({
        tone: 'success',
        message: `${selectedMediaProviderCatalog.name} connection verified.`,
      });
      triggerSavedAction('media-test');
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteMediaProvider = async () => {
    if (!selectedMediaProviderConfig?.id) return;
    if (!window.confirm(`Disconnect ${selectedMediaProviderCatalog?.name || 'this media provider'} from this workspace?`)) return;
    try {
      await deleteMediaProviderConfigApi(selectedMediaProviderConfig.id);
      setMediaConfigEditing(true);
      setMediaProviderForm(createMediaProviderDraft(selectedMediaProviderCatalog));
      showNotice({
        tone: 'success',
        message: `${selectedMediaProviderCatalog?.name || 'Media provider'} removed from this workspace.`,
      });
      await loadAll();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    }
  };

  const renderAutomationAdmin = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1.75fr)_minmax(420px,2.25fr)]">
      <div className="space-y-2.5 overflow-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Automation Providers</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Hub-and-spoke automation systems with webhook ingress and egress.</div>
        </div>
        {automationProviderCatalog.map((provider) => {
          const config = automationProviderConfigs.find((item) => item.providerKey === provider.id);
          const providerStateMeta = getAutomationProviderStateMeta(config, provider);
          return (
            <ResourceCard
              key={provider.id}
              icon={Zap}
              logoId={provider.id}
              title={config?.label || provider.name}
              subtitle={provider.id}
              status={providerStateMeta.label}
              detail={providerStateMeta.detail}
              selected={selectedAutomationProviderKey === provider.id}
              onClick={() => setSelectedAutomationProviderKey(provider.id)}
              chips={[
                config?.enabled ? 'enabled' : 'disabled',
                config?.config?.outboundWebhookUrl ? 'outbound webhook' : 'no outbound hook',
                config?.config?.inboundWebhookUrl ? 'inbound webhook' : 'no inbound hook',
              ]}
            />
          );
        })}
      </div>

      <div className={compactPanelClass}>
        {selectedAutomationProviderCatalog ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Automation Control Plane</div>
                <h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{automationProviderForm.label || selectedAutomationProviderCatalog.name}</h3>
                <p className="mt-1.5 max-w-3xl text-sm text-[var(--color-text-secondary)]">{selectedAutomationProviderCatalog.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedAutomationProviderConfig ? <button onClick={() => setAutomationConfigEditing(true)} className={compactActionClass}>Edit</button> : null}
                <button onClick={handleTestAutomationProvider} className={saveButtonClassName(compactActionClass, savedAction === 'automation-test')}>
                  {busyAction === 'automation-test' ? 'Testing...' : savedAction === 'automation-test' ? 'Tested' : 'TEST CONNECT'}
                </button>
                <button onClick={handleSaveAutomationProvider} disabled={automationConfigLocked} className={saveButtonClassName("btn-toolbar-lead !px-3 !py-1.5 !text-xs", savedAction === 'automation-save')}>
                  {savedAction === 'automation-save' ? 'Saved' : selectedAutomationProviderConfig ? 'SAVE' : 'ADD ACTIVATION'}
                </button>
              </div>
            </div>

            <div className={compactMetaGridClass}>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedAutomationProviderStateMeta.label}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Runtime</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{automationProviderForm.enabled ? 'Enabled' : 'Disabled'}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-xs font-semibold text-[var(--color-text-primary)]">{selectedAutomationProviderConfig?.lastTestedAt ? new Date(selectedAutomationProviderConfig.lastTestedAt).toLocaleString() : 'Never'}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Delivery</div><div className="mt-1 text-xs font-semibold text-[var(--color-text-primary)]">{selectedAutomationProviderConfig?.config?.lastDeliveryAt ? new Date(selectedAutomationProviderConfig.config.lastDeliveryAt).toLocaleString() : 'No delivery yet'}</div></div>
            </div>

            {selectedAutomationProviderConfig?.lastError ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">{selectedAutomationProviderConfig.lastError}</div>
            ) : null}

            <fieldset disabled={automationConfigLocked} className="space-y-3 disabled:opacity-70">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Label</div><input value={automationProviderForm.label} onChange={(event) => setAutomationProviderForm((current) => ({ ...current, label: event.target.value }))} className={compactInputClass} /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Base URL</div><input value={automationProviderForm.baseUrl} onChange={(event) => setAutomationProviderForm((current) => ({ ...current, baseUrl: event.target.value }))} className={compactInputClass} /></label>
            </div>

            {selectedAutomationProviderCatalog.fields?.some((field) => field.name === 'apiKey') ? (
                  <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">API Key</div><input type="password" autoComplete="new-password" value={automationProviderForm.apiKey} onChange={(event) => setAutomationProviderForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder={selectedAutomationProviderConfig?.apiKeyPresent ? 'Saved in workspace config' : ''} className={compactInputClass} /></label>
            ) : null}

            <div className="grid gap-2.5 sm:grid-cols-2">
              {selectedAutomationProviderCatalog.fields?.filter((field) => !['label', 'baseUrl', 'apiKey'].includes(field.name)).map((field) => (
                <label key={field.name} className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div>
                  <input type={field.type === 'password' ? 'password' : 'text'} autoComplete={field.type === 'password' ? 'new-password' : undefined} value={automationProviderForm.config?.[field.name] || ''} onChange={(event) => setAutomationProviderForm((current) => ({ ...current, config: { ...(current.config || {}), [field.name]: event.target.value } }))} className={compactInputClass} />
                </label>
              ))}
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"><input type="checkbox" checked={!!automationProviderForm.enabled} onChange={(event) => setAutomationProviderForm((current) => ({ ...current, enabled: event.target.checked }))} /> Enable provider for this workspace</label>
            </fieldset>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">Keep automation systems as spokes around AIO CRM. Outbound tests will POST a sample event to the outbound webhook when present, otherwise they probe the base URL directly.</div>
            <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
              <SaveFeedbackNote visible={savedAction === 'automation-save'} label="Saved" />
              <SaveFeedbackNote visible={savedAction === 'automation-test'} label="Connection OK" />
            </div>
            {selectedAutomationProviderConfig ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-red-400 font-semibold">Danger Zone</div>
                <button onClick={handleDeleteAutomationProvider} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 transition"><Trash2 size={14} />Remove Automation Provider</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderEmailAdmin = () => (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1.75fr)_minmax(420px,2.25fr)]">
      {(() => {
        const emailVerifierStatusMeta = getEmailVerifierStatusMeta(emailVerifierConfig || {});
        const emailVerifierDetail = getEmailVerifierDetail(emailVerifierConfig || {});
        return (
          <>
      <div className="min-h-0 space-y-2.5 overflow-y-auto no-scrollbar pr-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Managed Mailboxes</div>
            <div className="text-sm text-[var(--color-text-secondary)]">Mailbox accounts and adjacent email infrastructure for sending, syncing, and verification.</div>
          </div>
          <button onClick={() => setShowMailboxComposer((current) => !current)} className={compactActionClass}>
            {showMailboxComposer ? 'Close' : 'Add Integration'}
          </button>
        </div>
        {showMailboxComposer ? (
          <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(15,23,42,0.22))] p-3 space-y-2.5">
            <div className="grid gap-2.5 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Mailbox Name</div><input value={mailboxDraft.name} onChange={(event) => setMailboxDraft((current) => ({ ...current, name: event.target.value }))} className={compactInputSecondaryClass} /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Address</div><input value={mailboxDraft.address} onChange={(event) => setMailboxDraft((current) => ({ ...current, address: event.target.value }))} className={compactInputSecondaryClass} /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><select value={mailboxDraft.provider} onChange={(event) => setMailboxDraft((current) => ({ ...current, provider: event.target.value, config: {} }))} className={compactInputSecondaryClass}>{mailboxProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
            </div>
            {mailboxDraftProvider.fields?.length ? (
              <div className="grid gap-2.5 sm:grid-cols-2 text-sm">
                {mailboxDraftProvider.fields.map((field) => (
                  <label key={field.key} className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div>
                    <input value={mailboxDraft.config?.[field.key] || ''} onChange={(event) => setMailboxDraft((current) => ({ ...current, config: { ...(current.config || {}), [field.key]: event.target.value } }))} className={compactInputSecondaryClass} />
                  </label>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3 text-sm text-[var(--color-text-secondary)]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={mailboxDraft.inboundEnabled} onChange={(event) => setMailboxDraft((current) => ({ ...current, inboundEnabled: event.target.checked }))} />Inbound enabled</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={mailboxDraft.outboundEnabled} onChange={(event) => setMailboxDraft((current) => ({ ...current, outboundEnabled: event.target.checked }))} />Outbound enabled</label>
            </div>
            <button onClick={handleCreateMailbox} disabled={!mailboxDraft.name.trim() || !mailboxDraft.address.trim()} className="btn-toolbar-lead !px-3 !py-1.5 !text-xs">Attach</button>
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
                  `Now ${mailbox.queueCounts?.now || 0}`,
                  `Reply ${mailbox.queueCounts?.['needs-reply'] || 0}`,
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
              (emailVerifierConfig?.defaultMode || emailVerifierForm.defaultMode || 'quick').toUpperCase(),
              emailVerifierForm.autoVerifyContacts ? 'Auto Verify On' : 'Auto Verify Off',
              emailVerifierForm.enabled ? 'Enabled' : 'Disabled'
            ]}
          />
        </div>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto no-scrollbar pl-1">
        {selectedEmailInfrastructureKind === 'email-verifier' ? (
          <div className={compactControlPlaneClass}>
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
                <button onClick={handleSaveEmailVerifier} disabled={emailVerifierConfigLocked} className={saveButtonClassName("btn-toolbar-lead", savedAction === 'email-verifier-save')}>{savedAction === 'email-verifier-save' ? 'Saved' : emailVerifierConfig?.hasApiKey ? 'SAVE' : 'ADD ACTIVATION'}</button>
                <SaveFeedbackNote visible={savedAction === 'email-verifier-save'} label="Saved" />
              </div>
            </div>
            {emailVerifierConfig?.status === 'error' ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">Last connection test failed. Update the API key and run a new test.</div> : null}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              This provider is managed here as part of the mail infrastructure layer. CRM verification, bulk tasks, and verification flow nodes all use this saved tenant config.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider State</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{emailVerifierStatusMeta.label}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Default Mode</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{(emailVerifierConfig?.defaultMode || emailVerifierForm.defaultMode || 'quick').toUpperCase()}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{emailVerifierConfig?.lastTestedAt ? new Date(emailVerifierConfig.lastTestedAt).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Runtime</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{emailVerifierForm.enabled ? 'Enabled' : 'Disabled'}</div></div>
            </div>
            <fieldset disabled={emailVerifierConfigLocked} className="space-y-3 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1 sm:col-span-2"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">API Key</div><input type="password" autoComplete="new-password" value={emailVerifierForm.apiKey} onChange={(event) => setEmailVerifierForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder={emailVerifierConfig?.hasApiKey ? 'Saved in workspace config' : 'Paste your Reoon API key'} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Default Mode</div><select value={emailVerifierForm.defaultMode} onChange={(event) => setEmailVerifierForm((current) => ({ ...current, defaultMode: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="quick">Quick (Single/Flows)</option><option value="power">Power (Bulk Import)</option></select></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm text-[var(--color-text-secondary)]">
              <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><input type="checkbox" checked={!!emailVerifierForm.enabled} onChange={(event) => setEmailVerifierForm((current) => ({ ...current, enabled: event.target.checked }))} /> Enable provider for this tenant</label>
              <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><input type="checkbox" checked={!!emailVerifierForm.autoVerifyContacts} onChange={(event) => setEmailVerifierForm((current) => ({ ...current, autoVerifyContacts: event.target.checked }))} /> Auto-verify contacts on create/update</label>
            </div>
            </fieldset>
            {emailVerifierConfig?.hasApiKey ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-red-400 font-semibold">Danger Zone</div>
                <button onClick={handleDeleteEmailVerifier} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 transition"><Trash2 size={14} />Remove Reoon Integration</button>
              </div>
            ) : null}
          </div>
        ) : selectedMailbox ? (
          <div className={compactControlPlaneClass}>
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Mailbox Control Plane</div><h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{selectedMailbox.name}</h3></div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setMailboxConfigEditing(true)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Edit</button>
                {isMailboxOauthProvider(mailboxForm.provider) ? <button onClick={handleAuthorizeMailbox} className="rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-3 py-2 text-sm text-[var(--color-text-primary)] btn-primary-skeuo !border-0 !bg-[var(--color-primary)]/10">{selectedMailboxStateMeta.primaryActionLabel}</button> : null}
                <button onClick={handleTestMailbox} disabled={busyAction === 'mailbox-test' || selectedMailboxStateMeta.authActionsDisabled} className={saveButtonClassName("rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-60 disabled:cursor-not-allowed", savedAction === 'mailbox-test')}>{busyAction === 'mailbox-test' ? 'Testing...' : savedAction === 'mailbox-test' ? 'Tested' : 'TEST CONNECT'}</button>
                <SaveFeedbackNote visible={savedAction === 'mailbox-test'} label="Connection OK" />
                <button onClick={handleSyncMailbox} disabled={selectedMailboxStateMeta.authActionsDisabled} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50">Sync</button>
                <button onClick={handleSaveMailbox} disabled={selectedMailboxStateMeta.saveDisabled || mailboxConfigLocked} className={saveButtonClassName("btn-toolbar-lead", savedAction === 'mailbox-save')}>{savedAction === 'mailbox-save' ? 'Saved' : 'Save'}</button>
                <SaveFeedbackNote visible={savedAction === 'mailbox-save'} label="Saved" />
              </div>
            </div>
            {mailboxForm.config?.lastError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">{mailboxForm.config.lastError}</div> : null}
            {selectedMailboxStateMeta.authActionsDisabled ? <div className={`rounded-xl border px-3 py-3 text-sm ${toneClass(selectedMailboxStateMeta.tone)}`}>{selectedMailboxStateMeta.detail} Test, sync, save, and disconnect are disabled until recovery.</div> : null}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              This page is for connection management. The actual mail reader is the thread workspace in <span className="font-medium text-[var(--color-text-primary)]">Comms</span>.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Health</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailboxStateMeta.label}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Sync</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.lastSyncedAt ? new Date(selectedMailbox.lastSyncedAt).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Inbound</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.inboundEnabled ? 'Enabled' : 'Disabled'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Outbound</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.outboundEnabled ? 'Enabled' : 'Disabled'}</div></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Connected Account</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{mailboxForm.config?.connectedIdentity || mailboxForm.address || 'Not connected'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{mailboxForm.config?.lastTestedAt ? new Date(mailboxForm.config.lastTestedAt).toLocaleString() : 'Never'}</div></div>
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
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-red-400 font-semibold">Danger Zone</div>
              <div className="flex flex-wrap gap-2">
                {isMailboxOauthProvider(mailboxForm.provider) ? <button onClick={handleDisconnectMailbox} disabled={selectedMailboxStateMeta.authActionsDisabled} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/20 transition disabled:cursor-not-allowed disabled:opacity-50"><LogOut size={14} />Disconnect</button> : null}
                <button onClick={handleDeleteMailbox} disabled={mailboxes.length <= 1} className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 transition disabled:cursor-not-allowed disabled:opacity-50"><Trash2 size={14} />Delete Mailbox</button>
              </div>
            </div>
          </div>
        ) : <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 text-center text-sm text-[var(--color-text-secondary)]">Create or select a mailbox to manage credentials and sync behavior.</div>}
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
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1.75fr)_minmax(420px,2.25fr)]">
      <div className="min-h-0 space-y-2.5 overflow-y-auto no-scrollbar pr-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">{sectionTitle}</div>
            <div className="text-sm text-[var(--color-text-secondary)]">{sectionDescription}</div>
          </div>
          <button onClick={() => setShowCalendarComposer((current) => !current)} className={compactActionClass}>
            {showCalendarComposer ? 'Close' : 'Add Integration'}
          </button>
        </div>
        {showCalendarComposer ? (
          <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(15,23,42,0.22))] p-3 space-y-2.5">
            <div className="grid gap-2.5 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Source Name</div><input value={calendarSourceDraft.name} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, name: event.target.value }))} className={compactInputSecondaryClass} /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><select value={calendarSourceDraft.provider} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, provider: event.target.value, config: { authorityMode: current.config?.authorityMode || 'local-first', importPolicy: current.config?.importPolicy || 'review' } }))} className={compactInputSecondaryClass}>{scopedProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Authority Mode</div><select value={calendarSourceDraft.config?.authorityMode || 'local-first'} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, config: { ...(current.config || {}), authorityMode: event.target.value } }))} className={compactInputSecondaryClass}><option value="local-first">Local First</option><option value="mirror">Mirror External</option><option value="external-first">External First</option></select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Import Policy</div><select value={calendarSourceDraft.config?.importPolicy || 'review'} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, config: { ...(current.config || {}), importPolicy: event.target.value } }))} className={compactInputSecondaryClass}><option value="review">Review Before Adopt</option><option value="auto-merge">Auto Merge</option><option value="hold">Hold Imported Only</option></select></label>
            </div>
            {calendarDraftProvider.fields?.length ? <div className="grid gap-2.5 sm:grid-cols-2 text-sm">{calendarDraftProvider.fields.map((field) => <label key={field.key} className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div><input value={calendarSourceDraft.config?.[field.key] || ''} onChange={(event) => setCalendarSourceDraft((current) => ({ ...current, config: { ...(current.config || {}), [field.key]: event.target.value } }))} className={compactInputSecondaryClass} /></label>)}</div> : null}
            <button onClick={handleCreateCalendarSource} disabled={!calendarSourceDraft.name.trim()} className="btn-toolbar-lead !px-3 !py-1.5 !text-xs">Attach</button>
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
                `Events ${source.eventCounts?.total || 0}`,
                `Synced ${source.eventCounts?.synced || 0}`,
                `Conflicts ${source.eventCounts?.conflicts || 0}`,
                calendarStateMeta.machine === 'connected' ? 'Auth Ready' : calendarStateMeta.label
              ]}
            />
            );
          })}
        </div>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto no-scrollbar pl-1">
        {selectedCalendarSource ? (
          <div className={compactControlPlaneClass}>
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">{controlPlaneTitle}</div><h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.name}</h3></div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setCalendarConfigEditing(true)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Edit</button>
                {isCalendarOauthProvider(calendarSourceForm.provider) ? <button onClick={handleAuthorizeCalendarSource} className="rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-3 py-2 text-sm text-[var(--color-text-primary)] btn-primary-skeuo !border-0 !bg-[var(--color-primary)]/10">{selectedCalendarSourceStateMeta.primaryActionLabel}</button> : null}
                <button onClick={handleTestCalendarSource} disabled={busyAction === 'calendar-test' || selectedCalendarSourceStateMeta.authActionsDisabled} className={saveButtonClassName("rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-60 disabled:cursor-not-allowed", savedAction === 'calendar-test')}>{busyAction === 'calendar-test' ? 'Testing...' : savedAction === 'calendar-test' ? 'Tested' : 'TEST CONNECT'}</button>
                <SaveFeedbackNote visible={savedAction === 'calendar-test'} label="Source OK" />
                <button onClick={handleSyncCalendarSource} disabled={selectedCalendarSourceStateMeta.authActionsDisabled} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50">Sync</button>
                <button onClick={handleImportCalendarSource} disabled={selectedCalendarSourceStateMeta.authActionsDisabled} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50">Import</button>
                <button onClick={handleSaveCalendarSource} disabled={selectedCalendarSourceStateMeta.saveDisabled || calendarConfigLocked} className={saveButtonClassName("btn-toolbar-lead", savedAction === 'calendar-save')}>{savedAction === 'calendar-save' ? 'Saved' : 'Save'}</button>
                <SaveFeedbackNote visible={savedAction === 'calendar-save'} label="Saved" />
              </div>
            </div>
            {calendarSourceForm.config?.lastError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">{calendarSourceForm.config.lastError}</div> : null}
            {selectedCalendarSourceStateMeta.authActionsDisabled ? <div className={`rounded-xl border px-3 py-3 text-sm ${toneClass(selectedCalendarSourceStateMeta.tone)}`}>{selectedCalendarSourceStateMeta.detail} Test, sync, import, save, and disconnect are disabled until recovery.</div> : null}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              This page manages calendar source connections. Use sync to update events from this source.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Health</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSourceStateMeta.label}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Events</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.eventCounts?.total || 0}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Synced</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.eventCounts?.synced || 0}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Conflicts</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.eventCounts?.conflicts || 0}</div></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Connected Account</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{calendarSourceForm.config?.connectedIdentity || calendarSourceForm.config?.email || 'Not connected'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Connected Calendar</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{calendarSourceForm.config?.connectedCalendar || 'Not selected'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{calendarSourceForm.config?.lastTestedAt ? new Date(calendarSourceForm.config.lastTestedAt).toLocaleString() : 'Never'}</div></div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Sync</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource.lastSyncedAt ? new Date(selectedCalendarSource.lastSyncedAt).toLocaleString() : 'Never'}</div></div>
            </div>
            <fieldset disabled={calendarConfigLocked} className="space-y-3 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Source Name</div><input value={calendarSourceForm.name} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><select value={calendarSourceForm.provider} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, provider: event.target.value, config: { authorityMode: current.config?.authorityMode || 'local-first', importPolicy: current.config?.importPolicy || 'review' } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]">{scopedProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Authority Mode</div><select value={calendarSourceForm.config?.authorityMode || 'local-first'} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), authorityMode: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="local-first">Local First</option><option value="mirror">Mirror External</option><option value="external-first">External First</option></select></label>
              <label className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Import Policy</div><select value={calendarSourceForm.config?.importPolicy || 'review'} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), importPolicy: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="review">Review Before Adopt</option><option value="auto-merge">Auto Merge</option><option value="hold">Hold Imported Only</option></select></label>
            </div>
            {isCalendarOauthProvider(calendarSourceForm.provider) ? <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">Connection is read-only at this stage. The platform binds the Google or Microsoft account, loads available calendars, and stores the selected calendar id. No event import, mirror, overwrite, or deletion occurs during connection.</div> : null}
            {isCalendarOauthProvider(calendarSourceForm.provider) ? <div className="grid gap-3 sm:grid-cols-2 text-sm"><label className="space-y-1 sm:col-span-2"><div className="flex items-center justify-between gap-3"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Active Calendar</div>{calendarOptionsLoading ? <span className="text-[11px] text-[var(--color-text-tertiary)]">Loading calendars...</span> : null}</div><select value={calendarSourceForm.config?.calendarId || ''} onChange={(event) => { const nextId = event.target.value; const selectedOption = calendarOptions.find((item) => String(item.id || '') === nextId) || null; setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), calendarId: nextId || '', connectedCalendar: selectedOption?.label || '' } })); }} disabled={!calendarOptions.length && !calendarOptionsLoading} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"><option value="">{calendarOptions.length ? 'Select a calendar' : calendarSourceForm.config?.connectedIdentity ? 'No calendars loaded yet' : 'Connect OAuth first'}</option>{calendarOptions.map((item) => <option key={item.id} value={item.id}>{item.label}{item.primary ? ' (Primary)' : ''}</option>)}</select>{calendarSourceForm.config?.connectedIdentity && !calendarOptions.length && !calendarOptionsLoading ? <div className="text-xs text-[var(--color-text-secondary)]">This source is connected, but the calendar list is not available yet. Save or reconnect to refresh the available calendars.</div> : null}</label></div> : null}
            {selectedCalendarProviderFields?.length ? <div className="grid gap-3 sm:grid-cols-2 text-sm">{selectedCalendarProviderFields.map((field) => <label key={field.key} className="space-y-1"><div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div><input value={calendarSourceForm.config?.[field.key] || ''} onChange={(event) => setCalendarSourceForm((current) => ({ ...current, config: { ...(current.config || {}), [field.key]: event.target.value } }))} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]" /></label>)}</div> : <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">This provider does not require external credentials.</div>}
            </fieldset>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]"><span className="rounded-full border border-[var(--color-border)] px-2 py-1">Authority {sourceRuleLabels[selectedCalendarSource.authorityMode] || selectedCalendarSource.authorityMode}</span><span className="rounded-full border border-[var(--color-border)] px-2 py-1">Import {sourceRuleLabels[selectedCalendarSource.importPolicy] || selectedCalendarSource.importPolicy}</span></div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-red-400 font-semibold">Danger Zone</div>
              <div className="flex flex-wrap gap-2">
                {isCalendarOauthProvider(calendarSourceForm.provider) ? <button onClick={handleDisconnectCalendarSource} disabled={selectedCalendarSourceStateMeta.authActionsDisabled} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/20 transition disabled:cursor-not-allowed disabled:opacity-50"><LogOut size={14} />Disconnect</button> : null}
                <button onClick={handleDeleteCalendarSource} className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 transition"><Trash2 size={14} />Delete Source</button>
              </div>
            </div>
          </div>
        ) : <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 text-center text-sm text-[var(--color-text-secondary)]">{emptyStateCopy}</div>}
      </div>
    </div>
  );
  };

  const renderAiAdmin = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1.75fr)_minmax(420px,2.25fr)]">
      <div className="space-y-2.5">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">LLMs</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Keep one local runtime active for private AI work, and stage external providers here for overflow, experiments, or model-specific tasks.</div>
        </div>
        <div className="space-y-3">
          {selectedAiProviderCatalog && !selectedAiProviderConfig ? (
            <div className="rounded-xl border border-dashed border-[var(--color-primary)]/40 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),rgba(10,14,24,0.28))] px-3 py-3">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-primary)]">
                  {getBrandIcon(selectedAiProviderCatalog.id, 22)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="text-[13px] font-semibold leading-tight text-[var(--color-text-primary)]">{selectedAiProviderCatalog.name}</div>
                    <span className="rounded-full border border-[var(--color-primary)]/25 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
                      Ghost
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{selectedAiProviderCatalog.id}</div>
                  <div className="mt-1.5 text-[12px] leading-snug text-[var(--color-text-secondary)]">{selectedAiProviderCatalog.description}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleSaveAiProvider}
                      className={saveButtonClassName("btn-toolbar-lead !px-3 !py-1.5 !text-xs", savedAction === 'ai-provider-save')}
                    >
                      {savedAction === 'ai-provider-save' ? 'Saved' : 'ADD ACTIVATION'}
                    </button>
                    <span className="text-[11px] text-[var(--color-text-secondary)]">Lock this model provider into the workspace stack and open its control plane.</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {aiProviderConfigs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--color-border)] rounded-2xl text-[var(--color-text-secondary)]">
              <Bot size={40} className="mb-3 opacity-20" />
              <p className="text-sm">No LLM runtimes configured.</p>
              <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Select a provider from the left rail to configure it here.</p>
            </div>
          ) : (
            aiProviderConfigs.map((config) => {
              const provider = getProviderConfig(config.providerKey) || { 
                name: config.label, 
                description: 'External Provider' 
              };
              return (
                <ResourceCard
                  key={config.id}
                  icon={Bot}
                  logoId={config.providerKey}
                  title={config.label || provider.name}
                  subtitle={config.providerKey}
                  status={config.status || 'Ready'}
                  detail={config.lastError || config.model || provider.description}
                  selected={selectedAiProviderKey === config.providerKey}
                  onClick={() => setSelectedAiProviderKey(config.providerKey)}
                  chips={[
                    config.isDefault ? 'Active Runtime' : 'Standby',
                    config.enabled ? 'Enabled' : 'Disabled',
                    config.model || 'No model',
                  ]}
                />
              );
            })
          )}
        </div>
      </div>
      <div className="space-y-2.5">
        {selectedAiProviderCatalog ? (
          <div className={compactControlPlaneClass}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">LLM Control Plane</div>
                <h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{selectedAiProviderCatalog.displayName || selectedAiProviderCatalog.label}</h3>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{selectedAiProviderCatalog.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedAiProviderConfig ? <button onClick={() => setAiProviderConfigEditing(true)} className={compactActionClass}>Edit</button> : null}
                <button onClick={handleTestAiProvider} disabled={busyAction === 'ai-provider-test'} className={saveButtonClassName(`${compactActionClass} disabled:opacity-60 disabled:cursor-not-allowed`, savedAction === 'ai-provider-test')}>{busyAction === 'ai-provider-test' ? 'Testing...' : savedAction === 'ai-provider-test' ? 'Tested' : 'TEST CONNECT'}</button>
                <SaveFeedbackNote visible={savedAction === 'ai-provider-test'} label="Provider OK" />
                <button onClick={handleSaveAiProvider} disabled={aiProviderConfigLocked} className={saveButtonClassName("btn-toolbar-lead !px-3 !py-1.5 !text-xs", savedAction === 'ai-provider-save')}>{savedAction === 'ai-provider-save' ? 'Saved' : selectedAiProviderConfig ? 'SAVE' : 'ADD ACTIVATION'}</button>
                <SaveFeedbackNote visible={savedAction === 'ai-provider-save'} label="Saved" />
              </div>
          </div>
          <div className={compactMetaGridClass}>
            <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedAiProviderConfig?.status || 'Not configured'}</div></div>
            <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Runtime</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedAiProviderConfig?.isDefault ? 'Active' : 'Standby'}</div></div>
            <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Model</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedAiProviderConfig?.model || selectedAiProviderCatalog.defaultModel || 'Unset'}</div></div>
            <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-xs font-semibold text-[var(--color-text-primary)]">{selectedAiProviderConfig?.lastTestedAt ? new Date(selectedAiProviderConfig.lastTestedAt).toLocaleString() : 'Never'}</div></div>
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
                    placeholder={fieldName === 'apiKey' && selectedAiProviderConfig?.apiKeyPresent ? 'Saved in workspace config' : field.placeholder || ''}
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
                  isDefault: event.target.checked ? current.isDefault : false
                }))} 
              /> 
              Enable provider for this workspace
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-[var(--color-text-primary)]">
              <input 
                type="checkbox" 
                checked={!!aiProviderForm.isDefault} 
                onChange={(event) => setAiProviderForm((current) => ({ 
                  ...current, 
                  isDefault: event.target.checked, 
                  enabled: event.target.checked ? true : current.enabled
                }))} 
              /> 
              Use as the active AI runtime
            </label>
          </div>
          </fieldset>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
            Bullseye assists across CRM, Forms, Calendar, Flows, and Comms will use the active runtime first, then fall back safely if this provider is unavailable.
          </div>
          {selectedAiProviderKey === 'ollama' ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
              Use the raw Ollama daemon URL, like <span className="font-medium text-[var(--color-text-primary)]">http://localhost:11434</span> or <span className="font-medium text-[var(--color-text-primary)]">http://LAN-IP:11434</span>. If your Ollama host sits behind a proxy, ensure the Base URL and optional credentials are correct so model refresh and test function as expected.
            </div>
          ) : null}
          {selectedAiProviderConfig ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-red-400 font-semibold">Danger Zone</div>
                <button onClick={handleDeleteAiProvider} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 transition"><Trash2 size={14} />Remove AI Provider</button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="h-full rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex flex-col items-center justify-center p-8 text-center">
            <Bot size={64} className="mb-4 opacity-10" />
            <h3 className="text-lg font-medium text-[var(--color-text-primary)]">Select an LLM Runtime</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)] max-w-xs">
              Use the left selector to choose a runtime and manage its control plane here.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderDataStoresAdmin = () => (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1.15fr)_minmax(420px,2fr)]">
      <div className="min-h-0 space-y-2.5 overflow-y-auto pr-1 no-scrollbar">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Sources</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Select a provider from the left rail, then activate it here to configure live row operations.</div>
        </div>
        {selectedDataStoreProviderCatalog && !selectedDataStoreProviderConfig ? (
          <div className="rounded-xl border border-dashed border-[var(--color-primary)]/40 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),rgba(10,14,24,0.28))] px-3 py-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-primary)]">
                {getBrandIcon(selectedDataStoreProviderCatalog.id, 22)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="text-[13px] font-semibold leading-tight text-[var(--color-text-primary)]">{selectedDataStoreProviderCatalog.name}</div>
                  <span className="rounded-full border border-[var(--color-primary)]/25 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    Ghost
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{selectedDataStoreProviderCatalog.id}</div>
                <div className="mt-1.5 text-[12px] leading-snug text-[var(--color-text-secondary)]">{selectedDataStoreProviderCatalog.description}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSaveDataStoreProvider}
                    className={saveButtonClassName("btn-toolbar-lead !px-3 !py-1.5 !text-xs", savedAction === 'data-store-save')}
                  >
                    {savedAction === 'data-store-save' ? 'Saved' : 'ADD ACTIVATION'}
                  </button>
                  <span className="text-[11px] text-[var(--color-text-secondary)]">Lock this provider into the workspace stack and open its control plane.</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {dataStoreProviderConfigs.map((provider) => {
          const catalogEntry = getProviderConfig(provider.providerKey);
          return (
            <ResourceCard
              key={provider.providerKey}
              icon={ShieldCheck}
              logoId={provider.providerKey}
              title={catalogEntry?.name || provider.providerKey}
              subtitle={provider.providerKey}
              status={provider.lastError ? 'needs attention' : 'configured'}
              detail={provider.lastError || catalogEntry?.description || 'Workspace data store activation.'}
              selected={selectedDataStoreProviderKey === provider.providerKey}
              onClick={() => {
                setSelectedDataStoreProviderKey(provider.providerKey);
                setDataStoreConfigEditing(false);
              }}
              chips={[
                'workspace',
                provider.apiKeyPresent ? 'credentials saved' : 'credentials pending',
                provider.lastTestedAt ? 'tested' : 'not tested',
              ]}
            />
          );
        })}
      </div>

      <div className={compactPanelClass}>
        {selectedDataStoreProviderCatalog ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Data Store Control Plane</div>
                <h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{dataStoreProviderForm.label || selectedDataStoreProviderCatalog.name}</h3>
                <p className="mt-1.5 max-w-3xl text-sm text-[var(--color-text-secondary)]">{selectedDataStoreProviderCatalog.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedDataStoreProviderConfig ? <button onClick={() => setDataStoreConfigEditing(true)} className={compactActionClass}>Edit</button> : null}
                <button onClick={handleTestDataStoreProvider} disabled={busyAction === 'data-store-test'} className={saveButtonClassName(`${compactActionClass} disabled:opacity-60 disabled:cursor-not-allowed`, savedAction === 'data-store-test')}>
                  {busyAction === 'data-store-test' ? 'Testing...' : savedAction === 'data-store-test' ? 'Tested' : 'TEST CONNECT'}
                </button>
                <button onClick={handleSaveDataStoreProvider} disabled={dataStoreConfigLocked} className={saveButtonClassName("btn-toolbar-lead !px-3 !py-1.5 !text-xs", savedAction === 'data-store-save')}>
                  {savedAction === 'data-store-save' ? 'Saved' : selectedDataStoreProviderConfig ? 'SAVE' : 'ADD ACTIVATION'}
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedDataStoreProviderConfig ? (selectedDataStoreProviderConfig.lastError ? 'Needs Attention' : 'Configured') : 'Standby'}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedDataStoreProviderCatalog.id}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Credentials</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedDataStoreProviderConfig?.apiKeyPresent ? 'Stored' : 'Pending'}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-xs font-semibold text-[var(--color-text-primary)]">{selectedDataStoreProviderConfig?.lastTestedAt ? new Date(selectedDataStoreProviderConfig.lastTestedAt).toLocaleString() : 'Never'}</div></div>
            </div>

            {selectedDataStoreProviderConfig?.lastError ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {selectedDataStoreProviderConfig.lastError}
              </div>
            ) : null}

            <fieldset disabled={dataStoreConfigLocked} className="space-y-3 disabled:opacity-70">
              <div className="grid gap-3 sm:grid-cols-2">
                {(selectedDataStoreProviderCatalog.fields || []).map((field) => {
                  const fieldName = field.name;
                  const isRootField = ['label', 'baseUrl', 'apiKey'].includes(fieldName);
                  const value = isRootField ? (dataStoreProviderForm[fieldName] || '') : (dataStoreProviderForm.config?.[fieldName] || '');
                  const onChange = (nextValue) => {
                    if (isRootField) {
                      setDataStoreProviderForm((current) => ({ ...current, [fieldName]: nextValue }));
                      return;
                    }
                    setDataStoreProviderForm((current) => ({
                      ...current,
                      config: {
                        ...(current.config || {}),
                        [fieldName]: nextValue,
                      },
                    }));
                  };

                  return (
                    <label key={fieldName} className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div>
                      <input
                        type={field.type === 'password' ? 'password' : 'text'}
                        autoComplete={field.type === 'password' ? 'new-password' : undefined}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        placeholder={field.default || ''}
                        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                      />
                    </label>
                  );
                })}
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-3 text-[var(--color-text-primary)]">
                <input type="checkbox" checked={!!dataStoreProviderForm.enabled} onChange={(event) => setDataStoreProviderForm((current) => ({ ...current, enabled: event.target.checked }))} />
                Enable data store provider for this workspace
              </label>
            </fieldset>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              Protected credentials and target identifiers do not round-trip back into the UI. Re-enter them here when rotating secrets or changing the live target.
            </div>
            {selectedDataStoreProviderConfig ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-red-400 font-semibold">Danger Zone</div>
                <button onClick={handleDeleteDataStoreProvider} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 transition"><Trash2 size={14} />Remove Data Store</button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
            <ShieldCheck className="text-[var(--color-text-secondary)]" size={48} />
            <h3 className="m-0 text-lg font-semibold text-[var(--color-text-primary)]">Select a data store</h3>
            <p className="m-0 max-w-sm text-sm text-[var(--color-text-secondary)]">Choose a provider from the left selector to activate and configure it here.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderMediaAdmin = () => (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1.15fr)_minmax(420px,2fr)]">
      <div className="min-h-0 space-y-2.5 overflow-y-auto pr-1 no-scrollbar">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Media Providers</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Activate ElevenLabs transcription and voice-render services for media workflows and operator voice routing.</div>
        </div>
        {selectedMediaProviderCatalog && !selectedMediaProviderConfig ? (
          <div className="rounded-xl border border-dashed border-[var(--color-primary)]/40 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),rgba(10,14,24,0.28))] px-3 py-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-primary)]">
                {getBrandIcon(selectedMediaProviderCatalog.id, 22)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="text-[13px] font-semibold leading-tight text-[var(--color-text-primary)]">{selectedMediaProviderCatalog.name}</div>
                  <span className="rounded-full border border-[var(--color-primary)]/25 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    Ghost
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{selectedMediaProviderCatalog.id}</div>
                <div className="mt-1.5 text-[12px] leading-snug text-[var(--color-text-secondary)]">{selectedMediaProviderCatalog.description}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSaveMediaProvider}
                    className={saveButtonClassName("btn-toolbar-lead !px-3 !py-1.5 !text-xs", savedAction === 'media-save')}
                  >
                    {savedAction === 'media-save' ? 'Saved' : 'ADD ACTIVATION'}
                  </button>
                  <span className="text-[11px] text-[var(--color-text-secondary)]">Lock this provider into the workspace stack and open its control plane.</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {mediaProviderConfigs.map((provider) => {
          const catalogEntry = getProviderConfig(resolveMediaSelectorProvider(provider.providerKey)) || { name: provider.label || provider.providerKey, description: 'Media provider' };
          return (
            <ResourceCard
              key={provider.id || provider.providerKey}
              icon={ShieldCheck}
              logoId={resolveMediaSelectorProvider(provider.providerKey)}
              title={provider.label || catalogEntry.name}
              subtitle={provider.providerKey}
              status={provider.lastError ? 'needs attention' : provider.status || 'configured'}
              detail={provider.lastError || catalogEntry.description}
              selected={selectedMediaProviderKey === resolveMediaSelectorProvider(provider.providerKey)}
              onClick={() => {
                setSelectedMediaProviderKey(resolveMediaSelectorProvider(provider.providerKey));
                setMediaConfigEditing(false);
              }}
              chips={[
                provider.enabled ? 'enabled' : 'disabled',
                provider.apiKey ? 'credentials stored' : 'credentials pending',
                provider.lastTestedAt ? 'tested' : 'not tested',
              ]}
            />
          );
        })}
      </div>

      <div className={compactPanelClass}>
        {selectedMediaProviderCatalog ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Media Control Plane</div>
                <h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{mediaProviderForm.label || selectedMediaProviderCatalog.name}</h3>
                <p className="mt-1.5 max-w-3xl text-sm text-[var(--color-text-secondary)]">{selectedMediaProviderCatalog.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedMediaProviderConfig ? <button onClick={() => setMediaConfigEditing(true)} className={compactActionClass}>Edit</button> : null}
                <button onClick={handleTestMediaProvider} disabled={busyAction === 'media-test'} className={saveButtonClassName(`${compactActionClass} disabled:opacity-60 disabled:cursor-not-allowed`, savedAction === 'media-test')}>
                  {busyAction === 'media-test' ? 'Testing...' : savedAction === 'media-test' ? 'Tested' : 'TEST CONNECT'}
                </button>
                <button onClick={handleSaveMediaProvider} disabled={!!selectedMediaProviderConfig && !mediaConfigEditing} className={saveButtonClassName("btn-toolbar-lead !px-3 !py-1.5 !text-xs", savedAction === 'media-save')}>
                  {savedAction === 'media-save' ? 'Saved' : selectedMediaProviderConfig ? 'SAVE' : 'ADD ACTIVATION'}
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMediaProviderConfig ? (selectedMediaProviderConfig.lastError ? 'Needs Attention' : selectedMediaProviderConfig.status || 'Configured') : 'Standby'}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMediaProviderCatalog.id}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Credentials</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMediaProviderConfig?.apiKey ? 'Stored' : 'Pending'}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Last Tested</div><div className="mt-1 text-xs font-semibold text-[var(--color-text-primary)]">{selectedMediaProviderConfig?.lastTestedAt ? new Date(selectedMediaProviderConfig.lastTestedAt).toLocaleString() : 'Never'}</div></div>
            </div>

            {selectedMediaProviderConfig?.lastError ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {selectedMediaProviderConfig.lastError}
              </div>
            ) : null}

            <fieldset disabled={!!selectedMediaProviderConfig && !mediaConfigEditing} className="space-y-3 disabled:opacity-70">
              <div className="grid gap-3 sm:grid-cols-2">
                {(selectedMediaProviderCatalog.fields || []).map((field) => {
                  const isRootField = ['label', 'baseUrl', 'apiKey'].includes(field.name);
                  const value = isRootField ? (mediaProviderForm[field.name] || '') : (mediaProviderForm.config?.[field.name] || '');
                  const onChange = (nextValue) => {
                    if (isRootField) {
                      setMediaProviderForm((current) => ({ ...current, [field.name]: nextValue }));
                      return;
                    }
                    setMediaProviderForm((current) => ({
                      ...current,
                      config: {
                        ...(current.config || {}),
                        [field.name]: nextValue,
                      },
                    }));
                  };

                  return (
                    <label key={field.name} className={`${field.type === 'textarea' ? 'sm:col-span-2' : ''} space-y-1`}>
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</div>
                      {field.type === 'textarea' ? (
                        <textarea
                          rows={3}
                          value={value}
                          onChange={(event) => onChange(event.target.value)}
                          placeholder={field.default || ''}
                          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)] resize-none"
                        />
                      ) : (
                        <input
                          type={field.type === 'password' ? 'password' : 'text'}
                          autoComplete={field.type === 'password' ? 'new-password' : undefined}
                          value={value}
                          onChange={(event) => onChange(event.target.value)}
                          placeholder={field.default || ''}
                          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-3 text-[var(--color-text-primary)]">
                <input type="checkbox" checked={!!mediaProviderForm.enabled} onChange={(event) => setMediaProviderForm((current) => ({ ...current, enabled: event.target.checked }))} />
                Enable media provider for this workspace
              </label>
            </fieldset>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              Use ElevenLabs Scribe for external transcription and ElevenLabs Voice for speech output. Charlie voice routing can be staged here now and expanded to additional operator voices later.
            </div>
            {selectedMediaProviderConfig ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-red-400 font-semibold">Danger Zone</div>
                <button onClick={handleDeleteMediaProvider} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 transition"><Trash2 size={14} />Remove Media Provider</button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
            <ShieldCheck className="text-[var(--color-text-secondary)]" size={48} />
            <h3 className="m-0 text-lg font-semibold text-[var(--color-text-primary)]">Select a media provider</h3>
            <p className="m-0 max-w-sm text-sm text-[var(--color-text-secondary)]">Choose a provider from the left selector to activate and configure it here.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderLegacyCategory = () => (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1.15fr)_minmax(420px,2fr)]">
      <div className="min-h-0 space-y-2.5 overflow-y-auto pr-1 no-scrollbar">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Sources</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Select a provider from the left rail, then confirm it here to lock the next activation into this category.</div>
        </div>
        {selectedLegacyProvider && !hasSelectedLegacyIntegration ? (
          <div className="rounded-xl border border-dashed border-[var(--color-primary)]/40 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),rgba(10,14,24,0.28))] px-3 py-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-primary)]">
                {getBrandIcon(selectedLegacyProvider.id, 22)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="text-[13px] font-semibold leading-tight text-[var(--color-text-primary)]">{selectedLegacyProvider.name}</div>
                  <span className="rounded-full border border-[var(--color-primary)]/25 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    Ghost
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{selectedLegacyProvider.id}</div>
                <div className="mt-1.5 text-[12px] leading-snug text-[var(--color-text-secondary)]">{selectedLegacyProvider.description}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleActivateLegacyProvider}
                    className={saveButtonClassName("btn-toolbar-lead !px-3 !py-1.5 !text-xs", legacyActivationSelections[activeCategory] === selectedLegacyProvider.id)}
                  >
                    {legacyActivationSelections[activeCategory] === selectedLegacyProvider.id ? 'Saved' : 'ADD ACTIVATION'}
                  </button>
                  <span className="text-[11px] text-[var(--color-text-secondary)]">Lock this provider into the workspace stack for this category.</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {stagedLegacyProvider && !hasStagedLegacyIntegration ? (
          <ResourceCard
            icon={ShieldCheck}
            logoId={stagedLegacyProvider.id}
            title={stagedLegacyProvider.name}
            subtitle={stagedLegacyProvider.id}
            status="activation ready"
            detail="This provider is currently locked in as the next category activation."
            selected={selectedLegacyProvider?.id === stagedLegacyProvider.id}
            onClick={() => handleSelectorProviderSelect(stagedLegacyProvider.id, activeCategory)}
            chips={['pending', 'workspace']}
          />
        ) : null}
        {currentCategoryIntegrations.map((integration) => {
          const provider = getProviderConfig(integration.providerId);
          if (!provider) return null;
          return <IntegrationCard key={integration.id} integration={integration} provider={provider} isEnabled={integration.enabled} onToggle={handleToggleIntegration} onSettings={() => handleSelectorProviderSelect(provider.id, integration.category)} onRemove={handleRemoveIntegration} customLogo={integration.customLogo} />;
        })}
      </div>

      <div className={compactPanelClass}>
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-blue-500" />
            <p className="text-[var(--color-text-secondary)]">Loading integrations...</p>
          </div>
        ) : selectedLegacyProvider ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">{currentCategory?.name}</div>
                <h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{selectedLegacyProvider.name}</h3>
                <p className="mt-1.5 max-w-3xl text-sm text-[var(--color-text-secondary)]">{selectedLegacyProvider.description}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{legacyActivationSelections[activeCategory] === selectedLegacyProvider.id ? 'Locked In' : 'Selected'}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedLegacyProvider.id}</div></div>
              <div className={compactMetaCardClass}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Mode</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">Awaiting API</div></div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              This category is in staged activation mode. Confirm the provider in Sources to reserve it for this workspace while the live admin surface is being brought online.
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
            <ShieldCheck className="text-[var(--color-text-secondary)]" size={48} />
            <h3 className="m-0 text-lg font-semibold text-[var(--color-text-primary)]">No integrations yet</h3>
            <p className="m-0 max-w-sm text-sm text-[var(--color-text-secondary)]">Choose a provider from the left selector to stage and confirm the next {currentCategory?.name.toLowerCase()} activation.</p>
          </div>
        )}
      </div>
    </div>
  );

  const totalConnected = automationProviderConfigs.length + integrations.filter((integration) => integration.category !== INTEGRATION_CATEGORIES.AUTOMATION).length + mailboxes.length + calendarSources.length + aiProviderConfigs.filter((provider) => provider.enabled || provider.apiKeyPresent || provider.baseUrl).length + dataStoreProviderConfigs.length + mediaProviderConfigs.length + paymentProviderConfigs.length;
  const activeConnected = automationProviderConfigs.filter((provider) => provider.enabled).length
    + integrations.filter((integration) => integration.category !== INTEGRATION_CATEGORIES.AUTOMATION && integration.enabled).length
    + mailboxes.filter((mailbox) => (mailboxStateMetaById[mailbox.id] || getMailboxStateMeta(mailbox)).machine === 'connected').length
    + calendarSources.filter((source) => (calendarSourceStateMetaById[source.id] || getCalendarSourceStateMeta(source)).machine === 'connected').length
    + aiProviderConfigs.filter((provider) => provider.enabled).length
    + dataStoreProviderConfigs.length
    + mediaProviderConfigs.filter((provider) => provider.enabled).length
    + paymentProviderConfigs.filter((provider) => provider.enabled).length;

  const renderPaymentsAdmin = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1.75fr)_minmax(420px,2.25fr)]">
      <div className="space-y-2.5 overflow-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Payment Providers</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Collect payments via Stripe, PayPal, and other processors.</div>
        </div>
        {paymentProviderCatalog.map((provider) => {
          const config = paymentProviderConfigs.find((item) => item.providerKey === provider.id);
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

      <div className={compactPanelClass}>
        {selectedPaymentProviderCatalog ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Payment Control Plane</div>
                <h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{paymentProviderForm.label || selectedPaymentProviderCatalog.name}</h3>
                <p className="mt-1.5 max-w-3xl text-sm text-[var(--color-text-secondary)]">{selectedPaymentProviderCatalog.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedPaymentProviderConfig ? <button onClick={() => setPaymentConfigEditing(true)} className={compactActionClass}>Edit</button> : null}
                <button onClick={handleSavePaymentProvider} disabled={paymentConfigLocked} className={saveButtonClassName("btn-toolbar-lead !px-3 !py-1.5 !text-xs", savedAction === 'payment-save')}>
                  {savedAction === 'payment-save' ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedPaymentProviderConfig ? 'Connected' : 'Standby'}</div></div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Mode</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{paymentProviderForm.config?.mode || 'sandbox'}</div></div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Currency</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{(paymentProviderForm.config?.currency || 'USD').toUpperCase()}</div></div>
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
            {selectedPaymentProviderConfig ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-red-400 font-semibold">Danger Zone</div>
                <button onClick={handleDeletePaymentProvider} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 transition"><Trash2 size={14} />Remove Payment Provider</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderSocialNetworksAdmin = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1.75fr)_minmax(420px,2.25fr)]">
      <div className="space-y-2.5 overflow-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Social Networks</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Connect destinations for asset distribution and publishing.</div>
        </div>
        {getProvidersByCategory(INTEGRATION_CATEGORIES.SOCIAL_NETWORKS).map((provider) => {
          const config = socialProviderConfigs.find((item) => item.providerKey === provider.id);
          const isStub = provider.stub;
          return (
            <ResourceCard
              key={provider.id}
              icon={Share2}
              logoId={provider.id}
              title={config?.label || provider.name}
              subtitle={provider.id}
              status={isStub ? 'stub / not active' : config ? 'configured' : 'not configured'}
              detail={provider.description}
              selected={selectedSocialProviderKey === provider.id}
              onClick={() => !isStub && setSelectedSocialProviderKey(provider.id)}
              chips={[
                isStub ? 'stub' : config?.enabled ? 'enabled' : 'disabled',
              ]}
            />
          );
        })}
      </div>

      <div className={compactPanelClass}>
        {selectedSocialProviderCatalog ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Social Control Plane</div>
                <h3 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{socialProviderForm.label || selectedSocialProviderCatalog.name}</h3>
                <p className="mt-1.5 max-w-3xl text-sm text-[var(--color-text-secondary)]">{selectedSocialProviderCatalog.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedSocialProviderConfig ? <button onClick={() => setSocialConfigEditing(true)} className={compactActionClass}>Edit</button> : null}
                <button onClick={handleSaveSocialProvider} className={saveButtonClassName("btn-toolbar-lead !px-3 !py-1.5 !text-xs", savedAction === 'social-save')}>
                  {savedAction === 'social-save' ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedSocialProviderConfig ? 'Configured' : 'Standby'}</div></div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Provider</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedSocialProviderCatalog.name}</div></div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Distribution</div><div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">Future Relay</div></div>
            </div>

            <div className="space-y-3">
              {(selectedSocialProviderCatalog.fields || []).map((field) => (
                <div key={field.name}>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={socialProviderForm[field.name] || ''}
                      onChange={(e) => setSocialProviderForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                      rows={2}
                      placeholder={field.placeholder}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={socialProviderForm[field.name] || field.default || ''}
                      onChange={(e) => setSocialProviderForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                    >
                      {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : field.type === 'password' ? (
                    <input
                      type="password"
                      value={socialProviderForm[field.name] || ''}
                      onChange={(e) => setSocialProviderForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <input
                      type="text"
                      value={socialProviderForm[field.name] || ''}
                      onChange={(e) => setSocialProviderForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">
            Select a provider to configure
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)]">
      <ModuleHeader
        showTitle={false}
        leftActions={[
          { label: 'Refresh', icon: RefreshCw, onClick: loadAll, variant: 'secondary' }
        ]}
        actions={[]}
        toolbarCenterSlot={(
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            <span className="text-[var(--color-text-primary)]">{totalConnected}</span>
            <span>Connected</span>
            <span className="opacity-35">|</span>
            <span className="text-emerald-300">{activeConnected}</span>
            <span>Active</span>
            <span className="opacity-35">|</span>
            <span className="text-[var(--color-text-primary)]">{categories.length}</span>
            <span>Categories</span>
          </div>
        )}
        showActions
        onModuleAi={() => openAIAssist({ context: { module: 'integrations', activeCategory, providerCount: integrations.length } })}
      />
      <div className="mt-4 flex-1 min-h-0 overflow-hidden rounded-[var(--radius-outer)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-island p-2">
        <div className="h-full flex-1 overflow-y-auto p-4">
          <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-[var(--color-border)] px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Providers</div>
                  <div className="mt-1 text-xs text-[var(--color-text-secondary)]">Select a category, then choose a provider to load its control plane.</div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 no-scrollbar">
                  <IntegrationProviderSelector
                    category={activeCategory}
                    categories={categories}
                    onCategoryChange={handleSelectorCategoryChange}
                    selectedProvider={selectedSelectorProviderKey}
                    onSelectProvider={handleSelectorProviderSelect}
                  />
                </div>
              </div>
            </div>
            <div className="min-h-0 overflow-hidden relative">
              {activeCategory && selectorProviderKey ? (
              <>
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
                      : activeCategory === INTEGRATION_CATEGORIES.DATA_STORES
                        ? renderDataStoresAdmin()
                      : activeCategory === INTEGRATION_CATEGORIES.MEDIA
                        ? renderMediaAdmin()
                      : activeCategory === INTEGRATION_CATEGORIES.PAYMENTS
                        ? renderPaymentsAdmin()
                        : activeCategory === INTEGRATION_CATEGORIES.SOCIAL_NETWORKS
                          ? renderSocialNetworksAdmin()
                          : null}
              </>
              ) : null}
              {showSplash && (
                <div className="absolute inset-0 bg-[var(--color-bg-secondary)]/95 backdrop-blur-sm rounded-2xl border border-[var(--color-border)] flex items-center justify-center">
                  <div className="max-w-md text-center space-y-6 px-8">
                    <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Integrations</h2>
                      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                        Connect your workspace to external services. Manage mailboxes, calendars, automation, AI providers, and more from one unified control plane.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-left">
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 space-y-1">
                        <div className="flex items-center gap-2 text-indigo-400">
                          <Mail size={14} />
                          <span className="text-xs font-semibold">Mail</span>
                        </div>
                        <p className="text-[10px] text-[var(--color-text-tertiary)]">Connect mailboxes for inbound/outbound email</p>
                      </div>
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 space-y-1">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <Calendar size={14} />
                          <span className="text-xs font-semibold">Calendar</span>
                        </div>
                        <p className="text-[10px] text-[var(--color-text-tertiary)]">Sync calendars and scheduling</p>
                      </div>
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 space-y-1">
                        <div className="flex items-center gap-2 text-amber-400">
                          <Zap size={14} />
                          <span className="text-xs font-semibold">Automation</span>
                        </div>
                        <p className="text-[10px] text-[var(--color-text-tertiary)]">n8n, Make, Zapier webhooks</p>
                      </div>
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 space-y-1">
                        <div className="flex items-center gap-2 text-cyan-400">
                          <BrainIcon size={14} />
                          <span className="text-xs font-semibold">AI Providers</span>
                        </div>
                        <p className="text-[10px] text-[var(--color-text-tertiary)]">OpenAI, Ollama, Claude</p>
                      </div>
                    </div>
                    <div className="pt-2">
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        Select a provider from the left panel to configure.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActiveIntegrations;
