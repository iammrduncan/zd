import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// Tauri passes this when developing against a device on the network.
const host = process.env.TAURI_DEV_HOST;
const appRoot = fileURLToPath(new URL("./packages/app", import.meta.url));

export default defineConfig(({ mode }) => ({
  root: appRoot,

  // `assets/` holds the bundled iA Writer faces. Vite copies it to the dist root,
  // so `url("/fonts/...")` resolves in both dev and production.
  publicDir: "assets",

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./packages/app/src", import.meta.url)),
    },
  },

  // Do not obscure Rust errors during `tauri dev`.
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/packages/tauri/**"],
    },
  },
  ...(mode === "e2e"
    ? {
        build: {
          rollupOptions: {
            input: {
              app: fileURLToPath(new URL("./packages/app/index.html", import.meta.url)),
              terminalPerformance: fileURLToPath(
                new URL("./packages/app/dev/terminal-performance.html", import.meta.url),
              ),
              changesPerformance: fileURLToPath(
                new URL("./packages/app/dev/changes-performance.html", import.meta.url),
              ),
              attentionPerformance: fileURLToPath(
                new URL("./packages/app/dev/attention-performance.html", import.meta.url),
              ),
            },
          },
        },
      }
    : {}),
}));
