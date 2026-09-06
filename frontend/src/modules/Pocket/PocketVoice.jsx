import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, Send, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { PocketService } from '../../services/pocket.service';

export default function PocketVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [responseMessage, setResponseMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = (e) => {
        setIsListening(false);
        if (e.error !== 'no-speech') {
          setError(`Mic error: ${e.error}`);
        }
      };
      recognition.onresult = (e) => {
        const text = Array.from(e.results)
          .map((r) => r[0].transcript)
          .join('');
        setTranscript(text);
      };
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleMic = () => {
    setError(null);
    if (!recognitionRef.current) {
      setError('Speech recognition not supported in this browser. Type below.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setTranscript('');
      try {
        recognitionRef.current.start();
      } catch (e) {
        recognitionRef.current.stop();
        setTimeout(() => recognitionRef.current.start(), 200);
      }
    }
  };

  const executeVoiceCommand = async (overrideText = null) => {
    const cmd = (overrideText || transcript).trim();
    if (!cmd) return;

    try {
      setIsProcessing(true);
      setError(null);
      setResponseMessage('');

      const data = await PocketService.sendVoiceCommand(cmd, { surface: 'pocket_voice' });
      const spokenText = data?.response?.message || data?.result?.message || 'Directive processed.';
      setResponseMessage(spokenText);

      if (data?.response?.audioUrl && audioPlayerRef.current) {
        audioPlayerRef.current.src = data.response.audioUrl;
        audioPlayerRef.current.play().catch(() => {});
      }
    } catch (err) {
      setError(err.message || 'Voice directive failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const quickDirectives = [
    'What is next on the cue sheet?',
    'Take a note: guest confirmed Riverside link',
    'Open Knowledge Vault',
    'Summarize today schedule',
  ];

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto pb-24 text-center">
      <audio ref={audioPlayerRef} className="hidden" />

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          Charlie Voice Shell
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Instant voice directive interface for field operations
        </p>
      </div>

      {/* Main Push to Talk Button */}
      <div className="py-6 flex flex-col items-center justify-center">
        <div className="relative">
          {isListening && (
            <span className="absolute -inset-4 rounded-full bg-purple-500/20 animate-ping" />
          )}
          {isProcessing && (
            <span className="absolute -inset-3 rounded-full bg-amber-500/20 animate-pulse" />
          )}
          <button
            onClick={toggleMic}
            disabled={isProcessing}
            className={`w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative z-10 active:scale-95 ${
              isListening
                ? 'bg-rose-600 text-white shadow-rose-900/60 ring-4 ring-rose-500/40'
                : isProcessing
                ? 'bg-amber-600 text-white animate-pulse'
                : 'bg-gradient-to-tr from-purple-700 to-indigo-600 text-white shadow-purple-950/80 hover:brightness-110'
            }`}
          >
            {isProcessing ? (
              <RefreshCw className="w-10 h-10 animate-spin" />
            ) : isListening ? (
              <MicOff className="w-10 h-10 animate-pulse" />
            ) : (
              <Mic className="w-10 h-10" />
            )}
          </button>
        </div>

        <span className="text-xs font-semibold tracking-wider uppercase mt-4 text-zinc-400">
          {isListening ? 'Listening... Tap to finish' : isProcessing ? 'Processing Directive...' : 'Tap Mic to Speak'}
        </span>
      </div>

      {/* Live Transcript / Manual Input Box */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3 shadow-inner space-y-2">
        <textarea
          rows={2}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Speak or type directive..."
          className="w-full bg-transparent text-sm text-white placeholder-zinc-500 resize-none focus:outline-none"
        />
        <div className="flex justify-between items-center pt-2 border-t border-zinc-800/60">
          <span className="text-[10px] text-zinc-500 font-mono">
            {transcript.length > 0 ? `${transcript.length} chars` : 'Ready'}
          </span>
          <button
            onClick={() => executeVoiceCommand()}
            disabled={!transcript.trim() || isProcessing}
            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 active:scale-95 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 transition"
          >
            <Send className="w-3.5 h-3.5" />
            Execute
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-800/50 p-3 rounded-xl text-rose-300 text-xs flex items-center gap-2 text-left">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Response Box */}
      {responseMessage && (
        <div className="bg-gradient-to-br from-purple-950/40 to-zinc-900 border border-purple-800/40 p-4 rounded-2xl text-left space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs text-purple-300 font-semibold">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-purple-400" />
              Charlie Response
            </span>
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed">{responseMessage}</p>
        </div>
      )}

      {/* Quick Directives */}
      <div className="space-y-2 pt-2">
        <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">Quick Directives</p>
        <div className="grid grid-cols-1 gap-1.5">
          {quickDirectives.map((qd) => (
            <button
              key={qd}
              onClick={() => {
                setTranscript(qd);
                executeVoiceCommand(qd);
              }}
              className="text-left px-3 py-2 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/70 rounded-xl text-xs text-zinc-300 transition active:scale-98 truncate"
            >
              "{qd}"
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
