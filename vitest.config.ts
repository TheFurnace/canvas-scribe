import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.pnpm-store/**"],
    alias: {
      obsidian: fileURLToPath(new URL("./tests/obsidian.mock.ts", import.meta.url)),
    },
  },
});
