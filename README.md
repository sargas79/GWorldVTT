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
