# Open issues: verification and implementation plan

**Status: implemented.** All seven batches below have been built on
`claude/open-issues-review-plan-ctvifd`, one commit each, in the order given.
Two things changed from the plan during the work and are recorded here rather
than left to the commits: #533's field is stepped by buttons rather than the
browser's spinner (which can only move by one, and so cannot express a cost
table), and #526's helper identifies a field by `name` *or* `id`, because the
builder's fields carry no name -- one there would submit onto the actor on
every keystroke. #534 ships with one open question, flagged at the end of its
section.

Written against `main` at v1.26.0 (`256d42f`). Baseline at the time of writing:
`npm run typecheck`, `npm run lint` and `npm test` (172 files, 2560 tests) all
pass, so every failure a change below produces is that change's own.

Ten issues are open in this repository (#526-#535). None are open in
`compendium-manager`. Each was re-read against the code rather than taken from
its triage note; where the note and the code disagree, the code is recorded
here.

- [What the verification found](#what-the-verification-found)
- [Batch 1 - the trait editor (#530, #531, #529)](#batch-1---the-trait-editor-530-531-529)
- [Batch 2 - the builder window (#527, #528)](#batch-2---the-builder-window-527-528)
- [Batch 3 - skill points in the picker (#533)](#batch-3---skill-points-in-the-picker-533)
- [Batch 4 - focus across a re-render (#526)](#batch-4---focus-across-a-re-render-526)
- [Batch 5 - compendium styling (#532)](#batch-5---compendium-styling-532)
- [Batch 6 - the roll dialog (#535)](#batch-6---the-roll-dialog-535)
- [Batch 7 - undoing damage (#534)](#batch-7---undoing-damage-534)
- [Order of work](#order-of-work)

## What the verification found

| # | Title | Verdict | Where it lives |
| --- | --- | --- | --- |
| 526 | Focus lost when tabbing attributes | Confirmed | `sheets/character-sheet.ts:421` |
| 527 | Builder header overlaps template options | Confirmed, cause differs from triage | `styles/sheet-v2.css:1571-1631` |
| 528 | Builder content does not scroll | Partly stale | `styles/sheet-v2.css:1631` |
| 529 | Quirks added at 0 CP | Confirmed, classic sheet only | `sheets/character-sheet.ts:3170` |
| 530 | `None` self-control option unclear | Confirmed, and it is a data-corrupting bug | `sheets/item-sheet.ts:448` |
| 531 | Self-control defaults to 6 | Confirmed; the stored default is already correct | `data/items.ts:232` |
| 532 | Compendium styling off-theme | Confirmed | `styles/gworld.css:1308+` |
| 533 | Skill levels priced +1 at a time | Confirmed | `picker-merge.ts:65` |
| 534 | No undo for damage | Confirmed | `damage.ts:596` |
| 535 | No pre-roll effective level | Confirmed, smaller than triage suggests | `roll.ts:1992`, `roll.ts:3196` |

Three findings change the shape of the work and are worth stating up front.

**#528 is mostly already fixed.** The triage note asks for a builder body that
is its own scroll container. `styles/sheet-v2.css:1631` already declares
`.gb-body { flex: 1 1 auto; min-height: 0; overflow-y: auto }` between a header
and a `.gb-foot`, the window is a fixed 760x720, and
`character-builder.ts:112` registers `scrollable: [".gb-body"]`. What is
missing is not the scroll container but the `flex: none` on its siblings - the
same defect that causes #527. The two issues are one fix, as triage suspected,
but for a different reason than triage gave.

**#527 is a flex-shrink overflow, not a z-index problem.** `.gb` is a flex
column. `.gb-header`, `.gb-steps` and `.gb-foot` never set `flex`, so they keep
the default `flex-shrink: 1`. When a long template makes `.gb-body` taller than
the window, the browser distributes the shrinkage across every sibling in
proportion to its base size, so the header is squeezed below the height its own
content needs. The 56px portrait and the title then paint outside the header's
box and over whatever is beneath it. No stacking context is involved, and
raising a `z-index` would not move anything.

**#531's requested change would be wrong as literally stated.** A new trait is
already stored with `selfControl: null`, which prices at x1 - the field is
`initial: null` at `data/items.ts:232`. Making 12 the stored default for every
trait would give every advantage and every ordinary disadvantage a self-control
roll it does not have. The 6 the reporter sees is #530's rendering bug, not a
default. The plan therefore fixes the display and preselects 12 only where a
self-control number is actually being turned on, and says so on the issue.

## Batch 1 - the trait editor (#530, #531, #529)

One batch: #530 and #531 are the same defect, and #529 is a one-line default in
the same area.

### #530 / #531 - the self-control dropdown

`sheets/item-sheet.ts:448` builds the choices as an object:

```ts
selfControl: { "": "...NoSelfControl", "6": "...", "9": "...", "12": "...", "15": "..." }
```

JavaScript orders integer-like keys first and in ascending numeric order, so
iteration yields `6, 9, 12, 15, ""` and the select renders **None last**. The
template (`templates/item/item-sheet.hbs:407`) passes
`selected=system.selfControl`, which is `null` for a trait with no roll, so
nothing matches and the browser falls back to displaying the first option - 6.
The sheet submits on change, `item-sheet.ts:604` only coerces `""` back to
`null`, and a plain save therefore writes `selfControl: 6`. A trait with no
self-control roll silently becomes one priced at x2. This is a data-corrupting
bug, not just a labelling question.

Fix:

1. Build `choices.selfControl` as an ordered array of `{ value, label }` with
   None first, so the rendered order is None, 6, 9, 12, 15.
2. Make the None option genuinely selected when the value is `null`, rather
   than relying on the browser's fallback.
3. Add the tooltip #530 asks for on None - "no self-control roll" - as a new
   `GWORLD.Trait.NoSelfControlHint` key in `lang/en.json`. `NoSelfControl`
   ("None") and the numbered labels already exist at `lang/en.json:1269+`.
4. For #531: when the trait is a disadvantage and a self-control number is
   being turned on, preselect 12 - the book's x1 standard - rather than 6.
   `category` is already one of `advantage | disadvantage | quirk | perk`
   (`data/items.ts:191`), so the condition is available in the sheet context.

Not migrating existing data: a trait saved at 6 by this bug is indistinguishable
from a 6 the user meant. Silently rewriting real choices is worse than leaving
the stale ones, so this goes in the release notes instead of a migration.

Tests: a unit test over the choice builder asserting None is first and is
selected for `null`, and that a disadvantage turning the roll on offers 12.
`rules/traits.ts:99` already prices `null` at x1 and has coverage.

### #529 - quirks at 0 CP

Confirmed, and only on the classic sheet. `picker-merge.ts:168` already gives a
custom quirk `points: -1` and a perk `points: 1`, so the V2 sheet's **Add
Quirk** is correct. The classic sheet's `#onCreateItem`
(`character-sheet.ts:3170`) builds `{ name, type }` plus `category` and nothing
else, so the quirk takes the field's `initial: 0`.

Fix: have `#onCreateItem` reuse `customItemData` from `picker-merge.ts` so both
paths read one source for the defaults. That satisfies the issue's "confirm the
default follows the configured GURPS quirk value" without introducing a second
table.

Test: extend the existing picker-merge coverage to the sheet path - creating
through `#onCreateItem` with `category: "quirk"` yields -1, and `perk` yields 1.

## Batch 2 - the builder window (#527, #528)

One CSS change in `styles/sheet-v2.css` covers both:

1. Give `.gb-header`, `.gb-steps` and `.gb-foot` `flex: none` so they hold their
   natural height and cannot be squeezed into their own content. This stops the
   header painting over the step options (#527) and leaves all the surplus
   height to `.gb-body`, which already scrolls (#528).
2. Keep `.gb-body`'s existing `flex: 1 1 auto; min-height: 0; overflow-y: auto`.
3. Verify the scrollbar is visible rather than only functional, which is what
   #528's acceptance criteria ask for.

Check at the default 760x720 and at the two container breakpoints the file
already defines (700px and 560px, `sheet-v2.css:1735+`), with a long template
whose options fold. The Capoeira template named in #527 ships with an add-on, so
reproduce with any template long enough to overflow; per `CLAUDE.md` neither the
module nor the template may be named in `src`, `templates`, `lang` or
`packs-src`, and this plan is the only place the name appears.

No unit test - this is layout. The verification is manual at the three widths.

## Batch 3 - skill points in the picker (#533)

Confirmed. `templates/apps/compendium-picker.hbs:44` renders
`<input type="number" min="1" step="1">`, and `previewCost`
(`picker-merge.ts:65`) returns `Math.max(0, Math.floor(amount))` for a points
entry - the typed number is spent verbatim. The spinner therefore walks
1, 2, 3, 4, and 3 or 5-7 points buy nothing the step below does not.

The rules layer already holds the table: `nextSkillPoints` and
`previousSkillPoints` (`rules/skills.ts:308`, `:329`) give 1, 2, 4, 8, then +4,
and the V2 sheet's Progression tab uses them. Techniques have their own table -
`nextTechniquePoints` / `previousTechniquePoints` (`:353`, `:359`) - and share
the same field, so they need the same treatment.

Fix:

1. Step the field through the real totals instead of by one. Drive the spinner
   from `nextSkillPoints` / `previousSkillPoints` for skills and spells, and
   from the technique pair for techniques, dispatching on `amountKind`
   (`picker-merge.ts:51`).
2. Snap a typed off-table value down to the step that actually buys it, so a
   typed 5 becomes 4.
3. Show the resulting relative level beside the cost, which is #533's "display
   the next cost before the user confirms".

`compendium-picker.ts:296` already re-prices a row in place on `input` without
re-rendering, so the live display has a home; the snap belongs on `change` so it
does not fight the user mid-keystroke.

Tests, as the issue asks: the price at Easy, Average, Hard and Very Hard, plus
off-table input snapping down, plus the technique table.

## Batch 4 - focus across a re-render (#526)

Confirmed. `character-sheet.ts:421` sets `form: { submitOnChange: true }`, so
editing an attribute submits, the actor updates, and the sheet re-renders -
replacing the element `Tab` just reached. Nothing in `src/system` restores
focus: the only `.focus()` in the tree is the picker's search box
(`compendium-picker.ts:326`), and there is no `activeElement` handling anywhere.

Fix: one helper, used by every sheet rather than copied. Before a render,
record the active element's `name`, its `selectionStart`/`selectionEnd` and
whether it is inside the sheet; after the render, find the field with that
`name` and restore focus and selection. Apply it in `character-sheet.ts` so
`character-sheet-v2.ts` (which extends it, `character-sheet-v2.ts:77`) and
`npc-sheet.ts` inherit it, and in `character-builder.ts` for the Guided Build.

Two points to get right:

- The `Tab` case needs care: at the moment the sheet re-renders, focus may have
  already moved to the *next* field, so the name to restore is whatever is
  active when the render begins, not the field that was edited.
- Restore only when focus was inside this sheet, so a background re-render
  cannot steal focus from another window.

The issue's alternative - debouncing recalculation until the edit completes -
is the larger change and would delay the point totals the sheet is built
around. Restoring focus is the smaller fix and is what the picker already does.

Tests: a unit test over the save/restore helper. The `Tab` behaviour itself is
manual, on both sheets and the builder.

## Batch 5 - compendium styling (#532)

Confirmed. The picker's styles live in `styles/gworld.css:1308+` and read
Foundry's core tokens - `--color-accent`, `--color-text`,
`--color-neutral-800`, `--color-warning`. The V2 sheet's tokens are a separate
set (`--v2-frame`, `--v2-panel`, `--v2-gold`, ...) declared at
`styles/sheet-v2.css:16` under the `.gworld.v2` selector.

The blocker worth knowing before starting: those tokens are **scoped to
`.gworld.v2`**, and the picker registers `classes: ["gworld", "gworld-picker"]`
(`compendium-picker.ts:120`) while the sources app registers
`["gworld", "gworld-rules"]` (`compendium-sources.ts:34`). Neither carries
`v2`, so the variables do not resolve there today. Resolve this first - either
add `v2` to both apps' classes, or hoist the token block to a selector both
reach - then restyle. Do not copy the hex values into `gworld.css`; #532 asks
for shared tokens, and a second copy would drift.

Scope, per the issue and the triage note: the picker
(`templates/apps/compendium-picker.hbs`), the sources app
(`templates/apps/compendium-sources.hbs`), and the pack-directory styling the
system adds. Foundry's own compendium windows stay untouched. Cover list views,
search, filters, entry details, and the loading and empty states - the picker
already has `.gp-loading` and `.gp-spinner` rules to carry over. Keep contrast
and focus states accessible; `.gp-amount input:focus` currently relies on
`--color-accent` and needs an equivalent under the new tokens.

## Batch 6 - the roll dialog (#535)

Confirmed, and smaller than the issue implies, because the breakdown already
exists after the roll: `templates/chat/success-roll.hbs:7-13` prints base, each
signed modifier with its label, and the effective target, and `roll.ts:416`
computes `effective = base + totalModifier`.

The gap is strictly pre-roll, and it is narrower than "there is no dialog".
There are already rich prompts - `promptForRangedAttack` (`roll.ts:1992`) and
`promptForMeleeAttack` (`roll.ts:2643`) - but they collect *inputs* (range,
aim, shots, posture) and compute the modifiers afterwards, in `rangedModifiers`
(`roll.ts:2294`), called at `roll.ts:1906` and `:2215` once the dialog has
closed. The dialog contains no listeners at all, so nothing updates as the
player types. Outside those prompts, a shift-click gets
`maybePromptModifiers` / `promptForModifier` (`roll.ts:3196`, `:1181`), which
asks for a single number.

Fix, in the order that keeps each step shippable:

1. Extract the modifier assembly so the same `RollModifier[]` the chat card is
   built from can be computed from the dialog's current field values, before
   the roll. This is the load-bearing step: it is what stops the dialog and the
   card disagreeing.
2. Add listeners to the existing attack prompts that recompute on every change
   and render a live "base -> modifiers -> effective" block, each line naming
   its source and signed value.
3. Mark each line automatic or manual, as the issue asks, and let situational
   modifiers be added and removed in the dialog rather than through the
   single-number prompt.
4. Keep the final breakdown on the chat card, which it already does.

Tests: the extracted assembly is pure and testable at the unit level - the same
inputs must yield the same lines the card prints. The dialog itself is manual.

## Batch 7 - undoing damage (#534)

Confirmed as a real gap. `applyDamageToActor` (`damage.ts:596`) writes
`system.hp.value` or `system.fp.value`, spends ablative DR by updating each
armour item's `system.drLost` (`spendAblativeDr`, `damage.ts:639`), clears aim
via `loseAim`, and fires the `afterDamage` combat hook. `takeInjury`
(`damage.ts:684`) additionally calls `syncHealthConditions`. Nothing records
what changed, and the only undo in the system is `undoKnockdown`
(`knockdown.ts:114`, exposed at `api.ts:222`).

This is the largest of the ten and needs a design before code. Proposed shape:

1. **Record a transaction.** Have `applyDamageToActor` return, and store on the
   damage chat card, the actor's changed fields before and after: the HP or FP
   value, each armour item's `drLost`, the conditions `syncHealthConditions`
   added or removed, and the aim state. This is the "sufficient transaction
   data" the issue asks for, and it is the step everything else rests on.
2. **Offer Undo on the card**, GM-only, so it is tied to one specific damage
   application rather than a global stack.
3. **Refuse rather than clobber.** If any recorded field has changed since,
   Undo declines and says why. This is what keeps the issue's "do not undo
   unrelated user changes" honest - a blind restore of the before-state would
   silently discard whatever happened in between.
4. **Expose it through `game.gworld.api`** alongside `undoKnockdown`, so a
   module's damage path can record and reverse the same way.

Scope note: the issue also lists death checks and combat-log entries. Death
checks are rolls that were made, not state that was set, so undo should restore
the state the check changed and leave the roll's card standing; the combat log
should gain an entry saying the damage was reversed rather than losing the
original. Worth confirming with the issue author before building, since it
changes what "the exact prior state" means.

Tests: round-trip coverage - apply, undo, assert the actor and its armour match
the prior state exactly; and the refusal path, where a field changed in between
and undo declines.

## Order of work

Sequenced so the cheap, self-contained fixes land first and the two designs come
last. Sizes are relative effort, not hours.

| Order | Batch | Issues | Size | Why here |
| --- | --- | --- | --- | --- |
| 1 | Trait editor | #530, #531, #529 | XS | Data-corrupting; one area, one PR |
| 2 | Builder window | #527, #528 | XS | One CSS rule fixes both |
| 3 | Picker points | #533 | S | Rules layer already has the tables |
| 4 | Focus | #526 | S | One helper, several call sites |
| 5 | Compendium styling | #532 | M | Needs the token-scope decision first |
| 6 | Roll dialog | #535 | L | Extraction first, then UI |
| 7 | Damage undo | #534 | L | Needs a design agreed before code |

Batches 1-4 are independent and can go in any order or in parallel. Batch 5
should not start until the `.gworld.v2` token-scope question is settled, since
that decision shapes every rule in it. Batches 6 and 7 are the two that warrant
agreement on scope before implementation - #535 on how much of the automatic
modifier set the first dialog covers, #534 on what "exact prior state" includes.

Each batch runs `npm run lint` (which includes the book-neutral check),
`npm run typecheck` and `npm test` before its push, and `graphify update .`
after code changes, per `CLAUDE.md`.
