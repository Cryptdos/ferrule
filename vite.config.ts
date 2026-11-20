import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  root: "src/web",
  plugins: [svelte()],
  build: { outDir: "../../dist/web", emptyOutDir: true, target: "es2022" },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:4810" } },
});
