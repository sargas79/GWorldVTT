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
 * Whether a value is a GCA expression rather than a constant. GCA computes
 * unarmed damage from the character sheet -- `@if("SK:Brawling::level" > ...)`
 * -- and nothing here can evaluate that, so such records are reported rather
 * than guessed at.
 */
export function isExpression(value) {
  return /[@$]\w+\(|::|%level/i.test(value ?? "");
}
