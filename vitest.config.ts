import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "shared", include: ["shared/test/**/*.test.ts"] } },
      { test: { name: "client", include: ["client/test/**/*.test.ts"] } },
      { test: { name: "server", include: ["server/src/{rooms,replay,protocol,matchLogger}.test.js", "server/test/**/*.test.ts"] } },
    ],
    coverage: {
      provider: "v8",
      include: ["shared/src/**/*.ts"],
      thresholds: { lines: 85, statements: 85 },
    },
  },
});
