import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    outExtension({ format }) {
      return { js: format === "cjs" ? ".cjs" : ".js" };
    },
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    tsconfig: "./tsconfig.json",
  },
  {
    entry: { "client/index": "src/client/index.ts" },
    format: ["esm", "cjs"],
    outExtension({ format }) {
      return { js: format === "cjs" ? ".cjs" : ".js" };
    },
    dts: true,
    sourcemap: true,
    clean: false,
    splitting: false,
    tsconfig: "./tsconfig.client.json",
  },
]);
