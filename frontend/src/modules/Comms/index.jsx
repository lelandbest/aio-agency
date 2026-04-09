import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CalendarDays,
  ChevronDown,
  Ellipsis,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  Smartphone,
  User,
  Workflow
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { BrainIcon, Crosshair } from '../../components/ui/icons';
import EmptyState from '../../components/EmptyState';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { useNotice } from '../../contexts/NoticeContext';
import { SPECIALIST_REGISTRY, VISIBLE_SPECIALIST_KEYS, ROW_COLOR_LANES, HQ_AGENT_STYLE } from '../Agents/data/agentRegistry';
import SystemConfirmModal from '../../components/Modals/SystemConfirmModal';
import {
  advanceThreadStageApi,
  assignThreadApi,
  createThreadReportApi,
  createDealFromThreadApi,
  createMailboxApi,
  createThreadApi,
  draftAiApi,
  deleteThreadApi,
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
  { id: 'closed', label: 'Closed' },
  { id: 'archived', label: 'Archived' }
];

const THREAD_VIEW_MODES = [
  { id: 'all', label: 'All Threads' },
  { id: 'latest-contact', label: 'Latest / Contact' },
  { id: 'latest-contact-channel', label: 'Latest / Contact + Channel' }
];

const EMPTY_SNAPSHOT = {
  queues: QUEUE_DEFINITIONS.map((queue) => ({ ...queue, count: 0 })),
  threads: [],
  allThreads: [],
  mailboxes: [],
  calendarEvents: [],
  agents: []
};

const AGENT_ROLE_HINTS = {
  ALPHA: 'Routes, orchestrates, and handles system-level decisions.',
  BRAVO: 'Owns strategic planning, market framing, and business direction.',
  CHARLIE: 'Owns support-facing intake, customer care, and service response.',
  DELTA: 'Coordinates timelines, milestones, and project movement.',
  ECHO: 'Owns communication craft, channel packaging, and socials output.',
  FORGE: 'Shapes copy, narrative, and content assets.',
  GHOST: 'Owns engineering, IT, integrations, and systems build.',
  ARCHER: 'Handles analytics, finance, ROI, and reporting.',
  ATLAS: 'Owns logistics, deployment coordination, and systems mapping.',
  RANGER: 'Handles SEO, search strategy, and optimization.',
  SCOUT: 'Owns hiring, recruiting, and people pipelines.',
  STRIKER: 'Drives sales framing, replies, and next-move execution.',
  VECTOR: 'Owns visual direction, design assets, and brand systems.'
};

const CHANNEL_FILTERS = [
  { id: 'all', label: 'All', icon: Radio },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'sms', label: 'SMS', icon: Smartphone },
  { id: 'internal', label: 'Internal', icon: MessageSquare }
];

const COMPOSER_CHANNEL_LABELS = {
  email: 'Email',
  sms: 'SMS',
  internal: 'Note'
};

const COMMS_WORKSPACE_SCALE = 0.65;
const LEFT_PANEL_MIN = 280;
const LEFT_PANEL_MAX = 480;
const RIGHT_PANEL_MIN = 320;
const RIGHT_PANEL_MAX = 560;
const COMPACT_THREE_COL_LEFT_MAX = 308;
const COMPACT_THREE_COL_RIGHT_MAX = 312;
const COMMS_TOOLBAR_SECONDARY = '!h-12 !rounded-full !border !border-[var(--color-border)] !bg-[var(--color-bg-secondary)] !px-4 !text-[var(--color-text-secondary)] !text-sm hover:!border-[var(--color-primary)]/50 hover:!bg-[var(--color-hover)] hover:!text-[var(--color-text-primary)] disabled:!opacity-40';
const COMMS_TOOLBAR_REPORT = '!h-12 !rounded-full !border border-cyan-500/50 !bg-cyan-500/10 !px-4 !text-cyan-200 !text-sm hover:!bg-cyan-500/20 disabled:!opacity-40';
const COMMS_TOOLBAR_GHOST = '!h-12 !rounded-full !border !border-transparent !bg-transparent !px-4 !text-[var(--color-text-tertiary)] !text-sm hover:!text-[var(--color-text-primary)] hover:!bg-[var(--color-hover)]';
const COMMS_TOOLBAR_PRIMARY = 'btn-primary-skeuo !h-12 !px-4 !text-sm !rounded-full';
const COMMS_PANEL = 'island-panel rounded-[var(--radius-outer)]';
const COMMS_SUBPANEL = 'rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-sm';
const COMMS_READING_WIDTH = 'max-w-[72rem]';
const COMMS_COLUMN_BG = 'bg-[var(--color-bg-secondary)]/95';
const COMMS_SECTION_BG = 'bg-[var(--color-bg-secondary)]/60';
const COMMS_MAIN_BG = 'bg-[var(--color-bg-primary)]/40';
const COMMS_HEADER_BG = 'bg-[var(--color-bg-secondary)]/90';
const COMMS_PILL_BASE = 'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]';
const COMMS_ACTION_TILE = 'rounded-[var(--radius-panel)] border border-[var(--color-border)] text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)] disabled:opacity-50';
const COMMS_COMPOSE_OPTION = 'h-8 rounded-[0.8rem] border px-3 py-1.5 text-xs flex items-center gap-2 transition';
const COMMS_INLINE_STAT = 'inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] shadow-sm';

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

const stripEmailHeaders = (value) => {
  if (!value) return value;
  const headerPatterns = [
    /^(Received|From|To|Cc|Bcc|Subject|Date|Message-ID|In-Reply-To|References|DKIM-Signature|DMARC|SPF|ARC-Message-Signature|ARC-Seal|X-.*|Return-Path|Reply-To):.*$/gim,
    /^(-separator-).*$/gim,
    /^__________________________________________$/gm,
    /^___.*___$/gm,
  ];
  let result = value;
  headerPatterns.forEach((pattern) => {
    result = result.replace(pattern, '');
  });
  result = result.replace(/^[\s\r\n]*-----.*-----[\s\r\n]*/g, '');
  result = result.replace(/^[\s\r\n]*={3,}[\s\r\n]*/g, '');
  const blankLineIndex = result.search(/^\s*$/m);
  if (blankLineIndex > 0 && blankLineIndex < 500) {
    result = result.substring(blankLineIndex);
  }
  return result.trim();
};

const normalizeAiText = (value, fallback = '') => {
  const source = `${value || ''}`.trim();
  if (!source) return fallback;
  const stripped = stripEmailHeaders(source);
  if (!looksLikeMarkup(stripped)) return stripped;

  const cleaned = decodeHtmlEntities(stripped)
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
  const channelMatch = channel === 'all' ? true : thread.channelType === channel;
  const mailboxMatch = mailboxId === 'all' ? true : thread.mailboxId === mailboxId;
  const searchMatch = !searchValue || [
    thread.subject,
    thread.generatedTitle,
    thread.preview,
    thread.contact ? `${thread.contact.firstName} ${thread.contact.lastName}` : '',
    thread.company?.name || ''
  ].some((value) => (value || '').toLowerCase().includes(searchValue));
  return queueMatch && channelMatch && mailboxMatch && searchMatch;
};

const shapeThreadsForView = (threads, mode) => {
  if (mode === 'all') return threads;
  const grouped = new Map();
  threads.forEach((thread) => {
    const contactKey = thread.contactId || thread.contact?.email || thread.contact?.id || thread.id;
    const key = mode === 'latest-contact-channel' ? `${contactKey}::${thread.channelType}` : contactKey;
    const existing = grouped.get(key);
    const currentStamp = new Date(thread.lastActivityAt || thread.updatedAt || 0).getTime();
    const existingStamp = existing ? new Date(existing.lastActivityAt || existing.updatedAt || 0).getTime() : -1;
    if (!existing || currentStamp >= existingStamp) {
      grouped.set(key, thread);
    }
  });
  return Array.from(grouped.values()).sort(
    (left, right) => new Date(right.lastActivityAt || right.updatedAt || 0).getTime() - new Date(left.lastActivityAt || left.updatedAt || 0).getTime()
  );
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
  const payloadMessage = event.payload?.message || event.payload?.subject || event.payload?.senderEmail || event.payload?.mailboxAddress || event.sourceProvider;
  if (event.eventType.includes('failed')) {
    return {
      tone: 'failure',
      title: formatEventLabel(event.eventType),
      detail: payloadMessage
    };
  }
  if (event.eventType === 'mailbox.tested') {
    return {
      tone: event.payload?.status === 'ok' ? 'success' : 'warning',
      title: 'Connection Test',
      detail: payloadMessage
    };
  }
  if (event.eventType === 'mail.sent') {
    return {
      tone: 'success',
      title: 'Outbound Delivered',
      detail: payloadMessage
    };
  }
  if (event.eventType === 'mail.received' || event.eventType === 'mailbox.synced') {
    return {
      tone: 'info',
      title: formatEventLabel(event.eventType),
      detail: payloadMessage
    };
  }
  return {
    tone: 'warning',
    title: formatEventLabel(event.eventType),
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
  const awaitingReply = Boolean(latestOutbound) && (!latestInbound || new Date(latestOutbound.createdAt).getTime() > new Date(latestInbound.createdAt).getTime());
  const replyAge = awaitingReply ? Date.now() - new Date(latestOutbound.createdAt).getTime() : 0;
  const followUpDue = Boolean(thread?.nextFollowUpAt) && new Date(thread.nextFollowUpAt).getTime() <= Date.now();
  const followUpScheduled = Boolean(thread?.nextFollowUpAt) && !followUpDue;
  const deliveryFailure = messages.some((message) => message.direction === 'outbound' && message.deliveryStatus === 'failed');
  const deliveryState = latestMessage?.direction === 'outbound' ? latestMessage.deliveryStatus || 'sent' : null;

  const chips = [];
  if (deliveryFailure) {
    chips.push({ key: 'delivery-failed', label: 'Delivery risk', tone: 'danger' });
  } else if (deliveryState && deliveryState !== 'sent') {
    chips.push({ key: 'delivery', label: `Delivery ${deliveryState}`, tone: 'warning' });
  }
  if (followUpDue) {
    chips.push({ key: 'follow-up-due', label: 'Follow-up due', tone: 'danger' });
  } else if (followUpScheduled) {
    chips.push({ key: 'follow-up-scheduled', label: `Follow-up ${formatRelative(thread.nextFollowUpAt)}`, tone: 'info' });
  }
  if (awaitingReply) {
    chips.push({
      key: 'awaiting-reply',
      label: replyAge >= 172800000 ? `No reply ${formatWindow(latestOutbound.createdAt)}` : `Waiting ${formatWindow(latestOutbound.createdAt)}`,
      tone: replyAge >= 172800000 ? 'danger' : replyAge >= 86400000 ? 'warning' : 'info'
    });
  } else if (latestInbound) {
    chips.push({ key: 'inbound-live', label: `Inbound ${formatWindow(latestInbound.createdAt)}`, tone: 'success' });
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

const createMailboxDraft = (provider = '') => ({
  name: '',
  address: '',
  provider,
  inboundEnabled: true,
  outboundEnabled: true,
  config: {}
});

const formatFlags = (thread) => Object.entries(thread.aiFlags || {}).filter(([, value]) => value).map(([key]) => key.replace(/_/g, ' '));
const isMailboxOauthProvider = (providerId) => ['gmail-oauth', 'microsoft365-oauth'].includes(providerId);
const openMailboxAdmin = () => window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'integrations', integrationCategory: 'email' } }));

const buildThreadReport = (thread, kind = 'executive') => {
  if (!thread) return '';
  const contactName = thread.contact ? `${thread.contact.firstName} ${thread.contact.lastName}`.trim() : 'Unlinked contact';
  const companyName = thread.company?.name || 'No company linked';
  const stage = thread.contact?.pipelineStage || 'No CRM stage';
  const summary = normalizeAiText(thread.brief?.summary, thread.preview || 'No brief available.');
  const nextStep = normalizeAiText(thread.brief?.recommendedNextStep, 'No recommended next step yet.');
  const unresolved = (thread.brief?.unresolvedQuestions || []).filter(Boolean);
  const cues = (thread.brief?.reasoningCues || []).filter(Boolean);
  const flags = formatFlags(thread);
  const actions = ((thread.actions || []).filter((action) => action.status === 'completed').slice(-5)).map((action) => (
    `- ${action.label} (${action.source || 'system'}, ${formatRelative(action.createdAt || thread.updatedAt)})`
  ));

  if (kind === 'operator') {
    return [
      'Operator Report',
      `Thread: ${thread.subject}`,
      `Contact: ${contactName}`,
      `Company: ${companyName}`,
      `Assigned Agent: ${thread.assignee || 'Unassigned'}`,
      `Stage: ${stage}`,
      `Status: ${thread.status}`,
      '',
      'Situation',
      summary,
      '',
      'Next Step',
      nextStep,
      '',
      'Open Questions',
      unresolved.length ? unresolved.map((item) => `- ${item}`).join('\n') : '- None logged',
      '',
      'Recent Agent / System Activity',
      actions.length ? actions.join('\n') : '- No completed actions yet',
    ].join('\n');
  }

  return [
    'Executive Thread Report',
    `Thread: ${thread.subject}`,
    `Priority: ${thread.aiPriority || 'medium'}`,
    `Contact: ${contactName}`,
    `Company: ${companyName}`,
    `Stage: ${stage}`,
    `Owner: ${thread.owner || 'Unassigned'}`,
    `Assignee: ${thread.assignee || 'Unassigned'}`,
    '',
    'Executive Summary',
    summary,
    '',
    'Recommended Next Step',
    nextStep,
    '',
    'Signals',
    flags.length ? `- ${flags.join('\n- ')}` : '- No active AI flags',
    '',
    'Reasoning Cues',
    cues.length ? cues.map((item) => `- ${item}`).join('\n') : '- No reasoning cues logged',
  ].join('\n');
};

const CommsModule = ({ initialChannel = 'all', initialThreadId = null, onNavigate, clientMode = false }) => {
  const { openAIAssist } = useAIAssist();
  const [queueId, setQueueId] = useState('now');
  const [threadViewMode, setThreadViewMode] = useState('latest-contact-channel');
  const [channel, setChannel] = useState(initialChannel);
  const [search, setSearch] = useState('');
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [activeMailboxId, setActiveMailboxId] = useState('all');
  const [composer, setComposer] = useState('');
  const [composerChannel, setComposerChannel] = useState(initialChannel === 'all' ? 'email' : initialChannel);
  const [busyLabel, setBusyLabel] = useState('');
  const [mailboxEvents, setMailboxEvents] = useState([]);
  const [mailboxForm, setMailboxForm] = useState({ name: '', address: '', provider: '', status: 'connected', inboundEnabled: true, outboundEnabled: true, config: {} });
  const [mailboxProviders, setMailboxProviders] = useState([]);
  const [mailboxTestResult, setMailboxTestResult] = useState(null);
  const [isMailboxComposerOpen, setIsMailboxComposerOpen] = useState(false);
  const [mailboxDraft, setMailboxDraft] = useState(() => createMailboxDraft());
  const { showNotice } = useNotice();
  const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1600 : window.innerWidth));
  const [leftPanelWidth, setLeftPanelWidth] = useState(296);
  const [rightPanelWidth, setRightPanelWidth] = useState(328);
  const [activeResizeSide, setActiveResizeSide] = useState(null);
  const layoutRef = useRef(null);
  const [promptModal, setPromptModal] = useState({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: null, promptValue: '' });

  const refresh = async () => {
    try {
      const backendSnapshot = await getCommsSnapshotApi();
      setSnapshot({
        ...backendSnapshot,
        threads: backendSnapshot.threads || backendSnapshot.allThreads || [],
        allThreads: backendSnapshot.allThreads || backendSnapshot.threads || []
      });
    } catch (error) {
      setSnapshot(EMPTY_SNAPSHOT);
      showNotice({ tone: 'error', message: 'Comms requires the local backend. Backend snapshot could not be loaded.' });
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (clientMode) {
      setMailboxProviders([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const providers = await getMailboxProvidersApi();
        if (!cancelled && providers?.length) {
          setMailboxProviders(providers);
        }
      } catch (error) {
        if (!cancelled) {
          setMailboxProviders([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientMode]);

  useEffect(() => {
    const unsubscribe = subscribe('*', refresh);
    return unsubscribe;
  }, []);

  const channelScopedThreads = useMemo(
    () => shapeThreadsForView(
      (snapshot.allThreads || []).filter((thread) => matchesThreadFilters(thread, { channel, search })),
      threadViewMode
    ),
    [snapshot.allThreads, channel, search, threadViewMode]
  );

  const mailboxScopedThreads = useMemo(
    () => channelScopedThreads.filter((thread) => activeMailboxId === 'all' ? true : thread.mailboxId === activeMailboxId),
    [channelScopedThreads, activeMailboxId]
  );

  const visibleThreads = useMemo(
    () => mailboxScopedThreads.filter((thread) => queueId === 'all' ? true : (thread.queueIds || []).includes(queueId)),
    [mailboxScopedThreads, queueId]
  );

  useEffect(() => {
    const current = visibleThreads.find((thread) => thread.id === selectedThreadId);
    if (!current && visibleThreads[0]) {
      setSelectedThreadId(visibleThreads[0].id);
    }
    if (!visibleThreads.length) {
      setSelectedThreadId(null);
    }
  }, [visibleThreads, selectedThreadId]);

  const selectedThread = useMemo(
    () => snapshot.allThreads.find((thread) => thread.id === selectedThreadId) || visibleThreads[0] || null,
    [snapshot.allThreads, visibleThreads, selectedThreadId]
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
      counts[mailbox.id] = channelScopedThreads.filter((thread) => thread.mailboxId === mailbox.id).length;
    });
    return counts;
  }, [channelScopedThreads, snapshot.mailboxes]);

  const activeMailbox = useMemo(
    () => (snapshot.mailboxes || []).find((mailbox) => mailbox.id === activeMailboxId) || null,
    [snapshot.mailboxes, activeMailboxId]
  );
  const isDesktopComms = viewportWidth >= 1280;
  const isWideDesktopComms = viewportWidth >= 1536;
  const isCompactComms = viewportWidth <= 1440;
  const showOperatorDiagnostics = !clientMode;
  const isThreeColumnComms = showOperatorDiagnostics && viewportWidth >= 1400;
  const isCompactThreeColumnComms = isThreeColumnComms && !isWideDesktopComms;
  const activeLeftPanelWidth = isCompactThreeColumnComms ? Math.min(leftPanelWidth, COMPACT_THREE_COL_LEFT_MAX) : leftPanelWidth;
  const activeRightPanelWidth = isCompactThreeColumnComms ? Math.min(rightPanelWidth, COMPACT_THREE_COL_RIGHT_MAX) : rightPanelWidth;
  const visibleQueueCards = isCompactComms
    ? queueCards.filter((queue) => !['automated', 'closed', 'archived'].includes(queue.id))
    : queueCards;
  const workspaceLayoutStyle = isThreeColumnComms
    ? { gridTemplateColumns: `${activeLeftPanelWidth}px 10px minmax(0,1fr) 10px ${activeRightPanelWidth}px` }
    : isDesktopComms
      ? { gridTemplateColumns: `${activeLeftPanelWidth}px 10px minmax(0,1fr)`, gridTemplateRows: 'minmax(0,1.1fr) minmax(18rem,0.9fr)' }
      : undefined;

  useEffect(() => {
    if (selectedThread) {
      setComposerChannel(selectedThread.channelType === 'internal' ? 'internal' : selectedThread.channelType || 'email');
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
    if (!activeResizeSide) return undefined;

    const handleMouseMove = (event) => {
      const bounds = layoutRef.current?.getBoundingClientRect();
      if (!bounds) return;

      if (activeResizeSide === 'left') {
        const leftMax = isCompactThreeColumnComms ? COMPACT_THREE_COL_LEFT_MAX : LEFT_PANEL_MAX;
        const reservedRight = isThreeColumnComms ? activeRightPanelWidth : 0;
        const maxWidth = Math.min(leftMax, bounds.width - reservedRight - 420);
        const nextWidth = Math.min(Math.max(event.clientX - bounds.left, LEFT_PANEL_MIN), Math.max(LEFT_PANEL_MIN, maxWidth));
        setLeftPanelWidth(nextWidth);
        return;
      }

      const rightMax = isCompactThreeColumnComms ? COMPACT_THREE_COL_RIGHT_MAX : RIGHT_PANEL_MAX;
      const maxWidth = Math.min(rightMax, bounds.width - activeLeftPanelWidth - 420);
      const nextWidth = Math.min(Math.max(bounds.right - event.clientX, RIGHT_PANEL_MIN), Math.max(RIGHT_PANEL_MIN, maxWidth));
      setRightPanelWidth(nextWidth);
    };

    const handleMouseUp = () => setActiveResizeSide(null);
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeLeftPanelWidth, activeResizeSide, activeRightPanelWidth, isCompactThreeColumnComms, isThreeColumnComms]);

  useEffect(() => {
    const mailbox = (snapshot.mailboxes || []).find((item) => item.id === (selectedThread?.mailboxId || activeMailbox?.id)) || snapshot.mailboxes?.[0] || null;
    if (!mailbox) {
      setMailboxForm({ name: '', address: '', provider: '', status: 'connected', inboundEnabled: true, outboundEnabled: true, config: {} });
      setMailboxTestResult(null);
      return;
    }
    setMailboxForm({
      name: mailbox.name || '',
      address: mailbox.address || '',
      provider: mailbox.provider || '',
      status: mailbox.status || 'connected',
      inboundEnabled: mailbox.inboundEnabled !== false,
      outboundEnabled: mailbox.outboundEnabled !== false,
      config: mailbox.config || {}
    });
    setMailboxTestResult(null);
  }, [selectedThread, snapshot.mailboxes, activeMailbox]);

  useEffect(() => {
    if (clientMode) {
      setMailboxEvents([]);
      return undefined;
    }
    const mailbox = (snapshot.mailboxes || []).find((item) => item.id === (selectedThread?.mailboxId || activeMailbox?.id)) || snapshot.mailboxes?.[0] || null;
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
  }, [selectedThread, snapshot.mailboxes, activeMailbox, clientMode]);

  const runAction = async (label, action) => {
    setBusyLabel(label);
    try {
      await action();
      refresh();
    } catch (error) {
      showNotice({ tone: 'error', message: readErrorMessage(error) });
    } finally {
      setBusyLabel('');
    }
  };

  const handleSend = async () => {
    if (!selectedThread || !composer.trim()) return;
    await runAction('Sending', async () => {
      if (composerChannel === 'email') {
        await sendThreadEmailApi(selectedThread.id, {
          mailboxId: selectedThread.mailboxId,
          body: composer.trim(),
          senderName: 'AIO Flow',
          recipients: [selectedThread.contact?.email].filter(Boolean)
        });
      } else {
        await sendThreadMessageApi(selectedThread.id, { body: composer.trim(), channelType: composerChannel });
      }
      setComposer('');
    });
  };

  const handleCreateThread = async () => {
    setPromptModal({
      isOpen: true,
      title: 'Create Thread',
      message: 'Enter subject for the new thread:',
      defaultValue: '',
      onConfirm: async (subject) => {
        if (!subject) return;
        await runAction('Creating', async () => {
          const mailboxId = activeMailbox?.id || selectedMailbox?.id || snapshot.mailboxes?.[0]?.id || null;
          const thread = await createThreadApi({ subject, channelType: channel === 'all' ? 'email' : channel, body: 'New thread initiated from Comms mission control.', mailboxId: mailboxId });
          setSelectedThreadId(thread?.id || null);
        });
      }
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
      const response = await draftAiApi({
        module: 'comms',
        surface: 'thread',
        field,
        intent: field === 'summary' ? 'summarize' : 'draft',
        currentValue: field === 'rewrite' ? composer || selectedThread.preview || '' : selectedThread.brief?.summary || selectedThread.preview || '',
        context: {
          threadId: selectedThread.id,
          subject: selectedThread.subject,
          preview: selectedThread.preview,
          summary: selectedThread.brief?.summary,
          recommendedNextStep: selectedThread.brief?.recommendedNextStep,
          disposition: selectedThread.brief?.disposition,
          unresolvedQuestions: selectedThread.brief?.unresolvedQuestions || [],
          reasoningCues: selectedThread.brief?.reasoningCues || [],
          aiFlags: Object.keys(selectedThread.aiFlags || {}).filter((key) => selectedThread.aiFlags[key]),
          priority: selectedThread.aiPriority,
          contactName: selectedThread.contact ? `${selectedThread.contact.firstName} ${selectedThread.contact.lastName}`.trim() : '',
          companyName: selectedThread.company?.name || '',
          assignee: selectedThread.assignee,
          latestMessage: latestMessage?.plain_text || latestMessage?.body || '',
          latestDirection: latestMessage?.direction || '',
        }
      });
      if (field !== 'summary') {
        setComposer(response?.draft || response?.suggestion || '');
      }
      if (response?.thread?.id) {
        setSelectedThreadId(response.thread.id);
      }
      showNotice({
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
      await sendThreadMessageApi(selectedThread.id, { body: 'Workflow suggested: create follow-up task, refresh CRM brief, and offer a booking link.', channelType: 'internal', senderName: 'ALPHA', senderEmail: 'system@aiocrm.local', recipients: ['Internal'], direction: 'system' });
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
      showNotice({
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
      showNotice({
        tone: 'success',
        message: `${selectedMailbox.name} connected via ${result.provider || selectedProvider.label}.`
      });
      await refresh();
    });
  };

  const handleMoveThreadToMailbox = async () => {
    if (!selectedThread?.id || !activeMailbox?.id || selectedThread.mailboxId === activeMailbox.id) return;
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
      const seedThread = visibleThreads[0] || snapshot.allThreads?.find((thread) => thread.mailboxId === selectedMailbox.id) || snapshot.allThreads?.[0];
      await ingestMailboxMessageApi(selectedMailbox.id, {
        subject: seedThread?.subject || `${selectedMailbox.name} inbound sample`,
        body: 'Inbound signal generated from the mailbox operations strip so you can validate routing, AI brief refresh, and queue movement in one step.',
        senderName: seedThread?.contact ? `${seedThread.contact.firstName} ${seedThread.contact.lastName}` : 'Inbound Contact',
        sender_email: seedThread?.contact?.email || 'contact@inbox.local',
        recipients: [selectedMailbox.address].filter(Boolean)
      });
    });
  };

  const handleCreateDeal = async () => {
    if (!selectedThread?.id) return;
    await runAction('Creating deal', async () => {
      await createDealFromThreadApi(selectedThread.id);
      showNotice({ tone: 'success', message: 'Deal shell created from the active thread.' });
    });
  };

  const handleAdvanceStage = async () => {
    if (!selectedThread?.id) return;
    await runAction('Advancing stage', async () => {
      await advanceThreadStageApi(selectedThread.id);
      showNotice({ tone: 'success', message: 'Pipeline stage advanced from Comms.' });
    });
  };

  const handleScheduleMeeting = async () => {
    if (!selectedThread?.id) return;
    await runAction('Scheduling meeting', async () => {
      await scheduleThreadMeetingApi(selectedThread.id);
      showNotice({ tone: 'success', message: 'Meeting follow-up scheduled from the active thread.' });
    });
  };
  const handleCreateReport = async (kind) => {
    if (!selectedThread?.id) return;
    const label = kind === 'executive' ? 'Creating executive report' : 'Creating operator report';
    await runAction(label, async () => {
      await createThreadReportApi(selectedThread.id, kind);
      showNotice({
        tone: 'success',
        message: kind === 'executive' ? 'Executive report artifact created.' : 'Operator report artifact created.'
      });
    });
  };
  const handleArchiveThread = async () => {
    if (!selectedThread?.id) return;
    await runAction('Archiving thread', async () => {
      await updateThreadStatusApi(selectedThread.id, 'archived');
      showNotice({ tone: 'success', message: 'Thread archived from active queues.' });
    });
  };
  const handleDeleteThread = async () => {
    if (!selectedThread?.id) return;
    await runAction('Deleting thread', async () => {
      await deleteThreadApi(selectedThread.id);
      showNotice({ tone: 'warning', message: 'Thread deleted from Comms. Mailbox-side deletion is still separate.' });
    });
  };
  const handleAssignThread = async (assigneeName) => {
    if (!selectedThread?.id || !assigneeName || assigneeName === selectedThread.assignee) {
      setIsAssigneeMenuOpen(false);
      return;
    }
    await runAction('Assigning', async () => {
      await assignThreadApi(selectedThread.id, assigneeName);
      showNotice({ tone: 'success', message: `Thread assigned to ${assigneeName}.` });
      setIsAssigneeMenuOpen(false);
    });
  };
  const handleUpdateCalendarArtifact = async (eventId, updates, label, successMessage) => {
    await runAction(label, async () => {
      await updateCalendarEventApi(eventId, updates);
      showNotice({ tone: 'success', message: successMessage });
    });
  };
  const handlePushCalendarArtifact = async (eventId) => {
    await runAction('Pushing meeting', async () => {
      await pushCalendarEventApi(eventId);
      showNotice({ tone: 'success', message: 'Meeting pushed to the active calendar source.' });
    });
  };
  const handleReconcileCalendarArtifact = async (eventId, strategy) => {
    await runAction('Reconciling meeting', async () => {
      const response = await reconcileCalendarEventApi(eventId, strategy);
      showNotice({ tone: 'success', message: response?.result?.message || 'Meeting conflict reconciled.' });
    });
  };

  const threadFlags = formatFlags(selectedThread || {});
  const selectedMailboxId = selectedThread?.mailboxId || activeMailbox?.id || snapshot.mailboxes?.[0]?.id || null;
  const selectedMailbox = useMemo(
    () => (snapshot.mailboxes || []).find((mailbox) => mailbox.id === selectedMailboxId) || activeMailbox || snapshot.mailboxes?.[0] || null,
    [snapshot.mailboxes, selectedMailboxId, activeMailbox]
  );
  const selectedProvider = mailboxProviders.find((provider) => provider.id === mailboxForm.provider) || { id: '', label: mailboxForm.provider || 'Unknown provider', fields: [] };
  const draftProvider = mailboxProviders.find((provider) => provider.id === mailboxDraft.provider) || { id: '', label: mailboxDraft.provider || 'Unknown provider', fields: [] };
  const selectedMailboxHealth = mailboxHealthTone[selectedMailbox?.health?.state || 'healthy'] || mailboxHealthTone.healthy;
  const selectedMailboxProvider = mailboxProviders.find((provider) => provider.id === selectedMailbox?.provider) || { id: '', label: selectedMailbox?.provider || 'Unknown provider', fields: [] };
  const selectedMailboxEventSummary = useMemo(() => ({
    failures: mailboxEvents.filter((event) => event.eventType.includes('failed')).length,
    sent: mailboxEvents.filter((event) => event.eventType === 'mail.sent').length,
    received: mailboxEvents.filter((event) => event.eventType === 'mail.received').length,
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
  const recentAgentActions = useMemo(
    () => completedThreadActions.filter((action) => ['ai', 'system'].includes(action.source || '')).slice(0, 5),
    [completedThreadActions]
  );
  const threadCalendarEvents = useMemo(
    () => selectedThread?.calendarEvents || [],
    [selectedThread]
  );
  const reportArtifacts = useMemo(
    () => ((selectedThread?.artifacts || []).filter((artifact) => artifact.artifact_type === 'report')),
    [selectedThread]
  );
  const availableAgents = useMemo(
    () => (snapshot.agents || []).map((agent) => agent.name).filter(Boolean),
    [snapshot.agents]
  );
  const latestAgentAction = useMemo(
    () =>
      completedThreadActions.find((action) => {
        const agentName = `${action.agent_name || action.agent || ''}`.trim().toUpperCase();
        return agentName && availableAgents.includes(agentName);
      }) || null,
    [availableAgents, completedThreadActions]
  );
  const latestAgentMessage = useMemo(() => {
    const messages = (selectedThread?.messages || []).slice().reverse();
    return (
      messages.find((message) => {
        const senderName = `${message.sender_name || ''}`.trim().toUpperCase();
        return senderName && availableAgents.includes(senderName);
      }) || null
    );
  }, [availableAgents, selectedThread]);
  const activeAgentIdentity = useMemo(() => {
    if (selectedThread?.activeAgentIdentity) {
      return selectedThread.activeAgentIdentity;
    }
    const messageStamp = latestAgentMessage?.createdAt ? new Date(latestAgentMessage.createdAt).getTime() : 0;
    const actionStamp = latestAgentAction?.createdAt ? new Date(latestAgentAction.createdAt).getTime() : 0;
    const latestRuntimeSignal = actionStamp >= messageStamp
      ? { name: `${latestAgentAction?.agent_name || latestAgentAction?.agent || ''}`.trim().toUpperCase(), zone: 'EXECUTION' }
      : { name: `${latestAgentMessage?.sender_name || ''}`.trim().toUpperCase(), zone: 'EXECUTION' };
    const assignedAgentName = `${selectedThread?.assignee || ''}`.trim().toUpperCase();
    const agentName = latestRuntimeSignal.name || assignedAgentName;
    if (!agentName) return '';
    const agentZone = latestRuntimeSignal.name ? latestRuntimeSignal.zone : 'DISPATCH';
    return `${agentName} // ${agentZone}`;
  }, [latestAgentAction, latestAgentMessage, selectedThread?.activeAgentIdentity, selectedThread?.assignee]);

  const agentRailAgents = useMemo(
    () => {
      const backendAgents = availableAgents.length > 0 ? availableAgents : VISIBLE_SPECIALIST_KEYS;
      return VISIBLE_SPECIALIST_KEYS.filter((agentName) => backendAgents.includes(agentName)).slice(0, 13);
    },
    [availableAgents]
  );

  const agentActivityLog = useMemo(() => {
    const entries = [];
    if (selectedThread?.assignee) {
      entries.push({
        id: `assignee-${selectedThread.id}`,
        stamp: new Date(selectedThread.updatedAt || selectedThread.lastActivityAt || 0).getTime(),
        prefix: 'ROUTE',
        agent: selectedThread.assignee.toUpperCase(),
        detail: 'Assigned to current thread'
      });
    }
    if (latestAgentMessage) {
      entries.push({
        id: latestAgentMessage.id || 'latest-message',
        stamp: new Date(latestAgentMessage.createdAt || 0).getTime(),
        prefix: 'MSG',
        agent: `${latestAgentMessage.sender_name || 'AGENT'}`.trim().toUpperCase(),
        detail: normalizeAiText(latestAgentMessage.plain_text, latestAgentMessage.body || '').slice(0, 88) || 'Message signal received'
      });
    }
    recentAgentActions.forEach((action) => {
      entries.push({
        id: action.id || `${action.action_type}-${action.label}`,
        stamp: new Date(action.createdAt || selectedThread?.updatedAt || 0).getTime(),
        prefix: 'ACT',
        agent: `${action.agent_name || action.agent || action.source || 'SYSTEM'}`.trim().toUpperCase(),
        detail: action.label || 'Action completed'
      });
    });
    return entries
      .sort((left, right) => right.stamp - left.stamp)
      .filter((entry, index, list) => list.findIndex((item) => item.id === entry.id) === index)
      .slice(0, 6);
  }, [latestAgentMessage, recentAgentActions, selectedThread]);

  const briefSummary = normalizeAiText(
    selectedThread?.brief?.summary,
    selectedThread?.preview || 'AI summary is being refined from the latest thread context.'
  );
  const briefNextStep = normalizeAiText(
    selectedThread?.brief?.recommendedNextStep,
    'Review the latest inbound signal and send the next decisive response.'
  );
  const compactPulseItems = useMemo(() => {
    if (!selectedThreadPulse) return [];
    return [
      {
        key: 'touch',
        label: 'Touch',
        value: selectedThreadPulse.latestMessage?.direction || 'none',
        detail: selectedThreadPulse.latestMessage?.createdAt ? formatRelative(selectedThreadPulse.latestMessage.createdAt) : 'No messages yet',
        tone: pulseTone.neutral
      },
      {
        key: 'reply',
        label: 'Reply',
        value: selectedThreadPulse.awaitingReply ? `Waiting ${formatWindow(selectedThreadPulse.latestOutbound?.createdAt)}` : 'Clear',
        detail: selectedThreadPulse.awaitingReply ? 'Needs response' : 'Not blocked',
        tone: pulseTone[selectedThreadPulse.awaitingReply ? (selectedThreadPulse.latestOutbound && Date.now() - new Date(selectedThreadPulse.latestOutbound.createdAt).getTime() >= 172800000 ? 'danger' : 'warning') : 'success']
      },
      {
        key: 'follow-up',
        label: 'Follow-up',
        value: selectedThreadPulse.followUpDue ? 'Due now' : selectedThreadPulse.followUpScheduled ? formatRelative(selectedThread?.nextFollowUpAt) : 'None',
        detail: selectedThreadPulse.followUpScheduled ? formatDateTime(selectedThread?.nextFollowUpAt) : 'No scheduled follow-up',
        tone: pulseTone[selectedThreadPulse.followUpDue ? 'danger' : selectedThreadPulse.followUpScheduled ? 'info' : 'neutral']
      },
      {
        key: 'delivery',
        label: 'Delivery',
        value: selectedThreadPulse.deliveryState || 'No send',
        detail: selectedThreadPulse.latestMessage?.direction === 'outbound' ? 'Latest outbound state' : 'Waiting for outbound',
        tone: pulseTone[selectedThreadPulse.deliveryState && selectedThreadPulse.deliveryState !== 'sent' ? 'warning' : 'success']
      }
    ];
  }, [selectedThread?.nextFollowUpAt, selectedThreadPulse]);

  const hiddenScrollbarStyle = {
    scrollbarWidth: 'none',
    msOverflowStyle: 'none'
  };
  const threadCountPill = (
    <button className={`inline-flex px-3 py-1 h-8 shrink-0 flex items-center justify-center rounded-[var(--radius-pill)] text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border shadow-island-sm ${selectedMailbox?.health?.state === 'attention'
        ? 'border-amber-500/30 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
        : 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/20'
      }`}>
      {visibleThreads.length} threads
    </button>
  );
  const primaryHeaderActions = [
    { label: '+ ADD THREAD', onClick: handleCreateThread, variant: 'primary' },
    threadCountPill,
    { label: 'Manage Mailboxes', icon: Settings2, onClick: openMailboxAdmin, variant: 'secondary', groupStart: true },
    { label: 'Canned Responses', icon: MessageSquare, onClick: () => onNavigate?.('canned-responses'), variant: 'secondary' }
  ];
  const secondaryHeaderActions = clientMode
    ? []
    : [
      {
        label: 'Simulate Receive', icon: ArrowRight, onClick: () => runAction('Simulating', async () => {
          const seedThread = visibleThreads[0] || snapshot.allThreads?.[0];
          const targetChannel = channel === 'all' ? 'email' : channel;
          if (seedThread && targetChannel === 'email' && (seedThread.mailboxId || snapshot.mailboxes?.[0]?.id)) {
            await ingestMailboxMessageApi(seedThread.mailboxId || snapshot.mailboxes?.[0]?.id, {
              subject: seedThread.subject,
              body: 'Following up because the latest proposal looks close. I just need the cleanest next step and the right owner on your side.',
              senderName: seedThread.contact ? `${seedThread.contact.firstName} ${seedThread.contact.lastName}` : 'Incoming Contact',
              sender_email: seedThread.contact?.email || 'contact@inbox.local',
              recipients: [seedThread.mailbox?.address || snapshot.mailboxes?.[0]?.address].filter(Boolean)
            });
          } else if (seedThread) {
            await sendThreadMessageApi(seedThread.id, {
              body: targetChannel === 'sms' ? 'Quick check-in. Are we still on for the follow-up and do you have the latest scope details handy?' : 'Following up because the latest proposal looks close. I just need the cleanest next step and the right owner on your side.',
              channelType: targetChannel,
              senderName: seedThread.contact ? `${seedThread.contact.firstName} ${seedThread.contact.lastName}` : 'Incoming Contact',
              sender_email: seedThread.contact?.email || 'contact@inbox.local',
              recipients: [seedThread.mailbox?.address || snapshot.mailboxes?.[0]?.address || 'mail@aiocrm.org'],
              direction: 'inbound'
            });
          }
        }), variant: 'secondary'
      },
      {
        label: 'Sync Mailbox', icon: Mail, onClick: () => runAction('Syncing', async () => {
          if (!selectedMailbox?.id) return;
          await syncMailboxApi(selectedMailbox.id);
        }), variant: 'secondary'
      },
      { label: 'Inject Inbound', icon: ArrowRight, onClick: handleReceiveForMailbox, disabled: !selectedMailbox?.id, variant: 'secondary' },
      { label: 'Draft Reply', icon: MessageSquare, onClick: () => handleAiAction('reply'), disabled: !selectedThread?.id, variant: 'secondary', groupStart: true },
      { label: 'Extract Tasks', icon: Workflow, onClick: () => handleAiAction('extract'), disabled: !selectedThread?.id, variant: 'secondary' },
      { label: 'Run Workflow', icon: Bot, onClick: handleWorkflowNote, disabled: !selectedThread?.id, variant: 'secondary' },
      { label: 'Operator Report', icon: FileText, onClick: () => handleCreateReport('operator'), disabled: !selectedThread?.id, variant: 'secondary', color: 'sky', groupStart: true },
      { label: 'Executive Report', icon: FileText, onClick: () => handleCreateReport('executive'), disabled: !selectedThread?.id, variant: 'secondary', color: 'sky' },
    ];
  const compactPrimaryHeaderActions = clientMode
    ? secondaryHeaderActions
    : [
      secondaryHeaderActions.find((action) => action.label === 'Simulate Receive'),
      secondaryHeaderActions.find((action) => action.label === 'Sync Mailbox'),
      secondaryHeaderActions.find((action) => action.label === 'Run Workflow'),
      secondaryHeaderActions.find((action) => action.label === 'Extract Tasks'),
    ].filter(Boolean);
  const headerActions = isCompactComms && !clientMode ? compactPrimaryHeaderActions : secondaryHeaderActions;

  return (
    <div className="module-root-standard">
      <SystemConfirmModal
        isOpen={promptModal.isOpen}
        onClose={() => setPromptModal({ ...promptModal, isOpen: false })}
        onConfirm={() => {
          if (promptModal.onConfirm) promptModal.onConfirm(promptModal.promptValue);
          setPromptModal({ ...promptModal, isOpen: false });
        }}
        title={promptModal.title}
        message={promptModal.message}
        confirmText="Create"
        cancelText="Cancel"
        showPrompt={true}
        promptValue={promptModal.promptValue || ''}
        onPromptChange={(val) => setPromptModal({ ...promptModal, promptValue: val })}
        promptPlaceholder={promptModal.defaultValue || 'Enter subject...'}
        variant="info"
      />
      
      <style>{`
        .comms-scroll-hidden::-webkit-scrollbar{display:none;width:0;height:0;}
        .comms-thread-strip{scrollbar-width:thin;scrollbar-color:rgba(96,165,250,0.58) rgba(15,23,42,0.42);}
        .comms-thread-strip::-webkit-scrollbar{height:10px;}
        .comms-thread-strip::-webkit-scrollbar-track{background:rgba(15,23,42,0.4);border-radius:999px;}
        .comms-thread-strip::-webkit-scrollbar-thumb{background:linear-gradient(90deg,rgba(96,165,250,0.75),rgba(59,130,246,0.58));border-radius:999px;border:2px solid rgba(15,23,42,0.34);}
        .comms-thread-strip::-webkit-scrollbar-thumb:hover{background:linear-gradient(90deg,rgba(125,183,255,0.82),rgba(79,144,255,0.66));}
      `}</style>
      <div className="module-root-standard">
        {/* Toolbar */}
        <div className="module-toolbar">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
            {primaryHeaderActions.map((action, idx) => {
              if (React.isValidElement(action)) return <React.Fragment key={idx}>{action}</React.Fragment>;
              const Icon = action.icon;
              return (
                <React.Fragment key={idx}>
                  {action.groupStart && <div className="mx-1 hidden h-6 w-px bg-[var(--color-border)] opacity-30 xl:block" />}
                  <button
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={`${idx === 0 ? 'btn-toolbar-lead' : 'btn-secondary'} shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2 disabled:opacity-40`}
                  >
                    {Icon && <Icon size={12} />}
                    <span className="font-bold uppercase tracking-[0.14em]">{action.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex min-w-0 items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {headerActions.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <React.Fragment key={idx}>
                    {action.groupStart && <div className="mx-1 hidden h-6 w-px bg-[var(--color-border)] opacity-30 xl:block" />}
                    <button
                      onClick={action.onClick}
                      disabled={action.disabled}
                      className={`btn-secondary shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2 ${action.color === 'sky' ? 'border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25' : ''} disabled:opacity-40`}
                    >
                      {Icon && <Icon size={12} />}
                      <span className="font-bold uppercase tracking-[0.14em]">{action.label}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="module-toolbar-utility">
              <button
                onClick={() => openAIAssist()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all group"
                title="Brain (Global KB)"
              >
                <BrainIcon size={14} />
              </button>
              <button
                onClick={() => openAIAssist({ context: { module: 'comms', threadId: selectedThread?.id } })}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all group"
                title="Crosshair (Module AI)"
              >
                <Crosshair size={14} />
              </button>
            </div>
          </div>
        </div>
        <div className="module-content-stage module-surface-shell relative">
          <div ref={layoutRef} className="h-full min-h-0 grid grid-cols-1" style={workspaceLayoutStyle}>
            <aside style={hiddenScrollbarStyle} className={`comms-scroll-hidden min-w-0 border-b border-[var(--color-border)] ${COMMS_COLUMN_BG} flex flex-col min-h-0 overflow-y-auto ${isThreeColumnComms ? 'col-start-1 row-start-1 border-b-0 border-r' : isDesktopComms ? 'col-start-1 row-start-1 row-span-2 border-b-0 border-r' : ''}`}>
              <div className={`${isCompactComms ? 'p-2.5' : 'p-3'} border-b border-[var(--color-border)] space-y-2.5 ${COMMS_SECTION_BG}`}>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-3 text-[var(--color-text-secondary)]" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search threads, contacts, companies" className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">View</div>
                  <div className="flex flex-wrap gap-2">
                    {CHANNEL_FILTERS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.id} onClick={() => setChannel(item.id)} className={`px-2.5 py-1 rounded-full text-[11px] border flex items-center gap-1.5 ${channel === item.id ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)] border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50'}`}>
                          <Icon size={12} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={`${isCompactComms ? 'p-2.5' : 'p-3'} border-b border-[var(--color-border)] space-y-2 ${COMMS_SECTION_BG}`}>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Mailboxes</div>
                <div className="space-y-2">
                  <button onClick={() => setActiveMailboxId('all')} className={`w-full rounded-[var(--radius-panel)] border px-3 py-2.5 text-left shadow-sm ${activeMailboxId === 'all' ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)] bg-[var(--color-bg-primary)]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm text-[var(--color-text-primary)]">All Mailboxes</div>
                        <div className="text-xs text-[var(--color-text-secondary)]">Unified operator scope</div>
                      </div>
                      <div className="text-xs text-[var(--color-text-secondary)]">{mailboxVisibleCounts.all || 0}</div>
                    </div>
                    <div className="mt-2 text-[10px] text-[var(--color-text-secondary)]">Unified view across the active queue and channel.</div>
                  </button>
                  {(snapshot.mailboxes || []).map((mailbox) => {
                    const health = mailboxHealthTone[mailbox.health?.state || 'healthy'] || mailboxHealthTone.healthy;
                    const isActiveMailbox = activeMailboxId === mailbox.id;
                    return (
                      <button key={mailbox.id} onClick={() => setActiveMailboxId(mailbox.id)} className={`w-full rounded-[var(--radius-panel)] border px-3 py-2.5 text-left transition shadow-sm ${isActiveMailbox ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)] bg-[var(--color-bg-primary)]'}`}>
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
                        {isActiveMailbox ? (
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                            <span className={`${COMMS_INLINE_STAT} max-w-full`}>
                              <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Address</span>
                              <span className="truncate text-[var(--color-text-primary)]">{mailbox.address || 'unassigned'}</span>
                            </span>
                            <span className={COMMS_INLINE_STAT}>
                              <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Sync</span>
                              <span className="text-[var(--color-text-primary)]">{mailbox.last_synced_at ? formatRelative(mailbox.last_synced_at) : 'never'}</span>
                            </span>
                            <span className={COMMS_INLINE_STAT}>
                              <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Outbound</span>
                              <span className="text-[var(--color-text-primary)]">{mailbox.outboundEnabled ? 'enabled' : 'off'}</span>
                            </span>
                            <span className={COMMS_INLINE_STAT}>
                              <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Visible</span>
                              <span className="text-[var(--color-text-primary)]">{mailboxVisibleCounts[mailbox.id] || 0}</span>
                            </span>
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!clientMode ? (
                <>
                  <div className={`${isCompactComms ? 'p-2.5' : 'p-3'} border-b border-[var(--color-border)] space-y-2.5 ${COMMS_SECTION_BG}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><AlertTriangle size={16} /> Mail Events</div>
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        {selectedMailboxEventSummary.failures} failures / {selectedMailboxEventSummary.received} inbound
                      </span>
                    </div>
                    <div className="space-y-2">
                      {mailboxEvents.length > 0 ? mailboxEvents.slice(0, 6).map((event) => {
                        const meta = describeMailEvent(event);
                        return (
                          <div key={event.id} className={`rounded-xl border px-3 py-3 ${mailEventTone[meta.tone] || mailEventTone.info}`}>
                            <div className="flex items-center justify-between gap-3 text-xs opacity-80">
                              <span>{meta.title}</span>
                              <span>{formatRelative(event.createdAt)}</span>
                            </div>
                            <div className="mt-1 text-sm font-medium">{meta.detail}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] opacity-80">
                              <span>Provider {event.sourceProvider}</span>
                              {event.payload?.mailboxAddress ? <span>Mailbox {event.payload.mailboxAddress}</span> : null}
                              {event.payload?.recipient_count ? <span>Recipients {event.payload.recipient_count}</span> : null}
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">No recent mail events for this mailbox.</div>
                      )}
                    </div>
                  </div>

                  <div className={`${isCompactComms ? 'p-2.5' : 'p-3'} border-b border-[var(--color-border)] space-y-2.5 ${COMMS_SECTION_BG}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Mail size={16} /> Mailbox Admin</div>
                      <div className="flex items-center gap-2">
                        <button onClick={handleTestMailbox} disabled={!selectedMailbox?.id} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50">Test</button>
                        <button onClick={openMailboxAdmin} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Open Integrations</button>
                      </div>
                    </div>
                    <div className={`rounded-[var(--radius-panel)] border px-3 py-2.5 shadow-sm ${selectedMailboxHealth.card}`}>
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
                      <div className="mt-1.5 text-xs opacity-90">{selectedMailbox?.health?.detail || 'Inbound and outbound flows look ready.'}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/10 px-2.5 py-1">
                          <span className="opacity-70 uppercase tracking-[0.14em]">Now</span>
                          <span className="text-sm font-semibold">{selectedMailbox?.queue_counts?.now || 0}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/10 px-2.5 py-1">
                          <span className="opacity-70 uppercase tracking-[0.14em]">Reply</span>
                          <span className="text-sm font-semibold">{selectedMailbox?.queue_counts?.['needs-reply'] || 0}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/10 px-2.5 py-1">
                          <span className="opacity-70 uppercase tracking-[0.14em]">Risk</span>
                          <span className="text-sm font-semibold">{selectedMailbox?.queue_counts?.['at-risk'] || 0}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className={`${COMMS_INLINE_STAT} max-w-full`}>
                        <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Address</span>
                        <span className="truncate text-[var(--color-text-primary)]">{selectedMailbox?.address || 'Unassigned'}</span>
                      </span>
                      <span className={COMMS_INLINE_STAT}>
                        <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Provider</span>
                        <span className="text-[var(--color-text-primary)]">{selectedMailboxProvider.label}</span>
                      </span>
                    </div>
                    {mailboxTestResult ? (
                      <div className={`rounded-[1.1rem] border px-3 py-3 text-sm ${mailboxTestResult.status === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                        {mailboxTestResult.message}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </aside>

            {isDesktopComms ? (
              <div
                onMouseDown={() => setActiveResizeSide('left')}
                className={`hidden xl:block col-start-2 row-start-1 ${isThreeColumnComms ? '' : 'row-span-2'} cursor-col-resize bg-transparent transition ${activeResizeSide === 'left' ? 'bg-[var(--color-primary)]/30' : 'hover:bg-[var(--color-primary)]/15'}`}
              />
            ) : null}

            <main className={`min-w-0 flex flex-col min-h-0 overflow-hidden ${COMMS_MAIN_BG} ${isThreeColumnComms ? 'col-start-3 row-start-1 border-r border-[var(--color-border)]' : isDesktopComms ? 'col-start-3 row-start-1 border-b border-[var(--color-border)]' : 'border-b border-[var(--color-border)]'}`}>
              {selectedThread ? (
                <>
                  <div className={`shrink-0 border-b border-[var(--color-border)] ${COMMS_HEADER_BG} shadow-[inset_0_-1px_0_rgba(15,23,42,0.82)] ${isCompactComms ? 'p-2.5' : 'px-3.5 py-3'}`}>
                    <div className={isCompactComms ? 'space-y-1 min-w-0' : 'flex items-center justify-between gap-2 min-w-0'}>
                      <div className={isCompactComms ? 'min-w-0 space-y-1' : 'flex min-w-0 items-center gap-2'}>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Thread Queue</div>
                        <div
                          style={isCompactComms ? hiddenScrollbarStyle : undefined}
                          className={isCompactComms ? 'comms-scroll-hidden -mx-1 overflow-x-auto px-1' : 'flex flex-wrap gap-2'}
                        >
                          <div className="flex min-w-max gap-1">
                            {THREAD_VIEW_MODES.map((mode) => (
                              <button
                                key={mode.id}
                                onClick={() => setThreadViewMode(mode.id)}
                                className={`shrink-0 whitespace-nowrap rounded-full border ${isCompactComms ? 'px-2 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[9px]'} ${threadViewMode === mode.id
                                    ? 'border-sky-400/45 bg-[linear-gradient(180deg,rgba(32,71,126,0.24),rgba(12,22,38,0.34))] text-sky-100'
                                    : 'border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.18),rgba(15,23,42,0.08))] text-[var(--color-text-secondary)] hover:border-slate-500/70 hover:text-[var(--color-text-primary)]'
                                  }`}
                              >
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div
                        style={isCompactComms ? hiddenScrollbarStyle : undefined}
                        className={isCompactComms ? 'comms-scroll-hidden -mx-1 overflow-x-auto px-1' : 'flex flex-wrap gap-2'}
                      >
                        <div className="flex min-w-max gap-1">
                            {visibleQueueCards.map((queue) => (
                              <button
                                key={queue.id}
                                onClick={() => setQueueId(queue.id)}
                                disabled={queue.count === 0}
                                className={`shrink-0 whitespace-nowrap rounded-full border ${isCompactComms ? 'px-2 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[9px]'} ${queueId === queue.id ? 'border-sky-400/45 bg-[linear-gradient(180deg,rgba(32,71,126,0.24),rgba(12,22,38,0.34))] text-sky-100 shadow-[inset_0_1px_0_rgba(191,219,254,0.1),0_10px_24px_rgba(37,99,235,0.1)]' : 'border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.18),rgba(15,23,42,0.08))] text-[var(--color-text-secondary)] hover:border-slate-500/70 hover:text-[var(--color-text-primary)]'} ${queue.count === 0 ? 'cursor-not-allowed opacity-40 hover:text-[var(--color-text-secondary)]' : ''}`}
                              >
                                {queue.label} {queue.count || 0}
                              </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={`comms-thread-strip ${isCompactComms ? 'mt-2 gap-1.5 pb-1.5' : 'mt-2.5 gap-2 pb-2'} -mx-1 flex overflow-x-auto px-1`}>
                      {visibleThreads.map((thread) => {
                        const pulse = getThreadPulse(thread);
                        return (
                          <button key={thread.id} onClick={() => setSelectedThreadId(thread.id)} className={`${isCompactComms ? 'min-w-[13.25rem] max-w-[13.25rem]' : 'min-w-[14.5rem] max-w-[14.5rem]'} flex-none rounded-[var(--radius-panel)] border text-left transition shadow-sm ${isCompactComms ? 'p-2' : 'p-2.25'} ${selectedThread?.id === thread.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-[0_0_0_1px_rgba(59,130,246,0.2),0_16px_32px_rgba(37,99,235,0.18)]' : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary)]/30'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{thread.contact ? `${thread.contact.firstName} ${thread.contact.lastName}` : thread.generatedTitle}</div>
                                <div className="truncate text-xs text-[var(--color-text-secondary)]">{thread.company?.name || thread.mailbox?.name}</div>
                              </div>
                              <span className={`${COMMS_PILL_BASE} shrink-0 ${statusTone[thread.status] || 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>{thread.status.replace(/_/g, ' ')}</span>
                            </div>
                            <div className={`${isCompactComms ? 'mt-1.5' : 'mt-2'} line-clamp-1 text-sm text-[var(--color-text-primary)]`}>{thread.subject}</div>
                            <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                              <span className="min-w-0 truncate">{pulse.chips.slice(0, 3)[0]?.label || `${thread.aiPriority} priority`}</span>
                              <span className="shrink-0">{formatRelative(thread.lastActivityAt)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className={`${isCompactComms ? 'mt-2' : 'mt-2.5'} mx-auto flex w-full ${COMMS_READING_WIDTH} flex-wrap items-start justify-between ${isCompactComms ? 'gap-2' : 'gap-2.5'} min-w-0`}>
                      <div className="min-w-0 flex-1">
                        {activeAgentIdentity ? (
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
                            {activeAgentIdentity}
                          </div>
                        ) : null}
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                           <h2 className="min-w-0 break-words text-lg font-semibold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">{selectedThread.subject}</h2>
                          <span className={`${COMMS_PILL_BASE} ${statusTone[selectedThread.status] || 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>{selectedThread.status.replace(/_/g, ' ')}</span>
                          {!clientMode && !isCompactComms ? <div className="relative">
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
                          </div> : null}
                        </div>
                        {!isCompactComms ? (
                          <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">
                            <span>{selectedThread.contact ? `${selectedThread.contact.firstName} ${selectedThread.contact.lastName}` : 'Unlinked contact'}</span>
                            <span>{selectedThread.company?.name || selectedThread.mailbox?.name || 'No company linked'}</span>
                            <span>{formatRelative(selectedThread.lastActivityAt)}</span>
                          </div>
                        ) : null}
                      </div>
                      {!clientMode ? <button onClick={() => handleAiAction('summarize')} className={`${isCompactComms ? 'px-2.5 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'} rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]`}>Refresh Brief</button> : null}
                    </div>
                  </div>

                  <div style={hiddenScrollbarStyle} className={`comms-scroll-hidden flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto ${isCompactComms ? 'px-3 py-3' : 'px-4 py-4'}`}>
                    <div className={`mx-auto flex w-full ${COMMS_READING_WIDTH} flex-col space-y-3`}>
                      {selectedThread.messages.map((message) => (
                        <div key={message.id} className={`max-w-[92%] min-w-0 rounded-[var(--radius-panel)] border px-3 py-2.5 shadow-sm ${message.direction === 'outbound' ? 'ml-auto bg-[var(--color-primary)]/12 border-[var(--color-primary)]/30' : message.direction === 'system' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-[var(--color-bg-primary)] border-[var(--color-border)]'}`}>
                          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-[var(--color-text-secondary)]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[var(--color-text-primary)]">{message.sender_name}</span>
                              {message.direction === 'outbound' && message.deliveryStatus ? (
                                <span className={`${COMMS_PILL_BASE} ${message.deliveryStatus === 'sent' ? pulseTone.success : pulseTone.warning}`}>{message.deliveryStatus}</span>
                              ) : null}
                            </div>
                            <span>{formatRelative(message.createdAt)}</span>
                          </div>
                          <div className="text-sm leading-5 text-[var(--color-text-primary)] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {normalizeAiText(message.plain_text, message.body || '')}
                          </div>
                          {message.recipients?.length ? (
                            <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)] break-words [overflow-wrap:anywhere]">Recipients: {message.recipients.join(', ')}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] ${isCompactComms ? 'p-2' : 'px-3 py-2.5'}`}>
                    <div className={`mx-auto flex w-full ${COMMS_READING_WIDTH} flex-col space-y-2`}>
                      <div className="mx-auto flex w-full flex-wrap items-center gap-1.5">
                        {compactPulseItems.map((item) => (
                          <div key={item.key} className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] shadow-sm ${item.tone}`}>
                            <span className="shrink-0 uppercase tracking-[0.18em] opacity-80 font-black">{item.label}</span>
                            <span className="truncate font-semibold text-[var(--color-text-primary)]">{item.value}</span>
                          </div>
                        ))}
                        {!clientMode ? (
                          <button
                            onClick={handleMoveThreadToMailbox}
                            disabled={!activeMailbox?.id || activeMailbox.id === selectedThread.mailboxId}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[10px] text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)] disabled:opacity-50"
                          >
                            <span className="uppercase tracking-[0.18em] font-black text-[var(--color-text-tertiary)]">Mailbox</span>
                            <span className="font-semibold text-[var(--color-text-primary)]">Move</span>
                          </button>
                        ) : null}
                        {busyLabel ? (
                          <div className="ml-auto text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{busyLabel}...</div>
                        ) : null}
                      </div>
                      <div className="flex items-stretch gap-2.5">
                        <textarea value={composer} onChange={(event) => setComposer(event.target.value)} rows={3} placeholder="Draft the next move, log an internal note, or send a precise follow-up..." className="min-h-[4.75rem] flex-1 rounded-[var(--radius-panel)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] shadow-[inset_0_1px_0_rgba(148,163,184,0.05)] focus:outline-none focus:border-[var(--color-primary)]" />
                        <div className="flex items-center gap-2.5 self-stretch">
                          <button onClick={handleSend} disabled={!composer.trim()} className="flex h-10 items-center gap-2 self-center rounded-xl bg-[var(--color-primary)] px-4.5 text-sm font-semibold text-[var(--color-text-on-primary)] shadow-sm hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
                            <Send size={14} />
                            Send
                          </button>
                          <div className="flex min-w-[5.75rem] flex-col justify-start gap-1.5 pt-0.5">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Send via</div>
                            {CHANNEL_FILTERS.filter((item) => item.id !== 'all').map((item) => {
                              const Icon = item.icon;
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => setComposerChannel(item.id)}
                                  className={`${COMMS_COMPOSE_OPTION} ${composerChannel === item.id
                                      ? 'border-sky-400/45 bg-[linear-gradient(180deg,rgba(32,71,126,0.24),rgba(12,22,38,0.34))] text-sky-100 shadow-[inset_0_1px_0_rgba(191,219,254,0.1),0_10px_24px_rgba(37,99,235,0.12)]'
                                      : 'border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.22),rgba(15,23,42,0.1))] text-[var(--color-text-secondary)] hover:border-slate-500/70 hover:text-[var(--color-text-primary)]'
                                    }`}
                                >
                                  <Icon size={12} />
                                  {COMPOSER_CHANNEL_LABELS[item.id] || item.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <EmptyState
                    title={search ? "No matches found" : "Inbox is Silent"}
                    description={search
                      ? "We couldn't find any threads matching your search criteria across your active mailboxes."
                      : "Your communication queues are clear. Start a new thread or wait for incoming signals."}
                    actions={[
                      { label: 'Start New Thread', type: 'navigate', payload: { route: '/comms' }, icon: 'Plus' },
                      ...(!clientMode ? [{ label: 'Manage Mailboxes', type: 'navigate', payload: { route: '/comms' }, icon: 'Play' }] : [])
                    ]}
                  />
                </div>
              )}
            </main>

            {showOperatorDiagnostics && isWideDesktopComms ? (
              <div
                onMouseDown={() => setActiveResizeSide('right')}
                className={`hidden 2xl:block col-start-4 row-start-1 cursor-col-resize bg-transparent transition ${activeResizeSide === 'right' ? 'bg-[var(--color-primary)]/30' : 'hover:bg-[var(--color-primary)]/15'}`}
              />
            ) : null}

            {!clientMode ? <aside className={`min-w-0 flex flex-col min-h-0 overflow-hidden ${COMMS_COLUMN_BG} ${isThreeColumnComms ? 'col-start-5 row-start-1 border-t-0' : isDesktopComms ? 'col-[1/4] row-start-2 border-t' : 'border-t'} border-[var(--color-border)]`}>
              {selectedThread ? (
                <div className="flex h-full min-h-0">
                  <div className="min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="shrink-0 border-b border-[var(--color-border)] px-3 pb-3 pt-3">
                      <section className={`${COMMS_PANEL} overflow-hidden border-emerald-500/20 bg-[#05110a] shadow-[inset_0_1px_0_rgba(34,197,94,0.06)]`}>
                        <div className="flex items-center justify-between border-b border-emerald-500/15 px-3 py-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.24em] text-emerald-300">Agent Activity Log</span>
                          <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-500/70">Live</span>
                        </div>
                        <div className="space-y-1 px-3 py-2.5 font-mono text-[11px] leading-4 text-emerald-300/85">
                          {agentActivityLog.length ? agentActivityLog.map((entry) => (
                            <div key={entry.id} className="border-b border-emerald-500/10 pb-1 last:border-b-0 last:pb-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-emerald-200">{entry.prefix} // {entry.agent}</span>
                                <span className="shrink-0 text-[10px] text-emerald-500/70">{formatRelative(entry.stamp)}</span>
                              </div>
                              <div className="mt-0.5 text-emerald-400/70">{entry.detail}</div>
                            </div>
                          )) : (
                            <div className="text-emerald-400/70">&gt; Awaiting routed agent activity...</div>
                          )}
                        </div>
                      </section>
                    </div>

                    <div style={hiddenScrollbarStyle} className={`comms-scroll-hidden flex-1 min-w-0 overflow-x-hidden overflow-y-auto ${isCompactComms ? 'p-3 pt-2 space-y-3' : 'p-3.5 pt-2.5 space-y-3.5'}`}>
                    <section className={`min-w-0 ${COMMS_PANEL} ${isCompactComms ? 'p-3' : 'p-3.5'} ${isCompactComms ? 'max-h-[20rem] overflow-hidden' : ''}`}>
                    <div style={isCompactComms ? hiddenScrollbarStyle : undefined} className={`${isCompactComms ? 'comms-scroll-hidden h-full overflow-y-auto pr-1' : 'space-y-3'}`}>
                      <div className={isCompactComms ? 'space-y-[0.625rem]' : 'space-y-3'}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Bot size={16} /> AI Brief</div>
                          <span className="text-xs text-[var(--color-text-secondary)]">{selectedThread.aiPriority} priority</span>
                        </div>
                        <div className={`${COMMS_SUBPANEL} ${isCompactComms ? 'p-[0.6875rem]' : 'p-3'}`}>
                          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-2">What Matters</div>
                          <div className={`${isCompactComms ? 'line-clamp-4' : 'line-clamp-4'} text-sm text-[var(--color-text-primary)] break-words [overflow-wrap:anywhere]`}>{briefSummary}</div>
                        </div>
                        <div className={`${COMMS_SUBPANEL} ${isCompactComms ? 'p-[0.6875rem]' : 'p-3'}`}>
                          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-2">Recommended Next Step</div>
                          <div className="text-sm text-[var(--color-text-primary)] break-words [overflow-wrap:anywhere]">{briefNextStep}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {threadFlags.slice(0, 3).map((flag) => (
                            <span key={flag} className={`max-w-full truncate ${COMMS_PILL_BASE} normal-case tracking-normal border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]`}>{flag}</span>
                          ))}
                        </div>
                        {(selectedThread.brief?.reasoningCues || []).length ? (
                          <div className="space-y-2">
                            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">AI Cues</div>
                            {(selectedThread.brief?.reasoningCues || []).slice(0, 2).map((cue) => (
                              <div key={cue} className={`${COMMS_SUBPANEL} ${isCompactComms ? 'px-[0.6875rem] py-1.5' : 'px-3 py-2'} text-sm text-[var(--color-text-secondary)] line-clamp-2`}>{cue}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>

                  <section className={`min-w-0 ${COMMS_PANEL} p-3.5 space-y-2.5`}>
                    <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><User size={16} /> Relationship Context</div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className={`${COMMS_INLINE_STAT} max-w-full`}>
                        <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Contact</span>
                        <span className="truncate text-[var(--color-text-primary)]">{selectedThread.contact ? `${selectedThread.contact.firstName} ${selectedThread.contact.lastName}` : 'Unlinked'}</span>
                      </span>
                      <span className={`${COMMS_INLINE_STAT} max-w-full`}>
                        <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Email</span>
                        <span className="truncate text-[var(--color-text-primary)]">{selectedThread.contact?.email || 'No email linked'}</span>
                      </span>
                      <span className={COMMS_INLINE_STAT}>
                        <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Company</span>
                        <span className="text-[var(--color-text-primary)]">{selectedThread.company?.name || 'Unlinked'}</span>
                      </span>
                      <span className={COMMS_INLINE_STAT}>
                        <CalendarDays size={12} />
                        <span>Last {formatRelative(selectedThread.lastActivityAt)}</span>
                      </span>
                      <span className={COMMS_INLINE_STAT}>
                        <Building2 size={12} />
                        <span>Channel {selectedThread.channelType}</span>
                      </span>
                      <span className={COMMS_INLINE_STAT}>
                        <Mail size={12} />
                        <span>{selectedThread.mailbox?.status || 'unknown'} via {selectedThread.mailbox?.provider || 'unknown'}</span>
                      </span>
                    </div>
                  </section>

                  <section className={`${COMMS_PANEL} p-3.5 space-y-2.5`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Building2 size={16} /> CRM Linkage</div>
                      <span className="text-xs text-[var(--color-text-secondary)]">{selectedThread.contact?.pipelineStage || 'No stage'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className={COMMS_INLINE_STAT}>
                        <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Stage</span>
                        <span className="text-[var(--color-text-primary)]">{selectedThread.contact?.pipelineStage || 'Unlinked'}</span>
                      </span>
                      <span className={`${COMMS_INLINE_STAT} max-w-full`}>
                        <span className="uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Deal</span>
                        <span className="truncate text-[var(--color-text-primary)]">{selectedDealLink?.label || 'No deal yet'}</span>
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2">
                      <button onClick={handleCreateDeal} disabled={!selectedThread.contactId || Boolean(selectedDealLink)} className={`px-3 py-2.5 ${COMMS_ACTION_TILE}`}>Create Deal</button>
                      <button onClick={handleAdvanceStage} disabled={!selectedThread.contactId} className={`px-3 py-2.5 ${COMMS_ACTION_TILE}`}>Advance Stage</button>
                      <button onClick={handleScheduleMeeting} className={`px-3 py-2.5 ${COMMS_ACTION_TILE}`}>Schedule Meeting</button>
                    </div>
                  </section>

                  <section className={`${COMMS_PANEL} p-3.5 space-y-2.5`}>
                    <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Workflow size={16} /> Tracks</div>
                    <div className="space-y-2">
                      {threadCalendarEvents.map((event) => (
                        <div key={event.id} className={`min-w-0 ${COMMS_SUBPANEL} px-3 py-3`}>
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
                            <div className={`${COMMS_SUBPANEL} mt-2 px-3 py-2 text-xs text-[var(--color-text-secondary)]`}>
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
                        <div key={action.id || `${action.action_type}-${action.label}`} className={`min-w-0 ${COMMS_SUBPANEL} px-3 py-3`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 text-sm font-medium text-[var(--color-text-primary)] break-words [overflow-wrap:anywhere]">{action.label}</div>
                            <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">{action.source || 'system'}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">
                            <span>{action.status || 'completed'}</span>
                            <span>{formatRelative(action.createdAt || selectedThread.updatedAt)}</span>
                          </div>
                        </div>
                      ))}
                      {threadCalendarEvents.length === 0 && completedThreadActions.length === 0 ? (
                        <div className={`${COMMS_SUBPANEL} px-3 py-3 text-sm text-[var(--color-text-secondary)]`}>
                          No tracks yet. AI, workflow, calendar, and automation actions will appear here as this thread changes state.
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className={`${COMMS_PANEL} p-3.5 space-y-2.5`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><FileText size={16} /> Reports</div>
                      <span className="text-xs text-[var(--color-text-secondary)]">{reportArtifacts.length}</span>
                    </div>
                    <div className="space-y-2">
                      {reportArtifacts.length ? reportArtifacts.map((artifact) => (
                        <div key={artifact.id} className={`min-w-0 ${COMMS_SUBPANEL} px-3 py-2.5`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 text-sm font-medium text-[var(--color-text-primary)] break-words [overflow-wrap:anywhere]">{artifact.title}</div>
                            <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">{artifact.kind}</span>
                          </div>
                          <div className="mt-1.5 text-sm text-[var(--color-text-secondary)] line-clamp-2">{artifact.body}</div>
                          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">
                            <span>{artifact.created_by || 'AIO Flow'}</span>
                            <span>{formatRelative(artifact.createdAt || artifact.updatedAt || selectedThread.updatedAt)}</span>
                          </div>
                        </div>
                      )) : (
                        <div className={`${COMMS_SUBPANEL} px-3 py-3 text-sm text-[var(--color-text-secondary)]`}>
                          Operator and executive reports will appear here as standalone thread artifacts.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className={`${COMMS_PANEL} p-3.5 space-y-2.5`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold"><Settings2 size={16} /> Thread Lifecycle</div>
                      <span className="text-xs text-[var(--color-text-secondary)]">{selectedThread.status.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <button onClick={handleArchiveThread} disabled={selectedThread.status === 'archived'} className={`px-3 py-2.5 ${COMMS_ACTION_TILE}`}>Archive</button>
                      <button onClick={() => runAction('Closing', async () => { await updateThreadStatusApi(selectedThread.id, 'closed'); })} disabled={selectedThread.status === 'closed'} className={`px-3 py-2.5 ${COMMS_ACTION_TILE}`}>Close</button>
                      <button onClick={handleDeleteThread} className="px-3 py-3 rounded-[var(--radius-panel)] border border-red-500/30 text-left text-sm text-red-200 hover:border-red-400/50">Delete CRM</button>
                    </div>
                    <div className={`${COMMS_SUBPANEL} px-3 py-3 text-sm text-[var(--color-text-secondary)]`}>
                      Archive removes a thread from active queues. Delete CRM removes only the Comms record, not the source mailbox message.
                    </div>
                  </section>

                  {isMailboxComposerOpen ? (
                    <section className="rounded-[1.5rem] border border-[var(--color-primary)]/30 bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(15,23,42,0.22))] p-4 space-y-3 shadow-[0_18px_36px_rgba(2,6,23,0.22)]">
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
                          <input value={mailboxDraft.name} onChange={(event) => setMailboxDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Executive Desk" className="w-full rounded-[var(--radius-panel)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                        </label>
                        <label className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Mailbox Address</div>
                          <input value={mailboxDraft.address} onChange={(event) => setMailboxDraft((current) => ({ ...current, address: event.target.value }))} placeholder="exec@aiocrm.local" className="w-full rounded-[var(--radius-panel)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                        </label>
                        <label className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Provider</div>
                          <select value={mailboxDraft.provider} onChange={(event) => setMailboxDraft((current) => ({ ...current, provider: event.target.value, config: {} }))} className="w-full rounded-[var(--radius-panel)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]">
                            {mailboxProviders.map((provider) => (
                              <option key={provider.id} value={provider.id}>{provider.label}</option>
                            ))}
                          </select>
                        </label>
                        <div className={`${COMMS_SUBPANEL} px-3 py-3 text-sm text-[var(--color-text-secondary)]`}>
                          {mailboxDraft.provider
                            ? 'External providers start in a setup state until the stored configuration is tested.'
                            : 'Load a provider catalog from the backend before creating a mailbox here.'}
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
                                className={`w-full ${COMMS_SUBPANEL} px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]`}
                              />
                            </label>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-3 text-sm text-[var(--color-text-secondary)]">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={mailboxDraft.inboundEnabled} onChange={(event) => setMailboxDraft((current) => ({ ...current, inboundEnabled: event.target.checked }))} />
                          Inbound enabled
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={mailboxDraft.outboundEnabled} onChange={(event) => setMailboxDraft((current) => ({ ...current, outboundEnabled: event.target.checked }))} />
                          Outbound enabled
                        </label>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-[var(--color-text-tertiary)]">Create first, then use the existing mailbox panel to run a connection test and sync check.</div>
                        <button onClick={handleSubmitMailboxDraft} disabled={!mailboxDraft.name.trim() || !mailboxDraft.address.trim() || !mailboxDraft.provider} className="btn-primary-skeuo px-4 py-2 rounded-[var(--radius-panel)] disabled:opacity-50 text-sm font-medium">Create Mailbox</button>
                      </div>
                    </section>
                  ) : null}

                    </div>
                  </div>
                  <div className="w-16 flex-none flex flex-col bg-transparent p-0 relative overflow-hidden border-l border-[var(--color-border)]">
                    <div className="py-2 flex items-center justify-center shrink-0">
                      <span className="text-[7.5px] uppercase tracking-[0.4em] text-slate-700 font-bold">AGENTS</span>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar pt-0.5">
                      <div className="flex flex-col gap-0">
                        {agentRailAgents.map((agentName) => {
                          const isSelectedAgent = selectedThread.assignee === agentName;
                          let c;
                          if (agentName === 'ALPHA') {
                            c = HQ_AGENT_STYLE;
                          } else {
                            const regularKeys = VISIBLE_SPECIALIST_KEYS.filter((key) => key !== 'ALPHA' && key !== 'OMEGA');
                            const idx = regularKeys.indexOf(agentName);
                            const row = Math.floor(idx / 4);
                            const col = idx % 4;
                            const lane = ROW_COLOR_LANES[row] || ROW_COLOR_LANES[0];
                            c = lane[col % lane.length] || lane[0];
                          }
                          const agentId = SPECIALIST_REGISTRY[agentName]?.agentId || '';
                          return (
                            <button
                              key={agentName}
                              onClick={() => handleAssignThread(agentName)}
                              title={agentName}
                              className={`flex flex-col items-center justify-center px-0.5 py-1 cursor-pointer transition-all duration-300 group outline-none rounded-[var(--radius-card)] ${isSelectedAgent ? 'bg-white/5' : 'hover:bg-white/5'}`}
                            >
                              <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 transform-gpu
                                ${isSelectedAgent
                                  ? `${c.bg.replace('950/50', '600/95').replace('950/45', '600/95').replace('900/50', '500/95').replace('900/45', '500/95').replace('800/45', '400/95').replace('500/10', '500/80')} ${c.border.replace('600/40', '400/95').replace('500/40', '400/95').replace('400/40', '300/95')} text-white shadow-[0_0_20px_${c.shadow.replace('0.2', '0.5')}] scale-110 ring-1 ring-white/20`
                                  : `opacity-60 group-hover:opacity-100 ${c.bg} ${c.border} ${c.icon || c.text} shadow-[0_0_8px_${c.shadow}] group-hover:shadow-[0_0_15px_${c.shadow.replace('0.2', '0.4')}] group-hover:scale-105`
                                } text-[9px] font-black tracking-tighter shrink-0`}>
                                {agentName.substring(0, 2).toUpperCase()}
                              </div>
                              <span className={`mt-0.5 text-[6px] leading-none uppercase tracking-[0.14em] ${isSelectedAgent ? 'text-white' : 'text-slate-600 group-hover:text-slate-300'}`}>
                                {agentName}
                              </span>
                              {agentId && (
                                <span className={`mt-0 text-[5px] leading-none font-mono tracking-wider ${isSelectedAgent ? 'text-slate-400' : 'text-slate-700 group-hover:text-slate-500'}`}>
                                  {agentId}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <EmptyState
                    title="Context Awaiting"
                    description="Select a relationship dossier from the inbox to inspect the full AI brief, tracks, and CRM linkage."
                    actions={[
                      { label: 'How Comms Works', type: 'navigate', payload: { route: '/help' }, icon: 'Target' }
                    ]}
                  />
                </div>
              )}
            </aside> : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommsModule;


