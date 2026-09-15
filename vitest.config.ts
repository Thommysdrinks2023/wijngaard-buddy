import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Fase 11 Blok 5/6 — Vitest (unittests) en Playwright (rooktests) staan naast
// elkaar in dit project. Zonder deze eigen configuratie probeert Vitest ook de
// bestanden in e2e/ te draaien; die gebruiken Playwright-API's en vallen dan om.
//
// Bewust GEEN mergeConfig met vite.config.ts: die bevat de TanStack Start-
// plugins, die bij het samenvoegen omvallen. De unittests dekken pure
// rekenlogica en datalaag-helpers en hebben die plugins niet nodig — alleen het
// @/-alias moet kloppen.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
