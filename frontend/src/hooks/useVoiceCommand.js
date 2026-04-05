import { useEffect, useRef, useCallback } from 'react';

// CTRL hold-to-talk PTT with Robust Shortcut Protection.
// Strategy:
//   - Mic starts on KeyDown (trusted event) but stays "silent/backgrounded".
//   - If any other key is pressed during hold (Ctrl+C, etc.), we abort immediately.
//   - If hold hits 2s, we play the BEEP and update the UI dot to RED.
//   - Release after 2s captures. Release before 2s discards.

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

    rec.onstart = () => { 
      // We don't beep yet — only beep when the 2s timer fires.
    };
    rec.onend = () => {
      recognitionRef.current = null;
    };

    rec.onerror = (e) => {
      // ignore 'aborted' errors
      if (e.error !== 'aborted') {
        console.error('VTT ERROR:', e);
        onError?.(e.error);
      }
      disarm?.();
      if (setIsListening) setIsListening(false);
    };

    rec.onresult = (e) => {
      // Only process results if we actually reached the armed state
      if (isArmedRef.current) {
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
    // 1. If any key OTHER than Control is pressed while CTRL is held, it's a shortcut.
    if (e.key !== 'Control' && e.ctrlKey) {
      clearTimeout(armTimerRef.current);
      isArmedRef.current = false;
      stopRecognition(true); // abort mic immediately
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
    isArmedRef.current = false;

    // Start recognition IMMEDIATELY to preserve the trusted event chain.
    // It listens silently in the background for 2s.
    startRecognition();

    armTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        isArmedRef.current = true;
        arm?.(); 
        playPTTBeep(); // Beep fires at 2s mark while holding.
        if (setIsListening) setIsListening(true);
      }
    }, ARM_DELAY_MS);
  }, [inputRef, arm, disarm, startRecognition, stopRecognition, setIsListening]);

  const onKeyUp = useCallback((e) => {
    if (e.key !== 'Control') return;
    isHoldingRef.current = false;
    clearTimeout(armTimerRef.current);
    
    if (isArmedRef.current) {
      stopRecognition(false); // finish capture - result will check isArmedRef
      // wait a moment before clearing armed state so onresult sees it
      setTimeout(() => {
        isArmedRef.current = false;
        disarm?.();
      }, 500);
    } else {
      stopRecognition(true);  // abort (less than 2s)
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
