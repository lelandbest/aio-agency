/**
 * Execution Policy Layer
 * Defines risk levels, confirmation requirements, and escalation rules per action type
 */

export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export const ACTION_POLICIES = {
  open_module: {
    type: 'direct',
    riskLevel: RISK_LEVELS.LOW,
    requiresConfirmation: false,
    requiresReview: false
  },
  navigate: {
    type: 'direct',
    riskLevel: RISK_LEVELS.LOW,
    requiresConfirmation: false,
    requiresReview: false
  },
  open_support: {
    type: 'direct',
    riskLevel: RISK_LEVELS.LOW,
    requiresConfirmation: false,
    requiresReview: false
  },
  show_detail: {
    type: 'direct',
    riskLevel: RISK_LEVELS.LOW,
    requiresConfirmation: false,
    requiresReview: false
  },
  open_ticket: {
    type: 'direct',
    riskLevel: RISK_LEVELS.LOW,
    requiresConfirmation: false,
    requiresReview: false
  },
  create_flow: {
    type: 'orchestrated',
    riskLevel: RISK_LEVELS.MEDIUM,
    requiresConfirmation: true,
    requiresReview: false
  },
  create_flow_dynamic: {
    type: 'orchestrated',
    riskLevel: RISK_LEVELS.HIGH,
    requiresConfirmation: true,
    requiresReview: false
  },
  assign_agent: {
    type: 'orchestrated',
    riskLevel: RISK_LEVELS.MEDIUM,
    requiresConfirmation: true,
    requiresReview: false
  },
  trigger_automation: {
    type: 'orchestrated',
    riskLevel: RISK_LEVELS.HIGH,
    requiresConfirmation: true,
    requiresReview: false
  },
  create_execution_plan: {
    type: 'orchestrated',
    riskLevel: RISK_LEVELS.MEDIUM,
    requiresConfirmation: true,
    requiresReview: false
  }
};

export const getActionPolicy = (actionType) => {
  return ACTION_POLICIES[actionType] || null;
};

export const getExecutionPolicy = (action, payload = {}) => {
  const policy = ACTION_POLICIES[action?.type];
  
  if (!policy) {
    return {
      type: 'direct',
      riskLevel: RISK_LEVELS.LOW,
      requiresConfirmation: false,
      requiresReview: false,
      isKnownAction: false
    };
  }

  return {
    ...policy,
    isKnownAction: true,
    overrides: {}
  };
};

export const shouldEscalateAction = (action, payload = {}) => {
  const policy = getExecutionPolicy(action, payload);
  
  if (policy.type === 'orchestrated') {
    return true;
  }

  return false;
};

export const getDefaultPolicy = () => ({
  type: 'direct',
  riskLevel: RISK_LEVELS.LOW,
  requiresConfirmation: false,
  requiresReview: false,
  isKnownAction: false
});
