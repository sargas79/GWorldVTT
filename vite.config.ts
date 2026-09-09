import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

const root = import.meta.dirname;

/**
 * Copies the manifest, templates, and language files into dist/ after a build.
 * Foundry loads these from disk, so they have to sit alongside the bundle
 * rather than being inlined into it.
 */
function copyStaticAssets(): Plugin {
  return {
    name: "gworld-copy-static",
    apply: "build",
    async closeBundle() {
      const targets: Array<[string, string]> = [
        ["src/system.json", "dist/system.json"],
        ["lang", "dist/lang"],
        ["templates", "dist/templates"],
      ];

      for (const [from, to] of targets) {
        const source = resolve(root, from);
        if (!existsSync(source)) continue;
        await cp(source, resolve(root, to), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [copyStaticAssets()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // Foundry loads the system as a single ES module, so no code splitting.
    lib: {
      entry: resolve(root, "src/gworld.ts"),
      formats: ["es"],
      fileName: () => "gworld.mjs",
    },
    rollupOptions: {
      output: {
        assetFileNames: "gworld.[ext]",
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/rules/**/*.ts"],
      exclude: ["src/rules/index.ts", "src/rules/types.ts"],
    },
  },
});
