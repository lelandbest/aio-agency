import React from 'react';
import { getIconComponent } from '../data/nodeLibrary';
import { Zap, Clock, Info } from 'lucide-react';

const TemplateCard = ({ template, onApply, onPreview }) => {
  const Icon = getIconComponent(template.iconName) || Zap;

  return (
    <div className="group relative bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-3 hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-bg-tertiary)] transition-all cursor-pointer shadow-sm hover:shadow-md">
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-primary)]">
          <Icon className="w-5 h-5" />
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
          template.complexity === 'Advanced' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
          template.complexity === 'Intermediate' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
          'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        }`}>
          {template.complexity}
        </div>
      </div>

      <h3 className="text-[11px] font-black text-[var(--color-text-primary)] uppercase tracking-tight mb-1 truncate">
        {template.name}
      </h3>
      <p className="text-[10px] text-[var(--color-text-tertiary)] line-clamp-2 leading-relaxed mb-3">
        {template.description}
      </p>

      <div className="flex items-center justify-between gap-2">
        <button 
          onClick={(e) => { e.stopPropagation(); onApply(template); }}
          className="flex-1 py-1.5 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--color-primary)] hover:text-white transition-all border border-[var(--color-primary)]/20 shadow-sm"
        >
          Use Template
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onPreview(template); }}
          className="p-1.5 rounded-md bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-all"
          title="Preview Structure"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-2 pt-2 border-t border-[var(--color-border)]/50 flex items-center gap-3">
        <div className="flex items-center gap-1 text-[8px] text-[var(--color-text-tertiary)] uppercase font-bold tracking-widest">
          <Zap className="w-2.5 h-2.5" />
          {template.nodes.length} Nodes
        </div>
        <div className="flex items-center gap-1 text-[8px] text-[var(--color-text-tertiary)] uppercase font-bold tracking-widest">
          <Clock className="w-2.5 h-2.5" />
          5m Setup
        </div>
      </div>
    </div>
  );
};

export default TemplateCard;
