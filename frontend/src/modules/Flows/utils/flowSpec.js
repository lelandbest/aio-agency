/**
 * Canonical AIO Flow Spec helpers
 * Defines the internal contract between Agents ⇄ Flows ⇄ Runner
 */

export const AIO_FLOW_SPEC_VERSION = 1;

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

  if (spec.nodes && spec.nodes.length > 0 && (!spec.edges || spec.edges.length === 0)) {
    warnings.push('No connections yet. The flow will not run as intended.');
  }

  const hasTrigger = spec.nodes?.some((node) => node.type === 'trigger');
  if (!hasTrigger) {
    warnings.push('No trigger node detected.');
  }

  return { blockers, warnings };
};
