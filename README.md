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

**Spending points** — a skill's points and a levelled trait's levels are edited
where they are read: in the table on the sheet, and beside each entry in the
guided build. Both show what the spending bought, so a skill says the level its
points reach rather than repeating the points back. A trait with a flat cost
gets no levels field, since there is nothing to buy.

Each has a pair of steppers. A skill's walk the Skill Cost Table — 1, 2, 4, 8,
then four at a time — because the totals in between buy nothing at all, and a
stepper that added one would spend a character point for no change to the level
three times out of four. A trait's move a level at a time, since every level of
a trait buys something, and stop at the cap the book prints or the last step its
cost table prices.

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

**Criticals do something in particular.** A critical miss is rolled on the table
as the attack is: an armed one may break the weapon, turn it in your hand or put
you on the ground, and a punch or a kick reads the unarmed table instead. A
critical hit is rolled when the damage is applied, where the hit location
decides which table — a blow to the face, skull or eye reads the far nastier
head blow table — and where the target's DR is known, since half of the results
change it. The blow may be doubled, tripled or maximised, DR may be halved or
ignored, anything that penetrates may count as a major wound, and shock may be
doubled past its usual floor. In every case the target gets no active defense at
all, and the defense card says so rather than offering three buttons.

**Contests** — a Quick Contest is one roll each. A Regular Contest is arm
wrestling: both sides roll again and again, and nothing is settled while both
succeed or both fail. Extreme scores are balanced first, because two contestants
at 5 spend a dozen exchanges failing together and two at 17 spend a dozen
succeeding together; the card shows what was rolled at and what it started as.

**Fright Checks** — a Will roll capped at 13 by the Rule of 14, so a 14 always
fails however steady you are. Failing rolls 3d plus the margin on a table that
runs from a second of stunning to a coma and a permanent point of IQ. What the
situation is worth is asked rather than derived: how grisly, how close, how dark
and how alone is a judgement about a particular horrible thing.

**Close combat** — a condition for sharing a hex with someone. Only a weapon
that reaches close can be used there, so a broadsword shows a dash instead of a
roll and stops offering its parry, and a ranged weapon takes its Bulk in place
of the speed/range penalty.

**Waiting and opportunity fire** — a Wait records what you are watching for and
what you will do, because a Wait only works if both are declared in advance.
With a ready ranged weapon it also records the ground you are covering, and the
shot pays for it when it comes: nothing for a single hex, up to -5 for eleven
or more, or a flat -2 for a line. Covering more than one hex forfeits Accuracy,
since Aim is what holding still on one spot buys.

**Afflictions** — an attack written "HT-4 aff" does no damage: clicking it
rolls the resistance for everyone it is being used on, one roll each. What
failing does is in the weapon's own notes, which the compendia do not carry, so
that stays with the GM.

**Attack options** — shift-clicking a melee attack asks what it is trading:
a Deceptive Attack buys a penalty to the foe's defenses at two points of your
own skill each, never taking you below 10, and a Rapid Strike buys a second
attack at -6 to both. A deceptive attack's penalty travels with it and lands on
the defender's card.

**Feint** — a button beside each melee attack fakes it. The foe defends with
their best of their weapon skills, DX, or Cloak or Shield, and the card says
which. It is not quite a Quick Contest: a feinter who fails their own roll gains
nothing however badly the foe rolls, and when the foe fails, the penalty is the
feinter's own margin rather than the two added together. What it buys is
remembered on the attacker and spent by their next attack — a feint is good for
one second, and a fight that moves on without that attack leaves it behind.

**Extra effort** — fatigue for something you could not otherwise do. In combat
there is no roll at all: a point buys +2 on one defense, or halves the Rapid
Strike penalty, or adds an All-Out Attack (Strong)'s damage without giving up
your defenses. Out of combat it is a Will roll at -1 per 5% asked, worse for
every FP already spent and better by five for someone frightened, angry or
protecting someone; it costs the point whether it works or not, except on a
critical success, which is free, and a critical failure, which costs hit points
and fails outright.

**Ranged attacks** — firing asks how far the target is, how fast it is moving,
how big it is, how many shots to fire, whether the shot was aimed, and whether
it is an ordinary shot, a Move and Attack or fired in close combat. The last
decides the weapon's Bulk: the worse of -2 and Bulk on the move, which also
forfeits Accuracy, and Bulk in place of the speed/range penalty in close
combat. It rolls
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
- The Combat tab gains a movement panel: movement points after encumbrance,
  what a hex costs forward, sideways and backward in the character's current
  posture, and Slam and Evade buttons. Anyone can run into someone, and what
  that does depends entirely on how fast they were going; evading is a Quick
  Contest of DX, easier past someone kneeling or lying and easier still from a
  side or from behind.

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

**Knockback** is reported with the injury: a yard per full multiple of the
target's ST-2, worked out from damage before DR, and a penalty to stay standing
of one per yard after the first. A crushing blow shoves whether or not it gets
through, which is most of the point of the rule; a cut only shoves when the
armour stopped it, because a cut that gets through wounds instead.

**Physical feats** — what a body can do falls out of ST, Basic Lift and Move, so
the attributes tab shows it: how far it jumps standing and running, what it can
lift in one hand and two, shove, carry and shift where it stands, and how fast
it sprints and swims. Three of them have buttons. Climbing takes its modifier
and both speeds from what is being climbed, with encumbrance off the top, and a
ladder says it needs no roll rather than rolling one. Swimming is +3 for having
meant to be in the water and -2 per level of encumbrance. Throwing is not a roll
at all but the weight-ratio table: how far in yards, and thrust damage adjusted
for weight, with anything past a two-handed lift refused.

**Compendia** — extracted from the Basic Set, names and statistics only:

| pack | contents |
| --- | --- |
| GURPS Advantages | 329 advantages and perks, each with its cost, level cap and the book's name for each level |
| GURPS Disadvantages | 312 disadvantages and quirks |
| GURPS Skills | 630 skills with attribute, difficulty and defaults, and 35 techniques |
| GURPS Equipment | 463 items — 153 armours, 18 shields (16 of which can be bashed with), and 292 pieces of gear of which 137 carry attack modes |

A weapon that appears in both weapon tables is one item with both kinds of
attack: a hatchet swings under Axe/Mace and throws under Thrown Weapon. Armour
written "4/2" carries both figures and the damage each applies to, so mail turns
a blade at DR 4 and a mace at DR 2. A bow's damage and range come off the bow's
own ST rather than the archer's, and are recorded that way.

Advantages and disadvantages are separate compendia. They are one item type
and one body of records in the source, but a list of 641 with the two
interleaved is not a list anyone can choose from: you go looking for something
to spend points on and half of what you scroll past charges you nothing. The
picker filters by category too, so browsing from under Disadvantages offers
only those.

A few dozen traits are priced from a table rather than at a flat rate per level,
and those carry the table: Wealth runs 10/20/30/50/75 and Appearance
4/12/12/16/16/20, which no per-level figure reproduces. Each level keeps the
book's name for it, so the sheet can say "Filthy Rich" rather than "Wealth 4".

## Which rules are in play

GURPS is written to be played at several depths, and the GM chooses how much of
it this table is using: **Configure Settings → GURPS rules in play** lists every
optional rule with the page that defines it and a switch. A rule that is off
behaves as though it had never been written — no penalty applied, no control
shown, nothing to explain.

Every rule the page lists is built and can be switched on. A rule added to the
catalogue before it is wired up is listed greyed out and cannot be switched on,
because switching it on would do nothing — that is what the page's own
`implemented` flag is for, and nothing is carrying it at the moment.

The spine is never optional: success rolls, damage, DR and the three active
defenses are always in play.

## What is not implemented

- **A Wait does not fire itself.** The trigger is written down and the penalty
  is applied when the shot is taken, but nothing watches the map and shoots on
  your behalf. The book does not ask for that either — "you can attack at any
  time" is addressed to a player, not to a machine — so what is missing is
  automation rather than a rule.
- **Unarmed attacks and mounted charges.** A punch does damage that depends on
  whether the character knows Boxing or Karate, and a lance's depends on the
  mount's ST and Move. Those are recorded from the book's own table in
  `packs-src/equipment/table-only-weapons.json` rather than derived.
- **Movement is costed, not enforced.** The panel says what a hex costs;
  nothing stops a token being dragged further than its Move. A hard limit would
  be wrong more often than right — obstructions, bad footing and evading are
  all the GM's call, and a token that cannot be moved is worse than one moved
  too far.
- `reactionModifier` is zero on every trait, because the book states reaction
  modifiers in prose that is conditional or per-level, and a flat integer would
  fire in the wrong circumstances.
- **Advantages that change what a body can do.** Enhanced Move and Super Jump
  multiply jumping distances, Amphibious and Aquatic change water Move, and
  Unfazeable exempts its owner from Fright Checks entirely. The compendium
  carries all of them; the feats read only ST, Basic Lift and Move.
- **Fatigue below zero.** Extra effort refuses when the FP is not there. GURPS
  allows it at the price of hit points and a HT roll to do anything at all
  (p. 426), which this system does not yet run, so it says no rather than
  leaving a character somewhere it cannot look after them.

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
