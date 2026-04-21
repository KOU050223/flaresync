import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    ".": {
      entry: [],
      project: [],
    },
    "packages/server": {
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
      ignore: ["src/**/*.test.ts"],
    },
    "packages/client": {
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
    },
    "examples/basic": {
      entry: ["src/**/*.ts"],
      project: ["src/**/*.ts"],
    },
  },
};

export default config;
