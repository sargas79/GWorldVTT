# GWorld — GURPS 4e for Foundry VTT

A game system for GURPS 4th Edition on Foundry Virtual Tabletop v14. It
implements the GURPS Basic Set. Rules from other books come from add-on modules
that use the system's API.

## Installing

In Foundry, go to **Configuration and Setup → Game Systems → Install System**
and paste this manifest URL:

```
https://github.com/sargas79/GWorldVTT/releases/latest/download/system.json
```

## Features

- **Characters:** a character sheet with seven tabs and a one-pane NPC sheet.
  Point totals and a log of awarded points. Steppers for skill and trait
  levels. A guided character build. Templates, racial templates and
  meta-traits that can be removed cleanly, and GM-made templates.
- **Traits:** the sheet reads and applies over fifty advantages and
  disadvantages, including Combat Reflexes, High Pain Threshold, DR, the
  Talents, Acute Senses and the reaction modifiers. The traits tab marks which
  ones it reads.
- **Combat:** Basic (no map) and Tactical (hex map with facing). Turn order,
  melee and ranged attacks, attack options, defenses, called shots, grappling,
  cover, darkness and invisibility, damage and injury, criticals, knockdown and
  stunning, and token conditions. Also mounted combat, malfunctions, scatter,
  overpenetration, trampling, swarms and vehicles.
- **Other rules:** contests, Fright Checks, jumping, lifting, swimming and
  other physical feats, falling, bleeding, fatigue, recovery, heat and cold,
  poison, illness, alcohol and drugs, reaction and Influence rolls, study,
  money and jobs, languages and cultures, aging, missed sleep, hiking,
  collisions, electricity, fire and radiation.
- **Magic:** spells by college with prerequisite checks, Ritual Magic, casting
  with energy costs and mana levels, maintained spells, Missile, Melee,
  Resisted and Blocking spells, magic items and enchanting.
- **Compendia:** advantages, disadvantages, skills, spells, equipment,
  templates, enhancements, limitations and the Basic Set's animals and monsters. Built from
  the GURPS Character Assistant data file.

## Optional rules

**Configure Settings → GURPS rules in play** lists every optional rule with its
page reference and an on/off switch. A rule that is off has no effect and shows
no controls. Success rolls, damage, DR and the active defenses can't be turned
off. The whole magic chapter can be turned off too.

## Requirements

- Foundry VTT v14 (tested on 14.367)
- Node.js >= 24.13.1

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
`foundry-config.example.json` to `foundry-config.json`, set `dataPath` to your
Foundry **Data** directory, and run `npm run dev`. This builds the system and
links `dist/` into `systems/gworld`.

Other scripts: `npm run watch`, `npm run typecheck`, `npm run lint`,
`npm run test:coverage`, `npm run validate:packs`.

### What belongs in the system

- The Basic Set's rules, citing its pages (`Characters p. 12`,
  `Campaigns p. 347`).
- Generic features that any book's data can use, such as Talents with their
  own skill lists, attacks on advantages, and the GCA parser.
- The add-on API (`game.gworld.api`).

Other books' rules, records and text go in add-on modules. The system never
names an add-on or cites another book's pages: `npm run lint` runs
`tools/check-book-neutral.mjs`, which checks `src`, `templates`, `lang` and
`packs-src`. Its exception list covers only code that is due to be removed,
with the issue that removes it. If a module needs something the API doesn't
offer, open a book-neutral issue for the API.

### Add-on modules

[docs/api.md](docs/api.md) explains how to build a module's packs from a GCA
data file and documents `game.gworld.api`: its versioning, lifecycle and
extension points.

## License

GURPS is a trademark of Steve Jackson Games Incorporated. This project is not
affiliated with or endorsed by Steve Jackson Games.

The compendia contain names, point costs and statistics, but not the books'
descriptive text. You need your own copy of the rules.
