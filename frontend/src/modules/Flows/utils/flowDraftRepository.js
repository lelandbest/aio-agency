/**
 * FlowDraft repository
 * Drafts are persisted via backend APIs and loaded into Flow Builder.
 */

import { deleteFlowDraftApi, getFlowDraftApi, saveFlowDraftApi } from '../../../services/backendApi';
import { createNode } from '../data/nodeLibrary';
import { generateULID } from './ulid';

let activeDraftId = null;

const saveDraft = async (draft) => {
  return saveFlowDraftApi(draft);
};

export const setActiveDraft = (draftId) => {
  activeDraftId = draftId;
};

export const getActiveDraft = async () => {
  if (!activeDraftId) return null;
  return getFlowDraftApi(activeDraftId);
};

export const clearActiveDraft = async () => {
  if (!activeDraftId) return;
  const draftId = activeDraftId;
  activeDraftId = null;
  await deleteFlowDraftApi(draftId);
};

export const createDraftFromAgent = async (agent, intent = 'Draft a workflow from agent intent.') => {
  const now = new Date().toISOString();
  const draftId = generateULID();

  const triggerNode = createNode(
    {
      id: 'manual-trigger',
      type: 'trigger',
      label: 'Manual Trigger',
      description: 'Start flow manually',
      iconName: 'Play',
      nodeColor: 'trigger',
    },
    { x: 40, y: 160 }
  );

  let currentX = 140;
  const actionNode = createNode(
    {
      id: 'agent-action',
      type: 'action',
      label: agent?.name ? `${agent.name} Action` : 'Agent Action',
      description: agent?.specialization || 'Agent-driven task',
      nodeColor: 'action',
    },
    { x: currentX, y: 160 }
  );

  const draft = {
    id: draftId,
    createdAt: now,
    createdBy: 'Current User',
    intentSummary: intent,
    assumptions: ['Inputs will be provided at runtime.'],
    requiredInputs: [],
    draftSpec: {
      nodes: [triggerNode, actionNode],
      edges: [
        {
          id: `edge-${draftId}`,
          source: triggerNode.id,
          target: actionNode.id,
          sourceHandle: null,
          targetHandle: null,
          data: {},
        },
      ],
    },
    validationPlan: {
      blockers: ['Missing required configuration on action nodes.'],
      warnings: ['Ensure credentials are connected before activation.'],
    },
    activationChecklist: ['Review node configs', 'Verify credentials', 'Confirm trigger conditions'],
    agentSnapshot: agent || null,
  };

  return saveDraft(draft);
};

export default {
  saveDraft,
  setActiveDraft,
  getActiveDraft,
  clearActiveDraft,
  createDraftFromAgent,
};
