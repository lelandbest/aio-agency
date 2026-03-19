const listeners = new Map();

const getHandlers = (eventName) => {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }
  return listeners.get(eventName);
};

export const emit = (eventName, payload = {}) => {
  const event = {
    eventName,
    payload,
    emittedAt: new Date().toISOString()
  };

  [...(listeners.get(eventName) || []), ...(listeners.get('*') || [])].forEach((handler) => {
    try {
      handler(event);
    } catch (error) {
      console.error(`eventBus handler failed for "${eventName}"`, error);
    }
  });

  return event;
};

export const subscribe = (eventName, handler) => {
  const handlers = getHandlers(eventName);
  handlers.add(handler);

  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      listeners.delete(eventName);
    }
  };
};

export const clearEventBus = () => {
  listeners.clear();
};

export default {
  emit,
  subscribe,
  clear: clearEventBus
};
