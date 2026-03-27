import React, { useState } from 'react';
import { X, AlertTriangle, Play, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { executeDirectAction, getActionDescription } from './dispatcher';
import { validateOrchestrationPayload, normalizeOrchestrationPayload } from './payloadValidation';
import { logConfirmed, logCanceled, logExecuted, logFailed, ORCHESTRATION_OUTCOMES } from './orchestrationLogger';

const ACTION_LABELS = {
  create_flow_dynamic: 'Build Flow',
  assign_agent: 'Assign Agent',
  trigger_automation: 'Trigger Automation',
  create_execution_plan: 'Create Plan'
};

const RISK_BADGES = {
  low: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'LOW RISK' },
  medium: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: 'MEDIUM RISK' },
  high: { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'HIGH RISK' }
};

const Orchestrator = ({ isOpen, onClose, context, onConfirm }) => {
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState(null);

  if (!isOpen || !context) return null;

  const { action, payload, riskLevel = 'medium' } = context;
  const description = getActionDescription(action);
  const riskBadge = RISK_BADGES[riskLevel] || RISK_BADGES.medium;

  const handleConfirm = async () => {
    setValidationError(null);
    setLoading(true);

    try {
      const validationResult = validateOrchestrationPayload(action, payload);

      if (!validationResult.valid) {
        logFailed(null, action.type, payload?.source || 'orchestrator', 
          new Error(validationResult.errors.join(', ')), 
          ORCHESTRATION_OUTCOMES.VALIDATION_FAILED);
        
        setValidationError(validationResult.errors[0] || 'Validation failed');
        setLoading(false);
        return;
      }

      logConfirmed(null, action.type, payload?.source || 'orchestrator');

      await new Promise(resolve => setTimeout(resolve, 300));

      const normalizedPayload = normalizeOrchestrationPayload(action, payload);
      const normalizedAction = { ...action, payload: normalizedPayload };

      executeDirectAction(normalizedAction);
      
      logExecuted(null, action.type, payload?.source || 'orchestrator');

      setConfirmed(true);
      if (onConfirm) onConfirm(context);

      setTimeout(() => {
        onClose();
        setConfirmed(false);
        setValidationError(null);
      }, 500);
    } catch (err) {
      console.error('[Orchestrator] Execution failed:', err);
      logFailed(null, action.type, payload?.source || 'orchestrator', err);
      setValidationError('Execution failed. Retry.');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    logCanceled(null, action.type, payload?.source || 'orchestrator');
    setValidationError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="overlay-scrim absolute inset-0" onClick={handleCancel} />
      
      <div className="modal-surface relative w-full max-w-md overflow-hidden rounded-[var(--radius-modal)]">
        <div className="p-6 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-card)] bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-[var(--color-primary)]" />
              </div>
              <div>
                <h2 className="text-lg font-black text-[var(--color-text-primary)] uppercase tracking-tight">
                  {ACTION_LABELS[action.type] || 'Confirm Action'}
                </h2>
                <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest">
                  Execution Gate
                </p>
              </div>
            </div>
            <button 
              onClick={handleCancel}
              disabled={loading}
              className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border ${riskBadge.color}`}>
              {riskBadge.label}
            </span>
          </div>

          <div className="surface-tertiary p-4 rounded-[var(--radius-panel)]">
            <p className="text-sm font-medium text-[var(--color-text-primary)] leading-relaxed">
              {description}
            </p>
            {payload?.intent && (
              <p className="mt-2 text-xs text-[var(--color-text-tertiary)] italic truncate">
                "{payload.intent}"
              </p>
            )}
          </div>

          {validationError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2">
              <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400 font-medium">
                {validationError}
              </p>
            </div>
          )}

          {action.type === 'create_flow_dynamic' && (
            <div className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-sky-400" />
                <span>Intent parsed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-sky-400" />
                <span>Flow drafted</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-sky-400" />
                <span>Flow queued for ingest</span>
              </div>
            </div>
          )}

          {action.type === 'assign_agent' && (
            <div className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-amber-400" />
                <span>Agent assigned</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-amber-400" />
                <span>Routing updated</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <span className="text-[8px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest">
              Source: {payload?.source || 'unknown'}
            </span>
          </div>
        </div>

        <div className="p-6 border-t border-[var(--color-border)] flex items-center gap-3">
          <button
            onClick={handleCancel}
            disabled={loading || confirmed}
            className="surface-tertiary flex-1 py-3 rounded-[var(--radius-card)] text-[var(--color-text-primary)] text-[11px] font-black uppercase tracking-widest hover:bg-[var(--color-hover)] transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || confirmed || !!validationError}
            className={`flex-1 py-3 rounded-[var(--radius-card)] text-white text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
              confirmed 
                ? 'bg-emerald-500 shadow-[var(--shadow-base)]' 
                : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] shadow-[var(--shadow-base)]'
            } disabled:opacity-50`}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Validating...
              </>
            ) : confirmed ? (
              <>
                <CheckCircle size={14} />
                Confirmed
              </>
            ) : (
              <>
                <Play size={14} />
                Execute
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Orchestrator;
