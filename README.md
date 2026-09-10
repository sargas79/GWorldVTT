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

**Building a character** — two ways in, and they edit the same sheet. Each of
the Skills, Traits and Gear tabs has a Browse button that opens a searchable
list of everything in the compendia, filtered to that tab, with every row
saying what the entry is — a skill's attribute and difficulty, a trait's cost
or its cost table, armour's DR. And a **Guided build** walks the whole thing in
order — points, attributes, advantages, disadvantages, skills, gear — with the
points ledger and the disadvantage limit in view at every step.

The guided build edits the actor as it goes rather than staging changes, so
going back a step shows what is really there and closing half-way leaves a
half-built character rather than losing the work. Spending past the budget is
flagged, never blocked: a GM may allow it, and a character part-way through
being built is over and under by turns.

**Item sheet** — one sheet serving all seven item types, editing every field each
type persists. A weapon's melee attack modes are edited a row at a time; a
skill's defaults and an armour's coverage and split DR likewise.

**Rolls** — attributes, skills, attacks and the three active defenses roll to
chat. The success card shows the target, the roll, and the margin, and reports
criticals by the Basic Set's table. The damage card rolls the dice, applies the
minimum-damage floor, states the wounding modifier and the injury an unarmoured
target would take, and names the armour divisor when there is one.

**Ranged attacks** — firing asks how far the target is, how fast it is moving,
how big it is, how many shots to fire, and whether the shot was aimed. It rolls
with the speed/range penalty from the Size and Speed/Range Table, the target's
Size Modifier, the weapon's Accuracy for an aimed shot, and the bonus for
firing a burst. The card shows each as its own line rather than one opaque
number.

An explosion states how far its collateral damage reaches — twice its dice in
yards — and how far its fragments are thrown. Applying it asks how far the
victim stood from the blast: at zero they were struck directly and take the
listed damage, and further out it is divided by three times the distance,
resolved against their torso armour, with the attack's armour divisor dropped.

A burst reports how many of its shots hit: one for the success itself, and one
more for every full multiple of the weapon's Recoil the roll beat its target
by, never more than were fired.

**Turn order** — everyone acts in order of Basic Speed, highest first, and that
order holds for the whole fight. Ties break on DX, which matters more than it
sounds: Basic Speed comes in quarter-point steps, so a party of four will
routinely have two people on 5.00.

**Defending** — an attack that connects records who it was aimed at, and its
card offers each defender their available active defenses with the score for
each. Only defenders you can roll for are shown, and a defense the character
does not have — no shield to block with, a maneuver that forfeits it — is left
out rather than offered as a button that refuses. Every defense may be made
with a retreat, worth +3 to a Dodge, +1 to most parries and blocks, and +3
again to a parry with Boxing, Judo, Karate or a fencing weapon.

**Two combat systems**, chosen by the GM in the world settings. *Basic combat*
is the abstract one: everyone can reach everyone and nobody has a back.
*Tactical combat* is fought on a hex map, and facing decides what a defender
can do about an attack:

- An attack from a side hex is defended at -2, unless the defender has
  Peripheral Vision or 360° Vision. A shield only blocks from the shield side,
  and a one-handed weapon only parries on the side it is held — no advantage
  waives the first, and only Double-Jointed waives the second.
- An attack from behind cannot be defended at all without Peripheral Vision
  (-2) or 360° Vision (no penalty), and even then a block is impossible and a
  parry is at a further -2.
- The Combat tab gains a movement panel: movement points after encumbrance, and
  what a hex costs forward, sideways and backward in the character's current
  posture.

Tactical combat needs a hex-gridded scene. On a square or gridless one the
table falls back to basic combat rather than inventing arcs, because facing is
defined by the six hexes around you and there are none.

**Applying damage** — the damage card carries a hit location and an Apply
button. It resolves the blow against whoever is targeted, or selected if
nothing is targeted: the DR that actually applies to that damage at that
location, the armour divisor, the wounding modifier, and the crippling cap on a
limb. It writes the new total to HP, or to FP for fatigue, and reports what the
GM has to act on next — shock, a major wound, a consciousness roll and its
penalty, a death check.

DR is resolved against the damage being applied rather than the figure the
sheet shows. The sheet leads with each location's highest band, which is what a
player wants to read, but mail is DR 4 against a blade and DR 2 against a mace,
and applying the headline would stop a mace with the DR that stops a sword.

**Compendia** — extracted from the Basic Set, names and statistics only:

| pack | contents |
| --- | --- |
| GURPS Advantages & Disadvantages | 641 traits, each with its cost, level cap and the book's name for each level |
| GURPS Skills | 630 skills with attribute, difficulty and defaults, and 35 techniques |
| GURPS Equipment | 463 items — 153 armours, 18 shields (16 of which can be bashed with), and 292 pieces of gear of which 137 carry attack modes |

A weapon that appears in both weapon tables is one item with both kinds of
attack: a hatchet swings under Axe/Mace and throws under Thrown Weapon. Armour
written "4/2" carries both figures and the damage each applies to, so mail turns
a blade at DR 4 and a mace at DR 2. A bow's damage and range come off the bow's
own ST rather than the archer's, and are recorded that way.

A few dozen traits are priced from a table rather than at a flat rate per level,
and those carry the table: Wealth runs 10/20/30/50/75 and Appearance
4/12/12/16/16/20, which no per-level figure reproduces. Each level keeps the
book's name for it, so the sheet can say "Filthy Rich" rather than "Wealth 4".

## What is not implemented

- **Affliction damage.** The damage model has no way to say "HT-4 aff", so a
  few beam weapons and the linked mode of some grenades are rejected on the way
  out, listed by name in the rejections file. So are attacks whose damage
  carries a multiplier, such as "6dx10": the dice model holds dice and a
  modifier and not a factor.
- **Unarmed attacks and mounted charges.** A punch does damage that depends on
  whether the character knows Boxing or Karate, and a lance's depends on the
  mount's ST and Move. Those are recorded from the book's own table in
  `packs-src/equipment/table-only-weapons.json` rather than derived.
- **Tactical combat is facing and movement, not the whole chapter.** Close
  combat, evading, slams, Deceptive Attack, Rapid Strike and opportunity fire
  are not implemented, and movement is costed rather than enforced — the panel
  says what a hex costs, and nothing stops a token being dragged further than
  its Move.
- `bulk` on a ranged mode is recorded but not read. It is documented against
  the page that defines it.
- `reactionModifier` is zero on every trait, because the book states reaction
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
system's correctness is actually established. `npm test` reports the count; it is
deliberately not repeated here, where it would go stale the moment a test lands.

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
be.

### From a GCA data file

The packs are built from the data file GURPS Character Assistant 5 ships for the
Basic Set, which states the same books as structured records rather than as a
typeset page:

```bash
node tools/parse-gdf.mjs "GURPS Basic Set 4th Ed.--Characters.gdf" --write
```

That writes every pack in one pass and prints what it could not use. It reads
statistics only: `tools/gdf.mjs` drops `description(...)` and the other prose
fields as it parses, so the books' text cannot reach a compendium by accident.

Reading the data file rather than the page fixes things a column reflow could
not. The PDF pass read the heading "Acute Senses" and missed the four traits
under it. It could not see a cost the trait's own entry never prints, which is
every trait the book prices from a table. It had no way to reach skill defaults,
techniques, or firearms.

Two entries are kept by hand rather than derived, because GCA computes them from
the character sheet and nothing here can evaluate that: unarmed attacks, whose
damage depends on whether you know Boxing or Karate, and the lance, whose damage
depends on the mount. Those are in
`packs-src/equipment/table-only-weapons.json`, taken from the book's own table.

### The route this replaced

The packs were first extracted from the books' own PDFs with Xpdf's
`pdftotext`, one parser per table. Those parsers are gone: they wrote to the
same files the GCA parser now writes, so keeping them meant keeping a way to
silently replace good data with less of it.

The one thing worth carrying forward is that the extraction mode mattered more
than it sounds. `-simple` reflows columns into reading order, which the skills
chapter needs and the trait chapter cannot survive: it glues the trait-category
symbols onto the cost, so a 15-point advantage reads as 215. `-raw` keeps the
line breaks, which is what the traits need. `-table` suits the weapon and
armour tables, whose column positions differ per group, so fields have to be
matched by shape rather than by position. And poppler's `pdftotext` is a
different program with different flags; none of that applies to it.

### Rejections

The parser favours precision over recall: a record that fails to parse is a
gap, but a misread one is a wrong statistic at the table, which is worse. It
prints every rejection with a reason and writes them beside its output, in
`packs-src/{skills,traits,equipment}/.rejected-gdf.txt` — git-ignored, since
they are derived from the books.

Those files also list what was imported but could not be fully recorded: armour
marked flexible or fine, a boot whose sole is tougher than its upper, a shield's
bash attack. Recording the loss is the point — a statistic dropped in silence is
one nobody knows to go and look up.

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
