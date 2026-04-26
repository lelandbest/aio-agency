/**
 * Flow Generation Service
 * Consumes structured Alpha execution plans to produce draft flows compatible with Flow Builder.
 */

import { generateULID } from './ulid';
import { createNode } from '../data/nodeLibrary';
import flowDraftRepository from './flowDraftRepository';
import { createDocumentationNoteNodes } from './documentationNotes';

import { getAllNodes } from '../data/nodeLibrary';

const getNodeTemplate = (key) => {
  const allNodes = getAllNodes();
  return allNodes.find(n => n.id === key);
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
  const triggerTemplate = getNodeTemplate(trigger) || getNodeTemplate('manual-trigger');
  const triggerNode = createNode(triggerTemplate, { x: 40, y: 160 });
  nodes.push(triggerNode);

  // Action Nodes
  let currentX = 140;
  let lastNodeId = triggerNode.id;

  actions.forEach((actionKey, index) => {
    const actionTemplate = getNodeTemplate(actionKey) || getNodeTemplate('send-email');
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
    currentX += 100;
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
