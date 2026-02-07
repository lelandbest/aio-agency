/**
 * Health API Service
 * Endpoints for checking backend health
 */

import apiClient from './client';

export const healthApi = {
    /**
     * Check backend health
     * @returns {Promise<Object>} Health status
     */
    check: async () => {
        return apiClient.get('/api/health');
    },

    /**
     * Get API root information
     * @returns {Promise<Object>} API information
     */
    getInfo: async () => {
        return apiClient.get('/api/');
    },
};

export default healthApi;
