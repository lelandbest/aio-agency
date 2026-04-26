const TOKEN_PATTERN = /\{\{nodes\.([^.}]+?)\.([^}]+?)\}\}/g;

export const computeTokenTrace = (nodeId, nodes, edges) => {
  if (!nodeId || !Array.isArray(nodes) || !Array.isArray(edges)) {
    return { downstreamCount: 0, downstreamNodes: [] };
  }

  const downstreamNodeIds = new Set();

  const outgoingEdges = edges.filter((e) => e.source === nodeId);
  const directTargets = new Set(outgoingEdges.map((e) => e.target));

  const visited = new Set();
  const queue = [...directTargets];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    downstreamNodeIds.add(currentId);

    const furtherEdges = edges.filter((e) => e.source === currentId);
    for (const edge of furtherEdges) {
      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  const referencingNodes = nodes.filter((node) => {
    if (!downstreamNodeIds.has(node.id)) return false;
    const configStr = JSON.stringify(node.data?.config || {});
    const nodeMatchPattern = new RegExp(
      `\\{\\{nodes\\.${nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`,
      'g'
    );
    return nodeMatchPattern.test(configStr);
  });

  return {
    downstreamCount: referencingNodes.length,
    downstreamNodes: referencingNodes.map((n) => ({
      id: n.id,
      label: n.data?.label || n.id,
      type: n.type || 'node',
    })),
  };
};

export const findStepForNode = (nodeId, runDetail) => {
  if (!nodeId || !runDetail || !Array.isArray(runDetail.steps)) return null;

  for (const step of runDetail.steps) {
    const stepNodeId =
      (step.parameters?.node_id || step.parameters?.nodeId || '').trim();
    if (stepNodeId === nodeId) return step;

    if (step.raw) {
      const rawNodeId =
        (step.raw.parameters?.node_id || step.raw.parameters?.nodeId || '').trim();
      if (rawNodeId === nodeId) return step;
    }
  }

  return null;
};