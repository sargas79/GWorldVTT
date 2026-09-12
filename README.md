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
- **Compendia** of advantages, disadvantages, skills, spells, equipment and
  templates, carrying names, point costs and statistics. The templates are the
  Basic Set's four racial ones, its three sample character templates, and
  eighteen meta-traits; every one is checked at build time against the cost
  the book states for it.

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

### Spells from other books, as a module

The system's own spells pack is built from the GURPS Character Assistant data
file for the Basic Set. A module can carry another book's spells — GURPS Magic,
Thaumatology — the same way, and the sheet, the picker and the guided build
read them alongside the book's without any change to the system:

1. Build the JSON from that book's GDF with the same tool, naming the page
   prefix the book uses and where the file should go:

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

3. Declare the pack in the module's `module.json` as an `Item` pack with
   `"system": "gworld"`, and list the module under **Configure Settings →
   Compendium sources** in the world.

A spell record is a name and statistics: colleges, classes, cost, time and
duration as the book writes them, the Magery it needs, and a prerequisite line
in the grammar the sheet reads — `Magery 1, Create Fire, Shape Fire or Seek
Fire`, `6 Air spells`, `spells from 10 colleges`, `IQ 13`, `Empathy
(advantage)`, `Locksmith (skill)`. A spell entered by hand on an item sheet
follows the same shape. Where two packs hold a spell of one name, the picker
says which pack each row is from, and adding one a character already has
raises its points rather than adding a copy.

## Licensing note

GURPS is a trademark of Steve Jackson Games Incorporated. This repository is an
independent implementation of the game's mechanics and is not affiliated with or
endorsed by Steve Jackson Games.

The compendia hold names, point costs and statistics, and deliberately **not**
the books' descriptive text. Anyone using this system needs their own copy of the
rules.
