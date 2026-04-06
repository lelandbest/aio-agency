import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, X, ChevronRight, MessageSquare, Lock, Square, Volume2, VolumeX, Play } from 'lucide-react';
import { useVTT } from '../../contexts/VTTContext';
import { useVoiceCommand } from '../../hooks/useVoiceCommand';
import { request } from '../../services/backendApi';

const TRANSCRIPT_DRAFT_HTML_KEY = 'aio_transcript_editor_draft_html';
const TRANSCRIPT_DRAFT_TITLE_KEY = 'aio_transcript_editor_draft_title';
const TRANSCRIPT_EDITOR_OPEN_KEY = 'aio_transcript_editor_open';

function navigateToModule(module) {
  if (module) {
    window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module } }));
  }
}

function escapeTranscriptHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appendTranscriptDraft(text, title = 'Live Transcript') {
  const safeText = String(text || '').trim();
  if (!safeText) return '';
  const existing = sessionStorage.getItem(TRANSCRIPT_DRAFT_HTML_KEY) || '';
  const nextHtml = `${existing}${existing ? '' : ''}<p>${escapeTranscriptHtml(safeText)}</p>`;
  sessionStorage.setItem(TRANSCRIPT_DRAFT_HTML_KEY, nextHtml);
  sessionStorage.setItem(TRANSCRIPT_DRAFT_TITLE_KEY, title);
  return nextHtml;
}

function clearTranscriptDraft() {
  sessionStorage.removeItem(TRANSCRIPT_DRAFT_HTML_KEY);
  sessionStorage.removeItem(TRANSCRIPT_DRAFT_TITLE_KEY);
}

function requestTranscriptEditorOpen() {
  sessionStorage.setItem(TRANSCRIPT_EDITOR_OPEN_KEY, '1');
  navigateToModule('studio');
  window.dispatchEvent(new CustomEvent('aio:transcript-editor-open'));
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

// ─── Response normalizer ───────────────────────────────────────────────────────
function resolveSpokenText(data) {
  if (!data) return "";
  return (
    data?.response?.message ||
    data?.message ||
    data?.result?.message ||
    ""
  );
}

function resolveMonitorReply(message) {
  if (!message) return "";
  if (message.role === 'command') {
    return resolveSpokenText(message.result) || message.result?.phrase || "";
  }
  return "";
}

function pickPreferredSystemVoice(voices = []) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const normalized = voices.map((voice) => ({
    voice,
    name: String(voice?.name || "").trim().toLowerCase(),
    lang: String(voice?.lang || "").trim().toLowerCase(),
  }));
  const rankedMatchers = [
    ({ name }) => name === "google uk english female",
    ({ name, lang }) => name.includes("google") && name.includes("uk") && name.includes("female") && lang.startsWith("en-gb"),
    ({ name, lang }) => (name.includes("female") || name.includes("woman")) && lang.startsWith("en-gb"),
    ({ name }) => ["sonia", "libby", "hazel", "susan", "catherine"].some((token) => name.includes(token)),
    ({ lang }) => lang.startsWith("en-gb"),
    ({ name }) => name.includes("google") && name.includes("female"),
  ];
  for (const matches of rankedMatchers) {
    const candidate = normalized.find(matches);
    if (candidate?.voice) return candidate.voice;
  }
  return voices[0] || null;
}

// ─── Single playback entry point ───────────────────────────────────────────────
function playCharlieResponse(audioUrl, text, fallbackSpeak) {
  const cleanText = String(text || '').replace(/[*_#~>`\[\]{}]+/g, '').replace(/\s+/g, ' ').trim();
  if (!cleanText && !audioUrl) {
    console.warn("CHARLIE: empty spoken text", { audioUrl });
    return;
  }
  if (!cleanText) {
    console.warn("CHARLIE: no text to speak", { audioUrl });
    return;
  }
  try {
    if (audioUrl) {
      let fallbackTriggered = false;
      const doFallback = (e) => {
        if (fallbackTriggered) return;
        fallbackTriggered = true;
        console.warn("[VTT] Audio playback failed, triggering fallback:", e);
        fallbackSpeak(cleanText);
      };
      
      const audio = new Audio(audioUrl);
      audio.onerror = doFallback;
      audio.play().catch(doFallback);
      return;
    }
  } catch (e) {
    console.warn("[VTT] Audio hard fail, falling back:", e);
  }
  fallbackSpeak(cleanText);
}

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
  const [monitorTab, setMonitorTab] = useState('input');
  const [showHistory, setShowHistory] = useState(false);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const activeAudioRef = useRef(null);
  const lastPlaybackRef = useRef({ key: '', ts: 0 });
  const spokenResponseIds = useRef(new Set());
  const lastCtrlRef = useRef(0);
  const isPlayingRef = useRef(false);

  const stopAudio = useCallback(() => {
    try {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
      }
    } catch(e) {}
    activeAudioRef.current = null;
    isPlayingRef.current = false;
    window.speechSynthesis?.cancel?.();
  }, []);
  
  const micLevel = useMicLevel(isOpen, selectedMicId);
  const latestMessage = messages.length ? messages[messages.length - 1] : null;
  const liveTranscript = ghostTranscript.trim();
  const monitorReply = !liveTranscript ? resolveMonitorReply(latestMessage).trim() : '';

  const fallbackSpeak = useCallback((text) => {
    if (!text || !window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    const v = pickPreferredSystemVoice(voices);
    if (v) utter.voice = v;
    utter.lang = v?.lang || 'en-GB';
    utter.volume = 1.0;
    utter.rate = 0.96;
    utter.pitch = 1.0;
    speechSynthesis.cancel();
    speechSynthesis.resume?.();
    setTimeout(() => { speechSynthesis.speak(utter); }, 10);
  }, [voices]);

  const pushTranscriptToEditor = useCallback((text, { open = false } = {}) => {
    const nextHtml = appendTranscriptDraft(text);
    if (open) {
      requestTranscriptEditorOpen();
    }
    if (nextHtml) {
      window.dispatchEvent(new CustomEvent('aio:transcript-editor-sync', {
        detail: {
          transcript: nextHtml,
          title: sessionStorage.getItem(TRANSCRIPT_DRAFT_TITLE_KEY) || 'Live Transcript',
          open,
        },
      }));
    }
  }, []);

  const playResponse = useCallback((audioUrl, text) => {
    // ── Duplicate guard: drop if already playing ──────────────────────────────
    if (isPlayingRef.current) {
      console.warn('[VTT] Playback already in flight — dropping duplicate');
      return;
    }

    const normalizedText = String(text || '').trim();
    const normalizedAudioUrl = String(audioUrl || '').trim();
    const playbackKey = JSON.stringify({ audioUrl: normalizedAudioUrl, text: normalizedText });
    const responseId = audioUrl?.includes('vtt_') ? audioUrl : (text + audioUrl);
    if (spokenResponseIds.current.has(responseId)) {
      console.warn('[VTT] Already spoken response:', responseId);
      return;
    }

    const now = Date.now();
    if (lastPlaybackRef.current.key === playbackKey && (now - lastPlaybackRef.current.ts) < 2500) {
      console.warn('[VTT] Skipping duplicate Charlie playback');
      return;
    }
    lastPlaybackRef.current = { key: playbackKey, ts: now };
    spokenResponseIds.current.add(responseId);
    isPlayingRef.current = true;

    try {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
      }
    } catch (e) {}
    activeAudioRef.current = null;
    window.speechSynthesis?.cancel?.();

    if (!normalizedText && !normalizedAudioUrl) { isPlayingRef.current = false; return; }
    if (!normalizedText) { isPlayingRef.current = false; return; }

    const releaseLock = () => { isPlayingRef.current = false; };

    try {
      if (normalizedAudioUrl) {
        const audio = new Audio(normalizedAudioUrl);
        activeAudioRef.current = audio;
        audio.onended = () => {
          if (activeAudioRef.current === audio) activeAudioRef.current = null;
          releaseLock();
        };
        audio.onerror = (e) => {
          if (activeAudioRef.current === audio) activeAudioRef.current = null;
          console.warn('[VTT] Audio error, falling back:', e);
          releaseLock();
          fallbackSpeak(normalizedText);
        };
        audio.play().catch((e) => {
          if (activeAudioRef.current === audio) activeAudioRef.current = null;
          console.warn('[VTT] Audio play blocked, falling back:', e);
          releaseLock();
          fallbackSpeak(normalizedText);
        });
        return;
      }
    } catch (e) {
      console.warn('[VTT] Audio hard fail, falling back:', e);
      releaseLock();
    }

    fallbackSpeak(normalizedText);
    // Note: fallbackSpeak (SpeechSynthesis) has no reliable onend — lock releases
    // after a conservative delay so back-to-back text inputs don't pile up.
    setTimeout(releaseLock, 4000);
  }, [fallbackSpeak]);

  const handleTranscript = useCallback(async (raw, meta = {}) => {
    setGhostTranscript('');
    setIsListening(false);
    if (!raw.trim()) return;

    // ── Loopback guard: drop transcript if Charlie is currently speaking ──────
    // Prevents mic feedback loops (Zoom audio, open speakers, etc.) from
    // being picked up and re-sent as a new command while TTS is active.
    if (isPlayingRef.current) {
      console.warn('[VTT] Dropping transcript — playback in flight (loopback guard)');
      return;
    }

    if (isContinuous || meta.isContinuousSession) {
      pushTranscriptToEditor(raw);
      return;
    }
    
    const lower = raw.toLowerCase();
    if (lower.includes('start listening') || lower.includes('open mic')) {
      clearTranscriptDraft();
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
        body: JSON.stringify({ transcript: raw, context: {}, voiceEnabled, voiceProvider, voiceAutoPlay }),
      });

      if (res.type === 'command') {
        const result = { ...(res.result || {}), ...(res.command || {}), response: res.response };
        addCommandMessage(raw, result);
        const action = result.action;
        if (action === 'navigate') navigateToModule(result.module);
        
        const msg = resolveSpokenText(res);
        if (voiceEnabled && voiceAutoPlay && msg) {
          playResponse(res.audioUrl || null, msg, res.response?.id);
        }
      } else if (res.type === 'conversational') {
        addCharlieMessage(raw, res);
        if (voiceEnabled && voiceAutoPlay) {
          const msg = resolveSpokenText(res);
          if (msg) {
            playResponse(res.audioUrl || null, msg, res.response?.id);
          } else if (!msg) {
            console.warn("CHARLIE: empty spoken text from VTT conversational response", res);
          }
        }
      }
    } catch (e) {
      console.error('VTT error:', e);
    } finally {
      setLoading(false);
    }
  }, [isContinuous, pushTranscriptToEditor, isOpen, openVTT, clearTranscript, addCommandMessage, addCharlieMessage, setIsListening, voiceEnabled, voiceProvider, voiceAutoPlay, playResponse]);

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
    onInterim: (text) => {
      if (!isOpen) openVTT();
      setGhostTranscript(text);
    },
    onError: (err) => { console.warn('VTT error:', err); },
    setIsListening,
    deviceId: selectedMicId,
    arm,
    disarm,
    isContinuous,
    stopContinuous: () => setIsContinuous(false),
  });

  useEffect(() => {
    const handler = (e) => { 
      if (e.key === 'Control') {
        const now = Date.now();
        if (now - lastCtrlRef.current < 400) {
          stopAudio();
          lastCtrlRef.current = 0;
        } else {
          lastCtrlRef.current = now;
        }
      }
      if (e.key === 'Escape' && isOpen) {
        stopAudio();
        closeVTT(); 
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeVTT, stopAudio]);

  useEffect(() => {
    if (!isOpen) stopAudio();
  }, [isOpen, stopAudio]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, ghostTranscript]);

  useEffect(() => {
    if (liveTranscript) {
      setMonitorTab('input');
      return;
    }
    if (loading || monitorReply) {
      setMonitorTab('output');
    }
  }, [liveTranscript, loading, monitorReply]);

  if (!isOpen) return null;

  return (
    <div className="fixed left-[192px] bottom-4 z-50 w-80 rounded-xl border border-[#1E2024] bg-[#0D0F12] shadow-[0_8px_32px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1E2024] bg-[#111318] gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <MessageSquare size={12} className="text-cyan-400" />
          <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Charlie VTT</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
          <button
            onClick={() => {
              setIsContinuous((current) => {
                const next = !current;
                if (!next) {
                  requestTranscriptEditorOpen();
                } else {
                  clearTranscriptDraft();
                }
                return next;
              });
            }}
            className={`flex-shrink-0 p-1.5 rounded-md border transition-all ${isContinuous ? 'border-rose-500/50 bg-rose-500/10 text-rose-400' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
            title={isContinuous ? "Dictation ON" : "Dictation OFF"}
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

      <div className="px-3 py-2 border-b border-[#1E2024] bg-[radial-gradient(circle_at_top,rgba(10,24,18,0.76),rgba(10,12,15,0.98)_72%)]">
        <div className="rounded-lg border border-white/6 bg-[#050B08] px-2.5 py-2 shadow-[inset_0_1px_8px_rgba(0,0,0,0.8)] font-mono">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-md border border-white/6 bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setMonitorTab('input')}
                className={`px-2 py-1 text-[7px] font-black uppercase tracking-[0.24em] transition-colors ${monitorTab === 'input' ? 'rounded bg-emerald-500/12 text-emerald-300' : 'text-slate-600 hover:text-slate-400'}`}
              >
                Input
              </button>
              <button
                type="button"
                onClick={() => setMonitorTab('output')}
                className={`px-2 py-1 text-[7px] font-black uppercase tracking-[0.24em] transition-colors ${monitorTab === 'output' ? 'rounded bg-amber-400/12 text-amber-200' : 'text-slate-600 hover:text-slate-400'}`}
              >
                Output
              </button>
            </div>
            <span className="text-[7px] font-black uppercase tracking-[0.28em] text-slate-700">
              {isListening ? 'STT' : loading ? 'AI' : 'READY'}
            </span>
          </div>
          <div className="mt-2 min-h-[56px] flex items-center justify-center text-center">
            {monitorTab === 'input' ? (
              liveTranscript ? (
              <div className="max-w-[15.5rem] text-[10px] leading-4 font-bold text-amber-500 [text-shadow:0_0_8px_rgba(245,158,11,0.5)]">
                {liveTranscript}
              </div>
              ) : (
              <div className="max-w-[15.5rem] text-[9px] leading-4 text-emerald-700 uppercase tracking-[0.2em] [text-shadow:0_0_2px_rgba(4,120,87,0.5)]">
                {isContinuous ? 'Dictation mode pushes transcript to editor.' : '❯ Hold CTRL to capture live speech'}
              </div>
              )
            ) : loading ? (
              <div className="max-w-[15.5rem] text-[10px] leading-4 font-bold text-emerald-400 animate-pulse [text-shadow:0_0_8px_rgba(52,211,153,0.5)]">
                ❯ Routing transcript to Charlie...
              </div>
            ) : monitorReply ? (
              <div className="max-w-[15.5rem] text-[10px] leading-4 font-bold text-emerald-400 [text-shadow:0_0_8px_rgba(52,211,153,0.5)]">
                {monitorReply}
              </div>
            ) : (
              <div className="max-w-[15.5rem] text-[9px] leading-4 text-emerald-700 uppercase tracking-[0.2em] [text-shadow:0_0_2px_rgba(4,120,87,0.5)]">
                ❯ Hold CTRL to capture live speech
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-center border-b border-[#1E2024] bg-[#0A0C0F] py-1">
        <button 
          onClick={() => setShowHistory(h => !h)}
          className="text-[8px] text-slate-500 hover:text-slate-300 uppercase tracking-widest font-black flex items-center gap-1"
        >
          {showHistory ? 'Hide History \u25BC' : 'Show History \u25B6'}
        </button>
      </div>

      {showHistory && (
        <div className="flex-1 min-h-0 max-h-48 overflow-y-auto no-scrollbar px-3 py-2 flex flex-col gap-2">
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
              
              {msg.role === 'charlie' && (
                <>
                  <div className="text-[8px] text-slate-600 uppercase tracking-widest font-black mt-1">charlie:</div>
                  <div className="pl-2 border-l border-cyan-500/30">
                    <div className="text-[10px] text-cyan-400">{resolveSpokenText(msg.result) || 'Processed'}</div>
                  </div>
                </>
              )}
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
      )}

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
            onClick={() => playCharlieResponse(null, "Charlie voice system operational. High five!", fallbackSpeak)}
            className="text-[6px] bg-slate-800 hover:bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors uppercase font-bold"
          >
            <Play size={6} fill="currentColor" /> Test Voice
          </button>
        </div>
      </div>
    </div>
  );
}
