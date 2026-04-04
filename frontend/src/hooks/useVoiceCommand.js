import { useEffect, useRef, useCallback } from 'react';

const ARM_DELAY_MS = 2000;

export function useVoiceCommand({ onTranscript, onCommand, onConversational, onError }) {
  const isHoldingRef   = useRef(false);
  const isArmedRef     = useRef(false);
  const armTimerRef    = useRef(null);
  const recognitionRef = useRef(null);
  const isSupported    = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const _isInput = (e) => {
    const t = e.target;
    if (!t) return false;
    const tag = t.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || t.isContentEditable;
  };

  const startRecognition = useCallback(() => {
    if (!isSupported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
    };
    rec.onerror = (event) => {
      if (event.error !== 'no-speech') {
        onError?.(event.error);
      }
    };
    rec.onend = () => { recognitionRef.current = null; };
    rec.start();
    recognitionRef.current = rec;
  }, [isSupported, onTranscript, onError]);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  const onKeyDown = useCallback((e) => {
    if (e.key !== 'Control') return;
    if (e.repeat) return;
    if (_isInput(e)) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    if (isHoldingRef.current) return;
    isHoldingRef.current = true;
    armTimerRef.current = setTimeout(() => {
      isArmedRef.current = true;
      startRecognition();
    }, ARM_DELAY_MS);
  }, [startRecognition]);

  const onKeyUp = useCallback((e) => {
    if (e.key !== 'Control') return;
    if (_isInput(e)) return;
    isHoldingRef.current = false;
    clearTimeout(armTimerRef.current);
    if (isArmedRef.current) {
      isArmedRef.current = false;
      stopRecognition();
    }
  }, [stopRecognition]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      clearTimeout(armTimerRef.current);
      stopRecognition();
    };
  }, [onKeyDown, onKeyUp, stopRecognition]);

  return { isSupported };
}
