import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./test-setup.ts"],
    // testes que tocam o banco rodam em série (evita corrida no schema)
    fileParallelism: false,
  },
});
