import { useState, useEffect, useCallback } from "react";

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

export function useInstallPrompt() {
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    if (deferredPrompt) setInstallable(true);

    const handler = () => setInstallable(true);
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setInstallable(false);
      deferredPrompt = null;
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    const result = await deferredPrompt.prompt();
    deferredPrompt = null;
    setInstallable(false);
    return result.outcome === "accepted";
  }, []);

  return { installable, promptInstall };
}