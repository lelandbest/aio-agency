/**
 * flowIngestion.js
 * Single canonical ingestion pipeline for all flow sources.
 */
import { buildFlowSpec, validateFlowSpec } from './flowSpec';
import { MarkerType } from '@xyflow/react';

/**
 * Deep resolve variables in an object or array.
 */
const deepResolve = (obj, maps) => {
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      let resolved = obj;
      Object.entries(maps).forEach(([key, value]) => {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        resolved = resolved.replace(new RegExp(escapedKey, 'g'), value);
      });
      return resolved;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepResolve(item, maps));
  }
  const newObj = {};
  Object.entries(obj).forEach(([k, v]) => {
    newObj[k] = deepResolve(v, maps);
  });
  return newObj;
};

/**
 * Ingest a flow source and return normalized nodes, edges, spec, and validation results.
 * Supports: ingestFlowSource(data, { source: '...' }) OR ingestFlowSource({ nodes, edges, source: '...' })
 */
export const ingestFlowSource = (input, options = {}) => {
  if (!input) {
    return { nodes: [], edges: [], spec: null, validation: { blockers: ['Input is null or undefined.'], warnings: [] } };
  }

  // Determine active source/mode
  const activeSource = input.source || options.source || options.mode || 'draft';
  const mappings = options.mappings || {};

  // Clone input to ensure no mutations
  const data = JSON.parse(JSON.stringify(input));
  let nodes = data.nodes || data.draftSpec?.nodes || [];
  let edges = data.edges || data.draftSpec?.edges || [];

  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return { nodes: [], edges: [], spec: null, validation: { blockers: ['Input must contain nodes and edges arrays.'], warnings: [] } };
  }

  const timestamp = Date.now();
  const randomSuffix = () => Math.random().toString(36).substring(2, 8);

  // 1. Deep Resolve Variables (Mappings)
  if (Object.keys(mappings).length > 0) {
    nodes = nodes.map(node => ({
      ...node,
      data: deepResolve(node.data, mappings)
    }));
  }

  // 2. Transform Nodes & Build ID Map
  const oldToNewIdMap = {};
  const normalizedNodes = nodes.map((node) => {
    const isExternal = ['template', 'ai'].includes(activeSource);
    
    // ID Handling (Remap for external sources to prevent collisions)
    let newId = node.id;
    if (activeSource === 'template') {
       newId = `${node.id}_${timestamp}_${randomSuffix()}`;
       oldToNewIdMap[node.id] = newId;
    } else if (activeSource === 'ai' && !node.id.includes('_')) {
       newId = `${node.id}_${timestamp}`;
       oldToNewIdMap[node.id] = newId;
    }

    // Industrial Style Normalization
    const typeLabelMap = {
      trigger: 'Trigger',
      action: 'Action',
      logic: 'Logic',
      webhook: 'Webhook',
      socket: 'Socket',
    };

    const nNode = {
      ...node,
      id: newId,
      sourcePosition: node.sourcePosition || 'right',
      targetPosition: node.targetPosition || 'left',
      data: {
        ...node.data,
        typeLabel: node.data?.typeLabel || typeLabelMap[node.type] || 'Node',
        nodeColor: node.data?.nodeColor || (node.type === 'trigger' ? 'trigger' : 'action'),
      },
    };

    // Apply specific offsets for template injection
    if (activeSource === 'template') {
      nNode.position = {
        x: (node.position?.x || 0) + 40,
        y: (node.position?.y || 0) + 40,
      };
    }

    return nNode;
  });

  // 3. Transform Edges & Remap Source/Target
  const normalizedEdges = edges.map((edge) => {
    let sourceId = edge.source;
    let targetId = edge.target;
    let newId = edge.id;

    if (['template', 'ai'].includes(activeSource)) {
      sourceId = oldToNewIdMap[edge.source] || edge.source;
      targetId = oldToNewIdMap[edge.target] || edge.target;
      newId = `${edge.id}_${timestamp}_${randomSuffix()}`;
    }

    // Edge Integrity Check
    const destinationNodeExists = normalizedNodes.some(n => n.id === targetId);
    const sourceNodeExists = normalizedNodes.some(n => n.id === sourceId);
    
    if (!destinationNodeExists || !sourceNodeExists) {
        return null;
    }

    return {
      ...edge,
      id: newId,
      source: sourceId,
      target: targetId,
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
    };
  }).filter(Boolean);

  // 4. Build & Validate FlowSpec (Canonical Gate)
  const resultSpec = buildFlowSpec({ 
    flow: data.flow || data, 
    nodes: normalizedNodes, 
    edges: normalizedEdges 
  });
  
  const validation = validateFlowSpec(resultSpec);

  return {
    nodes: normalizedNodes,
    edges: normalizedEdges,
    spec: resultSpec,
    validation
  };
};
