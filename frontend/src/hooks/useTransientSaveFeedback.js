import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useTransientSaveFeedback Hook
 * Provides a transient "saved" state for UI feedback (e.g., changing button text to "Saved" for a few seconds).
 * @param {number} duration - How long the feedback should remain (ms). Default 3000ms.
 */
export const useTransientSaveFeedback = (duration = 3000) => {
  const [savedKey, setSavedKey] = useState('');
  const timeoutRef = useRef(null);

  useEffect(() => () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
  }, []);

  const triggerSavedSource = useCallback((key) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    setSavedKey(key);
    timeoutRef.current = window.setTimeout(() => {
      setSavedKey('');
      timeoutRef.current = null;
    }, duration);
  }, [duration]);

  return [savedKey, triggerSavedSource];
};

/**
 * Helper to generate dynamic button classes based on save state.
 */
export const saveButtonClassName = (baseClassName, isSaved) => 
  `${baseClassName} save-feedback-btn${isSaved ? ' is-saved' : ''}`;
