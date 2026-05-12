import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// Server-only plugin: one entry, no Vue. Mirrors the externals
// strategy from packages/plugins/bookmarks-plugin/vite.config.ts —
// `gui-chat-protocol` (the identity `definePlugin` helper) and
// `zod` are inlined so the bundled `dist/index.js` resolves
// cleanly when the runtime loader extracts the tarball into a
// cache dir without node_modules.
export default defineConfig({
  plugins: [
    dts({
      include: ["src/**/*.ts"],
      outDir: "dist",
      compilerOptions: { rootDir: "src" },
    }),
  ],
  build: {
    lib: {
      entry: { index: "src/index.ts" },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ["node:os", "node:url"],
    },
    minify: false,
    sourcemap: true,
  },
});
