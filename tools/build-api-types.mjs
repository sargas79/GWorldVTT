// Writes dist/gworld-api.d.ts, the entry point to the add-on API's type declarations.
// `tsc -p tsconfig.api.json` emits the declarations themselves under dist/types.
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const api = resolve(root, "dist/types/src/system/api.d.ts");
if (!existsSync(api)) {
  console.error("dist/types/src/system/api.d.ts is missing: run `tsc -p tsconfig.api.json` first.");
  process.exit(1);
}

writeFileSync(
  resolve(root, "dist/gworld-api.d.ts"),
  `/**
 * Types for the GWorld add-on API, \`game.gworld.api\`.
 *
 * The API is the only supported way for a module to reach the system: no
 * patching or subclassing of the system's classes, no importing its source at
 * runtime, and writes only to the module's own types, \`system.extensions.<module>\`,
 * flags, settings and registered rule keys. See the README's section for
 * module authors. Some declarations refer to Foundry's globals; bring your
 * own Foundry types.
 */
export * from "./types/src/system/api.js";
export type { GWorldApi } from "./types/src/system/api.js";
`,
);
console.log("wrote dist/gworld-api.d.ts");
