/**
 * Deployment Profile-Aware PWA / Service Worker Register
 * 
 * Profiles:
 * - Development (VITE_ENABLE_PWA !== 'true' or DEV mode): Completely disabled. Unregisters any stale SWs.
 * - Tauri Desktop (VITE_ENABLE_PWA !== 'true'): Completely disabled to prevent desktop webview collisions.
 * - Hosted Production Web (VITE_ENABLE_PWA === 'true' & PROD mode): Explicitly registered via virtual:pwa-register.
 */

export async function registerServiceWorker() {
  const enablePwa = import.meta.env.VITE_ENABLE_PWA === 'true';
  const isProd = import.meta.env.PROD;

  if (!enablePwa || !isProd) {
    // Development or Tauri Desktop Profile: Ensure no active or stale Service Workers exist
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log('[PWA Profile: Disabled] Unregistered stale Service Worker:', registration.scope);
        }
      } catch (err) {
        // Silently ignore unregistration errors in dev
      }
    }
    return;
  }

  // Hosted Production Web Profile: Register explicitly
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const { registerSW } = await import('virtual:pwa-register');
      registerSW({
        immediate: true,
        onNeedRefresh() {
          console.log('[PWA Profile: Production Web] New update available.');
        },
        onOfflineReady() {
          console.log('[PWA Profile: Production Web] App ready for offline standalone mode.');
        },
        onRegisterError(error) {
          console.warn('[PWA Profile: Production Web] Service Worker registration failed:', error);
        },
      });
    } catch (err) {
      console.warn('[PWA Profile: Production Web] Registration module failed to load:', err);
    }
  }
}
