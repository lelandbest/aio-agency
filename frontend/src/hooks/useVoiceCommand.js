import { useEffect, useRef, useCallback } from 'react';

/**
 * Charlie VTT PTT logic.
 */

const ARM_DELAY_MS = 1000;

// Keep the cue minimal and disposable so it does not interfere with SpeechRecognition.
async function playSyntheticPing(freq = 760, volume = 0.035, durationMs = 60) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (durationMs / 1000));
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + (durationMs / 1000) + 0.01);
    setTimeout(() => { ctx.close().catch(() => {}); }, 180);
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
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');

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
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';

    rec.onstart = () => { if (settingsRef.current.setIsListening) settingsRef.current.setIsListening(true); };
    rec.onend = () => { 
      const finalText = finalTranscriptRef.current.trim();
      if (finalText && settingsRef.current.onTranscript) {
        settingsRef.current.onTranscript(finalText, { isContinuousSession: rec.continuous });
      }
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
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
      if (final) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${final}`.trim();
      }
      interimTranscriptRef.current = inter;
      const liveText = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
      if (liveText && settingsRef.current.onInterim) settingsRef.current.onInterim(liveText);
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') settingsRef.current.onError?.(e.error);
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
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

    // Wake audio inside the real key gesture so the later cue is allowed.
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume().then(() => ctx.close()).catch(() => {});

    isHoldingRef.current = true;
    isArmedRef.current = false;

    clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        isArmedRef.current = true;
        playSyntheticPing(760, 0.035, 60);
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
