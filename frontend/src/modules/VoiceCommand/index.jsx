import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, X, ChevronRight, MessageSquare } from 'lucide-react';
import { useVTT } from '../../contexts/VTTContext';
import { useVoiceCommand } from '../../hooks/useVoiceCommand';
import { request, runAiCommandApi } from '../../services/backendApi';

function navigateToModule(module) {
  if (module) {
    window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module } }));
  }
}

function CommandResult({ result }) {
  const action = result?.result?.action || result?.action;
  const phrase = result?.result?.phrase || result?.phrase || '';
  if (action === 'navigate') {
    const mod = result?.result?.module || '';
    return (
      <div className="flex items-center gap-2 text-emerald-400">
        <ChevronRight size={12} />
        <span className="text-[10px] uppercase tracking-widest">→</span>
        <span className="text-[10px]">{phrase}</span>
        <span className="text-[10px] text-slate-500">→ {mod}</span>
      </div>
    );
  }
  if (action === 'interrupt' || action === 'immediate') {
    return (
      <div className="flex items-center gap-2 text-rose-400">
        <span className="text-[10px] uppercase tracking-widest">{phrase}</span>
        <span className="text-[10px] text-slate-500">executed</span>
      </div>
    );
  }
  if (action === 'workflow') {
    return (
      <div className="flex items-center gap-2 text-amber-400">
        <span className="text-[10px] uppercase tracking-widest">workflow:</span>
        <span className="text-[10px]">{phrase}</span>
      </div>
    );
  }
  if (action === 'staged') {
    return (
      <div className="flex items-center gap-2 text-cyan-400">
        <span className="text-[10px] uppercase tracking-widest">staged:</span>
        <span className="text-[10px]">{phrase}</span>
      </div>
    );
  }
  if (action === 'confirmed') {
    return (
      <div className="flex items-center gap-2 text-yellow-400">
        <span className="text-[10px] uppercase tracking-widest">awaiting confirm:</span>
        <span className="text-[10px]">{phrase}</span>
        {result?.result?.payload && <span className="text-[9px] text-slate-500">— {result.result.payload}</span>}
      </div>
    );
  }
  return (
    <div className="text-[10px] text-slate-500">{phrase} → {action}</div>
  );
}

// ─── Audio level meter (Web Audio API) ───────────────────────────────────────
function useMicLevel(isOpen, selectedMicId) {
  const [level, setLevel] = useState(0);
  const ctxRef    = useRef(null);
  const frameRef  = useRef(null);
  const streamRef = useRef(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current = null;
    setLevel(0);
  }, []);

  const start = useCallback(async (micId) => {
    stop();
    try {
      const constraints = { audio: micId ? { deviceId: { ideal: micId } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        // RMS of frequency bins, normalised 0→1
        const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length) / 128;
        setLevel(Math.min(1, rms * 2.5)); // scale up so normal speech hits ~0.6–0.9
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn('[VTT] mic level:', err.message);
      setLevel(0);
    }
  }, [stop]);

  useEffect(() => {
    if (isOpen) {
      start(selectedMicId);
    } else {
      stop();
    }
    return stop;
  }, [isOpen, selectedMicId, start, stop]);

  return level;
}

// ─── Confidence bar component ─────────────────────────────────────────────────
const BAR_COUNT = 10;
function ConfidenceMeter({ level, isArmed, isListening }) {
  const filled = Math.round(level * BAR_COUNT);
  const color = isListening
    ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]'
    : isArmed
    ? 'bg-rose-500 shadow-[0_0_4px_rgba(244,63,94,0.9)]'
    : level > 0.05
    ? 'bg-cyan-500/70'
    : 'bg-slate-700';

  const statusLabel = isListening ? 'CAPTURING' : isArmed ? 'ARMED' : level > 0.05 ? 'LIVE' : 'STANDBY';
  const statusColor = isListening ? 'text-emerald-400' : isArmed ? 'text-rose-400' : level > 0.05 ? 'text-cyan-600' : 'text-slate-600';
  const dotColor   = isListening ? 'bg-emerald-400 animate-ping' : isArmed ? 'bg-rose-500 animate-pulse' : level > 0.05 ? 'bg-cyan-600' : 'bg-slate-700';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1E2024] bg-[#0A0C0F]">
      {/* Status dot */}
      <div className="relative flex-shrink-0 w-2 h-2">
        <div className={`absolute inset-0 rounded-full ${dotColor}`} />
      </div>
      {/* Bars */}
      <div className="flex items-end gap-[2px] h-3 flex-shrink-0">
        {Array.from({ length: BAR_COUNT }).map((_, i) => {
          // vary bar heights for visual texture
          const maxH = [4, 6, 8, 10, 12, 12, 10, 8, 6, 4][i];
          const active = i < filled;
          return (
            <div
              key={i}
              className={`w-[3px] rounded-sm transition-all duration-75 ${active ? color : 'bg-slate-800'}`}
              style={{ height: active ? `${maxH}px` : '3px' }}
            />
          );
        })}
      </div>
      {/* Label */}
      <span className={`text-[8px] font-black uppercase tracking-widest ml-auto ${statusColor}`}>
        {statusLabel}
      </span>
      {/* Level % */}
      <span className="text-[8px] text-slate-600 font-mono w-6 text-right flex-shrink-0">
        {Math.round(level * 100)}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function VoiceCommandModule() {
  const {
    isOpen, isListening, isArmed, transcript, messages,
    openVTT, closeVTT, setIsListening, arm, disarm,
    addCommandMessage, addCharlieMessage, clearTranscript,
  } = useVTT();

  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [voiceEnabled, setVoiceEnabled]   = useState(false);
  const [voiceProvider, setVoiceProvider] = useState('system');
  const [voiceAutoPlay, setVoiceAutoPlay] = useState(false);
  const [voices, setVoices]       = useState([]);
  const [inputDevices, setInputDevices]   = useState([]);
  const [selectedMicId, setSelectedMicId] = useState(() => localStorage.getItem('aio_mic') || '');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const audioRef  = useRef(null);

  // Live mic level — starts when modal opens, re-arms on device change
  const micLevel = useMicLevel(isOpen, selectedMicId);

  // ── Mic enumeration + stale-device validation ────────────────────────────
  const loadMics = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    } catch {}
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices
      .filter(d => d.kind === 'audioinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
      }));
    setInputDevices(mics);
    // Always validate the stored ID — not just when empty
    const saved = localStorage.getItem('aio_mic');
    if (saved && mics.find(m => m.deviceId === saved)) {
      setSelectedMicId(saved);
    } else {
      // Stale or missing — fall back to first available, clear bad stored value
      const fallback = mics[0]?.deviceId || '';
      setSelectedMicId(fallback);
      if (fallback) localStorage.setItem('aio_mic', fallback);
      else localStorage.removeItem('aio_mic');
    }
  }, []);

  useEffect(() => {
    loadMics();
    navigator.mediaDevices.addEventListener('devicechange', loadMics);
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadMics);
  }, [loadMics]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v.length) setVoices(v);
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    return () => { speechSynthesis.onvoiceschanged = null; };
  }, []);

  const playAudio = useCallback((url, text) => {
    if (url) {
      const audio = new Audio(url);
      audio.play().catch(() => fallback(text));
    } else {
      fallback(text);
    }
  }, []);

  const fallback = useCallback((text) => {
    const utter = new SpeechSynthesisUtterance(text);
    const v = voices.find(v => v.name.includes('Google UK English Female')) || voices[0];
    if (v) utter.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
  }, [voices]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTranscript = useCallback(async (raw) => {
    setIsListening(false);
    if (!raw.trim()) return;
    setLoading(true);
    clearTranscript();
    try {
      const res = await request('/api/vtt/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: raw, context: {}, voiceEnabled, voiceProvider, voiceAutoPlay }),
      });
      const data = res || {};
      if (data.type === 'command') {
        addCommandMessage(raw, data.command);
        const result = data.command?.result || data.command || {};
        if (result.action === 'navigate') navigateToModule(result.module);
        const msg = data.response?.message || result.message || '';
        if (voiceEnabled && voiceAutoPlay) {
          playAudio(data.audioUrl || null, msg);
        }
      } else if (data.type === 'conversational') {
        if (data.audioUrl && voiceAutoPlay) {
          const msg = data.command?.response?.message || data.command?.text || '';
          playAudio(data.audioUrl, msg);
        }
        if (data.forwardTo) {
          try {
            const charlieResult = await runAiCommandApi({ command: raw, context: { surface: 'vtt' } });
            addCharlieMessage(raw, charlieResult);
            if (voiceEnabled && voiceAutoPlay) {
              const msg = charlieResult?.result?.message || charlieResult?.result?.suggestion || '';
              if (msg && msg.length <= 600) {
                playAudio(null, msg);
              }
            }
          } catch {
            addCharlieMessage(raw, { message: 'Charlie unavailable.' });
          }
        } else {
          addCharlieMessage(raw, data.command);
        }
      }
    } catch (e) {
      console.error('VTT error:', e);
    } finally {
      setLoading(false);
    }
  }, [clearTranscript, addCommandMessage, addCharlieMessage, setIsListening, voiceEnabled, voiceProvider, voiceAutoPlay, playAudio]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) handleTranscript(input.trim());
      setInput('');
    }
  }, [input, handleTranscript]);

  useVoiceCommand({
    onTranscript: handleTranscript,
    onError: (err) => { console.warn('VTT error:', err); },
    setIsListening,
    deviceId: selectedMicId,
    inputRef,
    arm,
    disarm,
  });

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && isOpen) closeVTT();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeVTT]);

  if (!isOpen) return null;

  return (
    <div className="fixed left-[192px] bottom-4 z-50 w-80 rounded-xl border border-[#1E2024] bg-[#0D0F12] shadow-[0_8px_32px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1E2024] bg-[#111318] gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <MessageSquare size={12} className="text-cyan-400" />
          <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Charlie</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
          {/* Compact mic selector */}
          <div className="flex items-center gap-1 min-w-0 max-w-[130px]">
            <Mic size={8} className="text-slate-500 flex-shrink-0" />
            <select
              value={selectedMicId || ''}
              onChange={(e) => {
                setSelectedMicId(e.target.value);
                localStorage.setItem('aio_mic', e.target.value);
              }}
              className="bg-transparent text-slate-400 text-[8px] min-w-0 truncate cursor-pointer outline-none border-none"
              title="Select microphone"
              style={{ maxWidth: '110px' }}
            >
              {inputDevices.map(d => (
                <option key={d.deviceId} value={d.deviceId} className="bg-[#111318] text-white text-xs">
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { setVoiceEnabled(v => !v); }}
            className={`flex-shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border transition-colors ${voiceEnabled ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400' : 'border-slate-700 text-slate-600'}`}
            title={voiceEnabled ? 'Disable voice response' : 'Enable voice response'}
          >
            <MicOff size={8} />
          </button>
          <button onClick={closeVTT} className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Confidence meter — always visible when open */}
      <ConfidenceMeter level={micLevel} isArmed={isArmed} isListening={isListening} />

      {/* Messages */}
      <div className="flex-1 min-h-0 max-h-56 overflow-y-auto no-scrollbar px-3 py-2 flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="text-[9px] text-slate-600 text-center mt-4">
            Hold <kbd className="px-1 py-0.5 rounded border border-slate-700 bg-black/40 text-slate-500 font-mono">CTRL</kbd> to speak,<br />or type below.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-0.5">
            {msg.role === 'command' ? (
              <>
                <div className="text-[8px] text-slate-600 uppercase tracking-widest font-black">you:</div>
                <div className="text-[10px] text-slate-300 pl-2 border-l border-cyan-900/50">{msg.phrase}</div>
                <div className="text-[8px] text-slate-600 uppercase tracking-widest font-black mt-0.5">charlie:</div>
                <div className="pl-2 border-l border-cyan-500/30">
                  <CommandResult result={msg.result} />
                </div>
              </>
            ) : (
              <>
                <div className="text-[8px] text-slate-600 uppercase tracking-widest font-black">you:</div>
                <div className="text-[10px] text-slate-300 pl-2 border-l border-cyan-900/50">{msg.text}</div>
                {msg.result && (
                  <>
                    <div className="text-[8px] text-slate-600 uppercase tracking-widest font-black mt-0.5">charlie:</div>
                    <div className="text-[10px] text-cyan-400 pl-2 border-l border-cyan-500/30">
                      {(msg.result.message || msg.result.response_message || msg.result.suggestion || msg.result.text || JSON.stringify(msg.result).slice(0, 120))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-[9px] text-slate-600 animate-pulse">Charlie is thinking...</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#1E2024] px-3 py-2 flex items-center gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type or hold CTRL to speak..."
          className="flex-1 bg-black/40 border border-[#1E2024] rounded px-2 py-1 text-[9px] text-slate-300 placeholder-slate-700 focus:outline-none focus:border-cyan-500/50"
        />
        <button
          onClick={() => { if (input.trim()) { handleTranscript(input.trim()); setInput(''); } }}
          disabled={!input.trim() || loading}
          className="text-cyan-400 hover:text-cyan-300 disabled:text-slate-700 transition-colors"
        >
          <Send size={12} />
        </button>
      </div>

      {/* PTT indicator */}
      {isArmed && (
        <div className="bg-amber-500/10 border-t border-amber-500/20 px-3 py-1 flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest">armed — release to capture</span>
        </div>
      )}

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}