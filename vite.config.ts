import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "src/web",
  plugins: [svelte()],
  resolve: {
    alias: [
      // The package's exports don't list the wasm file, so point at it directly.
      {
        find: /^@libavoid-wasm/,
        replacement: fileURLToPath(new URL("./node_modules/libavoid-js/dist/libavoid.wasm", import.meta.url)),
      },
    ],
  },
  build: { outDir: "../../dist/web", emptyOutDir: true, target: "es2022" },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:4810" } },
});
