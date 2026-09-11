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
  to what it holds, and a guided build walks points, attributes, advantages,
  disadvantages, skills and gear in order with the ledger in view.
- **Traits that change the numbers.** Combat Reflexes, High and Low Pain
  Threshold, Damage Resistance, Hard to Kill, Hard to Subdue, Fearlessness,
  Fearfulness, Combat Paralysis, Unfazeable, Super Jump, Enhanced Move and
  Amphibious are all read and applied; the traits tab marks which ones are.

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
- **Damage and injury** — DR resolved against the damage type being applied,
  armour divisors, wounding modifiers, hit locations, crippling, shock, major
  wounds, consciousness and death checks, knockback, explosions and afflictions.
- **Criticals do something in particular.** A critical miss rolls on the table as
  the attack does; a critical hit rolls when the damage is applied, where the hit
  location picks between the ordinary and head blow tables.
- **Knockdown and stunning.** A major wound, or a head or vitals hit that causes
  shock, calls for a HT roll on the card; failing it stuns, floors and disarms,
  and failing badly puts you out.
- **Conditions on the token** — stunned, prone, unconscious, reeling, bleeding
  and dead, replacing Foundry's own list. Reeling and dead follow the hit point
  total by themselves, in both directions.
- **Extra effort** — Mighty Blows, Flurry of Blows and Feverish Defense in
  combat, and the Will roll outside it.

### Everything else

- **Contests** — Quick and Regular, with extreme scores balanced so a contest
  between two experts or two novices can actually end.
- **Fright Checks**, capped by the Rule of 14, with the full table.
- **Physical feats** — jumping, lifting, running, swimming, climbing and
  throwing, all derived from ST, Basic Lift and Move.
- **Falling**, including blunt trauma through armour that stopped it.
- **Bleeding**, a HT roll a minute until the wound closes or somebody binds it.
- **Recovery** — rest for fatigue, a day's rest, First Aid by tech level, and
  waking up again.
- **Compendia** of advantages, disadvantages, skills and equipment, carrying
  names, point costs and statistics.

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

## Licensing note

GURPS is a trademark of Steve Jackson Games Incorporated. This repository is an
independent implementation of the game's mechanics and is not affiliated with or
endorsed by Steve Jackson Games.

The compendia hold names, point costs and statistics, and deliberately **not**
the books' descriptive text. Anyone using this system needs their own copy of the
rules.
