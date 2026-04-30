import React, { useMemo, useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowUp,
  Loader2,
  Mic,
  Sparkles,
  X,
  Crosshair,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAIAssist } from '../contexts/AIAssistContext';
import { AiService } from '../services/ai.service';

const STARTER_PROMPTS = [
  "Why didn't my booking flow run?",
  'What is broken right now?',
  'How is this tenant configured?',
  'What failed recently?',
  "Why wasn't this message sent?",
];

const FLOATING_PANEL_CLASS = 'floating-surface rounded-[var(--radius-modal)]';
const SURFACE_CARD_CLASS = 'surface-base rounded-[var(--radius-panel)]';
const SURFACE_TERTIARY_CLASS = 'surface-tertiary rounded-[var(--radius-card)]';

const OperatorAssistDock = ({ activeModule, activeModuleLabel }) => {
  const { isOperator } = useAuth();
  const { 
    isOpen: open, 
    closeAIAssist: setOpen, 
    assistMode,
    selectedAgent,
    isCollab
  } = useAIAssist();
  const operatorMode = isOperator?.() ?? false;
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState([]);
  const textareaRef = useRef(null);
  const scrollRef = useRef(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const nearBottom = (scrollHeight - scrollTop - clientHeight) < 80;
    setIsNearBottom(nearBottom);
  };

  useEffect(() => {
    if (!scrollRef.current || !isNearBottom) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [entries, isNearBottom]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const currentContext = useMemo(
    () => ({
      module: activeModule || 'app',
      surface: 'floating-assist-panel',
      topic: activeModuleLabel || activeModule || 'workspace',
    }),
    [activeModule, activeModuleLabel],
  );

  const lastAgentRef = useRef(selectedAgent);

  useEffect(() => {
    if (selectedAgent && selectedAgent !== lastAgentRef.current) {
      const systemMessageId = `system-entry-${Date.now()}`;
      setEntries((prev) => [
        ...prev,
        {
          id: systemMessageId,
          type: 'system',
          prompt: null,
          response: {
            answer: `${selectedAgent} Activated! Standing by for directives.`,
            insights: [`Identity Persistence Verification: ${selectedAgent} lead.`],
            suggestedActions: []
          },
          pending: false
        }
      ]);
    }
    lastAgentRef.current = selectedAgent;
  }, [selectedAgent]);

  if (!operatorMode) {
    return null;
  }

  if (!open) {
    return null;
  }

  const submitPrompt = async (rawPrompt) => {
    const message = String(rawPrompt || prompt).trim();
    if (!message || loading) {
      return;
    }
    const pendingId = `assist-entry-${Date.now()}`;
    setOpen(true);
    setError('');
    setLoading(true);
    setPrompt('');
    setEntries((prev) => [
      ...prev,
      {
        id: pendingId,
        prompt: message,
        response: null,
        pending: true,
      }
    ]);

    try {
      const response = await AiService.getOperatorAssistResponse({
        message,
        context: { 
          ...currentContext, 
          assistMode,
          targetAgent: selectedAgent,
          collab: isCollab
        },
      });

      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === pendingId
            ? {
                ...entry,
                pending: false,
                response: response || {
                  answer: "I don't have enough data to confirm that.",
                  insights: [],
                  suggestedActions: [],
                },
              }
            : entry,
        ),
      );
    } catch (requestError) {
      const messageText = requestError.message || 'Unable to reach Operator Assist.';
      setError(messageText);
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === pendingId
            ? {
                ...entry,
                pending: false,
                response: {
                  answer: messageText,
                  insights: [],
                  suggestedActions: [],
                },
              }
            : entry,
        ),
      );
    } finally {
      setLoading(false);
      // Phase 6: Input focus must remain in the AGENT COMMAND POST chat/command field after submit
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  };

  const emptyState = entries.length === 0;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex max-w-[min(420px,calc(100vw-1.5rem))] flex-col items-end gap-3">
      {open ? (
        <section className={`pointer-events-auto flex h-[min(70vh,680px)] w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden bg-[#0A0A0C]/95 backdrop-blur-2xl border border-[#2A2D35] shadow-[0_20px_40px_rgba(0,0,0,0.8),_inset_0_1px_1px_rgba(255,255,255,0.05)] ${FLOATING_PANEL_CLASS}`}>
          <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
            <div className="min-w-0">
              <div className={`inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-text-primary)] ${assistMode === 'help' ? 'border-amber-500/20 bg-amber-500/10' : 'border-sky-500/20 bg-sky-500/10'}`}>
                {assistMode === 'help' ? <Crosshair size={12} /> : <Sparkles size={12} />}
                {assistMode === 'help' ? 'Module Assist' : 'Operator Assist'}
              </div>
              <div className="mt-3 text-base font-black text-[var(--color-text-primary)]">
                {assistMode === 'help' ? 'Contextual guidance' : (selectedAgent ? `Routed: ${selectedAgent}` : 'Grounded system guidance')}
              </div>
              <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                {assistMode === 'help' 
                  ? 'Uses help articles and module context for guidance.' 
                  : (selectedAgent 
                      ? (isCollab ? `Alpha orchestrating Specialist Collab with ${selectedAgent} lead.` : `Alpha orchestrating single specialist: ${selectedAgent}.`)
                      : 'Uses canonical /api/assist responses grounded on live tenant state.')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`p-2 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] ${SURFACE_CARD_CLASS}`}
              aria-label="Close operator assist"
            >
              <X size={16} />
            </button>
          </header>

          <div 
            className="flex-1 overflow-y-auto px-5 py-4"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            {emptyState ? (
              <div className="space-y-5">
                <div className={`${SURFACE_CARD_CLASS} p-4`}>
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {assistMode === 'help' ? 'Get help with this module' : 'Ask about real system behavior'}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                    {assistMode === 'help'
                      ? 'Ask about field requirements, module functionality, or how to perform specific tasks in this view.'
                      : 'Operator Assist explains current runs, flows, settings, comms, and calendar state without inventing missing data.'}
                  </div>
                </div>
                <div>
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Starter Prompts</div>
                  <div className="space-y-2">
                    {STARTER_PROMPTS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => submitPrompt(starter)}
                        className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-hover)] ${SURFACE_CARD_CLASS}`}
                      >
                        <span>{starter}</span>
                        <ArrowUp size={14} className="rotate-45 text-[var(--color-text-tertiary)]" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {entries.map((entry) => (
                  <article
                    key={entry.id}
                    className={`${SURFACE_CARD_CLASS} p-4`}
                  >
                    {entry.type !== 'system' && (
                      <>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Prompt</div>
                        <div className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{entry.prompt}</div>
                      </>
                    )}

                    {entry.pending ? (
                      <div className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                        <Loader2 size={14} className="animate-spin" />
                        Gathering live system context...
                      </div>
                    ) : (
                      <>
                        <div className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Answer</div>
                        <div className="mt-2 text-sm leading-6 text-[var(--color-text-primary)]">
                          {entry.response?.message || entry.response?.answer || "I don't have enough data to confirm that."}
                        </div>

                        {Array.isArray(entry.response?.insights) && entry.response.insights.length > 0 ? (
                          <div className="mt-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Insights</div>
                            <ul className="mt-2 space-y-2">
                              {entry.response.insights.map((insight, index) => (
                                <li
                                  key={`${entry.id}-insight-${index}`}
                                  className={`${SURFACE_TERTIARY_CLASS} px-3 py-2 text-sm text-[var(--color-text-secondary)]`}
                                >
                                  {insight}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {Array.isArray(entry.response?.suggestedActions) && entry.response.suggestedActions.length > 0 ? (
                          <div className="mt-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Suggested Actions</div>
                            <ul className="mt-2 space-y-2">
                              {entry.response.suggestedActions.map((action, index) => (
                                <li
                                  key={`${entry.id}-action-${index}`}
                                  className="rounded-[var(--radius-card)] border border-sky-500/18 bg-sky-500/8 px-3 py-2 text-sm text-[var(--color-text-primary)]"
                                >
                                  {action}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          <footer className="border-t border-[var(--color-border)] px-5 py-4">
            {error ? (
              <div className="mb-3 rounded-[var(--radius-card)] border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            ) : null}
            <div className="flex items-end gap-3">
              <div className={`flex min-h-[54px] flex-1 items-end px-4 py-3 ${SURFACE_CARD_CLASS}`}>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      submitPrompt();
                    }
                  }}
                  rows={1}
                  placeholder={assistMode === 'help' 
                    ? "Ask how to use this module or specific fields..." 
                    : "Ask about runs, settings, failures, or tenant state..."}
                  className="max-h-28 min-h-[24px] w-full resize-none bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
                />
              </div>
              <button
                type="button"
                disabled
                title="Voice assist will attach here later"
                aria-label="Voice assist reserved"
                className={`flex h-12 w-12 items-center justify-center text-[var(--color-text-tertiary)] opacity-50 ${SURFACE_CARD_CLASS}`}
              >
                <Mic size={16} />
              </button>
              <button
                type="button"
                onClick={() => submitPrompt()}
                disabled={!prompt.trim() || loading}
                className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-card)] border border-sky-500/22 bg-sky-500/12 text-[var(--color-text-primary)] transition hover:bg-sky-500/18 disabled:cursor-not-allowed disabled:opacity-40 shadow-[var(--shadow-base)]"
                aria-label="Send assist prompt"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
              </button>
            </div>
          </footer>
        </section>
      ) : null}

    </div>
  );
};

OperatorAssistDock.propTypes = {
  activeModule: PropTypes.string,
  activeModuleLabel: PropTypes.string,
  isOpen: PropTypes.bool,
  onOpenChange: PropTypes.func,
};

export default OperatorAssistDock;
