
import React from 'react';

const NoteNode = ({ data, selected }) => {
  const noteColor = data?.color || 'var(--color-bg-secondary)';
  const borderColor = data?.borderColor || 'var(--color-border)';
  const textColor = data?.textColor || 'var(--color-text-primary)';

  return (
    <div
      className="rounded-2xl border shadow-lg"
      style={{
        width: data?.width || 280,
        minHeight: data?.height || 140,
        background: noteColor,
        borderColor,
        color: textColor,
        padding: '14px 16px',
        boxShadow: 'var(--shadow-note)',
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide mb-2">
        {data?.label || 'Note'}
      </div>
      <div className="text-sm whitespace-pre-wrap opacity-90">
        {data?.note || 'Add your note...'}
      </div>
    </div>
  );
};

export default NoteNode;
