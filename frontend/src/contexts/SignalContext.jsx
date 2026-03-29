import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const SignalContext = createContext(null);

export function SignalProvider({ children }) {
  const [signals, setSignals] = useState([]);
  const timeoutsRef = useRef(new Map());
  const maxSignals = 5;

  const addSignal = useCallback((signal) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    const type = signal.type || 'info';
    const duration = type === 'success' ? 4000 : null;
    
    setSignals(prev => {
      // For success signals, replace any existing success
      if (type === 'success') {
        prev.forEach(s => {
          if (s.type === 'success' && timeoutsRef.current.has(s.id)) {
            clearTimeout(timeoutsRef.current.get(s.id));
            timeoutsRef.current.delete(s.id);
          }
        });
        const filtered = prev.filter(s => s.type !== 'success');
        const newSignals = filtered.slice(0, maxSignals - 1);
        return [...newSignals, { ...signal, id, type, duration, timestamp: Date.now() }];
      }
      
      // For warnings/errors, allow stacking but cap at max
      const newSignals = prev.slice(0, maxSignals - 1);
      return [...newSignals, { ...signal, id, type, duration, timestamp: Date.now() }];
    });

    // Set timeout for success signals
    if (type === 'success' && duration) {
      const timeout = setTimeout(() => {
        setSignals(prev => prev.filter(s => s.id !== id));
        timeoutsRef.current.delete(id);
      }, duration);
      timeoutsRef.current.set(id, timeout);
    }

    return id;
  }, []);

  const removeSignal = useCallback((id) => {
    if (timeoutsRef.current.has(id)) {
      clearTimeout(timeoutsRef.current.get(id));
      timeoutsRef.current.delete(id);
    }
    setSignals(prev => prev.filter(s => s.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current.clear();
    setSignals([]);
  }, []);

  useEffect(() => {
    window.__signalContext = { addSignal, removeSignal, clearAll };
    return () => { delete window.__signalContext; };
  }, [addSignal, removeSignal, clearAll]);

  return (
    <SignalContext.Provider value={{ signals, addSignal, removeSignal, clearAll }}>
      {children}
    </SignalContext.Provider>
  );
}

export function useSignal() {
  const context = useContext(SignalContext);
  if (!context) {
    return { signals: [], addSignal: () => {}, removeSignal: () => {}, clearAll: () => {} };
  }
  return context;
}
