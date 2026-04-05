import { useEffect, useRef, useCallback } from 'react';

// CTRL hold-to-talk PTT with Session-Locked Authorization.
// 1. Mic starts on KeyDown (pre-warm).
// 2. After 1s, the CURRENT session is authorized for capture.
// 3. Release stops mic; the result is processed only if that session was authorized.

/** Play a brief soft open-channel tone so the operator knows the mic is live. */
function playPTTBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;          // A5 — clear but not sharp
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.01);  // fast attack
    gain.gain.linearRampToValueAtTime(0,    ctx.currentTime + 0.12);  // smooth decay
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.13);
    osc.onended = () => ctx.close();
  } catch {}
}

const ARM_DELAY_MS = 1000;

export function useVoiceCommand({ onTranscript, onCommand, onConversational, onError, deviceId, setIsListening, inputRef, arm, disarm }) {
  const isHoldingRef     = useRef(false);
  const sessionActiveRef = useRef(null); // stores the current authorized session ID
  const armTimerRef      = useRef(null);
  const recognitionRef   = useRef(null);
  const isSupported      = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const _isInput = (e) => {
    const t = e.target;
    if (!t) return false;
    const tag = t.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || t.isContentEditable;
  };

  const stopRecognition = useCallback((abort = false) => {
    if (recognitionRef.current) {
      if (abort) recognitionRef.current.abort();
      else recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (setIsListening) setIsListening(false);
  }, [setIsListening]);

  const startRecognition = useCallback(() => {
    if (!isSupported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;

    // Unique ID for this specific PTT session
    const sessionId = Date.now();
    rec._sessionId = sessionId;
    sessionActiveRef.current = { id: sessionId, authorized: false };

    rec.onstart = () => {};
    rec.onend = () => {
      if (recognitionRef.current?._sessionId === sessionId) {
        recognitionRef.current = null;
      }
    };

    rec.onerror = (e) => {
      if (e.error !== 'aborted') {
        console.error('VTT ERROR:', e);
        onError?.(e.error);
      }
      if (sessionActiveRef.current?.id === sessionId) {
        disarm?.();
        if (setIsListening) setIsListening(false);
      }
    };

    rec.onresult = (e) => {
      // Check if THIS specific session was ever authorized
      if (sessionActiveRef.current?.id === sessionId && sessionActiveRef.current?.authorized) {
        const text = e.results?.[0]?.[0]?.transcript || '';
        if (text) onTranscript(text);
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch (err) {
      console.warn('rec.start blocked:', err);
    }
  }, [isSupported, onTranscript, onError, setIsListening, disarm]);

  const onKeyDown = useCallback((e) => {
    // 1. Shortcut Protection
    if (e.key !== 'Control' && e.ctrlKey) {
      clearTimeout(armTimerRef.current);
      if (sessionActiveRef.current) sessionActiveRef.current.authorized = false;
      stopRecognition(true);
      disarm?.();
      return;
    }

    if (e.key !== 'Control') return;
    if (e.repeat) return;
    if (_isInput(e)) {
      if (inputRef?.current && document.activeElement === inputRef.current) {
        inputRef.current.blur();
      } else {
        return;
      }
    }
    
    if (isHoldingRef.current) return;
    isHoldingRef.current = true;

    // Pre-warm mic immediately
    startRecognition();

    armTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current && sessionActiveRef.current) {
        sessionActiveRef.current.authorized = true;
        arm?.(); 
        playPTTBeep();
        if (setIsListening) setIsListening(true);
      }
    }, ARM_DELAY_MS);
  }, [inputRef, arm, disarm, startRecognition, stopRecognition, setIsListening]);

  const onKeyUp = useCallback((e) => {
    if (e.key !== 'Control') return;
    isHoldingRef.current = false;
    clearTimeout(armTimerRef.current);
    
    if (sessionActiveRef.current?.authorized) {
      stopRecognition(false); // capture
      // Clean up UI but sessionActiveRef stays valid for onresult
      setTimeout(() => {
        disarm?.();
      }, 500);
    } else {
      stopRecognition(true);  // abort early release
      disarm?.();
    }
  }, [stopRecognition, disarm]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      clearTimeout(armTimerRef.current);
      stopRecognition(true);
    };
  }, [onKeyDown, onKeyUp, stopRecognition]);

  return { isSupported };
}
