function resolveDefaultApiBaseUrl() {
  if (typeof window === 'undefined') {
    return 'http://localhost:8001';
  }
  const currentHost = window.location.hostname || 'localhost';
  const normalizedHost = currentHost === '0.0.0.0' ? 'localhost' : currentHost;
  const protocol = window.location.protocol;
  return `${protocol}//${normalizedHost}:8001`;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || resolveDefaultApiBaseUrl()).replace(/\/$/, '');

export function normalizeSourceUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('/api/') || url.startsWith('/media/')) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}