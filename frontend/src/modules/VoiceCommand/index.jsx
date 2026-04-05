import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, X, ChevronRight, MessageSquare, Lock, Square, Volume2, VolumeX, Play } from 'lucide-react';
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
        <span className="text-[10px] font-bold uppercase tracking-wider">Opening {mod.replace('/aio-', '')}</span>
      </div>
    );
  }
  return <div className="text-[10px] text-cyan-400 font-medium">{phrase || 'Command processed'}</div>;
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
        const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length) / 128;
        setLevel(Math.min(1, rms * 2.5));
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn('[VTT] mic level error:', err.message);
      setLevel(0);
    }
  }, [stop]);

  useEffect(() => {
    if (isOpen) start(selectedMicId);
    else stop();
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

  const statusLabel = isListening ? 'RECORDING' : isArmed ? 'ARMED' : level > 0.05 ? 'LIVE' : 'STANDBY';
  const statusColor = isListening ? 'text-emerald-400' : isArmed ? 'text-rose-400' : level > 0.05 ? 'text-cyan-600' : 'text-slate-600';
  const dotColor   = isListening ? 'bg-emerald-400 animate-ping' : isArmed ? 'bg-rose-500 animate-pulse' : level > 0.05 ? 'bg-cyan-600' : 'bg-slate-700';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1E2024] bg-[#0A0C0F]">
      <div className="relative flex-shrink-0 w-2 h-2">
        <div className={`absolute inset-0 rounded-full ${dotColor}`} />
      </div>
      <div className="flex items-end gap-[2px] h-3 flex-shrink-0">
        {Array.from({ length: BAR_COUNT }).map((_, i) => {
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
      <span className={`text-[8px] font-black uppercase tracking-widest ml-auto ${statusColor}`}>
        {statusLabel}
      </span>
      <span className="text-[8px] text-slate-600 font-mono w-6 text-right flex-shrink-0">
        {Math.round(level * 100)}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function VoiceCommandModule() {
  const vtt = useVTT();
  const {
    isOpen, isListening, isArmed, transcript, messages,
    openVTT, closeVTT, setIsListening, arm, disarm,
    addCommandMessage, addCharlieMessage, clearTranscript,
  } = vtt;

  const [input, setInput]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [voiceEnabled, setVoiceEnabled]   = useState(true);
  const [voiceProvider, setVoiceProvider] = useState('system');
  const [voiceAutoPlay, setVoiceAutoPlay] = useState(true);
  const [voices, setVoices]               = useState([]);
  const [inputDevices, setInputDevices]   = useState([]);
  const [selectedMicId, setSelectedMicId] = useState(() => localStorage.getItem('aio_mic') || '');
  const [isContinuous, setIsContinuous]   = useState(false);
  const [ghostTranscript, setGhostTranscript] = useState('');

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  
  const micLevel = useMicLevel(isOpen, selectedMicId);

  const fallbackSpeak = useCallback((text) => {
    if (!text || !window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    const v = voices.find(vx => vx.name.includes('Google UK English Female') || vx.name.includes('Zira') || vx.name.includes('Samantha')) || voices.find(vx => vx.lang === 'en-GB') || voices[0];
    if (v) utter.voice = v;
    utter.volume = 1.0;
    utter.rate = 1.0;
    speechSynthesis.cancel();
    setTimeout(() => { speechSynthesis.speak(utter); }, 10);
  }, [voices]);

  const playCharlieResponse = useCallback((audioUrl, text) => {
    console.log("CHARLIE AUDIO URL:", audioUrl);
    console.log("CHARLIE MESSAGE:", text);
    if (!text && !audioUrl) return;
    try {
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.onended = () => { console.log("[VTT] ElevenLabs audio played successfully"); };
        audio.onerror = (e) => { console.warn("[VTT] Audio error, falling back:", e); fallbackSpeak(text); };
        audio.play().catch((e) => { console.warn("[VTT] Audio play blocked, falling back:", e); fallbackSpeak(text); });
        return;
      }
    } catch (e) {
      console.warn("[VTT] Audio hard fail, falling back:", e);
    }
    fallbackSpeak(text);
  }, [fallbackSpeak]);

  const handleTranscript = useCallback(async (raw) => {
    setGhostTranscript('');
    setIsListening(false);
    if (!raw.trim()) return;
    
    const lower = raw.toLowerCase();
    if (lower.includes('start listening') || lower.includes('open mic')) {
      setIsContinuous(true);
      return;
    }
    if (lower === 'stop' || lower === 'quiet' || lower === 'cancel') {
      setIsContinuous(false);
      return;
    }

    if (!isOpen) openVTT();
    setLoading(true);
    clearTranscript();
    try {
      const res = await request('/api/vtt/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: raw, context: {}, voiceEnabled, voiceProvider, voiceAutoPlay }),
      });

      const data = res.data;
      if (data.type === 'command') {
        const result = data.command?.result || data.command || {};
        addCommandMessage(raw, result);
        const action = result.action;
        if (action === 'navigate') navigateToModule(result.module);
        
        const msg = data.response?.message || result.message || '';
        if (voiceEnabled && voiceAutoPlay && msg) playCharlieResponse(data.audioUrl || null, msg);
      } else if (data.type === 'conversational') {
        if (data.forwardTo) {
          try {
            const charlieResult = await runAiCommandApi({ command: raw, context: { surface: 'vtt' } });
            addCharlieMessage(raw, charlieResult);
            if (voiceEnabled && voiceAutoPlay) {
              const msg = charlieResult?.result?.message || charlieResult?.result?.suggestion || '';
              if (msg && msg.length <= 600) playCharlieResponse(null, msg);
            }
          } catch {
            addCharlieMessage(raw, { message: 'Charlie unavailable.' });
          }
        } else {
          const msg = data.command?.message || data.command || '';
          addCharlieMessage(raw, data.command);
          if (voiceEnabled && voiceAutoPlay && msg) playCharlieResponse(null, msg);
        }
      }
    } catch (e) {
      console.error('VTT error:', e);
    } finally {
      setLoading(false);
    }
  }, [isOpen, openVTT, clearTranscript, addCommandMessage, addCharlieMessage, setIsListening, voiceEnabled, voiceProvider, voiceAutoPlay, playCharlieResponse]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) handleTranscript(input.trim());
      setInput('');
    }
  }, [input, handleTranscript]);

  const loadMics = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    } catch {}
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
    setInputDevices(mics);
    const saved = localStorage.getItem('aio_mic');
    if (saved && mics.find(m => m.deviceId === saved)) setSelectedMicId(saved);
  }, []);

  useEffect(() => {
    loadMics();
    navigator.mediaDevices.addEventListener('devicechange', loadMics);
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadMics);
  }, [loadMics]);

  useEffect(() => {
    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v.length) setVoices(v);
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    return () => { speechSynthesis.onvoiceschanged = null; };
  }, []);

  useVoiceCommand({
    onTranscript: handleTranscript,
    onInterim: (text) => setGhostTranscript(text),
    onError: (err) => { console.warn('VTT error:', err); },
    setIsListening,
    deviceId: selectedMicId,
    arm,
    disarm,
    isContinuous,
    stopContinuous: () => setIsContinuous(false),
  });

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isOpen) closeVTT(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeVTT]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, ghostTranscript]);

  if (!isOpen) return null;

  return (
    <div className="fixed left-[192px] bottom-4 z-50 w-84 rounded-xl border border-[#1E2024] bg-[#0D0F12] shadow-[0_8px_32px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1E2024] bg-[#111318] gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <MessageSquare size={12} className="text-cyan-400" />
          <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Charlie VTT</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
          <button
            onClick={() => setIsContinuous(v => !v)}
            className={`flex-shrink-0 p-1.5 rounded-md border transition-all ${isContinuous ? 'border-rose-500/50 bg-rose-500/10 text-rose-400' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
            title={isContinuous ? "Hands-free ON" : "Hands-free OFF"}
          >
            {isContinuous ? <Square size={10} fill="currentColor" /> : <Lock size={10} />}
          </button>
          <div className="flex items-center gap-1 min-w-0 bg-black/40 rounded px-1.5 py-1 border border-white/5">
            {isListening ? (
              <Mic size={10} className="text-emerald-400 animate-pulse" />
            ) : isArmed ? (
              <Mic size={10} className="text-rose-500 animate-pulse" />
            ) : (
              <Mic size={10} className="text-slate-500" />
            )}
            <select
              value={selectedMicId || ''}
              onChange={(e) => { setSelectedMicId(e.target.value); localStorage.setItem('aio_mic', e.target.value); }}
              className="bg-transparent text-slate-400 text-[9px] min-w-0 truncate cursor-pointer outline-none border-none p-0"
              style={{ maxWidth: '80px' }}
            >
              {inputDevices.length === 0 && <option value="">No Mic</option>}
              {inputDevices.map(d => (
                <option key={d.deviceId} value={d.deviceId} className="bg-[#111318] text-white">
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setVoiceEnabled(v => !v)}
            className={`flex-shrink-0 p-1.5 rounded border transition-colors ${voiceEnabled ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400' : 'border-slate-700 text-slate-600'}`}
          >
            {voiceEnabled ? <Volume2 size={10} /> : <VolumeX size={10} />}
          </button>
          <button onClick={closeVTT} className="flex-shrink-0 text-slate-500 hover:text-slate-300 p-1">
            <X size={12} />
          </button>
        </div>
      </div>

      <ConfidenceMeter level={micLevel} isArmed={isArmed} isListening={isListening} />

      <div className="flex-1 min-h-0 max-h-64 overflow-y-auto no-scrollbar px-3 py-2 flex flex-col gap-2">
        {messages.length === 0 && !ghostTranscript && (
          <div className="text-[9px] text-slate-600 text-center mt-6">
            Hold <kbd className="px-1.5 py-0.5 rounded border border-slate-700 bg-black/40 text-slate-400 font-mono">CTRL</kbd> to speak,<br/>or tap the Lock for Hands-free.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-0.5">
            <div className="text-[8px] text-slate-600 uppercase tracking-widest font-black flex items-center gap-1">
               {msg.role === 'command' ? <Mic size={8} /> : null} {msg.role === 'command' ? 'you (voice)' : 'you'}:
            </div>
            <div className="text-[10px] text-slate-300 pl-2 border-l border-white/5">{msg.phrase || msg.text}</div>
            <div className="text-[8px] text-slate-600 uppercase tracking-widest font-black mt-1">charlie:</div>
            <div className="pl-2 border-l border-cyan-500/30">
              {msg.role === 'command' ? <CommandResult result={msg} /> : <div className="text-[10px] text-cyan-400">{(msg.result?.message || msg.result?.suggestion || 'Processed')}</div>}
            </div>
          </div>
        ))}
        {ghostTranscript && (
          <div className="flex flex-col gap-0.5 opacity-60">
            <div className="text-[8px] text-emerald-500 uppercase tracking-widest font-black flex items-center gap-1">
               <Mic size={8} className="animate-pulse" /> you (recording):
            </div>
            <div className="text-[10px] text-emerald-400 italic pl-2 border-l border-emerald-500/30">
              {ghostTranscript}...
            </div>
          </div>
        )}
        {loading && <div className="text-[9px] text-slate-600 animate-pulse italic">Charlie is thinking...</div>}
        <div ref={bottomRef} />
      </div>

      {/* Footer / Input */}
      <div className="border-t border-[#1E2024] px-3 py-2 bg-[#0D0F12]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Charlie anything..."
            className="flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-slate-700"
          />
          <button onClick={() => { if (input.trim()) handleTranscript(input.trim()); setInput(''); }} className="text-cyan-600 hover:text-cyan-400 p-1">
            <Send size={12} />
          </button>
        </div>
        
        <div className="mt-1 flex items-center justify-between border-t border-white/5 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[6px] text-slate-700 uppercase font-bold tracking-[0.2em]">Engine Status</span>
            <span className={`text-[7px] font-black uppercase tracking-tighter ${isArmed ? 'text-rose-500' : isListening ? 'text-emerald-500' : 'text-slate-800'}`}>
               {isArmed ? '● VTT ARMED' : isListening ? '● RECORDING' : '● IDLE'}
            </span>
          </div>
          <button 
            onClick={() => playCharlieResponse(null, "Charlie voice system operational. High five!")}
            className="text-[6px] bg-slate-800 hover:bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors uppercase font-bold"
          >
            <Play size={6} fill="currentColor" /> Test Voice
          </button>
        </div>
      </div>
    </div>
  );
}