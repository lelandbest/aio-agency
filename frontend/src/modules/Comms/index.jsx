import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CalendarDays,
  ChevronDown,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  Smartphone,
  Sparkles,
  User,
  Workflow
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import AIAssistButton from '../../components/AIAssistButton';
import {
  advanceThreadStageApi,
  assignThreadApi,
  assistAiApi,
  createDealFromThreadApi,
  createMailboxApi,
  createThreadApi,
  getMailboxAuthorizeUrl,
  getCommsSnapshotApi,
  getMailboxEventsApi,
  getMailboxProvidersApi,
  ingestMailboxMessageApi,
  openThreadForContactApi,
  pushCalendarEventApi,
  reconcileCalendarEventApi,
  sendThreadEmailApi,
  sendThreadMessageApi,
  scheduleThreadMeetingApi,
  syncMailboxApi,
  testMailboxConnectionApi,
  updateCalendarEventApi,
  updateMailboxApi,
  updateThreadMailboxApi,
  updateThreadStatusApi
} from '../../services/backendApi';
import { subscribe } from '../../services/eventBus';
import { openOAuthPopup } from '../../utils/oauthPopup';

const QUEUE_DEFINITIONS = [
  { id: 'now', label: 'Now' },
  { id: 'needs-reply', label: 'Needs Reply' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'hot-leads', label: 'Hot Leads' },
  { id: 'at-risk', label: 'At Risk' },
  { id: 'scheduled', label: 'Scheduled Follow-ups' },
  { id: 'automated', label: 'Automated' },
  { id: 'closed', label: 'Closed' }
];

const EMPTY_SNAPSHOT = {
  queues: QUEUE_DEFINITIONS.map((queue) => ({ ...queue, count: 0 })),
  threads: [],
  allThreads: [],
  mailboxes: [],
  calendarEvents: [],
  agents: [{ name: 'ALPHA' }, { name: 'ECHO' }, { name: 'STRIKER' }]
};

const AGENT_ROLE_HINTS = {
  ALPHA: 'Routes, orchestrates, and handles system-level decisions.',
  ECHO: 'Owns communication intelligence and contextual thread understanding.',
  STRIKER: 'Drives sales framing, replies, and next-move execution.'
};

const CHANNEL_FILTERS = [
  { id: 'all', label: 'All', icon: Radio },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'sms', label: 'SMS', icon: Smartphone },
  { id: 'internal', label: 'Internal', icon: MessageSquare }
];

const statusTone = {
  new: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  waiting_on_us: 'bg-red-500/15 text-red-300 border-red-500/30',
  waiting_on_them: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  scheduled: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  closed: 'bg-slate-500/15 text-slate-300 border-slate-500/30'
};

const mailboxHealthTone = {
  healthy: {
    dot: 'bg-emerald-400',
    card: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
  },
  limited: {
    dot: 'bg-amber-400',
    card: 'border-amber-500/30 bg-amber-500/10 text-amber-100'
  },
  attention: {
    dot: 'bg-red-400',
    card: 'border-red-500/30 bg-red-500/10 text-red-100'
  }
};

const mailEventTone = {
  failure: 'border-red-500/30 bg-red-500/10 text-red-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200'
};

const pulseTone = {
  danger: 'border-red-500/30 bg-red-500/10 text-red-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  neutral: 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]'
};

const formatRelative = (value) => {
  if (!value) return 'No activity';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
};

const formatDateTime = (value) => {
  if (!value) return 'Not scheduled';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const decodeHtmlEntities = (value) => {
  if (typeof window === 'undefined') return value;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

const looksLikeMarkup = (value) => /<!doctype|<html|<body|<meta|<style|<div|<\/[a-z]+>|xmlns=|mso-|office:office/i.test(value || '');

const normalizeAiText = (value, fallback = '') => {
  const source = `${value || ''}`.trim();
  if (!source) return fallback;
  if (!looksLikeMarkup(source)) return source;

  const cleaned = decodeHtmlEntities(source)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || fallback;
};

const matchesThreadFilters = (thread, { queueId = 'all', channel = 'all', mailboxId = 'all', search = '' }) => {
  const searchValue = search.trim().toLowerCase();
  const queueMatch = queueId === 'all' ? true : (thread.queueIds || []).includes(queueId);
  const channelMatch = channel === 'all' ? true : thread.channel_type === channel;
  const mailboxMatch = mailboxId === 'all' ? true : thread.mailbox_id === mailboxId;
  const searchMatch = !searchValue || [
    thread.subject,
    thread.generated_title,
    thread.preview,
    thread.contact ? `${thread.contact.first_name} ${thread.contact.last_name}` : '',
    thread.company?.name || ''
  ].some((value) => (value || '').toLowerCase().includes(searchValue));
  return queueMatch && channelMatch && mailboxMatch && searchMatch;
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

const formatEventLabel = (eventType) => eventType.replace(/[._]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const describeMailEvent = (event) => {
  const payloadMessage = event.payload?.message || event.payload?.subject || event.payload?.sender_email || event.payload?.mailbox_address || event.source_provider;
  if (event.event_type.includes('failed')) {
    return {
      tone: 'failure',
      title: formatEventLabel(event.event_type),
      detail: payloadMessage
    };
  }
  if (event.event_type === 'mailbox.tested') {
    return {
      tone: event.payload?.status === 'ok' ? 'success' : 'warning',
      title: 'Connection Test',
      detail: payloadMessage
    };
  }
  if (event.event_type === 'mail.sent') {
    return {
      tone: 'success',
      title: 'Outbound Delivered',
      detail: payloadMessage
    };
  }
  if (event.event_type === 'mail.received' || event.event_type === 'mailbox.synced') {
    return {
      tone: 'info',
      title: formatEventLabel(event.event_type),
      detail: payloadMessage
    };
  }
  return {
    tone: 'warning',
    title: formatEventLabel(event.event_type),
    detail: payloadMessage
  };
};

const formatWindow = (value) => {
  if (!value) return 'now';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
};

const getThreadPulse = (thread) => {
  const messages = thread?.messages || [];
  const latestMessage = messages[messages.length - 1] || null;
  const latestOutbound = [...messages].reverse().find((message) => message.direction === 'outbound') || null;
  const latestInbound = [...messages].reverse().find((message) => message.direction === 'inbound') || null;
  const latestSystem = [...messages].reverse().find((message) => message.direction === 'system') || null;
  const awaitingReply = Boolean(latestOutbound) && (!latestInbound || new Date(latestOutbound.created_at).getTime() > new Date(latestInbound.created_at).getTime());
  const replyAge = awaitingReply ? Date.now() - new Date(latestOutbound.created_at).getTime() : 0;
  const followUpDue = Boolean(thread?.next_follow_up_at) && new Date(thread.next_follow_up_at).getTime() <= Date.now();
  const followUpScheduled = Boolean(thread?.next_follow_up_at) && !followUpDue;
  const deliveryFailure = messages.some((message) => message.direction === 'outbound' && message.delivery_status === 'failed');
  const deliveryState = latestMessage?.direction === 'outbound' ? latestMessage.delivery_status || 'sent' : null;

  const chips = [];
  if (deliveryFailure) {
    chips.push({ key: 'delivery-failed', label: 'Delivery risk', tone: 'danger' });
  } else if (deliveryState && deliveryState !== 'sent') {
    chips.push({ key: 'delivery', label: `Delivery ${deliveryState}`, tone: 'warning' });
  }
  if (followUpDue) {
    chips.push({ key: 'follow-up-due', label: 'Follow-up due', tone: 'danger' });
  } else if (followUpScheduled) {
    chips.push({ key: 'follow-up-scheduled', label: `Follow-up ${formatRelative(thread.next_follow_up_at)}`, tone: 'info' });
  }
  if (awaitingReply) {
    chips.push({
      key: 'awaiting-reply',
      label: replyAge >= 172800000 ? `No reply ${formatWindow(latestOutbound.created_at)}` : `Waiting ${formatWindow(latestOutbound.created_at)}`,
      tone: replyAge >= 172800000 ? 'danger' : replyAge >= 86400000 ? 'warning' : 'info'
    });
  } else if (latestInbound) {
    chips.push({ key: 'inbound-live', label: `Inbound ${formatWindow(latestInbound.created_at)}`, tone: 'success' });
  } else if (latestSystem) {
    chips.push({ key: 'system', label: 'Workflow touched', tone: 'neutral' });
  }

  return {
    latestMessage,
    latestOutbound,
    latestInbound,
    awaitingReply,
    followUpDue,
    followUpScheduled,
    deliveryState,
    chips: chips.slice(0, 3)
  };
};

const DEFAULT_PROVIDER_CATALOG = [
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

const createMailboxDraft = (provider = 'local-stub') => ({
  name: '',
  address: '',
  provider,
  inbound_enabled: true,
  outbound_enabled: true,
  config: {}
});

const formatFlags = (thread) => Object.entries(thread.aiFlags || {}).filter(([, value]) => value).map(([key]) => key.replace(/_/g, ' '));
const isMailboxOauthProvider = (providerId) => ['gmail-oauth', 'microsoft365-oauth'].includes(providerId);
const openMailboxAdmin = () => window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'integrations', integrationCategory: 'email' } }));

const CommsModule = ({ initialChannel = 'all', initialThreadId = null }) => {
  const [queueId, setQueueId] = useState('now');
  const [channel, setChannel] = useState(initialChannel);
  const [search, setSearch] = useState('');
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [activeMailboxId, setActiveMailboxId] = useState('all');
  const [composer, setComposer] = useState('');
  const [composerChannel, setComposerChannel] = useState(initialChannel === 'all' ? 'email' : initialChannel);
  const [busyLabel, setBusyLabel] = useState('');
  const [mailboxEvents, setMailboxEvents] = useState([]);
  const [mailboxForm, setMailboxForm] = useState({ name: '', address: '', provider: 'local-stub', status: 'connected', inbound_enabled: true, outbound_enabled: true, config: {} });
  const [mailboxProviders, setMailboxProviders] = useState(DEFAULT_PROVIDER_CATALOG);
  const [mailboxTestResult, setMailboxTestResult] = useState(null);
  const [isMailboxComposerOpen, setIsMailboxComposerOpen] = useState(false);
  const [mailboxDraft, setMailboxDraft] = useState(() => createMailboxDraft());
  const [actionNotice, setActionNotice] = useState(null);
  const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);

  const refresh = async () => {
    try {
      const backendSnapshot = await getCommsSnapshotApi();
      const filteredThreads = (backendSnapshot.allThreads || backendSnapshot.threads || []).filter((thread) => (
        matchesThreadFilters(thread, { queueId, channel, mailboxId: activeMailboxId, search })
      ));
      setSnapshot({
        ...backendSnapshot,
        threads: filteredThreads,
        allThreads: backendSnapshot.allThreads || backendSnapshot.threads || []
      });
    } catch (error) {
      setSnapshot(EMPTY_SNAPSHOT);
      setActionNotice({ tone: 'error', message: 'Comm requires the local backend. Backend snapshot could not be loaded.' });
    }
  };

  useEffect(() => {
    refresh();
  }, [queueId, channel, search, activeMailboxId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const providers = await getMailboxProvidersApi();
        if (!cancelled && providers?.length) {
          setMailboxProviders(providers);
        }
      } catch (error) {
        if (!cancelled) {
          setMailboxProviders(DEFAULT_PROVIDER_CATALOG);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe('*', refresh);
    return unsubscribe;
  }, [queueId, channel, search, activeMailboxId]);

  useEffect(() => {
    const current = snapshot.threads.find((thread) => thread.id === selectedThreadId);
    if (!current && snapshot.threads[0]) {
      setSelectedThreadId(snapshot.threads[0].id);
    }
    if (!snapshot.threads.length) {
      setSelectedThreadId(null);
    }
  }, [snapshot, selectedThreadId]);

  const selectedThread = useMemo(
    () => snapshot.allThreads.find((thread) => thread.id === selectedThreadId) || snapshot.threads[0] || null,
    [snapshot, selectedThreadId]
  );

  const channelScopedThreads = useMemo(
    () => (snapshot.allThreads || []).filter((thread) => matchesThreadFilters(thread, { channel, search })),
    [snapshot.allThreads, channel, search]
  );

  const mailboxScopedThreads = useMemo(
    () => channelScopedThreads.filter((thread) => activeMailboxId === 'all' ? true : thread.mailbox_id === activeMailboxId),
    [channelScopedThreads, activeMailboxId]
  );

  const queueCards = useMemo(
    () => QUEUE_DEFINITIONS.map((queue) => ({
      ...queue,
      count: mailboxScopedThreads.filter((thread) => (thread.queueIds || []).includes(queue.id)).length
    })),
    [mailboxScopedThreads]
  );

  const mailboxVisibleCounts = useMemo(() => {
    const counts = { all: channelScopedThreads.length };
    (snapshot.mailboxes || []).forEach((mailbox) => {
      counts[mailbox.id] = channelScopedThreads.filter((thread) => thread.mailbox_id === mailbox.id).length;
    });
    return counts;
  }, [channelScopedThreads, snapshot.mailboxes]);

  const activeMailbox = useMemo(
    () => (snapshot.mailboxes || []).find((mailbox) => mailbox.id === activeMailboxId) || null,
    [snapshot.mailboxes, activeMailboxId]
  );

  useEffect(() => {
    if (selectedThread) {
      setComposerChannel(selectedThread.channel_type === 'internal' ? 'internal' : selectedThread.channel_type || 'email');
    }
  }, [selectedThreadId]);

  useEffect(() => {
    setChannel(initialChannel);
  }, [initialChannel]);

  useEffect(() => {
    if (initialThreadId) {
      setSelectedThreadId(initialThreadId);
    }
  }, [initialThreadId]);

  useEffect(() => {
    setIsAssigneeMenuOpen(false);
  }, [selectedThreadId]);

  useEffect(() => {
    const mailbox = (snapshot.mailboxes || []).find((item) => item.id === (selectedThread?.mailbox_id || activeMailbox?.id)) || snapshot.mailboxes?.[0] || null;
    if (!mailbox) {
      setMailboxForm({ name: '', address: '', provider: 'local-stub', status: 'connected', inbound_enabled: true, outbound_enabled: true, config: {} });
      setMailboxTestResult(null);
      return;
    }
    setMailboxForm({
      name: mailbox.name || '',
      address: mailbox.address || '',
      provider: mailbox.provider || 'local-stub',
      status: mailbox.status || 'connected',
      inbound_enabled: mailbox.inbound_enabled !== false,
      outbound_enabled: mailbox.outbound_enabled !== false,
      config: mailbox.config || {}
    });
    setMailboxTestResult(null);
  }, [selectedThread, snapshot.mailboxes, activeMailbox]);

  useEffect(() => {
    const mailbox = (snapshot.mailboxes || []).find((item) => item.id === (selectedThread?.mailbox_id || activeMailbox?.id)) || snapshot.mailboxes?.[0] || null;
    if (!mailbox?.id) {
      setMailboxEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const events = await getMailboxEventsApi(mailbox.id);
        if (!cancelled) {
          setMailboxEvents(events || []);
        }
      } catch (error) {
        if (!cancelled) {
          setMailboxEvents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedThread, snapshot.mailboxes, activeMailbox]);

  const runAction = async (label, action) => {
    setBusyLabel(label);
    try {
      await action();
      refresh();
    } catch (error) {
      setActionNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyLabel('');
    }
  };

  const handleSend = async () => {
    if (!selectedThread || !composer.trim()) return;
    await runAction('Sending', async () => {
      if (composerChannel === 'email') {
        await sendThreadEmailApi(selectedThread.id, {
          mailbox_id: selectedThread.mailbox_id,
          body: composer.trim(),
          sender_name: 'AIO Flow',
          recipients: [selectedThread.contact?.email].filter(Boolean)
        });
      } else {
        await sendThreadMessageApi(selectedThread.id, { body: composer.trim(), channel_type: composerChannel });
      }
      setComposer('');
    });
  };

  const handleCreateThread = async () => {
    const subject = window.prompt('Subject for the new thread');
    if (!subject) return;
    await runAction('Creating', async () => {
      const mailboxId = activeMailbox?.id || selectedMailbox?.id || snapshot.mailboxes?.[0]?.id || null;
      const thread = await createThreadApi({ subject, channel_type: channel === 'all' ? 'email' : channel, body: 'New thread initiated from Comm mission control.', mailbox_id: mailboxId });
      setSelectedThreadId(thread?.id || null);
    });
  };

  const handleCreateMailbox = async () => {
    setIsMailboxComposerOpen(true);
    setMailboxDraft(createMailboxDraft());
  };

  const handleSubmitMailboxDraft = async () => {
    if (!mailboxDraft.name.trim() || !mailboxDraft.address.trim()) return;
    await runAction('Creating mailbox', async () => {
      const mailbox = await createMailboxApi({
        ...mailboxDraft,
        name: mailboxDraft.name.trim(),
        address: mailboxDraft.address.trim()
      });
      setIsMailboxComposerOpen(false);
      setMailboxDraft(createMailboxDraft());
      setActiveMailboxId(mailbox.id);
      setMailboxTestResult(null);
    });
  };

  const handleAiAction = async (mode) => {
    if (!selectedThread) return;
    await runAction(mode, async () => {
      const field = mode === 'summarize' ? 'summary' : mode;
      const latestMessage = selectedThread.messages?.[selectedThread.messages.length - 1] || null;
      const response = await assistAiApi({
        module: 'comms',
        surface: 'thread',
        field,
        intent: field === 'summary' ? 'summarize' : 'draft',
        current_value: field === 'rewrite' ? composer || selectedThread.preview || '' : selectedThread.brief?.summary || selectedThread.preview || '',
        context: {
          thread_id: selectedThread.id,
          subject: selectedThread.subject,
          preview: selectedThread.preview,
          summary: selectedThread.brief?.summary,
          recommended_next_step: selectedThread.brief?.recommended_next_step,
          disposition: selectedThread.brief?.disposition,
          unresolved_questions: selectedThread.brief?.unresolved_questions || [],
          reasoning_cues: selectedThread.brief?.reasoning_cues || [],
          ai_flags: Object.keys(selectedThread.aiFlags || {}).filter((key) => selectedThread.aiFlags[key]),
          priority: selectedThread.ai_priority,
          contact_name: selectedThread.contact ? `${selectedThread.contact.first_name} ${selectedThread.contact.last_name}`.trim() : '',
          company_name: selectedThread.company?.name || '',
          assignee: selectedThread.assignee,
          latest_message: latestMessage?.plain_text || latestMessage?.body || '',
          latest_direction: latestMessage?.direction || '',
        }
      });
      if (field !== 'summary') {
        setComposer(response?.draft || response?.suggestion || '');
      }
      if (response?.thread?.id) {
        setSelectedThreadId(response.thread.id);
      }
      setActionNotice({
        tone: 'success',
        message: field === 'summary'
          ? 'AI brief refreshed from the active thread context.'
          : field === 'extract'
            ? 'AI extracted the next operational tasks into the composer.'
            : 'AI draft staged in the composer.'
      });
    });
  };

  const handleWorkflowNote = async () => {
    if (!selectedThread) return;
    await runAction('Workflow', async () => {
      await sendThreadMessageApi(selectedThread.id, { body: 'Workflow suggested: create follow-up task, refresh CRM brief, and offer a booking link.', channel_type: 'internal', sender_name: 'ALPHA', sender_email: 'system@aiocrm.local', recipients: ['Internal'], direction: 'system' });
    });
  };

  const handleSaveMailbox = async () => {
    if (!selectedMailbox?.id) return;
    await runAction('Saving mailbox', async () => {
      try {
        await updateMailboxApi(selectedMailbox.id, mailboxForm);
      } catch (error) {
        throw error;
      }
    });
  };

  const handleTestMailbox = async () => {
    if (!selectedMailbox?.id) return;
    await runAction('Testing mailbox', async () => {
      await updateMailboxApi(selectedMailbox.id, mailboxForm);
      const result = await testMailboxConnectionApi(selectedMailbox.id);
      setMailboxTestResult(result.result || null);
      setActionNotice({
        tone: result.result?.status === 'ok' ? 'success' : 'warning',
        message: result.result?.message || 'Mailbox test completed.'
      });
    });
  };

  const handleAuthorizeMailbox = async () => {
    if (!selectedMailbox?.id || !isMailboxOauthProvider(mailboxForm.provider)) return;
    await runAction('Connecting mailbox', async () => {
      await updateMailboxApi(selectedMailbox.id, mailboxForm);
      const result = await openOAuthPopup(getMailboxAuthorizeUrl(selectedMailbox.id), 'mailbox');
      setMailboxTestResult({ status: 'ok', message: `${selectedProvider.label} connected successfully.` });
      setActionNotice({
        tone: 'success',
        message: `${selectedMailbox.name} connected via ${result.provider || selectedProvider.label}.`
      });
      await refresh();
    });
  };

  const handleMoveThreadToMailbox = async () => {
    if (!selectedThread?.id || !activeMailbox?.id || selectedThread.mailbox_id === activeMailbox.id) return;
    await runAction('Moving thread', async () => {
      try {
        await updateThreadMailboxApi(selectedThread.id, activeMailbox.id);
      } catch (error) {
        throw error;
      }
    });
  };

  const handleReceiveForMailbox = async () => {
    if (!selectedMailbox?.id) return;
    await runAction('Receiving sample', async () => {
      const seedThread = snapshot.threads[0] || snapshot.allThreads?.find((thread) => thread.mailbox_id === selectedMailbox.id) || snapshot.allThreads?.[0];
      await ingestMailboxMessageApi(selectedMailbox.id, {
        subject: seedThread?.subject || `${selectedMailbox.name} inbound sample`,
        body: 'Inbound signal generated from the mailbox operations strip so you can validate routing, AI brief refresh, and queue movement in one step.',
        sender_name: seedThread?.contact ? `${seedThread.contact.first_name} ${seedThread.contact.last_name}` : 'Inbound Contact',
        sender_email: seedThread?.contact?.email || 'contact@inbox.local',
        recipients: [selectedMailbox.address].filter(Boolean)
      });
    });
  };

  const handleCreateDeal = async () => {
    if (!selectedThread?.id) return;
    await runAction('Creating deal', async () => {
      await createDealFromThreadApi(selectedThread.id);
      setActionNotice({ tone: 'success', message: 'Deal shell created from the active thread.' });
    });
  };

  const handleAdvanceStage = async () => {
    if (!selectedThread?.id) return;
    await runAction('Advancing stage', async () => {
      await advanceThreadStageApi(selectedThread.id);
      setActionNotice({ tone: 'success', message: 'Pipeline stage advanced from Comms.' });
    });
  };

  const handleScheduleMeeting = async () => {
    if (!selectedThread?.id) return;
    await runAction('Scheduling meeting', async () => {
      await scheduleThreadMeetingApi(selectedThread.id);
      setActionNotice({ tone: 'success', message: 'Meeting follow-up scheduled from the active thread.' });
    });
  };
  const handleAssignThread = async (assigneeName) => {
    if (!selectedThread?.id || !assigneeName || assigneeName === selectedThread.assignee) {
      setIsAssigneeMenuOpen(false);
      return;
    }
    await runAction('Assigning', async () => {
      await assignThreadApi(selectedThread.id, assigneeName);
      setActionNotice({ tone: 'success', message: `Thread assigned to ${assigneeName}.` });
      setIsAssigneeMenuOpen(false);
    });
  };
  const handleUpdateCalendarArtifact = async (eventId, updates, label, successMessage) => {
    await runAction(label, async () => {
      await updateCalendarEventApi(eventId, updates);
      setActionNotice({ tone: 'success', message: successMessage });
    });
  };
  const handlePushCalendarArtifact = async (eventId) => {
    await runAction('Pushing meeting', async () => {
      await pushCalendarEventApi(eventId);
      setActionNotice({ tone: 'success', message: 'Meeting pushed to the active calendar source.' });
    });
  };
  const handleReconcileCalendarArtifact = async (eventId, strategy) => {
    await runAction('Reconciling meeting', async () => {
      const response = await reconcileCalendarEventApi(eventId, strategy);
      setActionNotice({ tone: 'success', message: response?.result?.message || 'Meeting conflict reconciled.' });
    });
  };

  const threadFlags = formatFlags(selectedThread || {});
  const selectedMailboxId = selectedThread?.mailbox_id || activeMailbox?.id || snapshot.mailboxes?.[0]?.id || null;
  const selectedMailbox = useMemo(
    () => (snapshot.mailboxes || []).find((mailbox) => mailbox.id === selectedMailboxId) || activeMailbox || snapshot.mailboxes?.[0] || null,
    [snapshot.mailboxes, selectedMailboxId, activeMailbox]
  );
  const selectedProvider = mailboxProviders.find((provider) => provider.id === mailboxForm.provider) || DEFAULT_PROVIDER_CATALOG[0];
  const draftProvider = mailboxProviders.find((provider) => provider.id === mailboxDraft.provider) || DEFAULT_PROVIDER_CATALOG[0];
  const selectedMailboxHealth = mailboxHealthTone[selectedMailbox?.health?.state || 'healthy'] || mailboxHealthTone.healthy;
  const selectedMailboxProvider = mailboxProviders.find((provider) => provider.id === selectedMailbox?.provider) || DEFAULT_PROVIDER_CATALOG[0];
  const selectedMailboxEventSummary = useMemo(() => ({
    failures: mailboxEvents.filter((event) => event.event_type.includes('failed')).length,
    sent: mailboxEvents.filter((event) => event.event_type === 'mail.sent').length,
    received: mailboxEvents.filter((event) => event.event_type === 'mail.received').length,
    latest: mailboxEvents[0] || null
  }), [mailboxEvents]);
  const selectedThreadPulse = useMemo(
    () => (selectedThread ? getThreadPulse(selectedThread) : null),
    [selectedThread]
  );
  const selectedDealLink = useMemo(
    () => selectedThread?.links?.find((link) => link.source_type === 'deal') || null,
    [selectedThread]
  );
  const completedThreadActions = useMemo(
    () => ((selectedThread?.actions || []).filter((action) => action.status === 'completed').slice().reverse()),
    [selectedThread]
  );
  const threadCalendarEvents = useMemo(
    () => selectedThread?.calendarEvents || [],
    [selectedThread]
  );
  const availableAgents = useMemo(
    () => (snapshot.agents || EMPTY_SNAPSHOT.agents).map((agent) => agent.name),
    [snapshot.agents]
  );
  const briefSummary = normalizeAiText(
    selectedThread?.brief?.summary,
    selectedThread?.preview || 'AI summary is being refined from the latest thread context.'
  );
  const briefNextStep = normalizeAiText(
    selectedThread?.brief?.recommended_next_step,
    'Review the latest inbound signal and send the next decisive response.'
  );

  return (
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
      <ModuleHeader
        title="Comm"
        titleIcon={Radio}
        showTitle={false}
        actions={[
          { label: 'Simulate Receive', icon: Sparkles, onClick: () => runAction('Simulating', async () => {
            const seedThread = snapshot.threads[0] || snapshot.allThreads?.[0];
            const targetChannel = channel === 'all' ? 'email' : channel;
            if (seedThread && targetChannel === 'email' && (seedThread.mailbox_id || snapshot.mailboxes?.[0]?.id)) {
              await ingestMailboxMessageApi(seedThread.mailbox_id || snapshot.mailboxes?.[0]?.id, {
                subject: seedThread.subject,
                body: 'Following up because the latest proposal looks close. I just need the cleanest next step and the right owner on your side.',
                sender_name: seedThread.contact ? `${seedThread.contact.first_name} ${seedThread.contact.last_name}` : 'Incoming Contact',
                sender_email: seedThread.contact?.email || 'contact@inbox.local',
                recipients: [seedThread.mailbox?.address || snapshot.mailboxes?.[0]?.address].filter(Boolean)
              });
            } else if (seedThread) {
              await sendThreadMessageApi(seedThread.id, {
                body: targetChannel === 'sms' ? 'Quick check-in. Are we still on for the follow-up and do you have the latest scope details handy?' : 'Following up because the latest proposal looks close. I just need the cleanest next step and the right owner on your side.',
                channel_type: targetChannel,
                sender_name: seedThread.contact ? `${seedThread.contact.first_name} ${seedThread.contact.last_name}` : 'Incoming Contact',
                sender_email: seedThread.contact?.email || 'contact@inbox.local',
                recipients: ['mission@aiocrm.local'],
                direction: 'inbound'
              });
            }
          }), variant: 'secondary' },
          { label: 'Sync Mailbox', icon: Mail, onClick: () => runAction('Syncing', async () => {
            if (!selectedMailbox?.id) return;
            await syncMailboxApi(selectedMailbox.id);
          }), variant: 'secondary' },
          { label: 'Manage Mailboxes', icon: Settings2, onClick: openMailboxAdmin, variant: 'secondary' },
          { label: 'New Thread', icon: Plus, onClick: handleCreateThread, variant: 'primary' }
        ]}
        statusBadge={{ label: `${snapshot.threads.length} visible threads${selectedMailbox ? ` / ${selectedMailbox.name}` : ''}`, color: selectedMailbox?.health?.state === 'attention' ? 'warning' : 'info' }}
        aiAssistSlot={<AIAssistButton onAssist={() => handleAiAction('summarize')} tooltip="Refresh AI brief" iconType="sparkles" />}
      />

      {actionNotice ? (
        <div className={`mx-4 mt-4 rounded-xl border px-4 py-3 text-sm ${
          actionNotice.tone === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            : actionNotice.tone === 'warning'
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
        }`}>
          {actionNotice.message}
        </div>
      ) : null}

      {selectedMailbox ? (
        <div className="mx-4 mt-4 rounded-2xl border border-[var(--color-border)] bg-[linear-gradient(90deg,rgba(59,130,246,0.12),rgba(15,23,42,0.18))] px-4 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${selectedMailboxHealth.dot}`} />
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.name}</div>
                <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">{selectedMailboxProvider.label}</span>
                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${selectedMailboxHealth.card}`}>{selectedMailbox.health?.label || selectedMailbox.status}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-[var(--color-text-secondary)]">
                <span>Address {selectedMailbox.address || 'unassigned'}</span>
                <span>Last sync {selectedMailbox.last_synced_at ? formatRelative(selectedMailbox.last_synced_at) : 'never'}</span>
                <span>Inbound {selectedMailbox.inbound_enabled ? 'on' : 'off'}</span>
                <span>Outbound {selectedMailbox.outbound_enabled ? 'on' : 'off'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={openMailboxAdmin} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Manage in Integrations</button>
                <button onClick={handleTestMailbox} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Test Connection</button>
                <button onClick={() => runAction('Syncing', async () => {
                  await syncMailboxApi(selectedMailbox.id);
                })} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Run Sync</button>
                <button onClick={handleReceiveForMailbox} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Inject Inbound</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[360px]">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Now</div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.queue_counts?.now || 0}</div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Reply</div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailbox.queue_counts?.['needs-reply'] || 0}</div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Inbound</div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailboxEventSummary.received}</div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Failures</div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedMailboxEventSummary.failures}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-hidden">
        <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-12">
          <aside className="xl:col-span-3 min-w-0 border-b xl:border-b-0 xl:border-r border-[var(--color-border)] bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_50%)] flex flex-col min-h-0">
            <div className="p-4 border-b border-[var(--color-border)] space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-[var(--color-text-secondary)]" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search threads, contacts, companies" className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div className="flex flex-wrap gap-2">
                {CHANNEL_FILTERS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} onClick={() => setChannel(item.id)} className={`px-3 py-1.5 rounded-full text-xs border flex items-center gap-1.5 ${channel === item.id ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)] border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}>
                      <Icon size={13} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-b border-[var(--color-border)] space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Mailboxes</div>
              <div className="space-y-2">
                <button onClick={() => setActiveMailboxId('all')} className={`w-full rounded-xl border px-3 py-2 text-left ${activeMailboxId === 'all' ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)] bg-[var(--color-bg-primary)]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm text-[var(--color-text-primary)]">All Mailboxes</div>
                      <div className="text-xs text-[var(--color-text-secondary)]">Unified operator scope</div>
                    </div>
                    <div className="text-xs text-[var(--color-text-secondary)]">{mailboxVisibleCounts.all || 0}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--color-text-secondary)]">
                    <span>Now {queueCards.find((queue) => queue.id === 'now')?.count || 0}</span>
                    <span>Reply {queueCards.find((queue) => queue.id === 'needs-reply')?.count || 0}</span>
                    <span>Risk {queueCards.find((queue) => queue.id === 'at-risk')?.count || 0}</span>
                  </div>
                </button>
                {(snapshot.mailboxes || []).map((mailbox) => {
                  const health = mailboxHealthTone[mailbox.health?.state || 'healthy'] || mailboxHealthTone.healthy;
                  return (
                    <button key={mailbox.id} onClick={() => setActiveMailboxId(mailbox.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${activeMailboxId === mailbox.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)] bg-[var(--color-bg-primary)]'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${health.dot}`} />
                            <div className="text-sm text-[var(--color-text-primary)]">{mailbox.name}</div>
                          </div>
                          <div className="text-xs text-[var(--color-text-secondary)]">{mailbox.status || 'unknown'} / {mailbox.provider}</div>
                        </div>
                        <div className="text-xs text-[var(--color-text-secondary)]">{mailboxVisibleCounts[mailbox.id] || 0}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--color-text-secondary)]">
                        <span>{mailbox.health?.label || mailbox.status || 'unknown'}</span>
                        <span>Now {mailbox.queue_counts?.now || 0}</span>
                        <span>Reply {mailbox.queue_counts?.['needs-reply'] || 0}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-b border-[var(--color-border)] grid grid-cols-2 gap-2">
              {queueCards.map((queue) => {
                return (
                  <button key={queue.id} onClick={() => setQueueId(queue.id)} className={`p-3 rounded-xl border text-left ${queueId === queue.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary)]/40'}`}>
                    <div className="text-xs text-[var(--color-text-secondary)]">{queue.label}</div>
                    <div className="text-lg font-semibold text-[var(--color-text-primary)]">{queue.count || 0}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-3">
              {snapshot.threads.map((thread) => {
                const pulse = getThreadPulse(thread);
                return (
                  <button key={thread.id} onClick={() => setSelectedThreadId(thread.id)} className={`w-full text-left rounded-2xl border p-4 transition ${selectedThread?.id === thread.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]' : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary)]/30'}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{thread.contact ? `${thread.contact.first_name} ${thread.contact.last_name}` : thread.generated_title}</div>
                        <div className="text-xs text-[var(--color-text-secondary)]">{thread.company?.name || thread.mailbox?.name}</div>
                      </div>
                      <span className={`px-2 py-1 rounded-full border text-[10px] uppercase tracking-[0.2em] ${statusTone[thread.status] || 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>{thread.status.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="text-sm text-[var(--color-text-primary)] mb-1">{thread.subject}</div>
                    <div className="text-xs text-[var(--color-text-secondary)] line-clamp-2">{thread.preview}</div>
                    {pulse.chips.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pulse.chips.map((chip) => (
                          <span key={chip.key} className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${pulseTone[chip.tone] || pulseTone.neutral}`}>{chip.label}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)]">
                      <span>{thread.ai_priority} priority</span>
                      <span>{formatRelative(thread.last_activity_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
          <main className="xl:col-span-5 min-w-0 border-b xl:border-b-0 xl:border-r border-[var(--color-border)] flex flex-col min-h-0 overflow-hidden bg-[linear-gradient(180deg,rgba(15,23,42,0.22),transparent_35%)]">
            {selectedThread ? (
              <>
                <div className="p-5 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                  <div className="flex flex-wrap items-start justify-between gap-4 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h2 className="min-w-0 break-words text-xl font-semibold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">{selectedThread.subject}</h2>
                        <span className={`px-2 py-1 rounded-full border text-[10px] uppercase tracking-[0.2em] ${statusTone[selectedThread.status] || 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>{selectedThread.status.replace(/_/g, ' ')}</span>
                        <div className="relative">
                          <button
                            onClick={() => setIsAssigneeMenuOpen((current) => !current)}
                            className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                          >
                            <span className="text-[var(--color-text-tertiary)]">Agent</span>
                            <span className="max-w-[8rem] truncate text-[var(--color-text-primary)]">{selectedThread.assignee || 'Unassigned'}</span>
                            <ChevronDown size={14} className={`transition-transform ${isAssigneeMenuOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isAssigneeMenuOpen ? (
                            <div className="absolute left-0 top-full z-20 mt-2 w-60 max-w-[calc(100vw-6rem)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 shadow-2xl">
                              {availableAgents.map((agentName) => (
                                <button
                                  key={agentName}
                                  onClick={() => handleAssignThread(agentName)}
                                  className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedThread.assignee === agentName ? 'border border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]'}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">{agentName}</span>
                                    {selectedThread.assignee === agentName ? <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-primary)]">Current</span> : null}
                                  </div>
                                  <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{AGENT_ROLE_HINTS[agentName] || 'Agent available for routing.'}</div>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <p className="max-w-2xl text-sm text-[var(--color-text-secondary)] break-words [overflow-wrap:anywhere]">{selectedThread.generated_title}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => handleAiAction('summarize')} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Summarize</button>
                      <button onClick={() => handleAiAction('reply')} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Reply with AI</button>
                      <button onClick={() => handleAiAction('rewrite')} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Rewrite</button>
                      <button onClick={() => handleAiAction('extract')} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Extract Tasks</button>
                    </div>
                  </div>
                  {selectedThreadPulse ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-4">
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Latest Touch</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedThreadPulse.latestMessage?.direction || 'none'}</div>
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{selectedThreadPulse.latestMessage?.created_at ? formatRelative(selectedThreadPulse.latestMessage.created_at) : 'No messages yet'}</div>
                      </div>
                      <div className={`rounded-xl border px-3 py-3 ${pulseTone[selectedThreadPulse.awaitingReply ? (selectedThreadPulse.latestOutbound && Date.now() - new Date(selectedThreadPulse.latestOutbound.created_at).getTime() >= 172800000 ? 'danger' : 'warning') : 'success']}`}>
                        <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">Reply Clock</div>
                        <div className="mt-1 text-sm font-semibold">{selectedThreadPulse.awaitingReply ? `Waiting ${formatWindow(selectedThreadPulse.latestOutbound?.created_at)}` : 'Replied or inbound'}</div>
                        <div className="mt-1 text-xs opacity-80">{selectedThreadPulse.awaitingReply ? 'Last outbound has not been answered yet.' : 'Conversation is not blocked on a reply.'}</div>
                      </div>
                      <div className={`rounded-xl border px-3 py-3 ${pulseTone[selectedThreadPulse.followUpDue ? 'danger' : selectedThreadPulse.followUpScheduled ? 'info' : 'neutral']}`}>
                        <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">Follow-up</div>
                        <div className="mt-1 text-sm font-semibold">{selectedThreadPulse.followUpDue ? 'Due now' : selectedThreadPulse.followUpScheduled ? formatRelative(selectedThread.next_follow_up_at) : 'Not scheduled'}</div>
                        <div className="mt-1 text-xs opacity-80">{selectedThread.next_follow_up_at || 'No follow-up timestamp on this thread.'}</div>
                      </div>
                      <div className={`rounded-xl border px-3 py-3 ${pulseTone[selectedThreadPulse.deliveryState && selectedThreadPulse.deliveryState !== 'sent' ? 'warning' : 'success']}`}>
                        <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">Delivery</div>
                        <div className="mt-1 text-sm font-semibold">{selectedThreadPulse.deliveryState || 'No outbound send yet'}</div>
                        <div className="mt-1 text-xs opacity-80">{selectedThreadPulse.latestMessage?.direction === 'outbound' ? 'Latest outbound delivery state.' : 'Waiting for the next outbound action.'}</div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto px-4 py-5 space-y-4">
                  {selectedThread.messages.map((message) => (
                    <div key={message.id} className={`max-w-[92%] min-w-0 rounded-2xl border p-4 ${message.direction === 'outbound' ? 'ml-auto bg-[var(--color-primary)]/12 border-[var(--color-primary)]/30' : message.direction === 'system' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-[var(--color-bg-primary)] border-[var(--color-border)]'}`}>
                      <div className="flex items-center justify-between gap-3 mb-2 text-xs text-[var(--color-text-secondary)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--color-text-primary)]">{message.sender_name}</span>
                          {message.direction === 'outbound' && message.delivery_status ? (
                            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${message.delivery_status === 'sent' ? pulseTone.success : pulseTone.warning}`}>{message.delivery_status}</span>
                          ) : null}
                        </div>
                        <span>{formatRelative(message.created_at)}</span>
                      </div>
                      <div className="text-sm leading-6 text-[var(--color-text-primary)] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {normalizeAiText(message.plain_text, message.body || '')}
                      </div>
                      {message.recipients?.length ? (
                        <div className="mt-3 text-[11px] text-[var(--color-text-tertiary)] break-words [overflow-wrap:anywhere]">Recipients: {message.recipients.join(', ')}</div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="border-t border-[var(--color-border)] p-4 bg-[var(--color-bg-tertiary)] space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={handleMoveThreadToMailbox} disabled={!activeMailbox?.id || activeMailbox.id === selectedThread.mailbox_id} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50">Move to {activeMailbox?.name || 'mailbox'}</button>
                    <button onClick={() => runAction('Scheduling', async () => {
                      await updateThreadStatusApi(selectedThread.id, 'scheduled');
                    })} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Schedule Follow-up</button>
                    <button onClick={handleWorkflowNote} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Run Workflow</button>
                    <button onClick={() => runAction('Closing', async () => {
                      await updateThreadStatusApi(selectedThread.id, 'closed');
                    })} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Close Thread</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CHANNEL_FILTERS.filter((item) => item.id !== 'all').map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.id} onClick={() => setComposerChannel(item.id)} className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${composerChannel === item.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>
                          <Icon size={14} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                  <textarea value={composer} onChange={(event) => setComposer(event.target.value)} rows={5} placeholder="Draft the next move, log an internal note, or send a precise follow-up..." className="w-full rounded-2xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-[var(--color-text-tertiary)]">{busyLabel ? `${busyLabel}...` : 'Thread-first comm with AI-guided actions.'}</div>
                    <button onClick={handleSend} disabled={!composer.trim()} className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-[var(--color-text-on-primary)] text-sm font-medium flex items-center gap-2">
                      <Send size={14} />
                      Send
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)]">No threads in this queue.</div>
            )}
          </main>

          <aside className="xl:col-span-4 min-w-0 flex flex-col min-h-0 overflow-hidden bg-[linear-gradient(180deg,rgba(16,185,129,0.12),transparent_35%)]">
            {selectedThread ? (
              <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto p-5 space-y-5">
                <section className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Bot size={16} /> AI Brief</div>
                    <span className="text-xs text-[var(--color-text-secondary)]">{selectedThread.ai_priority} priority</span>
                  </div>
                  <p className="text-sm text-[var(--color-text-primary)] break-words [overflow-wrap:anywhere]">{briefSummary}</p>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-2">Recommended Next Step</div>
                    <div className="text-sm text-[var(--color-text-primary)] break-words [overflow-wrap:anywhere]">{briefNextStep}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {threadFlags.map((flag) => (
                      <span key={flag} className="px-2 py-1 rounded-full text-xs border border-[var(--color-border)] text-[var(--color-text-secondary)]">{flag}</span>
                    ))}
                  </div>
                </section>

                <section className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><User size={16} /> Relationship Context</div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-1">Contact</div>
                      <div className="text-[var(--color-text-primary)] font-medium">{selectedThread.contact ? `${selectedThread.contact.first_name} ${selectedThread.contact.last_name}` : 'Unlinked'}</div>
                      <div className="text-[var(--color-text-secondary)]">{selectedThread.contact?.email || 'No email linked'}</div>
                    </div>
                    <div className="rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-1">Company</div>
                      <div className="text-[var(--color-text-primary)] font-medium">{selectedThread.company?.name || 'No company linked'}</div>
                      <div className="text-[var(--color-text-secondary)]">{selectedThread.mailbox?.name}</div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                    <div className="flex items-center gap-2"><CalendarDays size={14} /> Last activity {formatRelative(selectedThread.last_activity_at)}</div>
                    <div className="flex items-center gap-2"><Building2 size={14} /> Channel {selectedThread.channel_type}</div>
                    <div className="flex items-center gap-2"><Mail size={14} /> Mailbox {selectedThread.mailbox?.status || 'unknown'} via {selectedThread.mailbox?.provider || 'local-stub'}</div>
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Building2 size={16} /> CRM Linkage</div>
                    <span className="text-xs text-[var(--color-text-secondary)]">{selectedThread.contact?.pipeline_stage || 'No stage'}</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-1">Current Stage</div>
                      <div className="text-[var(--color-text-primary)] font-medium">{selectedThread.contact?.pipeline_stage || 'Unlinked'}</div>
                      <div className="text-[var(--color-text-secondary)]">{selectedThread.contact ? 'Derived from the linked contact record.' : 'Link a contact before moving this relationship through pipeline.'}</div>
                    </div>
                    <div className="rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-1">Deal Link</div>
                      <div className="text-[var(--color-text-primary)] font-medium">{selectedDealLink?.label || 'No deal yet'}</div>
                      <div className="text-[var(--color-text-secondary)]">{selectedDealLink ? selectedDealLink.source_id : 'Create a deal shell directly from this thread.'}</div>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2">
                    <button onClick={handleCreateDeal} disabled={!selectedThread.contact_id || Boolean(selectedDealLink)} className="px-3 py-3 rounded-xl border border-[var(--color-border)] text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)] disabled:opacity-50">Create Deal</button>
                    <button onClick={handleAdvanceStage} disabled={!selectedThread.contact_id} className="px-3 py-3 rounded-xl border border-[var(--color-border)] text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)] disabled:opacity-50">Advance Stage</button>
                    <button onClick={handleScheduleMeeting} className="px-3 py-3 rounded-xl border border-[var(--color-border)] text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)]">Schedule Meeting</button>
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Workflow size={16} /> Tracks</div>
                  <div className="space-y-2">
                    {threadCalendarEvents.map((event) => (
                      <div key={event.id} className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 text-sm font-medium text-[var(--color-text-primary)] break-words [overflow-wrap:anywhere]">{event.title}</div>
                          <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Calendar</span>
                        </div>
                        <div className="mt-1 text-sm text-[var(--color-text-secondary)]">{event.description || 'Calendar artifact created from Comms.'}</div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">
                          <span>{formatDateTime(event.start_time)}</span>
                          <span>{event.location || 'No location set'}</span>
                          <span>{event.status || 'scheduled'}</span>
                          <span>{event.sync_status || 'pending'}</span>
                          <span>{event.conflict_state || 'clear'}</span>
                        </div>
                        {event.sync_note ? (
                          <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                            {event.sync_note}
                          </div>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => handleUpdateCalendarArtifact(event.id, { status: 'confirmed' }, 'Confirming meeting', 'Meeting confirmed from Comms.')}
                            disabled={event.status === 'confirmed'}
                            className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] hover:border-[var(--color-primary)] disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => handleUpdateCalendarArtifact(event.id, { status: 'completed' }, 'Completing meeting', 'Meeting marked complete from Comms.')}
                            disabled={event.status === 'completed'}
                            className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] hover:border-[var(--color-primary)] disabled:opacity-50"
                          >
                            Complete
                          </button>
                          <button
                            onClick={() => handlePushCalendarArtifact(event.id)}
                            className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
                          >
                            Push
                          </button>
                          {event.conflict_state === 'review' ? (
                            <>
                              <button
                                onClick={() => handleReconcileCalendarArtifact(event.id, 'keep_local')}
                                className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
                              >
                                Keep Local
                              </button>
                              <button
                                onClick={() => handleReconcileCalendarArtifact(event.id, 'accept_import')}
                                className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
                              >
                                Accept Import
                              </button>
                            </>
                          ) : null}
                          {event.meeting_url ? (
                            <a
                              href={event.meeting_url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
                            >
                              Open Link
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {completedThreadActions.map((action) => (
                      <div key={action.id || `${action.action_type}-${action.label}`} className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 text-sm font-medium text-[var(--color-text-primary)] break-words [overflow-wrap:anywhere]">{action.label}</div>
                          <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">{action.source || 'system'}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">
                          <span>{action.status || 'completed'}</span>
                          <span>{formatRelative(action.created_at || selectedThread.updated_at)}</span>
                        </div>
                      </div>
                    ))}
                    {threadCalendarEvents.length === 0 && completedThreadActions.length === 0 ? (
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
                        No tracks yet. AI, workflow, calendar, and automation actions will appear here as this thread changes state.
                      </div>
                    ) : null}
                  </div>
                </section>

                {isMailboxComposerOpen ? (
                  <section className="rounded-2xl border border-[var(--color-primary)]/30 bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(15,23,42,0.22))] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Mail size={16} /> Mailbox Onboarding</div>
                        <div className="mt-1 text-sm text-[var(--color-text-secondary)]">Create a new connection surface for Comms. Provider state is persisted immediately, then you can test it against the backend.</div>
                      </div>
                      <button onClick={() => {
                        setIsMailboxComposerOpen(false);
                        setMailboxDraft(createMailboxDraft());
                      }} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Cancel</button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <label className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Mailbox Name</div>
                        <input value={mailboxDraft.name} onChange={(event) => setMailboxDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Executive Desk" className="w-full rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                      </label>
                      <label className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Mailbox Address</div>
                        <input value={mailboxDraft.address} onChange={(event) => setMailboxDraft((current) => ({ ...current, address: event.target.value }))} placeholder="exec@aiocrm.local" className="w-full rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                      </label>
                      <label className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Provider</div>
                        <select value={mailboxDraft.provider} onChange={(event) => setMailboxDraft((current) => ({ ...current, provider: event.target.value, config: {} }))} className="w-full rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]">
                          {mailboxProviders.map((provider) => (
                            <option key={provider.id} value={provider.id}>{provider.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
                        {mailboxDraft.provider === 'local-stub'
                          ? 'Local stub mailboxes are immediately usable for simulated inbound and outbound testing.'
                          : 'External providers start in a setup state until the stored configuration is tested.'}
                      </div>
                    </div>
                    {draftProvider.fields?.length > 0 ? (
                      <div className="grid sm:grid-cols-2 gap-3 text-sm">
                        {draftProvider.fields.map((field) => (
                          <label key={field.key} className="space-y-1">
                            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">{field.label}</div>
                            <input
                              value={mailboxDraft.config?.[field.key] || ''}
                              onChange={(event) => setMailboxDraft((current) => ({
                                ...current,
                                config: {
                                  ...(current.config || {}),
                                  [field.key]: event.target.value
                                }
                              }))}
                              className="w-full rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-3 text-sm text-[var(--color-text-secondary)]">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={mailboxDraft.inbound_enabled} onChange={(event) => setMailboxDraft((current) => ({ ...current, inbound_enabled: event.target.checked }))} />
                        Inbound enabled
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={mailboxDraft.outbound_enabled} onChange={(event) => setMailboxDraft((current) => ({ ...current, outbound_enabled: event.target.checked }))} />
                        Outbound enabled
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-[var(--color-text-tertiary)]">Create first, then use the existing mailbox panel to run a connection test and sync check.</div>
                      <button onClick={handleSubmitMailboxDraft} disabled={!mailboxDraft.name.trim() || !mailboxDraft.address.trim()} className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-[var(--color-text-on-primary)] text-sm font-medium">Create Mailbox</button>
                    </div>
                  </section>
                ) : null}

                <section className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Mail size={16} /> Mailbox Admin</div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleTestMailbox} disabled={!selectedMailbox?.id} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50">Test</button>
                      <button onClick={openMailboxAdmin} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Open Integrations</button>
                    </div>
                  </div>
                  <div className={`rounded-xl border px-3 py-3 ${selectedMailboxHealth.card}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] opacity-80">Mailbox Health</div>
                        <div className="mt-1 text-sm font-semibold">{selectedMailbox?.health?.label || 'Healthy'}</div>
                      </div>
                      <div className="text-right text-xs opacity-80">
                        <div>Last sync {selectedMailbox?.last_synced_at ? formatRelative(selectedMailbox.last_synced_at) : 'never'}</div>
                        <div>Last test {selectedMailbox?.health?.last_tested_at ? formatRelative(selectedMailbox.health.last_tested_at) : 'never'}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-sm opacity-90">{selectedMailbox?.health?.detail || 'Inbound and outbound flows look ready.'}</div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg border border-white/10 bg-black/10 px-2 py-2">
                        <div className="opacity-70">Now</div>
                        <div className="mt-1 text-sm font-semibold">{selectedMailbox?.queue_counts?.now || 0}</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/10 px-2 py-2">
                        <div className="opacity-70">Reply</div>
                        <div className="mt-1 text-sm font-semibold">{selectedMailbox?.queue_counts?.['needs-reply'] || 0}</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/10 px-2 py-2">
                        <div className="opacity-70">Risk</div>
                        <div className="mt-1 text-sm font-semibold">{selectedMailbox?.queue_counts?.['at-risk'] || 0}</div>
                      </div>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Address</div>
                      <div className="mt-2 text-sm text-[var(--color-text-primary)]">{selectedMailbox?.address || 'Unassigned'}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Provider</div>
                      <div className="mt-2 text-sm text-[var(--color-text-primary)]">{selectedMailboxProvider.label}</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
                    Credential edits, OAuth connection, and mailbox creation now live in <span className="font-medium text-[var(--color-text-primary)]">Admin &gt; Integrations</span>. Comms keeps operational controls only.
                  </div>
                  {mailboxTestResult ? (
                    <div className={`rounded-xl border px-3 py-3 text-sm ${mailboxTestResult.status === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                      {mailboxTestResult.message}
                    </div>
                  ) : null}
                </section>

                <section className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><AlertTriangle size={16} /> Mail Events</div>
                  <div className="space-y-2">
                    {mailboxEvents.length > 0 ? mailboxEvents.slice(0, 6).map((event) => {
                      const meta = describeMailEvent(event);
                      return (
                        <div key={event.id} className={`rounded-xl border px-3 py-3 ${mailEventTone[meta.tone] || mailEventTone.info}`}>
                          <div className="flex items-center justify-between gap-3 text-xs opacity-80">
                            <span>{meta.title}</span>
                            <span>{formatRelative(event.created_at)}</span>
                          </div>
                          <div className="mt-1 text-sm font-medium">{meta.detail}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] opacity-80">
                            <span>Provider {event.source_provider}</span>
                            {event.payload?.mailbox_address ? <span>Mailbox {event.payload.mailbox_address}</span> : null}
                            {event.payload?.recipient_count ? <span>Recipients {event.payload.recipient_count}</span> : null}
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">No recent mail events for this mailbox.</div>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Workflow size={16} /> Operator Actions</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <button onClick={() => handleAiAction('reply')} className="px-3 py-3 rounded-xl border border-[var(--color-border)] text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)]">Reply with AI</button>
                    <button onClick={() => handleAiAction('rewrite')} className="px-3 py-3 rounded-xl border border-[var(--color-border)] text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)]">Rewrite</button>
                    <button onClick={() => handleAiAction('extract')} className="px-3 py-3 rounded-xl border border-[var(--color-border)] text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)]">Extract Tasks</button>
                    <button onClick={handleWorkflowNote} className="px-3 py-3 rounded-xl border border-[var(--color-border)] text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)]">Run Workflow</button>
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><AlertTriangle size={16} /> AI Cues</div>
                  <ul className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                    {(selectedThread.brief?.reasoning_cues || []).map((cue) => (
                      <li key={cue} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2">{cue}</li>
                    ))}
                  </ul>
                </section>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)]">Select a thread to inspect context.</div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default CommsModule;


