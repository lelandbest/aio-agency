import React from 'react';
import { HelpCircle, ArrowRight, Sparkles, Plus, Play } from 'lucide-react';
import { dispatchAction } from '../orchestration';

/**
 * Shared EmptyState component linked to the Help System Action Layer.
 * 
 * @param {string} title - The title of the empty state.
 * @param {string} description - A helpful description or guidance.
 * @param {Array} actions - Array of action objects { label, type, payload, icon }.
 */
const EmptyState = ({ 
  title, 
  description, 
  actions = [] 
}) => {
  const renderIcon = (iconName) => {
    switch (iconName) {
      case 'Plus': return <Plus size={16} />;
      case 'Play': return <Play size={16} />;
      case 'Sparkles': return <Sparkles size={16} />;
      default: return <ArrowRight size={16} />;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="w-20 h-20 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 flex items-center justify-center text-[var(--color-primary)] mb-6 shadow-2xl shadow-[var(--color-primary)]/5">
        <HelpCircle size={40} className="animate-pulse" />
      </div>

      <h3 className="text-2xl font-black text-[var(--color-text-primary)] uppercase tracking-tight mb-3">
        {title || "No Data Found"}
      </h3>
      
      <p className="max-w-md text-[var(--color-text-secondary)] text-sm font-medium leading-relaxed mb-8">
        {description || "It looks like you haven't started yet. Let's get you moving with some quick actions from the help system."}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={() => dispatchAction(action, { source: 'empty_state' })}
            className={`group flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all active:scale-95 ${
              index === 0 
              ? 'bg-[var(--color-primary)] border-[var(--color-primary)]/50 text-white shadow-xl shadow-[var(--color-primary)]/20 hover:bg-[var(--color-primary-hover)]' 
              : 'bg-white/5 border-white/10 text-[var(--color-text-primary)] hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <span className={index === 0 ? 'text-white' : 'text-[var(--color-primary)] group-hover:scale-110 transition-transform'}>
              {renderIcon(action.icon)}
            </span>
            <span className="text-[11px] font-black uppercase tracking-widest">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default EmptyState;
