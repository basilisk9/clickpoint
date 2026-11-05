import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/* Tests run on the pure modules in src/lib. Deliberately no jsdom: every
   assertion here is on exported string/behaviour helpers rather than DOM
   snapshots, so the suite stays fast and needs no browser shim. Files that
   import next/* (routes, pipeline, store) are out of scope — they need a live
   Postgres and an LLM. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});

