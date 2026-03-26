/**
 * Centralized Action Dispatcher
 * All actions must route through dispatchAction
 * Phase 2: Policy, validation, escalation hooks, and logging
 */

import { getExecutionPolicy, shouldEscalateAction } from './executionPolicy';
import { logRequested, ORCHESTRATION_STATES } from './orchestrationLogger';
import { isPayloadSafe, sanitizePayload } from './payloadValidation';

export const ACTION_TYPES = {
  DIRECT: 'direct',
  ORCHESTRATED: 'orchestrated'
};

export const DIRECT_ACTIONS = [
  'open_module',
  'navigate',
  'open_support',
  'show_detail',
  'open_ticket'
];

export const ORCHESTRATED_ACTIONS = [
  'create_flow_dynamic',
  'assign_agent',
  'trigger_automation',
  'create_execution_plan'
];

const getActionType = (action) => {
  if (action?.actionType) return action.actionType;
  if (DIRECT_ACTIONS.includes(action?.type)) return ACTION_TYPES.DIRECT;
  if (ORCHESTRATED_ACTIONS.includes(action?.type)) return ACTION_TYPES.ORCHESTRATED;
  return null;
};

const actionHandlers = {
  open_module: (payload) => {
    window.dispatchEvent(new CustomEvent('aio:navigate', {
      detail: { module: payload.module }
    }));
  },
  navigate: (payload) => {
    window.dispatchEvent(new CustomEvent('aio:navigate', {
      detail: { module: payload.route?.replace('/', '') || payload.module }
    }));
  },
  open_support: () => {
    window.dispatchEvent(new CustomEvent('help:open_ticket'));
  },
  show_detail: (payload) => {
    window.dispatchEvent(new CustomEvent('aio:show_detail', {
      detail: payload
    }));
  },
  open_ticket: () => {
    window.dispatchEvent(new CustomEvent('help:open_ticket'));
  },
  create_flow: (payload) => {
    window.dispatchEvent(new CustomEvent('aio:navigate', {
      detail: {
        module: 'flows',
        action: 'create_from_template',
        templateId: payload.template
      }
    }));
  },
  create_flow_dynamic: (payload) => {
    window.dispatchEvent(new CustomEvent('aio:navigate', {
      detail: {
        module: 'flows',
        action: 'create_dynamic_flow',
        source: payload.source || 'dispatcher',
        intent: payload.intent,
        requiresOrchestration: true
      }
    }));
  },
  assign_agent: (payload) => {
    window.dispatchEvent(new CustomEvent('aio:navigate', {
      detail: {
        module: 'settings',
        action: 'assign_agent',
        context: payload.context
      }
    }));
  },
  trigger_automation: (payload) => {
    window.dispatchEvent(new CustomEvent('aio:automation_trigger', {
      detail: payload
    }));
  },
  create_execution_plan: (payload) => {
    window.dispatchEvent(new CustomEvent('aio:create_execution_plan', {
      detail: payload
    }));
  }
};

export const executeDirectAction = (action) => {
  if (!action) return;
  const handler = actionHandlers[action.type];
  if (handler) {
    console.log(`[DirectAction] Executing: ${action.type}`, action.payload);
    handler(action.payload || {});
  } else {
    console.warn(`[DirectAction] No handler for: ${action.type}`);
  }
};

let orchestratorCallback = null;

export const registerOrchestrator = (callback) => {
  orchestratorCallback = callback;
};

const routeToOrchestrator = (action, payload, policy) => {
  const context = {
    action: action.type,
    payload,
    source: payload?.source || 'dispatcher',
    timestamp: Date.now(),
    riskLevel: policy?.riskLevel || 'unknown',
    requiresConfirmation: policy?.requiresConfirmation ?? true,
    requiresReview: policy?.requiresReview ?? false
  };

  console.log(`[Orchestrator] Routing: ${action.type}`, context);

  if (orchestratorCallback) {
    orchestratorCallback({ action, context, policy });
  } else {
    console.warn('[Orchestrator] No orchestrator registered, executing directly');
    executeDirectAction(action);
  }
};

export const dispatchAction = (action, payload = {}) => {
  if (!action || !action.type) {
    console.warn('[dispatchAction] Invalid action:', action);
    return;
  }

  if (!isPayloadSafe(payload)) {
    console.error('[dispatchAction] Unsafe payload detected. Action blocked.');
    return;
  }

  const sanitizedPayload = sanitizePayload(payload);
  const fullAction = { ...action, payload: sanitizedPayload };
  const enrichedPayload = { ...sanitizedPayload, source: sanitizedPayload.source || 'dispatcher' };

  const policy = getExecutionPolicy(action, enrichedPayload);

  const actionType = getActionType(action);

  if (!actionType && !policy.isKnownAction) {
    console.error(`[dispatchAction] Unknown action type: ${action.type}. Failing safely.`);
    return;
  }

  const escalated = shouldEscalateAction(action, enrichedPayload);

  if (actionType === ACTION_TYPES.DIRECT && !escalated) {
    executeDirectAction(fullAction);
    return;
  }

  logRequested(fullAction, {
    source: enrichedPayload.source,
    riskLevel: policy.riskLevel,
    requiresConfirmation: policy.requiresConfirmation
  });

  routeToOrchestrator(fullAction, enrichedPayload, policy);
};

export const isOrchestratedAction = (type) => {
  return ORCHESTRATED_ACTIONS.includes(type);
};

export const isDirectAction = (type) => {
  return DIRECT_ACTIONS.includes(type);
};

export const getActionDescription = (action) => {
  const descriptions = {
    create_flow_dynamic: 'Create and deploy a new automated flow',
    assign_agent: 'Assign an AI agent to handle this task',
    trigger_automation: 'Activate an automated workflow',
    create_execution_plan: 'Generate a multi-step execution plan'
  };
  return descriptions[action.type] || `Execute ${action.type}`;
};
