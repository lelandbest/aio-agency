import { createContext, useContext, useState, useCallback, useRef } from 'react';

const AIAssistContext = createContext(null);

export function AIAssistProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [assistMode, setAssistMode] = useState('brain');
  const [assistContext, setAssistContext] = useState(null);
  const modeRef = useRef('brain');

  const openAIAssist = useCallback((args = {}) => {
    const { context = null } = args;
    const mode = args.mode || (context ? 'help' : 'brain');
    modeRef.current = mode;
    setAssistMode(mode);
    setAssistContext(context);
    setIsOpen(true);
  }, []);

  const closeAIAssist = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleAIAssist = useCallback((args = {}) => {
    const { context = null } = args;
    const mode = args.mode || (context ? 'help' : 'brain');
    
    setIsOpen(prev => {
      if (prev && modeRef.current === mode) {
        return false;
      }
      modeRef.current = mode;
      setAssistMode(mode);
      setAssistContext(context);
      return true;
    });
  }, []);

  return (
    <AIAssistContext.Provider value={{ 
      isOpen, 
      assistMode, 
      assistContext, 
      openAIAssist, 
      closeAIAssist, 
      toggleAIAssist 
    }}>
      {children}
    </AIAssistContext.Provider>
  );
}

export function useAIAssist() {
  const context = useContext(AIAssistContext);
  if (!context) {
    return { 
      isOpen: false, 
      assistMode: 'brain', 
      assistContext: null,
      openAIAssist: () => {}, 
      closeAIAssist: () => {}, 
      toggleAIAssist: () => {} 
    };
  }
  return context;
}
