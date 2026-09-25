/** The screen's words as Foundry would give them, read from the shipped language file, noting any key it lacks. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BuildContext } from "../types.js";

const lang = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../../lang/en.json"), "utf8"),
);

function lookup(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      lang,
    );
}

/** A context that localizes from en.json, and the keys asked for that it has no string for. */
export function englishContext(): BuildContext & { missing: string[] } {
  const missing: string[] = [];
  const t = (key: string, data?: Record<string, string | number>) => {
    const found = lookup(key);
    if (typeof found !== "string") {
      if (key.startsWith("GWORLD.")) missing.push(key);
      return key;
    }
    return found.replace(/\{(\w+)\}/g, (whole, name: string) =>
      data && name in data ? String(data[name]) : whole,
    );
  };
  return { t, moduleTitle: (id: string) => `Module ${id}`, missing };
}
