import React, { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

const GLOBAL_OVERLAY_ID = 'aio-global-overlay';

let overlayInstance = null;

export function openGlobalOverlay() {
  if (overlayInstance) {
    overlayInstance.open();
  }
}

export function closeGlobalOverlay() {
  if (overlayInstance) {
    overlayInstance.close();
  }
}

export function isGlobalOverlayOpen() {
  return overlayInstance ? overlayInstance.isOpen() : false;
}

export function setGlobalOverlayRef(ref) {
  overlayInstance = ref;
}

const GlobalOverlay = ({ 
  children, 
  activeModule = null, 
  isOpen: controlledIsOpen, 
  onClose: controlledOnClose 
}) => {
  const [internalIsOpen, setInternalIsOpen] = React.useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  useEffect(() => {
    setGlobalOverlayRef({
      open: () => !isControlled && setInternalIsOpen(true),
      close: () => !isControlled && setInternalIsOpen(false),
      isOpen: () => isOpen,
    });
  }, [isControlled, isOpen]);

  const handleClose = useCallback(() => {
    if (isControlled && controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
  }, [isControlled, controlledOnClose]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isOpen && e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const moduleLabel = activeModule 
    ? activeModule.replace('aio-', '').replace('-', ' ').toUpperCase() 
    : 'MODULE';

  return (
    <div 
      id={GLOBAL_OVERLAY_ID}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ 
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Close Button - Top Right */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
        title="Close (ESC)"
      >
        <X size={20} />
      </button>

      {/* Module Context Badge */}
      <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-slate-800/60 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] border border-slate-700/50">
        {moduleLabel}
      </div>

      {/* Content Area */}
      <div className="w-full max-w-2xl max-h-[80vh] p-6">
        {children || (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4 border border-slate-700/50">
              <span className="text-2xl font-light text-slate-500">⌘</span>
            </div>
            <h2 className="text-sm font-bold text-white uppercase tracking-[0.15em] mb-2">
              Global Command Surface
            </h2>
            <p className="text-xs text-slate-400 max-w-xs">
              Work in progress. This overlay provides a shared command surface for agent interactions.
            </p>
          </div>
        )}
      </div>

      {/* Keyboard Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-slate-900/80 text-[9px] text-slate-500 uppercase tracking-widest border border-slate-800">
        ESC TO CLOSE
      </div>
    </div>
  );
};

export default GlobalOverlay;