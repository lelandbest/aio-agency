
import React from 'react';

const FrameNode = ({ data }) => {
  const frameColor = data?.color || 'var(--color-bg-secondary)';
  const borderColor = data?.borderColor || 'var(--color-border)';
  const textColor = data?.textColor || 'var(--color-text-primary)';

  return (
    <div
      className="rounded-2xl border shadow-lg"
      style={{
        width: data?.width || 320,
        height: data?.height || 200,
        background: frameColor,
        borderColor,
        color: textColor,
        opacity: 0.9,
        boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
      }}
    >
      <div className="p-4 text-xs font-semibold uppercase tracking-wide">
        {data?.label || 'Frame'}
      </div>
      {data?.note && (
        <div className="px-4 pb-4 text-sm text-[var(--color-text-secondary)]">
          {data.note}
        </div>
      )}
    </div>
  );
};

export default FrameNode;
