
import React, { memo } from 'react';
import { NodeResizer } from '@xyflow/react';

const FrameNode = ({ data, selected }) => {
  const frameColor = data?.color || 'var(--color-bg-secondary)';
  const borderColor = data?.borderColor || 'var(--color-border)';
  const textColor = data?.textColor || 'var(--color-text-primary)';

  return (
    <div
      className={`rounded-lg border transition-all h-full w-full ${selected ? 'border-dashed' : ''}`}
      style={{
        background: frameColor,
        borderColor: selected ? 'var(--color-primary)' : borderColor,
        color: textColor,
        opacity: 0.9,
        boxShadow: selected 
          ? `0 0 20px rgba(8, 145, 178, 0.2), 0 10px 30px rgba(0,0,0,0.4)`
          : '0 12px 30px rgba(0,0,0,0.35)',
        transform: selected ? 'scale(1.005)' : 'none',
      }}
    >
      <NodeResizer 
        color="var(--color-primary)" 
        isVisible={selected} 
        minWidth={200} 
        minHeight={100} 
        lineStyle={{ border: 'none' }}
      />
      <div className="p-1 px-2 text-[6px] font-black uppercase tracking-[0.1em] pointer-events-none select-none opacity-80">
        {data?.label || 'Frame'}
      </div>
      {data?.note && (
        <div 
          className="px-2 pb-1 text-[5px] text-[var(--color-text-secondary)] pointer-events-none select-none font-mono leading-[1.1]"
          style={{ fontFamily: 'var(--font-mono, monospace)' }}
        >
          {data.note}
        </div>
      )}
    </div>
  );
};

export default memo(FrameNode);
