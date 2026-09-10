# GWorld — GURPS 4e for Foundry VTT

A game system implementing GURPS (4th Edition) for Foundry Virtual Tabletop v14.

It began as an implementation of [GURPS Lite](http://www.sjgames.com/gurps/lite/)
and has since been extended to the Basic Set: hit locations and their wounding
modifiers, maneuvers, techniques, split Damage Resistance, and compendia built
from the Basic Set's own tables. Rules modules cite whichever book they follow.

Built for personal use at my own table.

## What works

**Character sheet** — six tabs: attributes, skills, traits, combat, gear and
description. Attributes and secondary characteristics with their point costs,
the skill list grouped by controlling attribute with a filter, advantages and
disadvantages with the points ledger, attacks with their damage and active
defenses, encumbrance, hit locations with the DR protecting each, and conditions.

**NPC sheet** — one pane, no tabs, showing what a GM needs mid-fight.

**Item sheet** — one sheet serving all seven item types, editing every field each
type persists. A weapon's melee attack modes are edited a row at a time; a
skill's defaults and an armour's coverage and split DR likewise.

**Rolls** — attributes, skills, attacks and the three active defenses roll to
chat. The success card shows the target, the roll, and the margin, and reports
criticals by the Basic Set's table. The damage card rolls the dice, applies the
minimum-damage floor, states the wounding modifier and the injury an unarmoured
target would take, and names the armour divisor when there is one.

**Compendia** — extracted from the Basic Set, names and statistics only:

| pack | contents |
| --- | --- |
| GURPS Advantages & Disadvantages | 385 traits (212 advantages, 173 disadvantages) |
| GURPS Skills | 163 skills with attribute, difficulty and defaults |
| GURPS Equipment | 161 items — 87 armours, 51 melee weapons carrying 90 attack modes, and 25 ranged modes across bows, crossbows, slings and thrown weapons |

A weapon that appears in both weapon tables is one item with both kinds of
attack: a hatchet swings under Axe/Mace and throws under Thrown Weapon. Armour
written "4/2" carries both figures and the damage each applies to, so mail turns
a blade at DR 4 and a mace at DR 2.

## What is not implemented

- **Damage is not applied to targets.** The damage card gives the GM the numbers
  and says what to subtract; nothing reads a target's DR automatically.
- **No defense prompts.** An attack does not ask the defender to roll.
- **No character builder.** Characters are assembled by dragging from the
  compendia and editing the sheet.
- **Initiative is Basic Speed**, but no Combat subclass enforces the ordering.
- **Firearms and hand grenades** are not extracted. Both have their own column
  layouts, unlike the tables that are.
- Some statistics are recorded but not yet read by the rules engine:
  `unbalanced` and `isFencing` on a melee mode, `bulk` on a ranged one. Each is
  documented against the page that defines it, so the rule is available when the
  defence and firing code grows to use it.
- Traits the book prices only through a table in another chapter — Wealth,
  Status, Rank, Reputation — have no cost line to extract and are absent.
  `reactionModifier` is zero on every trait, because the book states reaction
  modifiers in prose that is conditional or per-level, and a flat integer would
  fire in the wrong circumstances.

## Architecture

The system is split into two layers, and the dependency only ever points one way.

**`src/rules/`** is the rules engine: pure functions with no Foundry dependency
whatsoever. Attribute derivation, the damage table, skill and technique costs,
encumbrance, success and critical rules, active defenses, the injury pipeline,
hit locations and their wounding modifiers, maneuvers, postures, armour DR, and
the Size and Speed/Range table all live here. Because nothing imports a Foundry
global, the whole engine runs headlessly under Vitest — which is where the
system's correctness is actually established. 277 tests at present.

**`src/system/`** and `src/gworld.ts` are the Foundry integration layer: data
models, sheets, chat cards, and document registration. This layer consumes the
rules engine and never the other way around.

Every rules module cites the page it implements. Where the rules are ambiguous,
or where the implementation extends past what a book prints (ST above 20 on the
Damage Table, say), the code says so in a comment.

Foundry ships no official TypeScript types, so `src/system/foundry.d.ts` declares
only the surface this system actually touches, verified against the v14 client
source. Anything undeclared is deliberately absent, so reaching for an unverified
API is a compile error rather than a runtime one.

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
`npm run lint`, `npm run test:coverage`, `npm run validate:packs`.

## Compendia

`packs-src/` holds the compendium contents as reviewable JSON, one folder per
pack. `npm run build` validates it and compiles it to the LevelDB packs Foundry
loads, then extracts them back out and fails if the document counts disagree.

The JSON is committed rather than generated at build time, because it cannot be
reproduced without the source books, which are not in this repository and cannot
be. Regenerating it needs your own PDFs and Xpdf's `pdftotext` — the flags below
are Xpdf's, and poppler's `pdftotext` has no `-simple` and lays the columns out
differently.

Each parser reads the extraction mode that suits its source, and the choice
matters more than it sounds:

| source | mode | why |
| --- | --- | --- |
| Skills | `-simple` | reflows the columns into reading order |
| Traits | `-raw` | `-simple` glues the trait-category symbols onto the cost, so a 15-point advantage reads as 215 |
| Weapons, armour | `-table` | genuinely tabular; column positions differ per group, so fields are matched by shape |

### Traits

```bash
pdftotext -raw -enc UTF-8 -f 36 -l 170 "GURPS 4E - Basic Set - Characters.pdf" traits-raw.txt
node tools/parse-traits.mjs traits-raw.txt --write
```

### Skills

```bash
pdftotext -simple -f 168 -l 230 "GURPS 4E - Basic Set - Characters.pdf" skills.txt
node tools/parse-skills.mjs skills.txt --write
```

### Melee weapons

```bash
# The melee table shares its last page with the ranged one, so trim the tail.
pdftotext -table -enc UTF-8 -f 273 -l 276 "GURPS 4E - Basic Set - Characters.pdf" melee-full.txt
sed '/Ranged Weapon Table/,$d' melee-full.txt > melee.txt

# The skill difficulties come from the skills chapter, which the table omits.
pdftotext -raw -enc UTF-8 -f 205 -l 235 "GURPS 4E - Basic Set - Characters.pdf" skills-raw.txt

node tools/parse-melee-weapons.mjs melee.txt skills-raw.txt --write
```

The table names the skill each weapon uses but never states that skill's
difficulty, so the skills chapter is read alongside it; assuming a difficulty
gets Knife and Flail wrong.

### Ranged weapons

```bash
# Muscle-powered only. The table ends where the hand grenades begin,
# which have neither Acc nor Range, so trim there.
pdftotext -table -enc UTF-8 -f 276 -l 279 "GURPS 4E - Basic Set - Characters.pdf" ranged-full.txt
sed -n '/^TL *Weapon *Damage *Acc/,$p' ranged-full.txt | sed '/HAND GRENADES/,$d' > ranged.txt

# A wider slice of the skills chapter: the ranged skills sit outside the melee pages.
pdftotext -raw -enc UTF-8 -f 176 -l 240 "GURPS 4E - Basic Set - Characters.pdf" skills-wide.txt

node tools/parse-ranged-weapons.mjs ranged.txt skills-wide.txt --write
```

**Run the ranged step after the melee one.** A hatchet appears in both tables,
being one weapon you can either swing or throw, so the ranged parser adds its
throwing mode to the item the melee parser already made rather than creating a
second item of the same name. It replaces those modes rather than appending, so
re-running it is safe.

### Armour

```bash
# The three tables: low-tech, high/ultra-tech, and horse barding.
pdftotext -table -enc UTF-8 -f 284 -l 288 "GURPS 4E - Basic Set - Characters.pdf" armor.txt
node tools/parse-armor.mjs armor.txt --write
```

Armour written "4/2" carries both figures, along with the damage types the lower
one applies to. Which those are depends on the table: the low-tech and barding
footnote says the lower DR is used against crushing, while the high- and
ultra-tech one says the higher is used against piercing and cutting and the lower
against everything else. The two agree wherever they overlap, so the applicable
types are recorded per piece rather than inferred from a flag. A test compares
the parser's mapping against the rules engine's, because a comment saying they
match would not keep them matching.

### Rejections

All five parsers favour precision over recall: a row that fails to parse is a
gap, but a misread row is a wrong statistic at the table, which is worse. Each
prints every rejection with its reason and writes the rejected rows beside its
output, all git-ignored:

- `packs-src/skills/.rejected.txt`
- `packs-src/traits/.rejected.txt`
- `packs-src/equipment/.rejected.txt`, `.rejected-ranged.txt`, `.rejected-armor.txt`

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
product. Anyone using it needs their own copy of the rules.

The compendia under `packs-src/` are derived from the GURPS Basic Set, which —
unlike GURPS Lite — is a commercial product and is not free to redistribute.
They hold trait, skill and equipment names with their point costs and statistics,
and deliberately **not** the books' descriptive text. This is a private
repository for personal play by someone who owns the books, and it should stay
that way: publishing it, or distributing the built packs, would need permission
from Steve Jackson Games. Regenerate the packs from your own copies rather than
redistributing these.
