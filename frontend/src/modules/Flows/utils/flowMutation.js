/**
 * flowMutation.js
 * Mandatory utility for all INTERNAL runtime graph edits.
 * Handles node/edge additions, deletions, updates, and connections.
 */
import { buildFlowSpec, validateFlowSpec } from './flowSpec';
import { createNode } from '../data/nodeLibrary';

/**
 * Perform a controlled mutation on the flow graph.
 * Returns { nodes, edges, validation }
 * @param {boolean} [isSystemManaged=false] - if true, blocks all structural mutations
 */
export const mutateFlowGraph = (currentNodes, currentEdges, action, isSystemManaged = false) => {
  const { type, payload } = action;
  let nextNodes = [...currentNodes];
  let nextEdges = [...currentEdges];

  const STRUCTURAL_ACTIONS = new Set([
    'ADD_NODE',
    'DELETE_NODE',
    'COPY_NODE',
    'UPDATE_NODE_CONFIG',
    'ADD_NODE_FROM_TEMPLATE',
  ]);

  if (isSystemManaged && STRUCTURAL_ACTIONS.has(type)) {
    return {
      nodes: nextNodes,
      edges: nextEdges,
      validation: { blockers: [], warnings: [] },
      __blocked: true,
      __reason: 'system_managed_flow_locked',
    };
  }

  switch (type) {
    case 'ADD_NODE': {
      const { nodeTemplate, position } = payload;
      const newNode = createNode(nodeTemplate, position);
      
      // Safety: Prevent duplicate IDs in active session
      if (nextNodes.some(n => n.id === newNode.id)) {
        newNode.id = `${newNode.id}_${Date.now()}`;
      }
      
      // Rule: Replace ghost starter if exists
      const ghostIndex = nextNodes.findIndex(n => n.data?.isGhost);
      if (ghostIndex >= 0) {
        const ghost = nextNodes[ghostIndex];
        const replaced = { ...newNode, position: ghost.position };
        nextNodes = [...nextNodes.slice(0, ghostIndex), replaced, ...nextNodes.slice(ghostIndex + 1)];
      } else {
        nextNodes.push(newNode);
      }
      break;
    }

    case 'DELETE_NODE': {
      const { nodeId } = payload;
      // Rule: Remove node and ALL connected edges (Prevent orphans)
      nextNodes = nextNodes.filter(n => n.id !== nodeId);
      nextEdges = nextEdges.filter(e => e.source !== nodeId && e.target !== nodeId);
      break;
    }

    case 'COPY_NODE': {
      const { node } = payload;
      const timestamp = Date.now();
      const newNode = {
        ...node,
        id: `${node.id.split('_')[0]}_copy_${timestamp}`,
        position: { x: node.position.x + 40, y: node.position.y + 40 },
        selected: false,
      };
      nextNodes.push(newNode);
      break;
    }

    case 'CONNECT_EDGE': {
      const { connection, styleParams } = payload;
      // Rule: Add edge with standard styling
      const newEdge = {
        ...connection,
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: 'var(--color-accent)',
          strokeWidth: 2,
          strokeDasharray: '8 6',
          filter: 'none',
          ...(styleParams?.style || {}),
        },
        markerEnd: {
          type: 'arrowclosed',
          color: 'var(--color-accent)',
          ...(styleParams?.markerEnd || {}),
        },
        label: '\u2699',
        labelStyle: { fill: 'rgba(148,163,184,0.7)', fontSize: 12 },
        labelBgStyle: { fill: 'transparent' },
        labelBgPadding: [0, 0],
      };
      nextEdges.push(newEdge);
      break;
    }

    case 'UPDATE_NODE_CONFIG': {
      const { nodeId, config, dataUpdates = {} } = payload;
      nextNodes = nextNodes.map(n => 
        n.id === nodeId 
          ? { 
              ...n, 
              data: { 
                ...n.data, 
                ...dataUpdates,
                config: { ...(n.data?.config || {}), ...config } 
              } 
            } 
          : n
      );
      break;
    }

    case 'UPDATE_EDGE_DATA': {
        const { edgeId, data } = payload;
        nextEdges = nextEdges.map(e => 
          e.id === edgeId 
            ? { ...e, data: { ...(e.data || {}), ...data } } 
            : e
        );
        break;
    }

    case 'ALIGN_NODES': {
        const timestamp = Date.now();
        // Ensure all nodes have IDs and essential positions for layout
        nextNodes = nextNodes.map(n => ({
          ...n,
          id: n.id || `n-${timestamp}-${Math.random().toString(36).substring(7)}`,
        }));
        break;
    }

    default:
      console.warn(`mutateFlowGraph: Unknown action type "${type}"`);
  }

  // Final Validation Lock (Exclude ghost node from architectural spec)
  const realNodes = nextNodes.filter((n) => !n.data?.isGhost);
  const realNodeIds = new Set(realNodes.map((n) => n.id));
  const realEdges = nextEdges.filter((e) => realNodeIds.has(e.source) && realNodeIds.has(e.target));

  const spec = buildFlowSpec({ flow: {}, nodes: realNodes, edges: realEdges });
  const validation = validateFlowSpec(spec);

  return {
    nodes: nextNodes,
    edges: nextEdges,
    validation
  };
};
