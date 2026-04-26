const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'apiSecret',
  'api_secret',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authRef',
  'auth_ref',
  'authToken',
  'auth_token',
  'credential',
  'credentials',
  'privateKey',
  'private_key',
  'authorization',
  'cookie',
  'sessionId',
  'session_id',
]);

const SENSITIVE_PREFIXES = ['system.', 'internal.', 'provider.'];

const sanitizeValue = (value, keyPath = '') => {
  if (value === null || value === undefined) return value;

  const lowerPath = keyPath.toLowerCase();
  if (SENSITIVE_KEYS.has(lowerPath) || SENSITIVE_KEYS.has(keyPath)) {
    return '[REDACTED]';
  }
  for (const prefix of SENSITIVE_PREFIXES) {
    if (lowerPath.startsWith(prefix)) return '[REDACTED]';
  }

  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map((item, i) => sanitizeValue(item, `${keyPath}[${i}]`));
  }

  if (typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      const childPath = keyPath ? `${keyPath}.${k}` : k;
      result[k] = sanitizeValue(v, childPath);
    }
    return result;
  }

  return value;
};

export const sanitizeOutput = (output) => {
  if (output === null || output === undefined) return null;
  if (typeof output === 'string') return output;
  return sanitizeValue(output, '');
};

export const sanitizeStepData = (stepData) => {
  if (!stepData || typeof stepData !== 'object') return null;
  return sanitizeValue(stepData, '');
};