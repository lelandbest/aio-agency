import { createContext, useContext } from 'react';

/**
 * Database Context
 * Provides access to mock database throughout the app
 * Will be swapped to real Supabase later
 */
const DbContext = createContext();

/**
 * Hook to access database context
 * Must be used within DbProvider
 */
export const useDb = () => {
    const context = useContext(DbContext);
    if (!context) {
        throw new Error('useDb must be used within DbProvider');
    }
    return context;
};

export default DbContext;
