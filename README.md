# GWorld — GURPS Lite 4e for Foundry VTT

A game system implementing the [GURPS Lite (4th Edition)](http://www.sjgames.com/gurps/lite/)
rules for Foundry Virtual Tabletop v14.

Built for personal use at my own table.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Scaffold, build, dev deploy | done |
| 1 | Rules engine + tests | done |
| 2 | Character sheet | not started |
| 3 | Rolls, mod bucket, chat cards | not started |
| 4 | Compendia | not started |
| 5 | Combat automation | not started |
| 6 | Polish, NPC sheet, docs | not started |

## Architecture

The system is split into two layers, and the dependency only ever points one way.

**`src/rules/`** is the rules engine: pure functions with no Foundry dependency
whatsoever. Attribute derivation, the damage table, skill costs, encumbrance,
success and critical rules, active defenses, the injury pipeline, postures, and
the Size and Speed/Range table all live here. Because nothing imports a Foundry
global, the whole engine runs headlessly under Vitest — which is where the
system's correctness is actually established.

**`src/system/`** and `src/gworld.ts` are the Foundry integration layer: data
models, sheets, documents, and canvas behaviour. This layer consumes the rules
engine and never the other way around.

Every rules module cites the GURPS Lite page it implements. Where the rules are
ambiguous or where the implementation extends past what GURPS Lite prints (for
example, ST above 20 on the Damage Table), the code says so in a comment.

## Development

```bash
npm install
```

```bash
npm test
```

```bash
npm run build
```

To load the system in a local Foundry install, copy `foundry-config.example.json`
to `foundry-config.json`, point `dataPath` at your Foundry **Data** directory
(the folder containing `systems/`, `worlds/`, and `modules/`), then:

```bash
npm run dev
```

That builds and links `dist/` into `systems/gworld`. With `symlink: true` the
link is a Windows junction, so it needs no elevated privileges, and `npm run
build` alone is enough to pick up later changes.

Other scripts: `npm run watch` for a rebuilding build, `npm run typecheck`,
`npm run lint`, `npm run test:coverage`.

### Compendia

`packs-src/` holds the compendium contents as reviewable JSON, one folder per
pack. `npm run build` validates it and compiles it to the LevelDB packs Foundry
loads, then extracts them back out and fails if the document counts disagree.

The JSON is committed rather than generated at build time, because it cannot be
reproduced without the source books, which are not in this repository and cannot
be. Regenerating it needs your own PDFs and Xpdf's `pdftotext` (the flags below
are Xpdf's; poppler's `pdftotext` does not have `-simple` and lays the columns
out differently):

```bash
pdftotext -raw -enc UTF-8 -f 36 -l 170 "GURPS 4E - Basic Set - Characters.pdf" traits-raw.txt
node tools/parse-traits.mjs traits-raw.txt --write
```

```bash
pdftotext -simple -f 168 -l 230 "GURPS 4E - Basic Set - Characters.pdf" skills.txt
node tools/parse-skills.mjs skills.txt --write
```

```bash
# The melee table shares its last page with the ranged one, so trim the tail.
pdftotext -table -enc UTF-8 -f 273 -l 276 "GURPS 4E - Basic Set - Characters.pdf" melee-full.txt
sed '/Ranged Weapon Table/,$d' melee-full.txt > melee.txt

# The skill difficulties come from the skills chapter, which the table omits.
pdftotext -raw -enc UTF-8 -f 205 -l 235 "GURPS 4E - Basic Set - Characters.pdf" skills-raw.txt

node tools/parse-melee-weapons.mjs melee.txt skills-raw.txt --write
```

```bash
# Muscle-powered ranged weapons. The table ends where the hand grenades begin,
# which have neither Acc nor Range, so trim there.
pdftotext -table -enc UTF-8 -f 276 -l 279 "GURPS 4E - Basic Set - Characters.pdf" ranged-full.txt
sed -n '/^TL *Weapon *Damage *Acc/,$p' ranged-full.txt | sed '/HAND GRENADES/,$d' > ranged.txt

# A wider slice of the skills chapter: the ranged skills sit outside the melee pages.
pdftotext -raw -enc UTF-8 -f 176 -l 240 "GURPS 4E - Basic Set - Characters.pdf" skills-wide.txt

node tools/parse-ranged-weapons.mjs ranged.txt skills-wide.txt --write
```

Run the ranged step after the melee one. A hatchet appears in both tables, being
one weapon you can either swing or throw, so the ranged parser adds its throwing
mode to the item the melee parser already made rather than creating a second item
of the same name. It replaces those modes rather than appending, so re-running it
is safe.

The weapon table needs `-table` rather than `-raw` or `-simple`, because it is
genuinely tabular. It also needs the skills chapter alongside it: the table names
the skill each weapon uses but never states that skill's difficulty, and assuming
one gets Knife and Flail wrong.

```bash
# Armour: the three tables (low-tech, high/ultra-tech, and horse barding).
pdftotext -table -enc UTF-8 -f 284 -l 288 "GURPS 4E - Basic Set - Characters.pdf" armor.txt
node tools/parse-armor.mjs armor.txt --write
```

All five parsers favour precision over recall and print every rejection with its
reason. Each also writes the rejected rows beside its output so they can be
inspected: `packs-src/skills/.rejected.txt` for skills, `packs-src/traits/` for
traits, and `packs-src/equipment/.rejected.txt`, `.rejected-ranged.txt` and
`.rejected-armor.txt` for the three equipment tables, which share a folder. All
are git-ignored. Traits are read in `-raw` mode
rather than `-simple` because the reflow glues the book's trait-category symbols
onto the cost — see the comment at the top of `tools/parse-traits.mjs`.

## Requirements

- Foundry VTT v14 (verified against 14.367)
- Node.js >= 24.13.1, matching Foundry v14's own requirement

## Licensing note

GURPS is a trademark of Steve Jackson Games Incorporated. GURPS Lite is
copyright © Steve Jackson Games Incorporated and is distributed free of charge.

This repository contains an independent implementation of the game's mechanics
and is not affiliated with or endorsed by Steve Jackson Games. GURPS Lite states
that it may not be incorporated into another product for distribution, so this
system is intended for personal use and is not published as a distributable
product. Anyone using it needs their own copy of GURPS Lite.

The compendia under `packs-src/` are derived from the GURPS Basic Set, which —
unlike GURPS Lite — is a commercial product and is not free to redistribute.
They hold trait and skill names with their point costs and statistics, not the
books' descriptive text. This is a private repository for personal play by
someone who owns the books, and it should stay that way: publishing it, or
distributing the built packs, would need permission from Steve Jackson Games.
Regenerate the packs from your own copies rather than redistributing these.
