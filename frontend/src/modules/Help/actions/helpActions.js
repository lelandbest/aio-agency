/**
 * Centralized Action Registry for the Help System.
 * All help-driven actions must be registered here.
 */

export const helpActions = {
  /**
   * Navigate to a specific route within the application.
   */
  navigate: ({ route }) => {
    if (!route) return;
    window.dispatchEvent(new CustomEvent('aio:navigate', {
      detail: { module: route.replace('/', '') }
    }));
  },

  /**
   * Trigger a flow creation with a specific template.
   */
  create_flow: ({ template }) => {
    if (!template) return;
    window.dispatchEvent(new CustomEvent('aio:navigate', {
      detail: { 
        module: 'flows',
        action: 'create_from_template',
        templateId: template
      }
    }));
  },

  /**
   * Switch to a specific module.
   */
  open_module: ({ module }) => {
    if (!module) return;
    window.dispatchEvent(new CustomEvent('aio:navigate', {
      detail: { module }
    }));
  },

  /**
   * Open the ticket submission form.
   */
  open_support: () => {
    window.dispatchEvent(new CustomEvent('help:open_ticket'));
  },

  /**
   * Trigger dynamic flow generation from natural language intent.
   * Redirects to Flows and initiates Alpha orchestration.
   */
  create_flow_dynamic: ({ intent, source = 'helpdesk' }) => {
    if (!intent) return;
    window.dispatchEvent(new CustomEvent('aio:navigate', {
      detail: { 
        module: 'flows',
        action: 'create_dynamic_flow',
        source,
        intent,
        requiresOrchestration: true
      }
    }));
  }
};

/**
 * Global executor for help actions.
 * Ensures all actions follow the same validation and logging path.
 */
export const executeHelpAction = (action) => {
  if (!action || !action.type || !helpActions[action.type]) {
    console.warn(`[HelpAction] Unknown or invalid action type: ${action?.type}`);
    return;
  }

  console.log(`[HelpAction] Executing: ${action.type}`, action.payload);
  helpActions[action.type](action.payload || {});
};
