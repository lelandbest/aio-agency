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

export default function VoiceCommandModule() {
  const {
    isOpen, isListening, isArmed, transcript, messages,
    closeVTT, toggleVTT, setIsListening,
    addCommandMessage, addCharlieMessage, clearTranscript,
  } = useVTT();

  const [input, setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState('system');
  const [voiceAutoPlay, setVoiceAutoPlay] = useState(false);
  const [voices, setVoices] = useState([]);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const audioRef  = useRef(null);

  useEffect(() => {
    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v.length) setVoices(v);
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    return () => { speechSynthesis.onvoiceschanged = null; };
  }, []);

  const speakWithSystemVoice = useCallback((text) => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const preferred =
      voices.find(v => v.name === 'Google UK English Female') ||
      voices.find(v => v.name.includes('Google UK English')) ||
      voices.find(v => v.name.includes('Google'));
    if (preferred) utterance.voice = preferred;
    speechSynthesis.speak(utterance);
  }, [voices]);

  const playAudio = useCallback((url) => {
    if (!url) return;
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play().catch(() => {});
    }
  }, []);

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
      } else if (data.type === 'conversational') {
        if (data.audioUrl) {
          if (voiceAutoPlay) playAudio(data.audioUrl);
        }
        if (data.forwardTo) {
          try {
            const charlieResult = await runAiCommandApi({ command: raw, context: { surface: 'vtt' } });
            addCharlieMessage(raw, charlieResult);
            if (voiceEnabled && voiceAutoPlay && !data.audioUrl) {
              const msg = charlieResult?.result?.message || charlieResult?.result?.suggestion || '';
              if (msg && msg.length <= 600) {
                speakWithSystemVoice(msg);
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
  }, [clearTranscript, addCommandMessage, addCharlieMessage, setIsListening, voiceEnabled, voiceProvider, voiceAutoPlay, playAudio, speakWithSystemVoice]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) handleTranscript(input.trim());
      setInput('');
    }
  }, [input, handleTranscript]);

  useVoiceCommand({
    onTranscript: handleTranscript,
    onError: (err) => { setIsListening(false); console.warn('VTT error:', err); },
  });

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && isOpen) closeVTT();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeVTT]);

  if (!isOpen) {
    return (
      <button
        onClick={toggleVTT}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-black/60 backdrop-blur px-3 py-1.5 text-[8px] font-black text-cyan-400 uppercase tracking-widest shadow-[0_4px_16px_rgba(0,0,0,0.6)] hover:bg-black/80 transition-all"
        title="Open Charlie (voice command)"
      >
        <MessageSquare size={10} />
        Charlie
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-[#1E2024] bg-[#0D0F12] shadow-[0_8px_32px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1E2024] bg-[#111318]">
        <div className="flex items-center gap-2">
          <MessageSquare size={12} className="text-cyan-400" />
          <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Charlie</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setVoiceEnabled(v => !v); }}
            className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border transition-colors ${voiceEnabled ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400' : 'border-slate-700 text-slate-600'}`}
            title={voiceEnabled ? 'Disable voice response' : 'Enable voice response'}
          >
            <Mic size={8} />
          </button>
          <button onClick={closeVTT} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 max-h-64 overflow-y-auto no-scrollbar px-3 py-2 flex flex-col gap-2">
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