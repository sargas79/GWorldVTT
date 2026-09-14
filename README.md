# GWorld — GURPS 4e for Foundry VTT

A game system implementing GURPS (4th Edition) for Foundry Virtual Tabletop v14.

## Installing

In Foundry, go to **Configuration and Setup → Game Systems → Install System** and
paste this manifest URL:

```
https://github.com/sargas79/GWorldVTT/releases/latest/download/system.json
```

## What it does

### Characters

- **Seven-tab character sheet** — attributes, skills, traits, combat, body, gear
  and description — plus a one-pane NPC sheet with what a GM needs mid-fight.
- **Attributes and secondary characteristics** with their point costs, and the
  damage they produce.
- **Points that add up.** Starting points and points earned since are kept
  apart, awards are logged one at a time with what they were for, and everything
  on the sheet is counted against the two together. The header carries the
  running total and the award control, on every tab.
- **Spending points where you read them.** A skill's points and a levelled
  trait's levels have steppers on the sheet itself: a skill's walk the Skill Cost
  Table, a trait's move a level at a time and stop at the cap.
- **Two ways to build a character.** Every tab can browse the compendia filtered
  to what it holds, and a guided build walks points, templates, attributes,
  advantages, disadvantages, skills and gear in order with the ledger in view.
- **Templates, racial templates and meta-traits.** Drop one on a sheet: it asks
  for the choices it leaves open — "select two skills from", "20 points chosen
  from among" — adds what it grants, moves the numbers and records exactly what
  it did, so taking it off again gives back precisely that. A racial template's
  modifiers move the score without being billed, because the racial cost already
  paid for them; a character template's attributes are bought in the ordinary
  way. **A GM writes their own the way they write an advantage:** make an Item
  of type Template, fill in its modifiers, its entries and its choice groups,
  and drag it onto a character.
- **Traits that change the numbers.** Combat Reflexes, High and Low Pain
  Threshold, Damage Resistance, Hard to Kill, Hard to Subdue, Fearlessness,
  Fearfulness, Combat Paralysis, Unfazeable, Ambidexterity, Indomitable, Slave
  Mentality, Super Jump, Enhanced Move, Amphibious, Extra Attack, Extra Arms,
  Arm ST, Regeneration, Unkillable and Injury Tolerance are all read and
  applied; so are Enhanced Dodge, Parry and Block, Fit and Very Fit on every
  HT roll and on fatigue, Night Vision, Dark Vision and Infravision against the
  dark, the ten Talents and Voice on their skills, Acute Senses on the four
  sense rolls, Temperature Tolerance against the weather, and Bad Sight, One
  Eye, One Arm, Hard of Hearing, Deafness, Blindness and Lame where each
  bites. Appearance, Charisma, Reputation, Status, Voice, Social Stigma, an
  Odious Personal Habit and the Talents fill in the reaction roll. The traits
  tab marks which ones are read.

### Combat

- **Two combat systems**, chosen by the GM. *Basic* is abstract — everyone can
  reach everyone. *Tactical* is fought on a hex map, where facing decides what a
  defender can do: a side attack is defended at -2, a shield blocks only from the
  shield side, an attack from behind usually cannot be defended at all.
- **Turn order** by Basic Speed, ties broken on DX.
- **Attacks** for melee and ranged, with the speed/range table, size modifier,
  accuracy, rapid fire, bulk, close combat, Wait and opportunity fire.
- **Attack options** — Deceptive Attack, Rapid Strike, Feint, All-Out Attack,
  slams, evading, retreats.
- **Grappling** — take hold of a foe and they cannot walk away; then a takedown,
  a pin, or a choke, each the contest the book says it is, and breaking free is
  a contest of ST against how good the grip is.
- **Fighting what you cannot see** — the penalties for darkness, invisibility
  and knowing only where a foe is, on both the attack and the defense.
- **Cover** — aim at what is showing, roll the location and risk the cover, or
  shoot through it.
- **Size** — a large fighter's weapons reach further, and they have an easier
  time getting hold of somebody smaller.
- **Defending.** An attack that connects offers each defender the defenses they
  actually have, with retreats and Feverish Defense.
- **Called shots** — aim at a location and take its penalty, or go for the
  chinks in somebody's armour with a piercing or impaling weapon and meet half
  the DR. Where the blow was aimed carries through to the damage.
- **Damage and injury** — DR resolved against the damage type being applied,
  armour divisors, wounding modifiers, hit locations, crippling, shock, major
  wounds, consciousness and death checks, knockback, explosions and afflictions.
- **Criticals do something in particular.** A critical miss rolls on the table as
  the attack does; a critical hit rolls when the damage is applied, where the hit
  location picks between the ordinary and head blow tables.
- **Knockdown and stunning.** A major wound, or a head or vitals hit that causes
  shock, calls for a HT roll on the card; failing it stuns, floors and disarms,
  and failing badly puts you out.
- **Conditions on the token** — stunned, prone, unconscious, reeling, bleeding,
  grappling, grappled, pinned, suffocating, mortally wounded and dead, replacing
  Foundry's own list. Reeling and dead follow the hit point total by themselves,
  in both directions.
- **Extra effort** — Mighty Blows, Flurry of Blows and Feverish Defense in
  combat, and the Will roll outside it.
- **Dual-Weapon Attacks** — both hands on one Attack maneuver, with the
  technique and Ambidexterity buying the penalties back, and a foe attacked
  twice defending at -1.
- **Malfunctions.** A gun jams on an attack roll at or above its Malf. and rolls
  on the table: a stoppage still fires the shot, a revolver shrugs off a
  misfire, and a low-tech weapon can go off in your hand.
- **Firing up and down a slope**, where height is worth twice as much against
  you as for you, and lasers ignore it entirely.
- **Scatter** — where a missed grenade actually landed, with the direction
  rolled openly, and how far its fragments reach.
- **Overpenetration** — whether a shot went through cover, a shield or a person,
  and what reached whoever was behind.
- **Mounted combat** — a rider's defenses capped by Riding, the charge that
  trades a point of skill for a point of damage, firing at the lower of Riding
  and weapon skill, and the roll to stay on after a stun or a knockback.
- **High-speed movement** — the turning radius that keeps you going forwards,
  and the roll for stopping or turning harder than that allows.
- **Dirty tricks** — a drink in the face as a thrown weapon, and the Will roll
  not to flinch.
- **Trampling** — walking over somebody two sizes smaller, or one size and on
  the ground: a melee attack a dodge is the only answer to, and an overrun
  after a knockdown that is not rolled for at all.
- **Swarms** — a cloud of bats, bees or rats as one attacker that hits
  automatically and allows no defense, with clothing keeping insects out for
  two seconds and armour for five; fought off by the hit point, with a shield
  crushing fliers and a boot for the rest.
- **Vehicles in a fight** — losing control means one thing for a car and
  another for an aeroplane, a boat or a submarine; a shot is placed on the
  vehicle's own hit location table, each location crippled at its share of
  the hull, and five points through an occupied one puts the people inside at
  risk.

### Everything else

- **Contests** — Quick and Regular, with extreme scores balanced so a contest
  between two experts or two novices can actually end.
- **Fright Checks**, capped by the Rule of 14, with the full table.
- **Physical feats** — jumping, lifting, running, swimming, climbing and
  throwing, all derived from ST, Basic Lift and Move.
- **Falling**, including blunt trauma through armour that stopped it.
- **Bleeding**, a HT roll a minute until the wound closes or somebody binds it.
- **Death checks and mortal wounds** — failing by one or two is not death but a
  state you can be carried out of, rolling HT every half-hour.
- **Crippling injuries** — how long one lasts, and whether it lasts for good.
- **Suffocation and drowning** — a point of fatigue a second, and four minutes
  is fatal whatever the hit points say.
- **Recovery** — rest for fatigue, a day's rest, First Aid by tech level, and
  waking up again.
- **Lost Fatigue Points**, which is what makes every slow drain dangerous: below
  0 FP each further point of fatigue is also a point of injury, and at -1×FP you
  are unconscious. Very Tired halves Move, Dodge and ST the way reeling does.
- **Heat, cold, hunger and thirst** — a roll against the weather every half hour
  or oftener in a wind, and a day of short rations costing a point per missed
  meal.
- **Poison** — six numbers, a dose written onto the victim and advanced a cycle
  at a time, with the book's named poisons ready-made, dosage, and treatment as
  a standing bonus to every roll still to come.
- **Illness and infection** — catching something (the worst contact you had, not
  the sum), the wound that goes bad afterwards (where the filth *is* cumulative),
  antibiotics, and natural immunity noted when it turns up.
- **Drink** — an hourly roll from sober to tipsy to drunk to the floor, pink
  elephants, the Heaves, sobering up and the morning after. Drugs, overdose and
  withdrawal are worked out with the book's numbers.
- **Reaction and Influence rolls** — the Reaction Table with its modifiers on the
  dice rather than on a target, whispered to the GM; and the Quick Contest that
  buys a stated reaction, Diplomacy's second chance included.
- **Study** — hours with a teacher make a character point every 200, hours
  alone or on the job every 400; the points go into the skill and onto the
  ledger, and the hours short of a point are banked.
- **Money** — what the Wealth trait is worth at the character's tech level,
  what the gear cost, a month's cost of living at their Status with any Debt
  and Independent Income, and a job rolled monthly against its skill: a wage
  paid on anything but a critical, or freelance work paid by the margin.
- **Languages and cultures** — a Broken or Accented language costs an
  Influence roll, and an unfamiliar culture costs reactions and Influence
  alike, unless the character adapts to any.
- **Aging** — from 50, a series of four HT rolls a year, one per attribute
  and oftener later, that costs a level of the attribute when it fails;
  Longevity, Extended and Short Lifespan and Unaging are read.
- **Missed sleep** — a sixteen-hour day, a point of fatigue past it and one
  every four hours after, and only sleep to give them back.
- **Hiking** — ten miles a Move a day by terrain and weather, at the fatigue
  of a battle an hour.
- **Collisions, electricity, flame and radiation** — being struck by
  something moving, at its HP times its velocity; a shock's HT roll not to
  be stunned or knocked out; seconds in a fire and whether the clothes
  caught; doses in rads that accumulate, heal slowly and roll against the
  table.
- **Vehicles** — gear filed as a vehicle carries the book's stat line, and
  its row offers a control roll at Handling that fails by the Stability
  Rating.
- **Temporary attribute penalties** — off the skills the attribute governs, and
  off nothing else: never a defense, a resistance roll or a Fright Check.
- **Compendia** of advantages, disadvantages, skills, spells, equipment,
  templates, enhancements and limitations, and the Basic Set's animals and
  monsters, carrying names, point costs and statistics. The templates are the
  Basic Set's four racial ones, its three sample character templates, and
  eighteen meta-traits; every one is checked at build time against the cost
  the book states for it. A trait's modifiers are picked off the enhancements
  compendium at the level wanted, and a creature dragged from the bestiary
  arrives with its traits, its skills, and the bite, claws and strikers its
  traits give it.

### Magic

- **Spells as the book has them** — a Magic tab filed by college, each spell
  with its class, cost, casting time and duration, bought on the Skill Cost
  Table off IQ plus Magery, with no default. The hundred spells of the Basic
  Set are in a compendium of their own.
- **Prerequisites, checked** — other spells known to at least a point, a Magery
  level, an IQ minimum, a count of spells from a college or from several, an
  advantage or a skill. A spell that is not yet earned says what is missing.
- **Ritual Magic** (p. 242), from the same spell records: a core skill, a
  college skill per college defaulting from it at -6, and every spell a Hard
  technique off its college skill at -1 per prerequisite, castable at default
  and never above the college skill. Which style a character uses follows from
  whether they have Magery or Ritual Magery, and can be set by hand.
- **Magery, Ritual Magery and Magic Resistance** read from the traits tab.
- **Casting.** The die on a spell asks what the book leaves to the caster —
  energy for a spell whose effect scales, radius for an Area spell, the
  subject's size and distance for a Regular one, HP burned in place of FP — and
  works out the rest: the mana here, what the caster's skill takes off the cost
  and the casting time, what the spells still running cost, the target's Magic
  Resistance. The roll pays what its outcome costs (nothing on a critical
  success, one point on a failure, everything on a critical failure or for an
  Information spell), and a critical failure rolls on the Critical Spell
  Failure Table.
- **Mana**, as a campaign default and per scene, from none to very high, with
  everything each level changes.
- **Spells running** are kept on the sheet with what is left of their
  duration, counted in world time a second a round; maintain one for its cost,
  concentrate on it, or let it go, and every one still up costs the next
  casting. Distraction while concentrating is a Will-3 roll.
- **Spells in a fight.** A Missile spell goes into the hand with the energy
  put into it, can be enlarged for two more seconds, and is thrown with Innate
  Attack through the same range table and defense card as an arrow, which
  offers dodge and block but not parry; a hit rolls a die of damage per point
  of energy. A Melee spell charges the hand and is struck with at DX or an
  unarmed skill. A Resisted spell posts the caster's roll with a resistance
  button for each targeted subject, under the Rule of 16, with Magic
  Resistance added and doubled against an Area spell. A Blocking spell sits
  on the defense card beside dodge, parry and block.
- **Magic items.** Gear carries enchantments, each with its own Power: Fortify
  goes into the armour's DR, Deflect into every active defense, Accuracy into
  the weapon's skill and Puissance into its damage, all of it only where the
  item's Power reaches 15 after the mana. Any other spell on an item is worn,
  if always on, or cast from the item at its Power with no ritual, the item's
  Power enchantment paying part of the cost.
- **Enchanting**, as ceremonial magic: Enchant and the spell both at 15,
  assistants each costing a point of skill and supplying energy, Quick and
  Dirty at an hour per hundred points paid now or Slow and Sure at a mage-day
  per point paid never, a 16 that always fails and a 17 or 18 that destroys
  the item. What succeeds is written onto the item.
- A campaign without magic switches the whole chapter off under **GURPS rules
  in play**, and the tab goes with it; the rituals, the failure table, mana,
  the running-spell penalty, distraction, the Rule of 16 and magic items each
  have a switch of their own.

### Which rules are in play

GURPS is written to be played at several depths, and the GM chooses how much of
it the table is using: **Configure Settings → GURPS rules in play** lists every
optional rule with the page that defines it and a switch. A rule that is off
behaves as though it had never been written — no penalty applied, no control
shown, nothing to explain. Success rolls, damage, DR and the three active
defenses are never optional.

## Requirements

- Foundry VTT v14 (verified against 14.367)
- Node.js >= 24.13.1, matching Foundry v14's own requirement

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

To load the system into a local Foundry install, copy
`foundry-config.example.json` to `foundry-config.json`, point `dataPath` at your
Foundry **Data** directory, then `npm run dev` to build and link `dist/` into
`systems/gworld`.

Other scripts: `npm run watch`, `npm run typecheck`, `npm run lint`,
`npm run test:coverage`, `npm run validate:packs`.

### Other books, as a module

The system's own packs are built from the GURPS Character Assistant data file
for the Basic Set. A module can carry another book — Martial Arts, Low-Tech,
GURPS Magic — the same way, and the sheet, the picker and the guided build read
its packs alongside the book's without any change to the system:

1. Build the JSON from that book's GDF with the same tool, naming the page
   prefix the book uses, the name the references should carry, and where the
   files should go:

   ```bash
   node tools/parse-gdf.mjs "GURPS Martial Arts 4e.gdf" --prefix MA --book "Martial Arts" --out my-module/packs-src --overlap my-module/overlap.txt --write
   ```

   Only records citing that book's pages are written, one file per pack —
   `advantages/martial-arts-advantages.json`, `skills/martial-arts-techniques.json`
   and so on — and each reference reads "Martial Arts p. N". A supplement
   restates some of the Basic Set's entries with its own page beside the
   original; those the system's packs already carry, so they are skipped, and
   `--overlap` writes the list of them for checking. Running the tool again
   over the same `--out` keeps the ids of every entry already there, so a
   character that dragged one in still points at it.

   With no options the tool reads the Basic Set into this repository's own
   `packs-src`, which is how the system's packs are regenerated.

   A book that is only spells can use the spells tool on its own, with the
   same options:

   ```bash
   node tools/parse-gdf-spells.mjs "GURPS Magic 4e.gdf" --prefix M --book "Magic" --out my-module/packs-src --pack spells --write
   ```

2. Check and compile it with the same two scripts, pointed at the module:

   ```bash
   node tools/validate-packs.mjs --src my-module/packs-src
   ```

   ```bash
   node tools/build-packs.mjs --src my-module/packs-src --out my-module/packs
   ```

3. Declare each pack in the module's `module.json` as an `Item` pack with
   `"system": "gworld"`. Give every pack of one book the same
   `"flags": {"gworld": {"book": "martial-arts", "bookTitle": "Martial Arts"}}`
   and **Configure Settings → Compendium sources** shows the book as one row
   with one switch for all its packs.

A spell record is a name and statistics: colleges, classes, cost, time and
duration as the book writes them, the Magery it needs, and a prerequisite line
in the grammar the sheet reads — `Magery 1, Create Fire, Shape Fire or Seek
Fire`, `6 Air spells`, `spells from 10 colleges`, `IQ 13`, `Empathy
(advantage)`, `Locksmith (skill)`. A spell entered by hand on an item sheet
follows the same shape. Where two packs hold a spell of one name, the picker
says which pack each row is from, and adding one a character already has
raises its points rather than adding a copy.

### The add-on API

A module reaches the system through `game.gworld.api` and the hooks below, and
nothing else. That's the whole contract:

- **Stable within a major version.** `game.gworld.api.version` is a semver
  version of the API itself, independent of the system's. Additions raise the
  minor part; a change or a removal raises the major part.
- **The only supported surface.** The system's classes, sheets and data models
  aren't part of it. Don't patch or subclass them, don't import the system's
  source at runtime, and write only to your own Item and Actor types, your own
  `system.extensions.<module>` data, your own flags and settings, and your own
  registered rule keys. Anything else can change in any release.
- **The system knows no module.** No module id, book name or book page appears
  in the system. Whatever a module brings arrives through registration.

What's in it:

| | |
|---|---|
| `version` | The API's semver version. |
| `satisfies(range)` | Whether this API meets a semver range. |
| `rules` | The pure GURPS rules: dice, success rolls, contests, damage, hit locations, maneuvers, skills, costs. |
| `registry` | `registerRuleGroup`, `registerRule`, `namespacedRuleKey`, `isAddonRuleKey`, `isRuleOn`, `activeRules`. |
| `roll` | `success`, `damage`, `quickContest`, `regularContest`, posted through the system's chat cards. |
| `actors` | `derived`, `attribute`, `skillLevel`, `defenses`, `basicLift`, `encumbrance`: read-only. |
| `items` | `derived`: read-only. |
| `combat` | Combat extension points (since 1.1.0); see below. |
| `data` | Data extension points (since 1.2.0); see below. |
| `sheets`, `chat` | Sheet and chat extension points (since 1.3.0); see below. |
| `points`, `magic` | Point pools, energy sources and spell attacks (since 1.4.0); see below. |
| `migration` | Moving world data from the system into a module (since 1.6.0); see below. |

Since 1.5.0, `combat`, `roll` and `actors` also carry the procedure extension points below.
| `hooks` | The names of the hooks below. |

Lifecycle, in order:

1. `gworld.registerRules`, during `init`: register rule groups and switches.
2. `setup`: rule registration closes.
3. `gworld.ready`, after the system's own `ready` work, with the API as its
   argument: the world is loaded and all of the API may be used.

Declare the API versions your module works with in its manifest, and the GM
is warned when the running system doesn't provide one:

```json
"flags": { "gworld": { "apiVersion": "^1.0.0" } }
```

`npm run build` writes the API's TypeScript declarations to
`dist/gworld-api.d.ts`, for a module built against a checkout of the system.

### Combat extension points

`game.gworld.api.combat` lets a module add to combat without touching the
system. Every registration names its module and a key, stored as
`<module>.<key>`; each takes an `available` check (typically "is my switch on")
and is simply not offered when that says no. Anything that throws is logged
and skipped, and the roll goes on.

- **`registerManeuver({ module, key, label, movement, defense, attacks, options?, available? })`.**
  Offered in the maneuver picker with the given movement (`none`, `step`,
  `half`, `full`) and defense allowance (`any`, `none`, `dodgeAndBlockOnly`).
  A choice made with it is stored in `system.maneuverOption`.
- **`registerAttackOption({ module, key, label, attack?, input?, available?, refuse?, apply })`.**
  Shown in the attack dialog as a checkbox, number or select. `apply(context, value)`
  returns an effect:
  - `modifiers`: lines on the attack roll;
  - `defenseModifiers`: lines on the defender's rolls, optionally limited to certain defenses;
  - `damageModifiers`: lines on the damage roll that follows;
  - `reachBonus`, `criticalSkill`, `fatigue`, `notes`.

  `refuse(context)` returns a reason to disable the option. `context.chosen` lists
  the other options chosen.
- **`registerDefenseOption({ module, key, label, defenses?, available?, refuse?, apply, after? })`.**
  A checkbox on the defense card. `apply` returns `modifiers` and `fatigue`, and
  `after(context, outcome)` hears how the defense went.
- **`registerExtraEffort({ module, key, label, kind, fp, available?, refuse?, apply })`.**
  An offensive option in the attack dialog or a defensive one on the card,
  paid in FP before the roll.
- **`registerHitLocation({ module, key, label, parent, penalty, damageTypes?, wounding?, cripplingDivisor?, extraDr?, knockdown?, available? })`.**
  Offered as a called shot and on the damage card. It takes its armour and
  anything it doesn't override from its Basic Set `parent`.
- **State:** `getCombatState(actor, module, key)` and
  `setCombatState(actor, module, key, value, "turn" | "round" | "combat")`,
  cleared at that boundary. `getWeaponState(item, module)` and
  `setWeaponState(item, module, patch)` hold state on a weapon.
- **Hooks**, each called with a mutable context:
  - `gworld.attackModifiers`, `gworld.defenseModifiers`, `gworld.damageModifiers`: push lines to `modifiers`;
  - `gworld.injury`: change `damage` before it is worked out;
  - `gworld.afterDamage`: the blow and its result;
  - `gworld.breakageOdds`: set `breakage`;
  - `gworld.randomHitLocation`: set `location` or `addonLocation`.

### Data extension points

`game.gworld.api.data` lets a module keep its own data on the system's
documents, bring item types of its own, and change what the system works out,
without editing the system's data models. Register from `init` or the
`gworld.registerRules` hook, so the fields exist before documents are read.

- **`registerItemType({ module, type, label, tab, columns?, actions?, builderStep?, indexFields?, available?, genericSheet? })`.**
  For a type the module's manifest declares under `documentTypes`, named
  `<module>.<type>`. The character sheet lists the type on `tab` (`attributes`,
  `skills`, `magic`, `traits`, `combat`, `body`, `gear`, `description`) with
  a New button, the `columns(item, actor)` it gives, and a button for each of
  its `actions` (`{ key, label, icon?, visible?, run(item, actor) }`). A list
  on the Magic tab keeps that tab when the campaign has no magic.
  `builderStep` offers the type at that step of the guided build, and
  `indexFields` names the `system.*` fields the compendium picker should read
  for its columns. Unless `genericSheet` is `false`, the item opens on a
  generic sheet: its name and picture, a field for each thing its data model
  stores, and its description.
- **`registerDataExtension({ module, documentName, types, schema })`.**
  Fields under `system.extensions.<module>` on the system's Actor or Item types
  (`types` is a list, or `"*"`). `schema` is what a `SchemaField` takes. The
  data is validated and filled with initial values while the module runs, and
  left exactly as it is while it doesn't. Read it with
  `getExtension(document, module)` and write it with
  `updateExtension(document, module, patch)`.
- **`registerPriceModifier({ module, key, types?, apply })`.**
  `apply(item, { cost, weight })` returns a new `cost`, `weight` and `label`,
  or `null`. Modifiers run in registration order on the stored figures, never
  on their own output; the result is `item.effectivePrice`, and the character's
  wealth, encumbrance and gear lists use it. `effectivePrice(item)` works it out.
- **`registerTechniqueKind({ module, key, label, derive, cost? })`.**
  A technique whose `system.kind` is `<module>.<key>` gets its level from
  `derive(technique, actor, { levelOf, standard })`, which returns
  `{ level, levels?, cappedByPrerequisite?, notes? }`. `standard()` is what the
  system would have worked out. `cost(technique)` replaces its points in the
  character's total. The technique's sheet offers the registered kinds.
- **Hooks:**
  - `gworld.prepareDerivedData`, with the actor or item, after the system has
    prepared it.
  - `gworld.skillBonuses`, with `{ actor, item, name, difficulty, lines }`: the
    system's lines are keyed `bonus`, `magic`, `talent` and `tools`. Push lines
    (`{ label, value, source }`), or change a line's `value` and give its
    `reason`. The skill's level tooltip shows the lines.
  - `gworld.attributeBonuses`, with `{ actor, attributes, lines }`: push
    `{ attribute, label, value, source }`. They show on the attribute's card.
  - `gworld.defenseBonuses`, with `{ actor, defenses, lines }`: push
    `{ defense, label, value, source }`. They show in the defense's breakdown.

`tools/validate-packs.mjs --src <dir>` accepts documents of module types and
`system.extensions` data.

### Sheet and chat extension points

`game.gworld.api.sheets` and `game.gworld.api.chat` give a module places to
show things and ask the table to do them. Templates are the module's own
Handlebars files (`modules/<module>/templates/...`); the system preloads each
one when it is registered, and a module that uses partials loads them with
`foundry.applications.handlebars.loadTemplates`.

- **`sheets.registerSheetSection({ module, key, sheet, tab?, position?, template, context?, listeners?, visible? })`.**
  Renders `template` at the `start` or `end` (the default) of a character
  sheet `tab`, or of the item sheet's body when `sheet` is `"item"`. The
  template gets what `context(document, sheet)` returns, plus `document`,
  `editable` and `owner`. `listeners(element, document, sheet)` binds the
  section's own events, and only runs for a user who owns the document. Inputs
  named `system.extensions.<module>.<field>` save with the sheet's form.
- **`sheets.registerRowAction({ module, key, itemTypes, label, icon?, visible?, run })`.**
  A button on the character sheet's rows for items of those types, before the
  row's delete button. It is only there for a user who owns the character, and
  `run(item, actor)` only runs for one.
- **`chat.registerChatCard({ module, key, template, actions })`** and
  **`chat.post("<module>.<key>", data, { actor?, whisper? })`.**
  A button in the template carries `data-addon-card-action="<name>"`. Each of
  `actions` is a handler `({ message, data, actor, button, user })`, or
  `{ permission, visible?, run }`. With `permission: "owner"` (the default),
  whoever owns the card's actor may press it; on a card with no actor, the
  user who posted it may. With `"gm"`, only the GM may. The GM may press any
  button. Buttons a viewer may not press are removed, and so are all of them
  while the module isn't running.
- **`sheets.registerGmTool({ module, key, label, icon?, open, visible? })`.**
  A button in the token controls, shown to the GM only.

Sheet markup follows the system's: a section is an `.isec`, a heading
`.grph`, a list a `table.gt` with `tr[data-item-id]` rows, a button `.ibtn`,
and a hint `p.ihint`.

### Point pools, energy sources and spell attacks

- **`points.registerPointPool({ module, key, label, pools, canPay?, pay })`.**
  Pools a character can spend points from, listed beside unspent character
  points wherever points are spent on outcomes: buying a success roll up, a
  flesh wound, and a request for guidance. Registering one puts buying a roll
  up in play.
  - `pools(actor, use, roll)` returns `{ id, label, available, gmCheck? }` for
    each pool that may pay for `use` (`buySuccess`, `fleshWound` or
    `guidance`). `roll.skill` names the skill of a roll being bought up, for
    a pool tied to one skill.
  - `canPay({ actor, pool, use, roll, cost })` returns `true` or the reason it
    can't, which is shown.
  - `pay({ actor, pool, cost, note })` takes the points and returns whether it
    did.
- **`magic.registerEnergySource({ module, key, label, sources, canPay?, pay })`.**
  Offered in the casting dialog as "Energy from", beside the caster's own FP
  and HP.
  - `sources(actor, spell)` returns `{ id, label, available, multiplier? }`;
    `multiplier` is the source's points spent per point of energy.
  - The source covers what it can of the energy owed, and the caster pays the
    rest. `canPay({ actor, spell, source, energy })` may refuse with a reason,
    and `pay({ actor, spell, source, points, energy })` takes the points.
- **`magic.registerSpellAttack({ module, key, label, applies?, cast })`.**
  For a spell that isn't a Missile or Melee spell but attacks.
  - Its record declares the attack in `system.attack` (`skill`, `damage` per
    point of energy, `damageType`, ranges, `area`), and names the behavior in
    `attack.behavior` as `<module>.<key>`, or leaves that blank for one whose
    `applies(spell)` takes it.
  - Once the spell is cast successfully, `cast(context)` gets the actor,
    spell, outcome, energy, attack, the damage the energy buys, and the
    targeted actors. `context.rollAttack({ skill?, label?, ranged?, noParry? })`
    rolls an attack the target defends against, with the damage on a hit.
    `context.rollDamage({ label?, formula? })` rolls damage straight away, for
    an area.
  - The pack validator accepts a spell's damage or `area` when `attack.behavior`
    names a behavior.

### Inside the system's own procedures

- **`combat.registerManeuverOption({ module, key, maneuver, label, input?, available?, refuse?, attack?, defense?, response? })`.**
  A choice on one of the system's maneuvers (or a registered one), shown under
  the maneuver on the Combat tab and saved as it is made.
  - `refuse({ actor, maneuver, chosen })` disables it with the reason.
  - While it is chosen, `attack(context, value)` returns an attack effect, as an
    attack option's does, for every attack made on the maneuver, and
    `defense({ actor, defense }, value)` returns lines on the actor's own
    defense rolls.
  - `response: { label, trigger(actor, value) }` puts a button beside it, which
    is how a Wait holds a response ready.
- **Refusals:** attack options, defense options and maneuver options each take
  `refuse`, and the control shows why it is disabled.
- **Success rolls:** `gworld.successRollModifiers` is called for every success
  roll, the rolls a Fright Check, knockdown and bleeding make, and each side of
  a contest, with `{ actor, label, kind, skill, base, tags, modifiers }`; push
  lines to `modifiers`. `tags` holds the kind (`skill`, `attribute`,
  `attack`, `defense`, `contest`) and more: `fastDraw` and `teaching` from the
  skill's name, `fright`, `knockdown`, `bleeding`, and the defense
  (`dodge`, `parry`, `block`). `gworld.afterSuccessRoll` follows with the
  `outcome`.
- **`roll.registerContestResolver({ module, key, label, applies, resolve })`.**
  For the Quick Contests the system offers, the first resolver whose
  `applies(context)` takes the contest returns the `{ base, note }` either side
  rolls instead.
- **Attack sequences:** `gworld.attackSequence` gets
  `{ actor, maneuver, option, count, pickTargets }` when a maneuver's attacks
  are worked out. Raise `count`, and the Combat tab shows how many of them have
  been made this turn; set `pickTargets`, and each attack asks which of the
  scene's tokens it is aimed at. `combat.attackSequence(actor)` reads it.
- **`combat.registerDerivedAttackMode({ module, key, label, kind, applies, mode })`.**
  An attack worked out when the sheet is drawn and never written to the item:
  for each weapon `applies(item, actor)` takes, `mode(item, actor, { skillLevel })`
  returns the row the melee or ranged table shows and rolls from.
- **`combat.registerGrappleAction({ module, key, label, applies?, run })`.**
  A button on the grapple panel. `applies(grapple, actor)` sees which end of it
  the actor is (`grapple.holding`), and `run({ actor, foe, grapple })` acts.
- **Conditions:** `actors.applyCondition(actor, { module?, key, label?, effects?, duration? })`
  applies a module's condition, or one of the system's token conditions when
  `module` is left out.
  - `effects.modifiers` are `{ label, value, rolls? }`, where `rolls` limits a
    line to kinds or tags of roll.
  - `duration` is `{ turns }` of the actor's own, `{ rounds }` of the combat, or
    `{ seconds }` of world time. The GM's client ends it when that runs out.
  - It returns the condition's id. `actors.removeCondition(actor, id)` takes it
    off, and `actors.conditions(actor)` lists them. The Combat tab shows them
    too.
- **Lifecycle:** `gworld.combatStart` `(combat)`, and `gworld.turnStart` and
  `gworld.turnEnd` `(combat, combatant)`, on every client.
- **Bleeding:** `gworld.bleedingSchedule` gets `{ actor, intervalSeconds, modifier }`
  before a bleeding roll, and may change either.
- **Technique defaults:** `gworld.techniqueDefaults` gets `{ actor, item, defaults }`;
  push `{ from, skill, modifier }` to offer another default. The best one is
  used.

`combat.hooks` lists every hook's name.

### Taking over data the system is dropping

When rules move out of the system into a module, worlds still hold their data
in the system's storage. Foundry won't load a document whose type is no
longer registered, and drops fields a data model no longer declares the next
time it saves. So the move happens in this order:

1. A system release marks the data it is about to drop, in
   `CONFIG.GWORLD.deprecatedData`, while it still defines it.
2. The module's release migrates that data from its `ready` hook, and says so in
   its manifest with `"flags": { "gworld": { "migrates": ["<id>", ...] } }`.
3. The GM installs and enables the module, and loads the world once.
4. Only then does a system release stop defining the data.

At `ready`, before any module's own ready work, a GM whose world holds
deprecated data that no active module migrates gets a warning that stays until
dismissed. Nothing is saved.

`game.gworld.api.migration`, for the GM's client:

- **`migrateItemType({ module, step?, fromType, toType, mapData })`.** Turns every
  item of `fromType` into `toType`, keeping its id, name and picture: world
  items, items on actors, and items in unlocked compendia.
  `mapData(source, item)` returns the new `system` data from a copy of the old.
- **`moveFields({ module, step?, documentName, types, fields, map? })`.** Copies
  `system.<from>` to `system.extensions.<module>.<to>` for each `from: to` in
  `fields`, on Actors or Items of those types (or `"*"`). `map(value, path,
  document)` may change a value on its way. The system's copy is left alone.
- **`moveRuleState({ module, step?, fromKey, toKey })`.** Carries a stored switch
  to the module's own `<module>.<key>`, unless that key already has a state.
- **`hasMigrated(module, step)`** and **`resetMigration(module, step)`.**

Each step is recorded in the world under the module once every document it
touched has saved, so it runs once. A step with a failure isn't recorded and
runs again on the next load. Each helper returns
`{ skipped, changed, failed }`, and a long step reports its progress.

### A module's own rules

The system plays the Basic Set. Rules from any other book belong to the module
that carries it, and switch on and off on the same **Rules** page as the
system's own. A module registers a group and its switches while the system
starts up, in the `gworld.registerRules` hook:

```js
Hooks.on("gworld.registerRules", (registry) => {
  registry.registerRuleGroup({ module: "my-module", id: "my-book", label: "MYMOD.Rules.Group" });
  registry.registerRule({
    module: "my-module",
    group: "my-book",
    key: "myRule",
    name: "MYMOD.Rules.MyRule.Name",
    hint: "MYMOD.Rules.MyRule.Hint",
    reference: "My Book p. 12",
    default: false,
  });
});
```

- **Keys are the module's own.** The switch above is stored and asked about as
  `my-module.myRule`. The system's keys never contain a dot, so a module can
  never overwrite one.
- **Registration closes at `setup`.** Register from the hook, or from your
  module's own `init` through `globalThis.gworld.registry`. Anything later is
  refused with a console warning, as are duplicate keys, a rule in a group the
  module didn't register, and a missing name, reference or default.
- **Reading a switch.** `game.gworld.api.registry.isRuleOn("my-module.myRule")`.
  A module key whose module isn't running reads as off.
- **Turning a module off keeps its choices.** Saving the Rules page keeps the
  stored switches of modules that aren't active, so switching the module back
  on finds the table's choices as they were left.
- **Reference pages.** A journal entry flagged
  `flags["my-module"].rule = "myRule"` (or the full `"my-module.myRule"`) is
  linked from the switch, as for the system's own rules.
- **Pending rules.** `implemented: false` lists a rule greyed out, unswitchable,
  until the module reads it.

## Licensing note

GURPS is a trademark of Steve Jackson Games Incorporated. This repository is an
independent implementation of the game's mechanics and is not affiliated with or
endorsed by Steve Jackson Games.

The compendia hold names, point costs and statistics, and deliberately **not**
the books' descriptive text. Anyone using this system needs their own copy of the
rules.
