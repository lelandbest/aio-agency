/**
 * Flows Module
 * Flow Builder entry point for the CRM application
 * Mounts when activeModule === 'flows'
 */

import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import FlowBuilder from './FlowBuilder';

const FlowsModule = ({ flowId = null, action = null, intent = null, onExit }) => {
  return (
    <ReactFlowProvider>
      <FlowBuilder flowId={flowId} action={action} intent={intent} onExit={onExit} />
    </ReactFlowProvider>
  );
};

export default FlowsModule;
