import { useInstallPrompt } from "../hooks/useInstallPrompt";

export default function InstallPrompt() {
  const { installable, promptInstall } = useInstallPrompt();

  if (!installable) return null;

  return (
    <button
      onClick={promptInstall}
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 99999,
        padding: "10px 20px",
        borderRadius: 8,
        border: "none",
        background: "#2563eb",
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      Install App
    </button>
  );
}