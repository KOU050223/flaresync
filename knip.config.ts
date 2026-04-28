import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreDependencies: ["eslint-plugin-n", "vitest", "cloudflare"],
  workspaces: {
    ".": {
      entry: [],
      project: [],
    },
    "packages/server": {
      project: ["src/**/*.ts", "!src/**/*.test.ts"],
    },
    "examples/basic": {
      entry: ["src/**/*.ts"],
      project: ["src/**/*.ts"],
    },
  },
};

export default config;
