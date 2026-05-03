export const VALID_SESSION_TYPES = ['CONVO', 'COMMAND', 'CONSULT'];

export function validateAndSanitizeMessage(msg) {
  if (!msg) return null;
  const activeContext = arguments.length > 1 ? arguments[1] : null;

  const sessionType = msg.sessionType;
  if (!sessionType || !VALID_SESSION_TYPES.includes(sessionType)) {
    console.error(`[SessionValidator] Invalid or missing sessionType: ${sessionType}. Message dropped.`);
    return null;
  }

  let sessionId = msg.sessionId;
  let snapshotVersion = msg.snapshotVersion;

  if (activeContext) {
      if (sessionType !== activeContext.sessionType && !(activeContext.sessionType === 'CONVO' && sessionType === 'COMMAND')) {
          console.error(`[SessionValidator] Session type mismatch. Expected ${activeContext.sessionType}, got ${sessionType}`);
          return null;
      }
      if (sessionId && sessionId !== activeContext.sessionId) {
          console.error(`[SessionValidator] Session ID mismatch. Expected ${activeContext.sessionId}, got ${sessionId}`);
          return null;
      }
      if (snapshotVersion && snapshotVersion !== activeContext.snapshotVersion) {
          console.error(`[SessionValidator] Snapshot version mismatch. Expected ${activeContext.snapshotVersion}, got ${snapshotVersion}`);
          return null;
      }
      sessionId = sessionId || activeContext.sessionId;
      snapshotVersion = snapshotVersion || activeContext.snapshotVersion;
  } else {
      if (!sessionId || !snapshotVersion) {
          console.error(`[SessionValidator] Missing hydration safety guards (sessionId/snapshotVersion). Message dropped.`);
          return null;
      }
  }

  const messageId = msg.messageId || msg.clientId || msg.runId || `msg-${Date.now()}-${Math.random().toString(36).substring(2,9)}`;
  const timestamp = msg.timestamp || new Date().toISOString();

  if (sessionType === 'CONVO' || sessionType === 'COMMAND') {
      let content = msg.content !== undefined ? msg.content : '';
      if (typeof content !== 'string') {
          try { content = JSON.stringify(content); } catch { content = String(content); }
      }

      const { agentKey, ...baseMsg } = msg;

      return {
          ...baseMsg,
          messageId,
          timestamp,
          sessionId,
          snapshotVersion,
          content,
          source: msg.source || msg.rank || ''
      };
  } else if (sessionType === 'CONSULT') {
      const agentKey = msg.agentKey || msg.rank || 'UNKNOWN_AGENT';
      const responseId = msg.responseId || messageId;
      
      if (msg.role === 'user') {
          return {
              ...msg,
              messageId,
              timestamp,
              sessionId,
              snapshotVersion,
              agentKey,
              responseId
          };
      }
      
      let format = msg.output?.format || 'txt';
      if (!['txt', 'md', 'json', 'csv', 'code'].includes(format)) {
          format = 'txt';
      }
      
      const outputContent = typeof msg.output?.content === 'string' ? msg.output.content : String(msg.content || '');
      
      const { content, source, rank, ...baseMsg } = msg;
      
      return {
          ...baseMsg,
          messageId,
          timestamp,
          sessionId,
          snapshotVersion,
          agentKey,
          responseId,
          output: {
              format,
              content: outputContent
          },
          intro: {
              enabled: Boolean(msg.intro?.enabled),
              message: typeof msg.intro?.message === 'string' ? msg.intro.message : ''
          },
          structuredData: msg.structuredData || null,
          metadata: msg.metadata || {
              timestamp: Date.now(),
              taskStatus: 'complete'
          }
      };
  }

  return { ...msg, messageId, timestamp, sessionId, snapshotVersion };
}
