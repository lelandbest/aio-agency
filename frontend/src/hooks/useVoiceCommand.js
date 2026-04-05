import { useEffect, useRef, useCallback } from 'react';

/**
 * Charlie VTT PTT Logic - FINAL PRODUCTION HARDENED
 */

const ARM_DELAY_MS = 1000;

// Synthetic sonar ping
async function playSyntheticPing(freq = 880, volume = 0.1) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.11);
    setTimeout(() => { ctx.close().catch(() => {}); }, 200);
  } catch (e) {}
}

export function useVoiceCommand({ 
  onTranscript, 
  onInterim,
  onError, 
  setIsListening, 
  arm, 
  disarm,
  isContinuous = false,
  stopContinuous 
}) {
  const isSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  
  // Stable settings ref to avoid hook dependency flickering
  const settingsRef = useRef({});
  settingsRef.current = { onTranscript, onInterim, onError, setIsListening, arm, disarm, isContinuous, stopContinuous };

  const isHoldingRef   = useRef(false);
  const isArmedRef     = useRef(false);
  const armTimerRef    = useRef(null);
  const recognitionRef = useRef(null);

  const stopRecognition = useCallback((abort = false) => {
    if (recognitionRef.current) {
      try {
        if (abort) recognitionRef.current.abort();
        else recognitionRef.current.stop();
      } catch (e) {}
    }
    // Note: We don't null recognitionRef immediately here because onend handles cleanup
  }, []);

  const startRecognition = useCallback(() => {
    if (!isSupported || recognitionRef.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = settingsRef.current.isContinuous;
    rec.interimResults = true; // GHOST TEXT ON

    rec.onstart = () => { if (settingsRef.current.setIsListening) settingsRef.current.setIsListening(true); };
    rec.onend = () => { 
      recognitionRef.current = null; 
      if (settingsRef.current.setIsListening) settingsRef.current.setIsListening(false);
    };
    rec.onresult = (e) => {
      let final = '';
      let inter = '';
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else inter += e.results[i][0].transcript;
      }
      if (final && settingsRef.current.onTranscript) settingsRef.current.onTranscript(final);
      if (inter && settingsRef.current.onInterim) settingsRef.current.onInterim(inter);
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') settingsRef.current.onError?.(e.error);
      stopRecognition(true);
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch (e) {}
  }, [isSupported, stopRecognition]);

  const onKeyDownRef = useRef(null);
  const onKeyUpRef   = useRef(null);

  onKeyDownRef.current = (e) => {
    if (settingsRef.current.isContinuous) return;
    if (e.key !== 'Control') return;
    if (e.repeat) return;

    // Wake up audio
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume().then(() => ctx.close()).catch(() => {});

    isHoldingRef.current = true;
    isArmedRef.current = false;

    clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        isArmedRef.current = true;
        playSyntheticPing(880, 0.15);
        settingsRef.current.arm?.();
        startRecognition();
      }
    }, ARM_DELAY_MS);
  };

  onKeyUpRef.current = (e) => {
    if (settingsRef.current.isContinuous) return;
    if (e.key !== 'Control') return;
    isHoldingRef.current = false;
    clearTimeout(armTimerRef.current);
    
    if (isArmedRef.current) {
      // Small buffer to let the last syllable reach the STT engine
      setTimeout(() => stopRecognition(false), 150);
    } else {
      stopRecognition(true);
      settingsRef.current.disarm?.();
    }
    isArmedRef.current = false;
  };

  useEffect(() => {
    const hkd = (e) => onKeyDownRef.current?.(e);
    const hku = (e) => onKeyUpRef.current?.(e);
    window.addEventListener('keydown', hkd, { capture: true });
    window.addEventListener('keyup',   hku,   { capture: true });
    return () => {
      window.removeEventListener('keydown', hkd, { capture: true });
      window.removeEventListener('keyup',   hku,   { capture: true });
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
      stopRecognition(true);
    };
  }, [stopRecognition]);

  useEffect(() => {
    if (isContinuous && !recognitionRef.current) startRecognition();
    else if (!isContinuous && recognitionRef.current && !isHoldingRef.current) stopRecognition(false);
  }, [isContinuous, startRecognition, stopRecognition]);

  return { isSupported };
}
