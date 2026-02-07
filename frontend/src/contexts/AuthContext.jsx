import { createContext, useContext } from 'react';

/**
 * Auth Context
 * Manages authentication state throughout the app
 */
const AuthContext = createContext();

/**
 * Hook to access auth context
 * Must be used within AuthProvider
 */
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export default AuthContext;
