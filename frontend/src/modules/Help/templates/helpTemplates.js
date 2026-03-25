/**
 * Centralized Template Bridge for the Help System.
 * Maps help-friendly template IDs to actual flow configurations.
 */

export const helpTemplates = {
  /**
   * Simple Lead Capture flow template.
   */
  lead_capture: {
    id: "lead_capture_flow",
    name: "Lead Capture Flow",
    description: "Automatically captures and tags new inquiries.",
    icon: "Users",
    nodes: [],
    edges: []
  },

  /**
   * SMS Auto-Reply flow template.
   */
  sms_autoreply: {
    id: "sms_autoreply_flow",
    name: "SMS Auto-Reply",
    description: "Instantly responds to incoming SMS messages.",
    icon: "Smartphone",
    nodes: [],
    edges: []
  },

  /**
   * Pipeline Follow-up flow template.
   */
  pipeline_followup: {
    id: "pipeline_followup_flow",
    name: "Pipeline Follow-up",
    description: "Triggers follow-up emails based on pipeline moves.",
    icon: "GitMerge",
    nodes: [],
    edges: []
  }
};

/**
 * Get a template by its help ID.
 */
export const getHelpTemplate = (id) => {
  return helpTemplates[id] || null;
};
