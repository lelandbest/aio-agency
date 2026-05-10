import { createMessage, createSessionId, VALID_SESSION_TYPES } from '../utils/sessionValidator';
import { AiService } from '../services/ai.service';

export const LANE = {
  CONVO: 'CONVO',
  COMMAND: 'COMMAND',
  CONSULT: 'CONSULT'
};

export function buildCommandEnvelope(input) {
  return {
    issuer: 'USER',
    mode: 'COMMAND',
    intent: 'EXECUTE',
    target: 'AUTO',
    action: input,
    payload: {},
    operatorControl: true,
    responseMode: 'STRUCTURED'
  };
}

async function runCommandPipeline(envelope) {
  if (!envelope) throw new Error('COMMAND requires envelope');

  return AiService.runAiCommand({
    command: envelope.action,
    payload: envelope,
    agent: 'ALPHA',
    sessionType: 'COMMAND',
    orchestrated: true
  });
}

export function validateLane(lane) {
  if (!VALID_SESSION_TYPES.includes(lane)) {
    throw new Error(`Invalid lane: ${lane}. Must be one of: ${VALID_SESSION_TYPES.join(', ')}`);
  }
  return true;
}

function createLaneSession(lane) {
  return {
    lane,
    sessionId: createSessionId(),
    snapshotVersion: 1,
    createdAt: Date.now()
  };
}

async function handleConvo(input, sessionState) {
  const { sessionId, snapshotVersion } = sessionState;
  const lane = LANE.CONVO;

  const userMessage = createMessage({
    role: 'user',
    content: input,
    sessionType: lane,
    sessionId,
    snapshotVersion,
    internalTs: Date.now()
  });

  const pendingId = `convo-pending-${Date.now()}`;
  const pendingMessage = createMessage({
    clientId: pendingId,
    role: 'assistant',
    content: 'Charlie is thinking...',
    output: { format: 'txt', content: 'Charlie is thinking...' },
    rank: 'CHARLIE',
    status: 'PENDING',
    pending: true,
    sessionType: lane,
    sessionId,
    snapshotVersion,
    internalTs: Date.now() + 1
  });

  try {
    const response = await AiService.runAiCommand({
      command: input,
      agent: 'CHARLIE',
      sessionType: lane,
      intent: 'conversation',
      context: {
        module: 'agents',
        surface: 'convo',
        lane: lane
      }
    });

    const message = response?.message || response?.response?.answer || 'Charlie processed your request.';
    
    const assistantMessage = createMessage({
      clientId: pendingId,
      role: 'assistant',
      content: message,
      output: { format: 'md', content: message },
      rank: 'CHARLIE',
      status: 'COMPLETED',
      sessionType: lane,
      sessionId,
      snapshotVersion,
      internalTs: Date.now()
    });

    return {
      userMessage,
      assistantMessage,
      lane: lane
    };
  } catch (error) {
    const errorMessage = createMessage({
      clientId: pendingId,
      role: 'assistant',
      content: 'Charlie encountered an issue. Please try again.',
      output: { format: 'txt', content: 'Charlie encountered an issue. Please try again.' },
      rank: 'CHARLIE',
      status: 'ERROR',
      error: error.message,
      sessionType: lane,
      sessionId,
      snapshotVersion,
      internalTs: Date.now()
    });

    return {
      userMessage,
      assistantMessage: errorMessage,
      lane: lane,
      error: true
    };
  }
}

async function handleCommand(input, sessionState) {
  const { sessionId, snapshotVersion } = sessionState;
  const lane = LANE.COMMAND;

  const userMessage = createMessage({
    role: 'user',
    content: input,
    sessionType: lane,
    sessionId,
    snapshotVersion,
    internalTs: Date.now()
  });

  const pendingId = `cmd-pending-${Date.now()}`;
  const pendingMessage = createMessage({
    clientId: pendingId,
    role: 'assistant',
    content: 'Routing to Alpha...',
    output: { format: 'txt', content: 'Routing to Alpha...' },
    rank: 'ALPHA',
    status: 'PENDING',
    pending: true,
    sessionType: lane,
    sessionId,
    snapshotVersion,
    internalTs: Date.now() + 1
  });

  try {
    const envelope = buildCommandEnvelope(input);
    const response = await runCommandPipeline(envelope);

    const orchestration = response?.result?.orchestration || response?.orchestration;
    const message = response?.message || response?.response?.answer || orchestration?.message || 'Command processed.';

    const assistantMessage = createMessage({
      clientId: pendingId,
      role: 'assistant',
      content: message,
      output: { format: 'md', content: message },
      rank: orchestration?.target || 'ALPHA',
      chain: orchestration?.chain?.join(' -> ') || 'CHARLIE -> ALPHA',
      orchestration: orchestration,
      status: 'COMPLETED',
      sessionType: lane,
      sessionId,
      snapshotVersion,
      internalTs: Date.now()
    });

    return {
      userMessage,
      assistantMessage,
      lane: lane
    };
  } catch (error) {
    const errorMessage = createMessage({
      clientId: pendingId,
      role: 'assistant',
      content: `Command failed: ${error.message}`,
      output: { format: 'txt', content: `Command failed: ${error.message}` },
      rank: 'ALPHA',
      status: 'ERROR',
      error: error.message,
      sessionType: lane,
      sessionId,
      snapshotVersion,
      internalTs: Date.now()
    });

    return {
      userMessage,
      assistantMessage: errorMessage,
      lane: lane,
      error: true
    };
  }
}

async function handleConsult(input, selectedAgent, sessionState) {
  const { sessionId, snapshotVersion } = sessionState;
  const lane = LANE.CONSULT;

  if (!selectedAgent) {
    throw new Error('CONSULT requires an agent selection');
  }

  const userMessage = createMessage({
    role: 'user',
    content: input,
    sessionType: lane,
    sessionId,
    snapshotVersion,
    internalTs: Date.now()
  });

  const pendingId = `consult-pending-${Date.now()}`;
  const pendingMessage = createMessage({
    clientId: pendingId,
    role: 'assistant',
    content: `Contacting ${selectedAgent}...`,
    output: { format: 'txt', content: `Contacting ${selectedAgent}...` },
    rank: selectedAgent,
    agentKey: selectedAgent,
    status: 'PENDING',
    pending: true,
    sessionType: lane,
    sessionId,
    snapshotVersion,
    internalTs: Date.now() + 1
  });

  try {
    const response = await AiService.runAiCommand({
      command: input,
      agent: selectedAgent,
      sessionType: lane,
      intent: 'consult',
      context: {
        module: 'agents',
        surface: 'consult',
        lane: lane,
        directAgent: selectedAgent
      }
    });

    const orchestration = response?.result?.orchestration || response?.orchestration;
    const message = response?.message || response?.response?.answer || 'Consultation complete.';

    const assistantMessage = createMessage({
      clientId: pendingId,
      role: 'assistant',
      content: message,
      output: { 
        format: 'md', 
        content: message,
        ...(orchestration?.output ? { structured: orchestration.output } : {})
      },
      rank: selectedAgent,
      agentKey: selectedAgent,
      chain: orchestration?.chain?.join(' -> ') || '',
      orchestration: orchestration,
      status: 'COMPLETED',
      sessionType: lane,
      sessionId,
      snapshotVersion,
      internalTs: Date.now()
    });

    return {
      userMessage,
      assistantMessage,
      lane: lane
    };
  } catch (error) {
    const errorMessage = createMessage({
      clientId: pendingId,
      role: 'assistant',
      content: `Consultation failed: ${error.message}`,
      output: { format: 'txt', content: `Consultation failed: ${error.message}` },
      rank: selectedAgent,
      agentKey: selectedAgent,
      status: 'ERROR',
      error: error.message,
      sessionType: lane,
      sessionId,
      snapshotVersion,
      internalTs: Date.now()
    });

    return {
      userMessage,
      assistantMessage: errorMessage,
      lane: lane,
      error: true
    };
  }
}

export async function routeInput({ input, lane, selectedAgent }) {
  validateLane(lane);

  if (!input || typeof input !== 'string' || !input.trim()) {
    throw new Error('Input is required and must be a non-empty string');
  }

  const sessionState = createLaneSession(lane);

  switch (lane) {
    case LANE.CONVO:
      return handleConvo(input.trim(), sessionState);

    case LANE.COMMAND:
      return handleCommand(input.trim(), sessionState);

    case LANE.CONSULT:
      if (!selectedAgent) {
        throw new Error('CONSULT requires an agent selection. Select a specialist agent.');
      }
      return handleConsult(input.trim(), selectedAgent, sessionState);

    default:
      throw new Error(`Unhandled lane: ${lane}`);
  }
}

export function createLaneSessionId(lane) {
  return createLaneSession(lane);
}

export function isLaneValid(lane) {
  return VALID_SESSION_TYPES.includes(lane);
}