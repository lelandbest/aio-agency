import { AiService } from './ai.service';

// Canonical generic drafting helper built on `/api/ai/draft`. Use this for
// AI-assisted writing; grounded system help belongs on `/api/assist`.
export async function requestAiSuggestion({
  module,
  surface,
  field,
  currentValue = '',
  context = {},
  intent = 'draft',
  fallback = null,
}) {
  try {
    const response = await AiService.draftAi({
      module,
      surface,
      field,
      intent,
      current_value: currentValue || '',
      context,
    });
    return response?.suggestion || (typeof fallback === 'function' ? fallback() : fallback || '');
  } catch (error) {
    if (typeof fallback === 'function') {
      return fallback();
    }
    if (fallback !== null && fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}
