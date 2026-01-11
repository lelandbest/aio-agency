import React from 'react';
import * as Icons from 'lucide-react';

export const IconPicker = ({ currentIcon, onSelect, onClose }) => (
  <div className="absolute z-50 mt-2 p-2 bg-[#18181B] border border-[#27272A] rounded-lg shadow-xl w-64 grid grid-cols-6 gap-2">
    {Object.keys(Icons).map((iconKey) => {
      const IconComp = Icons[iconKey];
      return (
        <button 
          key={iconKey} 
          onClick={() => { onSelect(iconKey); onClose(); }} 
          className={`p-1.5 rounded hover:bg-[#27272A] flex justify-center ${currentIcon === iconKey ? 'bg-purple-900 text-white' : 'text-gray-400'}`}
        >
          <IconComp size={16} />
        </button>
      );
    })}
  </div>
);

export const IframeView = ({ url, title }) => (
  <div className="h-full flex flex-col bg-[#0F0F11] rounded-xl overflow-hidden border border-[#27272A]">
    <div className="p-3 border-b border-[#27272A] bg-[#050505] flex justify-between items-center">
      <span className="text-sm font-medium text-gray-400">External: {title}</span>
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-purple-400 flex gap-1">
        Open <Icons.ExternalLink size={10} />
      </a>
    </div>
    <iframe src={url} title={title} className="w-full h-full border-none" />
  </div>
);

// Helper to map string icon names to Lucide components
export const IconLibrary = Icons;