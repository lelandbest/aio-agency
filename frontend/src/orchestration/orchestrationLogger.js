/**
 * Orchestration Event Logger
 * Logs all orchestration events for traceability and audit
 */

export const ORCHESTRATION_STATES = {
  REQUESTED: 'requested',
  CONFIRMED: 'confirmed',
  CANCELED: 'canceled',
  EXECUTED: 'executed',
  FAILED: 'failed'
};

export const ORCHESTRATION_OUTCOMES = {
  SUCCESS: 'success',
  USER_CANCELED: 'user_canceled',
  VALIDATION_FAILED: 'validation_failed',
  EXECUTION_FAILED: 'execution_failed'
};

const MAX_HISTORY_SIZE = 100;
let orchestrationHistory = [];

const generateActionId = () => {
  return `orch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const createPayloadSummary = (payload) => {
  if (!payload) return {};
  
  const summary = {};
  const keys = Object.keys(payload).slice(0, 5);
  
  keys.forEach(key => {
    const value = payload[key];
    if (typeof value === 'string' && value.length > 50) {
      summary[key] = value.substring(0, 47) + '...';
    } else if (typeof value === 'object' && value !== null) {
      summary[key] = '[object]';
    } else {
      summary[key] = value;
    }
  });
  
  return summary;
};

export const logOrchestrationEvent = (eventData) => {
  try {
    const event = {
      actionId: eventData.actionId || generateActionId(),
      actionType: eventData.actionType || eventData.action?.type,
      source: eventData.source || 'unknown',
      timestamp: eventData.timestamp || Date.now(),
      riskLevel: eventData.riskLevel || 'unknown',
      requiresConfirmation: eventData.requiresConfirmation ?? null,
      status: eventData.status,
      outcome: eventData.outcome || null,
      payloadSummary: createPayloadSummary(eventData.payload),
      error: eventData.error || null
    };

    orchestrationHistory.unshift(event);

    if (orchestrationHistory.length > MAX_HISTORY_SIZE) {
      orchestrationHistory = orchestrationHistory.slice(0, MAX_HISTORY_SIZE);
    }

    console.log(`[OrchestrationLog] ${event.status.toUpperCase()}:`, {
      actionId: event.actionId,
      actionType: event.actionType,
      source: event.source,
      outcome: event.outcome
    });

    return event;
  } catch (err) {
    console.error('[OrchestrationLog] Failed to log event:', err);
    return null;
  }
};

export const logRequested = (action, context) => {
  return logOrchestrationEvent({
    actionId: generateActionId(),
    actionType: action.type,
    source: context?.source || action.payload?.source || 'unknown',
    riskLevel: context?.riskLevel || 'unknown',
    requiresConfirmation: context?.requiresConfirmation,
    status: ORCHESTRATION_STATES.REQUESTED,
    payload: action.payload
  });
};

export const logConfirmed = (actionId, actionType, source) => {
  return logOrchestrationEvent({
    actionId,
    actionType,
    source,
    status: ORCHESTRATION_STATES.CONFIRMED
  });
};

export const logCanceled = (actionId, actionType, source) => {
  return logOrchestrationEvent({
    actionId,
    actionType,
    source,
    status: ORCHESTRATION_STATES.CANCELED,
    outcome: ORCHESTRATION_OUTCOMES.USER_CANCELED
  });
};

export const logExecuted = (actionId, actionType, source) => {
  return logOrchestrationEvent({
    actionId,
    actionType,
    source,
    status: ORCHESTRATION_STATES.EXECUTED,
    outcome: ORCHESTRATION_OUTCOMES.SUCCESS
  });
};

export const logFailed = (actionId, actionType, source, error, outcome = ORCHESTRATION_OUTCOMES.EXECUTION_FAILED) => {
  return logOrchestrationEvent({
    actionId,
    actionType,
    source,
    status: ORCHESTRATION_STATES.FAILED,
    outcome,
    error: error?.message || String(error)
  });
};

export const getOrchestrationHistory = (limit = MAX_HISTORY_SIZE) => {
  return orchestrationHistory.slice(0, limit);
};

export const clearOrchestrationHistory = () => {
  orchestrationHistory = [];
  console.log('[OrchestrationLog] History cleared');
};

export const getOrchestrationStats = () => {
  const total = orchestrationHistory.length;
  const byStatus = {};
  const byOutcome = {};
  
  orchestrationHistory.forEach(event => {
    byStatus[event.status] = (byStatus[event.status] || 0) + 1;
    if (event.outcome) {
      byOutcome[event.outcome] = (byOutcome[event.outcome] || 0) + 1;
    }
  });
  
  return { total, byStatus, byOutcome };
};
