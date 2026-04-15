import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * ThemeContext - Manages global forced dark theme across the application.
 * Locked to Dark Mode by architectural mandate.
 */

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // Theme is locked to dark as part of the system-level aesthetic mandate.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Apply forced dark theme
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
    
    // Save theme preference to localStorage for reload consistency
    localStorage.setItem('aio-theme', 'dark');

    window.dispatchEvent(
      new CustomEvent('themechange', { detail: { theme: 'dark' } })
    );
  }, [mounted]);

  const setTheme = () => {
    console.warn('Theme switching is disabled. Forced Dark Mode is active.');
  };

  const value = {
    theme: 'dark',
    setTheme,
    mounted,
    isDark: true,
    isLight: false,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
