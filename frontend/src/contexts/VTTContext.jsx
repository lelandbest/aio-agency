import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export const VTTContext = createContext(null);

export function VTTProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isArmed, setIsArmed] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [pendingPayload, setPendingPayload] = useState(null);

  const openVTT  = useCallback(() => setIsOpen(true),  []);
  const closeVTT = useCallback(() => { 
    setIsOpen(false); 
    setIsListening(false); 
    setIsArmed(false); 
  }, []);
  const toggleVTT = useCallback(() => setIsOpen(prev => !prev), []);

  const clearTranscript = useCallback(() => setTranscript(''), []);

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { id: Date.now(), ...msg }]);
  }, []);

  const addCommandMessage = useCallback((phrase, result) => {
    addMessage({ role: 'command', phrase, result, ts: new Date().toISOString() });
  }, [addMessage]);

  const addCharlieMessage = useCallback((text, result) => {
    addMessage({ role: 'charlie', text, result, ts: new Date().toISOString() });
  }, [addMessage]);

  const arm = useCallback(() => {
    setIsArmed(true);
  }, []);

  const disarm = useCallback(() => {
    setIsArmed(false);
  }, []);

  return (
    <VTTContext.Provider value={{
      isOpen,
      isListening,
      isArmed,
      transcript,
      messages,
      pendingPayload,
      openVTT,
      closeVTT,
      toggleVTT,
      setIsOpen,
      setIsListening,
      setTranscript,
      addMessage,
      addCommandMessage,
      addCharlieMessage,
      clearTranscript,
      setPendingPayload,
      arm,
      disarm,
    }}>
      {children}
    </VTTContext.Provider>
  );
}

export function useVTT() {
  const ctx = useContext(VTTContext);
  if (!ctx) return {
    isOpen: false, isListening: false, isArmed: false, transcript: '',
    messages: [], pendingPayload: null,
    openVTT: () => {}, closeVTT: () => {}, toggleVTT: () => {}, setIsOpen: () => {},
    setIsListening: () => {}, setTranscript: () => {},
    addMessage: () => {}, addCommandMessage: () => {}, addCharlieMessage: () => {},
    clearTranscript: () => {}, setPendingPayload: () => {}, arm: () => {}, disarm: () => {},
  };
  return ctx;
}
