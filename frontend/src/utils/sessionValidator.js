export const VALID_SESSION_TYPES = ['CONVO', 'COMMAND', 'CONSULT'];

export function createMessage(fields) {
  if (!fields || !fields.sessionType) {
    console.error('[SessionValidator] createMessage: missing sessionType. Message dropped.');
    return null;
  }

  if (!VALID_SESSION_TYPES.includes(fields.sessionType)) {
    console.error(`[SessionValidator] createMessage: invalid sessionType "${fields.sessionType}". Message dropped.`);
    return null;
  }

  if (!fields.sessionId) {
    console.error('[SessionValidator] createMessage: missing sessionId. Message dropped.');
    return null;
  }

  const messageId = fields.messageId || fields.clientId || fields.runId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = fields.timestamp || new Date().toISOString();
  const snapshotVersion = fields.snapshotVersion || 1;

  if (fields.sessionType === 'CONVO' || fields.sessionType === 'COMMAND') {
    let content = fields.content !== undefined ? fields.content : '';
    if (typeof content !== 'string') {
      try { content = JSON.stringify(content); } catch { content = String(content); }
    }

    return Object.freeze({
      messageId,
      role: fields.role || 'user',
      content,
      sessionType: fields.sessionType,
      sessionId: fields.sessionId,
      snapshotVersion,
      timestamp,
      internalTs: fields.internalTs || Date.now(),
      source: fields.source || fields.rank || '',
      ...(fields.rank ? { rank: fields.rank } : {}),
      ...(fields.pending ? { pending: true } : {}),
      ...(fields.runId ? { runId: fields.runId } : {}),
      ...(fields.clientId ? { clientId: fields.clientId } : {}),
    });
  }

  if (fields.sessionType === 'CONSULT') {
    const agentKey = fields.agentKey || fields.rank || 'UNKNOWN_AGENT';
    const responseId = fields.responseId || messageId;

    if (fields.role === 'user') {
      return Object.freeze({
        messageId,
        role: 'user',
        content: fields.content || '',
        sessionType: 'CONSULT',
        sessionId: fields.sessionId,
        snapshotVersion,
        timestamp,
        internalTs: fields.internalTs || Date.now(),
        agentKey,
        responseId,
      });
    }

    let format = fields.output?.format || 'txt';
    if (!['txt', 'md', 'json', 'csv', 'code'].includes(format)) {
      format = 'txt';
    }

    const outputContent = typeof fields.output?.content === 'string' ? fields.output.content : String(fields.content || '');

    return Object.freeze({
      messageId,
      role: fields.role || 'assistant',
      content: fields.content || '',
      sessionType: 'CONSULT',
      sessionId: fields.sessionId,
      snapshotVersion,
      timestamp,
      internalTs: fields.internalTs || Date.now(),
      agentKey,
      responseId,
      output: {
        format,
        content: outputContent,
      },
      intro: {
        enabled: Boolean(fields.intro?.enabled),
        message: typeof fields.intro?.message === 'string' ? fields.intro.message : '',
      },
      ...(fields.structuredData ? { structuredData: fields.structuredData } : {}),
      ...(fields.metadata ? { metadata: fields.metadata } : {}),
      ...(fields.rank ? { rank: fields.rank } : {}),
      ...(fields.chain ? { chain: fields.chain } : {}),
      ...(fields.status ? { status: fields.status } : {}),
      ...(fields.error ? { error: fields.error } : {}),
      ...(fields.pending ? { pending: true } : {}),
      ...(fields.runId ? { runId: fields.runId } : {}),
      ...(fields.clientId ? { clientId: fields.clientId } : {}),
    });
  }

  return null;
}

export function replaceMessage(messages, targetId, replacement) {
  return messages.map((msg) =>
    msg.messageId === targetId || msg.clientId === targetId
      ? replacement
      : msg
  );
}

export function createSessionId() {
  return `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const LANE_ISOLATION = {
  CONVO: 'CONVO',
  COMMAND: 'COMMAND',
  CONSULT: 'CONSULT'
};

export function createLaneMessageStore() {
  return {
    [LANE_ISOLATION.CONVO]: [],
    [LANE_ISOLATION.COMMAND]: [],
    [LANE_ISOLATION.CONSULT]: []
  };
}

export function addMessageToLane(store, lane, message) {
  if (!store[lane]) {
    console.error(`[SessionValidator] Invalid lane: ${lane}`);
    return store;
  }
  return {
    ...store,
    [lane]: [...store[lane], message]
  };
}

export function getLaneMessages(store, lane) {
  if (!store[lane]) {
    console.error(`[SessionValidator] Invalid lane: ${lane}`);
    return [];
  }
  return store[lane];
}

export function filterByLane(store, lane) {
  return getLaneMessages(store, lane);
}

export function isLaneCrossContaminated(store, candidateLane, message) {
  if (!message || !message.sessionType) return false;
  return message.sessionType !== candidateLane;
}