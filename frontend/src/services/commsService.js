import { mockSupabase } from './mockSupabase';
import { emit } from './eventBus';

const DEFAULT_TENANT_ID = 'tenant-aio';
const DEFAULT_WORKSPACE_ID = 'workspace-primary';
const DEFAULT_USER = 'AIO Flow';

export const QUEUE_DEFINITIONS = [
  { id: 'now', label: 'Now', matcher: (thread) => thread.status === 'new' || thread.aiFlags.needs_human || thread.priority_score >= 88 },
  { id: 'needs-reply', label: 'Needs Reply', matcher: (thread) => thread.status === 'waiting_on_us' },
  { id: 'waiting', label: 'Waiting', matcher: (thread) => thread.status === 'waiting_on_them' },
  { id: 'hot-leads', label: 'Hot Leads', matcher: (thread) => thread.aiFlags.hot_lead || thread.aiFlags.high_intent },
  { id: 'at-risk', label: 'At Risk', matcher: (thread) => thread.aiFlags.at_risk },
  { id: 'scheduled', label: 'Scheduled Follow-ups', matcher: (thread) => thread.status === 'scheduled' || thread.aiFlags.follow_up_due },
  { id: 'automated', label: 'Automated', matcher: (thread) => thread.automation_state === 'automated' },
  { id: 'closed', label: 'Closed', matcher: (thread) => thread.status === 'closed' }
];

const ACTIVITY_TYPE = { email: 'email', sms: 'sms', internal: 'note' };
const getDb = () => mockSupabase.db;
const isoMinutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const slugify = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const normalizeFlags = (flags = {}) => ({
  high_intent: Boolean(flags.high_intent),
  at_risk: Boolean(flags.at_risk),
  hot_lead: Boolean(flags.hot_lead),
  needs_human: Boolean(flags.needs_human),
  follow_up_due: Boolean(flags.follow_up_due)
});

const ensureActivityTable = () => {
  const db = getDb();
  if (!db.contact_activities) db.contact_activities = [];
  return db.contact_activities;
};

const logContactActivity = ({ thread, message }) => {
  if (!thread?.contact_id) return;
  ensureActivityTable().push({
    id: `activity-${message.id}`,
    contact_id: thread.contact_id,
    user_id: 'user-1',
    activity_type: ACTIVITY_TYPE[thread.channel_type] || 'note',
    title: `${thread.channel_type.toUpperCase()} ${message.direction === 'inbound' ? 'received' : message.direction === 'outbound' ? 'sent' : 'logged'}`,
    description: message.plain_text,
    metadata: { thread_id: thread.id, subject: thread.subject, channel_type: thread.channel_type },
    created_at: message.created_at
  });
};

const ensureCommsTables = () => {
  const db = getDb();
  if (db.threads && db.messages && db.thread_ai_briefs && db.thread_actions && db.thread_links) {
    return db;
  }

  const contacts = db.crm_contacts || [];
  const companies = db.companies || [];
  db.mailboxes = db.mailboxes || [
    { id: 'mailbox-default-smtp', tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, name: 'AIO CRM Mail', address: 'mail@aiocrm.org', provider: 'smtp-imap', created_at: isoMinutesAgo(30), updated_at: isoMinutesAgo(5) }
  ];
  db.channels = db.channels || [
    { id: 'channel-email', tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, type: 'email', label: 'Email', provider: 'smtp-imap', created_at: isoMinutesAgo(10080), updated_at: isoMinutesAgo(90) },
    { id: 'channel-sms', tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, type: 'sms', label: 'SMS', provider: 'manual', created_at: isoMinutesAgo(10080), updated_at: isoMinutesAgo(90) },
    { id: 'channel-internal', tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, type: 'internal', label: 'Internal', provider: 'system', created_at: isoMinutesAgo(10080), updated_at: isoMinutesAgo(90) }
  ];
  db.threads = [];
  db.messages = [];
  db.thread_state = [];
  db.thread_assignments = [];
  db.thread_ai_briefs = [];
  db.thread_actions = [];
  db.thread_links = [];

  const seeds = [];
  seeds.forEach((seed) => {
    const createdAt = seed.messages[0]?.created || isoMinutesAgo(30);
    const updatedAt = seed.messages[seed.messages.length - 1]?.created || createdAt;
    db.threads.push({
      id: seed.id,
      tenant_id: DEFAULT_TENANT_ID,
      workspace_id: DEFAULT_WORKSPACE_ID,
      mailbox_id: seed.mailbox,
      channel_type: seed.channel,
      source_provider: seed.channel === 'email' ? 'mock-email' : seed.channel === 'sms' ? 'manual-sms' : 'system',
      subject: seed.subject,
      generated_title: seed.title,
      status: seed.status,
      ai_flags: normalizeFlags(seed.flags),
      ai_priority: seed.priority,
      priority_score: seed.score,
      owner: seed.owner,
      assignee: seed.assignee,
      contact_id: seed.contact?.id || null,
      company_id: seed.companyId,
      automation_state: seed.automation,
      last_activity_at: updatedAt,
      next_follow_up_at: seed.nextFollow,
      created_at: createdAt,
      updated_at: updatedAt
    });
    db.thread_state.push({ id: `thread-state-${seed.id}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: seed.id, lifecycle_state: seed.status, owner: seed.assignee, ai_priority: seed.priority, actionability_flags: normalizeFlags(seed.flags), created_at: createdAt, updated_at: updatedAt });
    db.thread_assignments.push({ id: `thread-assignment-${seed.id}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: seed.id, owner_name: seed.owner, assignee_name: seed.assignee, created_at: createdAt, updated_at: updatedAt });
    db.thread_ai_briefs.push({ id: `thread-brief-${seed.id}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: seed.id, summary: seed.summary, disposition: seed.status === 'closed' ? 'Closed' : 'Active relationship signal', recommended_next_step: seed.next, confidence: seed.priority === 'critical' ? 0.94 : seed.priority === 'high' ? 0.88 : 0.78, unresolved_questions: seed.unresolved, crm_implications: seed.implications, reasoning_cues: [seed.flags.at_risk ? 'Risk detected' : 'Stable thread', seed.flags.high_intent ? 'High intent signal' : 'Standard intent signal'], created_at: createdAt, updated_at: updatedAt });
    ['Summarize', 'Reply with AI', 'Schedule follow-up'].forEach((label, index) => db.thread_actions.push({ id: `thread-action-${seed.id}-${index + 1}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: seed.id, label, action_type: slugify(label), source: 'ai', status: 'suggested', created_at: updatedAt, updated_at: updatedAt }));
    if (seed.contact?.id) db.thread_links.push({ id: `thread-link-contact-${seed.id}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: seed.id, source_type: 'contact', source_id: seed.contact.id, label: `${seed.contact.first_name} ${seed.contact.last_name}`.trim(), created_at: createdAt, updated_at: updatedAt });
    if (seed.companyId) db.thread_links.push({ id: `thread-link-company-${seed.id}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: seed.id, source_type: 'company', source_id: seed.companyId, label: companies.find((company) => company.id === seed.companyId)?.name || 'Company', created_at: createdAt, updated_at: updatedAt });
    seed.messages.forEach((message, index) => db.messages.push({
      id: message.id,
      tenant_id: DEFAULT_TENANT_ID,
      workspace_id: DEFAULT_WORKSPACE_ID,
      thread_id: seed.id,
      channel_type: seed.channel,
      direction: message.direction,
      sender_name: message.sender,
      sender_email: message.email,
      recipients: message.direction === 'outbound' ? [seed.contact?.email].filter(Boolean) : [db.mailboxes.find((mailbox) => mailbox.id === seed.mailbox)?.address].filter(Boolean),
      body: message.body,
      plain_text: message.body,
      quoted_history: index > 0 ? seed.messages.slice(0, index).map((item) => item.body).join('\n\n') : '',
      delivery_status: message.status,
      ai_extraction: { urgency: seed.priority, intent: seed.flags.hot_lead ? 'sales' : seed.flags.at_risk ? 'retention' : 'general' },
      created_at: message.created,
      updated_at: message.created
    }));
  });

  return db;
};

const getThreadContext = () => {
  const db = ensureCommsTables();
  const contacts = db.crm_contacts || [];
  const companies = db.companies || [];
  const forms = db.forms || [];
  return db.threads.map((thread) => {
    const messages = db.messages.filter((message) => message.thread_id === thread.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const brief = db.thread_ai_briefs.find((item) => item.thread_id === thread.id) || null;
    const actions = db.thread_actions.filter((item) => item.thread_id === thread.id);
    const links = db.thread_links.filter((item) => item.thread_id === thread.id);
    const mailbox = db.mailboxes.find((item) => item.id === thread.mailbox_id) || null;
    const contact = contacts.find((item) => item.id === thread.contact_id) || null;
    const company = companies.find((item) => item.id === thread.company_id) || null;
    const latestMessage = messages[messages.length - 1] || null;
    const aiFlags = normalizeFlags(thread.ai_flags);
    return {
      ...thread,
      aiFlags,
      brief,
      actions,
      links,
      mailbox,
      contact,
      company,
      formLinks: links.filter((link) => link.source_type === 'form').map((link) => ({ ...link, form: forms.find((form) => form.id === link.source_id) || null })),
      messages,
      latestMessage,
      preview: latestMessage?.plain_text || brief?.summary || thread.generated_title,
      queueIds: QUEUE_DEFINITIONS.filter((queue) => queue.matcher({ ...thread, aiFlags })).map((queue) => queue.id)
    };
  }).sort((a, b) => new Date(b.last_activity_at || b.updated_at) - new Date(a.last_activity_at || a.updated_at));
};

const findThread = (threadId) => getThreadContext().find((thread) => thread.id === threadId) || null;
const updateThreadRecord = (threadId, updates) => {
  const thread = ensureCommsTables().threads.find((item) => item.id === threadId);
  if (!thread) throw new Error(`Thread not found: ${threadId}`);
  Object.assign(thread, typeof updates === 'function' ? updates(thread) : updates, { updated_at: new Date().toISOString() });
  return thread;
};
const updateBriefRecord = (threadId, updates) => {
  const brief = ensureCommsTables().thread_ai_briefs.find((item) => item.thread_id === threadId);
  if (!brief) return null;
  Object.assign(brief, typeof updates === 'function' ? updates(brief) : updates, { updated_at: new Date().toISOString() });
  return brief;
};
const addAction = (threadId, label, source = 'ai', status = 'suggested') => ensureCommsTables().thread_actions.push({ id: `thread-action-${threadId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: threadId, label, action_type: slugify(label), source, status, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
const buildMessage = ({ threadId, channelType, direction, senderName, senderEmail, recipients, body, deliveryStatus }) => ({ id: `msg-${threadId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: threadId, channel_type: channelType, direction, sender_name: senderName, sender_email: senderEmail, recipients, body, plain_text: body, quoted_history: '', delivery_status: deliveryStatus, ai_extraction: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

export const getCommsSnapshot = ({ queueId = 'now', channel = 'all', search = '' } = {}) => {
  const threads = getThreadContext();
  const searchValue = search.trim().toLowerCase();
  const filtered = threads.filter((thread) => {
    const queueMatch = queueId === 'all' ? true : thread.queueIds.includes(queueId);
    const channelMatch = channel === 'all' ? true : thread.channel_type === channel;
    const textMatch = !searchValue || [thread.subject, thread.generated_title, thread.preview, thread.contact ? `${thread.contact.first_name} ${thread.contact.last_name}` : '', thread.company?.name || ''].some((value) => (value || '').toLowerCase().includes(searchValue));
    return queueMatch && channelMatch && textMatch;
  });
  return { queues: QUEUE_DEFINITIONS.map((queue) => ({ ...queue, count: threads.filter((thread) => queue.matcher(thread)).length })), threads: filtered, allThreads: threads, mailboxes: ensureCommsTables().mailboxes, agents: (getDb().aio_agents || []).filter((agent) => ['ALPHA', 'ECHO', 'STRIKER'].includes(agent.registryKey || agent.name)) };
};
export const createThread = ({ subject, channelType = 'email', contactId = null, companyId = null, body = '', status = 'new', assignee = 'ECHO' }) => {
  const db = ensureCommsTables();
  const contact = (db.crm_contacts || []).find((item) => item.id === contactId) || null;
  const resolvedCompanyId = companyId || contact?.company_id || null;
  const now = new Date().toISOString();
  const threadId = `thread-${slugify(subject || contact?.first_name || channelType)}-${Date.now()}`;
  db.threads.push({ id: threadId, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, mailbox_id: 'mailbox-default-smtp', channel_type: channelType, source_provider: channelType === 'email' ? 'smtp-imap' : channelType === 'sms' ? 'manual-sms' : 'system', subject: subject || `${channelType.toUpperCase()} thread`, generated_title: subject || `${contact ? `${contact.first_name} ${contact.last_name}` : 'New'} conversation`, status, ai_flags: normalizeFlags({ needs_human: true }), ai_priority: 'medium', priority_score: 70, owner: 'ECHO', assignee, contact_id: contact?.id || null, company_id: resolvedCompanyId, automation_state: 'manual', last_activity_at: now, next_follow_up_at: null, created_at: now, updated_at: now });
  db.thread_state.push({ id: `thread-state-${threadId}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: threadId, lifecycle_state: status, owner: assignee, ai_priority: 'medium', actionability_flags: normalizeFlags({ needs_human: true }), created_at: now, updated_at: now });
  db.thread_assignments.push({ id: `thread-assignment-${threadId}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: threadId, owner_name: 'ECHO', assignee_name: assignee, created_at: now, updated_at: now });
  db.thread_ai_briefs.push({ id: `thread-brief-${threadId}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: threadId, summary: 'Fresh thread awaiting triage.', disposition: 'New signal', recommended_next_step: 'Review context and send a clear next step.', confidence: 0.64, unresolved_questions: ['Confirm best next action'], crm_implications: [], reasoning_cues: ['Thread created manually'], created_at: now, updated_at: now });
  if (contact?.id) db.thread_links.push({ id: `thread-link-contact-${threadId}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: threadId, source_type: 'contact', source_id: contact.id, label: `${contact.first_name} ${contact.last_name}`.trim(), created_at: now, updated_at: now });
  if (resolvedCompanyId) db.thread_links.push({ id: `thread-link-company-${threadId}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: threadId, source_type: 'company', source_id: resolvedCompanyId, label: (db.companies || []).find((company) => company.id === resolvedCompanyId)?.name || 'Company', created_at: now, updated_at: now });
  emit('thread.created', { threadId, channelType, contactId: contact?.id || null });
  if (body) sendThreadMessage({ threadId, body, channelType, senderName: DEFAULT_USER, senderEmail: 'mail@aiocrm.org' });
  return findThread(threadId);
};

export const openThreadForContact = ({ contactId, channelType = 'email', subject, body = '', forceNew = false }) => {
  const db = ensureCommsTables();
  const contact = (db.crm_contacts || []).find((item) => item.id === contactId) || null;
  const existing = !forceNew ? getThreadContext().find((thread) => thread.contact_id === contactId && thread.channel_type === channelType && thread.status !== 'closed') : null;
  if (existing) return existing;
  return createThread({ subject: subject || `${channelType.toUpperCase()} follow-up for ${contact ? `${contact.first_name} ${contact.last_name}` : 'contact'}`, channelType, contactId, companyId: contact?.company_id || null, body, assignee: channelType === 'sms' ? 'ECHO' : 'STRIKER' });
};

export const createDraft = (threadId, mode = 'reply') => {
  const thread = findThread(threadId);
  if (!thread) throw new Error('Thread not found');
  const firstName = thread.contact?.first_name || 'there';
  const summary = thread.brief?.summary || thread.preview;
  const draft = mode === 'rewrite' ? `Refined version: ${summary} Next move: ${thread.brief?.recommended_next_step || 'reply with clarity and confidence.'}` : mode === 'extract' ? `Task extract:\n- Confirm owner for ${thread.subject}\n- Resolve: ${(thread.brief?.unresolved_questions || []).join(', ') || 'none'}\n- Trigger follow-up before ${thread.next_follow_up_at || 'next work block'}` : `Hi ${firstName},\n\nI reviewed your message. ${summary}\n\nNext step from our side: ${thread.brief?.recommended_next_step || 'I will get this moving and send the next update shortly.'}\n\nBest,\n${thread.assignee || 'ECHO'}`;
  addAction(threadId, mode === 'extract' ? 'Extract tasks' : mode === 'rewrite' ? 'Rewrite draft' : 'Reply with AI', 'ai', 'generated');
  emit('thread.updated', { threadId, action: mode, draft });
  return draft;
};

export const summarizeThread = (threadId) => {
  const thread = findThread(threadId);
  if (!thread) throw new Error('Thread not found');
  const latestInbound = [...thread.messages].reverse().find((message) => message.direction === 'inbound') || thread.latestMessage;
  const summary = latestInbound ? `${latestInbound.sender_name || 'The contact'} is focused on ${latestInbound.plain_text.toLowerCase().replace(/\.$/, '')}.` : thread.brief?.summary || 'No summary available.';
  const next = thread.aiFlags.at_risk ? 'De-risk the thread with a direct human answer and a booking option.' : thread.status === 'waiting_on_us' ? 'Send one crisp response with a decisive next action.' : 'Keep the thread warm with a precise follow-up.';
  updateBriefRecord(threadId, { summary, recommended_next_step: next, reasoning_cues: [thread.aiFlags.at_risk ? 'Risk detected' : 'Stable thread', thread.aiFlags.needs_human ? 'Human intervention advised' : 'AI-assisted response is viable'] });
  addAction(threadId, 'Summarize', 'ai', 'completed');
  emit('thread.classified', { threadId, summary, recommendedNextStep: next });
  return findThread(threadId);
};

export const updateThreadStatus = (threadId, status) => {
  updateThreadRecord(threadId, { status });
  const state = ensureCommsTables().thread_state.find((item) => item.thread_id === threadId);
  if (state) { state.lifecycle_state = status; state.updated_at = new Date().toISOString(); }
  addAction(threadId, `Move to ${status.replace(/_/g, ' ')}`, 'system', 'completed');
  emit(status === 'closed' ? 'thread.closed' : 'thread.updated', { threadId, status });
  return findThread(threadId);
};

export const assignThread = (threadId, assigneeName) => {
  updateThreadRecord(threadId, { assignee: assigneeName, owner: assigneeName });
  const assignment = ensureCommsTables().thread_assignments.find((item) => item.thread_id === threadId);
  if (assignment) { assignment.assignee_name = assigneeName; assignment.owner_name = assigneeName; assignment.updated_at = new Date().toISOString(); }
  emit('thread.assigned', { threadId, assigneeName });
  return findThread(threadId);
};

export const sendThreadMessage = ({ threadId, body, channelType, senderName = DEFAULT_USER, senderEmail = 'mail@aiocrm.org', recipients = [], direction = 'outbound' }) => {
  const thread = findThread(threadId);
  if (!thread) throw new Error('Thread not found');
  const message = buildMessage({ threadId, channelType: channelType || thread.channel_type, direction, senderName, senderEmail, recipients: recipients.length > 0 ? recipients : [thread.contact?.email || thread.mailbox?.address].filter(Boolean), body, deliveryStatus: direction === 'outbound' ? 'sent' : 'received' });
  ensureCommsTables().messages.push(message);
  const nextFlags = direction === 'outbound' ? { ...thread.aiFlags, follow_up_due: true } : { ...thread.aiFlags, needs_human: true };
  const updatedThread = updateThreadRecord(threadId, { status: direction === 'outbound' ? 'waiting_on_them' : 'waiting_on_us', ai_flags: normalizeFlags(nextFlags), last_activity_at: message.created_at, next_follow_up_at: direction === 'outbound' ? isoMinutesAgo(-240) : thread.next_follow_up_at });
  updateBriefRecord(threadId, { summary: `${direction === 'outbound' ? 'Outbound' : 'Inbound'} ${updatedThread.channel_type} ${direction === 'outbound' ? 'sent' : 'received'}: ${body.slice(0, 120)}`, recommended_next_step: direction === 'outbound' ? 'Monitor for response and prep the next touchpoint.' : 'Review the new signal and craft a precise reply.' });
  logContactActivity({ thread: updatedThread, message });
  emit(direction === 'outbound' ? 'mail.sent' : 'mail.received', { threadId, messageId: message.id, channelType: channelType || thread.channel_type });
  emit('thread.updated', { threadId, lastMessageId: message.id });
  return findThread(threadId);
};

export const addInternalNote = (threadId, body) => sendThreadMessage({ threadId, body, channelType: 'internal', senderName: 'ALPHA', senderEmail: 'system@aiocrm.local', recipients: ['Internal'], direction: 'system' });
export const simulateInbound = ({ channelType = 'email', contactId = null } = {}) => {
  const db = ensureCommsTables();
  const contact = contactId ? (db.crm_contacts || []).find((item) => item.id === contactId) : (db.crm_contacts || []).find((item) => item.opt_in_email || item.opt_in_sms);
  const existing = getThreadContext().find((thread) => thread.contact_id === contact?.id && thread.channel_type === channelType && thread.status !== 'closed');
  const target = existing || createThread({ subject: `${channelType.toUpperCase()} follow-up from ${contact ? `${contact.first_name} ${contact.last_name}` : 'contact'}`, channelType, contactId: contact?.id || null, companyId: contact?.company_id || null, assignee: 'ECHO' });
  const body = channelType === 'sms' ? 'Quick check-in. Are we still on for the follow-up and do you have the latest scope details handy?' : 'Following up because the latest proposal looks close. I just need the cleanest next step and the right owner on your side.';
  return sendThreadMessage({ threadId: target.id, body, channelType, senderName: contact ? `${contact.first_name} ${contact.last_name}`.trim() : 'Incoming Contact', senderEmail: contact?.email || 'contact@inbox.local', recipients: ['mail@aiocrm.org'], direction: 'inbound' });
};

export const ensureFormSubmissionThread = ({ form, contactId, submissionId, formData }) => {
  const db = ensureCommsTables();
  const existingLink = db.thread_links.find((link) => link.source_type === 'form_submission' && link.source_id === submissionId);
  if (existingLink) return findThread(existingLink.thread_id);
  const thread = createThread({ subject: `Form submission: ${form.name}`, channelType: 'email', contactId, body: `New ${form.name} submission received. ${Object.entries(formData || {}).map(([key, value]) => `${key}: ${value}`).join(', ')}`, status: 'waiting_on_us', assignee: 'ECHO' });
  const now = new Date().toISOString();
  db.thread_links.push({ id: `thread-link-form-${thread.id}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: thread.id, source_type: 'form', source_id: form.id, label: form.name, created_at: now, updated_at: now });
  db.thread_links.push({ id: `thread-link-submission-${thread.id}`, tenant_id: DEFAULT_TENANT_ID, workspace_id: DEFAULT_WORKSPACE_ID, thread_id: thread.id, source_type: 'form_submission', source_id: submissionId, label: submissionId, created_at: now, updated_at: now });
  updateBriefRecord(thread.id, { summary: `${form.name} created a new inbound signal that should be triaged in Dispatch.`, disposition: 'New lead or contact signal', recommended_next_step: 'Review the submission, enrich CRM context, and draft a first response.', unresolved_questions: ['Confirm best reply channel', 'Decide whether to trigger a workflow'], crm_implications: [`Submission linked to ${form.name}`], reasoning_cues: ['Thread originated from form ingestion'] });
  addAction(thread.id, 'Run workflow', 'system', 'suggested');
  emit('thread.followup_due', { threadId: thread.id, submissionId, formId: form.id });
  return findThread(thread.id);
};

export const getThreadActivitiesForContact = (contactId) => getThreadContext().filter((thread) => thread.contact_id === contactId).flatMap((thread) => thread.messages.map((message) => ({ id: `thread-activity-${message.id}`, contact_id: contactId, user_id: 'user-1', activity_type: ACTIVITY_TYPE[thread.channel_type] || 'note', title: `${thread.channel_type.toUpperCase()} ${message.direction === 'inbound' ? 'received' : message.direction === 'outbound' ? 'sent' : 'logged'}`, description: message.plain_text, metadata: { thread_id: thread.id, channel_type: thread.channel_type, subject: thread.subject, ai_priority: thread.ai_priority }, created_at: message.created_at }))).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

export const getFormBySlug = (formSlug) => (getDb().forms || []).find((form) => form.slug === formSlug || String(form.id) === String(formSlug)) || null;
export const getFormById = (formId) => (getDb().forms || []).find((form) => form.id === formId) || null;
export const findContactByField = (field, value) => (getDb().crm_contacts || []).find((contact) => contact[field] === value) || null;
export const listTableRecords = (table) => [...(getDb()[table] || [])];

ensureCommsTables();
