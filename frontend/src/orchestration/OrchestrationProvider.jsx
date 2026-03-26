import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { registerOrchestrator } from './dispatcher';
import { getOrchestrationHistory, getOrchestrationStats } from './orchestrationLogger';
import Orchestrator from './Orchestrator';

const OrchestrationContext = createContext(null);

export const useOrchestration = () => {
  const context = useContext(OrchestrationContext);
  if (!context) {
    throw new Error('useOrchestration must be used within OrchestrationProvider');
  }
  return context;
};

export const OrchestrationProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingContext, setPendingContext] = useState(null);

  const openOrchestrator = useCallback((context) => {
    setPendingContext(context);
    setIsOpen(true);
  }, []);

  const closeOrchestrator = useCallback(() => {
    setIsOpen(false);
    setPendingContext(null);
  }, []);

  const getHistory = useCallback(() => {
    return getOrchestrationHistory();
  }, []);

  const getStats = useCallback(() => {
    return getOrchestrationStats();
  }, []);

  useEffect(() => {
    registerOrchestrator(openOrchestrator);
  }, [openOrchestrator]);

  return (
    <OrchestrationContext.Provider value={{ 
      openOrchestrator, 
      closeOrchestrator,
      getOrchestrationHistory: getHistory,
      getOrchestrationStats: getStats
    }}>
      {children}
      <Orchestrator 
        isOpen={isOpen} 
        onClose={closeOrchestrator} 
        context={pendingContext}
      />
    </OrchestrationContext.Provider>
  );
};

export default OrchestrationProvider;
