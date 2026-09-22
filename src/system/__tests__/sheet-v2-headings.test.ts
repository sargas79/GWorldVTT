import { describe, expect, it } from "vitest";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
 * The character sheet's heading and panel standard
 * (docs/character-sheet-v2-style.md), checked on its templates so a new
 * panel can't bring a heading style of its own.
 */

const DIR = join(process.cwd(), "templates", "actor", "v2");
const templates = readdirSync(DIR)
  .filter((f) => f.endsWith(".hbs"))
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), "utf8") }));

const VOID = new Set(["area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr"]);

interface Heading { file: string; tag: string; classes: string[]; parent: string[] }

/** Every heading in a template, with its own classes and its parent element's. */
function headings(file: string, text: string): Heading[] {
  const found: Heading[] = [];
  const stack: { tag: string; classes: string[] }[] = [];
  const source = text.replace(/\{\{!--[\s\S]*?--\}\}/g, "");
  for (const m of source.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:[^>"]|"[^"]*")*)>/g)) {
    const [, closing, name = "", attrs = ""] = m;
    const tag = name.toLowerCase();
    if (closing) {
      const at = stack.map((e) => e.tag).lastIndexOf(tag);
      if (at >= 0) stack.length = at;
      continue;
    }
    const classes = (/class="([^"]*)"/.exec(attrs)?.[1] ?? "").replace(/\{\{[\s\S]*?\}\}/g, " ").split(/\s+/).filter(Boolean);
    if (/^h[1-6]$/.test(tag)) found.push({ file, tag, classes, parent: stack.at(-1)?.classes ?? [] });
    if (!VOID.has(tag) && !attrs.trim().endsWith("/")) stack.push({ tag, classes });
  }
  return found;
}

/** Which of the four kinds a heading is, or null when it is none of them. */
function kind(h: Heading): string | null {
  if (h.tag === "h1" && h.classes.includes("v2-title")) return "sheet title";
  if (h.classes.includes("v2-ph")) return "panel title";
  if (h.classes.includes("v2-sh")) return "sub-heading";
  if (h.classes.length === 0 && h.parent.includes("v2-ph")) return "panel title";
  if (h.classes.length === 0 && h.parent.includes("v2-detail-head")) return "record title";
  if (h.classes.length === 0 && h.parent.includes("v2-box")) return "sub-heading";
  return null;
}

describe("the V2 sheet's headings", () => {
  const all = templates.flatMap((t) => headings(t.file, t.text));

  it("finds the headings it checks", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it("are each one of the standard's kinds", () => {
    const odd = all.filter((h) => kind(h) === null).map((h) => `${h.file}: <${h.tag} class="${h.classes.join(" ")}">`);
    expect(odd).toEqual([]);
  });

  it("title a panel with an h2 and a record with an h3", () => {
    const wrong = all.filter((h) => (kind(h) === "panel title" && h.tag !== "h2") || (kind(h) === "record title" && h.tag !== "h3"));
    expect(wrong.map((h) => `${h.file}: ${h.tag}`)).toEqual([]);
  });

  it("leave the partials' section heading to the partials", () => {
    const own = templates.filter((t) => /class="ish"/.test(t.text)).map((t) => t.file);
    expect(own).toEqual([]);
  });

  it("head a fold with the group band, never a heading of its own", () => {
    for (const { file, text } of templates) {
      for (const m of text.matchAll(/<summary\b[^>]*>/g)) {
        expect(m[0], file).toContain("v2-group-head");
      }
    }
  });
});

describe("the V2 sheet's panels", () => {
  it("are all the one cream surface", () => {
    const dark = templates.filter((t) => /v2-panel-dark/.test(t.text)).map((t) => t.file);
    expect(dark).toEqual([]);
  });

  it("colour a record title by the standard, not by the kind of record", () => {
    const tinted = templates.filter((t) => /v2-detail-(steel|red|plain)\b/.test(t.text)).map((t) => t.file);
    expect(tinted).toEqual([]);
  });
});
