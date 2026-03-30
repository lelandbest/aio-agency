import React from 'react';
import { getIconComponent } from '../data/nodeLibrary';
import { Zap, Clock, Info } from 'lucide-react';

const TemplateCard = ({ template, onApply, onPreview }) => {
  const Icon = getIconComponent(template.iconName) || Zap;

  return (
    <div className="group relative bg-[var(--color-bg-primary)] border border-[var(--color-border)]/50 rounded-xl p-4 hover:border-[var(--color-primary)]/40 hover:shadow-island-sm transition-all shadow-sm flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-primary)] shadow-sm">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[12px] font-black text-[var(--color-text-primary)] uppercase tracking-tight truncate">
              {template.name}
            </h3>
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
              template.complexity === 'Advanced' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
              template.complexity === 'Intermediate' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
              'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              {template.complexity}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-tertiary)] uppercase font-bold tracking-widest mt-1">
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {template.nodes.length} Nodes</span>
            <span className="w-1 h-1 rounded-full bg-[var(--color-border)]" />
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 5m Setup</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-[10px] text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">
        {template.description}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-2">
        <button 
          onClick={(e) => { e.stopPropagation(); onApply(template); }}
          className="flex-1 h-8 rounded-lg bg-[var(--color-primary)]/5 text-[var(--color-primary)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--color-primary)] hover:text-white transition-all border border-[var(--color-primary)]/10 shadow-sm flex items-center justify-center"
        >
          Use Template
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onPreview(template); }}
          className="h-8 px-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-all flex items-center justify-center"
          title="Preview Structure"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default TemplateCard;
