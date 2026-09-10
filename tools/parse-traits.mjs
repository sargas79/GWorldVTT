/**
 * Parses advantages and disadvantages out of the Basic Set into compendium JSON.
 *
 * This reads `pdftotext -raw` output rather than the `-simple` reflow the skill
 * parser uses, because trait headings carry the book's category symbols
 * (mental/physical/exotic/supernatural) between the name and the cost. Those
 * symbols come out of the symbol font as bare ASCII digits, and the reflow glues
 * them onto the cost: "Combat Reflexes 215 points" for a 15-point advantage,
 * "Clairsentience 2 550 points" for a 50-point one. There is no way to tell a
 * symbol digit from a cost digit once they are joined.
 *
 * Raw mode keeps the original line breaks, and the book sets every trait heading
 * with the cost on its own line:
 *
 *     Combat Reflexes 2
 *     15 points
 *
 * So the cost line is the anchor, the name is read from the line above it, and
 * the symbol run is whatever trailing digits that line ends with.
 *
 * Usage: node tools/parse-traits.mjs <raw-extracted-text> [--write]
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A cost line: "15 points", "-5 points*", "1 point/level", "0 or 5 points",
 * "-30 or -50 points", "3, 5, or 8 points per +1 ST", "35 points/copy",
 * "10 or more points", "30 points + 5 points per point".
 *
 * A range or a list keeps its lower bound, which is what the character starts
 * from; the asterisk marks a self-control roll and carries no cost information.
 *
 * The trailing qualifier is deliberately permissive but must not end the line
 * with a sentence, which is what separates a heading's cost from the same words
 * appearing mid-paragraph ("Incapacitating or hallucinogenic: -10 points.").
 */
const COST_LINE = new RegExp(
  String.raw`^(?<lead>-?\d+)` +
    String.raw`(?<range>(?:\s*,\s*-?\d+)*\s*,?\s*(?:or|to)\s+(?:-?\d+|more))?` +
    String.raw`\s*points?(?<per>\/level)?` +
    String.raw`(?<tail>\s*(?:\/[a-z]+|(?:per|for)\s+[^.]*|\+\s*\d+[^.]*))?` +
    String.raw`\s*\*?\s*$`,
);

/**
 * The category symbols trailing a heading, e.g. "Combat Reflexes 2",
 * "Absolute Direction 2/3", "Subsonic Hearing 3 1". Always single digits or a
 * slashed pair, so they cannot be confused with a name.
 */
const SYMBOL_RUN = /(?:^|\s+)\d(?:\/\d)?(?:\s+\d(?:\/\d)?)*\s*$/;

/**
 * The running page header, which names the chapter and gives the book page:
 * "ADVANTAGES 39", "142 DISADVANTAGES". It is the only thing in the text that
 * says which chapter a heading belongs to, and traits priced "Variable" carry no
 * sign to tell an advantage from a disadvantage.
 */
const RUNNING_HEADER = /^(?:(\d{1,3})\s+)?(ADVANTAGES|DISADVANTAGES)(?:\s+(\d{1,3}))?$/;

/**
 * The enhancements and limitations chapter sits inside the advantages chapter's
 * running header, and its modifiers are priced "Variable" exactly as a trait is,
 * so only the page separates them.
 *
 * The modifiers occupy pages 101-116 as this text numbers them. The guard runs
 * past them to 120 because no trait heading of either kind appears on 117-120 --
 * the last advantage is Zeroed on 99 and the first disadvantage Absent-Mindedness
 * on 121 -- so the wider range cannot discard a trait, and it keeps holding if
 * the page numbering shifts by a page.
 */
const MODIFIER_PAGES = { first: 101, last: 120 };

/** A heading name: title case, optionally opening with a number ("360° Vision"). */
const NAME = /^(?<name>[0-9]{0,3}[°"']?\s*[A-Z][A-Za-z0-9'’°()/, .-]{2,44})$/;

/** Words that mark a fragment as running prose rather than a trait heading. */
const PROSE =
  /\b(of|the|and|a|an|for|with|by|that|this|any|all|costs?|requires?|least|each|per|worth|gives?|is|are|you|your|it|its|see|note|only|but|if|when|from|than|more|less|total|up|at|as|on|in)\b/i;

/**
 * Names the book itself writes with a lowercase word that {@link PROSE} would
 * otherwise reject. Each is a real heading, verified against the chapter.
 */
const PROSE_EXEMPT = new Set([
  "Claim to Hospitality",
  "Code of Honor",
  "Disciplines of Faith",
  "Doesn't Eat or Drink",
  "Hard of Hearing",
  "Less Sleep",
  "Hard to Kill",
  "Hard to Subdue",
  "No Depth Perception",
  "No Fine Manipulators",
  "No Sense of Humor",
  "No Sense of Smell/Taste",
  "On the Edge",
  "See Invisible",
  "Sense of Duty",
  "Speak With Animals",
  "Speak With Plants",
  "Trained By A Master",
  "Walk on Air",
  "Walk on Liquid",
]);

function slugId(name) {
  return createHash("sha1").update(`trait:${name}`).digest("hex").slice(0, 16);
}

/**
 * True when a line is a heading continued from the line above it.
 *
 * Long names wrap, leaving the tail on the cost line's neighbour and the head
 * one line further up ("Compartmentalized" / "Mind 2 1" / "50 points/level").
 * A continuation is short, unpunctuated, and starts a fresh capitalised word, so
 * it cannot be the end of the preceding paragraph.
 */
function isHeadingStart(line) {
  const text = line.trim();
  if (!text || text.length > 40) return false;
  if (/[.!?,;:)]$/.test(text)) return false;
  if (text.split(/\s+/).length > 4) return false;
  // A running page header ("ADVANTAGES 39", "142 DISADVANTAGES") sits above a
  // heading exactly as a wrapped name does, but is never part of the name.
  if (/\b[A-Z]{3,}\b/.test(text)) return false;
  if (/(?:^|\s)\d{1,3}(?:\s|$)/.test(text)) return false;
  return /^[0-9]{0,3}[°"']?\s*[A-Z]/.test(text);
}

function main() {
  const [, , source, write] = process.argv;
  if (!source) {
    console.error("Usage: node tools/parse-traits.mjs <raw-extracted-text> [--write]");
    process.exit(1);
  }

  const lines = readFileSync(source, "utf8").split(/\r?\n/);

  const accepted = [];
  const rejected = [];
  const seen = new Set();
  const reject = (context, why) => rejected.push({ context, why });

  let chapter = "";
  let page = 0;

  for (let i = 1; i < lines.length; i++) {
    const header = RUNNING_HEADER.exec(lines[i].trim());
    if (header) {
      chapter = header[2];
      page = Number(header[1] ?? header[3]) || page;
      continue;
    }

    const cost = COST_LINE.exec(lines[i].trim());

    // Traits whose cost depends on a table the book prints separately (Luck,
    // Allies, Innate Attack) are headed "Variable" instead of a number. They are
    // worth carrying with a zero cost and a note, so the trait exists to drag
    // onto a sheet.
    const isVariable = !cost && lines[i].trim() === "Variable";
    if (!cost && !isVariable) continue;

    // Both kinds of cost are only trusted inside the two trait chapters, and
    // outside the enhancements and limitations chapter that sits within the
    // advantages running header. A "15 points" line anywhere else in the book
    // sits in prose, and a heading-shaped line above it would invent a trait.
    const inModifiers =
      chapter === "ADVANTAGES" && page >= MODIFIER_PAGES.first && page <= MODIFIER_PAGES.last;
    if (!chapter || inModifiers) continue;

    // Everything before the cost line, with the category symbols removed.
    let heading = lines[i - 1].trim().replace(SYMBOL_RUN, "").trim();

    // A long name wraps, leaving its tail -- or nothing but the symbols -- on the
    // line above the cost, and its head one line further up. The symbols can land
    // on either line, so strip them from both before judging.
    const above = i >= 2 ? lines[i - 2].trim().replace(SYMBOL_RUN, "").trim() : "";

    // Where the fragment cannot be a whole name (empty, or opening mid-phrase as
    // "or Drink" does) the line above is the rest of it. Where the fragment could
    // stand alone, only take the line above if it follows a finished paragraph:
    // otherwise a table caption is absorbed into the name, turning the heading
    // above the Vulnerability Table into "Vulnerability Table Workaholic".
    const incomplete = !heading || /^[a-z]/.test(heading);
    const standalone = heading.split(/\s+/).length === 1 && i >= 3 && /[.!?]$/.test(lines[i - 3].trim());

    if (above && (incomplete || standalone) && isHeadingStart(above)) {
      heading = heading ? `${above} ${heading}` : above;
    }

    // Belt and braces: a running header that survived the checks above.
    heading = heading.replace(/^(?:(?:[A-Z]{3,}|\d{1,3})\s+)+/, "").trim();

    const context = `${heading} | ${lines[i].trim()}`;
    if (!heading) { reject(context, "no name above cost"); continue; }

    const nm = NAME.exec(heading);
    if (!nm) { reject(context, "not a heading"); continue; }

    // The book sets apostrophes as typographic quotes. Storing them that way
    // makes "Doesn't Breathe" unfindable by anyone typing it on a keyboard.
    const name = nm.groups.name.replace(/[’‘]/g, "'").replace(/[-,:;]$/, "").trim();
    if (name.length < 3) { reject(context, "name too short"); continue; }
    if (name.split(" ").length > 5) { reject(context, "name too many words"); continue; }
    if (PROSE.test(name) && !PROSE_EXEMPT.has(name)) { reject(context, "name reads as prose"); continue; }
    if (seen.has(name)) { reject(context, "duplicate"); continue; }

    const points = isVariable ? 0 : Number(cost.groups.lead);
    if (!Number.isFinite(points)) { reject(context, "cost unparseable"); continue; }

    const perLevel = !isVariable && Boolean(cost.groups.per);
    const variable = isVariable || Boolean(cost.groups.range ?? cost.groups.tail);

    // A cost phrase that names a unit wraps onto the next line as readily as a
    // name does: "30 points + 10 points per" / "-1 to Fright Check". Quoting only
    // the first line leaves the scale unsaid, which is worse than not quoting it.
    // The trait's body always opens a sentence, so a following line that starts
    // lowercase or with a sign is the rest of the price, not prose.
    let priced = lines[i].trim();
    if (variable && !isVariable && /^[a-z+-]|^\d+(?:\s|$)/.test((lines[i + 1] ?? "").trim())) {
      priced = `${priced} ${lines[i + 1].trim()}`;
    }

    // The sign separates the two chapters, and it is unambiguous. A trait
    // costing 0 at its lower bound ("0 or 5 points") is still an advantage.
    seen.add(name);
    accepted.push({
      _id: slugId(name),
      name,
      type: "trait",
      system: {
        // A signed cost says which chapter this is on its own; a trait priced
        // "Variable" has no sign, so the running header decides.
        category:
          points < 0 || (isVariable && chapter === "DISADVANTAGES") ? "disadvantage" : "advantage",
        points: perLevel ? 0 : points,
        levels: perLevel ? 1 : 0,
        pointsPerLevel: perLevel ? points : 0,
        reactionModifier: 0,
        description: variable
          ? `<p>The book prices this trait as <em>${priced}</em>. ${
              isVariable
                ? "It has no fixed cost; set the points for your character."
                : "The value here is its base cost."
            }</p>`
          : "",
        reference: "Basic Set: Characters",
      },
    });
  }

  const advantages = accepted.filter((t) => t.system.category === "advantage").length;
  console.log(
    `accepted: ${accepted.length} (${advantages} advantages, ${accepted.length - advantages} disadvantages)`,
  );
  console.log(`rejected: ${rejected.length}`);
  const byReason = rejected.reduce((acc, r) => ((acc[r.why] = (acc[r.why] ?? 0) + 1), acc), {});
  for (const [why, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${why}`);
  }

  if (write === "--write") {
    const out = join(projectRoot, "packs-src", "traits", "basic-set-traits.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
    console.log(`\nwrote ${accepted.length} traits`);
    writeFileSync(
      join(projectRoot, "packs-src", "traits", ".rejected.txt"),
      rejected.map((r) => `${r.why}\t${r.context}`).join("\n"),
      "utf8",
    );
  }
}

main();
