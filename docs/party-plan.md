# The party: a Party actor, its sheet, the sidebar, and the campaign's terms

**Status: implemented** on `claude/party-area-character-sheet-081d5b`, in the
two PRs the order of work below gives. Two things changed from the plan
during the work: the party's members are resolved by the sheet at render
time rather than read from `derived.members` (a deleted member reads as
missing at once, without the party being prepared again), and the mana level
is changed from the Campaign tab through the existing prompt that also sets
the scene's own level, rather than a bare select. The tests for the campaign's
terms live in `party-roster.test.ts` beside the roster's, not in a file of
their own.

Written against `main` at v1.28.0 (`d0f8315`). Baseline at the time of
writing: `npm run typecheck`, `npm run lint` and `npm test` (178 files, 2679
tests) all pass.

## Context

A GM running GWorld has no one place to see the party. Each character's
vitals, defenses and conditions live on its own sheet, and the campaign's
terms -- Tech Level, starting points, the disadvantage limit -- are typed by
each player on each character (classic `templates/actor/parts/attributes-campaign.hbs`,
V2 `templates/actor/v2/tab-progression.hbs:7-23`, the builder's first step
`templates/apps/character-builder.hbs:52-72`), while the mana level and the
Control Rating are world settings on Foundry's settings page
(`src/system/settings.ts:49-79`). Pathfinder 2e's party actor (the screenshot:
a party row in the Actors sidebar with its members nested under it, and a
sheet listing every member's HP, defenses and senses) is the model.

Decisions taken with the user (2026-09-17):

- **Mana level and Control Rating stay world-wide.** The party sheet edits the
  existing world settings; casting and legality code is untouched.
- **A member's TL, starting points and disadvantage limit are locked to the
  party** once the GM sets them there. The party is the source of truth; a
  character outside any party keeps its own fields.
- **The sidebar nesting ships in the first delivery**, with the sheet.
- **A new party is created with Observer permission for players**; only the
  GM edits.

Nothing party-like exists today: no `party`/`group` concept, no
`ActorDirectory` hook, no player-owner helper (verified by grep over `src`,
`templates`, `lang`). The closest precedents, reused below, are the vehicle's
crew roster (`src/system/sheets/vehicle-sheet.ts:114-132`, `:243-259`,
`:349-352`; `src/system/data/vehicle.ts:76-129`) and the V2 sheet's Overview
(`templates/actor/v2/tab-overview.hbs:6-55`, `:114-138`, `:146-185`).

Target: Foundry v14 (`src/system.json` compatibility minimum 14). Two PRs on
this branch, released together as v1.29.0. No CHANGELOG file exists; release
notes are the squash-merge bodies.

## What is built

### 1. The `party` actor type

- `src/system.json`: `documentTypes.Actor.party: {}`.
- `lang/en.json`: `TYPES.Actor.party: "Party"`, `GWORLD.Sheet.Party`, and a
  new `GWORLD.Party.*` namespace (tab labels under `GWORLD.Party.Tab.*`,
  headings, hints, notifications, the "set by the party" notes).
- `src/system/data/party.ts` -- `PartyData extends foundry.abstract.TypeDataModel`,
  following `VehicleData` (`src/system/data/vehicle.ts:58-129`):
  - `extensions: extensionsField("Actor")` (`src/system/data-extensions.ts:386`).
  - `description: HTMLField` (the GM's notes, ProseMirror on the Campaign tab).
  - `members: ArrayField(SchemaField({ uuid: StringField }))` -- world actor
    UUIDs, in the order the GM arranged them; an object per entry, like the
    vehicle's `crew`, so a per-member flag can be added later.
  - `campaign: SchemaField({ tl, startingPoints, disadvantageLimit })`, each a
    `NumberField({ nullable: true, initial: null, integer: true })`. **Null
    means "not set": each member keeps its own value.** A new party therefore
    changes nothing until the GM types a figure (Characters p. 10 for starting
    points, p. 11 for the disadvantage limit, p. 22 for TL).
  - `prepareDerivedData()`: resolves each member with `fromUuidSync` (the
    vehicle model's precedent for reading another actor during preparation,
    `src/system/data/vehicle.ts:182-190`), keeps `derived.members: Array<{ uuid, actor | null }>`
    (a missing actor stays in the list, shown as missing), and ends with
    `afterPrepare(this.parent)` like every model.
- Registration: `CONFIG.Actor.dataModels.party = PartyData` beside the others
  in `src/gworld.ts:68-70`.
- Default ownership: `preCreateActor` hook in `src/system/party.ts` --
  when a party is created without explicit ownership,
  `document.updateSource({ ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } })`.

### 2. The party index and the campaign's terms -- `src/system/party.ts`

The Foundry-facing module. Pure parts go in `src/system/party/roster.ts` (see
tests below).

- `isParty(actor)`, `partyOf(actor): Actor | null`, `membersOf(party): Actor[]`.
  The index is a `Map<memberUuid, partyId>` built from `game.actors` filtered
  to type `party`, rebuilt lazily after being invalidated by
  `createActor` / `updateActor` (when `changed.system?.members` is present) /
  `deleteActor` for party actors.
- `campaignTerms(actor): { party: { id, uuid, name }, tl, startingPoints, disadvantageLimit } | null`
  -- the stored `campaign` of the actor's party, nulls preserved. It reads the
  party's *stored* `system.members` and `system.campaign`, which never depend
  on the party having been prepared. Load order is safe: Foundry's
  `Game#initializeDocuments` (foundry.mjs:206394-206420) constructs every
  world collection first ("this was skipped at construction-time") and only
  then calls `_safePrepareData` on each document, so `game.actors` is complete
  before any character's first `prepareBaseData`. The only guard is
  `game.actors` existing (`game._documentsReady`); with none, no terms. A
  synthetic token actor (`actor.isToken`) is looked up by its base actor's
  uuid (`actor.token?.baseActor?.uuid ?? actor.uuid`).
- `refreshMembers(party)`: for each member actor, `actor.reset()` (Foundry's
  own way to re-run preparation, `DataModel#reset` → `_initialize`,
  foundry.mjs:13999; the client mixin wraps it as `_safePrepareData`,
  :36370), then re-render its open sheet and any open `CharacterBuilder` for
  it (the loop in `src/system/settings.ts:74-78` is the model for finding open
  actor apps). Called from `updateActor` when a party's `system.members` or
  `system.campaign` changed (the hook is the generic
  `update${documentName}` with `(doc, changed, options, userId)`,
  foundry.mjs:81174; `changed.system.members` arrives as the whole array).
  Also `ui.actors.render()` when `system.members` changed:
  `DocumentDirectory.DEFAULT_OPTIONS.renderUpdateKeys` is
  `["name","img","ownership","sort","folder"]`, so the directory would not
  redraw on its own.
- `addMembers(party, uuids)`, `removeMember(party, uuid)`, `moveMember(...)`
  wrap the pure list helpers and `party.update({ "system.members": ... })`.
  Only `character` and `npc` actors may join; a vehicle or another party is
  refused with a notification, as the vehicle sheet refuses a vehicle
  (`src/system/sheets/vehicle-sheet.ts:247`). Duplicates are refused. An actor
  already in another party is moved (one party per actor).
- `registerPartyHooks()` wires all of the above; called from `init` in
  `src/gworld.ts` next to `registerSheetExtensionHooks()`.

### 3. The characters inherit the terms

`CharacterData` gets a `prepareBaseData()` override (`src/system/data/character.ts`,
class at :504; `NpcData.prepareBaseData` at `src/system/data/npc.ts:100` already
calls super, so NPC members -- allies -- inherit too):

```ts
override prepareBaseData(): void {
  super.prepareBaseData();
  const terms = campaignTerms(this.parent);
  this.campaign = { party: terms?.party ?? null, locked: { tl: false, startingPoints: false, disadvantageLimit: false } };
  if (!terms) return;
  if (terms.tl !== null) { this.tl = terms.tl; this.campaign.locked.tl = true; }
  if (terms.startingPoints !== null) { this.points.starting = terms.startingPoints; ... }
  if (terms.disadvantageLimit !== null) { this.points.disadvantageLimit = terms.disadvantageLimit; ... }
}
```

The stored source is untouched; only the prepared instance changes, exactly as
`this.hp.max = secondary.hp` already does during preparation
(`src/system/data/character.ts:1593-1594`). Everything downstream already reads
the prepared value: the points ledger (`:2844-2848` reads `this.points.starting`),
`derived.points.disadvantageLimit` (`:3099`), the header's "TL" (`templates/actor/v2/header.hbs:19`),
tool bonuses (`:1627`), medicine, poison and disease (`src/system/recovery.ts`,
`poison.ts`, `disease.ts` read `actor.system.tl`). `buildDerived` exposes
`derived.campaign` (the same object) for the templates.

The three places a player types the terms show them locked when
`derived.campaign.locked.<field>` is true -- the value as text with the note
"Set by *Party name*" (a `v2-link` that opens the party sheet), and **no
`<input>`**. That is enough to keep the party's value out of the character's
source: `DocumentSheetV2._processSubmitData` calls `document.update(submitData)`
with the submitted keys only (foundry.mjs:38520-38524), so a field that is not
rendered is never written:

- V2 Progression summary: `templates/actor/v2/tab-progression.hbs:7-23`.
- Classic Attributes tab: `templates/actor/parts/attributes-campaign.hbs`
  (shared by both classic sheets; `sm` stays editable -- size is the
  character's, not the campaign's).
- The builder's points step: `templates/apps/character-builder.hbs:52-72`,
  whose `input[data-path]` listener (`src/system/apps/character-builder.ts:414-422`)
  is skipped for locked fields because no input is rendered. The builder's
  context (`:305-325`) gains `campaign` from `derived`.

### 4. The party sheet -- `src/system/sheets/party-sheet.ts`

`GWorldPartySheet extends HandlebarsApplicationMixin(ActorSheetV2)`, the
standalone shape of `src/system/sheets/vehicle-sheet.ts:81-110`, styled as the
V2 sheet:

- `DEFAULT_OPTIONS`: `classes: ["gworld", "sheet", "actor", "party", "v2"]`
  (so all of `src/styles/sheet-v2.css`, scoped `.gworld.v2`, applies),
  `position: { width: 980, height: 720 }`, `window: { resizable: true }`,
  `form: { submitOnChange: true, closeOnSubmit: false }`, actions listed below.
- `PARTS`: `header` (`templates/actor/party/header.hbs`), `nav`
  (reuse `templates/actor/v2/nav.hbs`), `members`, `skills`, `campaign`
  (`templates/actor/party/tab-*.hbs`), each tab `scrollable: [""]`.
  `TABS.primary = { initial: "members", labelPrefix: "GWORLD.Party.Tab", tabs: [members, skills, campaign] }`.
  `LIMITED_PARTS` → `templates/actor/limited.hbs` with `_configureRenderParts`
  as the vehicle sheet does (`:103-110`).
- Rail icons: `nav.hbs:7` resolves `gworld.v2icon.<tabId>`, so `ICONS` in
  `src/system/templates.ts:15-79` gains `gworld.v2icon.members` (people) and
  `gworld.v2icon.campaign` (a flag or scroll); `skills` exists.
- Registration in `src/gworld.ts` beside the vehicle sheet:
  `DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GWorldPartySheet, { types: ["party"], makeDefault: true, label: "GWORLD.Sheet.Party" })`.
  Class names survive the build (`vite.config.ts:38` keepNames).

**Header** (after `templates/actor/v2/header.hbs`): round portrait with
`data-edit="img"` / `editImage`, eyebrow "Party" + the name input, the tab
title (`changeTab` override retitles in place, `character-sheet-v2.ts:1153-1158`),
meta line: member count, and the campaign's terms as read-only chips
("TL 3 · 150 CP · -75 limit", each blank when unset). No CP badge.

**Members tab** (`tab-members.hbs`) -- one cream `.v2-panel` row per member,
the roster the GM reads at the table:

- 56px portrait and the name, both `data-action="openMember" data-uuid`
  (the vehicle sheet's `openOccupant`, `:349-352`); under the name the
  player's name (`system.details.player`) and the type (Character / NPC).
- HP and FP as `.v2-pool` + `.v2-bar-hp` / `.v2-bar-fp` with the status word
  under the bar (`GWORLD.Health.*`, from `derived.status` and
  `derived.fatigue.status`, as `overviewContext` does at
  `character-sheet-v2.ts:1084-1100`; `poolPercent` from
  `src/system/sheet-v2/overview.ts:128`). The current value is an
  `<input data-member-field="system.hp.value" data-uuid>` for a viewer who
  owns that member (`member.isOwner`), text otherwise; a change listener
  wired in `_onRender` calls `member.update({ [field]: n })`.
- A stat strip of `.v2-stat` cells: Will, Per, Basic Speed (`decimal 2`),
  Move, Dodge / Parry / Block (`derived.defenses.<key>?.total` or an em dash;
  the source weapon as `.v2-stat-note`), DR torso (`derived.dr`, `*` when
  `hitLocations.torso.splits`), Encumbrance (`GWORLD.Encumbrance.<key>`), and
  a CP badge `spent / available` (`pointBadge`, `overview.ts:25`), red when
  over.
- Conditions as `.v2-chip .v2-chip-red` with the icon (`CONDITIONS` from
  `src/system/conditions.ts`, intersected with `actor.statuses` as
  `character-sheet-v2.ts:1079-1081`), plus timed ones from
  `activeConditions(actor)`; the maneuver and posture as `.v2-chip-dark`.
- `.v2-row-actions`: open sheet, move up / down, remove (owner of the party
  only). A member whose actor no longer exists renders a muted row with
  "missing" and only the remove action.
- Empty state: a `.v2-empty` panel "Drop characters here, or add them".
  Header tools: "Add members" (`DialogV2` with a checkbox per world
  `character`/`npc` not already in this party, player-owned characters first
  via `actor.hasPlayerOwner`) and "Add all player characters".
- Drop: `_onDropActor(event, actor)` adds the actor (the vehicle sheet's
  `:243-259`).

**Skills tab** (`tab-skills.hbs`) -- the screenshot's "Party Skills" and
"Party Languages", answering "who is our best at X":

- Every skill any member has points in, one row per name (specialty
  included), with the best level and who holds it, others in a tooltip;
  the level is a `rollable` button that rolls for that member
  (`data-action="rollMemberSkill"` → the member's own roll path via
  `game.gworld.api.roll` or the classic sheet's helper, whichever is
  callable without a sheet -- check `src/system/roll.ts` at implementation).
  A search box filters in place (`wireListFilters` pattern,
  `character-sheet-v2.ts:1243`).
- Languages: each language known by anyone, with the best spoken / written
  level and who.
- Both computed by pure helpers `partySkills(members)` and
  `partyLanguages(members)` in `src/system/party/roster.ts`.

**Campaign tab** (`tab-campaign.hbs`) -- editable by the party's owner (the
GM), read-only otherwise:

- Panel "Character creation": Starting points (step 5), Disadvantage limit
  (step 5), Tech Level (step 1) -- `name="system.campaign.<field>"` number
  inputs, blank allowed (blank submits null = unset); a `.v2-note` says "Set
  here, these replace what each member's sheet says." and lists the members
  affected.
- Panel "The world" (GM only -- world settings need a GM to write): Mana
  level (`MANA_LEVEL_KEY`, choices `MANA_LEVELS`, `GWORLD.Mana.*` labels),
  Control Rating (`CONTROL_RATING_KEY`, choices as `src/system/settings.ts:69-72`),
  Combat style (`COMBAT_STYLE`). Selects with `data-action="setWorldSetting" data-setting`
  → `game.settings.set(SYSTEM_ID, key, value)`; the existing `onChange`
  handlers re-render actor apps and redraw facing. The active scene's own
  mana level, when set, is shown beside the world's as a note
  (`describeMana()`, `src/system/casting.ts:110`).
- Buttons "Rules in play…" (`new RulesSettings().render({ force: true })`,
  `src/system/apps/rules-settings.ts`) and "Compendium sources…"
  (`CompendiumSourcesSettings`), GM only.
- Notes: the `description` field as a ProseMirror editor, as the vehicle sheet
  enriches its description (`vehicle-sheet.ts:229-232`).

**Live redraw**: the `#hooks` + `#redrawSoon` pattern of
`character-sheet-v2.ts:749-788` in `_onFirstRender` / `_onClose`, listening to
`updateActor` (this party or any member), `createItem` / `updateItem` /
`deleteItem` whose parent is a member, `deleteActor` (a member), and
`updateSetting` (the world section; a world-scope setting is a `Setting`
document, foundry.mjs:58263, so the generic `update${documentName}` hook
fires on every client when the GM changes it).

**Drops**: `ActorSheetV2._onDropDocument` dispatches an Actor to
`_onDropActor(event, actor)` (foundry.mjs:125147-125152, default returns
null at :125192), so the vehicle sheet's override shape holds. Member HP
edits go through `member.update(...)`, which Foundry permits only for an
owner of that member: a player observing the party edits their own row and
nobody else's. `Actor#hasPlayerOwner` (foundry.mjs:36257) is "some non-GM
user has OWNER", which is what "Add all player characters" wants.

**Styles**: a new `src/styles/party.css` imported from `src/gworld.ts:10-11`
(vite bundles it into `gworld.css`), scoped `.gworld.party.v2`, holding only
what the V2 stylesheet lacks: the member row grid (`.party-member`), the stat
strip, the sidebar nesting (`.gworld-party-members`) and the campaign panels'
field grid (reuse `.v2-campaign-field`, `sheet-v2.css:1394`).

### 5. The sidebar

`src/system/party/sidebar.ts`, registered by `registerPartyHooks()`:

- `Hooks.on("renderActorDirectory", (app, html) => nestParties(html))`, the
  DOM-only approach of `registerSupersededPackHiding()`
  (`src/system/compendium-sources.ts:174-182`). For each party the user can
  see (`li.directory-item.entry[data-entry-id]`, template
  `E:\Foundry Virtual Tabletop\resources\app\templates\sidebar\partials\document-partial.hbs`):
  add class `gworld-party`, a fold toggle, and an `<ol class="subdirectory gworld-party-members">`;
  move each member's `li[data-entry-id]` into it (members the user cannot
  see are not in the DOM and are skipped). Fold state in a module-scope
  `Set<string>` of party ids (expanded by default), mirroring how Foundry
  keeps folder state client-side.
- Drop onto the party row: a `drop` listener on the party `li` with
  `event.stopPropagation()` (as `wireGearDrag` keeps Foundry's handler out,
  `character-sheet-v2.ts:425-454`) reading
  `foundry.applications.ux.TextEditor.implementation.getDragEventData(event)`
  (foundry.mjs:36023). The directory's drag data is
  `this.collection.get(entryId).toDragData()` (foundry.mjs:132444), i.e.
  `{ type: "Actor", uuid }`. Calls `addMembers` when the user owns the party.
  `dragover` toggles a `.gworld-party-over` highlight, as folders do.
- Search: `DocumentDirectory._onSearchFilter` (foundry.mjs:132194-132225)
  walks every `.directory-item`; a `.folder` is shown when its id is in the
  matched folder set, any other entry is shown by
  `_onMatchSearchEntry` when its `data-entry-id` matched
  (`element.style.display = "flex" | "none"`, :132180). A party `li` is an
  entry, so a search matching only a member hides the party row and the
  nested member with it. Fix: the hook adds an `input` listener on the
  directory's `search input` (the same element Foundry's `SearchFilter` binds,
  `inputSelector: "search input"`, :131610), deferred with `setTimeout` past
  Foundry's debounce, that sets a party row's `display` back to `flex` when
  any nested member `li` is displayed. Member rows keep their own
  `data-entry-id`, so Foundry's matching still applies to them unchanged.
- The hook signature is the ApplicationV2 one already relied on by
  `renderCompendiumDirectory` in `src/system/compendium-sources.ts:175`:
  `(app, html)`; it fires on every render of the directory, so the nesting is
  redone from a fresh DOM each time.
- Style: the party row reads as a folder (folder-like header, member rows
  indented with the subdirectory's left rule), in `src/styles/party.css`.

### 6. The add-on API

`game.gworld.api.party` (since 1.68.0): `of(actor)`, `membersOf(party)`,
`campaignTerms(actor)`, `addMembers(party, uuids)`, `removeMember(party, uuid)`.
Bump `API_VERSION` in `src/system/api.ts:78`, add the namespace to the frozen
surface (`:412-433`), document it in `docs/api.md` with the `(since 1.68.0)`
markers the file uses, and hook `gworld.partyChanged` (`party, members`) so
a module can react.

### 7. Docs and housekeeping

- Commit this plan as `docs/party-plan.md` (the precedent
  `docs/open-issues-plan.md`), updated with the "status" banner as the work
  lands.
- `README.md` sheet list gains the party.
- `src/system/foundry.d.ts`: add `hasPlayerOwner` and `statuses` on the Actor
  typing if missing; `_onDropActor` is already declared (`:172-185`).
- `tools/validate-packs.mjs:34` / `tools/build-packs.mjs:46` `ACTOR_TYPES`
  need nothing: no pack ships a party.
- Book-neutral check (`tools/check-book-neutral.mjs`): only Basic Set pages
  are cited (Characters pp. 10-11, 22, 235; Campaigns p. 506).

## Files

New:
- `src/system/data/party.ts`, `src/system/party.ts`, `src/system/party/roster.ts`,
  `src/system/party/sidebar.ts`, `src/system/sheets/party-sheet.ts`,
  `src/styles/party.css`
- `templates/actor/party/header.hbs`, `tab-members.hbs`, `tab-skills.hbs`, `tab-campaign.hbs`
- `src/system/__tests__/party-roster.test.ts`, `src/system/__tests__/party-terms.test.ts`
- `docs/party-plan.md`

Changed:
- `src/system.json`, `lang/en.json`, `src/gworld.ts`, `src/system/templates.ts`
- `src/system/data/character.ts` (`prepareBaseData`, `derived.campaign`)
- `templates/actor/v2/tab-progression.hbs`, `templates/actor/parts/attributes-campaign.hbs`,
  `templates/apps/character-builder.hbs`, `src/system/apps/character-builder.ts`
- `src/system/api.ts`, `docs/api.md`, `README.md`, `src/system/foundry.d.ts`

## Order of work

| PR | Contents | Why here |
| --- | --- | --- |
| A | §1 type and model, §2 index and `refreshMembers`, §4 sheet (all three tabs), §5 sidebar, tests for `roster.ts` | Usable on its own: a party that lists its members and edits the world's settings. Nothing on the character sheet changes yet. |
| B | §3 inheritance (`prepareBaseData`, `derived.campaign`, the three locked templates, the builder), §6 API, §7 docs, tests for the terms helper | Depends on A's model and index; is the behaviour change on existing sheets, reviewed apart. |

Then the release PR for v1.29.0 (`package.json` and `src/system.json` version
and download URL), per the release memory: build in a clean worktree, stop the
verification server before `npm run build`.

## Tests

Vitest, `src/system/__tests__/`, plain-object fixtures as in
`sheet-v2-overview.test.ts` (no Foundry globals):

- `party-roster.test.ts`: `memberRow` (HP/FP percent and status, defenses
  null → dash, DR splits flag, CP badge state), `partySkills` (best level per
  name, ties, specialties, untrained skipped), `partyLanguages`,
  `addMembers` / `removeMember` / `moveMember` (dedupe, order, refusal of
  vehicles and parties by type).
- `party-terms.test.ts`: `termsFrom(partySystem)` (nulls preserved,
  non-null applied), and the pure "which fields are locked" helper.

## Verification

1. `npm run lint` (eslint + book-neutral), `npm run typecheck`, `npm test`
   (baseline: all pass at v1.28.0).
2. Headless Foundry from the memory note (`E:\Foundry Virtual Tabletop`,
   port 30002+, scratchpad data dir, junction to this worktree's `dist`;
   never touch the desktop app on 30000). In `test-world`:
   - Create a Party; check Observer default for players (ownership dialog).
   - Drag two characters from the sidebar onto the party sheet and one onto
     the party's sidebar row; check the rows nest under the party, the fold
     toggle, and that a search for a member's name still shows it.
   - Wound a member from its own sheet; the party row's HP bar and status
     word follow without reopening. Edit HP from the party row; the
     character sheet follows.
   - Skills tab: best level and holder match the members' sheets; the roll
     button posts the member's roll.
   - Campaign tab: set TL 8, 250 CP, -50 limit; each member's Progression
     summary shows the values locked with "Set by <party>", the builder's
     first step likewise, the header reads TL 8, the ledger's available
     points and the limit bar follow. Clear the TL; members return to their
     own. Change the mana level and CR from the tab; Foundry's settings page
     shows the same, the Magic tab's mana note follows.
   - Remove a member; its fields unlock and it leaves the nest.
   - Log in as a player (second browser tab, a player user): the party opens
     read-only, the world panel is not shown, their own row's HP is editable.
3. `graphify update .` after the code changes (CLAUDE.md), where a
   `graphify-out/` exists for the checkout.
