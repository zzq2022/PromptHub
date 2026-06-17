/// <reference types="vitest" />
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"],
    exclude: ["node_modules/**/*", "dist/**/*"],
  },
  resolve: {
    alias: {
      "@prompthub/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
