import React from 'react';
import { X, AlertTriangle, Trash2, Info } from 'lucide-react';

const SystemConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Confirm Action", 
  message = "Are you sure you want to proceed?", 
  confirmText = "Confirm", 
  cancelText = "Cancel",
  variant = "info", // "info", "danger", "warning"
  showPrompt = false,
  promptValue = "",
  onPromptChange,
  promptPlaceholder = "Type here..."
}) => {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const Icon = isDanger ? Trash2 : variant === 'warning' ? AlertTriangle : Info;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      {/* Scrim */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      {/* Modal Surface */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDanger ? 'bg-red-500/20 text-red-500' : 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'}`}>
              <Icon size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black text-[var(--color-text-primary)] uppercase tracking-tight">{title}</h2>
              <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest mt-0.5">System Protocol</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] font-medium">
            {message}
          </p>

          {showPrompt && (
            <div className="space-y-2">
              <input
                type="text"
                value={promptValue}
                onChange={(e) => onPromptChange(e.target.value)}
                autoFocus
                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)]/50 outline-none transition-all font-medium placeholder:text-[var(--color-text-tertiary)]/50"
                placeholder={promptPlaceholder}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--color-bg-primary)]/20 flex items-center justify-end gap-3 mt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-all uppercase tracking-widest border border-transparent hover:border-[var(--color-border)]"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`
              px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg
              ${isDanger 
                ? 'bg-red-500 hover:bg-red-600 border-red-400 shadow-red-500/20' 
                : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] border-[var(--color-primary)]/50 shadow-[var(--color-primary)]/20'}
              text-white border
            `}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemConfirmModal;
