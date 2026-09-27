import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A field's `initial` that is an array or object literal is one instance,
 * handed as is to every document stored without that key, so their sources
 * share it: an update applied to one shows up in the others and the next
 * update to them diffs to nothing (sargas79/GWorldVTT#894). A factory gives
 * each document its own.
 */
describe("data model initial values", () => {
  const dir = join(__dirname, "..", "data");

  it("give each document a fresh array or object", () => {
    const shared: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      readFileSync(join(dir, file), "utf8").split(/\r?\n/).forEach((line, i) => {
        if (/\binitial:\s*[[{]/.test(line)) shared.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(shared).toEqual([]);
  });
});
