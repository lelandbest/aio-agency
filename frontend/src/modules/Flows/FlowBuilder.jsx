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

import { Crosshair } from 'lucide-react';
import FlowBuilderHeader from './components/FlowBuilderHeader';
import NodeLibraryPanel from './components/NodeLibraryPanel';
import FlowInfoPanel from './components/FlowInfoPanel';
import NodeConfigDrawer from './components/NodeConfigDrawer';
import CustomNode from './components/nodes/CustomNode';
import FrameNode from './components/nodes/FrameNode';
import NoteNode from './components/nodes/NoteNode';

import { createNode } from './data/nodeLibrary';
import flowRepository from './utils/flowRepository';
import flowDraftRepository from './utils/flowDraftRepository';
import { buildFlowSpec, validateFlowSpec } from './utils/flowSpec';

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

const FlowBuilder = ({ flowId = null, onExit }) => {
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
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryMode, setLibraryMode] = useState('all');
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showNoteEditModal, setShowNoteEditModal] = useState(false);
  const [noteEditingNode, setNoteEditingNode] = useState(null);
  const [noteEditDraft, setNoteEditDraft] = useState({ label: 'Note', note: '', color: getCssVar('--note-default-color', '#111827') });
  const [noteDraft, setNoteDraft] = useState({ label: 'Note', note: '', color: getCssVar('--note-default-color', '#111827') });
  const [stickerDraft, setStickerDraft] = useState({ label: 'Frame', note: '', color: '#1f2937' });
  const [showDetails, setShowDetails] = useState(false);
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

  // Initialize flow on mount
  useEffect(() => {
    const initFlow = async () => {
      try {
        let flowData;
        if (flowId) {
          // Load existing flow
          flowData = flowRepository.getFlowById(flowId);
          if (!flowData) {
            console.warn(`Flow ${flowId} not found, creating new`);
            flowData = flowRepository.createNewFlow();
          }
        } else {
          // Create new flow
          flowData = flowRepository.createNewFlow();
        }

        setFlow(flowData);
        const mappedNodes = (flowData.nodes || []).map((node) => ({
            ...node,
            sourcePosition: node.sourcePosition || 'right',
            targetPosition: node.targetPosition || 'left',
            data: {
              ...node.data,
              typeLabel: node.data?.typeLabel || ({
                trigger: 'Trigger',
                action: 'Action',
                logic: 'Logic',
                webhook: 'Webhook',
                socket: 'Socket',
              }[node.type] || 'Node'),
            },
          }));
        const mappedEdges = (flowData.edges || []).map((edge) => ({
            ...edge,
            type: edge.type || 'smoothstep',
            animated: edge.animated ?? true,
            style: {
              stroke: 'var(--color-accent)',
              strokeWidth: 2,
              strokeDasharray: '6 6',
              filter: 'drop-shadow(0 0 6px var(--color-accent))',
              ...(edge.style || {}),
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: 'var(--color-accent)',
              ...(edge.markerEnd || {}),
            },
            label: edge.label || '\u2699',
            labelStyle: edge.labelStyle || { fill: 'rgba(148,163,184,0.7)', fontSize: 12 },
            labelBgStyle: { fill: 'transparent' },
            labelBgPadding: [0, 0],
          }));
        const activeDraft = flowDraftRepository.getActiveDraft();
        if (activeDraft && (!flowId || !flowData?.metadata?.sourceDraftId)) {
          const draftNodes = (activeDraft.draftSpec?.nodes || []).map((node) => ({
            ...node,
            sourcePosition: node.sourcePosition || 'right',
            targetPosition: node.targetPosition || 'left',
            data: {
              ...node.data,
              typeLabel: node.data?.typeLabel || ({
                trigger: 'Trigger',
                action: 'Action',
                logic: 'Logic',
                webhook: 'Webhook',
                socket: 'Socket',
              }[node.type] || 'Node'),
            },
          }));
          const draftEdges = (activeDraft.draftSpec?.edges || []).map((edge) => ({
            ...edge,
            type: edge.type || 'smoothstep',
            animated: edge.animated ?? true,
            style: {
              stroke: 'var(--color-accent)',
              strokeWidth: 2,
              strokeDasharray: '6 6',
              filter: 'drop-shadow(0 0 6px var(--color-accent))',
              ...(edge.style || {}),
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: 'var(--color-accent)',
              ...(edge.markerEnd || {}),
            },
          }));
          setNodes(layoutNodesLeftToRight(draftNodes, draftEdges));
          setEdges(draftEdges);
          setFlow({
            ...flowData,
            name: activeDraft.intentSummary || flowData.name,
            metadata: {
              ...flowData.metadata,
              sourceDraftId: activeDraft.id,
            },
          });
          flowDraftRepository.clearActiveDraft();
        } else {
          setNodes(layoutNodesLeftToRight(mappedNodes, mappedEdges));
          setEdges(mappedEdges);
        }
        if ((flowData.nodes || []).length === 0 && nodes.length === 0) {
          setNodes([
            {
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
            },
          ]);
        }
        setIsDirty(false);
      } catch (error) {
        console.error('Failed to initialize flow:', error);
      } finally {
        setLoading(false);
      }
    };

    initFlow();
  }, [flowId, setNodes, setEdges]);

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
      setEdges((eds) =>
        addEdge(
          {
            ...params,
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
          },
          eds
        )
      );
      setIsDirty(true);
    },
    [setEdges, nodes]
  );

  
  const handleLibraryAdd = useCallback((nodeTemplate) => {
    if (!nodeTemplate) return;
    const base = lastAddedPosition || { x: 240, y: 220 };
    const offset = { x: 140, y: 20 };
    const position = {
      x: base.x + offset.x,
      y: base.y + offset.y,
    };
    const newNode = createNode(nodeTemplate, position);
    setNodes((nds) => {
      const ghostIndex = nds.findIndex((node) => node.data?.isGhost);
      if (ghostIndex >= 0) {
        const ghost = nds[ghostIndex];
        const replaced = { ...newNode, position: ghost.position };
        setLastAddedPosition(ghost.position);
        return [...nds.slice(0, ghostIndex), replaced, ...nds.slice(ghostIndex + 1)];
      }
      setLastAddedPosition(position);
      return nds.concat(newNode);
    });
    setIsDirty(true);
  }, [lastAddedPosition, setNodes]);


  const handleLibraryAddAtViewport = useCallback((nodeTemplate) => {
    if (!nodeTemplate) return;
    const viewport = viewportRef.current || { x: 0, y: 0, zoom: 1 };
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const padding = 80;
    const screenX = rect.left + padding;
    const screenY = rect.bottom - padding;
    const position = reactFlowInstance?.screenToFlowPosition({ x: screenX, y: screenY }) || { x: 0, y: 0 };
    const newNode = createNode(nodeTemplate, position);
    setNodes((nds) => {
      const ghostIndex = nds.findIndex((node) => node.data?.isGhost);
      if (ghostIndex >= 0) {
        const ghost = nds[ghostIndex];
        const replaced = { ...newNode, position: ghost.position };
        setLastAddedPosition(ghost.position);
        return [...nds.slice(0, ghostIndex), replaced, ...nds.slice(ghostIndex + 1)];
      }
      setLastAddedPosition(position);
      return nds.concat(newNode);
    });
    setIsDirty(true);
  }, [reactFlowInstance, lastAddedPosition, setNodes]);


  const handleDeleteSelectedNode = useCallback(() => {
    if (!selectedNode || selectedNode?.data?.isGhost) return;
    const nodeId = selectedNode.id;
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
    setIsDirty(true);
  }, [selectedNode, setNodes, setEdges]);

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

        const newNode = createNode(nodeTemplate, position);
        setNodes((nds) => {
          const ghostIndex = nds.findIndex((node) => node.data?.isGhost);
          if (ghostIndex >= 0) {
            const ghost = nds[ghostIndex];
            const replaced = { ...newNode, position: ghost.position };
            setLastAddedPosition(ghost.position);
            return [...nds.slice(0, ghostIndex), replaced, ...nds.slice(ghostIndex + 1)];
          }
          setLastAddedPosition(position);
          return nds.concat(newNode);
        });
        setIsDirty(true);
      } catch (error) {
        console.error('Failed to drop node:', error);
      }
    },
    [reactFlowInstance, setNodes]
  );

  // Handle node click (select for config)
  const onNodeClick = useCallback((event, node) => {
    if (node?.data?.isGhost) {
      setShowDetails(false);
      setShowLibrary(true);
      return;
    }
    setSelectedNode(node);
  }, []);

  // Handle double-click for popover config (future enhancement)
  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    if (node?.data?.isGhost) return;
    setNodeMenu({
      node,
      x: event.clientX,
      y: event.clientY,
    });
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
    setNodeConfigRaw(JSON.stringify(node?.data?.config || {}, null, 2));
    setNodeConfigRawError('');
    setNodeModalTab('general');
    setShowNodeModal(true);
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
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                config,
              },
            };
          }
          return node;
        })
      );
      setIsDirty(true);
      setShowNodeConfig(false);
      setShowNodeModal(false);
    },
    [setNodes]
  );

  const applyDraftToCanvas = useCallback((draft) => {
    if (!draft) return;
    const draftNodes = (draft.draftSpec?.nodes || []).map((node) => ({
      ...node,
      sourcePosition: node.sourcePosition || 'right',
      targetPosition: node.targetPosition || 'left',
      data: {
        ...node.data,
        typeLabel: node.data?.typeLabel || ({
          trigger: 'Trigger',
          action: 'Action',
          logic: 'Logic',
          webhook: 'Webhook',
          socket: 'Socket',
        }[node.type] || 'Node'),
      },
    }));
    const draftEdges = (draft.draftSpec?.edges || []).map((edge) => ({
      ...edge,
      type: edge.type || 'smoothstep',
      animated: edge.animated ?? true,
      style: {
        stroke: 'var(--color-accent)',
        strokeWidth: 2,
        strokeDasharray: '6 6',
        filter: 'drop-shadow(0 0 6px var(--color-accent))',
        ...(edge.style || {}),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'var(--color-accent)',
        ...(edge.markerEnd || {}),
      },
    }));
    setNodes(layoutNodesLeftToRight(draftNodes, draftEdges));
    setEdges(draftEdges);
    setFlow((prev) => ({
      ...prev,
      name: draft.intentSummary || prev?.name,
      metadata: {
        ...prev?.metadata,
        sourceDraftId: draft.id,
      },
    }));
    setIsDirty(true);
  }, [setNodes, setEdges]);

  const insertFormTrigger = useCallback((form) => {
    if (!form) return;
    const position = reactFlowInstance?.screenToFlowPosition({
      x: 240,
      y: 200,
    }) || { x: 200, y: 200 };
    const triggerNode = createNode(
      {
        id: `form-${form.id}`,
        type: 'trigger',
        label: `${form.name} Form`,
        description: 'Form submission trigger',
        iconName: 'FileText',
        nodeColor: 'trigger',
      },
      position
    );
    setNodes((nds) => nds.concat(triggerNode));
    setIsDirty(true);
  }, [reactFlowInstance, setNodes]);

  
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

      flowRepository.saveFlow(updatedFlow);
      setFlow(updatedFlow);
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to save flow:', error);
    }
  }, [flow, nodes, edges, getSanitizedGraph]);

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
    flowRepository.saveFlow(updatedFlow);
    setFlow(updatedFlow);
    setShowActivateModal(false);
  }, [flow, nodes, edges, getSanitizedGraph]);

  const confirmDeactivate = useCallback(() => {
    if (!flow) return;
    const updatedFlow = {
      ...flow,
      status: 'Draft',
      updatedAt: new Date().toISOString(),
    };
    flowRepository.saveFlow(updatedFlow);
    setFlow(updatedFlow);
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
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--node-action)] border-transparent border-t-[var(--node-action)] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-text-primary)]">Loading Flow Builder...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--color-bg-primary)] overflow-hidden relative">
      {/* Header */}
      <FlowBuilderHeader
        flowName={flow?.name}
        status={flow?.status}
        onExit={onExit}
        onToggleDetails={() => {
          setShowLibrary(true);
          setShowDetails((prev) => !prev);
          setLibraryMode('all');
        }}
        isDetailsOpen={showDetails}
        onOpenHistory={() => setShowHistory(true)}
        breadcrumbs={[
          { id: 'editor', label: 'Editor' },
        ]}
      />

      {/* Main Canvas Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center - React Flow Canvas */}
        <div className="flex-1 relative bg-[var(--color-bg-primary)] p-2.5" ref={reactFlowWrapper}>
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
            >
            <Background
              color="var(--color-grid-strong)"
              gap={16}
              size={1.5}
              variant="dots"
            />
            <Controls
              showInteractive={false}
              showFitView={false}
              className="flow-controls bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-md"
              style={{
                button: {
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                },
              }}
            />
            <MiniMap
              className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-md"
              style={{ backgroundColor: 'var(--color-bg-primary)' }}
              nodeColor={(node) => {
                const colorMap = {
                  trigger: 'var(--node-trigger)',
                  action: 'var(--node-action)',
                  logic: 'var(--node-logic)',
                  webhook: 'var(--node-webhook)',
                  socket: 'var(--node-socket)',
                };
                return colorMap[node.type] || 'var(--color-border)';
              }}
            />
          </ReactFlow>
        </div>

        {/* Right Panel - Flow Info */}
        {showLibrary && (
          <FlowInfoPanel
            flow={flow}
            onFlowUpdate={handleFlowUpdate}
            libraryContent={<NodeLibraryPanel embedded openOnlyCategory={libraryMode === 'ai' ? 'AI Agents' : null} />}
            onApplyDraft={applyDraftToCanvas}
            onInsertFormTrigger={insertFormTrigger}
            showDetails={showDetails}
          />
        )}
      </div>

      {/* Floating Toolbar */}
      <div className="pointer-events-none absolute left-1/2 bottom-4 -translate-x-1/2 z-40">
        <div className="pointer-events-auto flex items-center gap-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-full px-3 py-2 shadow-lg">
          <button className="flow-toolbar-btn flow-toolbar-btn--success">
            Run Flow
          </button>
          <button className="flow-toolbar-btn">
            Deploy
          </button>
          <button
            onClick={handleSaveFlow}
            className="flow-toolbar-btn"
          >
            Save
          </button>
          <button
            onClick={handleToggleStatus}
            className="flow-toolbar-btn flow-toolbar-btn--success flex items-center gap-2"
          >
            <span>Activate</span>
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
            onClick={() => {
              setShowDetails(false);
              setLibraryMode('all');
              setShowLibrary(true);
            }}
            className="flow-toolbar-btn flow-toolbar-btn--purple"
          >
            + Add node
          </button>
          <button
            className="flow-toolbar-btn"
            onClick={() => {
              setShowDetails(false);
              setLibraryMode('ai');
              setShowLibrary(true);
            }}
          >
            AI node
          </button>
          <button
            onClick={() => setNodes(layoutNodesLeftToRight(nodes, edges))}
            className="flow-toolbar-btn"
          >
            Align nodes
          </button>
          <button
            className="flow-toolbar-btn flow-toolbar-btn--neutral-light"
            onClick={() => setShowNoteModal(true)}
          >
            Add Note
          </button>
          <button
            className="flow-toolbar-btn flow-toolbar-btn--danger"
            onClick={handleDeleteSelectedNode}
          >
            Delete node
          </button>

          <button className="flow-toolbar-btn">
            <span className="inline-flex items-center gap-2">
              <Crosshair className="w-4 h-4" />
              AI Helper
            </span>
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
                  <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">Description</label>
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
                          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                            Description
                          </label>
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
                          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                            Configuration
                          </label>
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
                          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                            Condition
                          </label>
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
                              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                                Payload Mapping (JSON)
                              </label>
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
                          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                            Headers (JSON)
                          </label>
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
                      <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                        General Configuration
                      </label>
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
                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">
                  Raw Config (JSON)
                </label>
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
                    setNodes((nds) =>
                      nds.map((node) =>
                        node.id === selectedNode.id
                          ? { ...node, data: { ...selectedNode.data, config: nodeConfigDraft } }
                          : node
                      )
                    );
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
              className="px-3 py-2 rounded hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] w-full text-left"
            >
              Run node once
            </button>
            <button
              onClick={() => {
                const node = nodeMenu.node;
                const copied = { ...node, id: `${node.id}-copy-${Date.now()}`, position: { x: node.position.x + 40, y: node.position.y + 40 } };
                setNodes((nds) => nds.concat(copied));
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
                  setNodes((nds) =>
                    nds.map((n) =>
                      n.id === node.id
                        ? {
                            ...n,
                            data: {
                              ...n.data,
                              config: {
                                ...n.data?.config,
                                ignoreErrors: !n.data?.config?.ignoreErrors,
                              },
                            },
                          }
                        : n
                    )
                  );
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
                setNodes((nds) => nds.filter((n) => n.id !== node.id));
                setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
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
          <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">Note</label>
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
            const noteNode = {
              id: `note-${Date.now()}`,
              type: 'note',
              position,
              data: {
                label: noteDraft.label,
                note: noteDraft.note,
                color: noteDraft.color,
              },
              draggable: true,
              selectable: true,
              style: { zIndex: -1, width: 280, height: 160 },
            };
            setNodes((nds) => nds.concat(noteNode));
            setShowNoteModal(false);
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
          <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">Note</label>
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
            setNodes((nds) =>
              nds.map((node) =>
                node.id === noteEditingNode.id
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        label: noteEditDraft.label,
                        note: noteEditDraft.note,
                        color: noteEditDraft.color,
                      },
                    }
                  : node
              )
            );
            setShowNoteEditModal(false);
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
                  setEdges((eds) =>
                    eds.map((edge) =>
                      edge.id === edgeFilterModal.id
                        ? { ...edge, data: { ...edge.data, filters: edgeFilterModal.data?.filters || '' } }
                        : edge
                    )
                  );
                  setEdgeFilterModal(null);
                }}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-primary)] text-white hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowBuilder;
