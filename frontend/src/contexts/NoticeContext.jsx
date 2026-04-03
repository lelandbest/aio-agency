import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const NoticeContext = createContext(null);

const DEFAULT_DURATION_MS = 3000;
const MAX_VISIBLE_NOTICES = 3;

export function NoticeProvider({ children }) {
  const [notices, setNotices] = useState([]);
  const timersRef = useRef({});

  const clearNoticeTimer = useCallback((id) => {
    if (timersRef.current[id]) {
      window.clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const dismissNotice = useCallback((id) => {
    clearNoticeTimer(id);
    setNotices((current) => current.filter((n) => n.id !== id));
  }, [clearNoticeTimer]);

  const clearAllNotices = useCallback(() => {
    Object.keys(timersRef.current).forEach(clearNoticeTimer);
    setNotices([]);
  }, [clearNoticeTimer]);

  const showNotice = useCallback((options) => {
    const {
      type,
      tone,
      message,
      title,
      persistent = false,
      durationMs = DEFAULT_DURATION_MS,
      dismissible = true,
      source,
    } = options;

    if (!message) return null;

    const id = `notice-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const resolvedType = type || tone || 'info';
    const notice = {
      id,
      type: resolvedType,
      message,
      title,
      persistent,
      dismissible,
      source,
      createdAt: Date.now(),
    };

    setNotices((current) => {
      const next = [notice, ...current].slice(0, MAX_VISIBLE_NOTICES);
      return next;
    });

    if (!persistent) {
      timersRef.current[id] = window.setTimeout(() => {
        dismissNotice(id);
      }, durationMs);
    }

    return id;
  }, [dismissNotice]);

  useEffect(() => {
    return () => {
      Object.keys(timersRef.current).forEach(clearNoticeTimer);
    };
  }, [clearNoticeTimer]);

  return (
    <NoticeContext.Provider value={{ notices, showNotice, dismissNotice, clearAllNotices }}>
      {children}
    </NoticeContext.Provider>
  );
}

export function useNotice() {
  const context = useContext(NoticeContext);
  if (!context) {
    throw new Error('useNotice must be used within a NoticeProvider');
  }
  return context;
}

export function GlobalNoticeViewport() {
  const { notices, dismissNotice } = useNotice();

  if (!notices.length) return null;

  return (
    <div className="pointer-events-none fixed right-6 top-4 z-[9999] flex w-full max-w-[440px] flex-col gap-2">
      {notices.map((notice) => (
        <NoticeToast key={notice.id} notice={notice} onDismiss={dismissNotice} />
      ))}
    </div>
  );
}

function NoticeToast({ notice, onDismiss }) {
  const typeClasses = {
    success: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-100',
    error: 'border-red-500/30 bg-red-500/8 text-red-100',
    warning: 'border-amber-500/30 bg-amber-500/8 text-amber-100',
    info: 'border-cyan-500/30 bg-cyan-500/8 text-cyan-100',
  };

  const iconColors = {
    success: 'text-emerald-400',
    error: 'text-red-400',
    warning: 'text-amber-400',
    info: 'text-cyan-400',
  };

  const toneClass = typeClasses[notice.type] || typeClasses.info;

  return (
    <div
      className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.28)] transition-all duration-300 ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {notice.title ? (
            <p className="text-sm font-semibold">{notice.title}</p>
          ) : null}
          <p className="text-sm">{notice.message}</p>
        </div>
        {notice.dismissible ? (
          <button
            type="button"
            onClick={() => onDismiss(notice.id)}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 text-current/80 transition hover:text-current ${iconColors[notice.type] || ''}`}
            aria-label="Dismiss notice"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
