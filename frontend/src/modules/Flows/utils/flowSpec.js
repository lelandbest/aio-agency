/**
 * Canonical AIO Flow Spec helpers
 * Defines the internal contract between Agents ⇄ Flows ⇄ Runner
 */

export const AIO_FLOW_SPEC_VERSION = 1;

const EXECUTABLE_NODE_TYPES = new Set(['action', 'logic', 'webhook', 'socket', 'input']);
const SUPPORTED_LOGIC_OPERATORS = new Set([
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'contains',
  'not_contains',
  'is_empty',
  'is_not_empty',
]);

const normalizeNodeKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

const parseJsonObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const inferNodeIntent = (node = {}) => {
  const data = node.data || {};
  const config = data.config || {};
  const templateId = normalizeNodeKey(data.templateId || node.templateId || '');
  const actionType = normalizeNodeKey(config.actionType || data.actionType || '');
  const logicType = normalizeNodeKey(config.logicType || data.logicType || '');
  if (actionType) return actionType;
  if (logicType === 'delay') return 'time_delay';
  if (logicType) return logicType;
  if (templateId === 'time_delay' || templateId === 'delay') return 'time_delay';
  return templateId;
};

const edgeDescriptor = (edge = {}) => {
  const data = edge.data && typeof edge.data === 'object' ? edge.data : {};
  return [edge.sourceHandle, edge.label, data.label, data.filters, edge.filters]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
};

export const buildFlowSpec = ({ flow, nodes, edges }) => {
  return {
    version: AIO_FLOW_SPEC_VERSION,
    metadata: {
      id: flow?.id || null,
      name: flow?.name || 'Untitled Flow',
      status: flow?.status || 'Draft',
      createdBy: flow?.createdBy || 'Current User',
      updatedBy: flow?.lastEditedBy || 'Current User',
      tenantId: flow?.metadata?.tenantId || null,
      brand: flow?.metadata?.brand || null,
      themePreset: flow?.metadata?.themePreset || null,
      themeOverrides: flow?.metadata?.themeOverrides || null,
      featureFlags: flow?.metadata?.featureFlags || null,
      createdAt: flow?.createdAt || new Date().toISOString(),
      updatedAt: flow?.updatedAt || new Date().toISOString(),
    },
    nodes: (nodes || []).map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data || {},
    })),
    edges: (edges || []).map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || null,
      targetHandle: edge.targetHandle || null,
      data: edge.data || {},
    })),
  };
};

export const validateFlowSpec = (spec) => {
  const blockers = [];
  const warnings = [];

  if (!spec) {
    blockers.push('Flow spec is missing.');
    return { blockers, warnings };
  }

  if (!spec.nodes || spec.nodes.length === 0) {
    blockers.push('Add at least one node before activation.');
  }

  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec.edges) ? spec.edges : [];
  const nodeIds = new Set();
  const duplicateNodeIds = new Set();
  const outgoingByNode = new Map();
  const incomingByNode = new Map();

  nodes.forEach((node) => {
    const nodeId = String(node?.id || '').trim();
    if (!nodeId) {
      blockers.push('Every node must have a stable id.');
      return;
    }
    if (nodeIds.has(nodeId)) {
      duplicateNodeIds.add(nodeId);
    }
    nodeIds.add(nodeId);
    outgoingByNode.set(nodeId, []);
    incomingByNode.set(nodeId, []);
  });

  duplicateNodeIds.forEach((nodeId) => {
    blockers.push(`Duplicate node id detected: ${nodeId}.`);
  });

  edges.forEach((edge) => {
    const source = String(edge?.source || '').trim();
    const target = String(edge?.target || '').trim();
    if (!source || !target) {
      blockers.push('Every edge must define both a source and target.');
      return;
    }
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      blockers.push(`Edge ${edge?.id || `${source}->${target}`} references a missing node.`);
      return;
    }
    outgoingByNode.get(source)?.push(edge);
    incomingByNode.get(target)?.push(edge);
  });

  if (nodes.length > 0 && edges.length === 0) {
    warnings.push('No connections yet. The flow will not run as intended.');
  }

  const triggerNodes = nodes.filter((node) => node.type === 'trigger');
  const hasTrigger = triggerNodes.length > 0;
  if (!hasTrigger) {
    blockers.push('Add at least one trigger node before activation.');
  }

  const reachable = new Set();
  const stack = triggerNodes.map((node) => node.id);
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    (outgoingByNode.get(current) || []).forEach((edge) => {
      if (edge.target && !reachable.has(edge.target)) {
        stack.push(edge.target);
      }
    });
  }

  nodes.forEach((node) => {
    const nodeId = String(node?.id || '').trim();
    const nodeType = String(node?.type || '').trim().toLowerCase();
    const config = node?.data?.config || {};
    const parsedCondition = parseJsonObject(config.condition);
    const intent = inferNodeIntent(node);
    const outgoingEdges = outgoingByNode.get(nodeId) || [];
    const incomingEdges = incomingByNode.get(nodeId) || [];

    if (!nodeId) {
      return;
    }

    if (EXECUTABLE_NODE_TYPES.has(nodeType) && !reachable.has(nodeId)) {
      blockers.push(`${node?.data?.label || nodeId} is not reachable from any trigger.`);
    }

    if (EXECUTABLE_NODE_TYPES.has(nodeType) && incomingEdges.length === 0) {
      blockers.push(`${node?.data?.label || nodeId} is missing an inbound connection.`);
    }

    if (nodeType === 'action' && !normalizeNodeKey(config.actionType || node?.data?.actionType || node?.data?.templateId)) {
      blockers.push(`${node?.data?.label || nodeId} is missing an action type.`);
    }

    if (intent === 'generate_video') {
      if (!String(config.templateId || '').trim()) {
        blockers.push(`${node?.data?.label || nodeId} is missing a media template id.`);
      }
      if (!String(config.outputTarget || '').trim()) {
        blockers.push(`${node?.data?.label || nodeId} is missing an output target.`);
      }
    }

    if (intent === 'generate_script') {
      if (!String(config.topic || config.inputs?.topic || '').trim()) {
        blockers.push(`${node?.data?.label || nodeId} is missing a topic.`);
      }
    }

  if (intent === 'generate_run_of_show') {
    if (!String(config.topic || '').trim()) {
      blockers.push(`${node?.data?.label || nodeId} is missing a topic.`);
    }
    if (!String(config.duration || '').trim()) {
      blockers.push(`${node?.data?.label || nodeId} is missing a duration.`);
    }
  }

  if (intent === 'generate_transcript_intelligence') {
    const transcriptText = String(config.transcriptText || config.transcript_text || '').trim();
    if (!transcriptText) {
      blockers.push(`${node?.data?.label || nodeId} is missing transcript text.`);
    }
  }

  if (intent === 'generate_voice') {
      const text = String(config.text || config.script || config.scriptText || config.inputs?.text || '').trim();
      if (!text) {
        blockers.push(`${node?.data?.label || nodeId} is missing text or script input.`);
      }
    }

    if (intent === 'text_to_speech') {
      const text = String(config.text || config.script || config.scriptText || config.inputs?.text || '').trim();
      if (!text) {
        blockers.push(`${node?.data?.label || nodeId} is missing text or script input.`);
      }
    }

    if (intent === 'generate_thumbnail') {
      if (!String(config.title || '').trim()) {
        blockers.push(`${node?.data?.label || nodeId} is missing a title.`);
      }
    }

    if (intent === 'publish_asset') {
      if (!String(config.publishTarget || '').trim()) {
        blockers.push(`${node?.data?.label || nodeId} is missing a publish target.`);
      }
    }

    if (intent === 'transcribe_media') {
      const sourceType = String(config.sourceType || '').trim();
      const sourceRef = String(config.sourceRef || '').trim();
      if (!sourceType) {
        blockers.push(`${node?.data?.label || nodeId} is missing a source type.`);
      }
      if (!sourceRef) {
        blockers.push(`${node?.data?.label || nodeId} is missing a source reference.`);
      }
    }

    if (intent === 'ingest_meeting_artifacts') {
      const meetingProvider = String(config.meetingProvider || '').trim();
      const meetingRef = String(config.meetingRef || '').trim();
      if (!meetingProvider) {
        blockers.push(`${node?.data?.label || nodeId} is missing a meeting provider.`);
      }
      if (!meetingRef) {
        blockers.push(`${node?.data?.label || nodeId} is missing a meeting reference.`);
      }
    }

    if (nodeType === 'logic' && !normalizeNodeKey(config.logicType || node?.data?.logicType || node?.data?.templateId)) {
      blockers.push(`${node?.data?.label || nodeId} is missing a logic type.`);
    }

    if (intent === 'if_then' || intent === 'filter') {
      const operator = normalizeNodeKey(config.operator || config.comparison || parsedCondition.operator || parsedCondition.comparison);
      const left = config.left ?? config.leftOperand ?? parsedCondition.left ?? parsedCondition.leftOperand;
      const right = config.right ?? config.rightOperand ?? parsedCondition.right ?? parsedCondition.rightOperand;
      const unary = operator === 'is_empty' || operator === 'is_not_empty';
      const descriptors = outgoingEdges.map(edgeDescriptor).filter(Boolean);
      if (!operator || !SUPPORTED_LOGIC_OPERATORS.has(operator)) {
        blockers.push(`${node?.data?.label || nodeId} is missing a supported ${intent === 'if_then' ? 'If/Then' : 'Filter'} operator.`);
      }
      if (left === undefined || left === null || String(left).trim() === '') {
        blockers.push(`${node?.data?.label || nodeId} is missing the left operand.`);
      }
      if (!unary && (right === undefined || right === null || String(right).trim() === '')) {
        blockers.push(`${node?.data?.label || nodeId} is missing the right operand.`);
      }
      if (outgoingEdges.length > 1 && descriptors.length === 0) {
        blockers.push(`${node?.data?.label || nodeId} has ambiguous branch routing. Label outgoing edges for true/false routing.`);
      }
    }

    if (intent === 'switch') {
      const source = config.source ?? config.value ?? config.switchValue ?? parsedCondition.source ?? parsedCondition.value ?? parsedCondition.switchValue;
      if (source === undefined || source === null || String(source).trim() === '') {
        blockers.push(`${node?.data?.label || nodeId} is missing a switch source value.`);
      }
      if (outgoingEdges.length === 0) {
        blockers.push(`${node?.data?.label || nodeId} requires labeled outgoing edges.`);
      }
      if (outgoingEdges.some((edge) => !edgeDescriptor(edge))) {
        blockers.push(`${node?.data?.label || nodeId} has unlabeled switch branches.`);
      }
    }

    if (intent === 'time_delay') {
      const duration = config.duration;
      const unit = normalizeNodeKey(config.unit);
      if (duration === undefined || duration === null || String(duration).trim() === '') {
        blockers.push(`${node?.data?.label || nodeId} is missing a delay duration.`);
      }
      if (!unit) {
        blockers.push(`${node?.data?.label || nodeId} is missing a delay unit.`);
      }
      if (outgoingEdges.length !== 1) {
        blockers.push(`${node?.data?.label || nodeId} must have exactly one downstream edge.`);
      }
    }

    if (outgoingEdges.length === 0 && EXECUTABLE_NODE_TYPES.has(nodeType) && nodeType !== 'action') {
      warnings.push(`${node?.data?.label || nodeId} has no downstream connection.`);
    }
  });

  return { blockers, warnings };
};
