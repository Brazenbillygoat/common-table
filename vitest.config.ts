import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    // Database integration tests are opt-in because they need the local PostgreSQL container.
    exclude:
      process.env.RUN_DATABASE_TESTS === "1"
        ? configDefaults.exclude
        : [...configDefaults.exclude, "**/*.integration.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
