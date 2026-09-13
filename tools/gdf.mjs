/**
 * Reads a GCA 5 data file (.gdf) into records.
 *
 * The format is line-oriented and section-delimited. A record is
 *
 *     Name, second field, key(value), key(value), ...
 *
 * where a line ending in "_" continues onto the next. Values nest parentheses
 * and contain commas, so neither a naive split nor a lazy regex is enough; the
 * splitting here tracks depth.
 *
 * The books' prose lives in `description(...)` fields, and the compendia this
 * feeds deliberately carry statistics only. So `fields()` drops description
 * outright rather than leaving it to each caller to remember: a field that is
 * never returned cannot be imported by accident.
 */

/** Fields whose contents are the books' prose, not statistics. */
const PROSE = new Set(["description", "damnotes", "drnotes", "usernotes", "notes"]);

/**
 * Splits on commas at paren/brace depth zero, respecting double quotes.
 *
 * GCA quotes any name that contains a comma, and firearms are named by their
 * calibre: `"Revolver, .36"` is one field, not two. Splitting without the quote
 * rule turns that weapon into a record named "Revolver whose cost is ".36"".
 */
export function splitTop(text) {
  const out = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

/**
 * Record boundaries. GCA separates sections with "[NAME]" headers, and
 * continues a record onto the next line in two ways: an explicit "_" at the end
 * of the line, and -- less obviously -- a trailing comma, which is simply a
 * field list broken across lines:
 *
 *     Payload, 1/2,
 *     mods(Payload),
 *     page(B74),
 *     cat(Exotic, Physical),
 *     vars(_
 *
 * Reading only the "_" form splits that into four fragments, none of which is a
 * usable record: the first has no page, so it looks like it belongs to another
 * book and is filtered out, and the rest have no name.
 *
 * Lines opening with "<", "//", "*" or "#" are group markers, comments, banners
 * and build directives -- structure around the data rather than data -- and are
 * skipped whether or not a record is open.
 */
export function records(text) {
  const out = [];
  let section = null;
  let buf = "";
  let startLine = 0;
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    const header = /^\s*\[([A-Z][A-Z ]*)\]\s*$/.exec(line);
    if (header) {
      section = header[1].trim();
      buf = "";
      continue;
    }
    const trimmed = line.trim();
    if (!section) continue;
    if (/^(\/\/|<|\*|#)/.test(trimmed)) continue;
    if (!buf) {
      if (!trimmed) continue;
      startLine = i + 1;
    }

    buf += trimmed.replace(/_$/, "");
    if (/[_,]$/.test(line)) continue;

    if (buf.includes(",")) {
      out.push({ section, text: buf, line: startLine });
    }
    buf = "";
  }
  return out;
}

/**
 * A record's `key(value)` fields, with prose dropped. Later duplicates of a key
 * win, which is how GCA itself reads an overriding line.
 */
export function fields(text) {
  const out = new Map();
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "(") continue;
    const before = /([A-Za-z][A-Za-z0-9]*)$/.exec(text.slice(0, i));
    if (!before) continue;
    const key = before[1].toLowerCase();

    let depth = 0;
    let end = -1;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (c === "(") depth++;
      else if (c === ")" && --depth === 0) { end = j; break; }
    }
    if (end < 0) continue;

    if (!PROSE.has(key)) out.set(key, text.slice(i + 1, end).trim());
    i = end;
  }
  return out;
}

/** The record's name: its first comma-separated field, unquoted. */
export function nameOf(record) {
  const first = splitTop(record.text)[0].trim();
  return first.startsWith('"') && first.endsWith('"') ? first.slice(1, -1).trim() : first;
}

/** Every `newmode(...)` on a record, in order. Weapons state attacks this way. */
export function modes(text) {
  const out = [];
  const re = /\bnewmode\(/gi;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1;
    let j = m.index + m[0].length;
    for (; j < text.length && depth > 0; j++) {
      if (text[j] === "(") depth++;
      else if (text[j] === ")") depth--;
    }
    if (depth === 0) out.push(text.slice(m.index + m[0].length, j - 1));
    re.lastIndex = j;
  }
  return out;
}

/**
 * A book's page prefix as the book prints it: "B", "MA", "MH1".
 *
 * GCA writes a numbered series with a colon between prefix and page --
 * `page(MH1:23)` -- so the prefix is accepted with or without one, and kept
 * without.
 */
export function bookPrefix(prefix) {
  return String(prefix).trim().replace(/:$/, "");
}

/**
 * A page prefix as a regular expression can hold it, with GCA's colon.
 *
 * The colon is optional after a prefix ending in a letter, since `B203` and
 * `B:203` can only mean one thing. After a digit it is required: `DF11:5` is
 * Dungeon Fantasy 11, and without the colon a reading of Dungeon Fantasy 1
 * would take it for page 15.
 *
 * The page number is captured, and may not run into a colon: in `MH1:23`
 * the "1" is part of the prefix, so the book "MH" has no page there.
 */
function pagePattern(prefix) {
  const bare = bookPrefix(prefix);
  const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const colon = /\d$/.test(bare) ? ":" : ":?";
  return `\\b${escaped}${colon}(\\d+)\\b(?!:)`;
}

/**
 * Whether a citation names a page of the book with this prefix. GCA cites
 * every book a record appears in -- `page(MA52, B203)` -- and each pack is
 * built from one of them.
 */
export function citesBook(page, prefix) {
  return new RegExp(pagePattern(prefix)).test(page ?? "");
}

/** Every page of the book with this prefix that a citation names, in order. */
export function pagesCited(page, prefix) {
  const re = new RegExp(pagePattern(prefix), "g");
  return [...(page ?? "").matchAll(re)].map((m) => Number(m[1]));
}

/**
 * The page reference for one book, as the compendium prints it: "Martial
 * Arts p. 52", or "Basic Set: Characters p. 271, 276" where a record spans
 * two pages. A record that cites the book without a page number gets the
 * book alone.
 */
export function reference(page, prefix, book) {
  const pages = pagesCited(page, prefix);
  return pages.length ? `${book} p. ${pages.join(", ")}` : book;
}

/**
 * Throws when no record in the file cites the book being read.
 *
 * A prefix that matches nothing is not a book with nothing in it: it is the
 * wrong prefix, and the parsers would otherwise write empty packs and exit as
 * though they had succeeded. The message names the citation forms the file
 * does use, which is usually enough to see the mistake.
 */
export function assertCitesBook(recs, prefix) {
  const forms = new Map();
  for (const r of recs) {
    const page = fields(r.text).get("page");
    if (!page) continue;
    if (citesBook(page, prefix)) return;
    // A digit belongs to the prefix only before a colon: "MH1:" but "B", not "B8".
    for (const m of page.matchAll(/\b([A-Za-z]+(?:\d+:)?)\d+\b/g)) {
      forms.set(m[1], (forms.get(m[1]) ?? 0) + 1);
    }
  }
  const seen = [...forms.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([form, count]) => `${form} (${count})`)
    .join(", ");
  throw new Error(
    `No record cites a page with the prefix "${bookPrefix(prefix)}".` +
      (seen ? ` Citations in this file begin: ${seen}.` : " No record in this file cites a page."),
  );
}

/**
 * Whether a value is a GCA expression rather than a constant. GCA computes
 * unarmed damage from the character sheet -- `@if("SK:Brawling::level" > ...)`
 * -- and nothing here can evaluate that, so such records are reported rather
 * than guessed at.
 */
export function isExpression(value) {
  return /[@$]\w+\(|::|%level/i.test(value ?? "");
}
