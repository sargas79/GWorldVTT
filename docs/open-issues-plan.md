# Open issues: verification and implementation plan

**Status: planned, not started.** Written against `main` at v1.71.0
(`5837286`). The previous plan in this file (#526-#535) was fully implemented
and is in git history.

Seven issues are open (#967, #977-#982). Six are bug reports from a play
session. #967 is a manual check that must be done in a live world. Each report
was read against the code. Where the code shows the cause, the section names
it. Where it doesn't, the section says so and starts with a reproduction.

- [What the verification found](#what-the-verification-found)
- [Batch 1 - damage applies to the attack's target (#980)](#batch-1---damage-applies-to-the-attacks-target-980)
- [Batch 2 - the attack card names its target (#981)](#batch-2---the-attack-card-names-its-target-981)
- [Batch 3 - choosing which parry this is (#978)](#batch-3---choosing-which-parry-this-is-978)
- [Batch 4 - a to-hit modifier on ranged modes (#977)](#batch-4---a-to-hit-modifier-on-ranged-modes-977)
- [Batch 5 - pi+ wounding after DR (#982)](#batch-5---pi-wounding-after-dr-982)
- [Batch 6 - players passing their turn (#979)](#batch-6---players-passing-their-turn-979)
- [#967 - the GM Screen in a live world](#967---the-gm-screen-in-a-live-world)
- [Order of work](#order-of-work)
- [Questions for the reporter](#questions-for-the-reporter)

## What the verification found

| # | Title | Verdict | Where it lives |
| --- | --- | --- | --- |
| 980 | Damage card applies to the GM's target | Confirmed | `system/chat.ts:443` (`applyFromCard` → `currentTargets()`) |
| 981 | Attack card should show the target | Confirmed | `system/chat.ts:959` (defenders shown to owners only) |
| 978 | Multiple-parry penalty always applied | Confirmed (by design today) | `system/chat.ts:1146`, `countDefense` at `chat.ts:1540` |
| 977 | Reflex sight bonus not counted | Probable cause found | ranged rows carry no `hitModifier`: `data/character.ts:2865` vs melee at `:2689` |
| 982 | pi+ multiplier not applied after DR | Not reproduced from the code; the rules functions are correct | `rules/damage.ts:293`, `rules/hit-locations.ts:182` |
| 979 | Some players can't pass their turn | Not reproduced; one candidate cause | `system/combat.ts:39` (`_sortCombatants`) |
| 967 | GM Screen live check | Manual QA, needs a person in Foundry v14 | n/a |

Two findings matter for the order of work:

**#980 and #981 need the same new data.** An attack card today records its
defenders only in the defense flag (`roll.ts:1295`), and only when there are
targets. The damage roll has no link back to the attack. Both fixes need the
attack's targets saved once at attack time and read later, so they share
Batch 1's plumbing.

**#977 touches book-neutrality.** Reflex sights are not in the Basic Set, so
the system must not name them (`CLAUDE.md`; `npm run lint` enforces it). The
system-side fix is generic: a ranged mode needs the same per-mode to-hit
modifier a melee mode already has. Whatever module supplies the sight then
fills that field in, or adds a line through the existing
`gworld.attackModifiers` hook.

---

## Batch 1 - damage applies to the attack's target (#980)

**Cause.** `applyFromCard` (`chat.ts:424`) calls `currentTargets()`, which
reads `game.user.targets`. Those are the targets of the person who clicks
Apply, usually the GM, not the targets the attacker chose.

**Change.**
1. When an attack is rolled, save its target tokens (token UUID plus the
   displayed name) on the attacker as a pending "last attack targets" record.
   Use the same consume-once state pattern the damage roll already uses for
   `consumeCalledShot`, `consumeHalfDamage` and the rest (`roll.ts:5200-5230`),
   keyed by the attack row (`shotRow(itemRow)`) so two weapons don't mix.
2. `handleDamageAction` consumes the record and writes `targets: [{ tokenUuid,
   name }]` onto the damage card's `DamageFlag` (`chat.ts:94`). A damage roll
   with no prior attack (rolled directly from the sheet) falls back to the
   roller's current targets at roll time, which is still better than the
   clicker's targets at apply time.
3. `applyFromCard` resolves `flag.targets` with `fromUuid`. It uses
   `currentTargets()` only when the flag has none: old cards, area/blast
   damage, or damage the GM wants to redirect.
4. Redirecting: if the clicker has targets that differ from the recorded
   ones, apply to the recorded ones and add a small "apply to my targets
   instead" control on the card. This keeps the old behaviour one click away
   for a GM who uses it on purpose.
5. Blasts and area attacks keep using the clicker's targets, since the victims
   are chosen after the roll. Keep that branch explicit and tested.

**Tests.** A damage card applies to the recorded token, not to
`game.user.targets`. It falls back when nothing is recorded. Two tokens of one
linked actor still take the damage once (`seen` set, `chat.ts:556`). A blast
still uses current targets.

**API.** The new `DamageFlag.targets` field is readable by modules, so bump
the API minor version and document it in `docs/api.md`.

## Batch 2 - the attack card names its target (#981)

**Cause.** `addDefenseControls` (`chat.ts:942`) adds a row per defender only
for users who own that defender (`if (!defender?.isOwner) continue`), so
everyone else sees no target at all. The success-roll template
(`templates/chat/success-roll.hbs`) has no target line.

**Change.**
1. Using the targets saved in Batch 1, render a "Target: <name>" line
   (`GWORLD.Chat.AttackTarget`, "Target: {names}") on every attack card, for
   every viewer, above the defense rows.
2. Use the **token's** display name rather than the actor's. Respect the
   token's name-visibility setting: if a player couldn't see the name by
   hovering the token, show "Unknown"/"a target" (`GWORLD.Chat.UnknownTarget`)
   instead of leaking an NPC's name. Show the GM the real name either way.
3. Show the line on misses too. A miss against Bob is still worth knowing.
4. The owner's defense row keeps its own name line. Skip the duplicate when
   there is exactly one target and the viewer owns it.

**Tests.** A render test for an owner, a non-owner and the GM. Test a hidden
name. Test several targets.

## Batch 3 - choosing which parry this is (#978)

**Cause.** Each parry adds to a per-weapon count stored for the turn
(`countDefense`, `chat.ts:1540`). The next parry takes
`multipleParryPenalty(count)` automatically (`multipleParryLines`,
`chat.ts:1566`). Nothing lets the player say "that click was a mistake" or "this
is really my first parry". Pressing Parry again on the same attack, for a
re-roll or a misclick, also counts twice.

**Change.**
1. Add a small "Parry #" selector to the defense row, next to the Retreat
   checkbox (`chat.ts:1190` is the pattern). Show it only when a parry is on
   offer. It defaults to the counted number + 1, and choices run from 1st to
   one past the default. The chosen number drives both the penalty line and
   the number stored afterwards (count = chosen), so the next parry follows
   on from what the player picked.
2. Count once per attack: save the attack message id with the count. A second
   parry against the same message replaces the count instead of adding to it.
3. Add the same selector to the bare-handed parry (`chat.ts:1165`), which
   shares the logic.
4. The `defenseCounts` passed to the defense hooks (`chat.ts:1126`) reflects
   the chosen number, so modules see what the player chose.

**Tests.** The default matches today's behaviour (no change for anyone who
ignores the selector). Choosing 1st removes the penalty and resets the count.
Re-parrying one attack doesn't stack. Fencing and Trained By A Master halving
still apply to the chosen number.

## Batch 4 - a to-hit modifier on ranged modes (#977)

**Finding.** A melee mode has `skillModifier` (`data/items.ts:743`), which
reaches the roll as `hitModifier` (`character.ts:2689` → `roll.ts:926`). A
ranged mode has no such field, and the ranged row (`character.ts:2865`)
carries no `hitModifier`. The only aim-related ranged figures are `accuracy`
and `scopeBonus`, and both count only after an Aim maneuver. A sight that
gives a bonus to skill, rather than to Acc, has nowhere to go, which fits the
report "bonus is not being accounted in automatic calculations".

**Change (system, book-neutral).**
1. Add `skillModifier` to the ranged mode schema, with the same doc comment
   as the melee one, minus the parry note. Default 0, no migration needed.
2. Put it on the ranged row as `hitModifier` and pass it through
   `attack-ranged-roll.hbs` as `data-hit-modifier`, as the melee template
   already does, so `standingRollLines` lists it as "Weapon to-hit".
3. Show it on the item sheet's ranged mode editor, next to Acc and scope.
4. Add it to the shapes `combat-extensions.ts:305` sanitises for module
   records, and to `docs/api.md`, with an API minor bump.

**Change (add-on side, not in this repo).** The module that defines reflex
sights sets the weapon mode's `skillModifier` (or `accuracy`/`scopeBonus`,
whichever its book's rule says), or adds a line through
`gworld.attackModifiers`. The issue can close once the system side lands and
the reporter confirms how their sight was entered (see the questions below).
If it was typed into a field that already exists and still didn't count, that
is a separate bug, and this batch is revisited.

**Tests.** A ranged row carries the mode's modifier. The attack roll's
breakdown lists it. A zero modifier adds no line.

## Batch 5 - pi+ wounding after DR (#982)

**What the code says.** `computeInjury` (`rules/damage.ts:293`) subtracts DR,
then multiplies the penetrating damage by the wounding modifier. pi+ is 1.5 in
`WOUNDING_MODIFIERS` and in `woundingModifierAt` for the torso. That function
caps pi+ at x1 on an arm, leg, hand or foot, which is the Basic Set rule
(Campaigns p. 399). The rules layer looks right, so the bug, if there is one,
is in what reaches it. Possible causes, to check in this order:

1. **A limb hit.** x1 there is correct, and the applied-damage card should
   say why ("x1 on a limb"), so the next report doesn't come in.
2. **A loaded round's type replacing the weapon's.** With the
   `ammunitionTypes` rule on, `character.ts:2894` uses
   `round?.damageType ?? mode.damageType`. A round whose type was left at a
   default (e.g. `pi`) turns a pi+ gun into pi. Check how the round's
   `damageType` defaults, and whether a blank round type should fall back to
   the mode.
3. **Injury Tolerance or a module's override.** Unliving/Homogeneous
   (`toleratedWoundingModifier`) and the `woundingOverride` passed for internal
   blasts replace the modifier. Correct for those targets, but invisible on
   the card.
4. **The display.** The applied card may show the right injury but no "x1.5"
   step, so it looks like none was applied.

**Change.** First, a failing test through `applyDamageToActor` with a pi+ blow
to the torso through DR, plus the reporter's actual case. Then fix whichever
cause it turns out to be. Whatever the cause, show the wounding modifier, and
the reason when it isn't the type's base value, on the applied-damage card.
That removes this class of confusion.

## Batch 6 - players passing their turn (#979)

**What the code says.** The system doesn't override `nextTurn`, and none of
its `updateCombat` listeners veto anything. Ending a turn is Foundry core:
a player may advance the turn only while they own the current combatant.

**A candidate cause.** `GWorldCombat._sortCombatants` (`combat.ts:39`) breaks
Basic Speed ties on DX read from `combatant.actor`. A player who can't read
another combatant's actor (no permission, or an unlinked token) gets `null`
for that DX, so on their client the tie sorts differently from the GM's. The
player's "next turn" index is computed against their own order, so it can
point at a different combatant. Foundry may then reject the update or advance
to the wrong turn. "Some players" fits this: only parties with tied Basic
Speed would see it.

**Plan.**
1. Reproduce in a world with two combatants on the same Basic Speed: one
   player-owned, one NPC the player can't observe. If the candidate holds,
   the order shown to the player differs from the GM's.
2. Fix: make the tie-break readable on every client. Store each combatant's
   DX on the combatant (a flag the GM writes when initiative is rolled or the
   actor's DX changes) and sort on that, not on `combatant.actor`.
3. If it doesn't reproduce, collect from the reporter: which players, whether
   it's their own turn, ownership level on their token, and any console
   error. Ownership of the combatant (player's token is unlinked with the
   player owning only the base actor, or vice versa) is the next suspect.

**Tests.** A sort test where one combatant's actor is unreadable gives the
same order as when it is readable, once the stored DX is used.

## #967 - the GM Screen in a live world

This is a checklist for a person clicking through Foundry v14, and no code
change is planned. What can be done from here: run the GM Screen's template
render in the headless browser again on the current build to confirm nothing
regressed since v1.69.0. Any failure the live check finds gets its own issue
under #840, as the issue says.

## Order of work

1. **Batch 1 (#980)**: adds the saved attack targets that Batch 2 reuses.
2. **Batch 2 (#981)**: small once Batch 1 is in.
3. **Batch 4 (#977)**: self-contained schema/plumbing change.
4. **Batch 3 (#978)**: UI on the defense card, independent.
5. **Batch 5 (#982)** and **Batch 6 (#979)**: start each with its
   reproduction. Fix only once a failing test or a reproduction confirms the
   cause.

One commit per batch. Run `npm run typecheck`, `npm run lint` (including the
book-neutral check) and `npm test` before each. Batches 1, 2 and 4 change
module-visible data, so each bumps the API minor version and updates
`docs/api.md`.

## Questions for the reporter

- **#977:** Where does the reflex sight come from (which module, or typed in
  by hand), and which field holds its bonus?
- **#982:** Which weapon and ammunition, which hit location, and what did the
  applied-damage card say?
- **#979:** Which players, and does it happen only on their own turn? Do they
  own the token or only the actor? Any console error?
