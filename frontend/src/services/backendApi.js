import { getStoredSessionToken } from './authStorage';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001').replace(/\/$/, '');
const BACKEND_ENABLED = import.meta.env.VITE_USE_BACKEND !== 'false';

export function getApiBaseUrl() {
  return API_BASE_URL;
}

async function request(path, options = {}) {
  if (!BACKEND_ENABLED) {
    throw new Error('Backend disabled');
  }

  const sessionToken = getStoredSessionToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    const detail = parsed?.detail || parsed?.message || parsed?.error || text;
    throw new Error(detail || `Request failed: ${response.status}`);
  }

  return response.json();
}

function withSessionToken(url) {
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

export async function getCurrentSessionApi() {
  const response = await request('/api/auth/session');
  return response.session || null;
}

export async function logoutApi() {
  return request('/api/auth/session', {
    method: 'DELETE'
  });
}

export async function switchTenantSessionApi(tenantId) {
  const response = await request('/api/auth/session/tenant', {
    method: 'PATCH',
    body: JSON.stringify({ tenant_id: tenantId })
  });
  return response.session || null;
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

export function getGoogleAppAuthorizeUrl() {
  return withSessionToken(`${API_BASE_URL}/api/auth/google/authorize`);
}

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

export async function getContactActivitiesApi(contactId) {
  const response = await request(`/api/contacts/${encodeURIComponent(contactId)}/activities`);
  return response.data || [];
}

export async function getContactFormSubmissionsApi(contactId) {
  const response = await request(`/api/contacts/${encodeURIComponent(contactId)}/form-submissions`);
  return response.data || [];
}

export async function getCompaniesApi() {
  const response = await request('/api/companies');
  return response.data || [];
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
    body: JSON.stringify({ source_id: sourceId })
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

export async function deleteCalendarSourceApi(sourceId, fallbackSourceId) {
  const search = fallbackSourceId ? `?fallback_source_id=${encodeURIComponent(fallbackSourceId)}` : '';
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

export function getCalendarSourceAuthorizeUrl(sourceId) {
  return withSessionToken(`${API_BASE_URL}/api/calendar/sources/${encodeURIComponent(sourceId)}/authorize`);
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
  const search = fallbackMailboxId ? `?fallback_mailbox_id=${encodeURIComponent(fallbackMailboxId)}` : '';
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

export function getMailboxAuthorizeUrl(mailboxId) {
  return withSessionToken(`${API_BASE_URL}/api/mailboxes/${encodeURIComponent(mailboxId)}/authorize`);
}

export async function ingestMailboxMessageApi(mailboxId, payload) {
  return request(`/api/mailboxes/${encodeURIComponent(mailboxId)}/ingest`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getTagsApi() {
  const response = await request('/api/tags');
  return response.data || [];
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

export async function getFormsApi() {
  const response = await request('/api/forms');
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
    body: JSON.stringify({ form_data: formData })
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
    body: JSON.stringify({ assignee_name: assigneeName })
  });
}

export async function updateThreadMailboxApi(threadId, mailboxId) {
  return request(`/api/comms/threads/${encodeURIComponent(threadId)}/mailbox`, {
    method: 'PATCH',
    body: JSON.stringify({ mailbox_id: mailboxId })
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
    body: JSON.stringify({ scheduled_at: scheduledAt })
  });
}

export function isBackendEnabled() {
  return BACKEND_ENABLED;
}

export { API_BASE_URL };
