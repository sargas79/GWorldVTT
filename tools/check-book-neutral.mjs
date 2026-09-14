#!/usr/bin/env node
/**
 * Keeps the system book-neutral.
 *
 * The system implements the GURPS Basic Set, and GURPS Lite, which is drawn
 * from it. Every other book lives in an add-on module, which reaches the
 * system through `game.gworld.api`. So nothing the system ships -- its code,
 * templates, strings and compendium sources -- cites another book's pages, and
 * nothing names an add-on module: the system never knows which ones exist.
 *
 * Run by `npm run lint` and by CI. Exits non-zero, listing each line, when:
 *   - a line cites a page of a GURPS book other than the Basic Set;
 *   - a line names an add-on module;
 *   - an exception below no longer matches anything, so it can be removed.
 *
 * Mentioning a book's page prefix in the GCA parser's docs and tests, which
 * live under `tools/`, is outside what this reads.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the system's shipped content lives. */
const SCOPE = ["src", "templates", "lang", "packs-src"];
const EXTENSIONS = /\.(ts|mts|js|mjs|hbs|html|json|css)$/;

/**
 * Titles of GURPS books other than the Basic Set, as a citation writes them
 * before a page. A series takes its number: "Monster Hunters 1 p. 23".
 */
const OTHER_BOOKS = [
  "Martial Arts", "Monster Hunters", "Magic", "Thaumatology", "Powers", "Psionic Powers", "Psis",
  "Low-Tech", "High-Tech", "Ultra-Tech", "Bio-Tech", "Fantasy-Tech", "Fantasy", "Dungeon Fantasy",
  "Dungeon Fantasy RPG", "Action", "Horror", "Supers", "Space", "Spaceships", "Mass Combat",
  "Tactical Shooting", "Gun Fu", "Loadouts", "Power-Ups", "Social Engineering", "Infinite Worlds",
  "Banestorm", "Mysteries", "Zombies", "Vehicles", "Crusades", "Transhuman Space", "Traveller",
  "Discworld", "Pyramid", "Sorcery", "Ritual Path Magic", "Template Toolkit", "How to Be a GURPS GM",
  "Alphabet Arcane", "Boardroom and Curia", "City Stats", "Hot Spots", "Adaptations",
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "Martial Arts p. 73", "GURPS Magic pp. 12-13", "Monster Hunters 1: Champions
 * p. 23", "Powers: The Weird p. 5". The title must start a word, so "Basic Set:
 * Campaigns" and a spell called "Lend Energy" never match.
 */
const CITATION = new RegExp(
  `(?<![A-Za-z-])(?:GURPS )?(?:${OTHER_BOOKS.map(escape).join("|")})(?: \\d+)?(?:: [A-Z][^.\\n]{0,40}?)?,? pp?\\. ?\\d`,
);

/**
 * Add-on modules the system must never name. Tests use made-up ids
 * ("test-addon") for the extension points; a real module's id is listed here
 * so that it can never slip in.
 */
const MODULE_NAMES = [/gurps-compendium-content/];

/**
 * Code that is due to leave the system, each entry with the open issue that
 * removes it. An entry allows citations matching `pattern` in the files
 * listed, and nothing else. When the issue lands, the entry goes: an entry
 * that matches nothing fails the check, so it can't outlive its code.
 */
const EXCEPTIONS = [
  {
    // Monster Hunters 1 leaves the system in 2.0.0 (sargas79/GWorldVTT#243).
    issue: 243,
    pattern: /Monster Hunters/,
    files: [
      "lang/en.json",
      "src/gworld.ts",
      "src/rules/__tests__/bonus-points.test.ts",
      "src/rules/__tests__/gadgets.test.ts",
      "src/rules/__tests__/holy.test.ts",
      "src/rules/__tests__/ritual-casting.test.ts",
      "src/rules/__tests__/ritual-cost.test.ts",
      "src/rules/__tests__/ritual-lasting.test.ts",
      "src/rules/__tests__/ritual-path.test.ts",
      "src/rules/__tests__/ritual-tricks.test.ts",
      "src/rules/__tests__/special-ammunition.test.ts",
      "src/rules/__tests__/weapon-improvements.test.ts",
      "src/rules/bonus-points.ts",
      "src/rules/gadgets.ts",
      "src/rules/holy.ts",
      "src/rules/ritual-casting.ts",
      "src/rules/ritual-cost.ts",
      "src/rules/ritual-lasting.ts",
      "src/rules/ritual-path.ts",
      "src/rules/ritual-tricks.ts",
      "src/rules/special-ammunition.ts",
      "src/rules/talents.ts",
      "src/rules/weapon-improvements.ts",
      "src/system/__tests__/item-summary.test.ts",
      "src/system/bonus-points.ts",
      "src/system/chat.ts",
      "src/system/data/character.ts",
      "src/system/data/items.ts",
      "src/system/holy.ts",
      "src/system/item-summary.ts",
      "src/system/optional-rules.ts",
      "src/system/repairs.ts",
      "src/system/ritual-casting.ts",
      "src/system/roll.ts",
      "src/system/sheets/character-sheet.ts",
      "src/system/sheets/item-sheet.ts",
      "src/system/spell-resistance.ts",
      "templates/actor/tab-combat.hbs",
      "templates/actor/tab-gear.hbs",
      "templates/actor/tab-magic.hbs",
      "templates/actor/tab-skills.hbs",
      "templates/actor/tab-traits.hbs",
      "templates/chat/ritual-casting.hbs",
      "templates/item/item-sheet.hbs",
    ],
  },
];

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (EXTENSIONS.test(entry.name)) yield path;
  }
}

/** A citation's lines may wrap: "Monster Hunters 1\n * p. 23". Rejoin a comment's lines before matching. */
function joinedLines(text) {
  const lines = text.split(/\r?\n/);
  return lines.map((line, i) => {
    const next = (lines[i + 1] ?? "").replace(/^\s*(?:\*|\/\/|\{\{!--)?\s*/, "");
    return { number: i + 1, line, joined: `${line} ${next}` };
  });
}

const problems = [];
const used = new Set();

for (const dir of SCOPE) {
  let found;
  try {
    found = [...files(join(root, dir))];
  } catch {
    continue;
  }
  for (const path of found) {
    const file = relative(root, path).split(sep).join("/");
    const text = readFileSync(path, "utf8");
    for (const { number, line, joined } of joinedLines(text)) {
      for (const name of MODULE_NAMES) {
        if (name.test(line)) problems.push(`${file}:${number}: names an add-on module: ${line.trim().slice(0, 140)}`);
      }
      const cited = CITATION.exec(joined);
      // A citation that starts on the next line is reported there.
      if (!cited || cited.index >= line.length) continue;
      const excused = EXCEPTIONS.find((e) => e.files.includes(file) && e.pattern.test(joined));
      if (excused) {
        used.add(`${excused.issue}:${file}`);
        continue;
      }
      problems.push(`${file}:${number}: cites another book: ${line.trim().slice(0, 140)}`);
    }
  }
}

for (const exception of EXCEPTIONS) {
  for (const file of exception.files) {
    if (!used.has(`${exception.issue}:${file}`)) {
      problems.push(`tools/check-book-neutral.mjs: the exception for #${exception.issue} lists ${file}, which no longer cites that book; remove it`);
    }
  }
}

if (problems.length > 0) {
  console.error(`The system must stay book-neutral (see "What belongs in the system" in the README).\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log("Book-neutral: no citations of other books, and no add-on module names.");
