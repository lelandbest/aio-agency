const STORAGE_KEY = 'aio.crm.flow.customTemplates.v1';

const normalizeTemplate = (template) => {
  if (!template || typeof template !== 'object') {
    return null;
  }

  const name = String(template.name || '').trim();
  const id = String(template.id || '').trim();
  if (!name || !id) {
    return null;
  }

  return {
    ...template,
    id,
    name,
    description: String(template.description || '').trim(),
    category: String(template.category || 'My Templates').trim() || 'My Templates',
    complexity: String(template.complexity || 'Intermediate').trim() || 'Intermediate',
    nodes: Array.isArray(template.nodes) ? template.nodes : [],
    edges: Array.isArray(template.edges) ? template.edges : [],
    placeholders: Array.isArray(template.placeholders) ? template.placeholders : [],
  };
};

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const getStoredCustomTemplates = () => {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeTemplate).filter(Boolean);
  } catch {
    return [];
  }
};

export const saveStoredCustomTemplate = (template) => {
  const normalized = normalizeTemplate(template);
  if (!normalized) {
    return getStoredCustomTemplates();
  }

  const existing = getStoredCustomTemplates().filter((entry) => entry.id !== normalized.id);
  const nextTemplates = [normalized, ...existing];

  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTemplates));
  }

  return nextTemplates;
};

