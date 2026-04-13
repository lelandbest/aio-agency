import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Terminal, X, Play, Loader2, AlertCircle } from 'lucide-react';
import { runAiCommandApi } from '../services/backendApi';
import { useAuth } from '../contexts/AuthContext';

export default function Composer({ activeModule, isOpen, onClose }) {
  const { hasCapability } = useAuth();
  const canRun = hasCapability('run');
  const [selectedType, setSelectedType] = useState('text');
  const [attachments, setAttachments] = useState([]);
  
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleExecute = async () => {
    if (!input.trim() || !canRun || running) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const resp = await runAiCommandApi({
        command: input.trim(),
        context: {
          module: activeModule || 'global',
        }
      });
      setResult(resp);
    } catch (err) {
      setError(err.message || 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleExecute();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div 
        className="w-full max-w-5xl h-[70vh] min-h-[500px] bg-[#111827] border border-slate-700/60 rounded focus:outline-none shadow-[0_24px_60px_-15px_rgba(0,0,0,1),0_0_0_1px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-black/60 bg-gradient-to-b from-slate-800 to-slate-900 shadow-[inset_0_-1px_0_rgba(255,255,255,0.02),inset_0_1px_0_rgba(255,255,255,0.05)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-slate-400" />
              <span className="text-[11px] font-black text-slate-200 tracking-[0.15em] uppercase">Composer</span>
            </div>
            <span className="text-[9px] uppercase font-bold tracking-[0.2em] px-1.5 py-0.5 border border-black/40 bg-black/30 text-slate-500 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">Command</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none">
            <X size={14} />
          </button>
        </div>

        {/* MAIN GRID */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          
          {/* LEFT SIDE — COMPOSITION SURFACE (~65%) */}
          <div className="flex flex-col w-[65%] min-w-[65%] relative bg-[#0f1423] shadow-[inset_-1px_0_0_rgba(0,0,0,0.4)]">
            
            {/* Type Selector — Segmented Mode Switches */}
            <div className="flex items-center px-4 py-2.5 border-b border-black/60 shrink-0 bg-gradient-to-b from-slate-900 to-[#0f1423] shadow-[inset_0_-1px_0_rgba(255,255,255,0.01)]">
              <div className="flex items-center bg-slate-800/60 p-[2px] rounded border border-black shadow-[inset_0_1px_3px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.02)] gap-[1px]">
                {['text', 'prompt', 'script'].map(t =>(
                  <button
                    key={t}
                    onClick={() => setSelectedType(t)}
                    className={`px-4 py-1 text-[9px] font-black uppercase tracking-[0.2em] transition-all focus:outline-none rounded-sm ${
                      selectedType === t 
                        ? 'bg-[#050810] text-emerald-500 shadow-[inset_0_2px_5px_rgba(0,0,0,0.8)] border border-transparent' 
                        : 'text-slate-400 bg-transparent hover:text-slate-200 hover:bg-slate-700/40 border border-transparent'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Primary Input Space */}
            <div className="flex-1 min-h-0 flex flex-col bg-[#050810] relative shadow-[inset_0_4px_15px_rgba(0,0,0,0.8)] focus-within:shadow-[inset_0_4px_15px_rgba(0,0,0,0.8),inset_0_0_0_1px_rgba(16,185,129,0.2)] transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`drafting ${selectedType}...`}
                disabled={!canRun || running}
                className="w-full h-full bg-transparent p-4 text-[13px] text-emerald-100/90 font-mono placeholder-slate-700 resize-none outline-none leading-relaxed tracking-wide"
              />
            </div>
            
            {/* Command Control Strip */}
            <div className="flex flex-col shrink-0 bg-[#0f1423] border-t border-black/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <div className="flex items-center justify-between p-3 px-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-[9px] uppercase tracking-widest text-slate-600 font-mono">
                    <span className="text-slate-700 font-bold">CTX:</span>
                    <span className="text-emerald-500/40">module={activeModule || 'global'}</span>
                  </div>
                  {!canRun ? (
                    <div className="flex items-center gap-1.5 text-amber-500/60 text-[9px] font-bold uppercase tracking-widest">
                      <AlertCircle size={10} />
                      <span className="opacity-80">Restricted</span>
                    </div>
                  ) : null}
                </div>
                
                <button
                  onClick={handleExecute}
                  disabled={!input.trim() || !canRun || running}
                  className="group flex items-center gap-2 px-6 py-2 bg-gradient-to-b from-[#1b2533] to-[#121927] hover:from-[#212d3d] hover:to-[#171f2d] active:from-[#050810] active:to-[#050810] disabled:from-[#0B1120] disabled:to-[#0B1120] text-emerald-500 active:text-emerald-600 disabled:text-slate-700 border border-black rounded shadow-[0_4px_6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.8)] disabled:shadow-none focus:outline-none transition-all"
                >
                  {running ? <Loader2 size={12} className="animate-spin text-emerald-500/60" /> : <Play size={12} className="fill-emerald-500/40 group-hover:fill-emerald-400/80 transition-colors" />}
                  <span className="text-[11px] font-black tracking-[0.2em] pt-[1px]">EXECUTE</span>
                </button>
              </div>

              {/* System Panel Output */}
              {(result || error) && (
                <div className="bg-[#03060C] border-t border-black shadow-[inset_0_4px_15px_rgba(0,0,0,0.8)] p-4 flex flex-col gap-2 max-h-48 overflow-y-auto">
                  <div className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-[0.2em] opacity-50">
                    <span className={error ? 'text-rose-500' : 'text-emerald-500'}>▶</span>
                    <span className={error ? 'text-rose-400' : 'text-slate-400'}>{error ? 'ERR_EXECUTION_FAILED' : 'SYS_OUT'}</span>
                  </div>
                  <div className={`font-mono text-[11px] whitespace-pre-wrap leading-relaxed tracking-wide ${error ? 'text-rose-400/80' : 'text-emerald-400/80'}`}>
                    {error ? error : JSON.stringify(result?.result || result?.data || result, null, 2)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE — ATTACHMENT STAGING (~35%) */}
          <div className="flex flex-col flex-[1_1_0] min-w-0 bg-[#121927] border-l border-black/40 shadow-[inset_1px_0_10px_rgba(0,0,0,0.2)]">
            {/* Attachments Header */}
            <div className="px-4 py-2 border-b border-black/40 bg-gradient-to-b from-[#161f30] to-[#121927] shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">ATTACHMENTS</h3>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-6">
              {/* Empty State */}
              {attachments.length === 0 && (
                <div className="pt-2 flex flex-col items-start text-left">
                  <span className="text-[9px] text-slate-600 font-mono uppercase tracking-[0.2em]">// no items attached</span>
                </div>
              )}

              {/* Scaffolding Slots */}
              <div className="flex flex-col gap-6 pt-2">
                <div className="flex flex-col gap-1.5">
                  <div className="text-[8px] font-black uppercase tracking-[0.25em] text-cyan-700/60 border-b border-white/5 pb-1 w-full relative">
                    ATTACHED CONTEXT
                    <div className="absolute right-0 bottom-[1px] w-1 h-1 bg-cyan-700/30"></div>
                  </div>
                  <div className="text-[10px] text-slate-600/80 font-mono tracking-wider pt-1">{'[ empty ]'}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="text-[8px] font-black uppercase tracking-[0.25em] text-cyan-700/60 border-b border-white/5 pb-1 w-full relative">
                    ATTACHED ASSETS
                    <div className="absolute right-0 bottom-[1px] w-1 h-1 bg-cyan-700/30"></div>
                  </div>
                  <div className="text-[10px] text-slate-600/80 font-mono tracking-wider pt-1">{'[ empty ]'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  , document.body);
}
