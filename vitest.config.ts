import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@domain": path.resolve(__dirname, "src/domain"),
      "@services": path.resolve(__dirname, "src/services"),
      "@adapters": path.resolve(__dirname, "src/adapters"),
      "@ui": path.resolve(__dirname, "src/ui"),
      "@lib": path.resolve(__dirname, "src/lib"),
    },
  },
});
