/**
 * Flows Module
 * Saved-flow landing page is the primary entry point.
 * Flow Builder is a secondary editing workspace entered intentionally.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import FlowBuilder from './FlowBuilder';
import FlowsHome from './FlowsHome';
import flowRepository from './utils/flowRepository';
import { ingestFlowSource } from './utils/flowIngestion';

const resolveInitialView = ({ flowId, action, intent }) => {
  if (action === 'select_agent_flow' && !flowId) {
    return 'list';
  }
  if (flowId) {
    return 'builder';
  }
  if (action === 'create_dynamic_flow' && intent) {
    return 'builder';
  }
  return 'list';
};

const FlowsModule = ({ flowId = null, action = null, intent = null, onFlowContextChange = null }) => {
  const [view, setView] = useState(() => resolveInitialView({ flowId, action, intent }));
  const [activeFlowId, setActiveFlowId] = useState(flowId);
  const isAgentSelectionMode = action === 'select_agent_flow';

  useEffect(() => {
    if (flowId) {
      setActiveFlowId(flowId);
      setView('builder');
      return;
    }
    if (action === 'create_dynamic_flow' && intent) {
      setActiveFlowId(null);
      setView('builder');
      return;
    }
    if (action === 'select_agent_flow') {
      setActiveFlowId(flowId ?? null);
      setView(flowId ? 'builder' : 'list');
      return;
    }
    setActiveFlowId(null);
    setView('list');
  }, [action, flowId, intent]);

  const returnFlowToAgents = useCallback((flow) => {
    if (!flow?.id) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent('aio:flow-selected', {
        detail: {
          flow: {
            id: flow.id,
            name: flow.name || 'Untitled Flow',
            status: flow.status || 'Draft',
          },
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent('aio:navigate', {
        detail: {
          module: 'aio-agents',
          flowId: null,
          action: null,
          intent: null,
        },
      })
    );
  }, []);

  const applyFlowContext = useCallback(
    (next = {}) => {
      if (Object.prototype.hasOwnProperty.call(next, 'flowId')) {
        setActiveFlowId(next.flowId ?? null);
      }
      onFlowContextChange?.(next);
    },
    [onFlowContextChange]
  );

  const openBuilderForFlow = useCallback(
    (flow) => {
      if (!flow?.id) {
        return;
      }
      applyFlowContext({ flowId: flow.id, action: null, intent: null });
      setView('builder');
    },
    [applyFlowContext]
  );

  const handleCreateFlow = useCallback(async () => {
    const createdFlow = await flowRepository.createNewFlow();
    openBuilderForFlow(createdFlow);
    return createdFlow;
  }, [openBuilderForFlow]);

  const handleCreateFromTemplate = useCallback(
    async (template) => {
      const baseFlow = await flowRepository.createNewFlow(template?.name || 'Template Flow');
      const result = ingestFlowSource({ ...template, source: 'template' });
      const savedFlow = await flowRepository.saveFlow({
        ...baseFlow,
        name: template?.name || baseFlow.name,
        nodes: result.nodes,
        edges: result.edges,
        spec: result.spec,
        metadata: {
          ...(baseFlow.metadata || {}),
          nodeCount: result.nodes.length,
          sourceTemplateId: template?.id || null,
          sourceTemplateName: template?.name || null,
          sourceTemplateCategory: template?.category || null,
          createdFromTemplate: true,
        },
      });
      openBuilderForFlow(savedFlow);
      return savedFlow;
    },
    [openBuilderForFlow]
  );

  const handleReturnToList = useCallback(() => {
    applyFlowContext({ flowId: null, action: null, intent: null });
    setView('list');
  }, [applyFlowContext]);

  if (view === 'builder') {
    return (
      <ReactFlowProvider>
        <FlowBuilder
          flowId={activeFlowId}
          action={activeFlowId ? null : action}
          intent={activeFlowId ? null : intent}
          onFlowContextChange={applyFlowContext}
          onSelectForAgents={isAgentSelectionMode ? returnFlowToAgents : null}
          onExit={handleReturnToList}
        />
      </ReactFlowProvider>
    );
  }

  return (
    <FlowsHome
      onCreateFlow={handleCreateFlow}
      onOpenFlow={openBuilderForFlow}
      onCreateFromTemplate={handleCreateFromTemplate}
      onSelectFlow={isAgentSelectionMode ? returnFlowToAgents : null}
      selectionMode={isAgentSelectionMode}
    />
  );
};

export default FlowsModule;
