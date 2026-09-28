# GURPS Basic Set, Fourth Edition Revised: update plan

**Status: proposed, awaiting approval. Nothing is implemented.** Written
2026-09-28 against `main` at v1.63.0 (`e7e0fd2`). The issues this plan names
are filed: #900-#924 in this repository, listed by phase in the tracking issue
#925; and sargas79/gurps-compendium-content#579-#583, listed in its tracking
issue #584.

- [What the Revised edition is](#what-the-revised-edition-is)
- [How the review was done](#how-the-review-was-done)
- [Decisions to approve](#decisions-to-approve)
- [Phase 0: the retained pages](#phase-0-the-retained-pages)
- [Phase 1: Addendum 1, traits and techniques](#phase-1-addendum-1-traits-and-techniques)
- [Phase 2: Addendum 2, organizations and gear](#phase-2-addendum-2-organizations-and-gear)
- [Phase 3: Addendum 3, hit locations](#phase-3-addendum-3-hit-locations)
- [Phase 4: Addendum 4, tasks and combat](#phase-4-addendum-4-tasks-and-combat)
- [The add-on's part](#the-add-ons-part)
- [Order of work and releases](#order-of-work-and-releases)
- [Deliberately left out](#deliberately-left-out)

## What the Revised edition is

The publisher's preface (pp. 1-2) states the scope, and the review confirmed it:

- **One volume, same pages.** _Characters_ (pp. 5-323, 335-336) and _Campaigns_
  (pp. 343-565, 567-569) are merged, and every heading sits on the page it had
  in the two-book set. Existing citations (`Characters p. 154`,
  `Campaigns p. 378`, `p. 378`) stay correct. Front matter is pp. i-viii; the
  book runs pp. 1-584; the PDF page of printed page _p_ is _p_ + 10.
- **Removed:** Combat Lite (pp. 324-328), the second index (pp. 329-334), the
  _Campaigns_ front matter (pp. 337-342), the Ludography (p. 566), the old
  index (pp. 570-576). Nothing the system implements lived there.
- **New (27 pages of addenda, curated from later supplements and Pyramid):**
  - pp. 1-4, a preface (no rules);
  - pp. 324-334, _Addendum 1_: alternative abilities, new Talents, advantages,
    perks, modifiers, power modifiers, wildcard bonuses, techniques;
  - pp. 337-342, _Addendum 2_: Pulling Rank (assistance rolls), skills' first
    TL, cost factors for equipment modifiers, flat-cost Signature Gear;
  - p. 566, _Addendum 3_: the missing hit locations;
  - pp. 570-578, _Addendum 4_: task and feat rules, Stress and Derangement,
    terrain, illumination and vision, more maneuvers, ranged options,
    simplified range and resources, Basic Abstract Difficulty, batteries.
- **Changed on retained pages:** trivial edits ("see p." to "p.", "Hit Points"
  to "HP"), "damage" made "injury" where a rule reads the figure after DR and
  wounding, errata and FAQ answers folded in, inclusive-language rewrites
  (Slave Mentality is renamed Heteronomy and moves to p. 138), pointers to the
  addenda and to other books. Every reference table in chapters 19-21 was
  checked value by value and is unchanged.

There is no GCA data file for the Revised edition (`E:\data files` holds only
the _Characters_ and _Lite_ files), so the addenda's records are written by
hand, or taken from the supplements' data files the add-on already parses and
re-cited.

## How the review was done

The three PDFs were extracted with `pdftotext -raw -enc UTF-8` (the default
Latin-1 output drops every minus sign, and the default layout mode interleaves
the Revised edition's two columns). Each retained page was compared with its
old self by word 4-grams, which ignores the column re-flow; the 546 pages'
diffs were then read in eight ranges and every substantive change recorded
with the code or record that implements the rule, and the add-on file that
carries the old prose. The four addenda were read in full and every rule
mapped to the system, to the add-on, or to nothing. The extracted text and the
per-page diff live in this session's scratchpad, not in the repository; the
recipe above reproduces them in a few minutes.

## Decisions to approve

**D1. The addenda are Basic Set content, so they go in the system.** CLAUDE.md
says the system implements the Basic Set. Fourteen of the addenda's rules are
already implemented in the add-on under _Martial Arts_, _High-Tech_ or
_Monster Hunters 1_ switches (the finer hit locations, four extra-effort
options, Committed and Defensive Attack, evasive movement, Prediction Shot,
Ranged Feint, Ranged Rapid Strike, frostbite, partial armour coverage,
batteries, the gadget fields). Recommended: the system implements them as the
Revised edition writes them (which sometimes differs from the supplement, e.g.
Heroic Archer's -3/-1 against Martial Arts' -6/-3/-1), and the add-on retires
its copies once the system release ships, keeping only what the supplement adds
beyond the Basic Set. The alternative, leaving them in the add-on, would make
the system's Basic Set incomplete and the add-on's rules not book-neutral.

**D2. Citations.** Retained pages keep their existing forms. Text that exists
only in the Revised edition cites `Basic Set Revised p. N` (the addenda pages
held other content before, so the edition must be named). The book-neutral
check accepts the form already; README and `docs/api.md` gain one line saying
so.

**D3. Errata folded into retained pages become the rule, not a switch.** Where
the Revised text corrects a rule the system implements (the grappling ST
boundary, RoF 16 in Spraying Fire, explosion DR, Agony under High Pain
Threshold, the feint with an unbalanced weapon, the slam's skill bonus, the
firearm explosion, silver pricing, the "suck the wound" treatment), the code
follows the Revised text with no switch: the publisher calls these
corrections. Addenda rules stay switchable, off by default where the text says
"optional" and on where it presents an answer to a FAQ. Two addenda rules
replace a Basic Set figure (Giant Step limited to Attack and Defensive Attack;
marching 4-6 x Move miles a day instead of 10 x Move) and are offered as
switches, off by default.

**D4. Heteronomy.** Rename the record, the template entry, the lang key and the
trait-effects key; a migration renames the trait on existing actors and
imports, and the old name stays recognised on import. The three level names
"Crippling" (Shyness, Flashbacks, Neurological Disorder) become "Overwhelming"
the same way.

**D5. Order and releases.** Five system phases, each its own minor release,
with the add-on's tooling and prose work running alongside from phase 0. The
add-on retires each moved rule in the release that pins the system version
carrying it.

## Phase 0: the retained pages

What the review found that the system gets wrong against the Revised text, or
names differently. Seven issues.

| Issue                                                                      | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Where                                                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename Slave Mentality to Heteronomy; "Crippling" levels to "Overwhelming" | record, template, lang, `trait-effects.ts`, `reactions.ts`, migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `packs-src/disadvantages`, `packs-src/templates`, `src/rules/trait-effects.ts:409`, `src/rules/reactions.ts:220`, `src/system/reactions.ts:170`, `lang/en.json:4730` |
| Records the retained pages change                                          | Ultrasonic Speech "0 or 10"; Armor spell loses Magery 2 (table still says Magery 2: follow the entry); Wizard template's Thaumatology at IQ [2]-13; Chimpanzee and Gorilla traits (Arm ST 3, Ham-Fisted 1, Semi-Upright, no Bad Grip); Strix Air Move 13; Rattlesnake note drops "+1 if sucked out"; Pressure Points' default at the GM's option; Weird Science marked cinematic; Absolute Direction M/P; Extra Attack hint (extra attacks only on a maneuver that attacks; Aim and Ready need Altered Time Rate); Gunslinger's record text                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `packs-src/*`, `lang/en.json:3686`                                                                                                                                   |
| Combat corrections                                                         | grappling a foe of 2 x ST or more (`grappling.ts:34`); Spraying Fire loses two shots per yard at RoF 16+ (`ranged.ts:308`, lang); explosion DR through Large-Area Injury (`chat.ts:466`, `large-area.ts:30`); a Feint with an unbalanced weapon forbids parrying with it (`defenses.ts:207`); a slam adds the attacker's Brawling or Sumo bonus and the foe gets none (`slam.ts:223`); every TL3-4 firearm may explode, grenades and warhead weapons do their own damage instead (`malfunctions.ts:125`); a swing/impaling weapon that injures neither attacks again nor parries this turn (`picks.ts`); a fencing weapon usable with a non-fencing skill parries flails at -4 (`defenses.ts:85`); electrical damage ignites (`chat.ts:627`); flyers and swimmers pay 1 point a yard vertically, 1.5 diagonally, nothing for posture or footing (`tactical.ts:255`); Acc plus targeting-system bonuses capped at twice base Acc (new cap, `accessories.ts`); Bulletproof Nudity loses the topless +1 (`cinematic.ts:156`) | `src/rules`, `src/system`                                                                                                                                            |
| Injury, affliction and hazard corrections                                  | poison's "suck the wound" treatment removed (`poison.ts:101`, lang); Follow-Up poison on cutting weapons too (`poison.ts:23`); Agony under High Pain Threshold is -3 to DX, IQ, skill and self-control, FP still lost (`afflictions.ts:185`); Doesn't Sleep cannot be put to sleep (`sleep.ts:27`); Hard to Subdue covers sleep and any hostile ability (`trait-effects.ts:379`); Surge: over 1/3 HP forces an HT roll, disabled for margin seconds, critical failure until repaired (`surge.ts:21`); Side Effect reads injury, not penetrating damage; Resistant covers Malediction; Supernatural Durability below 0 HP halves Dodge; Weakness "per attack" interval (`weakness.ts:17`); Pharmacy (Herbal) and Esoteric Medicine stand in for Physician (`recovery.ts:510`); Multimillionaire capped by a GM setting (`wealth.ts:57`); disadvantage-limit hint reads -50 points (lang 1707); Complexity era text                                                                                                         | `src/rules`, `src/system`, `lang`                                                                                                                                    |
| Gunslinger as the Revised edition writes it (p. 58)                        | The system has the record and no rule. Revised p. 58 lists: Acc without Aim (full for one-handed RoF 1-3, half otherwise); ignore Move and Attack, stunt, driving, pop-up and close-combat Bulk penalties instead of adding Acc; weapon skill when mounted; halved default penalties for faster-shooting techniques and Fast-Draw (Ammo); cinematic traits with firearms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `src/rules/attack-options.ts`, `src/rules/aim.ts`, `src/system/roll.ts`                                                                                              |
| Complementary Skills and Team Efforts (pp. 185, 206)                       | Two new boxes on retained pages. Complementary: a prior roll gives +2/+1/-1/-2 by margin, no chaining, +4 cap on long tasks. Team Efforts: one roll at the best member's skill, +1 per member with a point, minus group size. Pulling Rank depends on the first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `src/rules/success.ts`, roll dialog, Party sheet                                                                                                                     |
| Cite the edition                                                           | README, `docs/api.md`, `tools/check-book-neutral.mjs` comment; the convention in D2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | docs                                                                                                                                                                 |

## Phase 1: Addendum 1, traits and techniques

| Issue                                                                                         | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Size         |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| New Talents and cinematic advantages (pp. 325-327)                                            | Nine Talents (Born Entertainer, Born to be Wired, Born War-Leader, Circuit Sense, Craftiness, Driver's Reflexes, Natural Athlete, Natural Scientist, Social Scientist, Street-Smart) as records with `talentSkills`, plus their reaction groups in `social.ts` `TALENT_REACTION`; Universal Translator, Omnilingual, Xeno-Omnilingual; Foresight (per-session uses); Jack of All Trades (+level to attribute defaults, `skills.ts`); Impulse Points (a pool that pays Buying Success, Player Guidance, Flesh Wounds first); Injury Tolerance (Damage Reduction) (divisor after wounding, min 1, in `injury-tolerance.ts` and `damage.ts`); Heroic Archer (ready-and-shoot at -3/-1, Acc without Aim, Bulk waiver; cinematic switch) | medium       |
| Energy Reserve (p. 326)                                                                       | A pool per origin on the character, paying FP costs of that origin's abilities, spells and extra effort; 1 per 10 minutes regardless of rest; hostile same-origin drains; Slow Recharge and Special Recharge limitations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | medium-large |
| New perks (pp. 328-329)                                                                       | Records for Alternative Feints, Classic Features, Controllable Disadvantage, Cutting-Edge Training, Dabbler, Equipment Bond, Improvised Weapons, the six Influence Shticks, No Nuisance Rolls, Off-Hand Training, Citizenship, Courtesy Title, License, Office, Permit, Strongbow, the five Unusual Background perks, Weapon Bond. Code where the perk changes a number: Weapon Bond and Equipment Bond (+1 with one item), Off-Hand Training (waives the off-hand -4 for one skill; retires the technique), Improvised Weapons (waives the p. 404 penalty), Dabbler and Cutting-Edge Training (default and TL overrides), Strongbow (bow ST)                                                                                       | medium       |
| New enhancements, limitations and power modifiers (pp. 329-332)                               | Records: Affects Others, Costs Hit Points, Fixed Duration, Game Time, Hard to Use, Maximum Duration, Minimum Duration, Reduced Duration, Reliable, Requires (Attribute/Skill/Active Defense) Roll, Switchable, and the eleven power modifiers (Biological, Chi, Cosmic, Divine, Magical, Moral, Nature, Psionic, Spirit, Super, Superscience). Code: activation-roll modifiers (Hard to Use, Reliable, Requires Roll), duration changes (`afflictions.ts`), Costs Hit Points paid where Costs Fatigue is, power modifiers recognised by `powers.ts`; Self-Control "N/A" at x2.5 (`traits.ts:71`, item schema, sheet). Either/Or limitations and limitations on disadvantages: text                                                  | medium       |
| Alternative Abilities, Character Point-Powered Abilities, wildcard bonuses (pp. 324-325, 333) | A slot/group on traits pricing the cheaper members at 1/5 and a Ready to swap; a "point-powered" flag pricing at 1/5 and spending points per use; a switch turning a wildcard's positive relative level into a bonus for GM-chosen categories; Alternative Benefits for Talents as text                                                                                                                                                                                                                                                                                                                                                                                                                                             | medium       |
| New techniques (pp. 333-334)                                                                  | Acrobatic Stand (posture change roll), Armed Grapple (weapon grapple at -2, weapon locked), Close Combat (long weapons at -4/-8/-12 by reach, swing -1 a yard, Parry from reduced skill; the ranged form buys off Bulk; GM switch for non-C reach in close combat), Evade (replaces DX in the p. 368 contest), Head Butt (natural attack, self-injury on a parry, helm bonus), Stamp Kick, Wrench Arm/Leg (records for the existing p. 404 code)                                                                                                                                                                                                                                                                                    | medium       |

## Phase 2: Addendum 2, organizations and gear

| Issue                                                                          | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Size         |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Pulling Rank (pp. 337-341)                                                     | Rank as an effective Patron: the organization's Patron value (10-30) on each Rank trait; Rank priced 2-10 a level within the two tables; the base assistance roll (key Rank gets 9, +1 above, -2 below); modifiers (appropriateness, previous rolls, Charisma, Smooth Operator, Reputation, one complementary skill); the outcome ladder; the sample assistance list as data with its numeric rows (Cash, Consultation, Facilities, Generalized Assistance, License, Muscle, Shipping); Capricious Assistance -50%; a switch in the influence group | medium       |
| Tech Level and Skill Availability (p. 341)                                     | A first-TL field on the ~90 design, repair and science skills (and specialties) the list names; the picker and sheet warn when the campaign TL is below it                                                                                                                                                                                                                                                                                                                                                                                          | small-medium |
| Cost factors for equipment modifiers, and silver as a surcharge (pp. 342, 275) | Price = list x (1 + sum of CF), floor -0.8, replacing the product in `item-sheet.ts:535`; fine/very fine/solid silver mutually exclusive, fine and good equipment likewise; silver adds 19x/2x/49x the good-quality price (`weapon-quality.ts:174`, `ammunition.ts:395`); new calculated fields Balanced, Cutting-Edge, Disguised, Presentation, Rugged, fine armour and shields, silver-coated shields, good/fine equipment weight (lifted from the add-on's Monster Hunters and Ultra-Tech fields, book-neutral)                                  | medium       |
| Flat-cost Signature Gear (p. 342)                                              | A switch under which Signature Gear is a 1-point perk per protected item: a per-item flag (the migrated `signature` field revived), the money tab's budget line hidden, the point audit following                                                                                                                                                                                                                                                                                                                                                   | small-medium |

## Phase 3: Addendum 3, hit locations

One issue. Ear, nose, jaw, spine (neck and torso), joints, veins and arteries,
skull and face from behind, crushing at the vitals, the 1d refinements on a
random hit, and the tolerance removals, as the add-on's Martial Arts
`finerHitLocations` already builds them through `registerHitLocation`, moved
into `src/rules/hit-locations.ts` as the Revised text writes them (joints take
no impaling; the spine takes only cr/cut/imp/pi/tight-beam burn and is
targetable through the neck; the nose's cut-to-lop cap). New: the chest and
abdomen split of the torso (random 9-10 chest, 11 abdomen replacing groin; a
"chest only" armour coverage), the pelvis (-3, major wound fells the target),
No Legs and No Manipulators removals, and the broken neck (Quadriplegic,
automatic when a neck snap injures over HP). One switch in the combat group,
off by default. Medium-large.

## Phase 4: Addendum 4, tasks and combat

| Issue                                                                                                                   | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Size             |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Tasks and feats: Ham Clause, probability tables, Expanded Influence Rolls, Basic Abstract Difficulty (pp. 570-571, 578) | Ham Clause (scene modifier from an invoked disadvantage); the "how many people succeed" and Collective Skill tables on the GM screen; Expanded Influence Rolls mapping margin to the reaction levels (switch); Basic Abstract Difficulty as a world/scene penalty shown in the roll dialog with 10 + BAD for unstatted NPCs (switch); Quick-and-Dirty Modifiers as text                                                                                                                                                                                                                                                                                            | medium           |
| Extra effort extras (pp. 571-572)                                                                                       | Giant Step, Great Lunge, Heroic Charge, Rapid Recovery and the one-offensive-one-defensive cap (from the add-on's Martial Arts `extraEffort`); extra effort with powers (Talent bonus, no missing-FP penalty, flat 1 FP or 1 FP a minute); Godlike Extra Effort (cinematic); Trading Fatigue for Skill and for Resistance (FP spinners in the roll and resistance dialogs); Combining ST; Humping, Tramping and Yomping as an alternative to p. 351 (switch, off)                                                                                                                                                                                                  | medium           |
| Stress and Derangement (pp. 572-573)                                                                                    | Two trackers on the character; ordinary and sanity-blasting Fright Checks feeding them; the penalty to Fright Checks; rest, indulgence, the Will limit spilling into Derangement; the day's-end Will roll and a clinician's help; optional penalties to self-control, steady-hand skills, disease and Influence; buy-offs by spending a point of mental disadvantage                                                                                                                                                                                                                                                                                               | large            |
| Terrain, illumination, vision, frostbite and the horizon (pp. 573-575)                                                  | Terrain Types Redux and aquatic terrain (foraging, Tracking and travel modifiers on the hazards prompt); Illumination Levels as named presets of the darkness value, flicker, adaptation and point-source falloff; In Plain Sight (+10/+20 Vision); Vision Rolls in Combat (no active defense against an unseen attacker; switch); Frostbite (1 HP per exposed location per FP lost to cold, from the add-on's High-Tech rule; switch); Visual Signals and the Horizon Table                                                                                                                                                                                       | medium           |
| More maneuvers (pp. 575-576)                                                                                            | All-Out Attack with slams (full Move, Double), All-Out Concentrate (+1, Will-2 distraction), All-Out Defense (Mental Defense) (+2 to resist), Committed Attack and Defensive Attack (from the add-on's Martial Arts rule, with the grapple +1), all switchable                                                                                                                                                                                                                                                                                                                                                                                                     | medium           |
| Ranged options and Hitting 'Em Where It Hurts (pp. 576-577)                                                             | Close-Contact Shots (+4 Determined, pressed-gun bonuses, bracing, no Bulk against an unresisting target); Hitting 'Em Where It Hurts (n-in-6 armour coverage and strike-around penalties, from the add-on's High-Tech `partialCoverage`; the item field stays compatible with the add-on's packs); Non-Combat Bonuses; Restricted Dodge Against Firearms (evasive movement, from Martial Arts `limitedDefenses`); Prediction Shot and Ranged Feint; Ranged Rapid Strike (the -6 core, from High-Tech); Simplified Range (five bands replacing measured range; switch); Piercing and Impaling Damage vs. Large Targets (wounding by SM for Unliving and Homogenous) | large; may split |
| Simplified Resources, batteries and power cells (p. 578)                                                                | A reload tally and an ammunition-tracking toggle; the thirteen battery and power-cell records with the substitution ratios (from the add-on's High-Tech `batteries`; the add-on then drops its six battery items)                                                                                                                                                                                                                                                                                                                                                                                                                                                  | small-medium     |

## The add-on's part

Filed in `sargas79/gurps-compendium-content`:

1. **Read the Revised PDF.** `tools/transcribe.mjs`, `tools/recapture.mjs` and
   `tools/lib/book-structure.mjs` take two volumes and read a three-column
   page whose heading sizes they know. Add a Revised-edition mode: one PDF,
   page offset +10, two columns, the new type sizes, the addenda's page ranges.
2. **Recapture the entries' prose.** Every entry in `books/basic-set/prose`
   captured again from the Revised text, reviewed most-different first, so the
   prose stops saying "Slave Mentality", "Crippling", "suck the wound", "+1 if
   sucked out", "per point of skill" and the rest of the 300-odd changed
   passages the review lists.
3. **Update the rules journal.** The 213 journal pages regenerated from the
   Revised text; new pages for Team Efforts, Complementary Skills, the four
   addenda and the new hit locations; each linked to the rule switch it
   carries.
4. **Retire Martial Arts rules the Basic Set now carries** once the system
   release ships: `finerHitLocations`, the four `extraEffort` options,
   `committedDefensiveAttack`, the slam part of `allOutAttackOptions`, the
   evasive-movement part of `limitedDefenses`, Prediction Shot and Ranged
   Feint in `rangedOptions`; the records for Heroic Archer, Improvised
   Weapons, Strongbow, Special Exercises, Unusual Training, Weapon Bond and
   the seven techniques go to `overlap.txt` as records the Basic Set owns.
5. **Retire High-Tech and Monster Hunters rules the Basic Set now carries:**
   `frostbite`, `partialCoverage`, `rangedRapidStrike` (keeping the Quick-Shot
   and Gunslinger extras), `batteries` (the six items), `illumination` (the lux
   table stays); the Monster Hunters gadget fields, Born War-Leader,
   Craftiness, Equipment Bond and Weapon Bond records.

## Order of work and releases

1. Phase 0 (seven issues) and the add-on's tooling issue: one system minor
   release. The add-on's prose and journal recapture start here and land
   whenever ready, pinned to that release.
2. Phase 1, then phase 2: a release each. The add-on drops the Monster Hunters
   and Martial Arts records the system now owns.
3. Phase 3: a release; the add-on retires `finerHitLocations`.
4. Phase 4: two releases (tasks, feats and terrain; then maneuvers, ranged and
   resources); the add-on retires the remaining moved rules.

Every phase's rule switches register in the existing groups (rolls, combat,
injury, activities, equipment, cinematic); no new group. New extension points
the moved rules need (an armour coverage field, a pelvis and abdomen location,
an FP-spending hook in the roll dialog) bump the API minor version as usual.

## Deliberately left out

- GM guidance, other-book pointers, pull quotes that restate rules, and
  inclusive-language rewrites that leave the mechanics alone (the add-on's
  prose recapture carries the wording).
- The Slaves rules removed from pp. 518-519: the system never implemented
  them; the new "Buying Freedom" price (60 x monthly pay) is text.
- Table and example corrections with no code behind them (the sample
  character sheet's thrust figure on p. 569 looks like a Revised-edition
  error and is not copied).
- The Armor spell's prerequisite: the entry drops Magery 2 and the table
  keeps it; the entry wins, noted in the record.
