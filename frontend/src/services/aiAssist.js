import { assistAiApi } from './backendApi';

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
    const response = await assistAiApi({
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
