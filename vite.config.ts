import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  base: "/",
  server: {
    proxy: {
      // In production the API is same-origin (Pages Functions live next to the
      // static build). In dev it runs in a separate wrangler process:
      //   yarn dev:api   # :8788, functions + D1
      //   yarn start     # :5173, this proxy points /api at it
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: true
      }
    }
  },
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "stream", "timers"]
    }),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.ts",
      injectRegister: false,
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ]
});
