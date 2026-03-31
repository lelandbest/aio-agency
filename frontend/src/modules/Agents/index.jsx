import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Edit2, Trash2, Plus, Settings, MessageSquare, Bot, Target, Users, ArrowRight, Terminal, Layers, Cpu, ShieldCheck, Workflow, Activity, Radiation, Lock } from 'lucide-react';
import { getAiAgentsApi, getAiRunApi, getAiRunsApi, runAiCommandApi } from '../../services/backendApi';
import ModuleHeader from '../../components/ModuleHeader';
import { SPECIALIST_REGISTRY, ROW_COLOR_LANES, HQ_AGENT_STYLE, OMEGA_AGENT_STYLE } from './data/agentRegistry';



const AGENT_CHAT_STORAGE_KEY = 'aio-agents-chat-session';
const AGENT_SELECTED_FLOW_STORAGE_KEY = 'aio-agents-selected-flow';
const CONTENT_LINK_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+|file:\/\/\/[^\s]+|[A-Za-z]:\\[^\s]+)/g;

const RESPONSE_TEXT_KEYS = ['message', 'suggestion', 'summary', 'text', 'content', 'result', 'output', 'answer'];

const formatResponseKey = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const indentLines = (value) =>
  String(value || '')
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

const formatStructuredResponse = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatStructuredResponse(item))
      .filter(Boolean);
    return items
      .map((item) => (item.includes('\n') ? `- ${item.replace(/\n/g, '\n  ')}` : `- ${item}`))
      .join('\n');
  }
  if (typeof value === 'object') {
    for (const key of RESPONSE_TEXT_KEYS) {
      const preferred = value[key];
      if (typeof preferred === 'string' && preferred.trim()) {
        return preferred.trim();
      }
    }
    return Object.entries(value)
      .map(([key, entryValue]) => {
        const formatted = formatStructuredResponse(entryValue);
        if (!formatted) {
          return '';
        }
        return formatted.includes('\n')
          ? `${formatResponseKey(key)}:\n${indentLines(formatted)}`
          : `${formatResponseKey(key)}: ${formatted}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
};

const normalizeAgentResponse = (response) => {
  const candidates = [
    response?.message,
    response?.suggestion,
    response?.result,
    response?.alternatives,
    response?.metadata,
  ];

  for (const candidate of candidates) {
    const formatted = formatStructuredResponse(candidate);
    if (formatted) {
      return formatted;
    }
  }

  return 'No agent output returned.';
};

const normalizeRunResponse = (run) => {
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const lastSuccess = [...steps].reverse().find((step) => step?.status === 'success' && step?.data);
  const candidates = [
    lastSuccess?.data,
    run?.result,
    steps,
  ];

  for (const candidate of candidates) {
    const formatted = formatStructuredResponse(candidate);
    if (formatted) {
      return formatted;
    }
  }

  return 'No agent output returned.';
};

const extractRunError = (run) => {
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const lastError = [...steps].reverse().find((step) => step?.status === 'error');
  if (lastError?.error) {
    return String(lastError.error);
  }
  if ((run?.status || '').toLowerCase() === 'failed') {
    return String(run?.result || 'Run failed.');
  }
  return null;
};

const hydrateActiveRun = (run) => {
  if (!run) {
    return null;
  }
  return {
    ...run,
    output: normalizeRunResponse(run),
    error: extractRunError(run),
  };
};

const formatRunStatus = (value) =>
  String(value || 'pending')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toUpperCase();

const formatRunTimestamp = (value) => {
  if (!value) {
    return 'PENDING';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'PENDING';
  }
  return parsed.toLocaleTimeString([], { hour12: false });
};

const normalizeDelegateChain = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(' -> ');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

const looksLikeJson = (value) => {
  const text = String(value || '').trim();
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) {
    return false;
  }
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

const looksLikeMarkdown = (value) =>
  /(^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|\|.+\|)/m.test(String(value || ''));

const normalizeLinkHref = (value) => {
  const text = String(value || '');
  if (/^https?:\/\//i.test(text) || /^file:\/\/\//i.test(text)) {
    return text;
  }
  if (/^www\./i.test(text)) {
    return `https://${text}`;
  }
  if (/^[A-Za-z]:\\/.test(text)) {
    return `file:///${text.replace(/\\/g, '/')}`;
  }
  return text;
};

const extractLinkTargets = (value) => {
  const matches = String(value || '').match(CONTENT_LINK_PATTERN) || [];
  return [...new Set(matches)];
};

const copyTextToClipboard = async (value) => {
  const text = String(value || '');
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const triggerTextDownload = (filename, content, mimeType) => {
  const blob = new Blob([String(content || '')], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
};

const renderLinkedContent = (value) => {
  const text = String(value || '');
  const lines = text.split('\n');
  return lines.map((line, lineIndex) => {
    const segments = line.split(CONTENT_LINK_PATTERN);
    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {segments.map((segment, segmentIndex) => {
          if (!segment) {
            return null;
          }
          if (/^(https?:\/\/|www\.|file:\/\/\/|[A-Za-z]:\\)/.test(segment)) {
            return (
              <a
                key={`segment-${lineIndex}-${segmentIndex}`}
                href={normalizeLinkHref(segment)}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[var(--color-primary)]/50 underline-offset-2 hover:text-[var(--color-primary)]"
              >
                {segment}
              </a>
            );
          }
          return <React.Fragment key={`segment-${lineIndex}-${segmentIndex}`}>{segment}</React.Fragment>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </React.Fragment>
    );
  });
};

const renderInlineLinkedText = (value, keyPrefix = 'inline') => {
  const text = String(value || '');
  return text.split(CONTENT_LINK_PATTERN).map((segment, segmentIndex) => {
    if (!segment) {
      return null;
    }
    if (/^(https?:\/\/|www\.|file:\/\/\/|[A-Za-z]:\\)/.test(segment)) {
      return (
        <a
          key={`${keyPrefix}-${segmentIndex}`}
          href={normalizeLinkHref(segment)}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[var(--color-primary)]/50 underline-offset-2 hover:text-[var(--color-primary)]"
        >
          {segment}
        </a>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${segmentIndex}`}>{segment}</React.Fragment>;
  });
};

const renderMarkdownContent = (value) => {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) {
    return null;
  }

  const lines = text.split('\n');
  const elements = [];
  let index = 0;
  let blockKey = 0;

  const pushParagraph = (paragraphLines) => {
    if (!paragraphLines.length) {
      return;
    }
    elements.push(
      <p key={`paragraph-${blockKey++}`} className="whitespace-pre-wrap break-words leading-7">
        {paragraphLines.map((line, lineIndex) => (
          <React.Fragment key={`paragraph-line-${blockKey}-${lineIndex}`}>
            {renderInlineLinkedText(line, `paragraph-${blockKey}-${lineIndex}`)}
            {lineIndex < paragraphLines.length - 1 ? <br /> : null}
          </React.Fragment>
        ))}
      </p>
    );
  };

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fencedCodeMatch = line.match(/^```(\w+)?\s*$/);
    if (fencedCodeMatch) {
      const language = fencedCodeMatch[1] || '';
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      elements.push(
        <div key={`code-${blockKey++}`} className="overflow-hidden rounded-[var(--radius-card)] border border-white/10 bg-black/50">
          {language ? (
            <div className="border-b border-white/10 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.24em] text-gray-500">
              {language}
            </div>
          ) : null}
          <pre className="overflow-x-auto px-4 py-4 text-[12px] leading-6 text-gray-200">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const headingClasses = [
        'text-xl font-black tracking-tight',
        'text-lg font-black tracking-tight',
        'text-base font-bold tracking-tight',
        'text-sm font-bold uppercase tracking-[0.16em]',
        'text-xs font-bold uppercase tracking-[0.18em]',
        'text-xs font-semibold uppercase tracking-[0.2em]',
      ];
      elements.push(
        <div
          key={`heading-${blockKey++}`}
          className={`${headingClasses[Math.min(level, headingClasses.length) - 1]} text-[var(--color-text-primary)]`}
        >
          {renderInlineLinkedText(headingText, `heading-${blockKey}`)}
        </div>
      );
      index += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
        index += 1;
      }
      elements.push(
        <ul key={`ul-${blockKey++}`} className="list-disc space-y-2 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${blockKey}-${itemIndex}`} className="break-words leading-7">
              {renderInlineLinkedText(item, `ul-item-${blockKey}-${itemIndex}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
        index += 1;
      }
      elements.push(
        <ol key={`ol-${blockKey++}`} className="list-decimal space-y-2 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${blockKey}-${itemIndex}`} className="break-words leading-7">
              {renderInlineLinkedText(item, `ol-item-${blockKey}-${itemIndex}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^```/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    pushParagraph(paragraphLines);
  }

  return <div className="space-y-4">{elements}</div>;
};

const buildAssistantMessageFromRun = (run, overrides = {}) => ({
  role: 'assistant',
  runId: run?.id,
  content: run?.output || '',
  timestamp: formatRunTimestamp(run?.updated_at || run?.created_at),
  rank: run?.executing_agent || run?.agent_role || 'AI',
  chain: normalizeDelegateChain(run?.delegate_chain),
  status: formatRunStatus(run?.status),
  error: run?.error || null,
  pending: false,
  ...overrides,
});

// 8. AIO AGENTS MODULE
const AIOAgentsModule = () => {
  const [activeAgent, setActiveAgent] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your configured agent. How can I help-' }
  ]);
  const [agents, setAgents] = useState([]);
  const [view, setView] = useState('barracks'); // 'barracks' (list) or 'command' (detail)
  const [activeRun, setActiveRun] = useState(null);
  const [aiRuns, setAiRuns] = useState([]);
  const [aiRunsError, setAiRunsError] = useState('');
  const [pollingRunId, setPollingRunId] = useState(null);
  const runPollIntervalRef = useRef(null);
  const chatFeedRef = useRef(null);

  const stopRunPolling = useCallback(() => {
    if (runPollIntervalRef.current) {
      clearInterval(runPollIntervalRef.current);
      runPollIntervalRef.current = null;
    }
    setPollingRunId(null);
  }, []);

  const startRunPolling = useCallback((runId) => {
    stopRunPolling();
    setPollingRunId(runId);
    runPollIntervalRef.current = setInterval(async () => {
      try {
        const run = hydrateActiveRun(await getAiRunApi(runId));
        setActiveRun(run);
        const status = (run?.status || '').toLowerCase();
        if (['completed', 'failed', 'success'].includes(status)) {
          stopRunPolling();
        }
      } catch {
        stopRunPolling();
      }
    }, 1500);
  }, [stopRunPolling]);

  const localFileInputRef = useRef(null);
  const [copiedToken, setCopiedToken] = useState('');
  const [localAttachments, setLocalAttachments] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectionMode, setSelectionMode] = useState('talk');
  const [collabAgents, setCollabAgents] = useState([]);

  const normalizeAgentRecord = (agent = {}) => ({
    ...agent,
    registryKey: agent.registryKey || agent.registry_key || agent.name || '',
    registry_key: agent.registry_key || agent.registryKey || agent.name || '',
    name: agent.name || agent.registry_key || agent.registryKey || '',
  });

  useEffect(() => {
    getAiAgentsApi()
      .then((data) => setAgents(Array.isArray(data) ? data.map(normalizeAgentRecord) : []))
      .catch(() => setAgents([]));
    getAiRunsApi(12)
      .then((data) => setAiRuns(Array.isArray(data) ? data : []))
      .catch((error) => setAiRunsError(error.message || 'Unable to load AI activity.'));
  }, []);

  useEffect(() => {
    return () => {
      if (runPollIntervalRef.current) {
        clearInterval(runPollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      const storedMessages = localStorage.getItem(AGENT_CHAT_STORAGE_KEY);
      if (!storedMessages) return;
      const parsed = JSON.parse(storedMessages);
      if (Array.isArray(parsed)) {
        setMessages(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const storedFlow = localStorage.getItem(AGENT_SELECTED_FLOW_STORAGE_KEY);
      if (!storedFlow) return;
      const parsed = JSON.parse(storedFlow);
      if (parsed?.id) {
        setSelectedFlow(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!chatFeedRef.current) return;
    chatFeedRef.current.scrollTo({
      top: chatFeedRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, activeRun]);

  useEffect(() => {
    try {
      localStorage.setItem(AGENT_CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    if (!copiedToken) return;
    const timer = window.setTimeout(() => setCopiedToken(''), 1400);
    return () => window.clearTimeout(timer);
  }, [copiedToken]);

  useEffect(() => {
    const handleFlowSelected = (event) => {
      const detail = event.detail || {};
      const nextFlow = detail?.flow?.id
        ? {
            id: detail.flow.id,
            name: detail.flow.name || 'Untitled Flow',
            status: detail.flow.status || 'Draft',
          }
        : detail?.flowId
          ? {
              id: detail.flowId,
              name: detail.flowName || 'Untitled Flow',
              status: detail.flowStatus || 'Draft',
            }
          : null;
      if (!nextFlow) return;
      setSelectedFlow(nextFlow);
      try {
        localStorage.setItem(AGENT_SELECTED_FLOW_STORAGE_KEY, JSON.stringify(nextFlow));
      } catch {}
    };
    window.addEventListener('aio:flow-selected', handleFlowSelected);
    return () => window.removeEventListener('aio:flow-selected', handleFlowSelected);
  }, []);

  const resolveMessageRun = (message) => {
    if (message?.role !== 'assistant' || !message?.runId) {
      return null;
    }
    if (activeRun?.id === message.runId) {
      return activeRun;
    }
    const matchedRun = aiRuns.find((run) => run?.id === message.runId);
    return matchedRun ? hydrateActiveRun(matchedRun) : null;
  };

  const resolveMessageContent = (message) => {
    if (message?.role !== 'assistant') {
      return message?.content || '';
    }
    const matchedRun = resolveMessageRun(message);
    if (matchedRun) {
      return matchedRun.output || '';
    }
    if (message?.pending) {
      return 'Awaiting canonical run...';
    }
    return message?.content || '';
  };

  const handleCopyMessage = async (message, token) => {
    await copyTextToClipboard(resolveMessageContent(message));
    setCopiedToken(token);
  };

  const handleCopyAll = async () => {
    const transcript = messages
      .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${resolveMessageContent(message)}`)
      .join('\n\n');
    await copyTextToClipboard(transcript);
    setCopiedToken('copy-all');
  };

  const handleDownloadMessage = (message, extension) => {
    const matchedRun = resolveMessageRun(message);
    const content = resolveMessageContent(message);
    const baseName = matchedRun?.id ? `ai-run-${matchedRun.id}` : 'ai-chat-export';
    if (extension === 'json') {
      const jsonContent = matchedRun ? JSON.stringify(matchedRun, null, 2) : content;
      triggerTextDownload(`${baseName}.json`, jsonContent, 'application/json;charset=utf-8');
      return;
    }
    if (extension === 'md') {
      triggerTextDownload(`${baseName}.md`, content, 'text/markdown;charset=utf-8');
      return;
    }
    triggerTextDownload(`${baseName}.txt`, content, 'text/plain;charset=utf-8');
  };

  const handleClearChat = () => {
    setMessages([]);
    setActiveRun(null);
    setChatInput('');
    setLocalAttachments([]);
    try {
      localStorage.removeItem(AGENT_CHAT_STORAGE_KEY);
    } catch {}
  };

  const clearSelectedFlow = () => {
    setSelectedFlow(null);
    try {
      localStorage.removeItem(AGENT_SELECTED_FLOW_STORAGE_KEY);
    } catch {}
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const attachmentPrefix = localAttachments.length ? `[Local attachments: ${localAttachments.join(', ')}]\n` : '';
    const nextMessage = `${attachmentPrefix}${chatInput.trim()}`;
    const pendingMessageId = `pending-${Date.now()}`;
    setActiveRun(null);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: nextMessage, timestamp: 'Now' },
      {
        clientId: pendingMessageId,
        role: 'assistant',
        content: 'Awaiting canonical run...',
        timestamp: 'PENDING',
        rank: 'SYSTEM',
        chain: '',
        status: 'PENDING',
        error: null,
        pending: true,
      }
    ]);
    setChatInput('');
    setLocalAttachments([]);
    try {
      const response = await runAiCommandApi({
        command: nextMessage,
        ...(selectedAgent ? { agent: selectedAgent } : {}),
        ...(collabAgents.length ? { collabAgents } : {}),
        ...(selectedFlow ? { flow_id: selectedFlow.id } : {}),
        context: {
          module: 'agents',
          surface: 'command',
          requested_agent: selectedAgent || '',
          active_agent: selectedAgent || activeRun?.executing_agent || activeRun?.agent_role || '',
          collab_agents: collabAgents,
          flow_id: selectedFlow?.id || null,
          flow_name: selectedFlow?.name || null,
        }
      });
      const runId = response?.run_id || response?.run?.id || '';
      if (runId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.clientId === pendingMessageId
              ? { ...msg, runId, pending: true }
              : msg
          )
        );
        try {
          const run = hydrateActiveRun(await getAiRunApi(runId));
          setActiveRun(run);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.clientId === pendingMessageId
                ? buildAssistantMessageFromRun(run, { clientId: pendingMessageId })
                : msg
            )
          );
          const status = (run?.status || '').toLowerCase();
          if (!['completed', 'failed', 'success'].includes(status)) {
            startRunPolling(runId);
          }
        } catch (error) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.clientId === pendingMessageId
                ? {
                    ...msg,
                    content: 'Run failed to load. Please retry.',
                    timestamp: 'Now',
                    rank: 'SYSTEM',
                    chain: '',
                    status: 'ERROR',
                    error: error.message || 'Run failed to load. Please retry.',
                    pending: false,
                    runId: undefined,
                  }
                : msg
            )
          );
        }
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.clientId === pendingMessageId
                ? {
                    ...msg,
                    content: 'Canonical run was not returned. Please retry.',
                    timestamp: 'Now',
                    rank: 'SYSTEM',
                    chain: '',
                    status: 'ERROR',
                    error: 'Canonical run was not returned. Please retry.',
                    pending: false,
                  }
                : msg
          )
        );
      }
      const latestRuns = await getAiRunsApi(12);
      setAiRuns(Array.isArray(latestRuns) ? latestRuns : []);
      if (selectedFlow) {
        clearSelectedFlow();
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.clientId === pendingMessageId
            ? {
                ...msg,
                content: error.message || 'Unable to run the selected agent command.',
                timestamp: 'Now',
                rank: 'SYSTEM',
                chain: '',
                status: 'ERROR',
                error: error.message || 'Unable to run the selected agent command.',
                pending: false,
                runId: undefined,
              }
            : msg
        )
      );
    }
  };

  const handleLocalUploadTrigger = () => {
    localFileInputRef.current?.click();
  };

  const handleLocalFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    setLocalAttachments(files.map((file) => file.name));
    event.target.value = '';
  };

  const handleLinkFlow = () => {
    window.dispatchEvent(
      new CustomEvent('aio:navigate', {
        detail: {
          module: 'flows',
          action: 'select_agent_flow',
          flowId: selectedFlow?.id || null,
          intent: selectedAgent || activeRun?.executing_agent || activeRun?.agent_role || 'agents',
        },
      })
    );
  };

  const handleToggleSelectedAgent = (agentKey) => {
    if (selectionMode === 'talk') {
      setSelectedAgent((prev) => (prev === agentKey ? null : agentKey));
      setCollabAgents((prev) => prev.filter((key) => key !== agentKey));
      return;
    }
    setCollabAgents((prev) => {
      if (prev.includes(agentKey)) {
        return prev.filter((key) => key !== agentKey);
      }
      return [...prev, agentKey];
    });
    setSelectedAgent((prev) => (prev === agentKey ? null : prev));
  };

  const handleSelectRun = async (runId, nextView = 'command') => {
    if (!runId) return;
    const existingRun = aiRuns.find((item) => item?.id === runId) || null;
    const run = hydrateActiveRun(existingRun || await getAiRunApi(runId));
    if (!run) return;
    const nextAgentKey = run.executing_agent || run.agent_role || activeAgent?.registry_key || activeAgent?.name || '';
    const nextAgent = agents.find((agent) => (agent.registryKey || agent.registry_key || agent.name) === nextAgentKey) || activeAgent;
    if (nextAgent) {
      setActiveAgent(nextAgent);
    }
    setActiveRun(run);
    setView(nextView);
    setMessages((prev) => {
      const alreadyPresent = prev.some((message) => message.runId === run.id);
      return alreadyPresent ? prev : [...prev, buildAssistantMessageFromRun(run)];
    });
  };

  const output = activeRun?.output || null;
  const status = activeRun?.status || null;
  const error = activeRun?.error || null;
  const metadata = activeRun || null;
  const activeRunAgent = metadata?.executing_agent || metadata?.agent_role || '';
  const derivedAgentKey = activeRun?.executing_agent || activeRun?.requested_agent || activeRun?.agent_role || selectedAgent || '';
  const derivedAgentDefinition = derivedAgentKey ? SPECIALIST_REGISTRY[derivedAgentKey] : null;
  const activeRunStatus = formatRunStatus(status);
  const activeRunTimestamp = formatRunTimestamp(metadata?.updated_at || metadata?.created_at);
  const activeRunChain = normalizeDelegateChain(metadata?.delegate_chain);
  const activeRunCommand = metadata?.command_text || '';
  const activeRunOutput = output;
  const hasActiveRun = Boolean(activeRun);
  const isRunPending = messages.some((message) => message.role === 'assistant' && message.pending);
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant' && resolveMessageContent(message));
  const sessionStatusLabel = error ? 'ERROR' : hasActiveRun ? activeRunStatus : 'IDLE';
  const sessionStatusTone = error
    ? 'bg-red-500'
    : ['RUNNING', 'PENDING', 'QUEUED', 'ACTIVE', 'IN PROGRESS'].includes(sessionStatusLabel)
      ? 'bg-yellow-400'
      : hasActiveRun
        ? 'bg-green-500'
        : 'bg-gray-500';
  const activeFlowLabel = activeRun?.flow?.name || activeRun?.flowName || activeRun?.flow_name || activeRun?.metadata?.flowName || selectedFlow?.name || '';
  const collabAgentKeys = (() => {
    const commandPostOrder = agents
      .map((agent) => agent.registryKey || agent.registry_key || agent.name || '')
      .filter((key) => key && key !== 'ALPHA' && key !== 'OMEGA');
    return commandPostOrder.length ? commandPostOrder : (SPECIALIST_REGISTRY.ALPHA?.subordinates || []);
  })();
  const contextAgentLabel = activeRunAgent || selectedAgent || '';
  const commandModeLabel = activeFlowLabel && contextAgentLabel ? 'Agent + Flow' : activeFlowLabel ? 'Flow' : contextAgentLabel ? 'Agent' : 'System';
  const sessionDirective = hasActiveRun
    ? `RUN ${activeRunStatus}. ${activeRunAgent ? `ACTIVE AGENT ${activeRunAgent}. ` : ''}${activeRunCommand ? `COMMAND: ${activeRunCommand}. ` : ''}${error ? `ERROR: ${error}` : activeRunOutput ? `RESULT: ${activeRunOutput}` : 'AWAITING CANONICAL OUTPUT.'}`
    : selectedFlow
      ? `SYSTEM READY. FLOW ${selectedFlow.name.toUpperCase()} IS BOUND FOR EXECUTION. SUBMIT A COMMAND TO START A CANONICAL RUN.`
      : selectedAgent
        ? `SYSTEM READY. TARGET ${selectedAgent} IS SELECTED.${collabAgents.length ? ` COLLAB: ${collabAgents.join(', ')}.` : ''} SUBMIT A COMMAND TO START A CANONICAL RUN.`
        : collabAgents.length
          ? `SYSTEM READY. COLLAB GROUP ${collabAgents.join(', ')} IS STAGED. SUBMIT A COMMAND TO START A CANONICAL RUN.`
          : 'SYSTEM IDLE. SUBMIT A COMMAND TO START A CANONICAL RUN.';

  return (
     <div className="h-full min-h-0 flex flex-col gap-4 overflow-hidden relative selection:bg-purple-900/50">
      <ModuleHeader
        showTitle={false}
        leftActions={[
          {
            label: 'OPEN BARRACKS',
            icon: Target,
            onClick: () => setView('barracks'),
            variant: view === 'barracks' ? 'primary' : 'secondary'
          },
          {
            label: 'OPEN COMMAND',
            icon: Terminal,
            onClick: () => setView('command'),
            variant: view === 'command' ? 'primary' : 'secondary'
          }
        ]}
        showActions={true}
      />

      {/* Main Workspace */}
      <div className="flex-1 min-h-0 flex rounded-[var(--radius-outer)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden shadow-island relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/[0.02] pointer-events-none" />
        
        {/* BARRACKS VIEW */}
        {view === 'barracks' && (() => {
          const alpha = agents.find(a => (a.registryKey || a.registry_key) === 'ALPHA');
          const regularAgents = agents.filter(a => {
            const key = a.registryKey || a.registry_key;
            return key !== 'ALPHA' && key !== 'OMEGA';
          });
          const alphaRegistry = SPECIALIST_REGISTRY['ALPHA'];
          
          const formatRunTime = (value) => {
            if (!value) return '--:--:--';
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) return '--:--:--';
            return parsed.toLocaleTimeString([], { hour12: false });
          };

          const formatToken = (value, fallback) => {
            const token = value || fallback || '';
            return String(token).toUpperCase();
          };

          const formatAction = (value) => {
            if (!value) return 'TASK';
            return String(value).replace(/_/g, ' ').toUpperCase();
          };

          const formatStatus = (value) => {
            if (!value) return 'RUNNING';
            return String(value).replace(/_/g, ' ').toUpperCase();
          };

          const buildRunRoute = (run = {}) => {
            const chain = Array.isArray(run.delegate_chain) ? run.delegate_chain : [];
            const source = run.intake_agent || run.dispatcher_agent || chain[0] || run.requested_agent || run.agent_role || 'USER';
            const target = run.executing_agent || chain[chain.length - 1] || run.agent_role || run.requested_agent || 'SYSTEM';
            return {
              id: run.id || `${source}-${target}-${run.created_at || ''}`,
              runId: run.id || null,
              time: formatRunTime(run.created_at),
              source: formatToken(source, 'USER'),
              target: formatToken(target, 'SYSTEM'),
              action: formatAction(run.intent || run.field || run.module || run.surface),
              status: formatStatus(run.status),
            };
          };

          const adminEvents = aiRuns.slice(0, 8).map(buildRunRoute);
          const selectedRoute = activeRun ? buildRunRoute(activeRun) : null;
          const latestStep = Array.isArray(activeRun?.steps) && activeRun.steps.length > 0
            ? activeRun.steps[activeRun.steps.length - 1]
            : null;
          const charlieStatus = activeRun
            ? formatStatus(
                activeRun.status === 'failed'
                  ? 'error'
                  : activeRun.dispatcher_agent || activeRun.executing_agent
                    ? 'routed'
                    : activeRun.status || 'pending'
              )
            : '';
          const alphaStatus = activeRun
            ? formatStatus(
                activeRun.status === 'failed'
                  ? 'failed'
                  : activeRun.executing_agent
                    ? activeRun.status || 'running'
                    : activeRun.dispatcher_agent
                      ? 'queued'
                      : 'idle'
              )
            : '';
          const commandPath = activeRun
            ? [
                selectedRoute?.source || 'OPERATOR',
                activeRun.intake_agent || 'CHARLIE',
                activeRun.dispatcher_agent || 'ALPHA',
                activeRun.flowId || activeRun.flow_id || activeRun.metadata?.flowId ? `FLOW ${activeRun.flowName || activeRun.flow_name || activeRun.metadata?.flowName || activeRun.flowId || activeRun.flow_id || activeRun.metadata?.flowId}` : null,
                activeRun.executing_agent || activeRun.requested_agent || 'TARGET AGENT',
                (activeRun.status || '').toLowerCase() === 'failed' ? 'FAILED' : 'RESULT',
              ].filter((label, index, array) => label && array.indexOf(label) === index)
            : [];
          const executionNodes = (() => {
            if (!activeRun || commandPath.length === 0) return [];
            const status = (activeRun.status || '').toLowerCase();
            const hasFailed = status === 'failed';
            const isCompleted = ['completed', 'success'].includes(status);
            const isInProgress = ['executing', 'running', 'blocked', 'paused', 'queued', 'pending', 'active', 'in_progress'].includes(status);

            const charlieIdx = commandPath.findIndex(l => l === (activeRun.intake_agent || 'CHARLIE'));
            const alphaIdx = commandPath.findIndex(l => l === (activeRun.dispatcher_agent || 'ALPHA'));
            const targetIdx = commandPath.findIndex(l => l === (activeRun.executing_agent || activeRun.requested_agent || 'TARGET AGENT'));

            const getNodeState = (idx) => {
              if (hasFailed) return idx >= commandPath.length - 2 ? 'failed' : 'completed';
              if (isCompleted) return 'completed';
              if (!isInProgress) return 'idle';
              const maxActiveIdx = Math.max(charlieIdx, alphaIdx, targetIdx);
              if (idx === maxActiveIdx) return 'active';
              if (idx < maxActiveIdx) return 'completed';
              return 'pending';
            };

            return commandPath.map((label, index) => ({
              id: `${label}-${index}`,
              label,
              state: getNodeState(index),
            }));
          })();

          return (
            <div className="flex-1 min-h-0 flex gap-4 p-4 overflow-hidden relative">
              <style>{`
                @keyframes route-flow {
                  0% { transform: translateX(-10%); opacity: 0.25; }
                  40% { opacity: 0.8; }
                  100% { transform: translateX(110%); opacity: 0.2; }
                }
                .route-flow { animation: route-flow linear infinite; }
              `}</style>
              
              {/* LEFT - Command Islands */}
              <div className="flex-1 min-h-0 min-w-0 w-1/2 p-4 border border-[var(--color-border)] rounded-[var(--radius-panel)] bg-[var(--color-bg-primary)]/40 flex flex-col gap-4 shadow-inner overflow-hidden">

                {/* ISLAND 1 — ALPHA */}
                {alpha && (
                  <div
                    onClick={() => { setActiveAgent(alpha); setActiveRun(null); setView('command'); }}
                    className="group shrink-0 cursor-pointer rounded-[var(--radius-panel)] border border-green-500/30 bg-gradient-to-br from-green-500/10 via-[var(--color-bg-primary)] to-[var(--color-bg-primary)] hover:border-green-500/60 transition-all duration-500 overflow-hidden shadow-[var(--shadow-island)]"
                  >
                    <div className="px-4 py-3 flex items-center gap-4 border-b border-green-500/10">
                      <div className="relative shrink-0">
                        <div className={`w-12 h-12 rounded-full ${HQ_AGENT_STYLE.bg} border-2 ${HQ_AGENT_STYLE.border} flex items-center justify-center text-sm font-black ${HQ_AGENT_STYLE.icon}`}>
                          AL
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white dark:border-[var(--color-bg-secondary)]" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-base font-black text-[var(--color-text-primary)] tracking-wide">{alpha.name}</h2>
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-[0.2em] bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30">
                            HQ Layer
                          </span>
                        </div>
                        <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-[0.22em] font-bold">AGT-CMD-001</p>
                      </div>

                      <div className="flex items-center justify-end gap-3 shrink-0">
                        <div className="rounded border border-[var(--color-border)] bg-black/5 px-2.5 py-1.5 text-right font-mono">
                          <div className="text-[8px] uppercase tracking-widest text-[var(--color-text-tertiary)]">Routing</div>
                          <div className="text-[10px] text-green-600 dark:text-green-400 font-bold whitespace-nowrap">{selectedRoute?.source || 'USER'} → {activeRun?.intake_agent || 'CHARLIE'}</div>
                        </div>
                        <div className="rounded border border-[var(--color-border)] bg-black/5 px-2.5 py-1.5 text-right font-mono">
                          <div className="text-[8px] uppercase tracking-widest text-[var(--color-text-tertiary)]">Status</div>
                          <div className="text-[10px] text-green-600 dark:text-green-400 font-bold whitespace-nowrap uppercase">{sessionStatusLabel}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}


                {/* Specialist Arena */}
                <div className="flex-1 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]/30 p-4 flex flex-col overflow-hidden shadow-inner">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Specialist Control</span>
                    <span className="text-[8px] font-mono text-[var(--color-text-tertiary)]">{regularAgents.length} Active</span>
                  </div>
                  <div className="mb-2 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                    <Target size={10} className="text-[var(--color-primary)]" />
                    <span className="text-[9px] font-black uppercase tracking-[0.28em] text-[var(--color-text-tertiary)]">
                        Specialist Arena: {regularAgents.length} Agents
                    </span>
                    </div>
                    <span className="text-[8px] font-mono uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">3 × 4 Fixed Grid</span>
                  </div>

                  <div className="flex-1 min-h-0 overflow-hidden">
                  <div className="grid h-full grid-cols-2 xl:grid-cols-4 gap-1.5 auto-rows-fr">
                    {regularAgents.map((agent, idx) => {
                      const agentKey = agent.registryKey || agent.registry_key;
                      const row = Math.floor(idx / 4);
                      const col = idx % 4;
                      const c = (ROW_COLOR_LANES[row] && ROW_COLOR_LANES[row][col % ROW_COLOR_LANES[row].length]) || ROW_COLOR_LANES[0][0];
                      return (
                      <div
                        key={agentKey || agent.id || idx}
                        onClick={() => { setActiveAgent(agent); setActiveRun(null); setView('command'); }}
                        className="group bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-[var(--radius-card)] p-0.5 cursor-pointer transition-all hover:shadow-[0_0_12px_rgba(147,51,234,0.1)] flex flex-col"
                      >
                        <div className="bg-[var(--color-bg-secondary)] rounded-t-lg px-2 py-1.5 border-b border-[var(--color-border)] group-hover:bg-[var(--color-hover)] transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full ${c.bg} border ${c.border} flex items-center justify-center shadow-[0_0_10px_${c.shadow}] text-[9px] font-bold tracking-tighter ${c.icon}`}>
                                {(agentKey || agent.name || '').substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h3 className="text-[10px] font-bold text-[var(--color-text-primary)] leading-tight">{agent.name}</h3>
                              </div>
                            </div>
                            <div className={`w-1.5 h-1.5 rounded-full mt-1 ${agent.status === 'Deployed' ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]' : 'bg-[var(--color-text-tertiary)]'}`} />
                          </div>
                        </div>
                        <div className="px-2 py-1 flex-1">
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                            <Target size={9} className={`${c.icon} shrink-0`} />
                            <span className="truncate">{agent.specialization}</span>
                          </div>
                        </div>
                        <div className={`px-2 py-1 border-t ${c.border} flex justify-between items-center ${c.bg} rounded-b-lg`}>
                          <span className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-wider font-mono font-bold opacity-70">
                            ID: {agent.id}
                          </span>
                          <div className="text-[var(--color-text-primary)] text-[10px] font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                            Run <ArrowRight size={8} />
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                  </div>
                </div>

                {/* ISLAND 3 — OMEGA */}
                <div className="relative rounded-[var(--radius-panel)] min-h-[128px] border border-red-900/40 bg-gradient-to-br from-red-950/20 via-[var(--color-bg-primary)] to-[var(--color-bg-primary)] overflow-hidden select-none shrink-0 shadow-[0_12px_24px_rgba(0,0,0,0.22),0_0_18px_rgba(127,29,29,0.16)]">
                  <div className="absolute inset-0 pointer-events-none" style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.02) 2px, rgba(255,0,0,0.02) 4px)',
                    zIndex: 1
                  }} />

                  <div className="relative z-10 px-4 py-2 flex items-center gap-4 border-b border-red-900/20">
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 rounded-full ${OMEGA_AGENT_STYLE.bg} border-2 ${OMEGA_AGENT_STYLE.border} flex items-center justify-center shadow-[0_0_15px_${OMEGA_AGENT_STYLE.shadow}]`}>
                        <Radiation className="w-6 h-6 text-red-400" />
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-600/40 border-2 border-[var(--color-bg-secondary)]" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h2 className="text-sm font-black tracking-[0.15em]" style={{ color: 'rgba(239,68,68,0.4)', textShadow: '0 0 10px rgba(239,68,68,0.3)', filter: 'blur(0.3px)' }}>
                          REDACTED
                        </h2>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-[0.2em] bg-red-950/60 text-red-400 border border-red-700/50">
                          CLASSIFIED
                        </span>
                      </div>
                      <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-[0.22em] font-bold mt-0.5">AGT-OPS-999 - REDACTED</p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-6 h-6 rounded-full bg-red-950/30 border border-red-800/30 flex items-center justify-center">
                          <Lock size={12} className="text-red-400" />
                        </div>
                        <span className="text-[8px] text-red-400 uppercase tracking-widest font-bold">Locked</span>
                      </div>
                    </div>
                  </div>
                  <div className="relative z-10 px-4 py-1 flex items-center justify-between">
                    <p className="text-[9px] text-red-400 uppercase tracking-[0.24em] font-bold">
                      REDACTED clearance required
                    </p>
                    <span className="text-[8px] text-red-400 font-mono">OMEGA-SYS // DO NOT ACCESS</span>
                  </div>
                </div>

              </div>

              {/* RIGHT - Activity Panel (Monitors & Lightbars) */}
              <div className="flex-1 min-h-0 min-w-0 w-1/2 flex flex-col gap-3 overflow-hidden">
                
                {/* TOP: COMMAND MONITORS */}
                <div className="h-[42%] flex gap-3 p-3 border border-[var(--color-border)] rounded-[var(--radius-panel)] bg-[var(--color-bg-secondary)] shadow-sm">
                  
                  {/* USER MONITOR */}
                  <div className="flex-1 flex flex-col bg-[#0a0a0d] rounded-[var(--radius-card)] border border-white/10 overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.35)] relative">
                    <div className="absolute inset-0 pointer-events-none opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.08) 1px, rgba(255,255,255,0.08) 2px)', backgroundSize: '100% 2px' }}></div>
                    <div className="relative z-10 bg-black/40 border-b border-white/10 p-2 flex items-center justify-center gap-2 text-white/80 font-mono text-[9px] uppercase tracking-widest">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-[0_0_5px_rgba(255,255,255,0.4)] animate-pulse"></div>
                      ADMIN
                    </div>
                    <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
                      <div className="grid grid-cols-[52px_1fr_1fr_1fr_58px] gap-2 text-[8px] font-mono text-white/40 uppercase tracking-[0.22em] px-1 pb-1">
                        <span>TIME</span>
                        <span>SOURCE</span>
                        <span>ACTION</span>
                        <span>TARGET</span>
                        <span className="text-right">STATE</span>
                      </div>
                      {adminEvents.map(event => (
                        <div key={event.id} onClick={() => event.runId && handleSelectRun(event.runId, 'barracks')} className={`grid grid-cols-[52px_1fr_1fr_1fr_58px] gap-2 text-[9px] font-mono text-white/80 px-1 py-1 border-t border-white/5 ${event.runId ? 'cursor-pointer hover:bg-white/5' : ''}`}>
                          <span className="text-white/40">{event.time}</span>
                          <span className="truncate">{event.source}</span>
                          <span className="truncate">{event.action}</span>
                          <span className="truncate text-white/70">{event.target}</span>
                          <span className="text-right text-white/50">{event.status}</span>
                        </div>
                      ))}
                      {adminEvents.length === 0 && (
                        <div className="text-[9px] font-mono text-white/40 p-2 text-center">AWAITING COMMANDS...</div>
                      )}
                    </div>
                  </div>

                  {/* CHARLIE MONITOR */}
                  <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)] dark:bg-[#0a0a14] rounded-[var(--radius-card)] border border-blue-500/20 overflow-hidden shadow-[inset_0_0_20px_rgba(59,130,246,0.03)] relative">
                    <div className="relative z-10 bg-blue-950/40 border-b border-blue-500/20 p-2 flex items-center justify-center gap-2 text-blue-400 font-mono text-[9px] uppercase tracking-widest">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)] animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                      CHARLIE INTAKE
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)] animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                    <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                      {activeRun ? (
                        <>
                          <div className="border border-blue-500/20 bg-blue-900/10 p-2 rounded text-[8px] font-mono text-blue-300 uppercase tracking-widest">
                            <div className="flex items-center justify-between">
                              <span>Source</span>
                              <span>{selectedRoute?.source || 'OPERATOR'}</span>
                            </div>
                          </div>
                          <div className="border border-blue-500/20 bg-blue-900/10 p-2 rounded text-[8px] font-mono text-blue-300 uppercase tracking-widest">
                            <div className="flex items-center justify-between">
                              <span>Intake</span>
                              <span>{activeRun.intake_agent || 'CHARLIE'}</span>
                            </div>
                          </div>
                          <div className="border border-blue-500/20 bg-blue-900/10 p-2 rounded text-[8px] font-mono text-blue-300 uppercase tracking-widest">
                            <div className="flex items-center justify-between">
                              <span>Status</span>
                              <span>{charlieStatus}</span>
                            </div>
                          </div>
                          <div className="border border-blue-500/20 bg-blue-900/10 p-2 rounded text-[8px] font-mono text-blue-300 uppercase tracking-widest">
                            <div className="flex items-center justify-between">
                              <span>Target</span>
                              <span>{activeRun.dispatcher_agent || activeRun.executing_agent || activeRun.requested_agent || 'TARGET'}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-[8px] font-mono text-blue-500/40 p-2 text-center">No active intake</div>
                      )}
                    </div>
                   </div>

                   {/* ALPHA MONITOR */}
                  <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)] dark:bg-[#0a140a] rounded-[var(--radius-card)] border border-green-500/20 overflow-hidden shadow-[inset_0_0_20px_rgba(34,197,94,0.03)] relative">
                    <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, #166534 1px, #166534 2px)', backgroundSize: '100% 2px' }}></div>
                    <div className="relative z-10 bg-green-950/40 border-b border-green-500/20 p-2 flex items-center justify-center gap-2 text-green-400 font-mono text-[9px] uppercase tracking-widest">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.8)] animate-pulse" style={{ animationDelay: '0.7s' }}></div>
                      ALPHA
                    </div>
                    <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                      {activeRun ? (
                        <>
                          <div className="border border-green-500/20 bg-green-900/10 p-2 rounded text-[8px] font-mono text-green-300 uppercase tracking-widest">
                            <div className="flex items-center justify-between">
                              <span>Owner</span>
                              <span>{activeRun.executing_agent || activeRun.requested_agent || 'UNASSIGNED'}</span>
                            </div>
                          </div>
                          <div className="border border-green-500/20 bg-green-900/10 p-2 rounded text-[8px] font-mono text-green-300 uppercase tracking-widest">
                            <div className="flex items-center justify-between">
                              <span>Status</span>
                              <span>{alphaStatus}</span>
                            </div>
                          </div>
                          <div className="border border-green-500/20 bg-green-900/10 p-2 rounded text-[8px] font-mono text-green-300 uppercase tracking-widest">
                            <div className="flex items-center justify-between">
                              <span>Stage</span>
                              <span>{formatAction(latestStep?.intent || latestStep?.type || activeRun.intent || 'execution')}</span>
                            </div>
                          </div>
                          <div className="border border-green-500/20 bg-green-900/10 p-2 rounded text-[8px] font-mono text-green-300 uppercase tracking-widest">
                            <div className="flex items-center justify-between">
                              <span>Result</span>
                              <span>{formatStatus(activeRun.status || 'idle')}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-[8px] font-mono text-green-500/40 p-2 text-center">No active execution</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* BOTTOM: SPECIALIST LIGHTBARS */}
                <div className="h-[58%] flex flex-col relative px-5 py-4 border border-[var(--color-border)] rounded-[var(--radius-panel)] bg-[var(--color-bg-secondary)] shadow-sm overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-bg-primary)]/60 to-[var(--color-bg-primary)]/10 z-0 pointer-events-none"></div>
                  
                  <div className="relative z-10 flex items-center justify-between mb-4 shrink-0">
                    <h3 className="text-[9px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)] font-bold flex items-center gap-2">
                      <Activity size={10} className="text-blue-500" /> Execution Stream
                    </h3>
                  </div>

                  <div className="relative z-10 flex-1 flex flex-col justify-center overflow-hidden">
                    {executionNodes.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3">
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          {executionNodes.map((node, index) => {
                            const tone =
                              node.state === 'failed'
                                ? 'border-red-500/40 bg-red-950/30 text-red-300 shadow-[0_0_18px_rgba(239,68,68,0.2)]'
                                : node.state === 'active'
                                  ? 'border-blue-400/50 bg-blue-950/30 text-blue-200 shadow-[0_0_22px_rgba(59,130,246,0.25)]'
                                  : node.state === 'completed'
                                    ? 'border-emerald-500/40 bg-emerald-950/25 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.18)]'
                                    : 'border-[var(--color-border)] bg-[var(--color-bg-primary)]/60 text-[var(--color-text-secondary)]';
                            const activeClass = node.state === 'active' ? 'node-active' : '';
                            return (
                              <React.Fragment key={node.id}>
                                <div className={`min-w-[120px] px-4 py-4 rounded-[var(--radius-card)] border text-center ${tone} ${activeClass}`}>
                                  <div className="text-[8px] uppercase tracking-[0.28em] font-black">{node.label}</div>
                                  <div className="mt-2 text-[9px] font-mono uppercase tracking-widest">{node.state}</div>
                                </div>
                                {index < executionNodes.length - 1 ? (
                                  <div className="text-[var(--color-text-tertiary)] text-lg font-black uppercase tracking-widest">→</div>
                                ) : null}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[9px] font-mono uppercase tracking-widest text-[var(--color-text-secondary)]">
                          <div className="border border-[var(--color-border)] rounded px-3 py-2 bg-[var(--color-bg-primary)]/50">
                            Source: {selectedRoute?.source || 'OPERATOR'}
                          </div>
                          <div className="border border-[var(--color-border)] rounded px-3 py-2 bg-[var(--color-bg-primary)]/50">
                            Intake: {activeRun?.intake_agent || 'CHARLIE'}
                          </div>
                          <div className="border border-[var(--color-border)] rounded px-3 py-2 bg-[var(--color-bg-primary)]/50">
                            Dispatch: {activeRun?.dispatcher_agent || 'ALPHA'}
                          </div>
                          <div className="border border-[var(--color-border)] rounded px-3 py-2 bg-[var(--color-bg-primary)]/50">
                            Result: {formatStatus(activeRun?.status || 'idle')}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-[9px] uppercase tracking-[0.3em] text-[var(--color-text-tertiary)] font-bold">
                        No active routes
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

        {/* COMMAND VIEW (Session) */}
        {view === 'command' && (
          <div className="flex-1 min-h-0 flex overflow-hidden">
             {/* Left: Command Context */}
             <div className="w-80 min-h-0 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]/50 flex flex-col">
                <div className="p-6 border-b border-[var(--color-border)]">
                   <h3 className="text-2xl font-bold text-[var(--color-text-primary)] uppercase tracking-tight">Command Session</h3>
                   <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-blue-900/30 border border-blue-500/30 text-blue-400 text-[10px] font-bold uppercase rounded-full">{sessionStatusLabel}</span>
                      <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest opacity-60">{hasActiveRun ? activeRunTimestamp : 'System Routed'}</span>
                   </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                   {/* Directive */}
                   <div>
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Terminal size={14} className="text-purple-500" /> Execution Directive
                      </h4>
                      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] p-4 text-[11px] text-gray-300 font-mono leading-relaxed shadow-inner">{sessionDirective}</div>
                   </div>

                   {/* Active Context */}
                   <div>
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Layers size={14} className="text-blue-500" /> Active Context
                      </h4>
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between bg-[var(--color-bg-primary)] border border-[var(--color-border)] p-3 rounded-[var(--radius-card)]">
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Bound Flow</span>
                          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">{activeFlowLabel || 'No Flow Bound'}</span>
                        </div>
                        <div className="flex items-center justify-between bg-[var(--color-bg-primary)] border border-[var(--color-border)] p-3 rounded-[var(--radius-card)]">
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Active Agent</span>
                          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">{contextAgentLabel || 'No Active Agent'}</span>
                        </div>
                        <div className="flex items-center justify-between bg-[var(--color-bg-primary)] border border-[var(--color-border)] p-3 rounded-[var(--radius-card)]">
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Command Mode</span>
                          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">{commandModeLabel}</span>
                        </div>
                      </div>
                   </div>

                   {/* Tools */}
                   <div>
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Cpu size={14} className="text-yellow-500" /> Assigned Tools
                      </h4>
                      <div className="flex flex-wrap gap-2">
                         {(derivedAgentDefinition?.tools || []).map((tool) => (
                           <span
                             key={tool}
                             className="px-3 py-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-full text-[9px] font-bold text-gray-400 uppercase tracking-wider"
                           >
                             {tool}
                           </span>
                         ))}
                         {(!derivedAgentDefinition?.tools || derivedAgentDefinition.tools.length === 0) ? (
                           <div className="text-[10px] text-gray-600 italic p-3 border border-dashed border-[var(--color-border)] rounded-lg text-center font-bold w-full">
                             TOOLS WILL RESOLVE WHEN A CANONICAL RUN ASSIGNS AN AGENT
                           </div>
                         ) : null}
                      </div>
                   </div>
                </div>
             </div>

             {/* Center: Command Stream */}
             <div className="flex-1 min-h-0 flex flex-col bg-[var(--color-bg-tertiary)]/30 backdrop-blur-sm relative overflow-hidden">
                <div className="p-5 border-b border-[var(--color-border)]/50 flex items-center justify-between bg-[var(--color-bg-primary)]/20">
                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="text-[12px] font-black text-[var(--color-text-primary)] uppercase tracking-widest">Command Session</h4>
                      <span className={`w-2 h-2 rounded-full ${sessionStatusTone}`}></span>
                      <span className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest">{activeRunAgent ? `${sessionStatusLabel} (${activeRunAgent})` : sessionStatusLabel}</span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)] font-medium mt-0.5">
                      {hasActiveRun
                        ? `Run ${activeRun.id} • ${activeRunStatus}${activeRunChain ? ` • ${activeRunChain}` : ''} • ${activeRunTimestamp}`
                        : 'System-level command interface'}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-tertiary)] font-medium mt-1 uppercase tracking-widest">Command Stream</p>
                    {selectedFlow ? (
                      <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                        <Workflow size={12} />
                        Flow Bound: {selectedFlow.name}
                        <button
                          type="button"
                          onClick={clearSelectedFlow}
                          className="text-cyan-100/70 hover:text-white"
                        >
                          Clear
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Chat Feed */}
                <div ref={chatFeedRef} className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                   {messages.map((msg, i) => {
                      const preferredRun = resolveMessageRun(msg);
                      const preferredContent = msg.role === 'assistant' ? resolveMessageContent(msg) : msg.content;
                      const preferredRank = preferredRun ? (preferredRun.executing_agent || preferredRun.agent_role || msg.rank) : msg.rank;
                      const preferredChain = preferredRun ? normalizeDelegateChain(preferredRun.delegate_chain) : msg.chain;
                      const preferredTimestamp = preferredRun ? formatRunTimestamp(preferredRun.updated_at || preferredRun.created_at) : msg.timestamp;
                      const preferredStatus = preferredRun ? formatRunStatus(preferredRun.status) : msg.status;
                      const preferredError = preferredRun ? preferredRun.error : msg.error;
                      const messageToken = msg.runId || msg.clientId || `message-${i}`;
                      const supportsJsonDownload = Boolean(preferredRun) || looksLikeJson(preferredContent);
                      const supportsMarkdownDownload = looksLikeMarkdown(preferredContent) || preferredContent.includes('```') || Boolean(preferredRun);
                      const referenceTargets = extractLinkTargets(preferredContent);
                      const primaryReference = referenceTargets[0] || '';
                      return (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                         <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                            <div className={`flex items-center gap-2 mb-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                               <span className={`text-[9px] font-black uppercase tracking-widest ${msg.role === 'user' ? 'text-blue-400' : 'text-brass'}`}>
                                  {msg.role === 'user' ? 'OPERATOR' : preferredRank}
                               </span>
                               {preferredChain ? (
                                 <span className="text-[9px] uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-50 px-2 border-l border-[var(--color-border)] font-mono">
                                   {preferredChain}
                                 </span>
                               ) : null}
                               <span className="text-[8px] text-gray-600 font-mono tracking-tighter">[{preferredTimestamp}]</span>
                               {msg.role === 'assistant' && preferredStatus ? (
                                 <span className="text-[8px] text-gray-500 font-mono tracking-widest uppercase">{preferredStatus}</span>
                               ) : null}
                               {msg.role === 'assistant' ? (
                                 <div className="flex items-center gap-1 ml-2">
                                   <button
                                     type="button"
                                     onClick={() => handleCopyMessage(msg, messageToken)}
                                     className="text-[8px] text-gray-500 font-mono uppercase tracking-widest hover:text-[var(--color-text-primary)]"
                                   >
                                     {copiedToken === messageToken ? 'Copied' : 'Copy'}
                                   </button>
                                   <button
                                     type="button"
                                     onClick={() => handleDownloadMessage(msg, 'txt')}
                                     className="text-[8px] text-gray-500 font-mono uppercase tracking-widest hover:text-[var(--color-text-primary)]"
                                   >
                                     TXT
                                   </button>
                                   <button
                                     type="button"
                                     onClick={() => handleDownloadMessage(msg, 'md')}
                                     className="text-[8px] text-gray-500 font-mono uppercase tracking-widest hover:text-[var(--color-text-primary)]"
                                   >
                                     {supportsMarkdownDownload ? 'MD' : 'TXT->MD'}
                                   </button>
                                   {supportsJsonDownload ? (
                                     <button
                                       type="button"
                                       onClick={() => handleDownloadMessage(msg, 'json')}
                                       className="text-[8px] text-gray-500 font-mono uppercase tracking-widest hover:text-[var(--color-text-primary)]"
                                     >
                                       JSON
                                     </button>
                                   ) : null}
                                   {primaryReference ? (
                                     <a
                                       href={normalizeLinkHref(primaryReference)}
                                       target="_blank"
                                       rel="noreferrer"
                                       className="text-[8px] text-gray-500 font-mono uppercase tracking-widest hover:text-[var(--color-text-primary)]"
                                     >
                                       Open File
                                     </a>
                                   ) : null}
                                 </div>
                               ) : null}
                            </div>
                            <div className={`p-5 rounded-[var(--radius-panel)] text-sm leading-relaxed shadow-island ${
                               msg.role === 'user' 
                               ? 'bg-purple-900/10 border border-purple-500/40 text-purple-100 rounded-tr-none' 
                               : 'bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-gray-300 rounded-tl-none border-t-white/10'
                            }`}>
                               <div className="break-words">
                                 {msg.role === 'assistant' ? renderMarkdownContent(preferredContent) : renderLinkedContent(preferredContent)}
                               </div>
                               {msg.role === 'assistant' && preferredError ? (
                                 <div className="mt-3 text-xs text-red-400">{preferredError}</div>
                               ) : null}
                            </div>
                         </div>
                      </div>
                   )})}
                </div>

                {/* Input Area */}
                <div className="p-5 border-t border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/40 backdrop-blur-xl">
                   <input ref={localFileInputRef} type="file" multiple className="hidden" onChange={handleLocalFileSelect} />
                   <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4 items-start">
                     <div className="min-w-0">
                       <div className="relative flex items-center gap-3">
                          <div className="relative flex-1">
                            <input 
                              disabled={isRunPending}
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && !isRunPending && handleSendMessage()}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="none"
                              spellCheck={false}
                              name="commandInput"
                              id="command-input-surface"
                              type="search"
                              inputMode="text"
                              enterKeyHint="send"
                              aria-autocomplete="none"
                              data-lpignore="true"
                              data-1p-ignore="true"
                              data-bwignore="true"
                              data-form-type="other"
                              autoSave="off"
                              placeholder="SEND COMMAND..." 
                              className={`w-full bg-[var(--color-bg-primary)]/70 dark:bg-black/40 border border-[var(--color-border)] rounded-[var(--radius-card)] px-5 pt-5 pb-9 text-sm text-[var(--color-text-primary)] placeholder:text-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20 font-mono uppercase tracking-[0.18em] transition-all appearance-none ${isRunPending ? 'opacity-60 cursor-not-allowed' : ''}`}
                            />
                            <div className="absolute right-4 bottom-2 flex items-center justify-end gap-2 max-w-[calc(100%-32px)] overflow-hidden">
                              {selectedAgent ? (
                                <span className="shrink-0 px-2 py-1 rounded-full border border-blue-500/20 bg-blue-900/20 text-[8px] text-blue-300 font-mono font-bold tracking-widest uppercase">
                                  Target: {selectedAgent}
                                </span>
                              ) : null}
                              {collabAgents.length ? (
                                <span className="min-w-0 truncate px-2 py-1 rounded-full border border-amber-500/20 bg-amber-900/20 text-[8px] text-amber-300 font-mono font-bold tracking-widest uppercase">
                                  Collab: {collabAgents.join(' | ')}
                                </span>
                              ) : null}
                              {!selectedAgent && !collabAgents.length ? (
                                <span className="shrink-0 px-2 py-1 rounded-full border border-blue-500/20 bg-blue-900/20 text-[8px] text-blue-300 font-mono font-bold tracking-widest uppercase">
                                  {sessionStatusLabel}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="shrink-0 flex flex-col items-stretch gap-2 w-[112px]">
                            <button 
                              type="button"
                              disabled={isRunPending}
                              onClick={handleSendMessage}
                              className={`btn-secondary !rounded-[var(--radius-card)] !px-4 !py-3 min-w-0 flex items-center justify-center gap-2 ${isRunPending ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                               <span className="text-[10px] font-black uppercase tracking-[0.18em]">Send</span>
                               <ArrowRight size={14} />
                            </button>
                            <div className="inline-flex rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]/60 p-1">
                              <button
                                type="button"
                                onClick={() => setSelectionMode('talk')}
                                className={`flex-1 rounded-[calc(var(--radius-card)-4px)] px-2 py-1.5 text-[8px] font-black uppercase tracking-[0.18em] transition-colors ${
                                  selectionMode === 'talk'
                                    ? 'bg-blue-500/20 text-blue-200'
                                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                                }`}
                              >
                                Talk
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectionMode('collab')}
                                className={`flex-1 rounded-[calc(var(--radius-card)-4px)] px-2 py-1.5 text-[8px] font-black uppercase tracking-[0.18em] transition-colors ${
                                  selectionMode === 'collab'
                                    ? 'bg-amber-500/20 text-amber-200'
                                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                                }`}
                              >
                                Collab
                              </button>
                            </div>
                          </div>
                       </div>
                       <div className="mt-4 flex flex-wrap items-center gap-2">
                         {selectedFlow ? (
                           <span className="px-2 py-1 rounded-full border border-cyan-500/20 bg-cyan-900/20 text-[8px] text-cyan-300 font-mono font-bold tracking-widest uppercase">
                             Flow: {selectedFlow.name}
                           </span>
                         ) : null}
                         {localAttachments.map((name) => (
                           <span key={name} className="px-2 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[8px] text-[var(--color-text-secondary)] font-mono font-bold tracking-widest uppercase">
                             Local: {name}
                           </span>
                         ))}
                         <button
                           type="button"
                           disabled={isRunPending}
                           onClick={handleLocalUploadTrigger}
                           className={`btn-secondary !text-[10px] !px-4 !py-2 ${isRunPending ? 'opacity-60 cursor-not-allowed' : ''}`}
                         >
                           Upload Intel
                         </button>
                         <button
                           type="button"
                           disabled={isRunPending}
                           onClick={handleLinkFlow}
                           className={`btn-secondary !text-[10px] !px-4 !py-2 ${isRunPending ? 'opacity-60 cursor-not-allowed' : ''}`}
                         >
                           {selectedFlow ? 'Change Flow' : 'Link Flow'}
                         </button>
                         <button
                           type="button"
                           onClick={handleCopyAll}
                           className="btn-secondary !text-[10px] !px-4 !py-2"
                         >
                           {copiedToken === 'copy-all' ? 'Copied' : 'Copy All'}
                         </button>
                         <button
                           type="button"
                           onClick={() => latestAssistantMessage && handleDownloadMessage(latestAssistantMessage, looksLikeMarkdown(resolveMessageContent(latestAssistantMessage)) ? 'md' : 'txt')}
                           disabled={!latestAssistantMessage}
                           className={`btn-secondary !text-[10px] !px-4 !py-2 ${latestAssistantMessage ? '' : 'opacity-60 cursor-not-allowed'}`}
                         >
                           Download
                         </button>
                         <button
                           type="button"
                           onClick={handleClearChat}
                           className="btn-secondary !text-[10px] !px-4 !py-2"
                         >
                           Clear Chat
                         </button>
                       </div>
                     </div>
                     <div>
                       <div className="grid grid-cols-3 gap-2">
                       {collabAgentKeys.map((agentKey) => {
                         const isTalkSelected = selectedAgent === agentKey;
                         const isCollabSelected = collabAgents.includes(agentKey);
                         return (
                           <button
                             key={agentKey}
                             type="button"
                             disabled={isRunPending}
                             onClick={() => handleToggleSelectedAgent(agentKey)}
                             className={`rounded-[var(--radius-card)] border px-2 py-2 text-[9px] font-black uppercase tracking-[0.18em] transition-colors ${
                               isTalkSelected
                                 ? 'border-blue-500/50 bg-blue-500/20 text-blue-100'
                                 : isCollabSelected
                                   ? 'border-amber-500/50 bg-amber-500/20 text-amber-100'
                                   : 'border-[var(--color-border)] bg-[var(--color-bg-primary)]/70 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                             } ${isRunPending ? 'opacity-60 cursor-not-allowed' : ''}`}
                           >
                             {agentKey}
                           </button>
                         );
                       })}
                       </div>
                     </div>
                   </div>
                </div>
             </div>
             <div className="w-80 min-h-0 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]/60 flex flex-col">
                <div className="p-5 border-b border-[var(--color-border)]">
                  <h4 className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest">Run Core</h4>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-5">
                  <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] p-4 space-y-3">
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Status</div>
                      <div className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">{sessionStatusLabel}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Agent Chain</div>
                      <div className="mt-1 text-sm text-[var(--color-text-primary)] break-words">{activeRunChain || 'Awaiting canonical chain'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Mode</div>
                      <div className="mt-1 text-sm text-[var(--color-text-primary)] break-words">{commandModeLabel}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Flow</div>
                      <div className="mt-1 text-sm text-[var(--color-text-primary)] break-words">{activeFlowLabel || 'No Flow Bound'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Active Agent</div>
                      <div className="mt-1 text-sm text-[var(--color-text-primary)] break-words">{contextAgentLabel || 'No Active Agent'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Timestamps</div>
                      <div className="mt-1 text-xs font-mono text-[var(--color-text-secondary)]">
                        {metadata?.created_at ? `Created ${formatRunTimestamp(metadata.created_at)}` : 'Created PENDING'}
                      </div>
                      <div className="text-xs font-mono text-[var(--color-text-secondary)]">
                        {metadata?.updated_at ? `Updated ${formatRunTimestamp(metadata.updated_at)}` : 'Updated PENDING'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Error</div>
                      <div className={`mt-1 text-sm ${error ? 'text-red-400' : 'text-[var(--color-text-secondary)]'}`}>{error || 'No active error'}</div>
                    </div>
                  </div>

                  <div className="opacity-60">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest">Timeline (Coming soon)</h4>
                      <span title="Coming soon" className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-tertiary)] cursor-not-allowed">Coming soon</span>
                    </div>
                    <div title="Coming soon" className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] p-4 space-y-3 cursor-not-allowed">
                      <div className="h-8 rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40"></div>
                      <div className="h-8 rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40"></div>
                      <div className="h-8 rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40"></div>
                    </div>
                  </div>

                  <div className="opacity-60">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest">Signals (Coming soon)</h4>
                      <span title="Coming soon" className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-tertiary)] cursor-not-allowed">Coming soon</span>
                    </div>
                    <div title="Coming soon" className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] p-4 space-y-3 cursor-not-allowed">
                      <div className="h-8 rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40"></div>
                      <div className="h-8 rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40"></div>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIOAgentsModule;
