
import React, { memo } from 'react';
import { NodeResizer } from '@xyflow/react';

const NoteNode = ({ data, selected }) => {
  const noteColor = data?.color || 'var(--color-bg-secondary)';
  const borderColor = data?.borderColor || 'var(--color-border)';
  const textColor = data?.textColor || 'var(--color-text-primary)';

  return (
    <div
      className={`rounded-lg border transition-all h-full w-full ${selected ? 'border-dashed' : 'shadow-lg'}`}
      style={{
        background: noteColor,
        borderColor: selected ? 'var(--color-primary)' : borderColor,
        color: textColor,
        padding: '4px 6px',
        boxShadow: selected 
          ? `0 0 20px rgba(8, 145, 178, 0.2), 0 10px 30px rgba(0,0,0,0.3)`
          : 'var(--shadow-note)',
        transform: selected ? 'scale(1.01)' : 'none',
      }}
    >
      <NodeResizer 
        color="var(--color-primary)" 
        isVisible={selected} 
        minWidth={60} 
        minHeight={30} 
        lineStyle={{ border: 'none' }}
      />
      <div className="text-[6px] font-black uppercase tracking-[0.1em] pointer-events-none select-none opacity-80 border-b border-white/5 pb-0.5">
        {data?.label || 'Note'}
      </div>
      <div 
        className="text-[5px] whitespace-pre-wrap opacity-90 leading-[1.1] mt-0.5 pointer-events-none select-none font-mono"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}
      >
        {data?.note || 'Add your note...'}
      </div>
    </div>
  );
};

export default memo(NoteNode);
