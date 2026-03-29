import { useState, useCallback } from 'react';

export const useSystemConfirm = () => {
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: () => {},
    onClose: () => {},
    showPrompt: false,
    promptValue: '',
    promptPlaceholder: '',
    requiredPrompt: ''
  });

  const confirm = useCallback((config) => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        title: config.title || 'Confirm Action',
        message: config.message || 'Are you sure?',
        variant: config.variant || 'info',
        confirmText: config.confirmText || 'Confirm',
        cancelText: config.cancelText || 'Cancel',
        showPrompt: config.showPrompt || false,
        promptPlaceholder: config.promptPlaceholder || 'Type here...',
        requiredPrompt: config.requiredPrompt || '',
        promptValue: '',
        onConfirm: (promptVal = '') => {
          if (config.requiredPrompt && promptVal !== config.requiredPrompt) {
            alert(`Please type "${config.requiredPrompt}" exactly.`);
            return;
          }
          setModalState((prev) => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onClose: () => {
          setModalState((prev) => ({ ...prev, isOpen: false }));
          resolve(false);
        }
      });
    });
  }, []);

  const setPromptValue = useCallback((val) => {
    setModalState((prev) => ({ ...prev, promptValue: val }));
  }, []);

  return { confirm, modalState, setPromptValue };
};
