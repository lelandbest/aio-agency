import React, { useState, useCallback, useRef } from 'react';
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
import NodeLibraryPanel from './components/NodeLibraryPanel';
import AutomationInfoPanel from './components/AutomationInfoPanel';
import NodeConfigPanel from './components/NodeConfigPanel';
import CustomNode from './components/nodes/CustomNode';
import { initialNodes, initialEdges } from './data/initialFlowData';

// Define custom node types
const nodeTypes = {
  trigger: CustomNode,
  action: CustomNode,
  logic: CustomNode,
  webhook: CustomNode,
};

const FlowBuilder = () => {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [automationInfo, setAutomationInfo] = useState({
    name: 'New Customer Onboarding Flow',
    status: 'Draft',
    createdBy: 'John Doe',
    editedBy: 'Jane Smith',
    nodeCount: 5,
    lastEdited: '2 hours ago',
  });

  // Handle edge connection
  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            animated: true,
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
          },
          eds
        )
      ),
    [setEdges]
  );

  // Handle drag over
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle drop from node library
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('label');
      const category = event.dataTransfer.getData('category');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: {
          label,
          category,
          config: {},
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setAutomationInfo((prev) => ({
        ...prev,
        nodeCount: prev.nodeCount + 1,
      }));
    },
    [reactFlowInstance, setNodes]
  );

  // Handle node click
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
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
      setSelectedNode(null);
    },
    [setNodes]
  );

  // Handle automation info update
  const handleAutomationUpdate = useCallback((updates) => {
    setAutomationInfo((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <div className="flex h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Left Panel - Node Library */}
      <NodeLibraryPanel />

      {/* Center - Flow Canvas */}
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-gray-50 dark:bg-gray-900"
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
          }}
        >
          <Background
            color="currentColor"
            className="text-gray-300 dark:text-gray-700"
            gap={16}
            size={1}
          />
          <Controls className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg" />
          <MiniMap
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
            nodeColor={(node) => {
              switch (node.type) {
                case 'trigger':
                  return '#10b981';
                case 'action':
                  return '#3b82f6';
                case 'logic':
                  return '#f59e0b';
                case 'webhook':
                  return '#8b5cf6';
                default:
                  return '#6b7280';
              }
            }}
          />
        </ReactFlow>
      </div>

      {/* Right Panel - Automation Info */}
      <AutomationInfoPanel
        automationInfo={automationInfo}
        onUpdate={handleAutomationUpdate}
      />

      {/* Node Configuration Panel */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onSave={handleConfigSave}
        />
      )}
    </div>
  );
};

export default FlowBuilder;
