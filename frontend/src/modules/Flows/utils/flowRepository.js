/**
 * Flow Repository Pattern
 * Backend-backed flow persistence.
 */

import { FlowsService } from '../../../services/flows.service';
import { generateULID } from './ulid';

export const createFlowRepository = () => {
  const getAllFlows = async () => {
    const flows = await FlowsService.fetchFlows();
    return Object.fromEntries((flows || []).map((flow) => [flow.id, flow]));
  };

  const getFlowById = async (flowId) => {
    if (!flowId) {
      return null;
    }
    return FlowsService.getFlow(flowId);
  };

  const saveFlow = async (flow) => {
    const flowId = flow?.id || generateULID();
    return FlowsService.saveFlow(flowId, {
      ...flow,
      id: flowId,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteFlow = async () => {
    throw new Error('Flow deletion is not enabled.');
  };

  const createNewFlow = async (name = 'Untitled Flow') => {
    const flowId = generateULID();
    const now = new Date().toISOString();
    return saveFlow({
      id: flowId,
      name,
      status: 'Draft',
      nodes: [],
      edges: [],
      createdAt: now,
      updatedAt: now,
      createdBy: 'Current User',
      lastEditedBy: 'Current User',
      metadata: {
        version: 1,
        specVersion: 1,
        tenantId: null,
        brand: null,
        themePreset: null,
        themeOverrides: null,
        featureFlags: null,
        nodeCount: 0,
      },
      spec: null,
    });
  };

  return {
    getAllFlows,
    getFlowById,
    saveFlow,
    deleteFlow,
    createNewFlow,
  };
};

export default createFlowRepository();
