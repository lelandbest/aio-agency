import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * ThemeContext - Manages light/dark theme state across the application
 * 
 * Features:
 * - Light/dark/auto theme modes
 * - localStorage persistence
 * - System preference detection (prefers-color-scheme)
 * - Instant theme switching without page reload
 * 
 * Usage:
 * const { theme, setTheme } = useTheme();
 */

const ThemeContext = createContext();

/**
 * Hook to access theme context
 * Must be used within ThemeProvider
 */
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

/**
 * ThemeProvider Component
 * Wrap your app with this to enable theme functionality
 * 
 * Example:
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 */
export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState('auto');
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    // Get saved theme from localStorage
    const savedTheme = localStorage.getItem('aio-theme') || 'auto';
    setThemeState(savedTheme);
    setMounted(true);
  }, []);

  // Apply theme changes
  useEffect(() => {
    if (!mounted) return;

    // Determine actual theme (resolve 'auto')
    let actualTheme = theme;
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      actualTheme = prefersDark ? 'dark' : 'light';
    }

    // Apply theme to document element - MUST remove 'dark' class for light theme
    const root = document.documentElement;
    root.classList.remove('dark');
    
    if (actualTheme === 'dark') {
      root.classList.add('dark');
    }

    // Save theme preference to localStorage
    localStorage.setItem('aio-theme', theme);

    // Optional: Emit custom event for other parts of app
    window.dispatchEvent(
      new CustomEvent('themechange', { detail: { theme: actualTheme } })
    );
  }, [theme, mounted]);

  // Listen to system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      // Only auto-update if user selected 'auto' mode
      if (theme === 'auto') {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(mediaQuery.matches ? 'dark' : 'light');
      }
    };

    // Modern browsers
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme]);

  const setTheme = (newTheme) => {
    if (['light', 'dark', 'auto'].includes(newTheme)) {
      setThemeState(newTheme);
    }
  };

  const value = {
    theme,
    setTheme,
    mounted,
    // Helper methods
    isDark: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches),
    isLight: theme === 'light' || (theme === 'auto' && !window.matchMedia('(prefers-color-scheme: dark)').matches),
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
