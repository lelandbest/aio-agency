import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const AIAssistContext = createContext(null);

export function AIAssistProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [assistMode, setAssistMode] = useState('brain');
  const [assistContext, setAssistContext] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(() => localStorage.getItem('aio_selected_agent') || null);
  const [isCollab, setIsCollab] = useState(() => localStorage.getItem('aio_is_collab') === 'true');
  const modeRef = useRef('brain');

  useEffect(() => {
    if (selectedAgent) localStorage.setItem('aio_selected_agent', selectedAgent);
    else localStorage.removeItem('aio_selected_agent');
  }, [selectedAgent]);

  useEffect(() => {
    localStorage.setItem('aio_is_collab', isCollab);
  }, [isCollab]);

  const openAIAssist = useCallback((args = {}) => {
    const { context = null, agent = null, collab = false } = args;
    const mode = args.mode || (context ? 'help' : 'brain');
    modeRef.current = mode;
    setAssistMode(mode);
    setAssistContext(context);
    setSelectedAgent(agent);
    setIsCollab(collab);
    setIsOpen(true);
  }, []);

  const closeAIAssist = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleAIAssist = useCallback((args = {}) => {
    const { context = null, agent = null, collab = false } = args;
    const mode = args.mode || (context ? 'help' : 'brain');
    
    setIsOpen(prev => {
      // If closing, we don't clear the agent/collab yet to keep identity persistence
      if (prev && modeRef.current === mode) {
        return false;
      }
      modeRef.current = mode;
      setAssistMode(mode);
      setAssistContext(context);
      if (agent !== undefined) setSelectedAgent(agent);
      if (collab !== undefined) setIsCollab(collab);
      return true;
    });
  }, []);

  return (
    <AIAssistContext.Provider value={{ 
      isOpen, 
      assistMode, 
      assistContext, 
      selectedAgent,
      setSelectedAgent,
      isCollab,
      setIsCollab,
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
