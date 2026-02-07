/**
 * Flow Repository Pattern
 * Adapter interface for flow persistence (localStorage -> API later)
 */

import { generateULID } from './ulid';

export const createFlowRepository = () => {
  const STORAGE_KEY = 'aio_flows';

  const getAllFlows = () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to load flows:', error);
      return {};
    }
  };

  const getFlowById = (flowId) => {
    const flows = getAllFlows();
    return flows[flowId] || null;
  };

  const saveFlow = (flow) => {
    try {
      const flows = getAllFlows();
      flows[flow.id] = {
        ...flow,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
      return flow;
    } catch (error) {
      console.error('Failed to save flow:', error);
      throw error;
    }
  };

  const deleteFlow = (flowId) => {
    try {
      const flows = getAllFlows();
      delete flows[flowId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
    } catch (error) {
      console.error('Failed to delete flow:', error);
      throw error;
    }
  };

  const createNewFlow = (name = 'Untitled Flow') => {
    const flowId = generateULID();
    const now = new Date().toISOString();
    
    const newFlow = {
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
    };

    return saveFlow(newFlow);
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
