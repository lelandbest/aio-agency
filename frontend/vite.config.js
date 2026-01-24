import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load env variables from .env files
  const env = loadEnv(mode, process.cwd(), "");

  /**
   * Set VITE_HOSTED=true ONLY in hosted environments
   * (Emergent, cloud preview, etc.)
   */
  const isHosted =
    String(env.VITE_HOSTED || "").toLowerCase() === "true";

  /**
   * Optional public hostname for hosted HMR
   * Example: your-app.emergent.sh
   */
  const publicHost = env.VITE_PUBLIC_HOST || "";

  return {
    plugins: [react()],

    server: {
      /**
       * Local:
       *  - localhost
       * Hosted:
       *  - bind on all interfaces behind proxy
       */
      host: isHosted ? "0.0.0.0" : "localhost",

      /**
       * Local dev port (default Vite port)
       */
      port: Number(env.VITE_PORT || 5173),

      /**
       * Hot Module Reloading
       */
      hmr: isHosted
        ? {
            protocol: "wss",
            clientPort: 443,

            /**
             * IMPORTANT:
             * Use a PUBLIC HOSTNAME, not a raw IP.
             * Do NOT bind to an external IP locally.
             */
            ...(publicHost ? { host: publicHost } : {}),
          }
        : true,
    },

    /**
     * Uncomment if you use absolute imports like "@/components/..."
     */
    // resolve: {
    //   alias: {
    //     "@": "/src",
    //   },
    // },
  };
});
