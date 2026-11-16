import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  splitting: true,
  minify: true,
  clean: true,
  sourcemap: false,
  // Types come from `tsc -p tsconfig.build.json` (TS 7 has no JS API for tsup's dts plugin).
  dts: false,
  shims: false,
});
