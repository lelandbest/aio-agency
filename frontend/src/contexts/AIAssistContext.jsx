import { createContext, useContext, useState, useCallback } from 'react';

const AIAssistContext = createContext(null);

export function AIAssistProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  const openAIAssist = useCallback(() => setIsOpen(true), []);
  const closeAIAssist = useCallback(() => setIsOpen(false), []);
  const toggleAIAssist = useCallback(() => setIsOpen(prev => !prev), []);

  return (
    <AIAssistContext.Provider value={{ isOpen, openAIAssist, closeAIAssist, toggleAIAssist }}>
      {children}
    </AIAssistContext.Provider>
  );
}

export function useAIAssist() {
  const context = useContext(AIAssistContext);
  if (!context) {
    return { openAIAssist: () => {}, closeAIAssist: () => {}, toggleAIAssist: () => {}, isOpen: false };
  }
  return context;
}
