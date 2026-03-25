import React from 'react';
import * as Icons from 'lucide-react';

export const IconPicker = ({ currentIcon, onSelect, onClose }) => (
  <div className="absolute z-50 mt-2 p-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] shadow-island w-64 grid grid-cols-6 gap-2 animate-in fade-in zoom-in duration-200">
    {Object.keys(Icons).map((iconKey) => {
      const IconComp = Icons[iconKey];
      return (
        <button 
          key={iconKey} 
          onClick={() => { onSelect(iconKey); onClose(); }} 
          className={`p-1.5 rounded-[var(--radius-card)] hover:bg-[var(--color-hover)] flex justify-center transition-all ${currentIcon === iconKey ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-tertiary)]'}`}
        >
          <IconComp size={16} />
        </button>
      );
    })}
  </div>
);

export const IframeView = ({ url, title }) => (
  <div className="h-full flex flex-col bg-[var(--color-bg-primary)] rounded-[var(--radius-panel)] overflow-hidden border border-[var(--color-border)] shadow-island">
    <div className="p-3 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex justify-between items-center">
      <span className="text-sm font-medium text-[var(--color-text-secondary)]">External: {title}</span>
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-accent)] hover:underline flex gap-1">
        Open <Icons.ExternalLink size={10} />
      </a>
    </div>
    <iframe src={url} title={title} className="w-full h-full border-none" />
  </div>
);

// Helper to map string icon names to Lucide components
export const IconLibrary = Icons;