/**
 * Signal Classification System
 * 
 * TYPE          BEHAVIOR                          DURATION    DISMISS
 * ─────────────────────────────────────────────────────────────────────
 * success       ephemeral, fade-out, no stack     3-5 sec     auto
 * warning       persists, visible                 until click manual
 * error         persists, visible                 until click manual  
 * critical      blocks, persists                  until click manual (required)
 * info          ephemeral, fade-out, no stack     3-5 sec     auto
 */

/**
 * Send a state confirmation signal (green bar)
 * Ephemeral, auto-fades after 3-5 seconds, no stacking, replaces previous success
 */
export function confirmSignal(message) {
  window.dispatchEvent(new CustomEvent('aio:signal', {
    detail: { type: 'success', message }
  }));
}

/**
 * Send a warning signal (amber bar)
 * Persists until manually dismissed
 */
export function warnSignal(message) {
  window.dispatchEvent(new CustomEvent('aio:signal', {
    detail: { type: 'warning', message }
  }));
}

/**
 * Send an error signal (red bar)
 * Persists until manually dismissed
 */
export function errorSignal(message) {
  window.dispatchEvent(new CustomEvent('aio:signal', {
    detail: { type: 'error', message }
  }));
}

/**
 * Send a critical signal (dark red bar)
 * Requires resolution or explicit dismissal - blocks view
 */
export function criticalSignal(message) {
  window.dispatchEvent(new CustomEvent('aio:signal', {
    detail: { type: 'critical', message }
  }));
}

/**
 * Send an info signal (blue bar)
 * Ephemeral, auto-fades after 3-5 seconds
 */
export function infoSignal(message) {
  window.dispatchEvent(new CustomEvent('aio:signal', {
    detail: { type: 'info', message }
  }));
}
