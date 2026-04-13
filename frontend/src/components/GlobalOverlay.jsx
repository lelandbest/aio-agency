import React, { useEffect, useCallback } from 'react';
import Composer from './Composer';

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

  return <Composer activeModule={activeModule} isOpen={isOpen} onClose={handleClose} />;
};

export default GlobalOverlay;