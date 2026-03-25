import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Zap, Info } from 'lucide-react';

const VariableMappingModal = ({ template, isOpen, onClose, onConfirm }) => {
  const [mappings, setMappings] = useState({});

  useEffect(() => {
    if (template?.placeholders) {
      const initial = {};
      template.placeholders.forEach(p => {
        initial[p] = '';
      });
      setMappings(initial);
    }
  }, [template]);

  if (!isOpen || !template) return null;

  const handleConfirm = () => {
    onConfirm(mappings);
  };

  const isComplete = Object.values(mappings).every(v => v.trim() !== '');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-secondary)]/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-widest">Map Template Variables</h2>
              <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-tight font-bold">Configure {template.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)] transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto crm-scroll-hidden">
          <div className="p-3 rounded-xl bg-sky-500/5 border border-sky-500/10 flex gap-3">
            <Info className="w-4 h-4 text-sky-400 mt-0.5" />
            <p className="text-[11px] text-sky-300 leading-relaxed font-medium">
              This template uses dynamic placeholders. Maps them now to align with your CRM and messaging channels.
            </p>
          </div>

          <div className="space-y-4">
            {template.placeholders.map((placeholder) => (
              <div key={placeholder} className="space-y-2">
                <label className="block text-[10px] font-black text-[var(--color-text-secondary)] uppercase tracking-[0.1em]">
                  {placeholder.replace(/[{}]/g, '').replace(/_/g, ' ')}
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    value={mappings[placeholder] || ''}
                    onChange={(e) => setMappings(prev => ({ ...prev, [placeholder]: e.target.value }))}
                    placeholder={`Enter value for ${placeholder}...`}
                    className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]/40 hover:border-[var(--color-border-hover)] transition-all"
                  />
                  <div className="absolute right-3 top-2.5 px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[8px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest border border-[var(--color-border)]">
                    Required
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--color-hover)] transition-all border border-[var(--color-border)]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isComplete}
            className={`flex-[2] py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-premium border border-white/10 ${
              isComplete
                ? 'bg-[var(--color-primary)] text-white hover:opacity-90'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed grayscale'
            }`}
          >
            Apply Template
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VariableMappingModal;
