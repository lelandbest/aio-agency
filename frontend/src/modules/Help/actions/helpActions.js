/**
 * Centralized Action Registry for the Help System.
 * All help-driven actions route through the global dispatcher.
 */

import { dispatchAction } from '../../orchestration';

/**
 * Global executor for help actions.
 * Routes all actions through the central dispatcher for orchestration.
 */
export const executeHelpAction = (action) => {
  if (!action || !action.type) {
    console.warn(`[HelpAction] Unknown or invalid action type: ${action?.type}`);
    return;
  }

  dispatchAction(action, { source: 'helpdesk' });
};

export const helpActions = {
  navigate: (payload) => dispatchAction({ type: 'navigate', payload }, { source: 'helpdesk' }),
  create_flow: (payload) => dispatchAction({ type: 'create_flow', payload }, { source: 'helpdesk' }),
  open_module: (payload) => dispatchAction({ type: 'open_module', payload }, { source: 'helpdesk' }),
  open_support: () => dispatchAction({ type: 'open_support' }, { source: 'helpdesk' }),
  create_flow_dynamic: (payload) => dispatchAction({ type: 'create_flow_dynamic', payload }, { source: 'helpdesk' }),
  assign_agent: (payload) => dispatchAction({ type: 'assign_agent', payload }, { source: 'helpdesk' })
};
