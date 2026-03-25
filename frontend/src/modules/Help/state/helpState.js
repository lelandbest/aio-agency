/**
 * Centralized Help State Persistence.
 * Tracks recently viewed articles and triggered actions.
 */

const STORAGE_KEYS = {
  RECENT_ARTICLES: 'aio_help_recent_articles',
  RECENT_ACTIONS: 'aio_help_recent_actions'
};

/**
 * Get recently viewed articles from localStorage.
 */
export const getRecentArticles = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RECENT_ARTICLES);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('[HelpState] Failed to get recent articles:', err);
    return [];
  }
};

/**
 * Track a newly viewed article.
 */
export const trackArticleVisit = (article) => {
  if (!article || !article.id) return;

  try {
    const recent = getRecentArticles();
    const updated = [
      { id: article.id, title: article.title, visitedAt: new Date().toISOString() },
      ...recent.filter(item => item.id !== article.id)
    ].slice(0, 10); // Keep last 10

    localStorage.setItem(STORAGE_KEYS.RECENT_ARTICLES, JSON.stringify(updated));
  } catch (err) {
    console.error('[HelpState] Failed to track article visit:', err);
  }
};

/**
 * Get recently triggered actions from localStorage.
 */
export const getRecentActions = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RECENT_ACTIONS);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('[HelpState] Failed to get recent actions:', err);
    return [];
  }
};

/**
 * Track a newly triggered action.
 */
export const trackActionExecution = (actionType, label) => {
  if (!actionType) return;

  try {
    const recent = getRecentActions();
    const updated = [
      { type: actionType, label, executedAt: new Date().toISOString() },
      ...recent.filter(item => item.type !== actionType)
    ].slice(0, 5); // Keep last 5

    localStorage.setItem(STORAGE_KEYS.RECENT_ACTIONS, JSON.stringify(updated));
  } catch (err) {
    console.error('[HelpState] Failed to track action execution:', err);
  }
};
