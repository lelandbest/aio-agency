/**
 * FlowDraft repository (localStorage)
 * Drafts are produced by Agents and loaded into Flow Builder.
 */

import { createNode } from '../data/nodeLibrary';
import { generateULID } from './ulid';

const STORAGE_KEY = 'aio_flow_drafts';
const ACTIVE_KEY = 'aio_flow_draft_active';

const getAllDrafts = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Failed to load flow drafts:', error);
    return {};
  }
};

const saveDraft = (draft) => {
  const drafts = getAllDrafts();
  drafts[draft.id] = draft;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  return draft;
};

export const setActiveDraft = (draftId) => {
  localStorage.setItem(ACTIVE_KEY, draftId);
};

export const getActiveDraft = () => {
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (!activeId) return null;
  const drafts = getAllDrafts();
  return drafts[activeId] || null;
};

export const clearActiveDraft = () => {
  localStorage.removeItem(ACTIVE_KEY);
};

export const createDraftFromAgent = (agent, intent = 'Draft a workflow from agent intent.') => {
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
    { x: 100, y: 160 }
  );

  const actionNode = createNode(
    {
      id: 'agent-action',
      type: 'action',
      label: agent?.name ? `${agent.name} Action` : 'Agent Action',
      description: agent?.specialization || 'Agent-driven task',
      iconName: 'Bot',
      nodeColor: 'action',
    },
    { x: 360, y: 160 }
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
  getAllDrafts,
  saveDraft,
  setActiveDraft,
  getActiveDraft,
  clearActiveDraft,
  createDraftFromAgent,
};
