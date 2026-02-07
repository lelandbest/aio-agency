/**
 * API Client
 * Centralized HTTP client for making API requests
 */

import config from '../config/env';

class APIClient {
    constructor(baseURL = config.apiUrl) {
        this.baseURL = baseURL;
    }

    /**
     * Make HTTP request
     * @private
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const defaultHeaders = {
            'Content-Type': 'application/json',
        };

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers,
            },
        };

        try {
            const response = await fetch(url, config);

            // Handle non-JSON responses
            const contentType = response.headers.get('content-type');
            const isJSON = contentType && contentType.includes('application/json');

            const data = isJSON ? await response.json() : await response.text();

            if (!response.ok) {
                throw new APIError(
                    data.message || data.detail || 'Request failed',
                    response.status,
                    data
                );
            }

            return data;
        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }

            // Network or other errors
            throw new APIError(
                error.message || 'Network error',
                0,
                { originalError: error }
            );
        }
    }

    /**
     * GET request
     */
    async get(endpoint, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'GET',
        });
    }

    /**
     * POST request
     */
    async post(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    /**
     * PUT request
     */
    async put(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    /**
     * PATCH request
     */
    async patch(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    /**
     * DELETE request
     */
    async delete(endpoint, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'DELETE',
        });
    }
}

/**
 * Custom API Error class
 */
class APIError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
    }
}

// Export singleton instance
export const apiClient = new APIClient();

// Export class for testing
export { APIClient, APIError };

export default apiClient;
