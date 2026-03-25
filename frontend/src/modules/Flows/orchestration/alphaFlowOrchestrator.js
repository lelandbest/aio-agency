/**
 * Alpha Orchestration Layer
 * Normalizes natural language intents into structured execution plans for the Flow Builder.
 */

export const orchestrateFlowIntent = (intent) => {
  if (!intent || typeof intent !== 'string') {
    return { approved: false, reason: 'invalid_intent' };
  }

  const normalized = intent.toLowerCase().trim();
  
  // Basic validation: must have some recognizable signal
  const hasTrigger = /form|sms|message|check|deal|lead|missed|call|tag|schedule|time/i.test(normalized);
  const hasAction = /send|email|sms|tag|task|assign|create|notify|alert/i.test(normalized);

  if (!hasTrigger && !hasAction) {
    return {
      approved: false,
      reason: 'unclear_intent',
      metadata: {
        requestedBy: 'user',
        interpretedBy: 'charlie',
        orchestratedBy: 'alpha'
      }
    };
  }

  // Orchestration Logic (Rule-based for first pass)
  const executionPlan = {
    trigger: null,
    actions: []
  };

  // 1. Determine Trigger
  if (normalized.includes('form')) {
    executionPlan.trigger = 'form-submitted-trigger';
  } else if (normalized.includes('sms') || normalized.includes('message')) {
    executionPlan.trigger = 'sms-received-trigger'; // Assuming this exists or mapping to close enough
  } else if (normalized.includes('deal')) {
    executionPlan.trigger = 'deal-updated-trigger';
  } else if (normalized.includes('call') || normalized.includes('missed')) {
    executionPlan.trigger = 'missed-call-trigger';
  } else if (normalized.includes('contact') || normalized.includes('lead')) {
    executionPlan.trigger = 'contact-created-trigger';
  } else {
    executionPlan.trigger = 'manual-trigger';
  }

  // 2. Determine Actions
  if (normalized.includes('email')) {
    executionPlan.actions.push('send-email');
  }
  if (normalized.includes('sms') || normalized.includes('text')) {
    executionPlan.actions.push('send-sms');
  }
  if (normalized.includes('tag')) {
    executionPlan.actions.push('add-tag');
  }
  if (normalized.includes('task')) {
    executionPlan.actions.push('create-task');
  }
  if (normalized.includes('assign') || normalized.includes('owner')) {
    executionPlan.actions.push('assign-owner');
  }

  // Fallback if no actions detected but trigger was
  if (executionPlan.actions.length === 0) {
    executionPlan.actions.push('send-email'); // Default action
  }

  return {
    approved: true,
    normalizedIntent: normalized,
    executionPlan,
    metadata: {
      requestedBy: 'user',
      interpretedBy: 'charlie',
      orchestratedBy: 'alpha'
    }
  };
};

export default {
  orchestrateFlowIntent
};
