/**
 * Payload Validation and Normalization
 * Validates and normalizes orchestration payloads before execution
 */

const VALIDATION_RULES = {
  create_flow_dynamic: {
    required: [],
    optional: ['intent', 'templateId', 'source'],
    requireOneOf: ['intent', 'templateId']
  },
  assign_agent: {
    required: [],
    optional: ['context', 'target', 'agentId'],
    requireOneOf: ['context', 'target']
  },
  trigger_automation: {
    required: [],
    optional: ['automationId', 'triggerContext', 'runParams'],
    requireOneOf: ['automationId', 'triggerContext']
  },
  create_execution_plan: {
    required: [],
    optional: ['planType', 'steps', 'context'],
    requireOneOf: ['planType', 'steps']
  }
};

const validateRequiredFields = (actionType, payload) => {
  const rules = VALIDATION_RULES[actionType];
  if (!rules) return { valid: true, errors: [] };

  const errors = [];

  if (rules.required) {
    rules.required.forEach(field => {
      if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
        errors.push(`Missing required field: ${field}`);
      }
    });
  }

  if (rules.requireOneOf && rules.requireOneOf.length > 0) {
    const hasAtLeastOne = rules.requireOneOf.some(field => {
      const value = payload[field];
      return value !== undefined && value !== null && value !== '';
    });
    
    if (!hasAtLeastOne) {
      errors.push(`Must provide at least one of: ${rules.requireOneOf.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
};

const validateFieldTypes = (actionType, payload) => {
  const errors = [];

  if (actionType === 'create_flow_dynamic' && payload.intent) {
    if (typeof payload.intent !== 'string') {
      errors.push('intent must be a string');
    } else if (payload.intent.trim().length === 0) {
      errors.push('intent cannot be empty');
    } else if (payload.intent.length > 1000) {
      errors.push('intent exceeds maximum length of 1000 characters');
    }
  }

  if (actionType === 'assign_agent' && payload.context) {
    if (typeof payload.context !== 'string' && typeof payload.context !== 'object') {
      errors.push('context must be a string or object');
    }
  }

  if (actionType === 'trigger_automation' && payload.automationId) {
    if (typeof payload.automationId !== 'string' && typeof payload.automationId !== 'number') {
      errors.push('automationId must be a string or number');
    }
  }

  return { valid: errors.length === 0, errors };
};

export const validateOrchestrationPayload = (action, payload = {}) => {
  if (!action || !action.type) {
    return {
      valid: false,
      errors: ['Action type is required']
    };
  }

  const actionType = action.type;
  const rules = VALIDATION_RULES[actionType];

  if (!rules) {
    return { valid: true, errors: [] };
  }

  const requiredResult = validateRequiredFields(actionType, payload);
  const typeResult = validateFieldTypes(actionType, payload);

  const allErrors = [...requiredResult.errors, ...typeResult.errors];

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    actionType
  };
};

export const normalizeOrchestrationPayload = (action, payload = {}) => {
  const normalized = { ...payload };

  normalized.source = normalized.source || 'orchestration';
  normalized.timestamp = normalized.timestamp || Date.now();

  if (action.type === 'create_flow_dynamic') {
    if (normalized.intent) {
      normalized.intent = String(normalized.intent).trim();
    }
    if (normalized.templateId) {
      normalized.templateId = String(normalized.templateId);
    }
  }

  if (action.type === 'assign_agent') {
    if (normalized.context && typeof normalized.context === 'object') {
      normalized.context = normalized.context;
    }
  }

  if (action.type === 'trigger_automation') {
    if (normalized.runParams && typeof normalized.runParams === 'object') {
      normalized.runParams = normalized.runParams;
    }
  }

  if (action.type === 'create_execution_plan') {
    if (normalized.steps && Array.isArray(normalized.steps)) {
      normalized.steps = normalized.steps.slice(0, 50);
    }
  }

  return normalized;
};

export const isPayloadSafe = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return true;
  }

  const dangerousPatterns = [
    '__proto__',
    'constructor',
    'prototype'
  ];

  for (const key of Object.keys(payload)) {
    if (dangerousPatterns.includes(key)) {
      return false;
    }
  }

  return true;
};

export const sanitizePayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const sanitized = {};
  const dangerousPatterns = [
    '__proto__',
    'constructor',
    'prototype'
  ];

  Object.entries(payload).forEach(([key, value]) => {
    if (!dangerousPatterns.includes(key)) {
      sanitized[key] = value;
    }
  });

  return sanitized;
};
