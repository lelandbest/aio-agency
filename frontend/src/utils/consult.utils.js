const CONSULT_ERROR_PATTERNS = [
  /\bconsultation\b/i,
  /\bconsult\b.*\binterrupted\b/i,
  /\bconsult\b.*\bfailed\b/i,
  /\bconsult\b.*\berror\b/i,
  /\bconsult\b.*\btimeout\b/i,
  /\bsystems engineering\b/i,
  /\bspecialist\b.*\berror\b/i,
  /\bspecialist\b.*\bfailed\b/i,
  /\bspecialist\b.*\binterrupted\b/i,
  /\bagent\b.*\binterrupted\b/i,
  /\bagent\b.*\bfailed\b/i,
  /\bcommand\s+failed\b/i,
  /\bai\s+command\s+failed\b/i,
];

const SAFE_FALLBACK = 'Something went wrong. Please try again.';

export function sanitizeConsultError(error) {
  if (!error) return SAFE_FALLBACK;

  const message = (typeof error === 'string' ? error : error?.message) || '';

  for (const pattern of CONSULT_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return SAFE_FALLBACK;
    }
  }

  if (typeof error === 'object' && error?.message) {
    return error.message.length > 200 ? SAFE_FALLBACK : error.message;
  }

  if (typeof error === 'string') {
    return error.length > 200 ? SAFE_FALLBACK : error;
  }

  return SAFE_FALLBACK;
}

export function sanitizeResponseText(text) {
  if (!text || typeof text !== 'string') return text;

  for (const pattern of CONSULT_ERROR_PATTERNS) {
    if (pattern.test(text)) {
      return null;
    }
  }

  return text;
}