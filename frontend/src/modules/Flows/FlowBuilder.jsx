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
} from 'lucide-react';

import AIAssistButton from '../../components/AIAssistButton';
import { requestAiSuggestion } from '../../services/aiAssist';
import FlowBuilderHeader from './components/FlowBuilderHeader';
import NodeLibraryPanel from './components/NodeLibraryPanel';
import TemplateLibraryPanel from './components/TemplateLibraryPanel';
import FlowInfoPanel from './components/FlowInfoPanel';
import VariableMappingModal from './components/VariableMappingModal';
import AiGeneratorModal from './components/AiGeneratorModal';
import NodeConfigDrawer from './components/NodeConfigDrawer';
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

const layoutNodesLeftToRight = (nodes, edges) => {
  if (!nodes || nodes.length === 0) return nodes;

  const adj = new Map();
  const inDeg = new Map();
  nodes.forEach((node) => {
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
  nodes.forEach((node, index) => {
    if (!depth.has(node.id)) {
      depth.set(node.id, maxDepth + 1 + index);
    }
  });

  const columns = new Map();
  nodes.forEach((node) => {
    const d = depth.get(node.id) || 0;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d).push(node);
  });

  const xGap = 260;
  const yGap = 190;
  const xOffset = 120;
  const yOffset = 120;

  const nextNodes = nodes.map((node) => ({ ...node }));
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

  return nextNodes;
};

const FlowBuilder = ({ flowId = null, action = null, intent = null, onFlowContextChange = null, onSelectForAgents = null, onExit }) => {
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
  const [loading, setLoading] = useState(true);

  // Node/Edge state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // Config UI state
  const [selectedNode, setSelectedNode] = useState(null);
  const [showNodeConfig, setShowNodeConfig] = useState(false);
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [leftPanelTab, setLeftPanelTab] = useState('nodes');
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
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
  
  // Terminal logging helper
  const logToTerminal = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [...prev.slice(-99), { timestamp, message, type }]);
  }, []);

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
          send_email: { channel: 'email', objective: 'Deliver a concise follow-up', tone: 'helpful and direct', required_fields: ['subject', 'body', 'owner'] },
          send_sms: { channel: 'sms', objective: 'Send a short action-first reminder', tone: 'brief and clear', required_fields: ['message', 'owner'] },
          store_data: { channel: 'storage', objective: 'Persist normalized payload', required_fields: ['target_table', 'fields'] },
          create_task: { channel: 'task', objective: 'Create a follow-up task', required_fields: ['title', 'owner', 'due_in_hours'] },
        };
        return JSON.stringify(configByAction[actionType] || configByAction.send_email, null, 2);
      }
      case 'logic-condition': {
        const logicType = overrides.logicType || nodeConfigDraft.logicType || 'if_then';
        if (logicType === 'delay') return 'Wait 30 minutes before continuing, unless the contact has replied or the stage has already advanced.';
        if (logicType === 'filter') return 'Continue only if lead_score >= 70, a valid email is present, and the contact is not closed-lost.';
        return 'If intent contains "demo" or lead_score >= 75, route to sales. Otherwise send to nurture and create a review task.';
      }
      case 'payload-map':
        return JSON.stringify({ contact_email: '{{trigger.payload.email}}', contact_name: '{{trigger.payload.name}}', stage: '{{crm.contact.pipeline_stage}}', owner: '{{crm.contact.owner}}' }, null, 2);
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
      flow_name: flow?.name || 'Untitled Flow',
      selected_label: overrides.label || selectedNode?.data?.label || 'this node',
      action_type: overrides.actionType || nodeConfigDraft.actionType || 'send_email',
      logic_type: overrides.logicType || nodeConfigDraft.logicType || 'if_then',
      trigger_event: overrides.event || nodeConfigDraft.event || 'the selected event',
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
    position: { x: 360, y: 220 },
    data: {
      label: 'Add your first node',
      description: 'Drag a trigger or webhook to start',
      typeLabel: '',
      nodeColor: 'trigger',
      iconName: 'Plus',
      isGhost: true,
    },
    sourcePosition: 'right',
    targetPosition: 'left',
  });

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
              setEdges(draftResult.edges);
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
               setEdges(initialResult.edges);
             } else {
               setNodes([createGhostStarterNode()]);
               setEdges([]);
             }
          }
        } else {
          // Normal hydration
          if (initialResult.validation.blockers.length === 0 && initialResult.nodes.length > 0) {
            setNodes(layoutNodesLeftToRight(initialResult.nodes, initialResult.edges));
            setEdges(initialResult.edges);
          } else {
            setNodes([createGhostStarterNode()]);
            setEdges([]);
          }
        }
        setIsDirty(false);
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
        setEdges(result.edges);
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
    });

    if (result.validation.blockers.length === 0) {
      setNodes(result.nodes);
      setLastAddedPosition(position);
      setIsDirty(true);
    }
  }, [lastAddedPosition, nodes, edges, setNodes]);


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
    });

    if (result.validation.blockers.length === 0) {
      setNodes(result.nodes);
      setLastAddedPosition(position);
      setIsDirty(true);
    }
  }, [reactFlowInstance, nodes, edges, setNodes]);


  const handleDeleteSelectedNode = useCallback(() => {
    if (!selectedNode || selectedNode?.data?.isGhost) return;
    const nodeId = selectedNode.id;
    
    // Rule: Use mutateFlowGraph for internal deletions (Prevents orphans)
    const result = mutateFlowGraph(nodes, edges, {
      type: 'DELETE_NODE',
      payload: { nodeId }
    });

    if (result.validation.blockers.length === 0) {
      setNodes(result.nodes);
      setEdges(result.edges);
      setSelectedNode(null);
      setIsDirty(true);
    } else {
      console.error('Node deletion blocked by validation:', result.validation.blockers);
    }
  }, [selectedNode, nodes, edges, setNodes, setEdges]);

// Handle drag over canvas
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle drop from node library
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const nodeDataStr = event.dataTransfer.getData('nodeData');
      if (!nodeDataStr) return;

      try {
        const nodeTemplate = JSON.parse(nodeDataStr);
        const position = reactFlowInstance?.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }) || { x: 0, y: 0 };

        // Rule: Use mutateFlowGraph for runtime drop
        const result = mutateFlowGraph(nodes, edges, {
          type: 'ADD_NODE',
          payload: { nodeTemplate, position }
        });
        
        if (result.validation.blockers.length === 0) {
          setNodes(result.nodes);
          setIsDirty(true);
        }
      } catch (error) {
        console.error('Failed to drop node:', error);
      }
    },
    [reactFlowInstance, nodes, edges, setNodes]
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
      });

      if (result.validation.blockers.length === 0) {
        setNodes(result.nodes);
        setIsDirty(true);
        setShowNodeConfig(false);
        setShowNodeModal(false);
      } else {
        console.error('Config save blocked by validation:', result.validation.blockers);
      }
    },
    [nodes, edges, setNodes]
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
        setEdges(result.edges);
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
    });

    if (result.validation.blockers.length === 0) {
      setNodes(result.nodes);
      setIsDirty(true);
    } else {
      console.error('Form trigger insertion blocked by validation:', result.validation.blockers);
    }
  }, [reactFlowInstance, nodes, edges, setNodes]);

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
    setEdges((eds) => [...eds, ...result.edges]);
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

// Handle save flow
  const handleSaveFlow = useCallback(async () => {
    if (!flow) return;

    const { sanitizedNodes, sanitizedEdges } = getSanitizedGraph();

    try {
      const spec = buildFlowSpec({ flow, nodes: sanitizedNodes, edges: sanitizedEdges });
      const updatedFlow = {
        ...flow,
        nodes: sanitizedNodes,
        edges: sanitizedEdges,
        spec,
        status: flow.status,
        updatedAt: new Date().toISOString(),
        lastEditedBy: 'Current User',
        metadata: {
          ...flow.metadata,
          nodeCount: sanitizedNodes.length,
        },
      };

      const savedFlow = await flowRepository.saveFlow(updatedFlow);
      const persistedFlow = savedFlow || updatedFlow;
      setFlow(persistedFlow);
      if (persistedFlow?.id) {
        onFlowContextChange?.({ flowId: persistedFlow.id, action: null, intent: null });
      }
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to save flow:', error);
    }
  }, [flow, nodes, edges, getSanitizedGraph, onFlowContextChange]);

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

    setCustomTemplates(prev => [newTemplate, ...prev]);
    alert('Flow saved as a reusable template!');
  }, [flow, getSanitizedGraph]);

  // Handle toggle flow status
  const handleToggleStatus = useCallback(async () => {
    if (!flow) return;
    if (flow.status === 'Active') {
      setShowDeactivateModal(true);
      return;
    }
    const { sanitizedNodes, sanitizedEdges } = getSanitizedGraph();
    const spec = buildFlowSpec({ flow, nodes: sanitizedNodes, edges: sanitizedEdges });
    const result = validateFlowSpec(spec);
    setValidationResult(result);
    setShowActivateModal(true);
  }, [flow, nodes, edges, getSanitizedGraph]);

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
    flowRepository.saveFlow(updatedFlow).then((savedFlow) => setFlow(savedFlow || updatedFlow));
    setShowActivateModal(false);
  }, [flow, nodes, edges, getSanitizedGraph]);

  const confirmDeactivate = useCallback(() => {
    if (!flow) return;
    const updatedFlow = {
      ...flow,
      status: 'Draft',
      updatedAt: new Date().toISOString(),
    };
    flowRepository.saveFlow(updatedFlow).then((savedFlow) => setFlow(savedFlow || updatedFlow));
    setShowDeactivateModal(false);
  }, [flow]);

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
    <div className="flex flex-col h-full w-full bg-[var(--color-bg-primary)] overflow-hidden relative font-sans">
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
          right: 20px;
          bottom: 20px;
          z-index: 50;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
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
          box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
          border-radius: 8px !important;
          overflow: hidden !important;
          border: 1px solid var(--color-border) !important;
        }
      `}</style>
      
      <FlowBuilderHeader
        flowName={flow?.name}
        status={flow?.status}
        onToggleDetails={() => setRightPanelOpen(!rightPanelOpen)}
        isDetailsOpen={rightPanelOpen}
        onOpenHistory={() => setShowHistory(true)}
        breadcrumbs={[{ id: 'editor', label: 'Editor' }]}
        aiAssistSlot={<AIAssistButton onAssist={applyFlowHelper} loading={assistTarget === 'header'} tooltip="Flow AI Assist" iconType="crosshair" />}
        onSave={handleSaveFlow}
      />

      {assistError && (
        <div className="mx-4 mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-200 z-50">
          {assistError}
        </div>
      )}

      {/* Main Layout: 3 Columns */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* LEFT: Node & Template Library */}
        <div 
          className={`sidebar-transition flex flex-col bg-[var(--color-bg-primary)] border-r border-[var(--color-border)] overflow-hidden ${leftPanelOpen ? 'w-64' : 'w-0 border-none'}`}
        >
          <div className="flex items-center gap-1 p-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
            <button 
              onClick={() => setLeftPanelTab('nodes')}
              className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${leftPanelTab === 'nodes' ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)]'}`}
            >
              Nodes
            </button>
            <button 
              onClick={() => setLeftPanelTab('templates')}
              className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${leftPanelTab === 'templates' ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)]'}`}
            >
              Templates
            </button>
          </div>

          <div className="p-2 border-b border-[var(--color-border)] px-3">
            <button 
              onClick={() => setShowAiModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg hover:shadow-sky-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Wand2 className="w-3.5 h-3.5" />
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
          
          {/* TOP OVERLAY: Stable Floating Controls */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-md flex justify-center">
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
                v1.1.0-COMMS
              </div>
            </div>
          </div>

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
            fitView
            connectionRadius={40}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: {
                stroke: 'var(--color-accent)',
                strokeWidth: 2,
                strokeDasharray: '6 6',
                filter: 'drop-shadow(0 0 6px var(--color-accent))',
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
            
            <div className="flow-control-dock">
              <Controls showInteractive={false} showFitView={true} className="flow-controls-buttons" />
              <MiniMap
                className="flow-minimap"
                nodeColor={(node) => {
                  const colorMap = {
                    trigger: 'var(--node-trigger)',
                    action: 'var(--node-action)',
                    logic: 'var(--node-logic)',
                    webhook: 'var(--node-webhook)',
                    socket: 'var(--node-socket)',
                    input: 'var(--node-input)',
                  };
                  return colorMap[node.type] || 'var(--color-border)';
                }}
              />
            </div>
          </ReactFlow>
        </div>

        {/* RIGHT: Inspector Panel */}
        <div 
          className={`sidebar-transition bg-[var(--color-bg-primary)] border-l border-[var(--color-border)] overflow-hidden ${rightPanelOpen ? 'w-80' : 'w-0 border-none'}`}
        >
          <FlowInfoPanel
            flow={flow}
            onFlowUpdate={handleFlowUpdate}
            onApplyDraft={applyDraftToCanvas}
            onInsertFormTrigger={insertFormTrigger}
            onSaveAsTemplate={handleSaveAsTemplate}
            showDetails={true}
          />
        </div>
      </div>

      {/* Floating Toolbar */}
      <div className="pointer-events-none absolute left-1/2 bottom-4 -translate-x-1/2 z-40">
        <div className="pointer-events-auto flex items-center gap-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-full px-3 py-2 shadow-lg">
          <button type="button" disabled className="flow-toolbar-btn flow-toolbar-btn--success opacity-60 cursor-not-allowed">
            Run Disabled
          </button>
          <button type="button" disabled className="flow-toolbar-btn opacity-60 cursor-not-allowed">
            Deploy Disabled
          </button>
          <button
            type="button"
            onClick={handleSaveFlow}
            className="flow-toolbar-btn"
          >
            Save
          </button>
          {onSelectForAgents ? (
            <button
              type="button"
              onClick={() => flow?.id && onSelectForAgents(flow)}
              className="flow-toolbar-btn flow-toolbar-btn--purple"
            >
              Use In Agents
            </button>
          ) : null}
          <button
            type="button"
            disabled
            className="flow-toolbar-btn flow-toolbar-btn--success flex items-center gap-2 opacity-60 cursor-not-allowed"
          >
            <span>Activation Disabled</span>
            <span
              className={`w-9 h-5 rounded-full border border-[var(--color-border)] relative transition-colors ${
                flow?.status === 'Active' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-bg-secondary)]'
              }`}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                style={{ left: flow?.status === 'Active' ? '1.1rem' : '0.15rem' }}
              />
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              openNodeLibrary();
            }}
            className="flow-toolbar-btn flow-toolbar-btn--purple"
          >
            Add Node
          </button>
          <button
            type="button"
            className="flow-toolbar-btn"
            onClick={() => {
              openNodeLibrary();
            }}
          >
            AI Node
          </button>
          <button
            type="button"
            onClick={() => {
              // Rule: Use mutateFlowGraph for internal layout updates
              const result = mutateFlowGraph(nodes, edges, { type: 'ALIGN_NODES' });
              if (result.validation.blockers.length === 0) {
                setNodes(layoutNodesLeftToRight(result.nodes, result.edges));
              }
            }}
            className="flow-toolbar-btn"
          >
            Align Nodes
          </button>
          <button
            type="button"
            className="flow-toolbar-btn flow-toolbar-btn--neutral-light"
            onClick={() => setShowNoteModal(true)}
          >
            Add Note
          </button>
          <button
            type="button"
            className="flow-toolbar-btn flow-toolbar-btn--danger"
            onClick={handleDeleteSelectedNode}
          >
            Delete node
          </button>

        </div>
        <div className="mt-2 text-[10px] text-[var(--color-text-tertiary)] text-center">
          Scenario: {flow?.name || 'Untitled Flow'} | v{flow?.metadata?.version || 1} | {flow?.status || 'Draft'}
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
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors ${
                    nodeModalTab === tab
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
                          </select>
                        </div>
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
                          </select>
                        </div>
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
                    });
                    if (result.validation.blockers.length === 0) {
                      setNodes(result.nodes);
                    } else {
                      console.error('Modal save blocked by validation:', result.validation.blockers);
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

      {showHistory && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowHistory(false)}></div>
          <div className="absolute right-0 top-0 h-full w-80 bg-[var(--color-bg-primary)] border-l border-[var(--color-border)] shadow-xl flex flex-col">
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Execution History</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
              >
                x
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-xs text-[var(--color-text-secondary)]">
              No executions yet.
            </div>
          </div>
        </div>
      )}

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
                });
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
                  });
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
                });
                if (result.validation.blockers.length === 0) {
                  setNodes(result.nodes);
                  setEdges(result.edges);
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
            const position = reactFlowInstance?.screenToFlowPosition({ x: 260, y: 220 }) || { x: 260, y: 220 };
            
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
                  },
                  style: { zIndex: -1, width: 280, height: 160 },
                },
                position
              }
            });

            if (result.validation.blockers.length === 0) {
              setNodes(result.nodes);
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
            });
            
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
                    setEdges(result.edges);
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
                ×
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
            nodes.push({ id: 'n2', type: 'action', data: { label: 'AI Qualifier', iconName: 'Bot' }, position: { x: 300, y: 150 } });
          }

          if (lower.includes('wait') || lower.includes('delay')) {
            const lastId = nodes[nodes.length - 1].id;
            const nextId = `n${nodes.length + 1}`;
            nodes.push({ id: nextId, type: 'logic', data: { label: 'Wait/Delay', iconName: 'Clock' }, position: { x: 300 + (nodes.length * 200), y: 150 } });
          }

          if (lower.includes('email') || lower.includes('send')) {
            const lastId = nodes[nodes.length - 1].id;
            nodes.push({ id: 'n-final', type: 'action', data: { label: 'Send Email', iconName: 'Mail' }, position: { x: nodes.length * 250, y: 150 } });
          }

          if (lower.includes('slack') || lower.includes('notify')) {
            nodes.push({ id: 'n-slack', type: 'action', data: { label: 'Slack Alert', iconName: 'MessageSquare' }, position: { x: nodes.length * 250, y: 250 } });
          }

          // Generate simple linear edges
          for (let i = 0; i < nodes.length - 1; i++) {
            edges.push({ id: `e${i}-${i+1}`, source: nodes[i].id, target: nodes[i+1].id, animated: true });
          }

          const aiTemplate = {
            id: 'ai-gen',
            name: 'AI Generated Flow',
            nodes,
            edges,
            placeholders: []
          };
          
          // Rule: Strict gating for AI-generated flows
          const result = ingestFlowSource(aiTemplate, { source: 'ai' });
          if (result.validation.blockers.length === 0) {
            setNodes(result.nodes);
            setEdges(result.edges);
            setShowAiModal(false);
          } else {
            console.error('AI Flow ingestion blocked by validation:', result.validation.blockers);
          }
        }}
      />
    </div>
  );
};

export default FlowBuilder;
