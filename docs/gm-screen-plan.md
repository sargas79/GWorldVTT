# The GM Screen: an in-game reference of the Basic Set's tables

**Status: proposed, awaiting approval.** Nothing below is implemented.

Decisions taken with the user (2026-09-25):

1. "Quick Reaction" is the Basic Set Reaction Table (p. 560).
2. Players get a read-only view of the screen.
3. Rolling from the screen is in scope, not a later addition.
4. All of it ships as one PR.
5. The screen must show the book's prose. It comes from the content module
   (see *The prose*); the system ships only figures and summaries.

Written against `claude/gm-screen-plan-hgw9z3` at v1.51.0.

## Context

A GM running GWorld still keeps the printed screen or the PDF open beside
Foundry: the critical tables, the hit locations, the maneuvers, the modifier
lists. Most of those tables are already in the system as data, since the
automation reads them: `src/rules/criticals.ts` holds all four critical tables,
`hit-locations.ts` the locations, `maneuvers.ts` and `posture.ts` their
tables, and `fright.ts`, `recovery.ts`, `reactions.ts`, `afflictions.ts` and
`damage.ts` the rest. None of them can be read at the table. The GM Screen
is one window, in eight tabs, that shows them.

Principles:

1. **One source of truth.** Wherever the system already has a table or a
   function, the screen renders from it and doesn't copy it. The damage table
   comes from `thrustDamage`/`swingDamage`, the size and speed/range table from
   `speedRangeModifier`, the hit locations from `HIT_LOCATIONS` and
   `woundingModifierAt`. If the automation changes, the screen changes with it,
   and a test pins each builder to the rule it reads.
2. **The book's prose, from the content module.** The screen shows each
   section's prose as the book gives it (decided 2026-09-25). The system can't
   ship the book's text, so the prose comes from the content module the GM
   installs from their own copy. It is a journal compendium, one page per
   section, which the system renders inline in the section's card (see *The
   prose* below), the same way `src/system/rule-references.ts` finds a rule's
   page today. The system itself ships the figures, taken from the rules code,
   and a short summary in our own words (as the critical cards do now,
   `GWORLD.Critical.*`). The summary shows only where no content module
   provides the prose.
3. **Book-neutral.** The system ships the Basic Set's tables only. Other books'
   tables come from add-on modules through a new `game.gworld.api.gmScreen`,
   and `tools/check-book-neutral.mjs` must keep passing with no new exceptions.
   See *What the system does not ship* below.
4. **Add-on registrations show up on their own.** Modules already register hit
   locations (`registerHitLocation`), maneuvers (`registerManeuver`), extra
   effort (`registerExtraEffort`), defenses and attack options
   (`src/system/combat-extensions.ts`). The screen reads those registries, so a
   module's added hit locations and extra-effort options appear in the
   "expanded" tables without any GM Screen code of their own. Each row is marked
   with its module's title, as the Rules page does.

## What the system does not ship

Checked against the book-neutral rule in `CLAUDE.md`:

| Requested item | Source | Where it goes |
|---|---|---|
| Awe and Confusion checks (Tab 8) | Not the Basic Set | Add-on module, through `gmScreen.registerTable` |
| Posture and Hit Locations (Tab 7) | Not the Basic Set (the Basic Set's posture table has no hit-location column) | Add-on module; the system gives Tab 7 a slot for it |
| Hit locations beyond the Basic Set's 11 (the "very expanded" part of Tab 2) | Add-on books | Appear on their own from `registerHitLocation` (principle 4) |
| Extra-effort options beyond Feverish Defense, Flurry of Blows, Giant Step and Mighty Blows (Tab 5) | Add-on books | Appear on their own from `registerExtraEffort` |

Everything else on the list is in the Basic Set: the Rule of 14 is the Fright
Check ceiling (`FRIGHT_CHECK_CEILING`), the Rule of 16 is on p. 349 and the
Rule of 20 on p. 173.

"Quick Reaction" (Tab 8) is read here as the Reaction Table (p. 560,
`REACTION_TABLE`), as confirmed.

## The window

- `src/system/apps/gm-screen.ts`: `GmScreen extends
  HandlebarsApplicationMixin(ApplicationV2)`, with `id: "gworld-gm-screen"`, and
  resizable and remembered size, like `apps/rules-settings.ts`. It uses the
  same `static open()` that brings forward the copy already open.
- Tabs use Foundry's `static TABS` with one `PARTS` entry per tab, so switching
  tabs only renders the tab being opened. The last tab opened is kept in a
  client setting.
- **Search box** across every tab. It filters sections in place, without
  re-rendering, using `normaliseQuery`/`ruleMatches` from `rule-search.ts`. While
  a search is typed, the tab strip shows how many matches each tab has.
- **Sections collapse** on a click on their heading. Collapsed state is kept per
  user, in a client setting.
- **Where it opens:**
  - A button in the token controls, shown to every user (the modules' GM
    tools in `sheet-extensions.ts` stay GM-only; this one is the system's own
    and added beside them, not through that list).
  - A keybinding, `gworld.gmScreen`, unbound by default.
  - `game.gworld.api.gmScreen.open(tab?)` for macros.
- **Layout:** each tab is a responsive multi-column grid of cards, one table or
  rule block per card, so a wide window reads like the printed screen and a
  narrow one stacks.

### Files

| File | What |
|---|---|
| `src/system/gm-screen/layout.ts` | The eight tabs and, for each, its ordered section ids. Pure data. |
| `src/system/gm-screen/tables/*.ts` | One builder a section. Pure functions from the rules modules to a `GmTable` or `GmRuleBlock` view model. No Foundry. |
| `src/system/gm-screen/types.ts` | `GmTable { id, title, cite, columns, rows, notes, source? }`, `GmRuleBlock { id, title, cite, items }`, `GmDiagram`. |
| `src/system/gm-screen/registry.ts` | Module-registered tables and blocks, validated like `registerGmTool`. |
| `src/system/apps/gm-screen.ts` | The application: context, tabs, search, collapse. |
| `templates/apps/gm-screen.hbs` + `templates/apps/gm-screen/{table,rules,diagram}.hbs` | One generic partial for each view-model shape, so no table has a template of its own. |
| `src/styles/gm-screen.css` | Card grid, compact tables, highlighted row. |
| `lang/en.json` | `GWORLD.GmScreen.*`: tab names, table titles, column heads, and the new short effect strings. Existing keys (`GWORLD.Critical.*`, `GWORLD.Maneuver.*`, `GWORLD.Posture.*`, `GWORLD.HitLocation.*`, `GWORLD.Fright.*`) are reused. |

## The tabs

For each section: the data it renders from, and what is **new** where the
system has no data yet. New data goes in `src/rules/` beside the rule it
belongs to, so the automation can use it later too.

### Tab 1: Tables

| Section | Page | Data |
|---|---|---|
| Critical Hit | B556 | `CRITICAL_HIT` |
| Critical Head Blow | B556 | `CRITICAL_HEAD_BLOW` |
| Critical Miss | B556 | `CRITICAL_MISS` |
| Unarmed Critical Miss | B557 | `CRITICAL_MISS_UNARMED` |
| Attribute/Skill Levels | B14, B172 | **New**: `ATTRIBUTE_LEVEL_BANDS` and `SKILL_LEVEL_BANDS` (score range to descriptor) in `attributes.ts`/`skills.ts` |
| Damage From Thrown Objects | B355 | `thrownDamage`/`thrownDamagePerDie`, one row a weight band |
| Throwing Distance | B355 | `throwDistanceModifier`, one row a weight ratio |
| Cover DR | B559 | **New**: `COVER_DR` (material/thickness to DR) in `cover.ts` |

### Tab 2: Hit Locations and Wounds

- **Hit Location Table, expanded.** One row a location, the Basic Set's first,
  then each registered one under its parent. Columns:
  - 3d roll (from `RANDOM_TABLE`, exported for this)
  - to-hit penalty
  - extra DR
  - wounding modifier for each damage type, from `woundingModifierAt`, which
    covers the skull ×4, the vitals ×3 for imp/pi, and the neck cr ×1.5 and cut ×2
  - knockdown modifier
  - crippling threshold (`cripplingThreshold`)
  - which damage types can target it (`targetableBy`)
  - whether it is deliberate-only
  - the arcs it can be hit from (`canTargetFromArc`)
  - notes: miss by 1 hits the torso (`missByOneHitsTorso`); eye and skull
    specials
- **Wounds**, as rule blocks with their figures from the code:
  - Shock: `shockPenalty`, `MAX_SHOCK_PENALTY`
  - Knockback: `knockback`
  - Major Wound: `isMajorWound`
  - Knockdown and Stunning: `knockdownModifier`
  - Effects of Stun: `STUN_DEFENSE_PENALTY`, `recoversFromStun`
  - Crippling Injury: `cripplingDuration`, `cripplingMonths`
  - Mortal Wounds: `MORTAL_WOUND_MINUTES`, `mortalWoundTarget`
  - Bleeding: `BLEEDING_HP`, `bleedingModifier`, `MINUTES_TO_STOP_BLEEDING`

### Tab 3: Melee and Defense Modifiers, Status

| Section | Page | Data |
|---|---|---|
| Melee Attack Modifiers | B547 | **New**: `MELEE_ATTACK_MODIFIERS` list. Entries that exist as constants (e.g. `wildSwingPenalty`, `chinkPenalty`, `disarmPenalty`, `GRAPPLED_DX_PENALTY`) are referenced, not repeated |
| Active Defense Modifiers | B548 | **New**: `ACTIVE_DEFENSE_MODIFIERS`, reusing `acrobaticDefenseModifier`, `multipleParryPenalty`, `flailDefenseModifier`, `retreatBonus` |
| Lost Hit Points | B419 | Rows from the `healthStatus` thresholds and `consciousnessRollPenalty` |
| Lost Fatigue Points | B426 | Rows from the `fatigueStatus` thresholds |
| Criticals | B348 | Rows generated by `isCriticalSuccess`/`isCriticalFailure` for effective skill 3-16+ |
| Rule of 14 | B360 | `FRIGHT_CHECK_CEILING` |
| Rule of 16 | B349 | The cap in `spell-attacks.ts` |
| Rule of 20 | B173 | `RULE_OF_20_CAP` |

### Tab 4: Ranged, Defenses, Recovery

| Section | Page | Data |
|---|---|---|
| Ranged Attack Modifiers | B548 | **New**: `RANGED_ATTACK_MODIFIERS`, reusing the cover, aim and `rapidFireBonus` figures |
| Size and Speed/Range Table | B550 | Rows generated by `speedRangeModifier`/`sizeModifier` |
| Dodge/Block/Parry | B374-376 | `baseDodge`/`baseParry`/`baseBlock` formulas and their modifiers |
| Wounding Modifiers | B379 | `WOUNDING_MODIFIERS` |
| First Aid | B424 | `FIRST_AID_TABLE`, `BANDAGING_HP` |
| Natural Recovery of HP | B424 | `naturalRecovery`, `FP_PER_REST_MINUTES` |
| Unconsciousness | B423 | `wakingFrom` |

### Tab 5: Maneuvers and Posture

- **Maneuver Table, expanded.** `MANEUVERS` in `MANEUVER_ORDER`, plus
  registered maneuvers. Columns: move allowed, active defense allowed, and
  description. Sub-rows give the All-Out Attack options (`allOutAttackBonus`,
  `strongAttackDamageBonus`), the All-Out Defense options, and the Evaluate and
  Feint figures.
- **Extra Effort options.** The Basic Set's (`extra-effort.ts`: Feverish
  Defense, Flurry of Blows, Mighty Blows, Giant Step), then registered ones
  from `registeredExtraEfforts`. Each shows its FP cost.
- **Posture Table** (B551). `POSTURE_EFFECTS`: attack, defense, target
  modifier and movement (`postureMove`).

### Tab 6: Skills, Damage, Combat Specials

| Section | Page | Data |
|---|---|---|
| Skill Modifiers | B345 | **New**: `TASK_DIFFICULTY_MODIFIERS` and equipment-quality modifiers (`EquipmentQuality` exists) |
| Damage Table | B16 | ST 1-20 row by row, then steps to 100, from `thrustDamage`/`swingDamage` |
| Combat: Flexible Armor/Blunt Trauma | B379 | `bluntTrauma` |
| Combat: Rapid Fire | B373 | `rapidFireBonus` rows by RoF |
| Combat: Hurting Yourself | B379 | `HURTING_YOURSELF_DR`, `hurtingYourself` |
| Close Combat: Evade, Slam | B368, B371 | `attack-options.ts` slam and evade figures |
| Unarmed Combat: Grabbing, Grappling, Takedown, Pin, Strangle | B370 | `grappling.ts`: `takedownModifier`, `pinModifier`, `chokeModifier`, `chokeDamage`, `breakFree` |
| Vision Hex Diagram | B390 | **New** inline SVG: a hex with the front, side and back arcs, drawn from the arc definitions in `tactical.ts` and labelled with each arc's defense effect (`arcDefense`) |

### Tab 7: Afflictions

- **Afflictions** (B428). `AFFLICTIONS`, with `PAIN_GRADES`, the nausea,
  retching and seizure figures, and heart attack and coma.
- **Posture and Hit Locations.** An empty slot that a module's registered table
  fills (see *What the system does not ship*). With none registered, the slot is
  hidden.

### Tab 8: Tables

| Section | Page | Data |
|---|---|---|
| Fright Checks | B360 | `FRIGHT_CHECK_TABLE` |
| Awe and Confusion | — | Module-registered (see *What the system does not ship*) |
| Falling and Collisions | B430-431 | `fallingVelocity`, `terminalVelocity`, `fallingDamage`, `collisionDamage`, `RESTRAINT_DR` |
| Quick Reaction | B560 | `REACTION_TABLE` |

## Add-on API: `game.gworld.api.gmScreen` (API minor bump)

```ts
gmScreen.open(tab?: string): Promise<void>
gmScreen.registerTable({
  module, key,             // id `<module>.<key>`, validated like registerGmTool
  tab,                     // "tables" | "wounds" | ... | "tables2", or a registered tab
  after?,                  // a section id to follow; the tab's end otherwise
  title, cite?,            // localized strings; cite is the module's own page reference
  columns: string[],
  rows: string[][] | (() => string[][]),
  notes?: string[],
}): string | null
gmScreen.registerRuleBlock({ module, key, tab, after?, title, cite?, items: string[] }): string | null
gmScreen.registerTab({ module, key, label, icon? }): string | null
```

- Registration is open from `init` to `ready`. Invalid entries are refused with
  a console warning, like the other `register*` calls.
- Module sections carry the module's title as their source badge.
- A module's journal page for a Basic Set table links from the table's heading
  when it is flagged `flags.<module>.gmScreen = "<sectionId>"`. This is read
  the same flag-only way `rule-references.ts` reads rule keys.
- Documented in a new `docs/api.md` section, *The GM Screen*. The types come
  out through `tools/build-api-types.mjs`.

## The prose

- **Where it lives.** Each section's prose is a `JournalEntryPage` (text) in
  a content module's journal compendium, flagged
  `flags.<module>.gmScreen = "<sectionId>"`. It is found the flag-only way
  `rule-references.ts` finds rule pages, knowing no module's id. A page may
  name several sections (an array) where one passage covers them. The
  section ids are listed in `docs/api.md`, so the content module knows what
  to flag.
- **How it shows.** The card shows the table's figures, then the prose under
  them, run through `TextEditor.enrichHTML`, so the page's links, rolls
  (`[[/r 3d6]]`) and formatting work. Long passages fold behind a "Read
  more" toggle whose state is kept with the section's collapse state. Search
  covers the prose too.
- **Where there's no prose.** Where no module flags a section, the card shows
  the system's own summary and a muted "Install a content module for the
  full text" line (hidden for players).
- **Loading.** The compendium indexes are read once when the window opens,
  as `ruleReferencePages()` does, and each page is loaded when its tab is
  first shown, so opening the window stays fast.
- **Players.** A player sees a page's prose only where they may observe it
  (`testUserPermission(user, "OBSERVER")`); otherwise the summary shows.
- **Add-on books.** A module's `registerTable`/`registerRuleBlock` takes an
  optional `prose` (HTML string or a journal page uuid) in the same way.

## The player view

- Players open the same window, from the same button, keybinding and API call.
  `readOnly` is true for anyone but a GM, as on the Rules page
  (`apps/rules-settings.ts`), and a caller may pass it explicitly.
- It is read-only by nature, since the screen edits nothing; what differs for a
  player:
  - A world setting, *Players may open the GM Screen* (on by default), lets the
    GM withdraw it. With it off the button is hidden for players and `open`
    refuses with a notice.
  - A world setting, *Tabs hidden from players* (none by default), chosen
    from a list on the Rules page's settings menu, hides whole tabs.
  - Reference links to journal pages show only where the player may see the
    page (`testUserPermission(user, "OBSERVER")`).
  - A module section may set `gmOnly: true` in its registration.
- The window re-renders for open players when either setting changes, as
  `settings.ts` already does for the read-only Rules page.

## Rolling from the screen

- A 3d button on the heading of the tables that are rolled on: Critical Hit,
  Critical Head Blow, Critical Miss, Unarmed Critical Miss, Hit Location
  (3d, and the 1d side roll for hands and feet), Fright Check (3d plus the
  margin of failure, asked for in a small prompt, through
  `frightCheckTotal`/`frightCheckResult`), and Reaction (3d plus a modifier,
  through `reactionFor`).
- The roll is a Foundry `Roll`, so Dice So Nice and the roll modes work. It is
  posted as a short chat card (`templates/chat/gm-screen-roll.hbs`): the
  table, the roll, and the row it lands on, in the same words as the screen.
- **Who sees it:** the card follows the user's current roll mode. A GM's
  default is whisper to GM, so the GM's rolls stay behind the screen unless
  they choose otherwise; a player's roll goes out however their roll mode says.
- The matching row is highlighted on the roller's open screen, and the tab
  and section scroll into view.
- Each rollable table's builder exposes `rowFor(total)`, the same lookup the
  automation uses (`criticalEntry`, `randomHitLocation`, `frightCheckResult`,
  `reactionFor`), so the roll and the highlighted row can't disagree.
- A module's registered table may be rollable too: `registerTable` takes an
  optional `roll: { formula, rowFor(total) }`.
- `gmScreen.roll(sectionId, options?)` on the API, for macros.

## Nice-to-haves

Not in this PR:

- **Pinning** sections to a "Favourites" strip at the top.

## Tests

- One vitest file a table builder (`src/system/gm-screen/__tests__/`),
  asserting row counts and spot values against the book, e.g. critical hit 3-4
  triple damage, skull ×4 wounding, ST 13 damage 1d/2d-1, speed/range 10 yd -4.
  Each builder test also asserts that it agrees with the rule function it reads.
- `gm-screen-view.test.ts`, modelled on `rules-settings-view.test.ts`: tabs
  render, search filters and counts, collapse is kept, and a registered module
  table and hit location appear with their badge.
- Roll tests: for each rollable table, every total 3-18 lands on the row the
  automation's lookup gives; the card's whisper follows the roll mode.
- Player-view tests: a player with the setting off is refused; hidden tabs and
  `gmOnly` sections are left out; reference links need observer permission.
- Prose tests: a flagged page renders in its section (and in each section of
  an array flag); the summary and hint show without one; a player without
  observer permission gets the summary; search matches prose text.
- API tests: validation and refusals for `registerTable`/`registerTab`.
- `npm run lint` (with book-neutral), `npm run typecheck` and `npm test` green
  before the PR is opened.

## Order of work

One PR, built in this order, with each step's tests passing before the next:

1. **Frame.** The app, tabs, search, collapse, the token-control button, the
   keybinding, `gmScreen.open`, the generic partials and CSS, the player
   view and its two settings.
2. **Tabs 1 and 3.** The critical, thrown and Rule-of tables. New data:
   attribute and skill level bands, cover DR, and the melee and defense
   modifier lists.
3. **Tabs 2 and 4.** The expanded hit locations (with registered locations),
   wounds, ranged modifiers, size and speed/range, defenses and recovery.
4. **Tabs 5 and 6.** Maneuvers with extra effort, posture, skill modifiers,
   the damage table, the combat specials and the vision SVG.
5. **Tabs 7 and 8.** Afflictions, fright, falling and reaction.
6. **Rolling.** The roll buttons, the chat card, the row highlight,
   `gmScreen.roll`.
7. **Prose.** Finding flagged pages, inline enriched rendering, Read more,
   searching the prose, the summary where none is provided, section ids in
   `docs/api.md`.
8. **Add-on API.** `registerTable`/`registerRuleBlock`/`registerTab`, the
   `docs/api.md` section, the API minor version bump.

Then `graphify update .`, and the system's version bump.
