import { getStoredSessionToken } from './authStorage';

function resolveDefaultApiBaseUrl() {
  if (typeof window === 'undefined') {
    return 'http://localhost:8001';
  }

  const port = window.location.port;
  // If running in Vite development mode, point to backend on 8001
  if (port === '5173' || port === '5174' || port === '5175') {
    const currentHost = window.location.hostname || 'localhost';
    const normalizedHost = currentHost === '0.0.0.0' ? 'localhost' : currentHost;
    const protocol = window.location.protocol;
    return `${protocol}//${normalizedHost}:8001`;
  }

  // In production appliance mode or reverse proxy / tunnel (Tailscale Funnel, ngrok), use current origin
  return window.location.origin;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || resolveDefaultApiBaseUrl()).replace(/\/$/, '');
const BACKEND_ENABLED = import.meta.env.VITE_USE_BACKEND !== 'false';

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function normalizeSourceUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('/api/') || url.startsWith('/media/')) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}

const DATA_STORE_PROVIDER_ALLOWED_KEYS = new Set([
  'providerKey',
  'baseUrl',
  'apiKeyPresent',
  'lastTestedAt',
  'lastError',
]);

function isDevRuntime() {
  return Boolean(import.meta?.env?.DEV);
}

function hasBlockedProviderKey(key) {
  return /_configs$/i.test(String(key || '')) || /data[_-]?center[_-]?store[_-]?provider[_-]?configs/i.test(String(key || '')) || /data[_-]?store[_-]?provider[_-]?configs/i.test(String(key || ''));
}

function isSnakeCaseKey(key) {
  return /[a-z0-9]+_[a-z0-9_]+/.test(String(key || ''));
}

function warnDataStoreContract(message, details) {
  if (!isDevRuntime()) return;
  console.warn(`[DataStoresContract] ${message}`, details);
}

function sanitizeDataStoreProviderRecord(record) {
  const source = record && typeof record === 'object' ? record : {};
  const blockedKeys = Object.keys(source).filter((key) => hasBlockedProviderKey(key) || isSnakeCaseKey(key) || !DATA_STORE_PROVIDER_ALLOWED_KEYS.has(key));
  if (blockedKeys.length) {
    warnDataStoreContract('Dropped blocked/unknown provider fields.', blockedKeys);
  }
  return {
    providerKey: typeof source.providerKey === 'string' ? source.providerKey : '',
    baseUrl: typeof source.baseUrl === 'string' ? source.baseUrl : '',
    apiKeyPresent: Boolean(source.apiKeyPresent),
    lastTestedAt: source.lastTestedAt ?? null,
    lastError: source.lastError ?? null,
  };
}

function sanitizeDataStoreRowsEnvelope(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const blockedKeys = Object.keys(source).filter((key) => hasBlockedProviderKey(key) || isSnakeCaseKey(key) || !['rows', 'count'].includes(key));
  if (blockedKeys.length) {
    warnDataStoreContract('Dropped blocked/unknown rows envelope fields.', blockedKeys);
  }
  const rows = Array.isArray(source.rows) ? source.rows.map((row) => {
    if (!row || typeof row !== 'object') {
      return {};
    }
    const cleaned = {};
    Object.entries(row).forEach(([key, value]) => {
      if (hasBlockedProviderKey(key) || isSnakeCaseKey(key)) {
        warnDataStoreContract('Dropped blocked/snake_case row field.', key);
        return;
      }
      cleaned[key] = value;
    });
    return cleaned;
  }) : [];
  return {
    rows,
    count: typeof source.count === 'number' ? source.count : rows.length,
  };
}

function snakeToCamel(str) {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace('-', '').replace('_', '')
  );
}

function toCamelCase(obj) {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof RegExp) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }
  const newObj = {};
  Object.keys(obj).forEach((key) => {
    const newKey = snakeToCamel(key);
    newObj[newKey] = toCamelCase(obj[key]);
  });
  return newObj;
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function toSnakeCase(obj) {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof RegExp) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  }
  const newObj = {};
  Object.keys(obj).forEach((key) => {
    const newKey = camelToSnake(key);
    newObj[newKey] = toSnakeCase(obj[key]);
  });
  return newObj;
}

export async function request(path, options = {}) {
  if (!BACKEND_ENABLED) {
    throw new Error('Backend disabled');
  }

  const sessionToken = getStoredSessionToken();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const { headers: optionHeaders = {}, ...requestOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
      ...optionHeaders
    }
  });

  if (!response.ok) {
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch { }
    const detail = parsed?.detail || parsed?.message || parsed?.error || text;
    throw new Error(detail || `Request failed: ${response.status}`);
  }

  const json = await response.json();
  return toCamelCase(json);
}

export function withSessionToken(url) {
  const sessionToken = getStoredSessionToken();
  if (!sessionToken) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}session_token=${encodeURIComponent(sessionToken)}`;
}

export async function getAuthStatusApi() {
  return request('/api/auth/status');
}

export async function bootstrapOwnerApi(payload) {
  const response = await request('/api/auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.session || null;
}

export async function loginApi(payload) {
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.session || null;
}

export async function forgotPasswordApi(email) {
  return request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function validateResetTokenApi(token) {
  return request(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
}

export async function resetPasswordApi(payload) {
  return request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getCurrentSessionApi() {
  const response = await request('/api/auth/session');
  return response.session || null;
}

export async function getProfileApi() {
  const response = await request('/api/auth/profile');
  return response.data || null;
}

export async function updateProfileApi(payload) {
  return request('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function uploadAvatarApi(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const result = await request('/api/auth/avatar', {
          method: 'POST',
          body: JSON.stringify({ imageData: base64, mimeType: file.type })
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function deleteAvatarApi() {
  return request('/api/auth/avatar', { method: 'DELETE' });
}

export async function changePasswordApi(payload) {
  return request('/api/auth/password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getAuthSessionsApi() {
  const response = await request('/api/auth/sessions');
  return response.data || [];
}

export async function revokeAuthSessionApi(sessionId) {
  return request(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE'
  });
}

export async function exportUserDataApi() {
  return request('/api/user/export');
}

export async function getExportStatusApi(exportId) {
  return request(`/api/auth/export-data/${encodeURIComponent(exportId)}/status`);
}

export function getExportDownloadUrl(exportId) {
  return `${API_BASE_URL}/api/auth/export-data/${encodeURIComponent(exportId)}/download`;
}

export async function deleteUserAccountApi() {
  return request('/api/auth/account', {
    method: 'DELETE'
  });
}

export async function logoutOtherSessionsApi() {
  return request('/api/auth/sessions/logout-others', {
    method: 'POST'
  });
}

export async function logoutApi() {
  return request('/api/auth/session', {
    method: 'DELETE'
  });
}

export async function switchTenantSessionApi(tenantId) {
  const response = await request('/api/auth/session/tenant', {
    method: 'PATCH',
    body: JSON.stringify({ tenantId })
  });
  return response.session || null;
}

// Canonical generic drafting/generation path. Use this for AI-assisted writing and field help.
export async function draftAiApi(payload) {
  const response = await request('/api/ai/draft', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

// Canonical embedded assist path. This stays grounded on real system state via `/api/ai/assist`.
export async function getOperatorAssistResponseApi(payload) {
  return request('/api/ai/assist', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function runAiCommandApi(payload) {
  const response = await request('/api/ai/command', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if ((response?.status || '').toLowerCase() !== 'success') {
    const rawMessage = response?.message || 'AI command failed.';
    const sanitizePatterns = [/\bconsultation\b/i, /\bconsult\b.*\b(interrupted|failed|error|timeout)\b/i, /\bsystems engineering\b/i, /\bspecialist\b.*\b(interrupted|failed|error)\b/i, /\bagent\b.*\b(interrupted|failed)\b/i, /\bcommand\s+failed\b/i];
    const isSystemError = sanitizePatterns.some(p => p.test(rawMessage));
    throw new Error(isSystemError ? 'Something went wrong. Please try again.' : rawMessage);
  }
  const result = response.result || null;

  // ── Step 0: Navigation Bridge ──────────────────────────────────────────
  if (result?.action === 'navigation' && result?.target) {
    window.dispatchEvent(
      new CustomEvent('aio:navigate', {
        detail: { module: result.target }
      })
    );
  }

  return result;
}

export async function getAiRunsApi(limit = 50, flowId = '') {
  const search = new URLSearchParams({ limit: String(limit) });
  if (flowId) {
    search.set('flowId', flowId);
  }
  const response = await request(`/api/ai/runs?${search.toString()}`);
  return response.data || [];
}

export async function getAiRunApi(runId) {
  const response = await request(`/api/ai/run/${encodeURIComponent(runId)}`);
  if ((response?.status || '').toLowerCase() !== 'success') {
    throw new Error('Unable to load AI run.');
  }
  return response.run || null;
}

export async function getAiAgentsApi(includeHidden = false) {
  const suffix = includeHidden ? '?includeHidden=true' : '';
  const response = await request(`/api/ai/agents${suffix}`);
  return response.data || [];
}

export async function updateAiAgentApi(agentKey, payload) {
  return request(`/api/ai/agents/${encodeURIComponent(agentKey)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function getSystemHealthApi() {
  return request('/api/system/health');
}

export async function getSignalsApi() {
  const response = await request('/api/signals');
  return toCamelCase(response.data || []);
}

export async function dismissSignalApi(signalId) {
  await request(`/api/signals/${signalId}/dismiss`, { method: 'POST' });
}

export async function archiveSignalsApi(signalIds) {
  await request('/api/signals/archive', { method: 'POST', body: JSON.stringify({ signalIds }) });
}

export async function getOmegaStatusApi(limit = 12) {
  const response = await request(`/api/omega/status?limit=${encodeURIComponent(limit)}`);
  return response.data || null;
}

export async function armOmegaApi(payload) {
  const response = await request('/api/omega/arm', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function cancelOmegaApi(payload) {
  const response = await request('/api/omega/cancel', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function executeOmegaApi(payload) {
  const response = await request('/api/omega/execute', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function getAnalyticsSummaryApi() {
  const response = await request('/api/analytics/summary');
  return response.data || {};
}

export async function generateReportApi(payload) {
  const response = await request('/api/cortex/generate-report', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || response;
}

export async function ingestExternalDataApi(payload) {
  const response = await request('/api/analytics/external-data', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function listExternalDataApi() {
  const response = await request('/api/analytics/external-data');
  return response.data || [];
}

export async function getExternalDataApi(dataId) {
  const response = await request(`/api/analytics/external-data/${dataId}`);
  return response.data || null;
}

export async function deleteExternalDataApi(dataId) {
  const response = await request(`/api/analytics/external-data/${dataId}`, {
    method: 'DELETE'
  });
  return response.data || null;
}

export async function ingestContentMetricsApi(payload) {
  const response = await request('/api/analytics/content-metrics', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function listContentMetricsApi(platform = null, limit = 50) {
  const params = platform ? `?platform=${encodeURIComponent(platform)}&limit=${limit}` : `?limit=${limit}`;
  const response = await request(`/api/analytics/content-metrics${params}`);
  return response.data || [];
}

export async function getAiProviderCatalogApi() {
  const response = await request('/api/ai/providers/catalog');
  return response.data || [];
}

export async function getOllamaModelsApi(payload = {}) {
  const response = await request('/api/ai/providers/ollama/models', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || [];
}

export async function getAiProviderConfigsApi() {
  const response = await request('/api/ai/providers');
  return response.data || [];
}

export async function upsertAiProviderConfigApi(providerKey, payload) {
  const response = await request(`/api/ai/providers/${encodeURIComponent(providerKey)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteAiProviderConfigApi(configId) {
  return request(`/api/ai/providers/${encodeURIComponent(configId)}`, {
    method: 'DELETE'
  });
}

export async function testAiProviderConfigApi(configId) {
  return request(`/api/ai/providers/${encodeURIComponent(configId)}/test`, {
    method: 'POST'
  });
}

export async function getAutomationProviderConfigsApi() {
  const response = await request('/api/automation/providers');
  return response.data || [];
}

export async function upsertAutomationProviderConfigApi(providerKey, payload) {
  const response = await request(`/api/automation/providers/${encodeURIComponent(providerKey)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteAutomationProviderConfigApi(configId) {
  return request(`/api/automation/providers/${encodeURIComponent(configId)}`, {
    method: 'DELETE'
  });
}

export async function testAutomationProviderConfigApi(configId) {
  return request(`/api/automation/providers/${encodeURIComponent(configId)}/test`, {
    method: 'POST'
  });
}

export async function getMediaProviderConfigsApi() {
  const response = await request('/api/media/providers');
  return response.data || [];
}

export async function upsertMediaProviderConfigApi(providerKey, payload) {
  const response = await request(`/api/media/providers/${encodeURIComponent(providerKey)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteMediaProviderConfigApi(configId) {
  return request(`/api/media/providers/${encodeURIComponent(configId)}`, {
    method: 'DELETE'
  });
}

export async function testMediaProviderConfigApi(configId) {
  return request(`/api/media/providers/${encodeURIComponent(configId)}/test`, {
    method: 'POST'
  });
}

export async function getDataStoreProviderConfigsApi() {
  const response = await request('/api/data-stores/providers');
  return Array.isArray(response.data) ? response.data.map(sanitizeDataStoreProviderRecord) : [];
}

export async function upsertDataStoreProviderConfigApi(providerKey, payload) {
  const response = await request(`/api/data-stores/providers/${encodeURIComponent(providerKey)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return response.data ? sanitizeDataStoreProviderRecord(response.data) : null;
}

export async function deleteDataStoreProviderConfigApi(providerKey) {
  return request(`/api/data-stores/providers/${encodeURIComponent(providerKey)}`, {
    method: 'DELETE'
  });
}

export async function testDataStoreProviderConfigApi(providerKey) {
  const response = await request(`/api/data-stores/providers/${encodeURIComponent(providerKey)}/test`, {
    method: 'POST'
  });
  return response.data ? sanitizeDataStoreProviderRecord(response.data) : null;
}

export async function readDataStoreRecordsApi(providerKey, payload = {}) {
  const response = await request(`/api/data-stores/providers/${encodeURIComponent(providerKey)}/read-records`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return sanitizeDataStoreRowsEnvelope(response.data);
}

export async function createDataStoreRecordApi(providerKey, payload) {
  const response = await request(`/api/data-stores/providers/${encodeURIComponent(providerKey)}/create-record`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return sanitizeDataStoreRowsEnvelope(response.data);
}

export async function updateDataStoreRecordApi(providerKey, payload) {
  const response = await request(`/api/data-stores/providers/${encodeURIComponent(providerKey)}/update-record`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return sanitizeDataStoreRowsEnvelope(response.data);
}

export async function upsertDataStoreRecordApi(providerKey, payload) {
  const response = await request(`/api/data-stores/providers/${encodeURIComponent(providerKey)}/upsert-record`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return sanitizeDataStoreRowsEnvelope(response.data);
}

export async function getWorkspacesApi() {
  const response = await request('/api/workspaces');
  return response.data || [];
}

export async function createWorkspaceApi(payload) {
  return request('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateWorkspaceApi(workspaceId, payload) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteWorkspaceApi(workspaceId) {
  const response = await request(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE'
  });
  return response.data || null;
}

export async function getWorkspaceMembershipsApi(workspaceId) {
  const response = await request(`/api/workspaces/${encodeURIComponent(workspaceId)}/memberships`);
  return response.data || [];
}

export async function getUserAccessApi(email) {
  if (!email) {
    return null;
  }
  const response = await request(`/api/users/access?email=${encodeURIComponent(email)}`);
  return response.data || null;
}

// DO NOT import getFlowsApi directly in UI components.
// Use FlowsService from /services instead.
export async function getFlowsApi() {
  const response = await request('/api/flows');
  return response.data || [];
}

export async function getFlowApi(flowId) {
  const response = await request(`/api/flows/${encodeURIComponent(flowId)}`);
  return response.data || null;
}

export async function getFlowProviderStatusesApi(flowId) {
  const response = await request(`/api/flows/${encodeURIComponent(flowId)}/provider-statuses`);
  return response.data || {};
}

export async function saveFlowApi(flowId, payload) {
  const response = await request(`/api/flows/${encodeURIComponent(flowId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function triggerFlowManualApi(flowId, payload = {}) {
  const response = await request(`/api/flows/${encodeURIComponent(flowId)}/trigger/manual`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function saveFlowDraftApi(payload) {
  const response = await request('/api/flow-drafts', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function getFlowDraftApi(draftId) {
  const response = await request(`/api/flow-drafts/${encodeURIComponent(draftId)}`);
  return response.data || null;
}

export async function deleteFlowDraftApi(draftId) {
  return request(`/api/flow-drafts/${encodeURIComponent(draftId)}`, {
    method: 'DELETE'
  });
}

export async function deleteFlowApi(flowId) {
  return request(`/api/flows/${encodeURIComponent(flowId)}`, {
    method: 'DELETE'
  });
}

export async function bulkDeleteFlowsApi(ids = null) {
  const payload = ids ? { ids } : { confirm: 'DELETE_ALL_FLOWS' };
  return request('/api/flows', {
    method: 'DELETE',
    body: JSON.stringify(payload)
  });
}

export async function importWorkflowJsonApi({ templateJson, fileName = null, title = null }) {
  const response = await request('/api/flows/ingest-workflow-json', {
    method: 'POST',
    body: JSON.stringify({
      ingestSource: 'import',
      templateJson,
      fileName: fileName || null,
      title: title || null,
    }),
  });
  return response.data || null;
}

export async function getMediaAssetsApi() {
  const response = await request('/api/media/assets');
  return toCamelCase(response.data || []);
}

export async function getVaultApi() {
  const response = await request('/api/vault');
  return toCamelCase(response.data || []);
}

export async function getMediaRenderJobsApi() {
  const response = await request('/api/media/render-jobs');
  return toCamelCase(response.data || []);
}

export async function getMediaTranscriptJobsApi() {
  const response = await request('/api/media/transcript-jobs');
  return toCamelCase(response.data || []);
}

export async function getMediaTranscriptArtifactsApi() {
  const response = await request('/api/media/transcript-artifacts');
  return toCamelCase(response.data || []);
}

export async function getMediaScriptJobsApi() {
  const response = await request('/api/media/script-jobs');
  return toCamelCase(response.data || []);
}

export async function getMediaScriptArtifactsApi() {
  const response = await request('/api/media/script-artifacts');
  return toCamelCase(response.data || []);
}

export async function getMediaRunOfShowJobsApi() {
  const response = await request('/api/media/run-of-show-jobs');
  return toCamelCase(response.data || []);
}

export async function getMediaRunOfShowArtifactsApi() {
  const response = await request('/api/media/run-of-show-artifacts');
  return toCamelCase(response.data || []);
}

export async function getMediaAudioRenderJobsApi() {
  const response = await request('/api/media/audio-render-jobs');
  return toCamelCase(response.data || []);
}

export async function getMediaPublishJobsApi() {
  const response = await request('/api/media/publish-jobs');
  return toCamelCase(response.data || []);
}

export async function getMediaPublishArtifactsApi() {
  const response = await request('/api/media/publish-artifacts');
  return toCamelCase(response.data || []);
}

export async function createMediaScriptJobApi(payload) {
  const response = await request('/api/media/script-jobs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return toCamelCase(response.data || null);
}

export async function createMediaRunOfShowJobApi(payload) {
  const response = await request('/api/media/run-of-show-jobs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return toCamelCase(response.data || null);
}

export async function createMediaAudioRenderJobApi(payload) {
  const response = await request('/api/media/audio-render-jobs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return toCamelCase(response.data || null);
}

export async function generateAudioAssetApi(payload) {
  // payload: { audioSubtype: 'music'|'sfx', prompt, title?, duration? }
  const response = await request('/api/media/audio-generate', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return toCamelCase(response.data || null);
}

export async function createMediaRenderJobApi(payload) {
  const response = await request('/api/media/render-jobs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return toCamelCase(response.data || null);
}

export async function getMediaRenderTemplatesApi() {
  const response = await request('/api/media/render-templates');
  const data = toCamelCase(response.data || null);
  const templates = Array.isArray(data?.templates)
    ? data.templates.map((template) => ({
      ...template,
      id: template?.templateId || '',
      label: template?.humanLabel || template?.templateId || '',
    }))
    : [];
  return {
    ...(data || {}),
    templates,
  };
}

export async function createMediaTranscriptJobApi(payload) {
  const response = await request('/api/media/transcript-jobs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return toCamelCase(response.data || null);
}

export async function ingestMeetingMediaApi(payload) {
  const response = await request('/api/media/meeting-ingestion', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return toCamelCase(response.data || null);
}

export async function uploadMediaFileApi(file, tags = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (tags) {
    formData.append('tags', tags);
  }
  const response = await request('/api/media/upload', {
    method: 'POST',
    body: formData,
  });
  return toCamelCase(response.data || null);
}

export async function createMediaPublishJobApi(payload) {
  const response = await request('/api/media/publish-jobs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return toCamelCase(response.data || null);
}

export async function deleteMediaAssetApi(assetId) {
  const response = await request(`/api/media/assets/${encodeURIComponent(assetId)}`, {
    method: 'DELETE'
  });
  return response;
}

export async function deleteMediaJobApi(jobType, jobId) {
  const response = await request(`/api/media/jobs/${encodeURIComponent(jobType)}/${encodeURIComponent(jobId)}`, {
    method: 'DELETE'
  });
  return response;
}

export async function deleteMediaArtifactApi(artifactType, artifactId) {
  const response = await request(`/api/media/artifacts/${encodeURIComponent(artifactType)}/${encodeURIComponent(artifactId)}`, {
    method: 'DELETE'
  });
  return response;
}

export async function getMediaJobStatusApi(jobType, jobId) {
  const response = await request(`/api/media/jobs/${encodeURIComponent(jobType)}/${encodeURIComponent(jobId)}`);
  return toCamelCase(response.data || null);
}

export async function probeMediaAssetApi(payload) {
  const response = await request('/api/media/probe', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return toCamelCase(response.data || null);
}

export async function createOrderApi(payload) {
  const response = await request('/api/orders', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function updateOrderApi(orderId, payload) {
  const response = await request(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteOrderApi(orderId) {
  const response = await request(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'DELETE'
  });
  return response;
}

export async function createFlowFolderApi(name) {
  const response = await request('/api/flow-folders', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  return response.data || null;
}

export async function listFlowFoldersApi() {
  const response = await request('/api/flow-folders');
  return response.data || [];
}

export async function renameFlowFolderApi(folderId, name) {
  const response = await request(`/api/flow-folders/${encodeURIComponent(folderId)}`, {
    method: 'PUT',
    body: JSON.stringify({ name })
  });
  return response.data || null;
}

export async function deleteFlowFolderApi(folderId) {
  const response = await request(`/api/flow-folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE'
  });
  return response;
}

export async function addWorkspaceMemberApi(workspaceId, payload) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/memberships`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function createWorkspaceUserApi(workspaceId, payload) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/users`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateWorkspaceMemberApi(workspaceId, membershipId, payload) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/memberships/${encodeURIComponent(membershipId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function removeWorkspaceMemberApi(workspaceId, membershipId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/memberships/${encodeURIComponent(membershipId)}`, {
    method: 'DELETE'
  });
}

export async function getWorkspaceRolesApi(workspaceId) {
  const response = await request(`/api/workspaces/${encodeURIComponent(workspaceId)}/roles`);
  return response.data || null;
}

export async function createWorkspaceRoleApi(workspaceId, payload) {
  const response = await request(`/api/workspaces/${encodeURIComponent(workspaceId)}/roles`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function updateWorkspaceRoleApi(workspaceId, roleId, payload) {
  const response = await request(`/api/workspaces/${encodeURIComponent(workspaceId)}/roles/${encodeURIComponent(roleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function attachWorkspaceRoleApi(workspaceId, roleId, payload) {
  const response = await request(`/api/workspaces/${encodeURIComponent(workspaceId)}/roles/${encodeURIComponent(roleId)}/assignments`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function detachWorkspaceRoleApi(workspaceId, roleId, entityType, entityId) {
  const params = new URLSearchParams({ entityType, entityId });
  const response = await request(`/api/workspaces/${encodeURIComponent(workspaceId)}/roles/${encodeURIComponent(roleId)}/assignments?${params.toString()}`, {
    method: 'DELETE'
  });
  return response.data || null;
}

export async function getGlobalVariablesApi() {
  const response = await request('/api/settings/variables');
  return response.data || [];
}

export async function getCanonicalSettingsApi() {
  const response = await request('/api/settings/canonical');
  return response.data || null;
}

export async function updateCanonicalTenantSettingsApi(settings) {
  const response = await request('/api/settings/canonical/tenant', {
    method: 'PATCH',
    body: JSON.stringify({ settings })
  });
  return response.data || null;
}

export async function getEmailVerifierConfigApi() {
  const response = await request('/api/email-verifier/config');
  return response.data || null;
}

export async function updateEmailVerifierConfigApi(payload) {
  const response = await request('/api/email-verifier/config', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function testEmailVerifierConfigApi() {
  return request('/api/email-verifier/config/test', {
    method: 'POST'
  });
}

export async function deleteEmailVerifierConfigApi() {
  const response = await request('/api/email-verifier/config', {
    method: 'DELETE'
  });
  return response.data || null;
}

export async function verifyEmailApi(payload) {
  const response = await request('/api/email-verifier/verify', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function createEmailVerificationBulkTaskApi(payload) {
  const response = await request('/api/email-verifier/bulk', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function getEmailVerificationBulkTaskApi(taskId) {
  const response = await request(`/api/email-verifier/bulk/${encodeURIComponent(taskId)}`);
  return response.data || null;
}

export async function getBrainOverviewApi() {
  const response = await request('/api/brain/overview');
  return response.data || null;
}

export async function getBrainProfileApi() {
  const response = await request('/api/brain/profile');
  return response.data || null;
}

export async function updateBrainProfileApi(payload) {
  const response = await request('/api/brain/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function getBrainSourcesApi() {
  const response = await request('/api/brain/sources');
  return response.data || [];
}

export async function createBrainSourceApi(payload) {
  const response = await request('/api/brain/sources', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function updateBrainSourceApi(sourceId, payload) {
  const response = await request(`/api/brain/sources/${encodeURIComponent(sourceId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteBrainSourceApi(sourceId) {
  return request(`/api/brain/sources/${encodeURIComponent(sourceId)}`, {
    method: 'DELETE'
  });
}

export async function getBrainItemsApi() {
  const response = await request('/api/brain/items');
  return response.data || [];
}

export async function createBrainItemApi(payload) {
  const response = await request('/api/brain/items', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function updateBrainItemApi(itemId, payload) {
  const response = await request(`/api/brain/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteBrainItemApi(itemId) {
  return request(`/api/brain/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE'
  });
}

export async function getBrainLinksApi() {
  const response = await request('/api/brain/links');
  return response.data || [];
}

export async function createBrainLinkApi(payload) {
  const response = await request('/api/brain/links', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteBrainLinkApi(linkId) {
  return request(`/api/brain/links/${encodeURIComponent(linkId)}`, {
    method: 'DELETE'
  });
}

export async function getBrainIngestsApi(sourceId = '', limit = 25) {
  const params = new URLSearchParams();
  if (sourceId) params.set('sourceId', sourceId);
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await request(`/api/brain/ingests${suffix}`);
  return response.data || [];
}

export async function createBrainIngestApi(payload) {
  const response = await request('/api/brain/ingests', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function probeBrainMcpApi(sourceId) {
  const response = await request(`/api/brain/mcp/${encodeURIComponent(sourceId)}/probe`, {
    method: 'POST'
  });
  return response.data || null;
}

export async function queryBrainMcpApi(sourceId, payload) {
  const response = await request(`/api/brain/mcp/${encodeURIComponent(sourceId)}/query`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function searchBrainMemoryApi(query, limit = 6, options = {}) {
  const params = new URLSearchParams({ query, limit: String(limit) });
  if (options.includeRuntime) {
    params.set('includeRuntime', 'true');
  }
  const response = await request(`/api/brain/search?${params.toString()}`);
  return response.data || [];
}

export async function saveTranscriptApi(payload) {
  const response = await request('/api/transcripts/save', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function upsertGlobalVariableApi(payload) {
  const response = await request('/api/settings/variables', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteGlobalVariableApi(variableId) {
  return request(`/api/settings/variables/${encodeURIComponent(variableId)}`, {
    method: 'DELETE'
  });
}

export async function getSystemEmailTemplatesApi(search = '') {
  const suffix = search ? `?search=${encodeURIComponent(search)}` : '';
  const response = await request(`/api/settings/system-emails${suffix}`);
  return response.data || [];
}

export async function updateSystemEmailTemplateApi(templateId, payload) {
  const response = await request(`/api/settings/system-emails/${encodeURIComponent(templateId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export function getGoogleAppAuthorizeUrl() {
  return withSessionToken(`${API_BASE_URL}/api/auth/google/authorize`);
}

// DO NOT import getContactsApi directly in UI components.
// Use ContactsService from /services instead.
export async function getContactsApi() {
  const response = await request('/api/contacts');
  return response.data || [];
}

export async function createContactApi(payload) {
  const response = await request('/api/contacts', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function updateContactApi(contactId, payload) {
  const response = await request(`/api/contacts/${encodeURIComponent(contactId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteContactApi(contactId) {
  return request(`/api/contacts/${encodeURIComponent(contactId)}`, {
    method: 'DELETE'
  });
}

export async function restoreContactApi(contactId) {
  return request(`/api/contacts/${encodeURIComponent(contactId)}/restore`, {
    method: 'POST'
  });
}

export async function listDeletedContactsApi() {
  const response = await request('/api/contacts/deleted');
  return response.data || [];
}

export async function bulkDeleteContactsApi(ids = null) {
  const payload = ids ? { ids } : { confirm: 'DELETE_ALL_CONTACTS' };
  return request('/api/contacts', {
    method: 'DELETE',
    body: JSON.stringify(payload)
  });
}

export async function getContactActivitiesApi(contactId) {
  const response = await request(`/api/contacts/${encodeURIComponent(contactId)}/activities`);
  return response.data || [];
}

export async function createContactActivityApi(contactId, payload) {
  const response = await request(`/api/contacts/${encodeURIComponent(contactId)}/activities`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function getContactFormSubmissionsApi(contactId) {
  const response = await request(`/api/contacts/${encodeURIComponent(contactId)}/form-submissions`);
  return response.data || [];
}

export async function getOrdersApi() {
  const response = await request('/api/orders');
  return response.data || [];
}

export async function getCompaniesApi() {
  const response = await request('/api/companies');
  return response.data || [];
}

export async function getCompanyApi(companyId) {
  const response = await request(`/api/companies/${encodeURIComponent(companyId)}`);
  return response.data || null;
}

export async function updateCompanyApi(companyId, payload) {
  const response = await request(`/api/companies/${encodeURIComponent(companyId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function getCalendarsApi() {
  const response = await request('/api/calendars');
  return response.data || [];
}

export async function getCalendarEventsApi() {
  const response = await request('/api/calendar/events');
  return response.data || [];
}

export async function createCalendarEventApi(payload) {
  const response = await request('/api/calendar/events', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function updateCalendarEventApi(eventId, payload) {
  return request(`/api/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteCalendarEventApi(eventId) {
  return request(`/api/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE'
  });
}

export async function pushCalendarEventApi(eventId, sourceId = null) {
  return request(`/api/calendar/events/${encodeURIComponent(eventId)}/push`, {
    method: 'POST',
    body: JSON.stringify({ sourceId })
  });
}

export async function reconcileCalendarEventApi(eventId, strategy) {
  return request(`/api/calendar/events/${encodeURIComponent(eventId)}/reconcile`, {
    method: 'POST',
    body: JSON.stringify({ strategy })
  });
}

export async function getCalendarSourcesApi() {
  const response = await request('/api/calendar/sources');
  return response.data || [];
}

export async function getCalendarProvidersApi() {
  const response = await request('/api/calendar/providers');
  return response.data || [];
}

export async function createCalendarSourceApi(payload) {
  return request('/api/calendar/sources', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateCalendarSourceApi(sourceId, payload) {
  return request(`/api/calendar/sources/${encodeURIComponent(sourceId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function listCalendarSourceCalendarsApi(sourceId) {
  const response = await request(`/api/calendar/sources/${encodeURIComponent(sourceId)}/available-calendars`);
  return response.data || [];
}

export async function deleteCalendarSourceApi(sourceId, fallbackSourceId) {
  const search = fallbackSourceId ? `?fallbackSourceId=${encodeURIComponent(fallbackSourceId)}` : '';
  return request(`/api/calendar/sources/${encodeURIComponent(sourceId)}${search}`, {
    method: 'DELETE'
  });
}

export async function disconnectCalendarSourceApi(sourceId) {
  return request(`/api/calendar/sources/${encodeURIComponent(sourceId)}/disconnect`, {
    method: 'POST'
  });
}

export async function testCalendarSourceApi(sourceId) {
  return request(`/api/calendar/sources/${encodeURIComponent(sourceId)}/test-connection`, {
    method: 'POST'
  });
}

export async function syncCalendarSourceApi(sourceId) {
  return request(`/api/calendar/sources/${encodeURIComponent(sourceId)}/sync`, {
    method: 'POST'
  });
}

export async function importCalendarSourceApi(sourceId) {
  return request(`/api/calendar/sources/${encodeURIComponent(sourceId)}/import`, {
    method: 'POST'
  });
}

export async function getCalendarSourceAuthorizeUrl(sourceId) {
  const response = await fetch(`${API_BASE_URL}/api/calendar/sources/${encodeURIComponent(sourceId)}/authorize`, {
    credentials: 'include'
  });
  if (response.redirected) {
    return response.url;
  }
  const data = await response.json().catch(() => ({}));
  if (data.detail) {
    throw new Error(data.detail);
  }
  return null;
}

export async function getBookingTypesApi() {
  const response = await request('/api/booking-types');
  return response.data || [];
}

export async function createBookingTypeApi(payload) {
  const response = await request('/api/booking-types', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function updateBookingTypeApi(bookingTypeId, payload) {
  const response = await request(`/api/booking-types/${encodeURIComponent(bookingTypeId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteBookingTypeApi(bookingTypeId) {
  return request(`/api/booking-types/${encodeURIComponent(bookingTypeId)}`, {
    method: 'DELETE'
  });
}

export async function getMailboxesApi() {
  const response = await request('/api/mailboxes');
  return response.data || [];
}

export async function createMailboxApi(payload) {
  return request('/api/mailboxes', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getMailboxProvidersApi() {
  const response = await request('/api/mailboxes/providers');
  return response.data || [];
}

export async function updateMailboxApi(mailboxId, payload) {
  return request(`/api/mailboxes/${encodeURIComponent(mailboxId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteMailboxApi(mailboxId, fallbackMailboxId) {
  const search = fallbackMailboxId ? `?fallbackMailboxId=${encodeURIComponent(fallbackMailboxId)}` : '';
  return request(`/api/mailboxes/${encodeURIComponent(mailboxId)}${search}`, {
    method: 'DELETE'
  });
}

export async function disconnectMailboxApi(mailboxId) {
  return request(`/api/mailboxes/${encodeURIComponent(mailboxId)}/disconnect`, {
    method: 'POST'
  });
}

export async function getMailboxEventsApi(mailboxId) {
  const response = await request(`/api/mailboxes/${encodeURIComponent(mailboxId)}/events`);
  return response.data || [];
}

export async function syncMailboxApi(mailboxId) {
  return request(`/api/mailboxes/${encodeURIComponent(mailboxId)}/sync`, {
    method: 'POST'
  });
}

export async function testMailboxConnectionApi(mailboxId) {
  return request(`/api/mailboxes/${encodeURIComponent(mailboxId)}/test-connection`, {
    method: 'POST'
  });
}

export async function getMailboxAuthorizeUrl(mailboxId) {
  const response = await fetch(`${API_BASE_URL}/api/mailboxes/${encodeURIComponent(mailboxId)}/authorize`, {
    credentials: 'include'
  });
  if (response.redirected) {
    return response.url;
  }
  const data = await response.json().catch(() => ({}));
  if (data.detail) {
    throw new Error(data.detail);
  }
  return null;
}

export async function ingestMailboxMessageApi(mailboxId, payload) {
  return request(`/api/mailboxes/${encodeURIComponent(mailboxId)}/ingest`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getTagsApi(prefix = null) {
  const url = prefix ? `/api/tags?prefix=${encodeURIComponent(prefix)}` : '/api/tags';
  const response = await request(url);
  return response.data || [];
}

export async function createTagApi(payload) {
  const response = await request('/api/tags', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function updateTagApi(tagId, updates) {
  const response = await request(`/api/tags/${tagId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
  return response.data || null;
}

export async function deleteTagApi(tagId) {
  const response = await request(`/api/tags/${tagId}`, {
    method: 'DELETE'
  });
  return response.success || false;
}

// Canonical prefix list for frontend validation
export const CANONICAL_TAG_PREFIXES = ['AI', 'AUT', 'CRM', 'CS', 'MKT', 'MKG', 'MTG', 'CP', 'CD', 'EVT', 'OPS', 'PM', 'META'];

export function validateTagFormat(name) {
  if (!name || !name.includes(':')) return { valid: false, error: 'Tag must follow PREFIX:NAME format.' };
  const [prefix] = name.toUpperCase().split(':');
  if (!CANONICAL_TAG_PREFIXES.includes(prefix)) {
    return { valid: false, error: `Invalid prefix '${prefix}'. Allowed: ${CANONICAL_TAG_PREFIXES.join(', ')}` };
  }
  return { valid: true };
}

export async function getFormFoldersApi() {
  const response = await request('/api/form-folders');
  return response.data || [];
}

export async function createFormFolderApi(payload) {
  const response = await request('/api/form-folders', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function updateFormFolderApi(folderId, payload) {
  const response = await request(`/api/form-folders/${encodeURIComponent(folderId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteFormFolderApi(folderId) {
  return request(`/api/form-folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE'
  });
}

// DO NOT import getFormsApi directly in UI components.
// Use FormsService from /services instead.
export async function getFormsApi(summary = false) {
  const response = await request(`/api/forms?summary=${summary}`);
  return response.data || [];
}

export async function createFormApi(payload) {
  const response = await request('/api/forms', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function updateFormApi(formId, payload) {
  const response = await request(`/api/forms/${encodeURIComponent(formId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data || null;
}

export async function deleteFormApi(formId) {
  return request(`/api/forms/${encodeURIComponent(formId)}`, {
    method: 'DELETE'
  });
}

export async function bulkDeleteFormsApi(ids = null) {
  const payload = ids ? { ids } : { confirm: 'DELETE_ALL_FORMS' };
  return request('/api/forms', {
    method: 'DELETE',
    body: JSON.stringify(payload)
  });
}

export async function getCmsTablesApi() {
  const response = await request('/api/cms/tables');
  return response.data || [];
}

export async function getCmsTableDataApi(slug) {
  const response = await request(`/api/cms/tables/${encodeURIComponent(slug)}`);
  return response.data || [];
}

export async function getFormBySlugApi(slug) {
  const response = await request(`/api/forms/by-slug/${encodeURIComponent(slug)}`);
  return response.data || null;
}

export async function getFormByIdApi(formId) {
  const response = await request(`/api/forms/${encodeURIComponent(formId)}`);
  return response.data || null;
}

export async function submitFormApi(formId, formData) {
  return request(`/api/forms/${encodeURIComponent(formId)}/submit`, {
    method: 'POST',
    body: JSON.stringify({ formData })
  });
}

export async function getCommsSnapshotApi() {
  return request('/api/comms/snapshot');
}

export async function createThreadApi(payload) {
  return request('/api/comms/threads', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function openThreadForContactApi(payload) {
  return request('/api/comms/threads/open', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function sendThreadMessageApi(threadId, payload) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function sendThreadEmailApi(threadId, payload) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/send-email`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateThreadStatusApi(threadId, status) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

export async function assignThreadApi(threadId, assigneeName) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ assigneeName })
  });
}

export async function updateThreadMailboxApi(threadId, mailboxId) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/mailbox`, {
    method: 'PATCH',
    body: JSON.stringify({ mailboxId })
  });
}

export async function summarizeThreadApi(threadId) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/summarize`, {
    method: 'POST'
  });
}

export async function createThreadDraftApi(threadId, mode = 'reply') {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/draft`, {
    method: 'POST',
    body: JSON.stringify({ mode })
  });
}

export async function createDealFromThreadApi(threadId) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/create-deal`, {
    method: 'POST'
  });
}

export async function advanceThreadStageApi(threadId) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/advance-stage`, {
    method: 'POST'
  });
}

export async function scheduleThreadMeetingApi(threadId, scheduledAt = null) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/schedule-meeting`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt })
  });
}

export async function createThreadReportApi(threadId, kind = 'operator') {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/reports`, {
    method: 'POST',
    body: JSON.stringify({ kind })
  });
}

export async function deleteThreadApi(threadId) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}`, {
    method: 'DELETE'
  });
}

// ============ SMS / VOIP COMMS API ============

export async function getCommsOverviewApi() {
  const response = await request('/api/comms/overview');
  return response.data || {};
}

export async function getPhoneNumbersApi() {
  const response = await request('/api/comms/phone-numbers');
  return response.data || [];
}

export async function createPhoneNumberApi(payload) {
  const response = await request('/api/comms/phone-numbers', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function updatePhoneNumberApi(numberId, payload) {
  const response = await request(`/api/comms/phone-numbers/${encodeURIComponent(numberId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function deletePhoneNumberApi(numberId) {
  return request(`/api/comms/phone-numbers/${encodeURIComponent(numberId)}`, {
    method: 'DELETE'
  });
}

export async function getSmsThreadsApi(limit = 50) {
  const response = await request(`/api/comms/sms-threads?limit=${limit}`);
  return response.data || [];
}

export async function createSmsThreadApi(payload) {
  const response = await request('/api/comms/sms-threads', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function addSmsMessageApi(threadId, payload) {
  const response = await request(`/api/comms/sms-threads/${encodeURIComponent(threadId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function getSmsPlansApi() {
  const response = await request('/api/comms/sms-plans');
  return response.data || [];
}

export async function createSmsPlanApi(payload) {
  const response = await request('/api/comms/sms-plans', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function updateSmsPlanApi(planId, payload) {
  const response = await request(`/api/comms/sms-plans/${encodeURIComponent(planId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function getSmsThreadApi(threadId) {
  const response = await request(`/api/comms/sms-threads/${encodeURIComponent(threadId)}`);
  return response.data || null;
}

export async function getSmsMessagesApi(threadId) {
  const response = await request(`/api/comms/sms-threads/${encodeURIComponent(threadId)}/messages`);
  return response.data || [];
}

export async function sendSmsApi(payload) {
  const response = await request('/api/comms/sms/send', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function checkOptOutApi(phoneNumber) {
  const response = await request(`/api/comms/sms/opt-out-check?phone_number=${encodeURIComponent(phoneNumber)}`);
  return response.data || { optedOut: false };
}

export async function getContactsWithPhoneApi() {
  const response = await request('/api/comms/contacts-with-phone');
  return response.data || [];
}

export async function getExtensionsApi() {
  const response = await request('/api/comms/extensions');
  return response.data || [];
}

export async function createExtensionApi(payload) {
  const response = await request('/api/comms/extensions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function getRingGroupsApi() {
  const response = await request('/api/comms/ring-groups');
  return response.data || [];
}

export async function createRingGroupApi(payload) {
  const response = await request('/api/comms/ring-groups', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function getCallSessionsApi(limit = 50) {
  const response = await request(`/api/comms/call-sessions?limit=${limit}`);
  return response.data || [];
}

export async function createCallSessionApi(payload) {
  const response = await request('/api/comms/call-sessions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function updateCallSessionApi(sessionId, payload) {
  const response = await request(`/api/comms/call-sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function startOutboundCallApi(payload) {
  const response = await request('/api/comms/calls/start', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function endCallSessionApi(callId, payload) {
  const response = await request(`/api/comms/calls/${encodeURIComponent(callId)}/end`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function getCallSessionApi(callId) {
  const response = await request(`/api/comms/calls/${encodeURIComponent(callId)}`);
  return response.data || null;
}

export async function getCommsRoutesApi() {
  const response = await request('/api/comms/routes');
  return response.data || { extensions: [], ringGroups: [], phoneNumbers: [] };
}

export async function getCommsContactSummaryApi(contactId) {
  const response = await request(`/api/comms/contact-summary/${encodeURIComponent(contactId)}`);
  return response.data || { contactId, smsThreadCount: 0, callCount: 0, lastSmsAt: null, lastCallAt: null };
}

export async function createCommsActivityApi(payload) {
  const response = await request('/api/comms/contact-activity', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function getCommsIntegrationInfoApi() {
  const response = await request('/api/comms/integration-info');
  return response.data || {
    eventTypes: [],
    activityTypes: [],
    artifactClassifications: {},
    providerStatus: 'stub',
    providerName: 'Stub',
    isProviderActive: false,
    availableProviders: [],
    crmIntegration: 'not_available',
    signalsIntegration: 'not_available',
    flowsTriggerReadiness: 'not_available',
    vaultCortexReadiness: 'not_available',
  };
}

export async function getCommsProviderConfigsApi() {
  const response = await request('/api/comms/provider-configs');
  return response.data || [];
}

export async function saveCommsProviderConfigApi(providerType, config, isActive = false) {
  const response = await request('/api/comms/provider-configs', {
    method: 'POST',
    body: JSON.stringify({ providerType, config, isActive })
  });
  return response.data;
}

export async function verifyCommsProviderConfigApi(providerType, config) {
  const response = await request('/api/comms/verify-provider', {
    method: 'POST',
    body: JSON.stringify({ providerType, config })
  });
  return response.data;
}

export async function deleteCommsProviderConfigApi(providerType) {
  const response = await request(`/api/comms/provider-configs/${encodeURIComponent(providerType)}`, {
    method: 'DELETE'
  });
  return response.data;
}

export function isBackendEnabled() {
  return BACKEND_ENABLED;
}

export async function getPaymentProviderConfigsApi() {
  const response = await request('/api/payments/providers');
  return response.data || [];
}

export async function upsertPaymentProviderConfigApi(providerKey, payload) {
  const response = await request(`/api/payments/providers/${encodeURIComponent(providerKey)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function deletePaymentProviderConfigApi(configId) {
  return request(`/api/payments/providers/${encodeURIComponent(configId)}`, {
    method: 'DELETE'
  });
}

export async function testPaymentProviderConfigApi(configId) {
  const response = await request(`/api/payments/providers/${encodeURIComponent(configId)}/test`, {
    method: 'POST'
  });
  return response.data;
}

// --- Social Network Provider APIs ---

export async function getSocialProviderConfigsApi() {
  const response = await request('/api/social-networks/providers');
  return response.data || [];
}

export async function upsertSocialProviderConfigApi(providerKey, payload) {
  const response = await request(`/api/social-networks/providers/${encodeURIComponent(providerKey)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function deleteSocialProviderConfigApi(configId) {
  return request(`/api/social-networks/providers/${encodeURIComponent(configId)}`, {
    method: 'DELETE'
  });
}

// --- Help Desk APIs ---

export async function getHelpTicketsApi() {
  const response = await request('/api/help/tickets');
  return response.data || [];
}

export async function createHelpTicketApi(payload) {
  const response = await request('/api/help/tickets', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function updateHelpTicketApi(ticketId, payload) {
  const response = await request(`/api/help/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return response.data;
}

// --- Notification APIs ---

export async function getNotificationsApi(limit = 50, unreadOnly = false) {
  const suffix = unreadOnly ? `?limit=${limit}&unreadOnly=true` : `?limit=${limit}`;
  const response = await request(`/api/notifications${suffix}`);
  return { data: response.data || [], unreadCount: response.unreadCount || 0 };
}

export async function markNotificationReadApi(notificationId) {
  return request(`/api/notifications/${encodeURIComponent(notificationId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ read: true })
  });
}

export async function markAllNotificationsReadApi() {
  return request('/api/notifications/read-all', {
    method: 'POST'
  });
}

export async function deleteNotificationApi(notificationId) {
  return request(`/api/notifications/${encodeURIComponent(notificationId)}`, {
    method: 'DELETE'
  });
}

// ── Help / Documentation ─────────────────────────────────────────────────────

export async function getHelpArticlesApi() {
  const response = await request('/api/help/articles');
  return response.data || [];
}

export async function getHelpBroadcastsApi() {
  const response = await request('/api/help/broadcasts');
  return response.data || [];
}

export async function generateDocsApi() {
  const response = await request('/api/help/generate-docs', { method: 'POST' });
  return response.data || null;
}

export async function captureMissingHelpApi(query) {
  const response = await request('/api/help/missing', {
    method: 'POST',
    body: JSON.stringify({ query })
  });
  return response.data || null;
}

export async function voicePreviewApi(payload) {
  return request('/api/media/voice-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export { API_BASE_URL };
