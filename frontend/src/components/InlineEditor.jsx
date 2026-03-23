import React, { useState, useRef, useEffect } from 'react';
import { 
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link, X, Check
} from 'lucide-react';

const InlineEditor = ({ 
  value, 
  onChange, 
  placeholder = 'Edit text...',
  autoFocus = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');
  const [selection, setSelection] = useState(null);
  const editorRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  const handleDoubleClick = () => {
    setIsEditing(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 10);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === 'Escape') {
      setLocalValue(value || '');
      setIsEditing(false);
    }
  };

  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    if (inputRef.current) {
      setLocalValue(inputRef.current.innerHTML);
    }
  };

  const handleLink = () => {
    const url = prompt('Enter URL:', 'https://');
    if (url) {
      execCommand('createLink', url);
    }
  };

  if (isEditing) {
    return (
      <div className="relative">
        <div className="flex items-center gap-1 mb-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg p-1">
          <button
            onMouseDown={(e) => { e.preventDefault(); execCommand('bold'); }}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-tertiary)] hover:text-white transition"
            title="Bold"
          >
            <Bold size={14} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCommand('italic'); }}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-tertiary)] hover:text-white transition"
            title="Italic"
          >
            <Italic size={14} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCommand('underline'); }}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-tertiary)] hover:text-white transition"
            title="Underline"
          >
            <Underline size={14} />
          </button>
          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
          <button
            onMouseDown={(e) => { e.preventDefault(); execCommand('justifyLeft'); }}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-tertiary)] hover:text-white transition"
            title="Align Left"
          >
            <AlignLeft size={14} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCommand('justifyCenter'); }}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-tertiary)] hover:text-white transition"
            title="Align Center"
          >
            <AlignCenter size={14} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCommand('justifyRight'); }}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-tertiary)] hover:text-white transition"
            title="Align Right"
          >
            <AlignRight size={14} />
          </button>
          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
          <button
            onMouseDown={(e) => { e.preventDefault(); execCommand('insertUnorderedList'); }}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-tertiary)] hover:text-white transition"
            title="Bullet List"
          >
            <List size={14} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCommand('insertOrderedList'); }}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-tertiary)] hover:text-white transition"
            title="Numbered List"
          >
            <ListOrdered size={14} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); handleLink(); }}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-tertiary)] hover:text-white transition"
            title="Insert Link"
          >
            <Link size={14} />
          </button>
          <div className="flex-1" />
          <button
            onMouseDown={(e) => { e.preventDefault(); setLocalValue(value || ''); setIsEditing(false); }}
            className="p-1.5 hover:bg-red-500/20 rounded text-[var(--color-text-tertiary)] hover:text-red-400 transition"
            title="Cancel"
          >
            <X size={14} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); handleBlur(); }}
            className="p-1.5 hover:bg-green-500/20 rounded text-[var(--color-text-tertiary)] hover:text-green-400 transition"
            title="Done"
          >
            <Check size={14} />
          </button>
        </div>
        <div
          ref={inputRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onInput={(e) => setLocalValue(e.currentTarget.innerHTML)}
          className="w-full min-h-[80px] bg-[var(--color-bg-secondary)] border border-[var(--color-primary)] rounded-lg p-3 text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: '1.5' }}
          dangerouslySetInnerHTML={{ __html: localValue }}
        />
      </div>
    );
  }

  return (
    <div
      ref={editorRef}
      onDoubleClick={handleDoubleClick}
      className="cursor-text min-h-[40px] px-2 py-1 rounded hover:bg-[var(--color-hover)] transition-colors"
      style={{ fontFamily: 'inherit' }}
    >
      {localValue || <span className="text-[var(--color-text-tertiary)] italic">{placeholder}</span>}
    </div>
  );
};

export default InlineEditor;
