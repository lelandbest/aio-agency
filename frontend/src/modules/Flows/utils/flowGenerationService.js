/**
 * Flow Generation Service
 * Consumes structured Alpha execution plans to produce draft flows compatible with Flow Builder.
 */

import { generateULID } from './ulid';
import { createNode } from '../data/nodeLibrary';
import flowDraftRepository from './flowDraftRepository';
import { createDocumentationNoteNodes } from './documentationNotes';

const NODE_TEMPLATES = {
  // Triggers
  'form-submitted-trigger': { id: 'form-submitted-trigger', type: 'trigger', label: 'Form Submitted', description: 'Start on form submission', iconName: 'FileText', nodeColor: 'trigger' },
  'sms-received-trigger': { id: 'sms-received-trigger', type: 'trigger', label: 'SMS Received', description: 'Start on incoming SMS', iconName: 'MessageSquare', nodeColor: 'trigger' },
  'deal-updated-trigger': { id: 'deal-updated-trigger', type: 'trigger', label: 'Deal Updated', description: 'Start when a deal changes', iconName: 'Workflow', nodeColor: 'trigger' },
  'missed-call-trigger': { id: 'missed-call-trigger', type: 'trigger', label: 'Missed Call', description: 'Start on missed call', iconName: 'Phone', nodeColor: 'trigger' },
  'contact-created-trigger': { id: 'contact-created-trigger', type: 'trigger', label: 'Contact Created', description: 'Start when contact is created', iconName: 'User', nodeColor: 'trigger' },
  'manual-trigger': { id: 'manual-trigger', type: 'trigger', label: 'Manual Trigger', description: 'Start flow manually', iconName: 'Play', nodeColor: 'trigger' },

  // Actions
  'send-email': { id: 'send-email', type: 'action', label: 'Send Email', description: 'Send follow-up email', iconName: 'Mail', nodeColor: 'action' },
  'send-sms': { id: 'send-sms', type: 'action', label: 'Send SMS', description: 'Send SMS message', iconName: 'MessageSquare', nodeColor: 'action' },
  'add-tag': { id: 'add-tag', type: 'action', label: 'Add Tag', description: 'Apply relationship tag', iconName: 'Tag', nodeColor: 'action' },
  'create-task': { id: 'create-task', type: 'action', label: 'Create Task', description: 'Generate follow-up task', iconName: 'ListChecks', nodeColor: 'action' },
  'assign-owner': { id: 'assign-owner', type: 'action', label: 'Assign Owner', description: 'Route to correct agent', iconName: 'Bot', nodeColor: 'action' },
};

export const generateFlowFromIntent = async (alphaPlan) => {
  if (!alphaPlan || !alphaPlan.approved || !alphaPlan.executionPlan) {
    throw new Error('Invalid or unapproved Alpha plan provided to generation service.');
  }

  const { trigger, actions } = alphaPlan.executionPlan;
  const draftId = generateULID();
  const now = new Date().toISOString();

  // 1. Resolve Nodes
  const nodes = [];
  const edges = [];

  // Trigger Node
  const triggerTemplate = NODE_TEMPLATES[trigger] || NODE_TEMPLATES['manual-trigger'];
  const triggerNode = createNode(triggerTemplate, { x: 120, y: 160 });
  nodes.push(triggerNode);

  // Action Nodes
  let currentX = 250;
  let lastNodeId = triggerNode.id;

  actions.forEach((actionKey, index) => {
    const actionTemplate = NODE_TEMPLATES[actionKey] || NODE_TEMPLATES['send-email'];
    const actionNode = createNode(actionTemplate, { x: currentX, y: 160 + (index * 28) });
    nodes.push(actionNode);

    // Create Edge from last node
    edges.push({
      id: `edge-${draftId}-${index}`,
      source: lastNodeId,
      target: actionNode.id,
      sourceHandle: null,
      targetHandle: null,
      data: {}
    });

    lastNodeId = actionNode.id;
    currentX += 130;
  });

  nodes.push(...createDocumentationNoteNodes(nodes));

  const draft = {
    id: draftId,
    createdAt: now,
    createdBy: 'Alpha Orchestrator',
    intentSummary: alphaPlan.normalizedIntent,
    source: 'dynamic_help_generation',
    metadata: alphaPlan.metadata,
    draftSpec: {
      nodes,
      edges
    },
    validationPlan: {
      blockers: ['Draft generation complete. Review node configs before activation.'],
      warnings: []
    }
  };

  const savedDraft = await flowDraftRepository.saveDraft(draft);
  flowDraftRepository.setActiveDraft(savedDraft.id);
  return savedDraft;
};

export default {
  generateFlowFromIntent
};
