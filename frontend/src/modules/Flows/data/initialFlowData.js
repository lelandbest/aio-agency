/**
 * Initial Flow Data
 * Default empty flow with seed trigger node
 */

export const createInitialFlow = () => {
  const now = new Date().toISOString();
  
  return {
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 240, y: 220 },
        data: {
          label: 'Manual Trigger',
          description: 'Start flow manually',
          nodeColor: 'trigger',
          isSocket: false,
          config: {},
        },
      },
    ],
    edges: [],
  };
};

/**
 * Flow state structure
 * Complete flow object with metadata
 */
export const createFlowState = (id = null, name = 'Untitled Flow') => {
  const initial = createInitialFlow();
  
  return {
    id,
    name,
    status: 'Draft',
    nodes: initial.nodes,
    edges: initial.edges,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'Current User',
    lastEditedBy: 'Current User',
    metadata: {
      version: 1,
      nodeCount: initial.nodes.length,
    },
  };
};
