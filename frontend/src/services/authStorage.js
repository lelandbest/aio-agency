const AUTH_SESSION_TOKEN_KEY = 'aio-auth-session-token';

export function getStoredSessionToken() {
  return window.localStorage.getItem(AUTH_SESSION_TOKEN_KEY);
}

export function storeSessionToken(token) {
  if (!token) {
    window.localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_SESSION_TOKEN_KEY, token);
}

export function clearStoredSessionToken() {
  window.localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
}
