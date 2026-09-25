import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A key written twice in one object of the language file is legal JSON, and
 * JSON.parse quietly keeps the last: the earlier copy becomes text nobody
 * reads, and editing it changes nothing in the game. The GM Screen's strings
 * were once in the file four times over.
 */
function duplicateKeys(text: string): string[] {
  const found: string[] = [];
  // One entry per object open: its path, and the keys seen in it so far.
  const stack: Array<{ path: string; keys: Set<string> } | null> = [];
  let lastString: string | null = null;
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      lastString = JSON.parse(text.slice(i, j + 1)) as string;
      i = j + 1;
      continue;
    }
    if (c === ":" && lastString !== null) {
      const top = stack[stack.length - 1];
      if (top) {
        if (top.keys.has(lastString)) found.push(`${top.path}.${lastString}`.replace(/^\./, ""));
        top.keys.add(lastString);
      }
    }
    if (c === "{") {
      const parent = stack[stack.length - 1];
      stack.push({
        path: parent && lastString !== null ? `${parent.path}.${lastString}` : "",
        keys: new Set(),
      });
    } else if (c === "[") stack.push(null);
    else if (c === "}" || c === "]") stack.pop();
    if (c !== ":" && c.trim()) lastString = c === "," ? null : lastString;
    i += 1;
  }
  return found;
}

describe("the language file", () => {
  it("finds a key written twice", () => {
    expect(duplicateKeys('{"A": {"b": 1, "b": 2}, "c": [{"d": 1}, {"d": 2}]}')).toEqual(["A.b"]);
  });

  it("has no key written twice", () => {
    const text = readFileSync(resolve(import.meta.dirname, "../../../lang/en.json"), "utf8");
    expect(duplicateKeys(text)).toEqual([]);
  });
});
