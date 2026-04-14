import { createContext, useContext, useState, useCallback } from 'react';

const AIAssistContext = createContext(null);

export function AIAssistProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [assistMode, setAssistMode] = useState('brain'); // 'brain' or 'help'
  const [assistContext, setAssistContext] = useState(null);

  const openAIAssist = useCallback((args = {}) => {
    const { context = null } = args;
    const mode = args.mode || (context ? 'help' : 'brain');
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
      // If closing, we just close if it's the SAME mode.
      if (prev) {
        if (assistMode === mode) {
          return false;
        }
        // Switch mode and keep open
        setAssistMode(mode);
        setAssistContext(context);
        return true;
      }
      
      // If opening, set state and return true
      setAssistMode(mode);
      setAssistContext(context);
      return true;
    });
  }, [assistMode]);

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
