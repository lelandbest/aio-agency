/**
 * Flow Builder
 * Main orchestrator for the Flow Builder module
 * Manages canvas, nodes, edges, config, persistence
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Bot,
  Layers,
  Terminal,
  ArrowRight,
  History,
  Save,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Settings,
  Zap,
  Wand2,
  Play,
  Target,
} from 'lucide-react';

import AIAssistButton from '../../components/AIAssistButton';
import { requestAiSuggestion } from '../../services/aiAssist';
import {
  getAiRunApi,
  getAiRunsApi,
  triggerFlowManualApi,
  getFlowApi,
  getFlowProviderStatusesApi
} from '../../services/backendApi';
import { useNotice } from '../../contexts/NoticeContext';
import FlowBuilderHeader from './components/FlowBuilderHeader';
import NodeLibraryPanel from './components/NodeLibraryPanel';
import TemplateLibraryPanel from './components/TemplateLibraryPanel';
import TemplateLibraryModal from './components/TemplateLibraryModal';
import FlowInfoPanel from './components/FlowInfoPanel';
import VariableMappingModal from './components/VariableMappingModal';
import AiGeneratorModal from './components/AiGeneratorModal';
import NodeConfigDrawer from './components/NodeConfigDrawer';
import RunDetailInspector from './components/RunDetailInspector';
import FlowRunHistoryPanel from './components/FlowRunHistoryPanel';
import CustomNode from './components/nodes/CustomNode';
import FrameNode from './components/nodes/FrameNode';
import NoteNode from './components/nodes/NoteNode';

import { createNode } from './data/nodeLibrary';
import flowRepository from './utils/flowRepository';
import flowDraftRepository from './utils/flowDraftRepository';
import { buildFlowSpec, validateFlowSpec } from './utils/flowSpec';
import { ingestFlowSource } from './utils/flowIngestion';
import { mutateFlowGraph } from './utils/flowMutation';
import { orchestrateFlowIntent } from './orchestration/alphaFlowOrchestrator';
import { generateFlowFromIntent } from './utils/flowGenerationService';
import { createDocumentationNoteNodes, getDefaultNoteStyle } from './utils/documentationNotes';
import { getStoredCustomTemplates, saveStoredCustomTemplate } from './utils/templateLibraryStore';
import { TM } from '../../utils/text';

// Node type registry
const nodeTypes = {
  trigger: CustomNode,
  action: CustomNode,
  logic: CustomNode,
  webhook: CustomNode,
  socket: CustomNode,
  frame: FrameNode,
  note: NoteNode,
};

const EDGE_DASH_PATTERN = '8 6';

const createClientRunId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `flow-run-${crypto.randomUUID()}`;
  }
  return `flow-run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getStepNodeId = (step) => {
  const parameters = step?.parameters && typeof step.parameters === 'object' ? step.parameters : {};
  const nodeId = parameters.node_id || parameters.nodeId || step?.id;
  return typeof nodeId === 'string' ? nodeId.trim() : '';
};

const buildExecutionVisualState = (run) => {
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const runStatus = String(run?.status || '').toLowerCase();
  const currentNodeId = String(run?.currentNodeId || run?.current_node_id || '').trim();
  const processingNodeIds = new Set();
  const activeTargetNodeIds = new Set();
  const runtimeActive = runStatus === 'executing';

  steps.forEach((step) => {
    const nodeId = getStepNodeId(step);
    const stepStatus = String(step?.status || '').toLowerCase();
    if (!nodeId) return;
    if (runtimeActive && (stepStatus === 'success' || stepStatus === 'skipped' || stepStatus === 'executing')) {
      activeTargetNodeIds.add(nodeId);
    }
    if (runtimeActive && stepStatus === 'executing') {
      processingNodeIds.add(nodeId);
    }
  });

  if (runtimeActive && currentNodeId) {
    processingNodeIds.add(currentNodeId);
    activeTargetNodeIds.add(currentNodeId);
  }

  return {
    isRuntimeActive: runtimeActive && activeTargetNodeIds.size > 0,
    processingNodeIds,
    activeTargetNodeIds,
  };
};

const normalizeEdge = (edge, isActive = false) => ({
  ...edge,
  animated: false,
  className: [edge?.className, 'flow-edge', isActive ? 'flow-edge--active' : 'flow-edge--idle'].filter(Boolean).join(' '),
  style: {
    ...(edge?.style || {}),
    stroke: isActive ? '#34d399' : 'var(--color-accent)',
    strokeWidth: isActive ? 2.5 : 2,
    strokeDasharray: EDGE_DASH_PATTERN,
    filter: 'none',
  },
});

const normalizeEdges = (edges, activeTargetNodeIds = new Set(), isRuntimeActive = false) => {
  if (!edges || !Array.isArray(edges)) return [];
  return edges.map((edge) => normalizeEdge(edge, isRuntimeActive && activeTargetNodeIds.has(edge.target)));
};

const getDocumentationNoteSourceId = (noteNode, flowNodeIds = new Set()) => {
  const explicitSourceId = String(noteNode?.data?.sourceNodeId || '').trim();
  if (explicitSourceId && flowNodeIds.has(explicitSourceId)) {
    return explicitSourceId;
  }

  const noteId = String(noteNode?.id || '');
  if (!noteId.startsWith('doc-note-')) {
    return '';
  }

  for (const flowNodeId of flowNodeIds) {
    if (noteId.startsWith(`doc-note-${flowNodeId}-`)) {
      return flowNodeId;
    }
  }

  return '';
};

const layoutNodesLeftToRight = (nodes, edges) => {
  if (!nodes || nodes.length === 0) return nodes;
  const lockedNodes = nodes.filter((node) => node.type === 'frame' || node.type === 'note');
  const flowNodes = nodes.filter((node) => node.type !== 'frame' && node.type !== 'note');
  if (flowNodes.length === 0) return nodes;

  const adj = new Map();
  const inDeg = new Map();
  flowNodes.forEach((node) => {
    adj.set(node.id, []);
    inDeg.set(node.id, 0);
  });

  edges.forEach((edge) => {
    if (!adj.has(edge.source) || !inDeg.has(edge.target)) return;
    adj.get(edge.source).push(edge.target);
    inDeg.set(edge.target, (inDeg.get(edge.target) || 0) + 1);
  });

  const depth = new Map();
  const queue = [];
  inDeg.forEach((deg, id) => {
    if (deg === 0) {
      depth.set(id, 0);
      queue.push(id);
    }
  });

  while (queue.length > 0) {
    const id = queue.shift();
    const currentDepth = depth.get(id) ?? 0;
    (adj.get(id) || []).forEach((next) => {
      const nextDepth = Math.max(depth.get(next) ?? 0, currentDepth + 1);
      depth.set(next, nextDepth);
      inDeg.set(next, (inDeg.get(next) || 0) - 1);
      if (inDeg.get(next) === 0) queue.push(next);
    });
  }

  let maxDepth = 0;
  depth.forEach((value) => { if (value > maxDepth) maxDepth = value; });
  flowNodes.forEach((node, index) => {
    if (!depth.has(node.id)) {
      depth.set(node.id, maxDepth + 1 + index);
    }
  });

  const columns = new Map();
  flowNodes.forEach((node) => {
    const d = depth.get(node.id) || 0;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d).push(node);
  });

  const xGap = 130;
  const yGap = 95;
  const xOffset = 120;
  const yOffset = 120;

  const nextNodes = flowNodes.map((node) => ({ ...node }));
  const nodeIndex = new Map(nextNodes.map((node) => [node.id, node]));
  Array.from(columns.keys()).sort((a, b) => a - b).forEach((col) => {
    const colNodes = columns.get(col) || [];
    colNodes.forEach((node, i) => {
      const target = nodeIndex.get(node.id);
      if (target) {
        target.position = {
          x: xOffset + col * xGap,
          y: yOffset + i * yGap,
        };
      }
    });
  });

  const positionedNodes = new Map(nextNodes.map((node) => [node.id, node]));
  const flowNodeIds = new Set(nextNodes.map((node) => node.id));
  lockedNodes.forEach((node) => {
    const anchoredSourceId = node.type === 'note' ? getDocumentationNoteSourceId(node, flowNodeIds) : '';
    if (anchoredSourceId) {
      const anchorNode = positionedNodes.get(anchoredSourceId);
      const noteWidth = Number(node?.data?.width || node?.style?.width || 228);
      const nextPosition = {
        x: (anchorNode?.position?.x || 0) - Math.round((noteWidth - 72) / 2),
        y: (anchorNode?.position?.y || 0) + 110,
      };
      positionedNodes.set(node.id, {
        ...node,
        position: nextPosition,
      });
      return;
    }
    positionedNodes.set(node.id, { ...node });
  });

  return nodes.map((node) => positionedNodes.get(node.id) || { ...node });
};

const normalizeRunInspector = (result, meta = {}) => {
  if (!result) return null;

  const steps = Array.isArray(result.steps) ? result.steps : [];
  const stepStartedAt = steps.map((step) => step?.startedAt).filter(Boolean);
  const stepCompletedAt = steps.map((step) => step?.completedAt).filter(Boolean);

  return {
    runId: result.runId || meta.runId || null,
    status: result.status || meta.status || 'unknown',
    triggerType: meta.triggerType || result.triggerType || 'manualTrigger',
    startedAt: stepStartedAt[0] || meta.startedAt || null,
    finishedAt: stepCompletedAt[stepCompletedAt.length - 1] || meta.finishedAt || null,
    currentNodeId: result.currentNodeId || result.current_node_id || meta.currentNodeId || null,
    error: result.error || meta.error || null,
    steps: steps.map((step, index) => ({
      id: step?.id || `step-${index + 1}`,
      intent: step?.intent || 'action',
      nodeLabel: step?.parameters?.node_label || step?.parameters?.nodeLabel || step?.label || step?.id || `Step ${index + 1}`,
      status: step?.status || 'unknown',
      startedAt: step?.startedAt || null,
      completedAt: step?.completedAt || null,
      error: step?.error || null,
      output: step?.output || null,
      parameters: step?.parameters || null,
      data: step?.data || null,
      raw: step || null,
    })),
    raw: result,
  };
};

const getRunContextPayload = (run) => (run?.metadata && typeof run.metadata === 'object' && run.metadata.context && typeof run.metadata.context === 'object'
  ? run.metadata.context
  : {});

const deriveRunError = (run) => {
  if (!run) return null;
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const failedStep = steps.find((step) => step?.error);
  return failedStep?.error || (String(run.status || '').toLowerCase() === 'failed' ? run.result || null : null);
};

const deriveRunTriggerType = (run) => {
  const context = getRunContextPayload(run);
  return context?.trigger_event?.type || run?.triggerType || run?.intent || 'manualTrigger';
};

const buildRerunContext = (run, flowRecord) => {
  const source = getRunContextPayload(run);
  let nextContext = {};
  try {
    nextContext = JSON.parse(JSON.stringify(source || {}));
  } catch {
    nextContext = {};
  }
  [
    'trigger_event',
    'manual_trigger',
    'flow',
    'flow_id',
    'flowId',
    'flow_name',
    'flowName',
    'step_count',
    'agent_chain',
  ].forEach((key) => {
    delete nextContext[key];
  });
  Object.keys(nextContext).forEach((key) => {
    if (key.startsWith('_')) {
      delete nextContext[key];
    }
  });
  nextContext.flow_id = flowRecord?.id || null;
  nextContext.flow_name = flowRecord?.name || 'Untitled Flow';
  return nextContext;
};

const FlowBuilder = ({ flowId = null, action = null, intent = null, onFlowContextChange = null, onSelectForAgents = null, onExit }) => {
  const { showNotice } = useNotice();
  const getCssVar = (name, fallback = '') => {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };
  const reactFlowWrapper = useRef(null);
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });

  // Flow state
  const [flow, setFlow] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  // System-managed flow lock — blocks structural mutations only
  const isSystemManaged = flow?.metadata?.deploymentManaged === true;

  // Check if flow is editable: NOT system-managed, AND (NOT template-derived OR is internal template copy)
  // Template-derived flows from internal templates can be edited
  const isTemplateDerivedFlow = Boolean(flow?.metadata?.sourceTemplateId || flow?.metadata?.createdFromTemplate);
  const isFromInternalTemplate = flow?.metadata?.templateSource === 'internal';
  const canEditFlow = !isSystemManaged && (!isTemplateDerivedFlow || isFromInternalTemplate);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // Config UI state
  const [selectedNode, setSelectedNode] = useState(null);
  const [showNodeConfig, setShowNodeConfig] = useState(false);
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [leftPanelTab, setLeftPanelTab] = useState('nodes');
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState('details');
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showNoteEditModal, setShowNoteEditModal] = useState(false);
  const [noteEditingNode, setNoteEditingNode] = useState(null);
  const [noteEditDraft, setNoteEditDraft] = useState({ label: 'Note', note: '', color: getCssVar('--note-default-color', '#111827') });
  const [noteDraft, setNoteDraft] = useState({ label: 'Note', note: '', color: getCssVar('--note-default-color', '#111827') });
  const [stickerDraft, setStickerDraft] = useState({ label: 'Frame', note: '', color: '#1f2937' });
  const [showHistory, setShowHistory] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [validationResult, setValidationResult] = useState({ blockers: [], warnings: [] });
  const [edgeMenu, setEdgeMenu] = useState(null);
  const [nodeMenu, setNodeMenu] = useState(null);
  const [edgeFilterModal, setEdgeFilterModal] = useState(null);
  const [providerStatuses, setProviderStatuses] = useState({});
  const [lastAddedPosition, setLastAddedPosition] = useState({ x: 240, y: 220 });
  const [nodeModalTab, setNodeModalTab] = useState('general');
  const [nodeConfigDraft, setNodeConfigDraft] = useState({});
  const [nodeConfigRaw, setNodeConfigRaw] = useState('');
  const [nodeConfigRawError, setNodeConfigRawError] = useState('');
  const [assistTarget, setAssistTarget] = useState('');
  const [assistError, setAssistError] = useState('');

  // Template & Mapping state
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingTemplate, setMappingTemplate] = useState(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [customTemplates, setCustomTemplates] = useState([]);

  // Terminal state
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [isRunningFlow, setIsRunningFlow] = useState(false);
  const [liveExecutionRunId, setLiveExecutionRunId] = useState('');
  const [latestRunDetail, setLatestRunDetail] = useState(null);
  const [compareRunDetail, setCompareRunDetail] = useState(null);
  const [flowRunHistory, setFlowRunHistory] = useState([]);
  const [flowRunHistoryLoading, setFlowRunHistoryLoading] = useState(false);
  const [flowRunHistoryError, setFlowRunHistoryError] = useState('');
  const [historyInspectingRunId, setHistoryInspectingRunId] = useState('');
  const [historyComparingRunId, setHistoryComparingRunId] = useState('');
  const [historyRerunningRunId, setHistoryRerunningRunId] = useState('');

  // Terminal logging helper
  const logToTerminal = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [...prev.slice(-99), { timestamp, message, type }]);
  }, []);

  useEffect(() => {
    setCustomTemplates(getStoredCustomTemplates());
  }, []);

  const [miniMapNodeColors] = useState(() => ({
    trigger: getCssVar('--node-trigger', '#10b981'),
    action: getCssVar('--node-action', '#f8fafc'),
    logic: getCssVar('--node-logic', '#d97706'),
    webhook: getCssVar('--node-webhook', '#ea580c'),
    socket: getCssVar('--node-socket', '#15803d'),
    input: getCssVar('--node-input', '#b91c1c'),
    agent: getCssVar('--node-agent', '#06b6d4'),
    media: getCssVar('--node-media', '#7c3aed'),
    default: '#94a3b8',
  }));

  const buildFlowAssistText = useCallback((kind, overrides = {}) => {
    const flowName = flow?.name || 'Untitled Flow';
    const selectedLabel = overrides.label || selectedNode?.data?.label || 'this node';
    switch (kind) {
      case 'node-description':
        return `${selectedLabel} handles one clean step inside ${flowName}. Document the trigger, the payload it expects, and the exact output it should hand to the next node.`;
      case 'trigger-description':
        return `When ${(overrides.event || nodeConfigDraft.event || 'the selected event')} fires, normalize the important fields, score urgency, and push forward only the context the next action needs.`;
      case 'action-configuration': {
        const actionType = overrides.actionType || nodeConfigDraft.actionType || 'send_email';
        const configByAction = {
          send_email: { channel: 'email', objective: 'Deliver a concise follow-up', tone: 'helpful and direct', requiredFields: ['subject', 'body', 'owner'] },
          send_sms: { channel: 'sms', objective: 'Send a short action-first reminder', tone: 'brief and clear', requiredFields: ['message', 'owner'] },
          store_data: { channel: 'storage', objective: 'Persist normalized payload', requiredFields: ['target_table', 'fields'] },
          create_task: { channel: 'task', objective: 'Create a follow-up task', requiredFields: ['title', 'owner', 'due_in_hours'] },
          verify_email: { email: '{{contact.email}}', contactId: '{{contact.id}}', mode: 'quick', writeback: true },
          verify_email_bulk: { contactIds: ['{{contact.id}}'], emails: [], mode: 'power', writeback: true },
          generate_script: { topic: '{{trigger.payload.topic}}', tone: 'clear', duration: '10 minutes', context: 'Prospect-facing episode outline', provider: 'stub-script' },
          generate_run_of_show: { topic: '{{trigger.payload.topic}}', duration: '30 minutes', context: 'Live production', provider: 'stub-run-of-show' },
          generate_transcript_intelligence: { transcriptText: '{{previous.transcriptText}}', assetId: '{{previous.assetId}}', sourceUrl: '{{previous.sourceUrl}}', metadata: {} },
          generate_voice: { text: '{{previous.artifact.script_text}}', voice: 'Rachel', style: 'conversational', provider: 'elevenlabs_tts' },
          text_to_speech: { text: '{{previous.artifact.script_text}}', voice: 'Rachel', style: 'conversational', provider: 'elevenlabs_tts' },
          generate_thumbnail: { title: '{{trigger.payload.title}}', subtitle: 'Campaign cut', image: 'Bold studio backdrop', prompt: 'Create a bold thumbnail for the launch episode.', provider: 'stub-render' },
          generate_video: { templateId: 'promo-clip-v1', outputTarget: 'crm.contact', provider: 'stub-render', script: 'Create a short follow-up recap video for {{contact.name}}.' },
          transcribe_media: { sourceType: 'asset', sourceRef: '{{previous.assetId}}', provider: 'elevenlabs_scribe', diarization: true, timestamps: true },
          ingest_meeting_artifacts: { meetingProvider: 'zoom', meetingRef: '{{booking.meeting_id}}', attachTarget: 'crm.contact', transcriptText: 'Speaker 1: Meeting summary goes here.' },
          publish_asset: { publishTarget: 'internal.media', assetRef: '' },
        };
        return JSON.stringify(configByAction[actionType] || configByAction.send_email, null, 2);
      }
      case 'logic-condition': {
        const logicType = overrides.logicType || nodeConfigDraft.logicType || 'if_then';
        if (logicType === 'delay') return 'Wait 30 minutes before continuing, unless the contact has replied or the stage has already advanced.';
        if (logicType === 'filter') return 'Continue only if lead_score >= 70, a valid email is present, and the contact is not closed-lost.';
        if (logicType === 'wait_for_verification') return JSON.stringify({ taskId: '{{previous.taskId}}', timeoutSeconds: 60, pollInterval: 5 }, null, 2);
        if (logicType === 'verification_branch') return 'Use outgoing edge filters set to valid, risky, invalid, or unknown. Source should usually be previous.';
        return 'If intent contains "demo" or lead_score >= 75, route to sales. Otherwise send to nurture and create a review task.';
      }
      case 'payload-map':
        return JSON.stringify({ contactEmail: '{{trigger.payload.email}}', contactName: '{{trigger.payload.name}}', stage: '{{crm.contact.pipeline_stage}}', owner: '{{crm.contact.owner}}' }, null, 2);
      case 'headers':
        return JSON.stringify({ 'Content-Type': 'application/json', 'X-AIO-Flow': flowName, Authorization: 'Bearer {{global.API_TOKEN}}' }, null, 2);
      case 'general':
        return 'Objective: explain what this node should accomplish.\nInput: note the incoming data.\nDecision: define the logic or transformation.\nOutput: describe the payload or side effect expected next.';
      case 'raw-config':
        return JSON.stringify({ summary: `AI scaffold for ${selectedLabel}`, objective: 'Capture the intended node behavior before finalizing config.', notes: ['confirm payload shape', 'confirm owner routing', 'confirm retries'] }, null, 2);
      case 'note':
        return { label: 'AI Brief', note: `Goal: ${flowName}\nSignal: define the operator intent.\nRisk: capture where this automation can fail.\nNext step: record the next action or dependency.` };
      case 'edge-filter':
        return 'lead_score >= 70 AND pipeline_stage != "Closed Lost" AND contact_email != ""';
      default:
        return '';
    }
  }, [flow?.name, nodeConfigDraft.actionType, nodeConfigDraft.event, nodeConfigDraft.logicType, selectedNode?.data?.label]);

  const requestFlowAssist = useCallback(async (kind, overrides = {}) => {
    const keyByKind = {
      'node-description': { surface: 'flow-node', field: 'node-description', currentValue: selectedNode?.data?.description || '' },
      'trigger-description': { surface: 'flow-node', field: 'description', currentValue: nodeConfigDraft.description || '' },
      'action-configuration': { surface: 'flow-node', field: 'configuration', currentValue: nodeConfigDraft.configuration || '' },
      'logic-condition': { surface: 'flow-node', field: 'condition', currentValue: nodeConfigDraft.condition || '' },
      'payload-map': { surface: 'flow-node', field: 'payloadMap', currentValue: nodeConfigDraft.payloadMap || '' },
      headers: { surface: 'flow-node', field: 'headers', currentValue: nodeConfigDraft.headers || '' },
      general: { surface: 'flow-node', field: 'general', currentValue: nodeConfigDraft.general || '' },
      'raw-config': { surface: 'flow-node', field: 'raw-config', currentValue: nodeConfigRaw || '' },
      note: { surface: 'flow-note', field: 'note', currentValue: noteDraft.note || noteEditDraft.note || '' },
      'edge-filter': { surface: 'edge-filter', field: 'filters', currentValue: edgeFilterModal?.data?.filters || '' },
    };
    const mapped = keyByKind[kind] || { surface: 'flow-node', field: kind, currentValue: '' };
    const context = {
      flowName: flow?.name || 'Untitled Flow',
      selected_label: overrides.label || selectedNode?.data?.label || 'this node',
      actionType: overrides.actionType || nodeConfigDraft.actionType || 'send_email',
      logicType: overrides.logicType || nodeConfigDraft.logicType || 'if_then',
      triggerEvent: overrides.event || nodeConfigDraft.event || 'the selected event',
    };
    return requestAiSuggestion({
      module: 'flows',
      surface: mapped.surface,
      field: mapped.field,
      currentValue: mapped.currentValue,
      context,
      fallback: () => buildFlowAssistText(kind, overrides),
    });
  }, [buildFlowAssistText, edgeFilterModal?.data?.filters, flow?.name, nodeConfigDraft.actionType, nodeConfigDraft.condition, nodeConfigDraft.configuration, nodeConfigDraft.description, nodeConfigDraft.event, nodeConfigDraft.general, nodeConfigDraft.headers, nodeConfigDraft.logicType, nodeConfigDraft.payloadMap, nodeConfigRaw, noteDraft.note, noteEditDraft.note, selectedNode?.data?.description, selectedNode?.data?.label]);

  const applyNodeAssist = useCallback(async (field) => {
    setAssistError('');
    setAssistTarget(`node:${field}`);
    if (field === 'node-description') {
      try {
        const suggestion = await requestFlowAssist('node-description');
        setSelectedNode((prev) => ({ ...prev, data: { ...prev.data, description: suggestion } }));
        return;
      } catch (error) {
        setAssistError(error.message || 'Unable to draft flow content right now.');
        return;
      } finally {
        setAssistTarget('');
      }
    }
    if (field === 'raw-config') {
      try {
        const suggestion = await requestFlowAssist('raw-config');
        setNodeConfigRaw(suggestion);
        setNodeConfigRawError('');
        setNodeModalTab('advanced');
        return;
      } catch (error) {
        setAssistError(error.message || 'Unable to draft flow content right now.');
        return;
      } finally {
        setAssistTarget('');
      }
    }
    const assistMap = {
      description: 'trigger-description',
      configuration: 'action-configuration',
      condition: 'logic-condition',
      payloadMap: 'payload-map',
      headers: 'headers',
      general: 'general',
    };
    const kind = assistMap[field];
    if (!kind) {
      setAssistTarget('');
      return;
    }
    try {
      const suggestion = await requestFlowAssist(kind);
      setNodeConfigDraft((prev) => ({ ...prev, [field]: suggestion }));
    } catch (error) {
      setAssistError(error.message || 'Unable to draft flow content right now.');
    } finally {
      setAssistTarget('');
    }
  }, [requestFlowAssist]);

  const applyFlowHelper = useCallback(() => {
    setAssistError('');
    setAssistTarget('header');
    if (selectedNode) {
      setShowNodeModal(true);
      setNodeModalTab('config');
      if (selectedNode.type === 'trigger') applyNodeAssist('description');
      else if (selectedNode.type === 'action') applyNodeAssist('configuration');
      else if (selectedNode.type === 'logic') applyNodeAssist('condition');
      else if (selectedNode.type === 'webhook' || selectedNode.data?.isSocket) applyNodeAssist('payloadMap');
      else applyNodeAssist('general');
      return;
    }
    setLeftPanelOpen(true);
    setLeftPanelTab('nodes');
    setAssistTarget('');
  }, [applyNodeAssist, selectedNode]);

  const applyNoteAssist = useCallback(async (mode = 'new') => {
    try {
      setAssistError('');
      setAssistTarget(`note:${mode}`);
      const suggestion = await requestFlowAssist('note');
      if (mode === 'edit') {
        setNoteEditDraft((prev) => ({ ...prev, label: prev.label || 'AI Brief', note: suggestion }));
        return;
      }
      setNoteDraft((prev) => ({ ...prev, label: prev.label || 'AI Brief', note: suggestion }));
    } catch (error) {
      setAssistError(error.message || 'Unable to draft flow note right now.');
    } finally {
      setAssistTarget('');
    }
  }, [requestFlowAssist]);

  const createGhostStarterNode = () => ({
    id: 'ghost-starter',
    type: 'trigger',
    position: { x: 132, y: 360 },
    data: {
      label: 'Add your first ...',
      description: '',
      typeLabel: '',
      nodeColor: 'trigger',
      iconName: 'Plus',
      isGhost: true,
    },
    sourcePosition: 'right',
    targetPosition: 'left',
  });

  const getViewportPlacement = useCallback((offset = { x: 0, y: 0 }) => {
    if (reactFlowWrapper.current && reactFlowInstance) {
      const rect = reactFlowWrapper.current.getBoundingClientRect();
      return reactFlowInstance.screenToFlowPosition({
        x: rect.left + (rect.width / 2) + (offset.x || 0),
        y: rect.top + (rect.height / 2) + (offset.y || 0),
      });
    }
    return {
      x: 320 + (offset.x || 0),
      y: 220 + (offset.y || 0),
    };
  }, [reactFlowInstance]);

  // Initialize flow on mount
  useEffect(() => {
    const initFlow = async () => {
      try {
        let flowData;
        if (flowId) {
          // Load existing flow
          flowData = await flowRepository.getFlowById(flowId);
          if (!flowData) {
            console.warn(`Flow ${flowId} not found, creating new`);
            flowData = await flowRepository.createNewFlow();
          }
        } else {
          // Create new flow
          flowData = await flowRepository.createNewFlow();
        }

        setFlow(flowData);
        if (flowData?.id && flowData.id !== flowId) {
          onFlowContextChange?.({ flowId: flowData.id, action: null, intent: null });
        }

        // 0. Dynamic Flow Generation (Alpha Orchestration Layer)
        if (action === 'create_dynamic_flow' && intent) {
          const alphaPlan = orchestrateFlowIntent(intent);
          if (alphaPlan.approved) {
            console.log('[FlowBuilder] Alpha Approved Intent:', alphaPlan.normalizedIntent);
            // This will internally call flowDraftRepository.saveDraft + setActiveDraft
            await generateFlowFromIntent(alphaPlan);
          } else {
            console.warn('[FlowBuilder] Alpha Rejected Intent:', alphaPlan.reason);
            logToTerminal(`Alpha rejected intent: ${alphaPlan.reason}`, 'error');
          }
        }

        // 1. Initial Load Ingress (Saved)
        const initialResult = ingestFlowSource({
          nodes: flowData.nodes || [],
          edges: flowData.edges || [],
          source: 'saved'
        });

        // 2. Draft Ingress (Priority)
        const activeDraft = await flowDraftRepository.getActiveDraft();
        if (activeDraft && (!flowId || !flowData?.metadata?.sourceDraftId)) {
          const draftResult = ingestFlowSource({
            nodes: activeDraft.draftSpec?.nodes || activeDraft.nodes || [],
            edges: activeDraft.draftSpec?.edges || activeDraft.edges || [],
            source: 'draft'
          });

          if (draftResult.validation.blockers.length === 0) {
            // Rule: Ghost logic based ONLY on ingested result length
            if (draftResult.nodes.length > 0) {
              setNodes(layoutNodesLeftToRight(draftResult.nodes, draftResult.edges));
              setEdges(normalizeEdges(draftResult.edges));
            } else {
              setNodes([createGhostStarterNode()]);
              setEdges([]);
            }
            setFlow({
              ...flowData,
              name: activeDraft.intentSummary || flowData.name,
              metadata: { ...flowData.metadata, sourceDraftId: activeDraft.id },
            });
            await flowDraftRepository.clearActiveDraft();
          } else {
            // Fallback to initialResult
            if (initialResult.validation.blockers.length === 0 && initialResult.nodes.length > 0) {
              setNodes(layoutNodesLeftToRight(initialResult.nodes, initialResult.edges));
              setEdges(normalizeEdges(initialResult.edges));
            } else {
              setNodes([createGhostStarterNode()]);
              setEdges([]);
            }
          }
        } else {
          // Normal hydration
          if (initialResult.validation.blockers.length === 0 && initialResult.nodes.length > 0) {
            setNodes(layoutNodesLeftToRight(initialResult.nodes, initialResult.edges));
            setEdges(normalizeEdges(initialResult.edges));
          } else {
            setNodes([createGhostStarterNode()]);
            setEdges([]);
          }
        }
        setIsDirty(false);

        // Fetch provider connection statuses for flow nodes
        if (flowData?.id) {
          try {
            const statuses = await getFlowProviderStatusesApi(flowData.id);
            setProviderStatuses(statuses?.providers || {});
          } catch (e) {
            console.warn('Could not load provider statuses:', e);
          }
        }
      } catch (error) {
        console.error('Failed to initialize flow:', error);
      } finally {
        setLoading(false);
      }
    };

    initFlow();
  }, [action, flowId, intent, onFlowContextChange, setNodes, setEdges]);

  // Handle edge connection
  const onConnect = useCallback(
    (params) => {
      const sourceNode = nodes.find((node) => node.id === params.source);
      const targetNode = nodes.find((node) => node.id === params.target);
      const sourceIsGhost = sourceNode?.data?.isGhost;
      const targetIsGhost = targetNode?.data?.isGhost;
      const sourceIsFrame = sourceNode?.type === 'frame';
      const targetIsFrame = targetNode?.type === 'frame';
      if (sourceIsGhost || targetIsGhost || sourceIsFrame || targetIsFrame) return;

      // Rule: Use mutateFlowGraph for internal connectivity
      const result = mutateFlowGraph(nodes, edges, {
        type: 'CONNECT_EDGE',
        payload: { connection: params }
      });

      if (result.validation.blockers.length === 0) {
        setEdges(normalizeEdges(result.edges));
        setIsDirty(true);
      } else {
        console.error('Connection blocked by validation:', result.validation.blockers);
      }
    },
    [setEdges, nodes, edges]
  );


  const handleLibraryAdd = useCallback((nodeTemplate) => {
    if (!nodeTemplate) return;
    const base = lastAddedPosition || { x: 240, y: 220 };
    const offset = { x: 140, y: 20 };
    const position = {
      x: base.x + offset.x,
      y: base.y + offset.y,
    };

    // Rule: Use mutateFlowGraph for runtime additions
    const result = mutateFlowGraph(nodes, edges, {
      type: 'ADD_NODE',
      payload: { nodeTemplate, position }
    }, isSystemManaged);

    if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
    if (result.validation.blockers.length === 0) {
      setNodes(result.nodes);
      setLastAddedPosition(position);
      setIsDirty(true);
    }
  }, [lastAddedPosition, nodes, edges, setNodes, isSystemManaged]);


  const handleLibraryAddAtViewport = useCallback((nodeTemplate) => {
    if (!nodeTemplate) return;
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const padding = 80;
    const screenX = rect.left + padding;
    const screenY = rect.bottom - padding;
    const position = reactFlowInstance?.screenToFlowPosition({ x: screenX, y: screenY }) || { x: 0, y: 0 };

    // Rule: Use mutateFlowGraph for runtime additions
    const result = mutateFlowGraph(nodes, edges, {
      type: 'ADD_NODE',
      payload: { nodeTemplate, position }
    }, isSystemManaged);

    if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
    if (result.validation.blockers.length === 0) {
      setNodes(result.nodes);
      setLastAddedPosition(position);
      setIsDirty(true);
    }
  }, [reactFlowInstance, nodes, edges, setNodes, isSystemManaged]);


  const handleDeleteSelectedNode = useCallback(() => {
    if (!selectedNode || selectedNode?.data?.isGhost) return;
    const nodeId = selectedNode.id;

    // Rule: Use mutateFlowGraph for internal deletions (Prevents orphans)
    const result = mutateFlowGraph(nodes, edges, {
      type: 'DELETE_NODE',
      payload: { nodeId }
    }, isSystemManaged);

    if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
    if (result.validation.blockers.length === 0) {
      setNodes(result.nodes);
      setEdges(normalizeEdges(result.edges));
      setSelectedNode(null);
      setIsDirty(true);
    }
  }, [selectedNode, nodes, edges, setNodes, setEdges, isSystemManaged]);

  // Handle drag over canvas
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle drop from node library
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      console.log('[onDrop] Event received', event.dataTransfer.types);

      const nodeDataStr = event.dataTransfer.getData('nodeData');
      if (!nodeDataStr) {
        console.log('[onDrop] No nodeData found');
        return;
      }

      try {
        const nodeTemplate = JSON.parse(nodeDataStr);
        console.log('[onDrop] Node template:', nodeTemplate.id, nodeTemplate.type);
        
        const position = reactFlowInstance?.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }) || { x: 0, y: 0 };

        console.log('[onDrop] Position:', position);

        // Rule: Use mutateFlowGraph for runtime drop
        const result = mutateFlowGraph(nodes, edges, {
          type: 'ADD_NODE',
          payload: { nodeTemplate, position }
        }, !canEditFlow);

        if (result?.__blocked) { 
          console.warn('Cannot add nodes: flow is not editable'); 
          return; 
        }
        
        if (result.validation.blockers.length === 0) {
          setNodes(result.nodes);
          setIsDirty(true);
        } else {
          console.log('Add node blocked:', result.validation.blockers);
        }
      } catch (error) {
        console.error('Failed to drop node:', error);
      }
    },
    [reactFlowInstance, nodes, edges, setNodes, canEditFlow]
  );

  // Handle node click (select for config)
  const onNodeClick = useCallback((event, node) => {
    if (node?.data?.isGhost) {
      setLeftPanelOpen(true);
      setLeftPanelTab('nodes');
      return;
    }
    setSelectedNode(node);
    // Panel should ONLY open on dbl clk now
  }, []);

  const onNodeDragStart = useCallback((event, node) => {
    setSelectedNode(node);
    // Panel should ONLY open on dbl clk now
  }, []);

  const onNodeDoubleClick = useCallback((event, node) => {
    if (node?.type === 'note') {
      setNoteEditingNode(node);
      setNoteEditDraft({
        label: node?.data?.label || 'Note',
        note: node?.data?.note || '',
        color: node?.data?.color || '#111827',
      });
      setShowNoteEditModal(true);
      return;
    }
    setSelectedNode(node);
    setNodeConfigDraft(node?.data?.config || {});
    setRightPanelOpen(true);
  }, [setSelectedNode, setRightPanelOpen, setShowNoteEditModal, setNoteEditDraft, setNoteEditingNode]);

  const onNodeContextMenu = useCallback(
    (event, node) => {
      event.preventDefault();
      if (node?.data?.isGhost) return;
      setNodeMenu({
        id: node.id,
        node,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [setNodeMenu]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setRightPanelOpen(false);
  }, []);

  const onEdgeClick = useCallback(() => {
    setRightPanelOpen(true);
  }, []);


  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setEdgeMenu({
      edge,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  // Handle node config save
  const handleConfigSave = useCallback(
    (nodeId, config) => {
      // Rule: Use mutateFlowGraph for runtime config updates
      const result = mutateFlowGraph(nodes, edges, {
        type: 'UPDATE_NODE_CONFIG',
        payload: { nodeId, config }
      }, isSystemManaged);

      if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
      if (result.validation.blockers.length === 0) {
        setNodes(result.nodes);
        setIsDirty(true);
        setShowNodeConfig(false);
        setShowNodeModal(false);
      } else {
        console.error('Config save blocked by validation:', result.validation.blockers);
      }
    },
    [nodes, edges, setNodes, isSystemManaged]
  );

  const applyDraftToCanvas = useCallback((draft) => {
    if (!draft) return;

    // Rule: Strict gating for external draft sources
    const result = ingestFlowSource({
      nodes: draft.draftSpec?.nodes || [],
      edges: draft.draftSpec?.edges || [],
      source: 'draft'
    });

    if (result.validation.blockers.length === 0) {
      if (result.nodes.length > 0) {
        setNodes(layoutNodesLeftToRight(result.nodes, result.edges));
        setEdges(normalizeEdges(result.edges));
      } else {
        setNodes([createGhostStarterNode()]);
        setEdges([]);
      }
      setFlow((prev) => ({
        ...prev,
        name: draft.intentSummary || prev?.name,
        metadata: { ...prev?.metadata, sourceDraftId: draft.id },
      }));
      setIsDirty(true);
    } else {
      console.error('Draft ingestion blocked by validation:', result.validation.blockers);
    }
  }, [setNodes, setEdges]);

  const insertFormTrigger = useCallback((form) => {
    if (!form) return;
    const position = reactFlowInstance?.screenToFlowPosition({
      x: 240,
      y: 200,
    }) || { x: 200, y: 200 };

    // Rule: Use mutateFlowGraph for runtime additions
    const result = mutateFlowGraph(nodes, edges, {
      type: 'ADD_NODE',
      payload: {
        nodeTemplate: {
          id: `form-${form.id}`,
          type: 'trigger',
          label: `${form.name} Form`,
          description: 'Form submission trigger',
          iconName: 'FileText',
          nodeColor: 'trigger',
        },
        position
      }
    }, isSystemManaged);

    if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
    if (result.validation.blockers.length === 0) {
      setNodes(result.nodes);
      setIsDirty(true);
    } else {
      console.error('Form trigger insertion blocked by validation:', result.validation.blockers);
    }
  }, [reactFlowInstance, nodes, edges, setNodes, isSystemManaged]);

  const applyTemplate = useCallback((template) => {
    if (!template) return;

    // Check if mapping is needed
    if (template.placeholders && template.placeholders.length > 0) {
      setMappingTemplate(template);
      setShowMappingModal(true);
      return;
    }

    // Direct injection if no placeholders
    injectTemplateToCanvas(template);
  }, []);

  const openNodeLibrary = useCallback(() => {
    setLeftPanelOpen(true);
    setLeftPanelTab('nodes');
  }, []);

  const injectTemplateToCanvas = useCallback((template, mappings = {}) => {
    // Rule: Strict gating for external template sources
    const result = ingestFlowSource(template, { source: 'template', mappings });

    if (result.validation.blockers.length > 0) {
      console.error('Template injection blocked by validation:', result.validation.blockers);
      return;
    }

    setNodes((nds) => {
      const sanitized = nds.filter(n => !n.data?.isGhost);
      return [...sanitized, ...result.nodes];
    });
    setEdges((eds) => normalizeEdges([...eds, ...result.edges]));
    setIsDirty(true);

    setShowMappingModal(false);
    setMappingTemplate(null);
  }, [setNodes, setEdges]);


  const getSanitizedGraph = useCallback(() => {
    const sanitizedNodes = nodes.filter((node) => !node.data?.isGhost);
    const sanitizedNodeIds = new Set(sanitizedNodes.map((node) => node.id));
    const sanitizedEdges = edges.filter(
      (edge) => sanitizedNodeIds.has(edge.source) && sanitizedNodeIds.has(edge.target)
    );
    return { sanitizedNodes, sanitizedEdges };
  }, [nodes, edges]);

  const collectValidation = useCallback(() => {
    const { sanitizedNodes, sanitizedEdges } = getSanitizedGraph();
    const spec = buildFlowSpec({ flow, nodes: sanitizedNodes, edges: sanitizedEdges });
    return validateFlowSpec(spec);
  }, [flow, getSanitizedGraph]);

  const pushValidationToTerminal = useCallback((prefix, result) => {
    if (!result) return;
    result.blockers.forEach((message) => logToTerminal(`${prefix}: ${message}`, 'error'));
    result.warnings.forEach((message) => logToTerminal(`${prefix}: ${message}`, 'warning'));
    if (result.blockers.length || result.warnings.length) {
      setTerminalOpen(true);
    }
  }, [logToTerminal]);

  const buildPersistableFlow = useCallback(({ asNew = false } = {}) => {
    if (!flow) return null;

    const { sanitizedNodes, sanitizedEdges } = getSanitizedGraph();
    const spec = buildFlowSpec({ flow, nodes: sanitizedNodes, edges: sanitizedEdges });
    const result = validateFlowSpec(spec);
    setValidationResult(result);

    const now = new Date().toISOString();
    const resolvedName = String(flow.name || 'Untitled Flow').trim() || 'Untitled Flow';
    const nextMetadata = {
      ...(flow.metadata || {}),
      nodeCount: sanitizedNodes.length,
    };

    if (asNew) {
      const originTemplateId = nextMetadata.sourceTemplateId || null;
      const originTemplateName = nextMetadata.sourceTemplateName || null;
      const originTemplateCategory = nextMetadata.sourceTemplateCategory || null;
      delete nextMetadata.sourceTemplateId;
      delete nextMetadata.sourceTemplateName;
      delete nextMetadata.sourceTemplateCategory;
      delete nextMetadata.createdFromTemplate;
      if (originTemplateId) nextMetadata.originTemplateId = originTemplateId;
      if (originTemplateName) nextMetadata.originTemplateName = originTemplateName;
      if (originTemplateCategory) nextMetadata.originTemplateCategory = originTemplateCategory;
      if (flow.id) nextMetadata.duplicatedFromFlowId = flow.id;
    }

    return {
      result,
      updatedFlow: {
        ...flow,
        ...(asNew ? { id: undefined, createdAt: now, status: 'Draft' } : {}),
        name: asNew ? `${resolvedName} Copy` : resolvedName,
        nodes: sanitizedNodes,
        edges: sanitizedEdges,
        spec,
        updatedAt: now,
        lastEditedBy: 'Current User',
        metadata: nextMetadata,
      },
    };
  }, [flow, getSanitizedGraph]);

  const blockTemplateDerivedSave = useCallback((actionLabel = 'Save') => {
    const templateName = flow?.metadata?.sourceTemplateName || 'the source template';
    const message = actionLabel === 'Run'
      ? `Run blocked. Save ${templateName}-based work as a new flow first.`
      : `In-place save is locked for ${templateName}-based flows. Use Save As New.`;
    logToTerminal(message, 'warning');
    showNotice({ type: 'warning', message });
  }, [flow?.metadata?.sourceTemplateName, logToTerminal, showNotice]);

  useEffect(() => {
    if (!flow) return;
    setValidationResult(collectValidation());
  }, [flow, nodes, edges, collectValidation]);

  // Handle save flow
  const handleSaveFlow = useCallback(async () => {
    if (!flow) return;
    if (isTemplateDerivedFlow) {
      blockTemplateDerivedSave('Save');
      return;
    }

    const preparedFlow = buildPersistableFlow();
    if (!preparedFlow) return;
    const { result, updatedFlow } = preparedFlow;
    if (result.blockers.length > 0) {
      pushValidationToTerminal('Save blocked', result);
      showNotice({ type: 'error', message: 'Save blocked. Review the validation messages in the terminal.' });
      return;
    }

    try {
      const savedFlow = await flowRepository.saveFlow(updatedFlow);
      const persistedFlow = savedFlow || updatedFlow;
      setFlow(persistedFlow);
      if (persistedFlow?.id) {
        onFlowContextChange?.({ flowId: persistedFlow.id, action: null, intent: null });
      }
      setIsDirty(false);
      showNotice({ type: 'success', message: `Saved ${persistedFlow?.name || updatedFlow.name}.` });
      if (result.warnings.length > 0) {
        pushValidationToTerminal('Saved with warnings', result);
      } else {
        logToTerminal(`Saved flow ${persistedFlow?.name || updatedFlow.name}.`, 'success');
      }
    } catch (error) {
      console.error('Failed to save flow:', error);
      logToTerminal(`Save failed: ${error.message || 'Unknown error.'}`, 'error');
      showNotice({ type: 'error', message: error.message || 'Save failed.' });
      setTerminalOpen(true);
    }
  }, [blockTemplateDerivedSave, buildPersistableFlow, flow, isTemplateDerivedFlow, logToTerminal, onFlowContextChange, pushValidationToTerminal, showNotice]);

  const handleSaveAsNewFlow = useCallback(async () => {
    if (!flow) return;

    const preparedFlow = buildPersistableFlow({ asNew: true });
    if (!preparedFlow) return;
    const { result, updatedFlow } = preparedFlow;
    if (result.blockers.length > 0) {
      pushValidationToTerminal('Save As New blocked', result);
      showNotice({ type: 'error', message: 'Save As New blocked. Review the validation messages in the terminal.' });
      return;
    }

    try {
      const savedFlow = await flowRepository.saveFlow(updatedFlow);
      const persistedFlow = savedFlow || updatedFlow;
      setFlow(persistedFlow);
      if (persistedFlow?.id) {
        onFlowContextChange?.({ flowId: persistedFlow.id, action: null, intent: null });
      }
      setIsDirty(false);
      showNotice({ type: 'success', message: `Saved new flow ${persistedFlow?.name || updatedFlow.name}.` });
      logToTerminal(`Saved new flow ${persistedFlow?.name || updatedFlow.name}.`, 'success');
      if (result.warnings.length > 0) {
        pushValidationToTerminal('Saved as new with warnings', result);
      }
    } catch (error) {
      console.error('Failed to save flow as new:', error);
      logToTerminal(`Save As New failed: ${error.message || 'Unknown error.'}`, 'error');
      showNotice({ type: 'error', message: error.message || 'Save As New failed.' });
      setTerminalOpen(true);
    }
  }, [buildPersistableFlow, flow, logToTerminal, onFlowContextChange, pushValidationToTerminal, showNotice]);

  const handleCreateNewFlow = useCallback(async () => {
    try {
      const createdFlow = await flowRepository.createNewFlow();
      if (createdFlow?.id) {
        onFlowContextChange?.({ flowId: createdFlow.id, action: null, intent: null });
      }
      showNotice({ type: 'success', message: `Opened new flow ${createdFlow?.name || 'Untitled Flow'}.` });
    } catch (error) {
      console.error('Failed to create new flow:', error);
      logToTerminal(`New flow failed: ${error.message || 'Unknown error.'}`, 'error');
      showNotice({ type: 'error', message: error.message || 'Unable to create a new flow.' });
    }
  }, [logToTerminal, onFlowContextChange, showNotice]);

  const persistCurrentFlow = useCallback(async ({ silentSuccess = false } = {}) => {
    if (!flow) return null;
    if (isTemplateDerivedFlow) {
      blockTemplateDerivedSave('Run');
      return null;
    }

    const preparedFlow = buildPersistableFlow();
    if (!preparedFlow) return null;
    const { result, updatedFlow } = preparedFlow;
    if (result.blockers.length > 0) {
      pushValidationToTerminal('Run blocked', result);
      showNotice({ type: 'error', message: 'Run blocked. Review the validation messages in the terminal.' });
      return null;
    }

    const savedFlow = await flowRepository.saveFlow(updatedFlow);
    const persistedFlow = savedFlow || updatedFlow;
    setFlow(persistedFlow);
    if (persistedFlow?.id) {
      onFlowContextChange?.({ flowId: persistedFlow.id, action: null, intent: null });
    }
    setIsDirty(false);
    if (!silentSuccess) {
      if (result.warnings.length > 0) {
        pushValidationToTerminal('Saved with warnings', result);
      } else {
        logToTerminal(`Saved flow ${persistedFlow?.name || updatedFlow.name}.`, 'success');
        showNotice({ type: 'success', message: `Saved ${persistedFlow?.name || updatedFlow.name}.` });
      }
    }
    return persistedFlow;
  }, [blockTemplateDerivedSave, buildPersistableFlow, flow, isTemplateDerivedFlow, logToTerminal, onFlowContextChange, pushValidationToTerminal, showNotice]);

  const logFlowRunResult = useCallback((result) => {
    if (!result) return;

    const runId = result.runId || 'unknown-run';
    const runStatus = result.status || 'unknown';
    const validation = result.validation || { blockers: [], warnings: [] };
    logToTerminal(`Run ${runId} finished with status ${runStatus}.`, runStatus === 'success' ? 'success' : 'info');
    validation.warnings?.forEach((warning) => logToTerminal(`Run warning: ${warning}`, 'warning'));

    (Array.isArray(result.steps) ? result.steps : []).forEach((step) => {
      const intent = step?.intent || step?.id || 'step';
      const stepStatus = step?.status || 'unknown';
      logToTerminal(
        `${intent}: ${stepStatus}`,
        stepStatus === 'success' ? 'success' : stepStatus === 'failed' || stepStatus === 'error' ? 'error' : 'info'
      );
      if (step?.error) {
        logToTerminal(`${intent} error: ${step.error}`, 'error');
      }
      const data = step?.data && typeof step.data === 'object' ? step.data : {};
      const job = data.job && typeof data.job === 'object' ? data.job : null;
      const scribeWork = (data.scribeWork || data.transcript_job) && typeof (data.scribeWork || data.transcript_job) === 'object' ? (data.scribeWork || data.transcript_job) : null;
      const artifact = data.artifact && typeof data.artifact === 'object' ? data.artifact : null;
      const scribeArtifact = (data.scribeArtifact || data.transcript_artifact) && typeof (data.scribeArtifact || data.transcript_artifact) === 'object' ? (data.scribeArtifact || data.transcript_artifact) : null;
      const assets = Array.isArray(data.assets) ? data.assets : [];

      if (job?.id) {
        logToTerminal(`created ${job.kind || 'media job'} ${job.id} (${job.status || 'unknown'})`, 'info');
      }
      if (scribeWork?.id) {
        logToTerminal(`created scribe work ${scribeWork.id} (${scribeWork.status || 'unknown'})`, 'info');
      }
      if (artifact?.id) {
        logToTerminal(`artifact created: ${artifact.id}`, 'info');
      }
      if (scribeArtifact?.id) {
        logToTerminal(`artifact created: ${scribeArtifact.id}`, 'info');
      }
      assets.forEach((asset) => {
        if (asset?.id) {
          logToTerminal(`asset created: ${asset.id}`, 'info');
        }
      });
    });
  }, [logToTerminal]);

  const loadFlowRunHistory = useCallback(async (targetFlowId = flow?.id) => {
    if (!targetFlowId) {
      setFlowRunHistory([]);
      setFlowRunHistoryError('');
      return;
    }
    setFlowRunHistoryLoading(true);
    setFlowRunHistoryError('');
    try {
      const runs = await getAiRunsApi(100, targetFlowId);
      setFlowRunHistory(Array.isArray(runs) ? runs.slice(0, 8) : []);
    } catch (error) {
      setFlowRunHistory([]);
      setFlowRunHistoryError(error.message || 'Unable to load stored flow runs.');
    } finally {
      setFlowRunHistoryLoading(false);
    }
  }, [flow?.id]);

  useEffect(() => {
    if (!flow?.id) {
      setFlowRunHistory([]);
      setFlowRunHistoryError('');
      return;
    }
    loadFlowRunHistory(flow.id);
  }, [flow?.id, loadFlowRunHistory]);

  // Fetch provider connection statuses when flow loads
  useEffect(() => {
    if (!flow?.id) return;
    getFlowProviderStatusesApi(flow.id)
      .then((data) => setProviderStatuses(data?.providers || {}))
      .catch(() => setProviderStatuses({}));
  }, [flow?.id]);

  // Inject provider connection status into provider-dependent nodes
  useEffect(() => {
    if (!Object.keys(providerStatuses).length) return;
    const PROVIDER_NODE_INTENTS = new Set(['publish_asset', 'generate_postbot_content', 'postbot_content']);
    setNodes((currentNodes) => currentNodes.map((node) => {
      const config = node.data?.config || {};
      const intent = node.data?.intent || config?.intent || '';
      if (!PROVIDER_NODE_INTENTS.has(intent)) return node;
      let providerKey = config?.publishTarget || config?.publish_target || '';
      if (providerKey && providerKey !== 'internal.media' && providerKey !== 'local') {
        const status = providerStatuses[providerKey];
        if (status && status !== 'connected') {
          return { ...node, data: { ...node.data, providerStatus: status, providerKey } };
        }
      }
      const platforms = config?.targetPlatforms || config?.target_platforms || [];
      for (const plat of platforms) {
        const status = providerStatuses[String(plat).toLowerCase()];
        if (status && status !== 'connected') {
          return { ...node, data: { ...node.data, providerStatus: status, providerKey: String(plat).toLowerCase() } };
        }
      }
      return node;
    }));
  }, [providerStatuses, setNodes]);

  const resetExecutionVisuals = useCallback(() => {
    setNodes((currentNodes) => currentNodes.map((node) => ({
      ...node,
      data: {
        ...(node.data || {}),
        isProcessing: false,
        isCompleted: false,
      },
    })));
    setEdges((currentEdges) => normalizeEdges(currentEdges));
  }, [setEdges, setNodes]);

  const applyExecutionVisuals = useCallback((run) => {
    const executionState = buildExecutionVisualState(run);
    setNodes((currentNodes) => currentNodes.map((node) => ({
      ...node,
      data: {
        ...(node.data || {}),
        isProcessing: executionState.processingNodeIds.has(node.id),
        isCompleted: false,
      },
    })));
    setEdges((currentEdges) => normalizeEdges(currentEdges, executionState.activeTargetNodeIds, executionState.isRuntimeActive));
  }, [setEdges, setNodes]);

  useEffect(() => {
    if (!liveExecutionRunId || !isRunningFlow) return undefined;

    let cancelled = false;
    let timeoutId = null;

    const pollLiveRun = async () => {
      try {
        const storedRun = await getAiRunApi(liveExecutionRunId);
        if (cancelled || !storedRun) return;

        setLatestRunDetail(normalizeRunInspector(storedRun, {
          triggerType: deriveRunTriggerType(storedRun),
          startedAt: storedRun.createdAt || storedRun.created_at || null,
          finishedAt: storedRun.updatedAt || storedRun.updated_at || null,
          error: deriveRunError(storedRun),
          currentNodeId: storedRun.currentNodeId || storedRun.current_node_id || null,
        }));
        applyExecutionVisuals(storedRun);
      } catch {
        // The run may not exist yet on the first poll cycle.
      } finally {
        if (!cancelled) {
          timeoutId = setTimeout(pollLiveRun, 450);
        }
      }
    };

    pollLiveRun();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [applyExecutionVisuals, isRunningFlow, liveExecutionRunId]);

  const inspectStoredRun = useCallback(async (historyRun) => {
    if (!historyRun?.id) return;
    setHistoryInspectingRunId(historyRun.id);
    try {
      const storedRun = await getAiRunApi(historyRun.id);
      if (!storedRun) {
        throw new Error('Stored run not found.');
      }
      setLatestRunDetail(normalizeRunInspector(storedRun, {
        triggerType: deriveRunTriggerType(storedRun),
        startedAt: storedRun.createdAt || storedRun.created_at || historyRun.createdAt || historyRun.created_at || null,
        finishedAt: storedRun.updatedAt || storedRun.updated_at || historyRun.updatedAt || historyRun.updated_at || null,
        error: deriveRunError(storedRun),
        currentNodeId: storedRun.currentNodeId || storedRun.current_node_id || null,
      }));
      applyExecutionVisuals(storedRun);
    } catch (error) {
      logToTerminal(`Inspect run failed: ${error.message || 'Unknown error.'}`, 'error');
      setTerminalOpen(true);
    } finally {
      setHistoryInspectingRunId('');
    }
  }, [applyExecutionVisuals, logToTerminal]);

  const compareStoredRun = useCallback(async (historyRun) => {
    if (!historyRun?.id) return;
    if (compareRunDetail?.runId === historyRun.id) {
      setCompareRunDetail(null);
      return;
    }
    setHistoryComparingRunId(historyRun.id);
    try {
      const storedRun = await getAiRunApi(historyRun.id);
      if (!storedRun) {
        throw new Error('Stored run not found.');
      }
      setCompareRunDetail(normalizeRunInspector(storedRun, {
        triggerType: deriveRunTriggerType(storedRun),
        startedAt: storedRun.createdAt || storedRun.created_at || historyRun.createdAt || historyRun.created_at || null,
        finishedAt: storedRun.updatedAt || storedRun.updated_at || historyRun.updatedAt || historyRun.updated_at || null,
        error: deriveRunError(storedRun),
        currentNodeId: storedRun.currentNodeId || storedRun.current_node_id || null,
      }));
    } catch (error) {
      logToTerminal(`Compare run failed: ${error.message || 'Unknown error.'}`, 'error');
      setTerminalOpen(true);
    } finally {
      setHistoryComparingRunId('');
    }
  }, [compareRunDetail?.runId, logToTerminal]);

  const handleRunFlow = useCallback(async () => {
    if (!flow || isRunningFlow) return;
    setTerminalOpen(true);
    setIsRunningFlow(true);
    resetExecutionVisuals();
    const runStartedAt = new Date().toISOString();
    const runId = createClientRunId();
    setLiveExecutionRunId(runId);
    setLatestRunDetail(normalizeRunInspector({
      runId,
      status: 'executing',
      steps: [],
    }, {
      triggerType: 'manual_trigger',
      startedAt: runStartedAt,
      currentNodeId: null,
    }));
    try {
      const persistedFlow = await persistCurrentFlow({ silentSuccess: true });
      if (!persistedFlow?.id) {
        resetExecutionVisuals();
        setLatestRunDetail(null);
        return;
      }

      logToTerminal(`Starting manual run for ${persistedFlow.name || 'Untitled Flow'}...`, 'info');
      const result = await triggerFlowManualApi(persistedFlow.id, {
        command: `Manual run for flow ${persistedFlow.name || 'Untitled Flow'}`,
        context: {
          flowId: persistedFlow.id,
          flowName: persistedFlow.name || 'Untitled Flow',
        },
        runId,
      });
      setLatestRunDetail(normalizeRunInspector(result, {
        triggerType: 'manual_trigger',
        startedAt: runStartedAt,
        finishedAt: new Date().toISOString(),
        currentNodeId: result?.currentNodeId || result?.current_node_id || null,
      }));
      setCompareRunDetail(null);
      applyExecutionVisuals(result);
      logFlowRunResult(result);
      await loadFlowRunHistory(persistedFlow.id);
    } catch (error) {
      resetExecutionVisuals();
      setLatestRunDetail(normalizeRunInspector({
        runId: null,
        status: 'failed',
        error: error.message || 'Unknown error.',
        steps: [],
      }, {
        triggerType: 'manual_trigger',
        startedAt: runStartedAt,
        finishedAt: new Date().toISOString(),
        error: error.message || 'Unknown error.',
      }));
      setCompareRunDetail(null);
      logToTerminal(`Run failed: ${error.message || 'Unknown error.'}`, 'error');
    } finally {
      setLiveExecutionRunId('');
      setIsRunningFlow(false);
      setTerminalOpen(true);
    }
  }, [applyExecutionVisuals, flow, isRunningFlow, loadFlowRunHistory, logFlowRunResult, logToTerminal, persistCurrentFlow, resetExecutionVisuals]);

  const rerunStoredRun = useCallback(async (historyRun) => {
    if (!flow || isRunningFlow || !historyRun?.id) return;
    setTerminalOpen(true);
    setIsRunningFlow(true);
    setHistoryRerunningRunId(historyRun.id);
    resetExecutionVisuals();
    const runStartedAt = new Date().toISOString();
    const runId = createClientRunId();
    setLiveExecutionRunId(runId);
    try {
      const persistedFlow = await persistCurrentFlow({ silentSuccess: true });
      if (!persistedFlow?.id) {
        resetExecutionVisuals();
        return;
      }
      const command = historyRun.command_text || `Rerun for flow ${persistedFlow.name || 'Untitled Flow'}`;
      logToTerminal(`Rerunning stored execution ${historyRun.id} for ${persistedFlow.name || 'Untitled Flow'}...`, 'info');
      const result = await triggerFlowManualApi(persistedFlow.id, {
        command,
        context: buildRerunContext(historyRun, persistedFlow),
        runId,
      });
      setLatestRunDetail(normalizeRunInspector(result, {
        triggerType: deriveRunTriggerType(historyRun),
        startedAt: runStartedAt,
        finishedAt: new Date().toISOString(),
        currentNodeId: result?.currentNodeId || result?.current_node_id || null,
      }));
      setCompareRunDetail(null);
      applyExecutionVisuals(result);
      logFlowRunResult(result);
      await loadFlowRunHistory(persistedFlow.id);
    } catch (error) {
      resetExecutionVisuals();
      setLatestRunDetail(normalizeRunInspector({
        runId: null,
        status: 'failed',
        error: error.message || 'Unknown error.',
        steps: [],
      }, {
        triggerType: deriveRunTriggerType(historyRun),
        startedAt: runStartedAt,
        finishedAt: new Date().toISOString(),
        error: error.message || 'Unknown error.',
      }));
      setCompareRunDetail(null);
      logToTerminal(`Rerun failed: ${error.message || 'Unknown error.'}`, 'error');
    } finally {
      setHistoryRerunningRunId('');
      setLiveExecutionRunId('');
      setIsRunningFlow(false);
      setTerminalOpen(true);
    }
  }, [applyExecutionVisuals, flow, isRunningFlow, loadFlowRunHistory, logFlowRunResult, logToTerminal, persistCurrentFlow, resetExecutionVisuals]);

  const handleSaveAsTemplate = useCallback(() => {
    const { sanitizedNodes, sanitizedEdges } = getSanitizedGraph();

    // Detect placeholders (any string inside {{}})
    const placeholders = new Set();
    sanitizedNodes.forEach(node => {
      const configStr = JSON.stringify(node.data.config || {});
      const matches = configStr.match(/{{[a-zA-Z0-9_]+}}/g);
      if (matches) matches.forEach(m => placeholders.add(m));
    });

    const newTemplate = {
      id: `custom-${Date.now()}`,
      name: `${flow?.name || 'Untitled'} Template`,
      description: `User-created template from ${flow?.name || 'Untitled Flow'}.`,
      category: 'Automation',
      iconName: 'Layers',
      complexity: 'Intermediate',
      nodes: sanitizedNodes.map(n => ({
        id: n.id.split('-')[0],
        type: n.type,
        position: n.position,
        data: { label: n.data.label, iconName: n.data.iconName }
      })),
      edges: sanitizedEdges.map(e => ({
        ...e,
        id: e.id.split('-')[0],
        source: e.source.split('-')[0],
        target: e.target.split('-')[0]
      })),
      placeholders: Array.from(placeholders)
    };

    const nextTemplates = saveStoredCustomTemplate(newTemplate);
    setCustomTemplates(nextTemplates);
    showNotice({ type: 'success', message: 'Flow saved as a reusable template.' });
  }, [flow, getSanitizedGraph, showNotice]);

  // Handle toggle flow status
  const handleToggleStatus = useCallback(async () => {
    if (!flow) return;
    if (isTemplateDerivedFlow) {
      blockTemplateDerivedSave('Activation');
      return;
    }
    if (flow.status === 'Active') {
      setShowDeactivateModal(true);
      return;
    }
    const { sanitizedNodes, sanitizedEdges } = getSanitizedGraph();
    const spec = buildFlowSpec({ flow, nodes: sanitizedNodes, edges: sanitizedEdges });
    const result = validateFlowSpec(spec);
    setValidationResult(result);
    if (result.blockers.length > 0 || result.warnings.length > 0) {
      pushValidationToTerminal('Activation check', result);
    }
    setShowActivateModal(true);
  }, [blockTemplateDerivedSave, flow, getSanitizedGraph, isTemplateDerivedFlow, pushValidationToTerminal]);

  const confirmActivate = useCallback(() => {
    if (!flow) return;
    const { sanitizedNodes, sanitizedEdges } = getSanitizedGraph();
    const spec = buildFlowSpec({ flow, nodes: sanitizedNodes, edges: sanitizedEdges });
    const updatedFlow = {
      ...flow,
      status: 'Active',
      updatedAt: new Date().toISOString(),
      spec,
    };
    flowRepository.saveFlow(updatedFlow)
      .then((savedFlow) => {
        setFlow(savedFlow || updatedFlow);
        setIsDirty(false);
        logToTerminal(`Activated flow ${updatedFlow.name || 'Untitled Flow'}.`, 'success');
      })
      .catch((error) => {
        logToTerminal(`Activation failed: ${error.message || 'Unknown error.'}`, 'error');
        setTerminalOpen(true);
      });
    setShowActivateModal(false);
  }, [flow, nodes, edges, getSanitizedGraph, logToTerminal]);

  const confirmDeactivate = useCallback(() => {
    if (!flow) return;
    const updatedFlow = {
      ...flow,
      status: 'Draft',
      updatedAt: new Date().toISOString(),
    };
    flowRepository.saveFlow(updatedFlow)
      .then((savedFlow) => {
        setFlow(savedFlow || updatedFlow);
        setIsDirty(false);
        logToTerminal(`Deactivated flow ${updatedFlow.name || 'Untitled Flow'}.`, 'success');
      })
      .catch((error) => {
        logToTerminal(`Deactivate failed: ${error.message || 'Unknown error.'}`, 'error');
        setTerminalOpen(true);
      });
    setShowDeactivateModal(false);
  }, [flow, logToTerminal]);

  // Handle flow metadata update
  const handleFlowUpdate = useCallback(
    (updates) => {
      const updatedFlow = {
        ...flow,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      setFlow(updatedFlow);
      setIsDirty(true);
    },
    [flow]
  );

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--node-action)] border-transparent border-t-[var(--node-action)] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-text-primary)]">Loading Flow Builder...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="module-root-standard relative w-full bg-[var(--color-bg-primary)] font-sans">
      <style>{`
        .flow-controls button {
          width: 28px !important;
          height: 28px !important;
          background: var(--color-bg-secondary) !important;
          border: 1px solid var(--color-border) !important;
          border-radius: 9999px !important;
          color: var(--color-text-secondary) !important;
          margin: 0 2px !important;
        }
        .flow-controls button:hover {
          background: var(--color-hover) !important;
          border-color: var(--color-primary) !important;
          color: var(--color-text-primary) !important;
        }
        .flow-controls button svg {
          max-width: 14px !important;
          max-height: 14px !important;
        }
        .sidebar-transition {
          transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .flow-control-dock {
          position: absolute;
          left: 20px;
          bottom: 20px;
          z-index: 50;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          pointer-events: none;
        }
        .flow-control-dock > * {
          pointer-events: auto;
        }
        .react-flow__minimap.flow-minimap {
          width: 200px !important;
          height: 200px !important;
          background: var(--color-bg-secondary) !important;
          border: 1px solid var(--color-border) !important;
          border-radius: 12px !important;
          margin: 0 !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
        }
        .react-flow__controls.flow-controls-buttons {
          margin: 0 !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3) !important;
          border-radius: 8px !important;
          overflow: hidden !important;
          border: 1px solid var(--color-border) !important;
          background: var(--color-bg-tertiary) !important;
        }
        .react-flow__controls.flow-controls-buttons button {
          background: var(--color-bg-secondary) !important;
          border-bottom: 1px solid var(--color-border) !important;
          color: var(--color-text-primary) !important;
        }
        .react-flow__controls.flow-controls-buttons button:hover {
          background: var(--color-hover) !important;
        }
        .react-flow__controls.flow-controls-buttons button svg {
          stroke: var(--color-text-primary) !important;
        }
        .react-flow__edge.flow-edge--idle .react-flow__edge-path,
        .react-flow__edge.flow-edge--active .react-flow__edge-path {
          stroke-linecap: round;
          stroke-dasharray: ${EDGE_DASH_PATTERN};
        }
        .react-flow__edge.flow-edge--active .react-flow__edge-path {
          animation: flow-edge-dash 0.72s linear infinite;
        }
        @keyframes flow-edge-dash {
          to {
            stroke-dashoffset: -14;
          }
        }
      `}</style>

      <FlowBuilderHeader
        flowName={flow?.name}
        status={flow?.status}
        onExit={onExit}
        onCreateNewFlow={handleCreateNewFlow}
        onToggleDetails={() => setRightPanelOpen(!rightPanelOpen)}
        isDetailsOpen={rightPanelOpen}
        onSave={handleSaveFlow}
        onSaveAsNew={handleSaveAsNewFlow}
        onBrowseTemplates={() => setShowTemplateLibrary(true)}
      />

      <div className="module-content-stage relative flex flex-col gap-1.5 overflow-hidden px-1.5 pb-1.5">
        {assistError && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-200 z-50">
            {assistError}
          </div>
        )}

      {/* Main Layout: 3 Columns */}
      <div className="module-surface-shell relative flex flex-1 overflow-hidden bg-[var(--color-bg-primary)]">

        {/* LEFT: Node & Template Library */}
        <div
          className={`sidebar-transition flex flex-col bg-[var(--color-bg-primary)] border border-[var(--color-border)]/50 rounded-xl overflow-hidden m-1 mb-2 shadow-island-sm ${leftPanelOpen ? 'w-64' : 'w-0 border-none m-0 shadow-none'}`}
        >
          <div className="flex items-center gap-1 p-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
            <button
              onClick={() => setLeftPanelTab('nodes')}
              className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${leftPanelTab === 'nodes' ? 'bg-[#1a1d21] text-white shadow-sm border border-white/10' : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)]'}`}
            >
              Nodes
            </button>
            <button
              onClick={() => setLeftPanelTab('templates')}
              className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${leftPanelTab === 'templates' ? 'bg-[#1a1d21] text-white shadow-sm border border-white/10' : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)]'}`}
            >
              Templates
            </button>
          </div>

          <div className="p-2 border-b border-[var(--color-border)] px-3">
            <button
              onClick={() => setShowAiModal(true)}
              className="btn-secondary w-full flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-[10px] font-black uppercase tracking-widest"
            >
              <Target className="w-3.5 h-3.5 text-sky-400" />
              AI Generate Flow
            </button>
          </div>
          <div className="flex-1 overflow-y-auto crm-scroll-hidden">
            {leftPanelTab === 'nodes' ? (
              <NodeLibraryPanel
                embedded
                onAddNode={handleLibraryAdd}
                onAddNodeAtViewport={handleLibraryAddAtViewport}
              />
            ) : (
              <TemplateLibraryPanel
                onApplyTemplate={applyTemplate}
                onPreviewTemplate={(template) => console.log('Preview:', template)}
                customTemplates={customTemplates}
              />
            )}
          </div>
        </div>

        {/* CENTER: Canvas Wrapper */}
        <div className="flex-1 relative overflow-hidden bg-[var(--color-bg-primary)]" ref={reactFlowWrapper}>



          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(instance) => {
              setReactFlowInstance(instance);
              viewportRef.current = instance.getViewport();
            }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onNodeDragStart={onNodeDragStart}
            onPaneClick={onPaneClick}
            onEdgeClick={onEdgeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeContextMenu={onNodeContextMenu}
            onMoveEnd={(evt, viewport) => { viewportRef.current = viewport; }}
            onEdgeContextMenu={onEdgeContextMenu}
            nodeTypes={nodeTypes}
            fitView={!nodes.some(n => n.data?.isGhost)}
            connectionRadius={40}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
              style: {
                stroke: 'var(--color-accent)',
                strokeWidth: 2,
                strokeDasharray: EDGE_DASH_PATTERN,
                filter: 'none',
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: 'var(--color-accent)',
              },
              label: '\u2699',
              labelStyle: { fill: 'rgba(148,163,184,0.7)', fontSize: 12 },
              labelBgStyle: { fill: 'transparent' },
              labelBgPadding: [0, 0],
            }}
            snapToGrid={true}
            snapGrid={[8, 8]}
          >
            {/* Grid points hidden per request, snapping active at 8px for tactile feedback */}

            {/* Minimap Removed as per user request */}
            <div className="flow-control-dock">
              <Controls showInteractive={false} showFitView={true} className="flow-controls-buttons" />
            </div>
          </ReactFlow>
        </div>

        {/* RIGHT: Inspector Panel */}
        <div
          className={`sidebar-transition flex flex-col bg-[var(--color-bg-primary)] border border-[var(--color-border)]/50 rounded-xl overflow-hidden m-1 mb-2 shadow-island-sm ${rightPanelOpen ? 'w-[340px]' : 'w-0 border-none m-0 shadow-none'}`}
        >
          <div className="flex items-center gap-1 p-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] shrink-0">
            <button
              onClick={() => setRightPanelTab('details')}
              className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${rightPanelTab === 'details' ? 'bg-[#1a1d21] text-white shadow-sm border border-white/10' : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)]'}`}
            >
              Details
            </button>
            <button
              onClick={() => setRightPanelTab('history')}
              className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${rightPanelTab === 'history' ? 'bg-[#1a1d21] text-white shadow-sm border border-white/10' : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)]'}`}
            >
              History
            </button>
          </div>

          <div className={`flex-1 overflow-y-auto crm-scroll-hidden flex flex-col relative ${rightPanelOpen ? 'w-[340px]' : 'w-0'}`}>
            <div className={`flex-1 flex flex-col ${rightPanelTab === 'details' ? 'flex' : 'hidden'}`}>
              <FlowInfoPanel
                flow={flow}
                onFlowUpdate={handleFlowUpdate}
                onApplyDraft={applyDraftToCanvas}
                onInsertFormTrigger={insertFormTrigger}
                onSaveAsTemplate={handleSaveAsTemplate}
                showDetails={true}
              />
              <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]/50 mt-auto shrink-0 flex flex-col gap-2">
                <div className="rounded-xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.6))] px-4 py-4 text-center shadow-[0_14px_32px_rgba(2,6,23,0.28)]">
                  <div
                    className="text-[16px] font-black uppercase tracking-[0.28em] text-slate-100/90"
                    style={{ fontFamily: '"Ethnocentric", "Inter", sans-serif' }}
                  >
                    {`AIO Flows${TM}`}
                  </div>
                  <div className="mt-2 text-[8px] font-bold uppercase tracking-[0.28em] text-slate-400">
                    Builder Workspace
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-primary)]">MiniMap</span>
                <div className="w-full overflow-hidden rounded-xl border border-[var(--color-border)]">
                  <MiniMap nodeColor={(node) => miniMapNodeColors[node.data?.nodeColor] || miniMapNodeColors.default} nodeStrokeWidth={3} zoomable pannable className="!w-full !relative !bottom-auto !right-auto !h-[140px] !bg-[var(--color-bg-primary)] opacity-90 hover:opacity-100 transition-opacity !m-0" />
                </div>
              </div>
            </div>

            <div className={`h-full ${rightPanelTab === 'history' ? 'block' : 'hidden'}`}>
              <FlowRunHistoryPanel
                runs={flowRunHistory}
                loading={flowRunHistoryLoading}
                error={flowRunHistoryError}
                activeRunId={latestRunDetail?.runId || ''}
                compareRunId={compareRunDetail?.runId || ''}
                inspectingRunId={historyInspectingRunId}
                comparingRunId={historyComparingRunId}
                rerunningRunId={historyRerunningRunId}
                onInspect={inspectStoredRun}
                onCompare={compareStoredRun}
                onRerun={rerunStoredRun}
                onClose={() => setRightPanelOpen(false)}
              />
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* TOP OVERLAY: Stable Floating Controls (Moved out so it won't shift with panel) */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none w-full max-w-lg flex justify-center mt-2">
        <div className="pointer-events-auto flex items-center gap-3 bg-[var(--color-bg-secondary)]/80 backdrop-blur-md border border-[var(--color-border)] rounded-full px-4 py-1.5 shadow-2xl">
          <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-black text-amber-400 uppercase tracking-widest">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Builder Only
          </div>
          <div className="h-4 w-[1px] bg-[var(--color-border)]" />
          <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">
            <Bot className="w-3.5 h-3.5 text-sky-400" />
            Alpha Dispatch
          </div>
          <div className="h-4 w-[1px] bg-[var(--color-border)]" />
          <div className="px-2 py-1 rounded-full bg-slate-800 text-[9px] font-black text-slate-400 uppercase tracking-widest border border-white/5">
            v1.1.1 COMMS
          </div>
          <div className="h-4 w-[1px] bg-[var(--color-border)]" />
          <div
            className={`px-3 py-1 rounded-[var(--radius-pill)] text-[9px] font-black uppercase tracking-widest flex-shrink-0 border ${flow?.status === 'Active'
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-[var(--color-primary)]/15 text-[var(--color-text-secondary)] border-[var(--color-border)]'
              }`}
          >
            {flow?.status || 'Draft'}
          </div>
        </div>
      </div>

      {/* Floating Toolbar */}
      <div className="pointer-events-none absolute left-1/2 bottom-4 -translate-x-1/2 z-40 w-[min(calc(100%-2rem),fit-content)]">
        <div className="pointer-events-auto flex w-full flex-nowrap items-center justify-center gap-1.5 overflow-x-auto crm-scroll-hidden bg-[var(--color-bg-tertiary)]/90 backdrop-blur-md border border-[var(--color-border)]/50 rounded-xl px-2 py-1.5 shadow-island-sm">
          <button
            type="button"
            onClick={handleRunFlow}
            disabled={isRunningFlow}
            className={`h-8 px-4 rounded-[var(--radius-card)] text-[10px] font-bold uppercase tracking-tight flex items-center gap-2 transition-all shadow-lg ${isRunningFlow ? 'opacity-60 cursor-wait' : 'hover:brightness-110'}`}
            style={{
              background: isRunningFlow
                ? 'linear-gradient(180deg, #059669 0%, #047857 100%)'
                : 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
              border: '1px solid rgba(0,0,0,0.8)',
              borderTop: '1px solid rgba(255,255,255,0.25)',
              borderBottom: '2px solid rgba(0,0,0,0.9)',
              boxShadow: '0 4px 6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15), 0 0 12px rgba(16,185,129,0.3)',
              color: '#fff',
            }}
          >
            <Play className="w-3.5 h-3.5" />
            {isRunningFlow ? 'Running...' : 'Run Flow'}
          </button>

          <button
            type="button"
            onClick={handleSaveFlow}
            className="btn-secondary h-8 px-3 rounded-[var(--radius-card)] text-[10px] font-bold uppercase tracking-tight flex items-center gap-2 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5 text-sky-400" />
            Save
          </button>

          {onSelectForAgents ? (
            <button
              type="button"
              onClick={() => flow?.id && onSelectForAgents(flow)}
              className="btn-secondary h-8 px-3 rounded-[var(--radius-card)] text-[10px] font-bold uppercase tracking-tight text-[var(--color-primary)] whitespace-nowrap"
            >
              Use In Agents
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleToggleStatus}
            className="btn-secondary h-8 px-3 rounded-[var(--radius-card)] text-[10px] font-bold uppercase tracking-tight flex items-center gap-2"
          >
            <span>{flow?.status === 'Active' ? 'Deactivate' : 'Activate'}</span>
            <span
              className={`w-7 h-4 rounded-full border border-[var(--color-border)] relative transition-colors ${flow?.status === 'Active' ? 'bg-emerald-500' : 'bg-[var(--color-bg-secondary)]'
                }`}
            >
              <span
                className="absolute top-[1px] w-[12px] h-[12px] rounded-full bg-white transition-all shadow-sm"
                style={{ left: flow?.status === 'Active' ? '14px' : '2px' }}
              />
            </span>
          </button>

          <div className="w-[1px] h-4 bg-[var(--color-border)]/50 mx-1" />

          <button
            type="button"
            onClick={() => {
              openNodeLibrary();
            }}
            className="btn-secondary h-8 px-3 rounded-[var(--radius-card)] text-[10px] font-bold uppercase tracking-tight whitespace-nowrap"
          >
            Add Node
          </button>

          <button
            type="button"
            onClick={() => {
              setLeftPanelOpen(true);
              setLeftPanelTab('templates');
            }}
            className="btn-secondary h-8 px-3 rounded-[var(--radius-card)] text-[10px] font-bold uppercase tracking-tight whitespace-nowrap"
          >
            Templates
          </button>

          <button
            type="button"
            onClick={() => {
              const result = mutateFlowGraph(nodes, edges, { type: 'ALIGN_NODES' });
              if (result.validation.blockers.length === 0) {
                setNodes(layoutNodesLeftToRight(result.nodes, result.edges));
              }
            }}
            className="btn-secondary h-8 px-3 rounded-[var(--radius-card)] text-[10px] font-bold uppercase tracking-tight whitespace-nowrap"
          >
            Align Nodes
          </button>

          <button
            type="button"
            onClick={() => setShowNoteModal(true)}
            className="btn-secondary h-8 px-3 rounded-[var(--radius-card)] text-[10px] font-bold uppercase tracking-tight whitespace-nowrap"
          >
            Add Note
          </button>

          <div className="w-[1px] h-4 bg-[var(--color-border)]/50 mx-1" />

          <button
            type="button"
            onClick={handleDeleteSelectedNode}
            className="h-8 px-3 rounded-[var(--radius-card)] text-[10px] font-bold uppercase tracking-tight bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 transition-all flex items-center justify-center shadow-sm"
          >
            Delete node
          </button>
        </div>

        <div className="mt-3 text-[10px] text-[var(--color-text-tertiary)] text-center font-bold uppercase tracking-widest drop-shadow-md">
          {flow?.name || 'Untitled Flow'} | v{flow?.metadata?.version || 1}
        </div>
      </div>


      {/* Node Config Modal */}
      {showNodeModal && selectedNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wide">Node</p>
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                  {selectedNode.data?.label || 'Node'}
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  {selectedNode.type}
                </p>
              </div>
              <button
                onClick={() => setShowNodeModal(false)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
              >
                x
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-[var(--color-border)] mb-4">
              {['general', 'config', 'advanced'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setNodeModalTab(tab)}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors ${nodeModalTab === tab
                    ? 'border-[var(--color-primary)] text-[var(--color-text-primary)]'
                    : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                    }`}
                >
                  {tab === 'general' ? 'General' : tab === 'config' ? 'Config' : 'Advanced'}
                </button>
              ))}
            </div>

            {nodeModalTab === 'general' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">Node Name</label>
                  <input
                    value={selectedNode.data?.label || ''}
                    onChange={(e) =>
                      setSelectedNode((prev) => ({
                        ...prev,
                        data: { ...prev.data, label: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">Description</label>
                    <AIAssistButton variant="inline" onAssist={() => applyNodeAssist('node-description')} loading={assistTarget === 'node:node-description'} tooltip="Draft node description" iconType="crosshair" />
                  </div>
                  <textarea
                    value={selectedNode.data?.description || ''}
                    onChange={(e) =>
                      setSelectedNode((prev) => ({
                        ...prev,
                        data: { ...prev.data, description: e.target.value },
                      }))
                    }
                    className="w-full min-h-[80px] px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                  />
                </div>
              </div>
            )}

            {nodeModalTab === 'config' && (
              <div className="space-y-4">
                {(() => {
                  const nodeType = selectedNode.type;
                  const updateField = (field, value) => {
                    setNodeConfigDraft((prev) => ({ ...prev, [field]: value }));
                  };

                  if (nodeType === 'trigger') {
                    return (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                            Trigger Event
                          </label>
                          <select
                            value={nodeConfigDraft.event || ''}
                            onChange={(e) => updateField('event', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                          >
                            <option value="">Select event...</option>
                            <option value="form_submitted">Form Submitted</option>
                            <option value="contact_created">Contact Created</option>
                            <option value="deal_updated">Deal Updated</option>
                            <option value="scheduled">Scheduled Time</option>
                            <option value="booking_created">Booking Created</option>
                            <option value="booking_updated">Booking Updated</option>
                            <option value="booking_cancelled">Booking Cancelled</option>
                          </select>
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                              Description
                            </label>
                            <AIAssistButton variant="inline" onAssist={() => applyNodeAssist('description')} loading={assistTarget === 'node:description'} tooltip="Draft trigger behavior" iconType="crosshair" />
                          </div>
                          <textarea
                            value={nodeConfigDraft.description || ''}
                            onChange={(e) => updateField('description', e.target.value)}
                            placeholder="Describe trigger behavior..."
                            className="w-full min-h-[100px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                          />
                        </div>
                      </div>
                    );
                  }

                  if (nodeType === 'action') {
                    return (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                            Action Type
                          </label>
                          <select
                            value={nodeConfigDraft.actionType || ''}
                            onChange={(e) => updateField('actionType', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                          >
                            <option value="">Select action...</option>
                            <option value="send_email">Send Email</option>
                            <option value="send_sms">Send SMS</option>
                            <option value="store_data">Store Data</option>
                            <option value="create_task">Create Task</option>
                            <option value="create_booking">Create Booking</option>
                            <option value="update_booking">Update Booking</option>
                            <option value="cancel_booking">Cancel Booking</option>
                            <option value="get_booking">Get Booking</option>
                            <option value="verify_email">Verify Email</option>
                            <option value="verify_email_bulk">Verify Email Bulk</option>
                            <option value="generate_script">Generate Script</option>
                            <option value="generate_run_of_show">Generate Run of Show</option>
                            <option value="generate_transcript_intelligence">Transcript Intelligence</option>
                            <option value="generate_voice">Generate Voice</option>
                            <option value="text_to_speech">Text to Speech</option>
                            <option value="generate_thumbnail">Generate Thumbnail</option>
                            <option value="generate_video">Generate Video</option>
                            <option value="transcribe_media">Transcribe Media</option>
                            <option value="ingest_meeting_artifacts">Ingest Meeting Artifacts</option>
                            <option value="publish_asset">Publish Asset</option>
                          </select>
                        </div>
                        {nodeConfigDraft.actionType === 'verify_email' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Email
                              </label>
                              <input
                                type="text"
                                value={nodeConfigDraft.email || ''}
                                onChange={(e) => updateField('email', e.target.value)}
                                placeholder="{{contact.email}}"
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Contact ID
                              </label>
                              <input
                                type="text"
                                value={nodeConfigDraft.contactId || ''}
                                onChange={(e) => updateField('contactId', e.target.value)}
                                placeholder="{{contact.id}}"
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Mode
                              </label>
                              <select
                                value={nodeConfigDraft.mode || 'quick'}
                                onChange={(e) => updateField('mode', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              >
                                <option value="quick">Quick</option>
                              </select>
                            </div>
                            <div className="flex items-end">
                              <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                                <input
                                  type="checkbox"
                                  checked={Boolean(nodeConfigDraft.writeback ?? true)}
                                  onChange={(e) => updateField('writeback', e.target.checked)}
                                />
                                Write back to contact
                              </label>
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'verify_email_bulk' && (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Contact IDs
                              </label>
                              <textarea
                                value={nodeConfigDraft.contactIds || ''}
                                onChange={(e) => updateField('contactIds', e.target.value)}
                                placeholder="contact-1, contact-2"
                                className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Emails
                              </label>
                              <textarea
                                value={nodeConfigDraft.emails || ''}
                                onChange={(e) => updateField('emails', e.target.value)}
                                placeholder="lead@example.com, demo@example.com"
                                className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Mode
                                </label>
                                <select
                                  value={nodeConfigDraft.mode || 'power'}
                                  onChange={(e) => updateField('mode', e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                >
                                  <option value="power">Power</option>
                                </select>
                              </div>
                              <div className="flex items-end">
                                <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(nodeConfigDraft.writeback ?? true)}
                                    onChange={(e) => updateField('writeback', e.target.checked)}
                                  />
                                  Write back on completion
                                </label>
                              </div>
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'generate_script' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Topic
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.topic || ''}
                                  onChange={(e) => updateField('topic', e.target.value)}
                                  placeholder="Launch episode"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Tone
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.tone || ''}
                                  onChange={(e) => updateField('tone', e.target.value)}
                                  placeholder="Clear and direct"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Length
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.length || nodeConfigDraft.duration || ''}
                                  onChange={(e) => { updateField('length', e.target.value); updateField('duration', e.target.value); }}
                                  placeholder="10 minutes"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Provider
                                </label>
                                <select
                                  value={nodeConfigDraft.provider || 'stub-script'}
                                  onChange={(e) => updateField('provider', e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                >
                                  <option value="stub-script">Stub Script</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Context
                              </label>
                              <textarea
                                value={nodeConfigDraft.context || ''}
                                onChange={(e) => updateField('context', e.target.value)}
                                placeholder="Who is this for and how should the script be used?"
                                className="w-full min-h-[100px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'generate_run_of_show' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Topic
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.topic || ''}
                                  onChange={(e) => updateField('topic', e.target.value)}
                                  placeholder="Weekly production sync"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Duration
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.duration || ''}
                                  onChange={(e) => updateField('duration', e.target.value)}
                                  placeholder="30 minutes"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Context
                              </label>
                              <textarea
                                value={nodeConfigDraft.context || ''}
                                onChange={(e) => updateField('context', e.target.value)}
                                placeholder="Live production context, guests, or stage notes"
                                className="w-full min-h-[100px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'generate_transcript_intelligence' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Transcript Text
                                </label>
                                <textarea
                                  value={nodeConfigDraft.transcriptText || ''}
                                  onChange={(e) => updateField('transcriptText', e.target.value)}
                                  placeholder="{{previous.transcriptText}}"
                                  className="w-full min-h-[120px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                    Asset ID
                                  </label>
                                  <input
                                    type="text"
                                    value={nodeConfigDraft.assetId || ''}
                                    onChange={(e) => updateField('assetId', e.target.value)}
                                    placeholder="{{previous.assetId}}"
                                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                    Source URL
                                  </label>
                                  <input
                                    type="text"
                                    value={nodeConfigDraft.sourceUrl || ''}
                                    onChange={(e) => updateField('sourceUrl', e.target.value)}
                                    placeholder="{{previous.sourceUrl}}"
                                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                    Metadata JSON
                                  </label>
                                  <textarea
                                    value={typeof nodeConfigDraft.metadata === 'string' ? nodeConfigDraft.metadata : JSON.stringify(nodeConfigDraft.metadata || {}, null, 2)}
                                    onChange={(e) => updateField('metadata', e.target.value)}
                                    placeholder='{"meeting":{"title":"Weekly Sync"}}'
                                    className="w-full min-h-[90px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'generate_voice' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Voice
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.voice || ''}
                                  onChange={(e) => updateField('voice', e.target.value)}
                                  placeholder="Rachel"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Style
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.style || ''}
                                  onChange={(e) => updateField('style', e.target.value)}
                                  placeholder="Conversational"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Text or Script
                              </label>
                              <textarea
                                value={nodeConfigDraft.text || nodeConfigDraft.scriptText || ''}
                                onChange={(e) => updateField('text', e.target.value)}
                                placeholder="Use raw text or a mapped script token like {{previous.artifact.script_text}}"
                                className="w-full min-h-[120px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'text_to_speech' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Voice
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.voice || ''}
                                  onChange={(e) => updateField('voice', e.target.value)}
                                  placeholder="Rachel"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Style
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.style || ''}
                                  onChange={(e) => updateField('style', e.target.value)}
                                  placeholder="Conversational"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Text or Script
                              </label>
                              <textarea
                                value={nodeConfigDraft.text || nodeConfigDraft.scriptText || ''}
                                onChange={(e) => updateField('text', e.target.value)}
                                placeholder="Use raw text or a mapped script token like {{previous.artifact.script_text}}"
                                className="w-full min-h-[120px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'generate_thumbnail' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Title
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.title || ''}
                                  onChange={(e) => updateField('title', e.target.value)}
                                  placeholder="Episode launch"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Subtitle
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.subtitle || ''}
                                  onChange={(e) => updateField('subtitle', e.target.value)}
                                  placeholder="Campaign cut"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Background
                              </label>
                              <input
                                type="text"
                                value={nodeConfigDraft.image || ''}
                                onChange={(e) => updateField('image', e.target.value)}
                                placeholder="Bold studio backdrop"
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Prompt
                              </label>
                              <textarea
                                value={nodeConfigDraft.prompt || ''}
                                onChange={(e) => updateField('prompt', e.target.value)}
                                placeholder="Describe the thumbnail composition"
                                className="w-full min-h-[100px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'generate_video' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Template ID
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.templateId || ''}
                                  onChange={(e) => updateField('templateId', e.target.value)}
                                  placeholder="promo-clip-v1"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Output Target
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.outputTarget || ''}
                                  onChange={(e) => updateField('outputTarget', e.target.value)}
                                  placeholder="crm.contact"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Provider
                                </label>
                                <select
                                  value={nodeConfigDraft.provider || 'stub-render'}
                                  onChange={(e) => updateField('provider', e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                >
                                  <option value="stub-render">Stub Render</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Title
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.title || ''}
                                  onChange={(e) => updateField('title', e.target.value)}
                                  placeholder="Generated Video"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Script or Prompt
                              </label>
                              <textarea
                                value={nodeConfigDraft.script || ''}
                                onChange={(e) => updateField('script', e.target.value)}
                                placeholder="Create a short recap video for {{contact.name}}..."
                                className="w-full min-h-[100px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'transcribe_media' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Source Type
                                </label>
                                <select
                                  value={nodeConfigDraft.sourceType || ''}
                                  onChange={(e) => updateField('sourceType', e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                >
                                  <option value="">Select source type...</option>
                                  <option value="url">Media URL</option>
                                  <option value="asset">Media Asset</option>
                                  <option value="transcript_text">Transcript Text</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Source Ref
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.sourceRef || ''}
                                  onChange={(e) => updateField('sourceRef', e.target.value)}
                                  placeholder="{{previous.assetId}}"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Provider
                                </label>
                                <select
                                  value={nodeConfigDraft.provider || 'elevenlabs_scribe'}
                                  onChange={(e) => updateField('provider', e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                >
                                  <option value="elevenlabs_scribe">ElevenLabs Scribe</option>
                                  <option value="ffmpeg_transcribe">FFmpeg Transcribe</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Title
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.title || ''}
                                  onChange={(e) => updateField('title', e.target.value)}
                                  placeholder="Transcript Job"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Source URL
                              </label>
                              <input
                                type="text"
                                value={nodeConfigDraft.sourceUrl || ''}
                                onChange={(e) => updateField('sourceUrl', e.target.value)}
                                placeholder="https://example.com/media.mp3"
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Transcript Text
                              </label>
                              <textarea
                                value={nodeConfigDraft.transcriptText || ''}
                                onChange={(e) => updateField('transcriptText', e.target.value)}
                                placeholder="Speaker 1: Welcome to the meeting..."
                                className="w-full min-h-[100px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div className="flex flex-wrap gap-4">
                              <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                                <input
                                  type="checkbox"
                                  checked={Boolean(nodeConfigDraft.diarization)}
                                  onChange={(e) => updateField('diarization', e.target.checked)}
                                />
                                Diarization
                              </label>
                              <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                                <input
                                  type="checkbox"
                                  checked={Boolean(nodeConfigDraft.timestamps)}
                                  onChange={(e) => updateField('timestamps', e.target.checked)}
                                />
                                Timestamps
                              </label>
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'ingest_meeting_artifacts' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Meeting Provider
                                </label>
                                <select
                                  value={nodeConfigDraft.meetingProvider || ''}
                                  onChange={(e) => updateField('meetingProvider', e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                >
                                  <option value="">Select provider...</option>
                                  <option value="zoom">Zoom</option>
                                  <option value="google_meet_drive">Google Meet / Drive</option>
                                  <option value="jitsi">Jitsi (Stub)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Meeting Ref
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.meetingRef || ''}
                                  onChange={(e) => updateField('meetingRef', e.target.value)}
                                  placeholder="{{booking.meeting_id}}"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Attach Target
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.attachTarget || ''}
                                  onChange={(e) => updateField('attachTarget', e.target.value)}
                                  placeholder="crm.contact"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Meeting Title
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.meetingTitle || ''}
                                  onChange={(e) => updateField('meetingTitle', e.target.value)}
                                  placeholder="Quarterly Review"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Transcript Text
                              </label>
                              <textarea
                                value={nodeConfigDraft.transcriptText || ''}
                                onChange={(e) => updateField('transcriptText', e.target.value)}
                                placeholder="Speaker 1: Meeting summary goes here..."
                                className="w-full min-h-[100px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.actionType === 'publish_asset' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Publish Target
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.publishTarget || ''}
                                  onChange={(e) => updateField('publishTarget', e.target.value)}
                                  placeholder="internal.media"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Asset Ref
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.assetRef || ''}
                                  onChange={(e) => updateField('assetRef', e.target.value)}
                                  placeholder="{{previous.assets.0.id}}"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                              Configuration
                            </label>
                            <AIAssistButton variant="inline" onAssist={() => applyNodeAssist('configuration')} loading={assistTarget === 'node:configuration'} tooltip="Draft action configuration" iconType="crosshair" />
                          </div>
                          <textarea
                            value={nodeConfigDraft.configuration || ''}
                            onChange={(e) => updateField('configuration', e.target.value)}
                            placeholder="Enter action configuration..."
                            className="w-full min-h-[100px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                          />
                        </div>
                      </div>
                    );
                  }

                  if (nodeType === 'logic') {
                    return (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                            Logic Type
                          </label>
                          <select
                            value={nodeConfigDraft.logicType || ''}
                            onChange={(e) => updateField('logicType', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                          >
                            <option value="">Select logic...</option>
                            <option value="if_then">If/Then</option>
                            <option value="delay">Delay/Wait</option>
                            <option value="filter">Filter</option>
                            <option value="wait_for_verification">Wait for Verification</option>
                            <option value="verification_branch">Verification Branch</option>
                          </select>
                        </div>
                        {nodeConfigDraft.logicType === 'wait_for_verification' && (
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Task ID
                              </label>
                              <input
                                type="text"
                                value={nodeConfigDraft.taskId || ''}
                                onChange={(e) => updateField('taskId', e.target.value)}
                                placeholder="{{previous.taskId}}"
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Timeout (sec)
                              </label>
                              <input
                                type="number"
                                value={nodeConfigDraft.timeoutSeconds || 60}
                                onChange={(e) => updateField('timeoutSeconds', Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Poll (sec)
                              </label>
                              <input
                                type="number"
                                value={nodeConfigDraft.pollInterval || 5}
                                onChange={(e) => updateField('pollInterval', Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                          </div>
                        )}
                        {nodeConfigDraft.logicType === 'verification_branch' && (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Source
                              </label>
                              <select
                                value={nodeConfigDraft.source || 'previous'}
                                onChange={(e) => updateField('source', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              >
                                <option value="previous">Previous verification result</option>
                                <option value="contact_field">Contact verification field</option>
                                <option value="node">Specific node result</option>
                              </select>
                            </div>
                            {nodeConfigDraft.source === 'node' && (
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Source Node ID
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.sourceNodeId || ''}
                                  onChange={(e) => updateField('sourceNodeId', e.target.value)}
                                  placeholder="verify-email-..."
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            )}
                            {nodeConfigDraft.source === 'contact_field' && (
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Contact ID
                                </label>
                                <input
                                  type="text"
                                  value={nodeConfigDraft.contactId || ''}
                                  onChange={(e) => updateField('contactId', e.target.value)}
                                  placeholder="{{contact.id}}"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            )}
                            <p className="text-xs text-[var(--color-text-tertiary)]">
                              Use outgoing edge filters set to <code>valid</code>, <code>risky</code>, <code>invalid</code>, or <code>unknown</code>.
                            </p>
                          </div>
                        )}
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                              Condition
                            </label>
                            <AIAssistButton variant="inline" onAssist={() => applyNodeAssist('condition')} loading={assistTarget === 'node:condition'} tooltip="Draft logic condition" iconType="crosshair" />
                          </div>
                          <textarea
                            value={nodeConfigDraft.condition || ''}
                            onChange={(e) => updateField('condition', e.target.value)}
                            placeholder="Define logic condition..."
                            className="w-full min-h-[100px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                          />
                        </div>
                      </div>
                    );
                  }

                  if (nodeType === 'webhook' || selectedNode.data?.isSocket) {
                    return (
                      <div className="space-y-4">
                        {selectedNode.data?.isSocket && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Workflow / Scenario ID or URL
                              </label>
                              <input
                                type="text"
                                value={nodeConfigDraft.workflowRef || ''}
                                onChange={(e) => updateField('workflowRef', e.target.value)}
                                placeholder="workflow-id or https://..."
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Credential Reference
                              </label>
                              <input
                                type="text"
                                value={nodeConfigDraft.authRef || ''}
                                onChange={(e) => updateField('authRef', e.target.value)}
                                placeholder="authRef"
                                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                              />
                            </div>
                            <div>
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                                  Payload Mapping (JSON)
                                </label>
                                <AIAssistButton variant="inline" onAssist={() => applyNodeAssist('payloadMap')} loading={assistTarget === 'node:payloadMap'} tooltip="Draft payload mapping" iconType="crosshair" />
                              </div>
                              <textarea
                                value={nodeConfigDraft.payloadMap || ''}
                                onChange={(e) => updateField('payloadMap', e.target.value)}
                                placeholder='{"inputKey": "node.output"}'
                                className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] font-mono text-xs"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Timeout (ms)
                                </label>
                                <input
                                  type="number"
                                  value={nodeConfigDraft.timeout || 30000}
                                  onChange={(e) => updateField('timeout', Number(e.target.value))}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                  Retry Count
                                </label>
                                <input
                                  type="number"
                                  value={nodeConfigDraft.retryCount || 1}
                                  onChange={(e) => updateField('retryCount', Number(e.target.value))}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                                />
                              </div>
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                            Webhook URL
                          </label>
                          <input
                            type="url"
                            value={nodeConfigDraft.url || ''}
                            onChange={(e) => updateField('url', e.target.value)}
                            placeholder="https://api.example.com/endpoint"
                            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                            Method
                          </label>
                          <select
                            value={nodeConfigDraft.method || 'POST'}
                            onChange={(e) => updateField('method', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                          </select>
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                              Headers (JSON)
                            </label>
                            <AIAssistButton variant="inline" onAssist={() => applyNodeAssist('headers')} loading={assistTarget === 'node:headers'} tooltip="Draft headers JSON" iconType="crosshair" />
                          </div>
                          <textarea
                            value={nodeConfigDraft.headers || ''}
                            onChange={(e) => updateField('headers', e.target.value)}
                            placeholder='{"Content-Type": "application/json"}'
                            className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] font-mono text-xs"
                          />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                          General Configuration
                        </label>
                        <AIAssistButton variant="inline" onAssist={() => applyNodeAssist('general')} loading={assistTarget === 'node:general'} tooltip="Draft node configuration" iconType="crosshair" />
                      </div>
                      <textarea
                        value={nodeConfigDraft.general || ''}
                        onChange={(e) => updateField('general', e.target.value)}
                        placeholder="Enter node configuration..."
                        className="w-full min-h-[120px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                      />
                    </div>
                  );
                })()}
              </div>
            )}

            {nodeModalTab === 'advanced' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">
                    Raw Config (JSON)
                  </label>
                  <AIAssistButton variant="inline" onAssist={() => applyNodeAssist('raw-config')} loading={assistTarget === 'node:raw-config'} tooltip="Draft raw config JSON" iconType="crosshair" />
                </div>
                <textarea
                  value={nodeConfigRaw}
                  onChange={(e) => {
                    setNodeConfigRaw(e.target.value);
                    setNodeConfigRawError('');
                  }}
                  className="w-full min-h-[160px] px-3 py-2 rounded-lg text-xs font-mono bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                />
                {nodeConfigRawError && (
                  <p className="text-xs text-[var(--color-danger)]">{nodeConfigRawError}</p>
                )}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  if (nodeConfigRaw && nodeModalTab === 'advanced') {
                    try {
                      const parsed = JSON.parse(nodeConfigRaw);
                      setNodeConfigDraft(parsed);
                    } catch (error) {
                      setNodeConfigRawError('Invalid JSON. Please fix before saving.');
                      return;
                    }
                  }
                  if (selectedNode) {
                    // Rule: Use mutateFlowGraph for runtime config updates
                    const result = mutateFlowGraph(nodes, edges, {
                      type: 'UPDATE_NODE_CONFIG',
                      payload: {
                        nodeId: selectedNode.id,
                        config: nodeConfigDraft,
                        dataUpdates: { config: nodeConfigDraft }
                      }
                    }, isSystemManaged);
                    if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
                    if (result.validation.blockers.length === 0) {
                      setNodes(result.nodes);
                      setIsDirty(true);
                    } else {
                      console.error('Modal save blocked by validation:', result.validation.blockers);
                      pushValidationToTerminal('Node config blocked', result.validation);
                    }
                  }
                  setShowNodeModal(false);
                }}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--color-primary)] text-[var(--color-text-on-primary)] hover:bg-[var(--color-primary-hover)]"
              >
                Save
              </button>
              <button
                onClick={() => setShowNodeModal(false)}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <NodeConfigDrawer
        node={selectedNode}
        isOpen={showNodeConfig}
        onClose={() => setShowNodeConfig(false)}
        onSave={handleConfigSave}
      />

      {/* History panel successfully relocated entirely to Details dock Tab */}

      {showActivateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Activate Flow</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Review validations before activation. Runner is not enabled yet.
            </p>
            {validationResult.blockers.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[var(--color-danger)] uppercase tracking-wide mb-2">Blockers</p>
                <ul className="space-y-1 text-sm text-[var(--color-text-primary)]">
                  {validationResult.blockers.map((item) => (
                    <li key={item} className="bg-[var(--color-bg-secondary)] border border-[var(--color-danger)] rounded-md px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {validationResult.warnings.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[var(--color-warning)] uppercase tracking-wide mb-2">Warnings</p>
                <ul className="space-y-1 text-sm text-[var(--color-text-primary)]">
                  {validationResult.warnings.map((item) => (
                    <li key={item} className="bg-[var(--color-bg-secondary)] border border-[var(--color-warning)] rounded-md px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowActivateModal(false)}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={confirmActivate}
                disabled={validationResult.blockers.length > 0}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-success)] text-white disabled:opacity-50"
              >
                Activate
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeactivateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Deactivate Flow</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              This will pause the flow. You can reactivate later.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeactivateModal(false)}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeactivate}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-danger)] text-white"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}



      {nodeMenu && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0" onClick={() => setNodeMenu(null)}></div>
          <div
            className="absolute bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl p-2 text-sm"
            style={{ top: nodeMenu.y, left: nodeMenu.x }}
          >
            <button
              onClick={() => {
                setShowNodeModal(true);
                setSelectedNode(nodeMenu.node);
                setNodeMenu(null);
              }}
              className="px-3 py-2 rounded hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] w-full text-left"
            >
              Settings
            </button>
            <button
              onClick={() => {
                setNodeMenu(null);
              }}
              className="px-3 py-2 rounded text-[var(--color-text-tertiary)] w-full text-left cursor-not-allowed"
            >
              Run node disabled
            </button>
            <button
              onClick={() => {
                const node = nodeMenu.node;
                // Rule: Use mutateFlowGraph for internal copy
                const result = mutateFlowGraph(nodes, edges, {
                  type: 'COPY_NODE',
                  payload: { node }
                }, isSystemManaged);
                if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
                if (result.validation.blockers.length === 0) {
                  setNodes(result.nodes);
                }
                setNodeMenu(null);
              }}
              className="px-3 py-2 rounded hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] w-full text-left"
            >
              Copy
            </button>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[var(--color-text-primary)]">Ignore errors</span>
              <button
                onClick={() => {
                  const node = nodeMenu.node;
                  // Rule: Use mutateFlowGraph for runtime config toggle
                  const result = mutateFlowGraph(nodes, edges, {
                    type: 'UPDATE_NODE_CONFIG',
                    payload: {
                      nodeId: node.id,
                      config: { ignoreErrors: !node.data?.config?.ignoreErrors }
                    }
                  }, isSystemManaged);
                  if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
                  if (result.validation.blockers.length === 0) {
                    setNodes(result.nodes);
                  }
                }}
                className="w-9 h-5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] relative"
              >
                <span
                  className="absolute top-0.5 transition-all w-4 h-4 rounded-full bg-[var(--color-text-primary)]"
                  style={{ left: nodeMenu.node.data?.config?.ignoreErrors ? '1.1rem' : '0.15rem' }}
                />
              </button>
            </div>
            <button
              onClick={() => {
                const node = nodeMenu.node;
                // Rule: Use mutateFlowGraph for internal delete
                const result = mutateFlowGraph(nodes, edges, {
                  type: 'DELETE_NODE',
                  payload: { nodeId: node.id }
                }, isSystemManaged);
                if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
                if (result.validation.blockers.length === 0) {
                  setNodes(result.nodes);
                  setEdges(normalizeEdges(result.edges));
                }
                setNodeMenu(null);
              }}
              className="px-3 py-2 rounded hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] w-full text-left"
            >
              Delete
            </button>
          </div>
        </div>
      )}



      {showNoteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Note</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">Label</label>
                <input
                  value={noteDraft.label}
                  onChange={(e) => setNoteDraft((prev) => ({ ...prev, label: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">Note</label>
                  <AIAssistButton variant="inline" onAssist={() => applyNoteAssist('new')} loading={assistTarget === 'note:new'} tooltip="Draft note with AI" iconType="crosshair" />
                </div>
                <textarea
                  value={noteDraft.note}
                  onChange={(e) => setNoteDraft((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full min-h-[90px] px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">Color</label>
                <input
                  type="color"
                  value={noteDraft.color}
                  onChange={(e) => setNoteDraft((prev) => ({ ...prev, color: e.target.value }))}
                  className="w-16 h-10 rounded border border-[var(--color-border)] bg-transparent"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowNoteModal(false)}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const noteStyle = getDefaultNoteStyle();
                  const position = getViewportPlacement({ x: 0, y: 80 });

                  // Rule: Use mutateFlowGraph for runtime additions
                  const result = mutateFlowGraph(nodes, edges, {
                    type: 'ADD_NODE',
                    payload: {
                      nodeTemplate: {
                        id: `note-${Date.now()}`,
                        type: 'note',
                        data: {
                          label: noteDraft.label,
                          note: noteDraft.note,
                          color: noteDraft.color,
                          borderColor: noteStyle.borderColor,
                          textColor: noteStyle.textColor,
                          width: noteStyle.width,
                          height: noteStyle.height,
                        },
                        style: { zIndex: -1, width: noteStyle.width, height: noteStyle.height },
                      },
                      position
                    }
                  }, isSystemManaged);

                  if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
                  if (result.validation.blockers.length === 0) {
                    setNodes(result.nodes);
                    setIsDirty(true);
                    setShowNoteModal(false);
                  }
                }}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-primary)] text-white hover:opacity-90"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}



      {showNoteEditModal && noteEditingNode && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Edit Note</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">Label</label>
                <input
                  value={noteEditDraft.label}
                  onChange={(e) => setNoteEditDraft((prev) => ({ ...prev, label: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">Note</label>
                  <AIAssistButton variant="inline" onAssist={() => applyNoteAssist('edit')} loading={assistTarget === 'note:edit'} tooltip="Redraft note with AI" iconType="crosshair" />
                </div>
                <textarea
                  value={noteEditDraft.note}
                  onChange={(e) => setNoteEditDraft((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full min-h-[90px] px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">Color</label>
                <input
                  type="color"
                  value={noteEditDraft.color}
                  onChange={(e) => setNoteEditDraft((prev) => ({ ...prev, color: e.target.value }))}
                  className="w-16 h-10 rounded border border-[var(--color-border)] bg-transparent"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowNoteEditModal(false)}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Rule: Use mutateFlowGraph for runtime config updates
                  const result = mutateFlowGraph(nodes, edges, {
                    type: 'UPDATE_NODE_CONFIG',
                    payload: {
                      nodeId: noteEditingNode.id,
                      config: {
                        label: noteEditDraft.label,
                        note: noteEditDraft.note,
                        color: noteEditDraft.color,
                      },
                      dataUpdates: {
                        label: noteEditDraft.label,
                        note: noteEditDraft.note,
                        color: noteEditDraft.color,
                      }
                    }
                  }, isSystemManaged);

                  if (result?.__blocked) { console.warn('This flow is system-managed and cannot be modified.'); return; }
                  if (result.validation.blockers.length === 0) {
                    setNodes(result.nodes);
                    setShowNoteEditModal(false);
                  } else {
                    console.error('Note update blocked by validation:', result.validation.blockers);
                  }
                }}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-primary)] text-white hover:opacity-90"
              >
                Update Note
              </button>
            </div>
          </div>
        </div>
      )}

      {edgeMenu && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0" onClick={() => setEdgeMenu(null)}></div>
          <div
            className="absolute bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl p-2 text-sm"
            style={{ top: edgeMenu.y, left: edgeMenu.x }}
          >
            <button
              onClick={() => {
                setEdgeFilterModal(edgeMenu.edge);
                setEdgeMenu(null);
              }}
              className="px-3 py-2 rounded hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] w-full text-left"
            >
              Edit Filters
            </button>
          </div>
        </div>
      )}

      {edgeFilterModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Edge Filters</h3>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
              Add filter logic for this connection.
            </p>
            <div className="mb-2 flex justify-end">
              <AIAssistButton
                variant="inline"
                onAssist={async () => {
                  setAssistError('');
                  setAssistTarget('edge-filter');
                  try {
                    const suggestion = await requestFlowAssist('edge-filter');
                    setEdgeFilterModal((prev) => ({ ...prev, data: { ...prev.data, filters: suggestion } }));
                  } catch (error) {
                    setAssistError(error.message || 'Unable to draft edge filters right now.');
                  } finally {
                    setAssistTarget('');
                  }
                }}
                loading={assistTarget === 'edge-filter'}
                tooltip="Draft edge filters"
                iconType="crosshair"
              />
            </div>
            <textarea
              value={edgeFilterModal.data?.filters || ''}
              onChange={(e) =>
                setEdgeFilterModal((prev) => ({
                  ...prev,
                  data: { ...prev.data, filters: e.target.value },
                }))
              }
              className="w-full min-h-[120px] px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm"
              placeholder="e.g., amount > 1000 AND status = approved"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEdgeFilterModal(null)}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Rule: Use mutateFlowGraph for runtime edge data updates
                  const result = mutateFlowGraph(nodes, edges, {
                    type: 'UPDATE_EDGE_DATA',
                    payload: {
                      edgeId: edgeFilterModal.id,
                      data: { filters: edgeFilterModal.data?.filters || '' }
                    }
                  });

                  if (result.validation.blockers.length === 0) {
                    setEdges(normalizeEdges(result.edges));
                    setEdgeFilterModal(null);
                  } else {
                    console.error('Edge filter update blocked by validation:', result.validation.blockers);
                  }
                }}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-primary)] text-white hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}



      {latestRunDetail ? (
        <RunDetailInspector
          run={latestRunDetail}
          compareRun={compareRunDetail}
          onClearCompare={() => setCompareRunDetail(null)}
        />
      ) : null}

      {/* Terminal Toast */}
      {terminalOpen && (
        <div className="fixed bottom-4 right-4 w-[480px] max-h-80 bg-[var(--color-bg-secondary)]/95 backdrop-blur-xl border border-[var(--color-border)]/50 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-bg-primary)]/80 border-b border-[var(--color-border)]/50">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">Terminal</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTerminalLogs([])}
                className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] uppercase tracking-wide"
              >
                Clear
              </button>
              <button
                onClick={() => setTerminalOpen(false)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
              >
                x
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-3 font-mono text-xs space-y-1 crm-scroll-hidden">
            {terminalLogs.length === 0 ? (
              <div className="text-[var(--color-text-tertiary)] italic">
                Terminal ready. Logs will appear here...
              </div>
            ) : (
              terminalLogs.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-[var(--color-text-tertiary)] shrink-0">[{log.timestamp}]</span>
                  <span className={
                    log.type === 'error' ? 'text-red-400' :
                      log.type === 'success' ? 'text-emerald-400' :
                        log.type === 'warning' ? 'text-amber-400' :
                          'text-[var(--color-text-secondary)]'
                  }>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {/* Mapping Modal */}
      <VariableMappingModal
        isOpen={showMappingModal}
        template={mappingTemplate}
        onClose={() => { setShowMappingModal(false); setMappingTemplate(null); }}
        onConfirm={(mappings) => injectTemplateToCanvas(mappingTemplate, mappings)}
      />
      {/* AI Generation Modal */}
      <AiGeneratorModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        onGenerate={(prompt) => {
          const lower = prompt.toLowerCase();
          const nodes = [];
          const edges = [];

          // Basic keyword mapping
          if (lower.includes('form') || lower.includes('contact')) {
            nodes.push({ id: 'n1', type: 'trigger', data: { label: 'New Lead', iconName: 'User' }, position: { x: 50, y: 150 } });
          } else {
            nodes.push({ id: 'n1', type: 'trigger', data: { label: 'Manual Start', iconName: 'Play' }, position: { x: 50, y: 150 } });
          }

          if (lower.includes('ai') || lower.includes('bot') || lower.includes('qualify')) {
            nodes.push({ id: 'n2', type: 'action', data: { label: 'AI Qualifier', iconName: 'Bot', actionType: 'ai_qualify' }, position: { x: 300, y: 150 } });
          }

          if (lower.includes('wait') || lower.includes('delay')) {
            const lastId = nodes[nodes.length - 1].id;
            const nextId = `n${nodes.length + 1}`;
            nodes.push({ id: nextId, type: 'logic', data: { label: 'Wait/Delay', iconName: 'Clock', logicType: 'time_delay' }, position: { x: 300 + (nodes.length * 200), y: 150 } });
          }

          if (lower.includes('email') || lower.includes('send')) {
            const lastId = nodes[nodes.length - 1].id;
            nodes.push({ id: 'n-final', type: 'action', data: { label: 'Send Email', iconName: 'Mail', actionType: 'send_email' }, position: { x: nodes.length * 250, y: 150 } });
          }

          if (lower.includes('slack') || lower.includes('notify')) {
            nodes.push({ id: 'n-slack', type: 'action', data: { label: 'Slack Alert', iconName: 'MessageSquare', actionType: 'http_request' }, position: { x: nodes.length * 250, y: 250 } });
          }

          // Generate simple linear edges
          for (let i = 0; i < nodes.length - 1; i++) {
            edges.push({ id: `e${i}-${i + 1}`, source: nodes[i].id, target: nodes[i + 1].id, animated: false });
          }

          const documentationNotes = createDocumentationNoteNodes(nodes);

          const aiTemplate = {
            id: 'ai-gen',
            name: 'AI Generated Flow',
            nodes: [...nodes, ...documentationNotes],
            edges,
            placeholders: []
          };

          // Rule: Strict gating for AI-generated flows
          const result = ingestFlowSource(aiTemplate, { source: 'ai' });
          if (result.validation.blockers.length === 0) {
            setNodes(layoutNodesLeftToRight(result.nodes, result.edges));
            setEdges(normalizeEdges(result.edges));
            setShowAiModal(false);
          } else {
            console.error('AI Flow ingestion blocked by validation:', result.validation.blockers);
          }
        }}
      />

      {/* Template Library Modal */}
      <TemplateLibraryModal
        isOpen={showTemplateLibrary}
        onClose={() => setShowTemplateLibrary(false)}
        customTemplates={customTemplates}
        onSelectTemplate={(template) => {
          setShowTemplateLibrary(false);
          applyTemplate(template);
        }}
      />
    </div>
  );
};

export default FlowBuilder;
