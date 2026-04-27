import { getFlowsApi } from './backendApi';

export const FlowsService = {
  async fetchFlows() {
    return await getFlowsApi();
  },
};