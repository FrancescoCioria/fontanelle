import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  base: "/fontanelle/",
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
