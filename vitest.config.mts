import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Date labels are built in the viewer's time zone; pin it so results don't depend on the machine running the tests.
process.env.TZ = "UTC";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    // DOM by default; server-side files opt out with a `// @vitest-environment node` docblock.
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    env: { SESSION_SECRET: "test-secret-that-is-at-least-32-characters" },
  },
});
