import React, { useState } from 'react';
import { Bot, X, Sparkles, Send, ArrowRight, Loader2, Wand2 } from 'lucide-react';

const AiGeneratorModal = ({ isOpen, onClose, onGenerate }) => {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    
    // Simulate AI Generation
    setTimeout(() => {
      onGenerate(prompt);
      setGenerating(false);
      setPrompt('');
    }, 2000);
  };

  const suggestions = [
    "New lead follow-up with AI qualification",
    "Abandoned cart recovery via SMS",
    "Webhook data mapping to CRM fields",
    "Daily summary report of active deals"
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-[var(--color-bg-primary)] border border-sky-500/30 rounded-3xl shadow-[0_0_50px_rgba(14,165,233,0.15)] overflow-hidden flex flex-col">
        {/* Glow Header */}
        <div className="p-6 border-b border-[var(--color-border)] bg-gradient-to-r from-sky-500/10 via-transparent to-purple-500/10 relative">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500 flex items-center justify-center shadow-[0_0_20px_rgba(14,165,233,0.4)]">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white uppercase tracking-widest leading-none mb-1">Flow Generator</h2>
                <div className="flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[10px] text-sky-400 font-black uppercase tracking-[0.2em]">Ready</p>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-[var(--color-text-tertiary)] transition-all">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-sky-400 uppercase tracking-[0.3em] ml-1">Describe your intent</label>
            <div className="relative group">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                autoFocus
                placeholder="Ex: When a contact is created, send an AI-qualified email and notify my Slack channel..."
                className="w-full min-h-[140px] bg-slate-900/50 border border-sky-500/20 rounded-2xl p-4 text-sm text-white placeholder:text-slate-500 outline-none focus:border-sky-500/50 focus:ring-4 focus:ring-sky-500/10 transition-all resize-none leading-relaxed"
              />
              <div className="absolute bottom-4 right-4 flex items-center gap-2 pointer-events-none">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-800 px-2 py-1 rounded-md border border-white/5">
                  Freeform input
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Examples</label>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setPrompt(s)}
                  className="px-3 py-1.5 rounded-full bg-slate-800/50 border border-white/5 text-[10px] text-slate-300 hover:border-sky-500/40 hover:text-sky-400 transition-all uppercase tracking-tighter"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="p-6 bg-slate-900/50 border-t border-[var(--color-border)] flex gap-4">
          <button
            disabled={generating}
            className="flex-1 py-3.5 rounded-2xl bg-slate-800 text-slate-400 text-[11px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-white/5"
          >
            Load Draft
          </button>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className={`flex-[2] py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all relative overflow-hidden ${
              prompt.trim() && !generating
                ? 'bg-sky-500 text-white shadow-[0_0_30px_rgba(14,165,233,0.3)] hover:bg-sky-400'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Building Flow...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate Flow
                <ArrowRight className="w-4 h-4" />
              </>
            )}
            {generating && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiGeneratorModal;
