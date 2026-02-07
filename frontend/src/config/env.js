/**
 * Environment Configuration
 * Validates and exports environment variables
 */

// Frontend environment variables
const VITE_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Optional environment variables
const VITE_HOSTED = String(import.meta.env.VITE_HOSTED || '').toLowerCase() === 'true';
const VITE_PUBLIC_HOST = import.meta.env.VITE_PUBLIC_HOST || '';
const VITE_PORT = Number(import.meta.env.VITE_PORT || 5173);

// Export configuration
export const config = {
    apiUrl: VITE_API_URL,
    supabase: {
        url: VITE_SUPABASE_URL,
        anonKey: VITE_SUPABASE_ANON_KEY,
    },
    isHosted: VITE_HOSTED,
    publicHost: VITE_PUBLIC_HOST,
    port: VITE_PORT,
    isDevelopment: import.meta.env.DEV,
    isProduction: import.meta.env.PROD,
};

// Log configuration in development
if (config.isDevelopment) {
    console.log('🔧 Environment Configuration:', {
        apiUrl: config.apiUrl,
        isHosted: config.isHosted,
        port: config.port,
    });
}

export default config;
