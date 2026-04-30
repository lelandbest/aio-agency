import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";
import path from "path";
import net from "net";

const LOCK_FILE = path.join(process.cwd(), ".vite-lock");

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve(false);
      else resolve(true);
    });
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "localhost");
  });
}

async function acquireLock(port) {
  const portFree = await checkPort(port);
  if (!portFree) {
    const allowMulti = process.env.VITE_ALLOW_MULTI === "true";
    if (allowMulti) {
      console.log(`[vite] Port ${port} in use, but VITE_ALLOW_MULTI=true - allowing multiple instances`);
      return true;
    }
    console.error(`[vite] Port ${port} is already in use. Only one instance allowed.`);
    console.error(`[vite] Set VITE_ALLOW_MULTI=true to allow multiple instances (admin only).`);
    process.exit(1);
  }
  fs.writeFileSync(LOCK_FILE, String(port));
  return true;
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {}
}

export default defineConfig(async () => {
  await acquireLock(5175);

  process.on("SIGINT", releaseLock);
  process.on("SIGTERM", releaseLock);

  const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");

  const isHosted =
    String(env.VITE_HOSTED || "").toLowerCase() === "true";

  const publicHost = env.VITE_PUBLIC_HOST || "";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "AIO Agency",
          short_name: "AIO",
          start_url: "/",
          display: "standalone",
          background_color: "#070708",
          theme_color: "#070708",
          icons: [
            {
              src: "aio-button-192px.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "aio-button-512px.png",
              sizes: "512x512",
              type: "image/png",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallback: "index.html",
          runtimeCaching: [],
        },
      }),
    ],

    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            excalidraw: ['@excalidraw/excalidraw'],
          },
        },
      },
    },

    server: {
      host: "0.0.0.0",
      port: 5175,
      strictPort: false,

      hmr: isHosted
        ? {
            protocol: "wss",
            clientPort: 443,
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
