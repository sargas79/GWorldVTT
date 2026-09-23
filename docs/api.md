# Add-on modules

A module adds a book to GWorld in two parts: packs of records (traits, skills,
spells, gear) and rules registered through `game.gworld.api`.

- [Packs for another book](#packs-for-another-book)
- [The add-on API](#the-add-on-api)
- [A module's own rules](#a-modules-own-rules)
- [Combat extension points](#combat-extension-points)
- [Data extension points](#data-extension-points)
- [Sheet and chat extension points](#sheet-and-chat-extension-points)
- [Point pools, energy sources, spell attacks and resistance](#point-pools-energy-sources-spell-attacks-and-resistance)
- [Inside the system's own procedures](#inside-the-systems-own-procedures)
- [The party](#the-party)
- [Taking over data the system is dropping](#taking-over-data-the-system-is-dropping)

## Packs for another book

The system's packs are built from the GURPS Character Assistant (GCA) data file
for the Basic Set. A module can build another book's packs with the same tools.
The sheet, the compendium picker and the guided build read them alongside the
Basic Set's.

1. Build the JSON from the book's GDF file, giving its page prefix, its title
   and the output directory:

   ```bash
   node tools/parse-gdf.mjs "My Book.gdf" --prefix XX --book "My Book" --out my-module/packs-src --overlap my-module/overlap.txt --write
   ```

   Only records citing that book's pages are written, one file per pack
   (`advantages/my-book-advantages.json`, `skills/my-book-techniques.json`,
   and so on), with references reading "My Book p. N". Records the book
   reprints from the Basic Set are skipped, and `--overlap` lists them.
   Running the tool again over the same `--out` keeps existing ids, so
   characters that use those entries stay linked.

   With no options, the tool regenerates the system's own `packs-src` from the
   Basic Set.

   For a book that only has spells, use the spells tool with the same options:

   ```bash
   node tools/parse-gdf-spells.mjs "My Spells.gdf" --prefix YY --book "My Spells" --out my-module/packs-src --pack spells --write
   ```

2. Validate and compile the packs:

   ```bash
   node tools/validate-packs.mjs --src my-module/packs-src
   ```

   ```bash
   node tools/build-packs.mjs --src my-module/packs-src --out my-module/packs
   ```

3. Declare each pack in the module's `module.json` as an `Item` pack with
   `"system": "gworld"`. Give every pack of one book the same
   `"flags": {"gworld": {"book": "my-book", "bookTitle": "My Book"}}`, and
   **Configure Settings → Compendium sources** shows the book as one row with
   one switch.

A trait the book makes the player specify -- Compulsive Behavior, Intolerance,
Phobia, Weapon Master -- carries `needsSpecialty: true`, and the sheet and the
guided build then ask what it is of and keep the answer in `specialty`, shown
after the name as the book writes it. The parser sets the flag from GCA's own
input prompts (`#InputToTag(...)`) and from the Basic Set list in
`tools/specified-traits.mjs`; a book whose data file carries no prompt for such
a trait can set the flag on the record by hand, and `validate-packs` checks that
the Basic Set's names carry it wherever they appear.

A spell record holds statistics only: colleges, class, cost, time, duration,
the Magery it needs, and a prerequisite line the sheet can parse, such as
`Magery 1, Create Fire, Shape Fire or Seek Fire`, `6 Air spells`,
`spells from 10 colleges`, `IQ 13`, `Empathy (advantage)` or
`Locksmith (skill)`. Spells entered by hand on an item sheet use the same
format. When two packs have a spell with the same name, the picker shows which
pack each row comes from. Adding a spell the character already has raises its
points instead of adding a copy.

## The add-on API

A module uses `game.gworld.api` and the hooks below, and nothing else:

- **Versioning.** `game.gworld.api.version` is the API's own semver version,
  separate from the system's. Additions raise the minor version; changes and
  removals raise the major version.
- **Supported surface.** The system's classes, sheets and data models are not
  part of the API and can change in any release. Don't patch or subclass them,
  and don't import the system's source at runtime. Write only to your own Item
  and Actor types, your own `system.extensions.<module>` data, your own flags
  and settings, and your own rule keys.
- **No module names in the system.** No module id, book name or book page
  appears in the system. Everything a module adds comes through registration.

Contents:

| Member | Purpose |
|---|---|
| `version` | The API's semver version. |
| `satisfies(range)` | Whether this API meets a semver range. |
| `hooks` | The names of the hooks below. |
| `rules` | The Basic Set's pure rules: dice, success rolls, contests, damage, hit locations, maneuvers, skills, costs. Since 1.12.0 it no longer includes the rule group removed in system 1.5.0. Since 1.17.0 it includes every rules module, including attack options (slams, evading), explosions, the tactical rules and shield damage. |
| `registry` | `registerRuleGroup`, `registerRule`, `namespacedRuleKey`, `isAddonRuleKey`, `isRuleOn`, `activeRules`. |
| `roll` | `success`, `damage`, `quickContest`, `regularContest`, posted as the system's chat cards. |
| `actors` | Read-only: `derived`, `attribute`, `skillLevel`, `defenses`, `basicLift`, `encumbrance`. Also `applyCondition`, `removeCondition` and `conditions` (since 1.5.0), `applyInjury` (since 1.8.0), `setPosture(actor, posture)` (since 1.16.0), `stopBleeding(actor)` (since 1.36.0), `dosePoison`, `activePoisons`, `advancePoison` and `clearPoison` (since 1.57.0), `firstAid`, `attendPatient`, `operate` and `rollMortalWound` (since 1.60.0), `resuscitate`, `treatPoison` and `treatIllness` (since 1.77.0), `loseAim(actor, reason)` (since 1.87.0), and `recoveryHold(actor, id)` (since 1.89.0). |
| `items` | Read-only: `derived`. `load(item, modeIndex, shots)` (since 1.28.0) loads a ranged mode immediately, with no Ready maneuver and no chat card, up to its capacity and across a shared magazine. It returns the new count, or null if the mode has no count or the user doesn't own the item. `malfunction(item)`, `setMalfunction(item, malfunction)` and `clearMalfunction(actor, item)` (since 1.71.0) read, set and clear what put a weapon out of action. `refundShots(item, modeIndex, shots)` (since 1.83.0) gives a ranged mode back shots an attack took, for a rule that decides the attack fired nothing after all: up to its capacity, across a shared magazine, and nothing where Infinite Ammunition kept the count; it returns the new count, or null as `load` does. `restoreDr(item, points)` (since 1.59.0) gives a piece of armour back up to `points` of the ablative DR it has spent, and returns the new `drLost`, or null for an item that isn't armour or a user who doesn't own it. `objectStats(item)` (since 1.90.0) returns a weapon's or shield's DR, HP and HT as an object, `{ kind, dr, hp, ht, notes }`, as the system uses them once `gworld.objectStats` listeners have had their say. `legalityClass(item)` (since 1.95.0) returns an item's Legality Class, 0-4 or null, once `gworld.legalityClass` listeners have had their say. |
| `combat` | Combat extension points (since 1.1.0). |
| `data` | Data extension points (since 1.2.0). |
| `sheets`, `chat` | Sheet and chat extension points (since 1.3.0). |
| `points`, `magic` | Point pools, energy sources and spell attacks (since 1.4.0), and resistance cards (since 1.9.0). |
| `migration` | Moving world data from the system into a module (since 1.6.0). |
| `world` | Facts about the campaign world (since 1.77.0): `controlRating()`. See [The campaign world](#the-campaign-world). |

Since 1.5.0, `combat`, `roll` and `actors` also carry the procedure extension
points described under [Inside the system's own procedures](#inside-the-systems-own-procedures).

Lifecycle, in order:

1. `gworld.registerRules`, during `init`: register rule groups and switches.
2. `setup`: rule registration closes.
3. `gworld.ready`, after the system's own `ready` work, with the API as its
   argument: the world is loaded and the whole API is usable.

Declare the API versions your module supports in its manifest. The GM gets a
warning if the running system doesn't match:

```json
"flags": { "gworld": { "apiVersion": "^1.0.0" } }
```

`npm run build` writes the API's TypeScript declarations to
`dist/gworld-api.d.ts`.

## A module's own rules

Rules from other books belong to the module that carries the book. Their
switches appear on the same **Rules** page as the system's. Register a group
and its switches in the `gworld.registerRules` hook:

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

- **Keys are namespaced.** The switch above is stored and read as
  `my-module.myRule`. System keys never contain a dot, so a module can't
  overwrite one.
- **Registration closes at `setup`.** Register from the hook, or from your
  module's `init` through `globalThis.gworld.registry`. Late registrations,
  duplicate keys, rules in a group the module didn't register, and rules
  missing a name, reference or default are refused with a console warning.
- **Reading a switch:** `game.gworld.api.registry.isRuleOn("my-module.myRule")`.
  A key whose module isn't active reads as off.
- **Disabling a module keeps its settings.** Saving the Rules page keeps the
  stored switches of inactive modules.
- **Reference pages.** A journal entry flagged
  `flags["my-module"].rule = "myRule"` (or `"my-module.myRule"`) is linked
  from the switch.
- **Pending rules.** `implemented: false` shows a rule greyed out and
  unswitchable.

## Combat extension points

`game.gworld.api.combat` lets a module add to combat. Every registration names
its module and a key, stored as `<module>.<key>`. Each takes an optional
`available` check (usually "is my switch on"); when it returns false, the
option isn't offered. Errors thrown by a registration are logged and skipped,
and the roll continues.

- **`registerAllOutAttackOption({ module, key, label, attack?, available? })`** (since 1.16.0).
  An option beside Determined, Double, Feint, Strong and Suppression Fire in the
  All-Out Attack select, stored as `<module>.<key>`. It carries no Basic Set
  bonus: `attack(context)` returns its attack effect, as an attack option's
  `apply` does.
- **`registerManeuver({ module, key, label, movement, defense, attacks, options?, available? })`.**
  Offered in the maneuver picker with the given movement (`none`, `step`,
  `half`, `full`) and defense allowance (`any`, `none`, `dodgeAndBlockOnly`).
  A choice made with it is stored in `system.maneuverOption`.
- **`registerAttackOption({ module, key, label, attack?, input?, available?, refuse?, apply, required? })`.**
  Shown in the attack dialog as a checkbox, number or select. `apply(context, value)`
  returns an effect:
  - `modifiers`: lines on the attack roll;
  - `defenseModifiers`: lines on the defender's rolls, optionally limited to certain defenses;
  - `damageModifiers`: lines on the damage roll that follows;
  - `reachBonus`, `criticalSkill`, `fatigue`, `notes`.
  - Since 1.50.0, what the setting costs the weapon: `shots`, rounds spent
    beyond the shells fired (the attack is refused where the weapon has fewer
    ready, and the extra come off its count with the rest); `malfunction`, the
    Malf. number for this attack alone (Campaigns p. 407, the strictest of the
    weapon's own and the settings chosen); and `rateOfFireMultiplier`, which
    caps the shots this attack may fire (Campaigns p. 408, `0.5` to halve it,
    and two halvings quarter it). The attack card names each one.
  - Since 1.70.0, what the setting does to the burst: `rateOfFire`, the Rate
    of Fire this attack is fired at in place of the weapon's, above it or
    below (`rateOfFireMultiplier` then applies to it; where two options set
    one, the higher counts); `recoil`, the Recoil its hits are counted with
    in place of the weapon's (Campaigns p. 373; the higher of two counts);
    and `recoilModifier`, added to the Recoil after that, never below 1. The
    shots asked for are capped by the result and by what is left in the
    weapon, and the card names the Rate of Fire and Recoil an option changed.
    A weapon of RoF 1 still asks for its shots where an attack option is
    offered on it, so an option that raises its Rate of Fire can be used.
  - Since 1.83.0, how the burst is counted: `minShots`, the fewest shots the
    attack may fire (a weapon held to whole bursts, as a "!" weapon fires
    only on full auto, Characters p. 270), and `shotsStep`, the step its
    shots come in. Where two options set one, the higher counts. The shots
    asked for are raised to the minimum and brought down to a whole number
    of steps (never under the minimum); where the Rate of Fire, after the
    options and what is left in the weapon, can't reach them, the attack is
    refused with a warning. Both apply only with the rapid-fire rules on.
    The Suppression Fire dialog now offers the ranged attack options too:
    their Rate of Fire (with the maneuver's options) is the one Suppression
    Fire needs 5+ of (Campaigns p. 409), and their Recoil, `minShots`,
    `shotsStep`, `shots` (spent with the burst), `fatigue` and `modifiers`
    (on each attack from the zones) apply. A row whose own RoF is under 5
    but that has attack options on offer can choose Suppression Fire, and
    the dialog refuses a burst the options chosen leave short of RoF 5.
  - Since 1.94.0, a weapon whose RoF is marked "!" (the mode's
    `rateOfFireMark`; the row's `fullAutoOnly`) fires at least a quarter of
    its listed RoF, rounded up (Characters p. 270), through the same
    `minShots`: the higher of the weapon's and the options' counts. The
    weapon's own minimum never asks for more than it can fire now, so one
    with fewer rounds left fires what it has; an option's minimum still
    refuses. It holds on a plain click (the measured shot fires the least
    burst), in the dialog (whose Shots field starts there), in Suppression
    Fire, and in Spraying Fire, where the whole burst, sweep included, must
    reach it. `rules.fullAutoMinimum(rateOfFire, mark)` gives the count (1
    for any mark but "!").

  Since 1.94.0, `required`: `true`, or a function of the attack context
  returning true, for an option the attack must not go without, such as a
  weapon's only burst. Where a required option is offered and not refused, a
  plain click on the attack opens the attack dialog (ranged or melee) instead
  of rolling past it, and a required checkbox starts ticked. The player may
  still untick it. A function that throws counts as not required.

  `refuse(context)` returns a reason to disable the option. `context.chosen` lists
  the other options chosen.
- **`registerDefenseOption({ module, key, label, defenses?, input?, available?, refuse?, apply, after? })`.**
  A checkbox on the defense card. `apply` returns `modifiers` and `fatigue`, and
  `after(context, outcome)` is called with the defense's result. Since 1.25.0:
  - `input` makes it a number or a choice, as an attack option's; the value
    reaches `apply(context, value)` and `after(context, outcome, value)`, and
    `context.chosen` holds each option's value;
  - the context also has `attacker`, `attackWeapon`, `arc`, `parryWeapon`,
    `calledShot` (where the blow was aimed, or where a miss by 1 landed) and
    `defenseCounts`.
- **`registerDefense({ module, key, label, choices, run })`** (since 1.9.0).
  A defense the module resolves itself, offered beside dodge, parry and block.
  - `choices(defender, attack)` returns `{ id, label, hint? }` for each way
    this defender may defend with it against the attack, by its label. Each
    gets a button, shown only to users who own the defender.
  - `run({ defender, attack, choice, message })` resolves it and posts the
    result.
- **`registerExtraEffort({ module, key, label, kind, fp, available?, refuse?, apply })`.**
  An offensive option in the attack dialog or a defensive one on the card,
  paid in FP before the roll.
- **`registerHitLocation({ module, key, label, parent, penalty, damageTypes?, wounding?, cripplingDivisor?, extraDr?, knockdown?, available? })`.**
  Offered as a called shot and on the damage card. It takes its armour and
  anything it doesn't override from its Basic Set `parent`. Since 1.22.0 it
  also takes, all optional:
  - `missFallback`: where an attack aimed at it that misses by 1 lands, as a
    Basic Set location or a registered `<module>.<key>`, or null for nowhere.
    It defaults to the parent's rule: the torso for the eye, skull, face,
    groin, neck and vitals;
  - `arcs`: the arcs it may be aimed from, checked against the one targeted
    token on a tactical scene;
  - `knockdownFor(type)`: added to the knockdown modifier for a damage type;
  - `shockKnockdown`: any shock calls for a knockdown roll;
  - `majorWoundKnockdown`: a major wound's knockdown penalty in place of the
    parent's.
- **`registerZenSkill({ module, key, skill, covers, available? })`** (since 1.91.0).
  A skill of Zen Archery's shape (Characters p. 228) for other weapons,
  stored as `<module>.<key>`. `skill` is its name as the sheet has it;
  `covers` lists the weapon skills it is used with, a name covering its
  specialties ("Guns" covers "Guns/TL8 (Pistol)"). The system's own is
  `zenArchery`, Zen Archery for Bow. A character who knows the skill gets a
  Roll button for it on the Combat tab's maneuver panel, at -10 on the
  instant and -5, -4, -3, -2, -1 and 0 after 1, 2, 4, 8, 16 and 32 turns of
  Concentrate (`system.concentrateTurns`, moved on at the end of each turn in
  combat: one more after a Concentrate, back to 0 after anything else; the
  table can correct it). The roll is a skill roll tagged `zen` and `IQ`, its
  concentration line keyed `zenConcentration`. A success waits on the actor
  until the next attack rolled with a skill it covers; a failure, or that
  shot, spends it. The shot is tagged `zen`, `gworld.attackModifiers` gets
  `zen: { id, skill }` (null on any other shot; set it to null and the shot
  takes no line), and after the listeners the shot takes a line keyed `zen`
  (carrying `zen`, the skill's id) worth two-thirds of the penalties in its
  `size` and `speedRange` lines: they are added up, divided by three and
  rounded down, so -7 leaves -2. A bonus for a large target is not a penalty
  and is left alone. Knowing the skill is the only gate, as with the
  system's other cinematic skills; `available(actor)` can add one, such as a
  module's switch. Also on `combat`:
  - `zenSkills(actor)`: the zen skills the actor knows and may use, each
    `{ id, skill, covers, available, level, modifier, ready }`, `modifier`
    being what the turns concentrated give the roll and `ready` whether its
    success is waiting;
  - `rollZenSkill(actor, id = "zenArchery")`: rolls it as the button does;
    returns `{ success }`, or null where no roll was made (unknown skill, not
    known, not the user's actor);
  - `zenShot(actor)`: the success waiting, `{ id, skill }`, or null;
  - `clearZenShot(actor)`: drops it.
- **State:** `getCombatState(actor, module, key)` and
  `setCombatState(actor, module, key, value, "turn" | "round" | "combat")`,
  cleared at that boundary. `getWeaponState(item, module)` and
  `setWeaponState(item, module, patch)` hold state on a weapon.
- **Hooks**, each called with a mutable context:
  - `gworld.attackModifiers`, `gworld.defenseModifiers`, `gworld.damageModifiers`: push lines to `modifiers`.
    Since 1.15.0 `gworld.attackModifiers` also gets `item`, the weapon the
    attack is made with or null, and `mode` (`{ index, ranged }`);
  - `gworld.defenseChoices` (since 1.15.0): the defense card's choices for a
    defender, as `{ defender, attack, delivery, damageType, choices, retreat, feverish }`.
    Each of `choices` is `{ key, available, refusal }` for dodge, parry and
    block; set `available: false` and `refusal` (text) to refuse one, and the
    button shows it refused with that text. `retreat` and `feverish` are
    `{ available, refusal }`; set `available: false` and the card leaves the
    checkbox off. A listener can't offer what the system refused;
  - `gworld.maneuverAllowances` (since 1.16.0): a character's maneuver as their data
    is prepared, as `{ actor, maneuver, option, movement, defense }`. Change
    `movement` (`none`, `step`, `half`, `full`) or `defense` (`any`, `none`,
    `dodgeAndBlockOnly`); the defenses are worked out from the result, and the
    Combat tab shows the movement. `option` is the All-Out Attack option on that
    maneuver, and the maneuver's own choice otherwise;
  - `gworld.meleeAttackOptions` (since 1.16.0): before the melee attack dialog, as
    `{ actor, item, maneuver, rapidStrike, deceptiveAttack }`, and since 1.27.0
    `flurryOfBlows` and `mightyBlows`. Set an option's `available: false` and
    `refusal` (text), and the dialog leaves it off and says why. Since 1.27.0,
    `gworld.attackModifiers` also gets `extraEffort` (`{ flurryOfBlows, mightyBlows }`),
    what the attack bought, and `gworld.defenseModifiers` gets `feverish`;
  - `gworld.weaponTargets` (since 1.31.0): what may be struck at on a foe, as
    `{ actor, foe, targets }`. Each target is `{ id, name, penalty, canDisarm,
    noParry, noDefenseBonus, disarmPenaltyForAll }`: the foe's item, the penalty to
    hit it, whether it can be knocked away, whether the foe may parry the blow,
    whether their Defense Bonus counts, and whether the disarm's -2 applies even to
    a fencing weapon. The system offers the weapons in hand; add any item the foe
    carries, or change one. A blow at a shield is resolved by Damage to Shields;
  - `gworld.feintModifiers` (since 1.28.0): before a Feint is rolled, as
    `{ actor, foe, item, mode, ranged, modifiers, refusal }`. `item` and `mode`
    are the row the Feint was made from (null for a natural attack). Push lines
    to `modifiers` for the feinter's roll, or set `refusal` (text) to stop it;
  - Since 1.19.0, a `gworld.attackModifiers` listener may set `refusal` (text): the
    attack isn't rolled, and the user is told why;
  - Since 1.83.0, `gworld.attackModifiers` also gets `shots`, the shells the
    attack fires (after an option's minimum and step; null for a melee
    attack), and `extraShots`, what the attack options spend beyond them,
    both read-only. An attack that isn't rolled -- refused by a listener,
    or because its effective skill is below 3 -- spends
    no shots, loses no aim and fires no `gworld.afterShots`; before 1.83.0
    one refused for skill below 3 still took its shots off the weapon. A
    rule that decides after the roll that nothing was fired gives the
    rounds back with `items.refundShots`;
  - Since 1.86.0, `gworld.attackModifiers` also gets `laser`: null for a melee
    attack, and for a ranged one `{ on, targetSees, dodgeBonus }` -- whether
    the laser sight was switched on in the dialog (false for a shot rolled
    without one), whether the target saw the dot, and what that gives the
    target's Dodge against this attack (1 while the dot is within the
    weapon's 1/2D and seen, 0 otherwise; Campaigns p. 411). `on` and
    `targetSees` are read-only; a listener may set `dodgeBonus` (a whole
    number, 0 or more), for a dot the target can't see or a sight with a
    range of its own. The sight's +1 to hit is in `modifiers`, keyed `laser`:
    remove it or set its value to limit the sight by range or colour;
  - Since 1.70.0, `gworld.attackModifiers` also gets `spraying`: null, or for
    one target of a Spraying Fire burst (Campaigns p. 409) `{ index, count,
    shots, recoil, wasted }` -- which target this is (from 0) of how many,
    the shots aimed at it, the Recoil its place in the sweep gives it, and
    the shots wasted swinging to it. Each target is its own attack with only
    that token in `targetTokens`;
  - Since 1.69.0, `gworld.attackModifiers` also gets `rangeYards`, the range the
    shot is taken at (null for a melee attack), and `minRange`, the row's
    minimum range (0 for none). A shot at a target inside the minimum range
    arrives with `refusal` already set to say so. A listener whose rules allow
    such a shot at a penalty clears `refusal` (null) and pushes its line to
    `modifiers`; one that leaves it set lets the refusal stand;
  - Since 1.21.0, `gworld.attackModifiers` also gets:
    - `options`: the attack options chosen in the dialog, by `<module>.<key>`;
    - `deceptive`: the part of `defensePenalty` a Deceptive Attack bought;
    - `feint`: the feint this attack spends, also in `defensePenalty`;
    - `evaluate`: the Evaluate bonus already in `modifiers`;
    - `calledShot.chink`: whether the blow is aimed at chinks in armor.

    Its `mode`, and the `mode` on `gworld.damageModifiers`, `gworld.injury`
    and `gworld.afterDamage`, carries `derived`, the derived attack mode's
    `<module>.<key>`, for a row a derived mode made;
  - Since 1.21.0, `gworld.defenseModifiers` and `gworld.defenseChoices` also get:
    - `arc`: `front`, `side`, `back`, or null outside tactical combat;
    - `attackWeapon`: the attack's weapon as the attack recorded it, or null. That is
      `weight`, `material`, `swung`, `skill`, `thrust`, `flail` (`flail`,
      `nunchaku` or absent), `itemUuid` and `mode`;
    - `parryWeapon`: for a parry, `{ itemId, twoHanded, natural, skill, isFencing }`.

    In `gworld.defenseChoices` it also has `parriesFlail`. Set it true to let
    a weapon that couldn't parry a flail (a fencing weapon or a knife) parry
    one;
  - Since 1.45.0: a fighter can be in more than one grapple; see the grapple
    entries below.
  - Since 1.44.0:
    - an attack's defense flag keeps the attack roll's `tags`;
    - `gworld.breakageOdds` gets `attackTags` and `attackWeight`, the weight the attack
      counts as, which a listener may change; an unarmed attack reaches it too, at weight 0;
  - Since 1.43.0:
    - `gworld.breakageOdds` gets `attacker` and `delivery`;
    - `roll.damage` takes `source` (text), which `gworld.injury` and `gworld.afterDamage` see
      as `damage.source`; the strike after a bare-handed parry of an unarmed attack is
      `"parriedLimb"`;
    - `gworld.defenseModifiers` gets `settle` (null) and `settleLabel`: set `settle` to
      `success`, `failure`, `criticalSuccess` or `criticalFailure` and the defense isn't
      rolled, the card says so, and what follows a roll sees that outcome;
    - `gworld.defenseChoices` gets `bareHandedParry: { available: false }`: set it true and,
      where the parry is with a weapon, the card also offers the defender's best bare-handed
      parry and its defensive techniques. That parry is the character's
      `system.derived.bareHandedParry` (`{ total, source, math, skillName }`, or null);
  - Since 1.40.0, `gworld.attackModifiers` also gets `wildSwing`, true for a Wild Swing,
    which starts with `skillCap` 9;
  - Since 1.39.0, `gworld.defenseChoices` also gets `attacker`, the attacking actor or null;
  - Since 1.38.0, `gworld.defenseChoices` also gets `acrobatic` (`{ available,
    refusal, defenses, perTurn }`), the Acrobatic Dodge the card offers a defender with a
    point in Acrobatics: set `available: false` and `refusal` to refuse it, add `parry`
    or `block` to `defenses`, or raise `perTurn` (`null` for no limit). Its Acrobatics roll
    is tagged `acrobaticDefense` and the defense, and `defenseCounts` counts it as
    `acrobatic`. `gworld.attackArc` gets `{ defender, attacker, arc, side }` in tactical
    combat before the card works out the defenses from the arc: set `arc` (`front`,
    `side`, `back`) or `side` (`left`, `right`) to have the attack count as coming from
    there;
  - Since 1.24.0, `gworld.defenseModifiers` and `gworld.defenseChoices` also get
    `defenseCounts`, this turn's defenses so far: `parries` with the weapon
    about to parry, `blocks` and `dodges`. Since 1.33.0 `gworld.defenseModifiers`
    also gets `calledShot` (`{ hitLocation, addonLocation }`, or null) and
    `retreating`. In `gworld.defenseChoices`, set
    `blockAgain` true to allow a block after the one a turn allows;
  - Since 1.18.0, `gworld.attackModifiers` also gets `calledShot`, the location the
    blow is aimed at as `{ hitLocation, addonLocation }` or null, and `targets`,
    the actors of the targeted tokens; since 1.23.0 also `targetTokens`, their
    token documents in the same order;
  - Since 1.16.0, `gworld.attackModifiers` also gets `skillCap`: the most the
    attack's effective skill may be once every modifier is in, or null. It is 9
    for a melee attack on Move and Attack (Characters p. 365), which also takes
    -4; set it to lift or change the cap. And a `gworld.damageModifiers`
    listener may set `formula` to another dice formula, which is rolled in
    place of the one given where it parses;
  - `gworld.parryWeapons` (since 1.15.0): the weapons a character's best parry is
    picked from, as `{ actor, attackedThisTurn, candidates }`. Each candidate is
    `{ itemId, modeIndex, name, unbalanced, excluded, reason }`: set `excluded`
    to leave a weapon out, or clear it on an unbalanced weapon left out for having
    attacked this turn;
  - `gworld.injury`: change `damage` before it is worked out;
  - `gworld.hurtingYourself` (since 1.32.0): an unarmed blow (a punch, kick,
    bite or claw) applied to a target, as `{ attacker, target, part, hitLocation,
    addonLocation, dr, basicDamage, minimumDr, applies }`. The striker takes a
    point of crushing per 5 basic damage, up to `dr`, to `part` (less their own
    DR there) when `dr` is at least `minimumDr` (3). Lower `minimumDr` for a spot
    tougher than its DR, change `dr`, or set `applies: false`;
  - `gworld.afterDamage`: the blow and its result;
  - `gworld.damageModifiers`, `gworld.injury` and `gworld.afterDamage` also get
    `item` (since 1.8.0): the weapon or spell the damage was rolled from, or
    null. The card keeps it as `itemUuid`, and so does `damage`. Since 1.10.0
    they also get `mode` (`{ index, ranged }`), the mode it was rolled from.
    Since 1.69.0 `gworld.damageModifiers` also gets `distanceYards`, how far the
    target was, for every row, explosive or not: the range the attack was taken
    at where the last attack was made from the same row (a ranged attack
    records it), otherwise the distance on
    the map to the one targeted token, and null where neither is known.
    `roll.damage` takes `distanceYards` too; given there, it is what the hook
    sees, and null says the distance is not known;
  - `gworld.breakageOdds`: set `breakage`. Since 1.25.0 it also gets `weight`, the weight
    the parry counts, which a listener may change, and a listener may set `item`
    to the weapon that breaks;
  - `gworld.randomHitLocation`: set `location` or `addonLocation`. Since 1.22.0 it
    also gets `damageType` and `arc` where the caller knows them (null
    otherwise), and `d6()`, a die rolled as the system's dice are, for a
    sub-roll;
  - `gworld.weaponAttacks` (since 1.10.0): an item's attack rows once they are
    worked out, as `{ actor, item, rows, damageAt, rangeAt, addToDamage }`.
    - Each of `rows` is `{ kind, mode, row, basis }`. `mode` is the stored mode,
      and `basis` is what the row came from before grade, material and
      ammunition: `st`, `damage`, `damageType`, `armorDivisor`,
      `halfDamageRange`, `maxRange`, `minRange` (since 1.69.0), `accuracy`,
      `malfunction`.
    - Change the row's `skillLevel`, `damage`, `damageType`, `armorDivisor`,
      `halfDamageRange`, `maxRange`, `accuracy`, `malfunction`, `projectiles`,
      `rateOfFire`, `minSt` or `material`.
    - Since 1.21.0, also its `reach` (text such as `"C, 1"`), `parry` (a whole
      number, or null for none) and `twoHanded`. A Parry moved up or down
      moves the weapon's parry modifier with it, so the character's Parry
      follows. The Parry isn't worked out again from a changed `skillLevel`.
    - Since 1.28.0, also `feint`: whether the Combat tab offers a Feint from the
      row. Melee rows start true and ranged rows false, derived modes included;
    - Since 1.70.0, a ranged row's `recoil` (a whole number, 0 for a
      muscle-powered weapon, which counts as 1) is documented as one a
      listener may change: it is what a burst's hits are counted with. Also
      `noSprayingFire` and `noSuppressionFire`, both false: set either true
      and the row isn't offered Spraying Fire, or Suppression Fire is refused
      from it, whatever its Rate of Fire. The row also carries `mount` (the
      mode's `""`, `rest`, `bipod` or `mounted`), read-only; `mounted` starts
      a suppression at the vehicle or tripod cap.
    - Since 1.86.0, also a ranged row's `bulk` (a whole number, 0 or less),
      `scopeBonus` (a whole number, 0 or more) and `scopeFixed` (false; true
      for a fixed-power scope, dropped where `scopeBonus` is 0). The attack
      reads all three from the row: Bulk on a Move and Attack, in close
      combat and when driving, and the scope when aimed. A variable-power
      scope gives a point less per second of Aim short of its bonus; a
      fixed-power one gives nothing until the shooter has aimed for as many
      seconds as the bonus (Campaigns p. 411). The Combat tab shows the row's
      figures ("Acc 5+2", Bulk), and notes a fixed-power scope. A ranged mode
      stores `scopeFixed` beside `scopeBonus` (false by default; the item
      sheet offers it once the mode has a scope).
    - Since 1.84.0, a ranged row also carries `offMount`, read-only: true for a
      `mounted` ("M") weapon whose mode has been taken off its mount (the
      mode's `offMount`, false by default). On the mount the weapon's ST is
      ignored, so the row's `skillLevel` carries no ST penalty and its
      `minStPenalty` is 0; off it, both carry -1 per point of ST lacking
      (Characters p. 270). A row's `minStPenalty` is always the penalty its
      `skillLevel` already includes. An off-mount weapon also starts a
      suppression at the handheld cap.
    - Since 1.94.0, a ranged row carries `fullAutoOnly`: true where the mode's
      RoF is marked "!" (Characters p. 270). A listener may set it, true or
      false; the attack then holds the burst to a quarter of the row's
      `rateOfFire` at least (see `registerAttackOption`).
    - Since 1.97.0, a ranged row carries `tightBeam`: true where the mode is
      a tight-beam burn (see *Tight-beam burning* below). A listener may set
      it; it only stays true on a row whose `damageType` is `burn`.
    - Since 1.69.0, also `minRange` on a ranged row: the least distance in yards
      it can hit at, 0 for none, from the mode's own `minRange` (and in `basis`
      beside the other ranges). The Combat tab shows it beside the range, and an
      attack at a closer target is refused (see `gworld.attackModifiers`). A
      ranged mode stores it as `minRange`; the GDF reader sets it where a
      record's notes say plainly that the first Range figure is the minimum
      range rather than 1/2D (that figure moves to `minRange` and the mode gets
      no 1/2D), or that the minimum is a stated percentage of the maximum. A
      note listing several weapons' minimums is reported, not read. The Basic
      Set's grenade launcher, ATGM and SAM carry 10, 30 and 200 yards.
    - Since 1.72.0, also the blast and its fragments (see "Explosions" under
      "Inside the system's own procedures"): `fragmentation` (the dice),
      `fragmentationType` (blank for cutting), `fragmentationDivisor` (1),
      `fragmentationLingerEvery` and `fragmentationLingerFor` (seconds, 0),
      `blastPlacement` (`""`, `contact` or `internal`) and `largeArea`, and on
      a ranged row `scatterSquared`. A `followUp` also keeps
      `fragmentationType`, `fragmentationDivisor` and `blastPlacement`.
    - Since 1.73.0, a ranged row's `noOverpenetration` (false) and `firstHit`
      (null): see "Wounding" under "Inside the system's own procedures".
    - Since 1.30.0, also `skillName` and `readiesAfterAttack` (whether attacking
      leaves the weapon unready). The context's `skillLevel(name)` reads the
      actor's level in a skill as this preparation worked it out, or null; the
      `actors` readers aren't ready yet while rows are worked out;
    - Since 1.53.0, a mode may say how far an area attack reaches from where it
      lands, as `radius` in yards (Campaigns p. 413). A cone says its width in
      `coneMaxWidth` instead: they are different shapes and a mode carries at
      most one. The Basic Set's stun grenade covers a 10-yard radius, its
      chemical grenade 2 and a Molotov cocktail 1.
    - Since 1.46.0, also the damage modifiers of Characters pp. 104-105 that
      change what a hit does rather than how much of it lands: `incendiary`
      (the blow's flame can set the victim's clothes alight), `radiation` (a
      rad per point of basic damage rolled, whether or not it gets through DR,
      and for a toxic attack instead of the damage), `doubleKnockback` (the
      shove is twice as far), `noKnockback` (it shoves nobody) and `ignoresDr`
      (DR counts for nothing, as for a Malediction). Each is shown as a tag on
      the row, travels on the damage card, and is acted on when the blow is
      applied;
    - Push `notes` (`{ label, hint }`), shown as tags, or set `followUp`
      (`{ damage, damageType, explosive, label? }`), which the Combat tab offers
      as a damage roll of its own. Since 1.52.0 it also takes `armorDivisor`,
      `fragmentation`, `followUp` and the affliction trio (`affliction`,
      `afflictionAttribute`, `afflictionModifier`): a second attack that lands
      *with* this one rather than instead of it (Characters p. 106). `followUp`
      false is a linked attack, "rolled separately against DR"; true is a
      follow-up, which lands only if the carrier hits and then ignores DR. An
      affliction carries its resistance roll in place of damage, and the tab
      offers it as a resistance roll rather than a damage roll. A mode carries
      the same shape as its own `linked`, which is where the Basic Set's
      electrolasers and cattle prod keep theirs.
    - Since 1.55.0, also whether the row is an affliction: `affliction`,
      `afflictionAttribute` and `afflictionModifier`. Make a damage row an
      affliction resisted at a penalty of the listener's working out, or turn an
      affliction back into the damage it carried; whether the tab offers a damage
      roll or a resistance roll follows the row, not the stored mode. A row's
      `followUp` is its linked attack, and setting it null drops that attack.
    - Since 1.80.0, also `followUpAlso` (null): a second line of the other
      kind, in the same shape as `followUp`, where the weapon has both a
      follow-up and a linked attack (Characters p. 269). The Combat tab offers
      each as a roll of its own. A mode stores it as `linkedAlso` beside its
      `linked`, set only where `linked` holds the other kind; existing data
      needs no migration. Setting `followUp` null while `followUpAlso` is set
      moves the second line up into its place.
    - `damageAt(entry, st)` and `rangeAt(entry, st)` work a mode out at another
      ST, and `addToDamage(formula, bonus)` adds to a dice formula. The range
      text and whether the damage can be rolled follow the figures;
  - `gworld.armorDr` (since 1.48.0): before a blow's DR is added up, with
    `{ actor, item, mode, hitLocation, damageType, basicDamage, lines }`. Each
    of `lines` is one piece of worn armour reaching the spot:
    `{ label, dr, applies, forceField, flexible, hardened, reason? }`, all
    mutable. Change `dr` to double a piece against one kind of attack, set
    `applies` to false to refuse it against another, raise `hardened` to step
    the attack's armour divisor down, or set `forceField` so the piece meets
    the blow before the rest. A listener may also spend a pool of its own: the
    lines say what the piece was worth, and the result carries what got
    through. The actor's own natural DR is not a line; it is added after.

    Since 1.55.0 the context also carries `ignoresDr`, true for an attack that
    ignores DR, against which every piece usually counts for nothing. A line's
    `againstIgnoresDr` (0 by default, 0 to 1) is the part of that piece that
    still stands against such an attack: a force field that meets it at a tenth
    of its DR takes `0.1`. What stands comes off the rolled damage, the force
    field's before the rest's, and the location's own DR is still ignored.

    Since 1.56.0 each line carries `itemId`, the armour item's id on the
    actor, so a listener can read the piece's own data; and the context carries
    `arc`, `"front"`, `"side"`, `"back"` or null, where the blow came from as
    the damage card has it -- whether or not the table plays front-only armour.
    A listener may also push a line of its own, for a layer that isn't an
    armour item (a coating, a field from a device): it counts like any other,
    and a `forceField` line meets the blow first.

    A piece's stored split is a list of damage types. A book that splits a DR
    by something else -- full DR against a laser, or against a swinging melee
    attack, a fall or a collision -- cannot say so in the piece, and should not:
    which attacks count is that book's rule. Write the figure the piece gives
    against everything else as its DR, keep the other figure in the module's
    own extension data on the item, and raise the line here when the blow is
    one the book means. A piece that armours one place better than the rest of
    itself is different, and is the piece's own `drByLocation` (since 1.51.0):
    a list of `{ locations, dr }`, each replacing the piece's figure at those
    locations, split and all.
  - `gworld.vehicleDr` (since 1.79.0): before a vehicle's DR meets a shot
    (Campaigns pp. 462, 554-555), with `{ vehicle, actor, item, mode,
    location, arc, damageType, basicDamage, armorDivisor, ignoresDr,
    tightBeam, lines }`. `vehicle` is the vehicle actor, or the vehicle item
    on a Gear tab; `actor` is whose card it is; `item` and `mode` are the
    weapon and its attack mode when the caller knows them, else null.
    `location` is the Vehicle Hit Location Table key (`body`, `largeWindow`,
    `mainTurret`, `vitalArea`, ...); `arc` is `"front"`, `"side"`, `"rear"`,
    `"top"`, `"underbody"` or null. Each of `lines` is one layer of DR at the
    spot, `{ label, dr, applies, hardened, reason? }`, all mutable: the
    system gives one, the vehicle's own DR there (see below), and none where
    the hit passes through to a rider, an open cabin or a draft animal. Change
    `dr` to multiply it against one kind of attack, set `applies` false to
    refuse it, raise `hardened` to step the armour divisor down, or push a
    line for a layer of your own. The layers that count are added up, the
    highest `hardened` steps the divisor down, and the rest comes off
    `basicDamage`. It fires only when the shot's basic damage is given, not
    for damage entered as already through the DR.

    The DR the system offers comes from the vehicle's statistics
    (`system.vehicle`, on the vehicle actor and the vehicle equipment item
    alike). `dr` is the table's figure and the front's; since 1.79.0 there
    are also `drOther` (the sides and rear, the second figure of a printed
    `45/20`), `drTop`, `drUnderbody`, and `drByLocation`, one entry per
    location that can carry its own (`smallWindow`, `weaponMount`,
    `smallSuperstructure`, `independentTurret`, `track`, `rotor`, `mast`,
    `wing`, `arm`, `largeSuperstructure`, `mainTurret`, `largeWindow`,
    `runner`, `wheel`, `vitalArea`). Each is null unless given: an empty
    `drOther` is `dr`, an empty top or underbody is the sides' figure, an
    empty window is half its face rounded up, and any other empty location is
    its face. Since 1.92.0 a location may give its own faces too:
    `drByLocationOther` (its sides and rear) and `drByLocationTop`, keyed as
    `drByLocation` and null unless given, and with them `drByLocation` is the
    location's front -- a turret's front, sides and top. A location's top
    falls back to its sides, its sides and underbody to its front, and a face
    it gives nothing for to the vehicle's. `drByLocationArcs`, keyed the same
    way, is the arcs (`"front"`, `"side"`, `"rear"`, `"top"`, `"underbody"`)
    a location's own DR covers, for armour on one side only, a canopy
    armoured against the front: empty is every arc, and from any other arc
    the location has what it would without its own figures. No arc at all
    counts as the front. The rules behind this are in `rules`:
    `vehicleFaceDr`, `vehicleLocationDr` (since 1.92.0), `vehicleDrAt`,
    `vehiclePenetration`, `vehicleDrLabel`, `passesThrough` and
    `aimableLocations`.

    Two more of the vehicle's statistics changed shape in 1.92.0, both
    without a migration. `fragility` holds every code beside HT, not one:
    any of `c`, `f` and `x`, each at most once (`"fx"`); read it with
    `rules.fragilityCodes`, which gives them in that order. And a vehicle may
    move a second way with a Move of its own, an amphibian's water Move:
    `secondLocomotion` (blank for none), `secondAcceleration`,
    `secondTopSpeed`, and `secondMoveInUse`, true while it moves that way.
    `rules.vehicleMoves` lists its Moves, the first first, and
    `rules.activeMove` gives the one in use `{ locomotion, acceleration,
    topSpeed }`, which is what the control roll, cruising speed, braking and
    a jump from it read. A vehicle actor's `derived` has `moves`, `move` and
    `fragility` (the codes as a list).
  - `gworld.shotsEntry` (since 1.54.0): wherever a ranged mode's capacity or
    reload time is read -- the Reload button, loading at once, the shots
    ready, the sheet's count -- with `{ actor, item, modeIndex, mode, entry }`.
    `entry` is the parsed Shots column (`capacity`, `chambered`,
    `reloadSeconds`, `perShot`, `thrown`, `text`) and is mutable: raise
    `capacity` for a weapon loaded with more shots than its table line, or
    change `reloadSeconds` for one that reloads faster or slower. The stored
    column stays the table's figure, and modes that share a magazine are still
    found by it. A figure that isn't a whole number reads as the table's; a
    listener that throws changes nothing. The Reload button then offers the
    Basic Set's Fast-Draw (Ammo) roll (Characters pp. 194-195) where a second
    off would matter.

    Since 1.71.0 the entry also carries what Fast-Draw (Ammo) saves and what
    else can help. `fastDrawSeconds` (1) is what a successful roll takes off,
    0 where the skill doesn't help; `fastDrawPer` is `reload` (the saving is
    taken once) or `round` (once for each round loaded, which is also what
    lets the roll be offered for a weapon loaded shot by shot). `aids` is a
    list of `{ id, label, seconds?, fastDrawSeconds?, checked? }` -- an
    assistant, a loading aid -- that the Reload button offers as checkboxes
    before the roll: a ticked aid adds `seconds` to the reload (negative to
    take them off; per round where the weapon loads shot by shot) and, where
    it gives `fastDrawSeconds`, replaces the entry's saving. A reload never
    drops below one second by the skill, or below none by an aid. The rules
    are `rules.reloadTimeWith({ entry, seconds, rounds, aids, fastDraw })`,
    which gives `{ seconds, saved }`, and `rules.fastDrawHelps(...)`.

    Since 1.88.0 the entry also says how the load is timed and rolled for.
    `perRoundSeconds` (0) is a time for each round loaded on top of
    `reloadSeconds`, taken once; above 0 the Reload button asks how many
    rounds to load, as it does for a weapon loaded shot by shot
    (`rules.loadsByTheRound(entry)`), and `rules.reloadTime(entry, rounds)`
    counts it. `fastDrawRoll` (null) is `{ skill?, level?, label? }`, the roll
    the Reload button offers in place of Fast-Draw (Ammo): against `level`
    where it is given, or else the character's level in `skill`; `label`
    names it on the dialog and card (the skill's name where absent). Its
    success, failure and critical failure count as the skill's do, and a
    character with no level is offered no roll. `requiredRolls` ([]) is a
    list of `{ skill?, level?, label, onFail? }` the load needs, rolled in
    order once the aids are chosen and before the skill is offered: on a
    failure with `onFail: "abort"` (the default) the time is spent -- the
    Ready maneuver and the card -- and nothing goes in; with `"continue"` the
    load goes in and the card says the roll failed. A roll with no `level`
    and a skill the character lacks fails. Each aid may also carry
    `exclusiveGroup`, a string: aids sharing one are used one at a time (the
    dialog unticks the others, and `rules.usableAids(aids)` keeps only the
    first ticked), and `multiplier`, which scales the reload's time after
    every aid's seconds are added, rounded up (`0.5` halves it; several
    multiply together), before a Fast-Draw saving is taken off. Loading from
    a chosen box of rounds counts `perRoundSeconds` but makes no rolls.
  - `gworld.afterShots` (since 1.71.0): once after every attack that spent
    shots, whether or not the weapon keeps a count, with `{ actor, item,
    modeIndex, mode, shots, fired, extra, wasted, kind, targets }`, read-only.
    `shots` is the total: `fired` (the shells fired), `extra` (what an attack
    option spent beyond them) and `wasted` (a spray's shots lost sweeping
    between targets, Campaigns p. 409). `kind` is `single`, `rapidFire` (more
    than one shell), `spraying` (fired once for the whole burst, after its
    last target, with `targets` its count) or `suppression` (`targets` 0).
    For heat, fouling or wear without watching item updates.
  - `gworld.malfunction` (since 1.71.0): when an attack roll reached Malf.
    and the Firearm Malfunction Table was rolled (Campaigns p. 407), before
    the card is posted, with `{ actor, item, modeIndex, attackRoll, roll,
    techLevel, revolver, kind, label, repair, fires, clears, explodes, jams }`.
    `roll` is the table's 3d and `kind` its result (`mechanical`, `misfire`,
    `stoppage`, `explosion`; an explosion at TL5+ already reads
    `mechanical`). The result is mutable: set `kind` to another, or to a
    kind of the module's own, and `label`, `repair` (the card's text on
    putting it right), `fires` (the shot still goes off), `clears` (a
    revolver's misfire), `explodes` and `jams` are worked out again for it,
    except those the listener set itself; a kind of the module's own reads
    as its name and jams. `kind: null` calls the malfunction off. A result
    that `jams` puts the weapon out of action (below).
  - **A weapon out of action** (since 1.71.0): kept as the item's
    `flags.gworld.malfunction`, `{ kind, label, modeIndex }`; `kind` may also
    be `destroyed`. While it is set, the weapon's ranged attacks and
    suppression fire are refused, and the sheet shows the malfunction with a
    Clear button in place of the shot. `items.malfunction(item)`,
    `items.setMalfunction(item, { kind, label?, modeIndex? } | null)` and
    `items.clearMalfunction(actor, item)` read, set and clear it.
  - `gworld.clearMalfunction` (since 1.71.0): before an attempt to clear a
    malfunction, with `{ actor, item, modeIndex, malfunction, rolls,
    readyManeuvers, hours, needsBothHands, criticalFailure, modifiers, aids,
    refusal }`. `rolls` are the choices, each `{ key, label, level, modifier
    }`: `armoury` (the character's best Armoury, Small Arms first, else
    IQ-5) and `weapon` (the mode's weapon skill, IQ-based), at the table's
    modifiers (Armoury+2 for a misfire, the weapon skill at -4 for a
    stoppage); a roll with a null `level` isn't offered. `readyManeuvers` (3)
    or `hours` (1, for a mechanical problem) is what an attempt takes;
    `criticalFailure` is `mechanical` or `destroyed`. Push lines to
    `modifiers`; push `{ id, label, modifier?, readyManeuvers?, hours?,
    checked? }` to `aids` for an assistant or a tool the dialog offers as a
    checkbox (a ticked aid adds its modifier and replaces the time); set
    `refusal` to a reason to refuse. A kind of the module's own is cleared as
    a mechanical problem unless the listener says otherwise. The roll is
    tagged `clearMalfunction`; a success clears the flag, a failure leaves
    it, and a critical failure makes it `mechanical` or `destroyed`.
  - `gworld.equipmentFailure` (since 1.10.0): before a thing's equipment
    failure roll (Campaigns p. 485), with `{ actor, item, target, modifiers }`.
    Push lines to `modifiers`; the card shows them.

## Data extension points

`game.gworld.api.data` lets a module store its own data on the system's
documents, add item types, and adjust derived values. Register from `init` or
the `gworld.registerRules` hook, so the fields exist before documents are read.

- **`registerItemType({ module, type, label, tab, columns?, actions?, builderStep?, indexFields?, available?, genericSheet? })`.**
  For a type the module's manifest declares under `documentTypes`, named
  `<module>.<type>`. The character sheet lists the type on `tab` (one of the
  names under [Where a tab name shows](#where-a-tab-name-shows)) with
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
- **`registerPoison({ module, key, label, poison, available? })`** (since 1.57.0).
  Offers a poison in the sheet's dose dialog, after the Basic Set's named ones,
  while `available()` says so. `poison` is the six numbers of Campaigns p. 437
  (`delivery`, `delaySeconds`, `resistanceModifier` or null for no roll, `damage`
  of `"toxic"`, `"fatigue"` or `"none"`, `dice`, `adds`, `intervalSeconds`,
  `cycles`, and a `reference`). A dose made from it carries
  `source: "<module>.<key>"`.
- **`registerExplosive({ module, key, label, ref, tl?, available? })`** (since 1.74.0).
  Adds an explosive to the Relative Explosive Force Table (Campaigns p. 415)
  as the Demolition tool and `hazards.detonate` know it: `ref` is its force
  against TNT's 1 (above 0), `tl` its tech level for the list. It is offered
  after the Basic Set's explosives while `available()` says so, and found by
  its id, `<module>.<key>`, which the call returns (null for a refused
  registration). `explosives()` lists what is offered right now, the Basic
  Set's rows first by their ids (`tnt`, `dynamite`, `c4`, ...), as
  `{ id, label, ref, tl }` with the labels localized.
- **`registerTechniqueKind({ module, key, label, derive, cost?, available? })`.**
  A technique whose `system.kind` is `<module>.<key>` gets its level from
  `derive(technique, actor, { levelOf, standard })`, which returns
  `{ level, levels?, cappedByPrerequisite?, notes? }`. `standard()` is what the
  system would have worked out. `cost(technique)` replaces its points in the
  character's total. The technique's sheet offers the registered kinds. Since
  1.26.0, `available()` takes a kind out of play: the sheet doesn't offer it
  for a new technique, and a technique already of that kind keeps it, with the
  level (and cost) the system would work out and a note saying why.
- **Hooks:**
  - `gworld.prepareDerivedData`, with the actor or item, after the system has
    prepared it.
  - `gworld.skillBonuses`, with `{ actor, item, name, difficulty, lines }`: the
    system's lines are keyed `bonus`, `magic`, `talent`, `trait` (one per trait that names the skill, labelled with the trait) and `tools`. Push lines
    (`{ label, value, source }`), or change a line's `value` and give its
    `reason`. The skill's level tooltip shows the lines.
  - `gworld.moveModifiers` (since 1.42.0), with `{ actor, move, lines }`, once
    encumbrance, reeling and very tired are applied: push `{ label, multiplier?, value? }`.
    Move becomes the multipliers' product times Move, rounded down, plus the values, never
    below 0; the derived data keeps the lines as `moveLines`.
  - Since 1.42.0, a skill or attribute rolled from the sheet is tagged with the attribute
    it's based on (`ST`, `DX`, `IQ`, `HT`, `Will`, `Per`), so a condition's `rolls` can name it.
  - `gworld.traitEffects` (since 1.47.0), with `{ actor, effects, sources }`,
    once the character's own traits and the system's own worn gear have been
    read. `effects` is what the traits came to, mutable: add Lifting ST and
    Striking ST, Super Jump, Basic Move and Enhanced Move, DR, the senses
    (Night Vision, Infravision, Hyperspectral and Telescopic Vision, Acute and
    Protected senses), Sealed, Vacuum Support, Pressure Support, Doesn't
    Breathe, Filter Lungs, Radiation Tolerance, Temperature Tolerance, Extra
    Arms or Extra Attack, and since 1.81.0 `extraLegs` (legs beyond two, read
    from the Extra Legs kinds, 7+ as seven). Push `{ effect, label, value? }` to `sources` to say
    what granted each one: `effect` is the field's path (`"sealed"`,
    `"protectedSense.vision"`) and `label` the thing it came from. The Traits
    tab lists them under what the character carries, so an effect nobody paid
    for is never unexplained. A listener that throws changes nothing.
    Since 1.78.0 the effects also carry the sense and handling traits gear
    grants or imposes while in use, each read where the system has the roll
    (Characters pp. 71-151):
    - `restrictedVision`: `null`, `"noPeripheral"` or `"tunnel"` (Restricted
      Vision, p. 151); set a worse one only, as the system never loosens it.
      On a tactical map the defense card reads the side hexes as back hexes
      (no defense), and with `"tunnel"` the two outer front hexes as side hexes
      (-2, the usual side-hex limits on parry and block); Peripheral and 360°
      Vision stop helping. The arc the blow came from, which front-only armour
      and the `gworld.attackArc` hook read, is unchanged. An armour piece's
      `blocksPeripheralVision` sets `"noPeripheral"` while worn (under the
      front-armour switch), and is listed in `sources` as
      `"restrictedVision.noPeripheral"`. Name a kind the same way.
      `rules.restrictedArc({ arc, side }, restricted, relative?)` is the same
      reading, for a module's own arcs.
    - `noDepthPerception` (p. 145): the attack penalties of One Eye, -1 in
      melee and -4 on an unaimed ranged attack, under its own name; taken once
      with One Eye.
    - `colorblindness` (p. 127): -1 on Artist, Chemistry, Driving, Merchant,
      Piloting and Tracking, as a line on each skill, and a "no colour" note
      on the Vision row. What colour a roll turns on stays the GM's.
    - `nictitatingMembrane` (p. 71), its levels: DR on the eye location alone,
      a point a level. The system makes no HT roll against eye damage, so the
      +1 a level to one is there for a module to read.
    - `parabolicHearing` (p. 72), its levels: the Hearing row notes the range
      multiplier. `rules.hearingDistanceMultiplier(levels)` is 2^levels, for a
      module that works out hearing distances (Campaigns p. 358); the system
      has no distance on a Hearing roll.
    - `hamFisted` (p. 138), its levels to 2: -3 a level on the fine-work skills
      High Manual Dexterity lists and on Fast-Draw, as a line on each skill.
      Levels granted add to the trait's own, to -6.
    - `noSmellTaste` (p. 146): no Taste/Smell roll, as for Deafness.
    The system's own traits of those names set them: Restricted Vision (level
    1 or 2, or the names No Peripheral Vision and Tunnel Vision), No Depth
    Perception, Colorblindness, Nictitating Membrane, Parabolic Hearing,
    Ham-Fisted and No Sense of Smell/Taste. `derived.senses` rows may carry
    `colorblind: true` (vision) and `rangeMultiplier` (hearing).
  - `gworld.traitsInPlay` (since 1.61.0), with `{ actor, traits }`, when a
    character's traits are gathered, before anything is worked out from them.
    Each entry is `{ item, name, inPlay }`: set `inPlay` to false, with a
    `reason`, for a trait the character has and has paid for but whose effects
    don't count right now -- an implant still healing in, an ability something
    suppresses. It is left out of the trait effects, talents, reactions and
    everything else read from traits; its points still count.
    `derived.traitsOutOfPlay` lists `{ name, reason }`. A listener that throws
    changes nothing. Since 1.63.0 an entry taken out of play may also carry
    `restores: [{ name, points?, levels? }]`: disadvantages the character
    suffers again while the trait is out, read into the trait effects as if
    the character had them, and listed on the entry in `traitsOutOfPlay`.
  - `gworld.carriedWeight` (since 1.58.0), with `{ actor, lines }`, while a
    character's carried weight is added up. Each line is one carried item,
    `{ item, label, weight, counts }`, `weight` being its effective weight times
    its quantity. Set `counts` to false to leave it out of encumbrance, or lower
    `weight`, and say why in `reason`: a powered suit that carries its own
    weight, a pack that holds its load weightlessly. The item keeps its weight
    everywhere else. `derived.encumbrance.carriedWeight` is what counts, and
    `derived.encumbrance.notCounted` lists the lines left out or lowered as
    `{ label, weight, counted, reason }`. A weight can't be raised here, and a
    listener that throws changes nothing.
  - `gworld.attributeBonuses`, with `{ actor, attributes, lines }`: push
    `{ attribute, label, value, source }`. They show on the attribute's card.
  - `gworld.defenseBonuses`, with `{ actor, defenses, lines }`: push
    `{ defense, label, value, source }`. They show in the defense's breakdown.
  - `gworld.skillLevels` (since 1.9.0), with `{ actor, skills, levelOf }`, once
    every skill's level is known and before techniques are read off them.
    Each of `skills` is `{ item, name, level, fromDefault }`. Set `level`
    and `fromDefault` to hold a skill to a ceiling another skill sets, or to
    give it its level at default, and `note` and `source` to say why: the
    note shows in the level's breakdown. `levelOf(name)` reads any skill's
    level. Since 1.58.0 `attributes` holds the ST, DX, IQ, HT, Will and Per
    the skills were worked out from: the character's `derived` data isn't
    written yet while this fires, so `actors.attribute` can't be read here.
  - `gworld.objectStats` (since 1.90.0), with `{ item, actor, kind, dr, hp,
    ht, notes }`, wherever a weapon's or shield's DR, HP and HT as an object
    are worked out (Campaigns pp. 483-484). `kind` is `"unliving"` (a gun,
    HT 10) or `"homogenous"` (a sword or shield, HT 12); `dr` and `hp` are
    the book's figures from the item's material and weight, or a shield's own
    DR and HP fields; `actor` is the owner, or null. Change `dr`, `hp` and
    `ht` to make a piece of gear tougher or frailer -- a rugged gun, a cheap
    one, a reinforced case -- and push strings to `notes` to say why; the
    item sheet shows them under its object figures. Each figure is rounded
    and kept at 0 or more, and one that isn't a finite number is ignored.
    Everything reads the result: breakage and the weapon's condition,
    striking at a weapon and the damage it takes, damage to shields, a
    shield's DB once disabled, the exposure roll under the repair rules, and
    the item sheet and the gear's stat block. It fires often (every
    preparation of a character with the item), so keep listeners cheap and
    free of side effects. A listener that throws changes nothing.
    `items.objectStats(item)` returns the same figures.
  - `gworld.legalityClass` (since 1.95.0), with `{ item, actor, lc }`,
    wherever the system reads an item's Legality Class (Characters p. 267,
    Campaigns p. 507): the Gear tab's legality note and the item sheet's
    license cost. `lc` starts as the item's stored `system.lc` (0-4, or null
    for none); set it to change what the item counts as -- an antique whose
    class rose with its age, a weapon disguised as something harmless -- or
    to null to take its class away. Anything but 0-4 counts as null; a
    listener that throws changes nothing. `actor` is the owner, or null. It
    fires every time a sheet is drawn, so keep listeners cheap.
    `items.legalityClass(item)` returns the same class.

System item fields a module's data may set:
- **Shields** (since 1.63.0): `hardened`, levels of Hardened on the shield's own
  DR, which step down the armour divisor of a blow the shield takes under
  Damage to Shields; and a `composition` of `"none"`, for a shield made of
  nothing the table lists, which changes no cost, weight, DR or HP.
- **Equipment** (since 1.63.0): `equipmentModifier`, a number or null. When set,
  it is the modifier the item gives the skills in `forSkills` in place of its
  `equipmentQuality` grade's.

`tools/validate-packs.mjs --src <dir>` accepts documents of module types and
`system.extensions` data.

## Sheet and chat extension points

`game.gworld.api.sheets` and `game.gworld.api.chat` let a module add content
and buttons to sheets and chat cards. Templates are the module's own
Handlebars files (`modules/<module>/templates/...`); the system preloads each
one when it is registered, and a module that uses partials loads them with
`foundry.applications.handlebars.loadTemplates`.

- **`sheets.registerSheetSection({ module, key, sheet, tab?, position?, template, context?, listeners?, visible? })`.**
  Renders `template` at the `start` or `end` (the default) of a character
  sheet `tab` (see [Where a tab name shows](#where-a-tab-name-shows)), or of the item sheet's body when `sheet` is `"item"`. The
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
  - Since 1.9.0, an input or select carrying `data-addon-card-input="<name>"`
    calls that action on `change`, with `value` and `checked` in the
    context. It is disabled for a viewer who may not use it.
  - **`chat.update(message, data)`** (since 1.9.0) redraws the card from its
    template with new `data`, which replaces the old. The GM may, and so may
    whoever owns the card's actor and may change the message (in Foundry, the
    user who posted it). It returns whether it did.
- **The compendium picker** (since 1.41.0): Foundry's `renderCompendiumPicker` hook fires
  on every render, including each search. Each row of the list is `[data-picker-row]` with
  the entry's UUID in `data-uuid`, and the entry's name is `[data-picker-name]` inside it.
- **`sheets.registerGmTool({ module, key, label, icon?, open, visible? })`.**
  A button in the token controls, shown to the GM only.

Sheet markup follows the system's: a section is an `.isec`, a heading
`.grph`, a list a `table.gt` with `tr[data-item-id]` rows, a button `.ibtn`,
and a hint `p.ihint`. The character sheet styles that markup on panels of its
own, so a section written with it reads the same wherever it lands.

### Where a tab name shows

The character sheet's tabs are Overview, Skills, Traits, Combat, Inventory,
Progression, Journal and Magic (the new names since 1.62.0). The classic
sheet, which had eight tabs of its own, has been removed; its tab names are
still taken, and show on the tab they were folded into:

| Registered against | Shows on |
| --- | --- |
| `overview`, `attributes` | Overview |
| `skills` | Skills |
| `traits` | Traits |
| `combat` | Combat |
| `body` | Combat, after the combat tab's own |
| `inventory`, `gear` | Inventory |
| `progression` | Progression |
| `journal`, `description` | Journal |
| `magic` | Magic |

Row actions go on every element of the sheet that carries `data-item-id` for
an item of their types: the list rows, cards and the detail panel of the
selected item.

The sheet is the one for characters, and the NPC sheet's full sheet. A
character that was set to the classic sheet opens on it. Each tab is an
`ApplicationV2` part named after the tab, a module's sections sit on panels of
their own, and the item descriptions a module supplies are enriched and shown
in full in the detail panels. The sheet's class, `GWorldCharacterSheetV2`,
extends `GWorldCharacterSheet`, so a `renderGWorldCharacterSheet` hook still
fires for it. An NPC's
`system.details.description` is shown and edited on its Journal tab.

Two fields a module may read (since 1.62.0):

- `system.pinnedSkills`: the ids of the skills pinned to the Overview.
- `system.journalLinks`: `{ uuid, kind }` links to journal entries, pages,
  actors and scenes, `kind` being `quest`, `clue`, `person`, `place` or `note`.
  Point awards also carry a `session` label.

## Point pools, energy sources, spell attacks and resistance

- **`points.registerPointPool({ module, key, label, available?, pools, canPay?, pay })`.**
  Pools a character can spend points from, listed beside unspent character
  points wherever points are spent on outcomes: buying a success roll up, a
  flesh wound, and a request for guidance. A pool whose `available()` says so
  (typically its switch; since 1.7.0) puts buying a roll up in play; while no
  pool is available, nothing is offered.
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
  - `sources(actor, spell, casting)` returns `{ id, label, available, multiplier? }`;
    `multiplier` is the source's points spent per point of energy.
  - The source covers what it can of the energy owed, and the caster pays the
    rest. `canPay({ actor, spell, source, energy, castThrough })` may refuse with a reason,
    and `pay({ actor, spell, source, points, energy, castThrough })` takes the points.
  - Since 1.13.0, `casting.castThrough` (and `castThrough` in `canPay` and
    `pay`) is `{ itemId, itemName }` for a spell cast through a magic item,
    and `null` for one the caster knows.
- **`magic.manaLevel()`** (since 1.13.0). The mana where spells are being cast
  now, as `{ level, inPlay }`: the active scene's level, else the world's
  (`none`, `low`, `normal`, `high` or `veryHigh`), and whether the mana
  levels rule is on. `normal` while it is off.
- **`magic.postResistance({ caster, label, casterRoll, casterEffective, subjects, resistWith?, magical?, area?, ruleOf16? })`** (since 1.9.0).
  Posts the system's resistance card for a module's effect, with a roll for
  each subject.
  - Subjects resist with the best of `resistWith` (attribute names, `Will`
    and `Per` included), or Will when it is left out.
  - Magic Resistance adds unless `magical` is false, twice with `area`.
  - The Rule of 16 caps the caster unless `ruleOf16` is false.
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
    `context.rollDamage({ label?, formula?, halfDamage? })` rolls damage straight away, for
    an area; since 1.14.0, `halfDamage: true` halves the basic damage, as
    for 1/2D.
  - The pack validator accepts a spell's damage or `area` when `attack.behavior`
    names a behavior. Since 1.14.0 it refuses a behavior, damage or `area` on
    an Information, Enchantment or Blocking spell, which never delivers one.
- **`magic.registerActiveSpellAction({ module, key, label, hint?, visible?, run })`** (since 1.14.0).
  A button on the Magic tab's rows for spells still running, shown to a user
  who owns the character: for what a spell goes on doing after the casting,
  such as an area's damage each second or an attack each turn.
  - `visible({ actor, spell, active })` decides which rows show it; `spell`
    is the spell item, or null where it is gone, and `active` the running
    entry.
  - `run({ actor, spell, active, energy, rollAttack, rollDamage })` gets the
    same two rolls a spell attack's `cast` gets, working from `energy`: the
    energy the casting put in, which running entries record since 1.14.0 (an
    older entry's cost stands in).

## Inside the system's own procedures

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
  (`dodge`, `parry`, `block`); since 1.76.0 also `exposure`, `contagion`,
  `infection`, `poison`, `illness`, `resuscitation` and `vehicleControl` (see
  *More rolls through `gworld.successRollModifiers`* below). `gworld.afterSuccessRoll` follows with the
  `outcome`. Since 1.30.0 each side of a contest also gets `opponent`, the
  actor on the other side, and its `tags` say what the contest is: `feint`, or
  `quickContest` with `disarm` for a disarm (tags a Quick Contest's caller
  passes reach the contest resolvers too).
- **The item behind a roll, secret rolls, influence contests** (since
  1.95.0):
  - *`item`.* The `gworld.successRollModifiers` and `gworld.afterSuccessRoll`
    contexts carry `item`, the item the roll is made with, where there is
    one: the weapon of an attack from the sheet, the tool the character's
    preparation picked for a skill roll (the carried item with `forSkills`
    worth most once its TL is weighed; the skill's `derived.toolItemId`
    names it), the vehicle of a control roll, or the `item` a module's
    caller passed to `roll.success`. A listener can find the roll's
    `techLevel` and `unfamiliar` lines (see *Tech level and familiarity*)
    among `modifiers` and change them for that item. A skill roll's tool
    lines are part of the skill's level (its `derived.bonusLines`), not the
    roll's.
  - *`roll.success` options.* `item` passes the item as above. `rollMode`
    sets who sees the card: one of Foundry's message modes (`public`, `gm`,
    `blind`, `self`) or the older roll-mode names (`publicroll`, `gmroll`,
    `blindroll`, `selfroll`); an unknown mode is ignored. `secret: true`
    makes a secret roll (Campaigns p. 494), the `blind` mode: the GMs see
    the card and whoever rolled does not. `rollMode` wins over `secret`.
    Left out, the card is posted openly, as before.
  - *Influence rolls* (Campaigns p. 359): both sides of the Quick Contest
    pass through `gworld.successRollModifiers`, `kind` `contest`, tagged
    `contest`, `quickContest` and `influence`, each with the other side as
    `opponent`. The influencer's side has `skill` the Influence skill and
    `base` the skill with the roll's modifier and Charisma; the subject's
    side has `skill` blank, `base` their Will, and the tag `will`. The lines
    go into the two targets and onto the card. Diplomacy's second reaction
    roll still goes through `gworld.reactionModifiers`.
- **Resistance rolls** (since 1.49.0): the roll an affliction forces
  (Characters p. 36; the afflictions of Campaigns pp. 428-429) is tagged
  `resist` and `affliction`, and carries `attack`:
  `{ attacker, item, mode, distanceYards, halfDamageRange, dr, drCounted }`.
  A cone or area attack makes the same roll, so the same tags and the same
  `attack` reach it. `dr` is what the victim's worn armour was worth at the
  location struck: an affliction is not damage and none of it is subtracted,
  but a module with a rule that reads armour can.
- **An affliction's effect** (since 1.49.0): `gworld.afflictionEffect` fires
  when a resistance roll fails, with
  `{ actor, attacker, item, mode, label, margin, effects }`. Push a
  `ConditionApplication` to `effects` -- the same shape `api.applyCondition`
  takes -- to name what the attack does, instead of leaving the card's list of
  the Basic Set's afflictions for the GM to pick from, or beside it. The
  system pushes nothing: which of the three bands one of its own afflictions
  inflicts is the GM's call, and the card asks.
- **Afflictions resisted with a Fright Check** (since 1.63.0): a mode whose
  `afflictionAttribute` is `fright` rolls a Fright Check at its
  `afflictionModifier` instead of an attribute roll. The check passes through
  `gworld.successRollModifiers` tagged `fright`, `will`, `resist` and
  `affliction`, with the same `attack`, and a failure fires
  `gworld.afflictionEffect` with the check's margin and `frightEffect`, the
  table's entry. `rollFrightCheckOutcome` returns `{ success, margin, effect,
  total }`.
- **Hazards** (since 1.63.0): `hazards.shock({ actor, kind, modifier, continuous,
  formula, metalArmor })` runs an electrical shock as the GM tool does
  (Campaigns pp. 432-433): `kind` is `nonlethal`, `lethal` or `localized`,
  `formula` the burning damage for a lethal or localized one, and `metalArmor`
  holds metallic armour to DR 1. Since 1.89.0 it also takes `contactSeconds`,
  the seconds the victim stays in contact after the roll (0 or left out: the
  current has stopped), and holds the recovery rolls with `holdRecovery`: a
  stun for its second, or for the contact plus (20 - HT) seconds after a
  continuous shock; unconsciousness from a lethal one for the contact plus
  its (20 - HT) minutes. `hazards.irradiate({ actor, rads,
  protectionFactor, modifier })` adds a dose of radiation (p. 435). Before a
  dose is added, `gworld.radiationDose` fires with `{ actor, rads,
  protectionFactor, sources }`: change `rads`, and push a label to `sources`.
  Since 1.79.0 `hazards.shootAtVehicle({ actor, vehicle, damage?,
  armorDivisor?, ignoresDr?, penetrating?, location?, arc?, occupants,
  damageType, tightBeam, item?, mode? })` runs a shot at a vehicle as its
  sheet's Shot at button does: `damage` is basic damage, and the vehicle's DR
  at the spot (after `gworld.vehicleDr`) comes off it; without `damage`,
  `penetrating` is taken as already through. `location` aims at a location,
  or null rolls for one; `arc` picks the face. It posts the card and, for a
  vehicle actor its user owns, takes the injury off its hit points.
- **Fragile** (since 1.93.0; Characters pp. 136-137): the disadvantage's
  five kinds now do what the book says. A character's are
  `traitEffects.fragile`, a list of `"brittle"`, `"combustible"`,
  `"explosive"`, `"flammable"` and `"unnatural"`, read off "Fragile (Kind)"
  or plain Fragile with the kind as its specialty or a modifier. A
  vehicle's are its HT codes (`c`, `f`, `x`; Campaigns p. 463).
  `hazards.fragileKinds(actorOrVehicle)` reads either. After a blow, a
  Combustible or Flammable character catches fire, or the damage card offers
  the HT roll not to; a crippled Brittle limb breaks off, with a roll for
  whether it comes away whole. An Explosive character explodes on a critical
  failure of the knockdown roll for a major wound, and on a death check
  failed by 3 or more; a Flammable one does on a critical failure while
  alight; a Brittle one is destroyed on any failed death check; an Unnatural
  one fails it outright. A vehicle shot at catches fire, or rolls against
  its HT not to, and an Explosive one rolls HT on a major wound and blows
  up on a critical failure; `shootAtVehicle` takes `explosive` (since
  1.93.0) for an explosion, which sets things alight as fire does. Being alight is the new `burning` condition,
  also set when a blow of burning damage catches the clothes (Campaigns p.
  434). `hazards.fragileCatchesFire({ actor, automatic, modifier })`,
  `hazards.fragileExplodes({ actor, cause })` (6d×(HP/10) crushing, HP to
  -10×HP) and `hazards.brittleLimb({ actor, location })` run those cards;
  the rules are in `rules`: `fragileIgnition`, `explodesOnMajorWound`,
  `fragileDeathCheck`, `failsDeathChecks`, `fragileExplosion`,
  `brittleLimb`, `fragileFromVehicleCodes` and `fragileKindsIn`.
- **Blows from below** (since 1.63.0): a blow applied with `fromBelow` (a
  checkbox on the damage card when the foot is struck) meets footwear's
  `soleDr` on the foot. `gworld.armorDr` carries `fromBelow`. Armour spent by
  a blow is its ablative DR, which `items.restoreDr` gives back; the system
  keeps no other hit points for armour.
- **Distance from a blast's centre** (since 1.63.0): an area affliction's
  resistance roll carries `attack.distance`, yards from the centre (this user's
  latest template on the scene, or else the first target), and
  `gworld.afflictionEffect` gets `distance` too. An explosion's damage carries
  `blastDistance` into the damage hooks, and before it is scaled
  `gworld.explosionFalloff` fires with `{ flag, itemUuid, distanceYards,
  divisorPerYard }`: set `divisorPerYard` (3) for a blast divided by the
  distance alone, say; its reach grows to match. A linked or follow-up line
  carries `radiation` and `surge` as a mode does, and `surge` travels to the
  apply as `IncomingDamage.surge`.
- **Tight-beam burning** (since 1.97.0; Campaigns pp. 399, 408, 433-434): a
  ranged burn that isn't a jet, cone, area, explosion or follow-up -- a laser,
  not a flamethrower.
  - *Stored on a mode.* A ranged mode keeps `tightBeam` (false by default),
    read only on a burn. The GDF reader sets it where a record's damage type
    carries `tbb` beside `burn` ("burn tbb", in any order with the other
    modifiers; never on an explosion), and on the Basic Set's own beam
    weapons (Characters p. 280), whose record says only "burn". It infers
    nothing else. `validate-packs` checks it is a boolean, and true only on a
    burn that is neither an area nor an explosion.
  - *On the row and the roll.* The ranged row carries `tightBeam` (see
    `gworld.weaponAttacks`), and so do its attack and damage buttons. The
    attack dialog's called-shot select then offers the eye and the vitals, as
    it does the chinks.
  - *On the card and the apply.* `roll.damage` takes `tightBeam`, and the
    damage card keeps it (only for `burn`). The apply passes it as
    `IncomingDamage.tightBeam`, which the damage hooks see, and the injury is
    worked out with it: x2 in the vitals, where another burn wounds at x1.
    An incendiary tight beam counts a tenth of its basic damage toward
    setting clothes alight.
  - *Overpenetration.* The Overpenetration tool fills in a picked row's
    `tightBeam`. A tight-beam burn may overpenetrate where another burn may
    not.
  - *Rules:* `canTarget(location, type, { tightBeam })`,
    `woundingModifierAt(type, location, { tightBeam })`,
    `canOverpenetrate({ type, ranged, tightBeam })` and
    `canTargetChinks(type, tightBeam)`, as before.
- **Explosions: placement, typed fragments, large-area injury** (since 1.72.0;
  Campaigns pp. 400, 414-415).
  - *Stored on a mode.* A melee or ranged mode (and its `linked` line) keeps,
    beside `fragmentation`, the fragments' `fragmentationType` (blank for the
    Basic Set's cutting, or any damage type) and `fragmentationDivisor` (1). A
    mode also keeps `fragmentationLingerEvery` and `fragmentationLingerFor`,
    seconds between strikes and seconds in all for fragments that go on
    hurting (hot fragments: 10 and 60), 0 for none; `blastPlacement`, `""`
    (beside the target), `contact` or `internal`; and `largeArea`, a blow that
    is a large-area injury. A ranged mode keeps `scatterSquared`: a miss
    scatters by the square of the margin, as for an unseen target. All default
    to what a mode meant before, so existing data needs no migration.
  - *The GDF reader* writes `fragmentationType` and `fragmentationDivisor`
    where a bracket gives them (`[1d-1 cr]`, `[1d(0.2)]`), and only there; a
    type the model doesn't know is still reported. The Basic Set's packs are
    unchanged.
  - *Rolling.* `roll.damage` (and the sheet's damage buttons) take
    `fragmentationType`, `fragmentationDivisor`, `fragmentationLingerEvery`,
    `fragmentationLingerFor`, `blastPlacement` and `largeArea`. The card prints
    the fragments as a table does and how often they strike again. Its flag
    carries `blastPlacement`, `largeArea` and `fragments`, a
    `FragmentationSpec` `{ dice, damageType, armorDivisor, linger: { every,
    for } | null }`. An explosive card with fragments has a button that rolls
    them as their own damage card, with `source: "fragments"` and no item.
  - *Applying.* An explosive card's apply row offers the placement (the row's
    first). `contact` is a direct hit for the most the dice could do, against
    DR as usual; the applied card gives everyone else's cover DR (the victim's
    torso DR + HP). `internal` is a direct hit on the vitals at x3 through no
    DR at all: no armour, natural DR, force field or Hardened, and no ablative
    DR spent. Every card has a *Large area* box (ticked by the row): the blow
    meets the average of the torso's DR and the lowest DR among the exposed
    locations against its type, rounded up, and is a torso hit; with a single
    location exposed it is an ordinary hit there. Trampling by something much
    larger ticks it.
  - *`IncomingDamage`* (the damage hooks' `damage`) gains `blastPlacement`,
    `largeArea` and `exposedLocations` (hit locations; all of
    `rules.LARGE_AREA_LOCATIONS` when left out). A `gworld.injury` listener may
    set any of them. `gworld.armorDr` fires once per location a large-area
    blow looks at, with that `hitLocation`. The result (`gworld.afterDamage`)
    gains `largeArea` (`{ dr, leastProtected }` or null) and `blastPlacement`.
  - *Rules:* `blastAt` takes `placement` and `maxDamage` and returns
    `placement`, `ignoresDr` and `woundingModifier`; `blastPlacementOf`,
    `BLAST_PLACEMENTS`, `INTERNAL_BLAST_WOUNDING`, `contactCoverDr({ torsoDr,
    hp })`, `fragmentationSpec(row)`, `fragmentationLabel(spec)`,
    `fragmentationStrikes(linger)`, `FRAGMENTATION_TYPE`; `largeAreaDr({
    torsoDr, exposed })`, `largeAreaSingleLocation(exposed)`,
    `LARGE_AREA_LOCATIONS`; `scatterDistance` takes `squared`. The sheet's
    Scatter action offers the character's explosive and area rows, filling in
    the fragments and the squared miss.
- **Demolition** (since 1.74.0; Campaigns pp. 415, 484, 558), under the
  `explosions` switch.
  - *The GM's tool.* The token controls have a Demolition button for the GM:
    an explosive (the Basic Set's table and the registered ones), its weight
    in pounds, whether it is packed against the target (`contact`) or
    `nearby` and how far, and optionally a structure: a row of the Structural
    Damage Table's doors and walls (per hex), or any DR and HP, with the
    damage it has taken already. It speaks for the one controlled token, if
    any.
  - *`hazards.detonate({ explosive?, ref?, weightLbs, placement?,
    distanceYards?, structure?, actor?, label? })`* does the same without the
    dialog. `explosive` is an id from `data.explosives()`; `ref` stands in for
    one on no list. The charge posts an ordinary crushing explosive damage
    card (`source: "demolition"`, `blastPlacement: "contact"` for a contact
    charge), which applies to tokens like any other. With `structure: { label?,
    dr, hp, damageTaken?, failedDisabling?, ht? }` (HT 12 by default) a second
    card gives what it did to the structure: a contact charge does the most
    its dice could, a nearby one the collateral share of the roll at
    `distanceYards` (1); what gets through DR comes off its HP, and at 0 HP or
    less it rolls HT to hold (or is breached), at -1xHP HT to stay up, and at
    -5xHP it is blown apart. Resolves to `{ charge, ref, basicDamage,
    structure }`, `structure` being the `StructureBlast` below with `damage`,
    `dr`, `maxHp`, `held` and `stands` (null where no roll was made), or null
    for no structure; the whole is null for no charge.
  - *Rules:* `RELATIVE_EXPLOSIVE_FORCE` (`{ id, name, tl, ref }` rows) and
    `explosiveForce(id)`; `chargeMultiplier(weightLbs, ref)`, the n in 6dxn;
    `explosiveWeightFor(n, ref)`, the pounds a 6dxn blast takes;
    `chargeDamage(weightLbs, ref)`, `{ multiplier, notation, dice,
    diceOfDamage }` or null, where `dice` keeps a whole multiplier (6dx2) and
    lays a fractional one out as dice and adds at 3.5 points to the die
    (6dx1.41 is 8d+2); `blastAgainstStructure({ damage, dr, hp, damageTaken?,
    failedDisabling? })`, `{ injury, hp, state, rollsToHold, rollsToStand }`
    with `state` a `StructureState`.
- **Tech-level modifiers and familiarity** (since 1.75.0; Characters
  pp. 168-169), under the `techLevelModifiers` switch (on by default) and the
  `familiarity` switch (off by default: until a table keeps the list, every
  weapon would count as unfamiliar), both in the Equipment group.
  - *Which rolls.* Only a technological skill takes either line: one whose
    name has the "/TL" marker or whose `techLevel` is set. The skill's TL is
    its `techLevel`, else a TL in its name ("Guns/TL7 (Pistol)"), else the
    character's `system.tl`; a skill rolled at default counts as learned at
    the character's TL and not IQ-based. An item's TL is its `system.tl` read
    for its leading number ("8", "11^"); an item without one takes no TL
    line. A weapon's attack roll (and the V2 sheet's attack preview) takes a
    line keyed `techLevel` where the weapon's TL differs from the skill's,
    and one keyed `unfamiliar` (-2) where the character is not familiar with
    it. An IQ-based skill four or more TLs behind its gear refuses the roll.
    The roll carries the tags `techLevel` and `unfamiliar` beside the lines,
    and the `gworld.attackModifiers` context starts with them in its `tags`,
    so a listener there or on `gworld.successRollModifiers` can find a line
    by its `key` and change its `value` or `label` (a skill whose description
    sets another penalty), or push one of its own.
  - *Tools.* A tool carried for a skill (`forSkills`) is weighed with its TL
    against a technological skill's: of several, the one worth most after
    the TL line wins, and one the skill cannot use at all is passed over. The
    skill's `derived.bonusLines` gains a line keyed `techLevel` beside
    `tools`, which `gworld.skillBonuses` listeners see and may change.
  - *Familiarities.* A character keeps `system.familiarities`, a list of item
    names (compared trimmed and case-blind); familiarity goes by the item's
    name, so "improved or obsolete versions" and look-alike models are made
    familiar by listing their names. NPCs keep none and never take the line.
    The V2 sheet's attack preview marks the weapon familiar or not.
  - *`roll.equipmentUse(actor, item, skillName)`* returns `{ lines, tags,
    impossible }` for a module's own roll with an item: `lines` as
    `{ key, label, value }`, `impossible` a message or null.
  - *Rules:* `parseTechLevel(value)`, `isTechnologicalSkill(name,
    techLevel?)`, `skillTechLevel(name, techLevel, personalTechLevel)`,
    `techLevelModifier({ skillTechLevel, equipmentTechLevel, iqBased })`
    (null for impossible), `bestTool(tools, { skillTechLevel, iqBased })`
    with `CarriedTool` (`{ quality, techLevel, id? }`; since 1.95.0 the best one keeps its `id`), `familiarityKey(name)`,
    `isFamiliar(list, name)`, `toggleFamiliarity(list, name)`,
    `familiarityModifier(list, name)`, `startingFamiliarities(points)` (two
    per point), `mayRollForFamiliarity(count)` (six or more), and
    `UNFAMILIAR_PENALTY` (-2), `FAMILIARIZATION_HOURS` (8),
    `FAMILIARITIES_FOR_SIMILARITY_ROLL` (6).
- **More rolls through `gworld.successRollModifiers`, fatigue costs, worn
  clothing and reactions** (since 1.76.0; Campaigns pp. 425-426, 430, 434,
  438, 443-444, 466, 494, 559). Each roll below now passes through
  `gworld.successRollModifiers` like the rest, so the actor's timed conditions
  and a module's listeners reach it; the added lines go into the target.
  - *Weather exposure* (the Weather button): `kind` `attribute`, tags
    `exposure`, `heat` or `cold`, and `HT`; where the character's HT-based
    Survival for the climate -- Survival (Desert) in the heat, Survival
    (Arctic) in the cold, a bought skill rebased from its attribute to HT --
    beats their HT roll, that is rolled instead, as the rule says ("whichever
    is better"), and the roll is `kind` `skill`, `skill` the Survival
    specialty, tagged `survival` in place of `HT`. The context carries
    `weather`: `{ heat, temperatureF, clothing, wetClothes, windMph }`. The
    card lists the Survival roll, worn clothing and the added lines.
  - *Contagion* (the Illness button): tags `disease`, `contagion`, `HT`, with
    `disease` (the disease record: `name`, `resistanceModifier`, ...).
    *Infection* (the wound check): tags `disease`, `infection`, `HT`, with
    `disease` the Infection record.
  - *Poison and illness cycles* (`actors.advancePoison` and the sheet): tags
    `poison` and `HT`, or `disease`, `illness` and `HT` for a caught disease,
    with `poison`, a copy of the dose (`ActivePoison`). A dose that allows no
    roll is not asked about.
  - *Resuscitation*: the healer's roll, `kind` `skill`, `skill` `Physician`
    or `First Aid`, tags `resuscitation` and the cause (`drowning`,
    `asphyxiation`, `heartAttack`), `opponent` the patient.
  - *Vehicle control rolls* (Gear tab and vehicle sheet): the operator's roll,
    `kind` `skill`, `skill` the vehicle's control skill (blank where it names
    none), tag `vehicleControl`, with `vehicle` -- the Gear-tab item or the
    vehicle actor. Since 1.95.0 the roll also takes the vehicle's
    `techLevel` and `unfamiliar` lines, as `roll.equipmentUse(actor,
    vehicle, skill)` gives them (Characters p. 168), already in `modifiers`
    with their tags, and carries the vehicle as `item` too; a vehicle four
    or more TLs ahead of an IQ-based control skill refuses the roll. The
    card lists the lines.
  - *Fatigue costs.* `gworld.fatigueCost` fires wherever the system charges
    FP, before the fatigue chart and Very Fit's halving, with
    `{ actor, fp, reason, exertion, details, sources }`. Set `fp` (rounded,
    never below 0) and push a label to `sources`. `reason` is `battle` (the
    end of a fight, p. 426; `details.seconds`, `details.strained`), `hiking`
    (`hours`, `hot`), `missedSleep`, `exposure` (`heat`, `temperatureF`,
    `heatStroke`), `deprivation` (`mealsMissed`, `hunger`, `thirst`,
    `climate`), `extraEffort` (a combat option's FP, asked before the cost
    is weighed against the FP left; `what`), `suffocation`, `poison`
    (`poison`, `illness`), `spell` (`maintain` for upkeep), `heldSpell`,
    `enchanting` and `drug`. `exertion` is false for spells, held spells,
    enchanting and a drug's crash. This is where a module charges the heat's
    surcharge on exertion and dehydration (p. 434) or a hot day's extra point
    for a battle (p. 426): the system does not know the day's temperature.
    Battle fatigue now goes through the fatigue chart like other exertion
    (Very Fit halves it; past 0 FP it costs HP), and its card names an actor
    whose cost a listener changed, with the new cost and the `sources`.
  - *Worn clothing.* `gworld.weatherClothing` fires with
    `{ actor, clothing: null, label: "" }` when the Weather dialog opens and
    when `rollExposure` is given no clothing; set `clothing` to `light`,
    `winter`, `arctic` or `heatedSuit` and `label` to the gear. The dialog
    starts on that class and says where it came from (the GM can still pick
    another); with none, `rollExposure` assumes ordinary winter clothing.
  - *Reactions.* `gworld.reactionModifiers` fires before every reaction roll
    the system makes -- the sheet's Reaction button, and Diplomacy's second
    roll on an Influence roll -- with `{ actor, reactor, tags, modifier,
    modifiers }`. `actor` is who is reacted to, `reactor` who reacts (the one
    targeted token's actor from the sheet, the Influence roll's subject), or
    null; `tags` is `reaction`, plus `influence` and `diplomacy` for the second
    roll; `modifier` the one the roll was asked with, read-only. Push
    `{ label, value }` to `modifiers`: each is added to the roll and listed on
    the card.
- **Wounding: injury caps, overpenetration, first hits, gauges, knockdown**
  (since 1.73.0; Campaigns pp. 408-409, 420-421, Characters p. 279).
  - *An injury cap.* A `gworld.injury` listener may set `damage.injuryCap`, the
    most HP (or FP) the blow may cost, and `damage.injuryCapReason`, text for
    the card. It holds on top of the Basic Set's own cap on a limb or
    extremity, the lower of the two winning; shock, the HP lost and a major
    wound by its size follow from what was kept, while crippling (and so
    dismemberment) and whether the wound bleeds are read from the injury
    before any cap. A blow that cripples is a major wound however little it
    kept (p. 420). The Basic Set's own cap is the least injury that cripples
    the part: the first whole point over HP/2 for a limb, over HP/3 for an
    extremity, or over the threshold `cripplingDivisor` sets (p. 421). Since
    1.81.0 a body with more than two arms or legs has each cripple over
    HP/(number of them), and each hand or foot over HP/(1.5 x number of
    them), counting `traitEffects.extraArms` and `extraLegs` (p. 421); a
    registered location's `cripplingDivisor` is its own and is not changed.
    `rules.cripplingThreshold(location, maxHp, limbs?)`,
    `rules.applyCrippling(injury, location, maxHp, limbs?)` and
    `rules.computeInjury({ ..., limbs })` take the same `{ arms?, legs? }`,
    two of each where omitted. The
    result (`gworld.afterDamage`'s `result`) gains
    `uncappedInjury`, the injury before the Basic Set's limb cap and the
    listener's, and `injuryCap`, `{ cap, lost, reason }` where the cap took
    anything off, else null. The applied card shows it beside the injury; a
    blow capped at 0 still shows what got through DR. `rules.capInjury(injury,
    cap)` returns `{ injury, lost }`.
  - *Overpenetration a row refuses.* A ranged row carries `noOverpenetration`,
    false; a `gworld.weaponAttacks` listener sets it true for a projectile that
    never goes through what it hits, whatever its damage type (p. 408 decides
    by type alone). The sheet's Overpenetration action offers the character's
    ranged rows, filling in the damage type and armour divisor, and a row that
    refuses posts that it does not go through. `rules.canOverpenetrate` takes
    `refused`.
  - *A first hit with its own line.* A ranged row carries `firstHit`, null; a
    `gworld.weaponAttacks` listener may set `{ damage, damageType?,
    armorDivisor?, label? }` (dice text; a blank type or a divisor of 0 is the
    row's, a blank label reads "first hit") for a multiple-projectile load
    whose first projectile differs from the rest (p. 409). After an attack
    from a row with `projectiles` over 1 and a `firstHit`, the first damage
    roll from that row uses the first-hit line and says so in its label; later
    rolls use the row's own line, as does any roll after another attack. The
    sheet shows the line beside the row. `roll.damage` takes `firstHit`
    (boolean), which the card's flag keeps and `IncomingDamage.firstHit`
    carries to `gworld.injury` and `gworld.afterDamage`, as it does for a
    first hit rolled from the sheet. `rules.projectileLine({ line, firstHit,
    first })` picks the line.
  - *Gauges.* `rules.calibreOf` reads a shotgun's gauge (`12G`, `10 gauge`,
    `20 ga`) as its bore in millimetres (Characters p. 279: 12G is 18.53mm), and
    `.410` as the inch figure it already was; `rules.gaugeBoreMm(gauge)` gives
    the bore, reading a figure of 100 or more as thousandths of an inch. So a
    shotgun with no rounds of its own listed is priced from the shells nearest
    in bore (and a weapon of about 18-20mm may now be priced from 12G shells).
  - *Knockdown.* The knockdown roll's `gworld.successRollModifiers` context,
    and `gworld.afterKnockdown`'s, carry `blow`: `{ hitLocation,
    addonLocation, majorWound }` for the blow whose card called for the roll,
    or null for a roll with no blow behind it (a card posted before 1.73.0).
    The Basic Set's own modifiers for the location (-5 face or vitals, -10
    skull or eye, on a major wound) are already in the card's modifier.
- **Modifier areas** (since 1.63.0): `areas.add(scene, { id?, label, center,
  radius, region, lines, expires })` keeps an area on a scene: a circle
  (`center` in scene pixels, `radius` in yards) or a scene region by id. Each
  line is `{ label, value, rolls?, applies? }`: `rolls` names roll kinds and
  tags as a condition modifier's do, and `applies` is `inside` (the roller
  stands in it), `through` (the line from the roller to the one token
  targeted, or the roll's `subject`, crosses it) or `both`. `expires` is a
  world time in seconds. Every success roll takes the lines of the areas that
  apply. `areas.remove(scene, id)` and `areas.list(scene)`. Since 1.70.0 a
  circle may also take `from` (scene pixels): the area is then a band, every
  point within `radius` of the line from `from` to `center`, as a swath of
  fire from the firer to where they aimed.
  - *Cones* (since 1.89.0, Campaigns p. 413): `cone: { direction?, toward?,
    length?, width? }` in place of `radius` makes the area a cone with its
    apex at `center`. `direction` is in degrees clockwise from the scene's +x
    (east), as Foundry measures a template, or `toward` (scene pixels) aims it
    at a point, as the line from the attacker to the target point. `length` is
    its reach in yards (left out with `toward`: to that point) and `width` its
    width at the far end in yards (left out: one yard per yard of length). It
    is a yard wide at the apex and widens evenly to `width`, never narrower
    than a yard. `add` returns null for a cone with no direction or length.
    `areas.list` gives it as `cone: { direction, length, width, base }` in
    scene pixels and degrees, `base` being the yard at the apex; `from` and
    `radius` are not kept beside it.
  - *Who stands in it* (since 1.89.0): `areas.standsIn(scene, idOrArea)`
    returns the token documents on the scene whose centre lies in an area --
    circle, band, cone or region -- by its id or as `areas.list` gives it.
  - *Darkness* (since 1.96.0, Campaigns p. 394): `areas.darknessAt(scene,
    tokenOrPoint, { observer? })` reads the darkness at a token (placeable or
    document; its centre and elevation) or a point (`{ x, y, elevation? }` in
    scene pixels) from the scene's lighting, for a light source, a sense roll
    or a sensor. `scene` may be null: the token's own scene, else the one
    drawn. It returns null for a spot it can't place, else `{ darkness,
    total, penalty, lighting }`:
    - `darkness` is 0 (none) to 10 (total), as
      `rules.darknessFromLighting(lighting)` works it out: the darkness level
      at the spot (a darkness region's own, else the scene's; Foundry's 0-1)
      counts a point per tenth; a light that reaches the spot (a light
      source, or the scene's global light when not bright) leaves at most 3,
      as the book's torch does; the scene's bright global light, where it is
      on at that darkness level, leaves 0; a darkness source makes it 10.
    - `total` is `darkness` 10, where the foe is unseen rather than
      penalised (see the sight select of the attack dialog).
    - `penalty` is what it costs a Vision roll or an attack:
      `rules.darknessPenaltyFor(darkness, eyes)` -- -1 to -9 after Night
      Vision (Dark Vision and Infravision ignore it), -10 in total darkness
      unless the eyes see in it, 0 for none. `observer` is the actor whose
      eyes those are; left out, nobody's.
    - `lighting` is `{ level, daylight, inLight, unnaturalDarkness }`, what
      the reading came from.

    A scene not drawn on the canvas is read from its settings alone: its
    darkness level and global light, no light sources, no regions. The attack
    dialog's darkness field is still the table's to fill in; its `darkness`
    line is unchanged.
- **Spraying and Suppression Fire** (since 1.70.0, Campaigns p. 409), under
  the `rapidFire` switch. A ranged attack from a row of RoF 5+ with two or
  more tokens targeted offers to spray the burst: the targets are put in the
  order it sweeps them, and each is its own attack (see `spraying` on
  `gworld.attackModifiers`). All-Out Attack (Suppression Fire) is offered
  where the character has a row of RoF 5+; an attack from any other row is
  refused. Firing it posts a card whose `gworld.suppression` flag holds the
  suppression (`actorUuid`, `tokenUuid`, `sceneId`, `itemId`, `modeIndex`,
  `weapon`, `base`, `recoil`, `mounted`, `from`, `zones` as `{ center, shots
  }`, `radius` in yards, `hitsLeft` and `ended`), and the active GM's client
  keeps each zone as a band area (`areas.list`) with the id
  `gworld-suppression-<message id>-<n>` and no lines, removed when the
  firer's next turn starts. A token moving into or through a zone gets a
  GM-only prompt, and the card lists whoever stands in a zone; their buttons
  roll the attack, tagged `suppressionFire`, at the normal modifiers with
  the rapid-fire bonus for the zone's shots, capped at 6 (8 on a vehicle or
  tripod mount) plus that bonus, and a hit is recorded at a random location
  (through `gworld.randomHitLocation`) for the damage roll.
- **Detection rolls** (since 1.63.0): a sense roll from the sheet is tagged
  with its sense (`vision`, `hearing`, `tasteSmell`, `touch`) and `detection`,
  and so are Observation (also `vision`), Search and Tracking rolls; a
  condition modifier's `rolls` can name any of them. `roll.success` takes an
  optional `subject`, the actor being looked for (a sheet roll takes the one
  targeted token's), passed to `gworld.successRollModifiers`. A detection roll
  also fires `gworld.detectionModifiers` with `{ observer, subject, sense,
  skill, tags, modifiers }`: push lines for what the subject wears or does.
- **Keyed attack lines** (since 1.63.0): the system's ranged lines carry a
  `key` a listener can find them by in any language: `speedRange`, `bulk`
  (with `situation` `moveAndAttack` or `closeCombat`), `accuracy` (with
  `scope`, the scope's share of it, where a scope counts), `aim` (extra turns) and `braced`.
  Since 1.86.0 also `darkness`, the darkness penalty (Campaigns p. 394) on a
  ranged or melee attack, with `darkness`, the darkness itself (1 to 9) before
  the attacker's eyes took anything off it; the line's `value` is the penalty
  after them. A module's light or sight changes the `value` (never above 0).
  There is no line where the eyes left no penalty, or where the dialog set no
  darkness; total darkness is the sight select's, not this line's. And
  `laser`, the laser sight's +1 (see `laser` under `gworld.attackModifiers`).
  Since 1.91.0 also `size`, the target's size modifier on a ranged attack
  (as on a Vision roll), and `zen`, a zen skill's line (see `registerZenSkill`).
  Since 1.87.0 also `movingPlatform`, the penalty for attacking from a moving
  vehicle or mount (Campaigns p. 548), which carries `platform` (`vehicle` or
  `mount`), `medium` (`ground`, `air` or `water`), `ride` (`smooth`, `rough`
  or `offRoad`: a good road, a bad road or off-road; calm or rough water) and
  `mounting` (`handheld`, `openMount`, `fixedMount` or `stabilized`). A
  shooter is aboard a vehicle when they are in its `crew`, and it is moving
  while its `system.speed` is above 0; a rider is in the saddle while their
  `system.mounted` is true (the Mounted Combat rule on), and the attack
  dialog asks whether the mount moved more than a step. Both always open the
  dialog, which asks how rough the ride is and, for the vehicle's own weapon,
  what it sits on. There is no line where the table gives 0. A module's
  saddle, stabilizing gear or riding skill changes the `value` (or removes the
  line). While a mount moves, the shot also gets no extra turns of Aim
  (`aim`) and no scope (p. 397).
  `gworld.attackModifiers` also receives `movement: { maneuver, yards }` (yards
  from the token's movement history, null where the map can't say) and `aim:
  { turns, braced, target, bonuses }`. A module aiding an aim at one foe writes
  `system.aim.bonuses` (`[{ label, value, key? }]`); a ranged attack takes
  them, keyed `aimTarget` unless given a key, only while aiming and only at
  `system.aim.target`. Both are cleared when the aim is lost, and when it is
  taken at a different foe.
- **Ending an aim** (since 1.87.0): `actors.loseAim(actor, reason)` ends an
  actor's aim (Campaigns p. 364) for a rule that spoils it: the turns, the
  target and `system.aim.bonuses` are cleared, and the usual note is shown.
  `reason` is one of the system's (`injured`, `defended`, `fired`; `moved`
  shows nothing) or the module's own words, shown as given ("Archer loses the
  aim: the mount bolted."). Returns true where there was an aim to lose;
  false, doing nothing, where there wasn't or the user doesn't own the actor.
- **Telescopic Vision and Vision rolls** (since 1.65.0): a Vision roll from
  the sheet with one token targeted takes that token's SM (`key` `size`) and
  the range penalty (`speedRange`), less what `traitEffects.telescopicVision`
  ignores (`telescopic`): a point a level, two while the roller's Aim is on
  that token. A module's worn optics that raise `telescopicVision` count here.
  The trait itself (not optics) also works as a scope on ranged attacks, the
  better of it and the weapon's scope counting, unless bought with No
  Targeting.
- **Attack roll tags** (since 1.65.0): `gworld.attackModifiers` gets `tags`;
  push to it, and the attack's success roll carries them, so a condition's or
  an area's lines naming them apply (a seeker's sense, say).
- **Environment suits** (since 1.65.0): armour's `environmentSuit` names the
  Environment Suit skill it is operated with (Battlesuit, Diving Suit, NBC
  Suit, Vacc Suit). While one is worn, DX-based skills are held to that skill
  (a `bonusLines` entry says so) before `gworld.skillLevels` runs, and a DX
  attribute roll takes a line down to it. `derived.environmentSuit` is
  `{ skill, item, level }` or null.
- **Aimed, then guided** (since 1.63.0): a ranged mode's `aimingSkill` is a
  skill the firer rolls first (tagged `aiming`, through
  `gworld.successRollModifiers`); only on a success is the attack rolled, at
  the mode's `guidedSkillLevel` where it gives one and the firer's skill
  otherwise. The attack roll still passes through `gworld.attackModifiers`.
  Since 1.64.0 the ranged row carries `aimingSkill` and `guidedSkillLevel`
  too, so a `gworld.weaponAttacks` listener can set them on a row; the row's
  figures win over the stored mode's.
- **Kinetic-only blows** (since 1.63.0): a mode's `kineticOnly`, and the same
  option on `roll.damage`, makes a blow whose whole effect is its shove:
  knockback worked out as a crushing blow's, blunt trauma where flexible armour
  stops it, and no other injury.
- **Stun recovery** (since 1.63.0): the roll to recover from stun passes through
  `gworld.successRollModifiers` tagged `stunRecovery` and `HT` (or `IQ` and
  `mental`), so a condition or a module can make recovery harder.
- **Quick Contest results** (since 1.37.0): `gworld.afterQuickContest` follows every
  Quick Contest, once its card is posted, with `{ label, tags, first, second, outcome,
  marginOfVictory }`. Each side is `{ actor, base, effective, outcome }`, where
  `outcome` is its success roll's result; the contest's `outcome` is `"first"`,
  `"second"` or `"tie"`. The Evade contest is tagged `evade`, with the mover
  first and the foe second.
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
  returns the row the melee or ranged table shows and rolls from. Since 1.21.0
  the helpers also carry:
  - `rows(item)`: `{ melee, ranged }`, copies of the item's own rows after the
    `gworld.weaponAttacks` listeners, so a mode can start from a row's damage
    with its quality in;
  - `damage(base, modifier)`: thrust (`"thr"`) or swing (`"sw"`) damage at
    the actor's striking ST.

  Since 1.29.0 they also carry `basicLift`, the character's Basic Lift with
  Lifting ST in, and since 1.30.0 `attribute(key)` for `ST`, `DX`, `IQ`,
  `HT`, `Will` and `Per`. `actors.basicLift` and `actors.attribute` read the derived
  values, which aren't there yet while a mode is worked out.

  Since 1.35.0 a mode registered with `self: true` belongs to the character rather
  than a weapon: `applies(null, actor)` and `mode(null, actor, helpers)` are called once
  per character, and the row has no item; the attack and damage hooks still get its
  `mode` with `derived`. Set `naturalKey` on the row (`punch`,
  `kick`, `bite`, `claw`) for what strikes, which Hurting Yourself reads.
- **`combat.registerSlam({ module, key, label, kind, available?, prepare })`** (since
  1.31.0). Another way to slam (`kind: "slam"`) or shove (`"shove"`), offered in
  the Slam or Shove dialog beside the system's own when `available(actor)` says so.
  `prepare(actor)` returns `{ skill: { name, level }, toHit?, damageBonus?, oneHanded?,
  foes?, bearer?, notes? }`, or null to refuse:
  - `skill` is rolled to hit, with `toHit` added. The foe defends on the usual card.
  - `damageBonus` goes on the slammer's damage roll, or on a shove's.
  - `oneHanded` makes a shove -1 per die.
  - `bearer` names what takes the slammer's damage.
  - `foes: 2` needs two targeted tokens and rolls to hit against each. A slam's
    single damage roll is halved for each foe, and a shove's basic roll pushes
    each rather than being doubled.
  - `notes` go on the card.
- **Grapples** (since 1.34.0):
  - `combat.grapple(actor, foe?)` is the grapple an actor is in, `{ foe, holding,
    hands, pinned, hitLocation }`, or null. Since 1.45.0 a fighter may be in
    several -- holding one foe while another holds him, or holding two at once --
    so `foe` (an actor or its uuid) says which; with none, it is the first.
  - `combat.grapples(actor)` (since 1.45.0) is all of them, the oldest first.
  - `combat.updateGrapple(actor, { hands?, pinned?, hitLocation? }, foe?)` changes it
    on both fighters; the pinned condition follows.
  - `combat.beginGrapple({ grappler, victim, hands, hitLocation? })` starts one,
    beside any the fighter is already in, and `combat.endGrapple(actor, foe?)` ends
    that one, or all of them where no foe is named.
  - `gworld.grappleContest` fires before a break free, takedown, pin or choke
    contest, with `{ move, actor, foe, grapple, first, second, winner }`. `first` is
    the side taking the action. Change a side's `base`, push to its `modifiers`,
    or set `winner` (`"first"` or `"second"`) to decide it without rolling. The
    quick contests' rolls are tagged `grapple` and the move.
  - Since 1.35.0, `gworld.grappleMove` also gets `waiveRequirements`: set it true
    to let a pin go ahead without the foe on the ground or the torso held. The
    grapple roll itself carries the tags `grapple` and the grappled location;
  - `gworld.afterGrappleContest` follows with `{ move, actor, foe, grapple, outcome,
    marginOfVictory }` (`outcome` is `"first"`, `"second"` or `"tie"`), once the
    system has applied the result.
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
  - `holdRecovery` (since 1.89.0) withholds the rolls to recover from it:
    `true` until the condition is removed or applied again without it,
    `{ seconds }` of world time from now, or `{ until }` a world time in
    seconds. The system's stun recovery roll (`stunned`) and its roll to wake
    (`unconscious`) are refused while held, with a notice of how long is left.
    A victim kept stunned while a current still flows (Campaigns p. 432) is
    `{ key: "stunned", holdRecovery: true }`, applied again with `{ seconds }`
    once the contact ends. `actors.recoveryHold(actor, id)` says whether a
    condition's recovery is held now: `{ until }` (null while it lasts), or
    null where the roll may be made. Taking a system condition off the token
    by any means drops its entry, hold and all.
  - Since 1.94.0, the stun on the token and the sheet's Stunned box
    (`system.conditions.stunned`) are one state: `{ key: "stunned" }` ticks
    the box, so the sheet offers "Shake off stun", and removing it clears the
    box. The token HUD and the box move each other the same way.
  - It returns the condition's id. `actors.removeCondition(actor, id)` takes it
    off, and `actors.conditions(actor)` lists them. The Combat tab shows them
    too.
- **Injury:** `actors.applyInjury(actor, { amount, fatigue?, label? })` (since
  1.8.0) takes HP, or FP with `fatigue: true`, off an actor with no DR and no
  card, for a module's own effects. Reeling and dead follow from the new total,
  and an injury spoils an aim. It returns `{ pool, from, to, label }`, or null
  where the user doesn't own the actor. A module never writes `system.hp` itself.
- **Feints** (since 1.20.0): a feint's Quick Contest asks the contest resolvers,
  with the tag `feint`, so a resolver can propose either side's score.
  `gworld.feintResult` follows with `{ feinter, foe, result, record }`; set
  `record: false` to take the result over, and the system records no feint
  against the foe's next defenses. `gworld.defenseModifiers` also gets
  `deception`, the attack's Deceptive Attack and Feint penalty (zero or
  negative), and `attacker`, the attacking actor or null.
- **Grapple moves** (since 1.23.0): `gworld.grappleMove` is called before each of
  the system's own grapple moves with `{ actor, foe, move, refusal }`, where
  `move` is `breakFree`, `takedown`, `pin` or `choke`. Set `refusal` (text)
  to stop the move; the user is told why.
- **Lifecycle:** `gworld.combatStart` `(combat)`, and `gworld.turnStart` and
  `gworld.turnEnd` `(combat, combatant)`, on every client.
- **Bleeding:** `gworld.bleedingSchedule` gets `{ actor, intervalSeconds, modifier }`
  before a bleeding roll, and may change either.
- **Healing** (since 1.60.0): `actors.firstAid({ healer, patient, skill?, techLevel?, label?, modifier? })`,
  `actors.attendPatient({ healer, patient, skill?, label?, modifier? })`, `actors.operate({ surgeon,
  patient, skill?, techLevel?, anesthetic?, repairingCrippled?, equipmentQuality?, label?, modifier? })`
  and `actors.rollMortalWound({ actor, physician?, traumaMaintenance?, modifier? })` roll what the
  sheet's buttons roll (Campaigns pp. 423-425). `skill` and `techLevel` stand in for the healer's own,
  so a device that treats on its own uses its figures, and `label` names it on the card. Each roll
  passes through `gworld.successRollModifiers` tagged `firstAid`, `physician`, `surgery`, or
  `mortalWound` (with `traumaMaintenance` when it is), so a module adds its gear or care there.
  Since 1.63.0, `gworld.mortalWoundInterval` fires before the check's card with
  `{ actor, traumaMaintenance, minutes, label }`: set `minutes` (1440 for daily checks) and a
  `label` where the module's care changes how often the check comes round; the card says so.
- **Resuscitation** (since 1.77.0): `actors.resuscitate({ healer, patient, cause?, cpr?, skill?,
  skillKind?, techLevel?, label?, modifier? })` rolls what the sheet's Resuscitate button rolls
  (Campaigns p. 425): a Physician/TL7+ roll, or First Aid/TL7+ at -4 (-2 with `cpr` against
  `drowning` or `asphyxiation`). `cause` is `drowning`, `asphyxiation` or `heartAttack` (the
  default). Without `skill` the healer's better of Physician and First Aid is used, as the
  button does; `skill` stands in for it, as the Physician roll unless `skillKind` is
  `firstAid`, `techLevel` for the skill's TL (below TL7 there is nothing to roll), and `label`
  names who works on the card. The roll is tagged `resuscitation` and the cause; a success
  clears unconsciousness and a heart attack.
- **Poison** (since 1.57.0): `actors.dosePoison(actor, poison, { doublings })` writes a
  dose onto a character as the Poison button does, the delay stretched by size and
  everything moved by the dose; `actors.activePoisons(actor)` lists them,
  `actors.advancePoison(actor, id)` runs a cycle (a gas with no delay can be dosed and
  rolled at once), and `actors.clearPoison(actor, id)` takes one off.
  `gworld.poisonCycle` follows every cycle, the sheet's included, with `{ actor, poison,
  source, resisted, margin, criticalFailure, hpLost, fpLost, hpLostToPoison, symptomsNow,
  effectMinutes, finished }`. `resisted` is null where no roll is allowed, `symptomsNow`
  names the thresholds of HP lost crossed this cycle (`"1/3"`, `"1/2"`, `"2/3"`), and
  `effectMinutes` is the margin's minutes for a poison that does no damage. What a
  poison does beyond its damage is its module's to apply there.
- **Treating poison and illness** (since 1.77.0; Campaigns pp. 439, 443):
  `actors.treatPoison(patient, id, { treatment?, bonus?, skill?, healer?, techLevel?, label?,
  modifier? })` treats a dose as the sheet's Treat button does. `treatment` is one of the book's
  (`suckWound`, `induceVomiting`, `medical`, `antidote`), rolled at the treater's First Aid or
  Physician (`skill`, else `healer`'s better of the two, else the patient's; nobody with either
  fails), with `bonus` the antidote's own. Leave `treatment` out for a module's own drug or
  device: its `bonus` stands to the HT rolls to resist, with a roll at `skill` + `modifier` only
  where `skill` is given. `techLevel` sets the TL medical procedures are given at, and `label`
  names the treatment on the card. `actors.treatIllness(patient, id, { antibiotics?,
  drugResistant?, physicianBonus?, bonus?, techLevel?, label? })` does the same for an illness:
  antibiotics (+3 at TL6+, nothing against a drug-resistant strain), a physician's care bonus and
  a module's `bonus` add up. Both return the bonus they gave (0 for a failed roll or an unknown
  dose). Treatments don't pile up: the dose keeps the best one.
- **Staying conscious** (since 1.43.0): `gworld.afterConsciousnessRoll` follows a roll to
  stay conscious at 0 HP or less with `{ actor, outcome, previousPosture }`; a failure has left
  the actor unconscious and lying down, which `actors.undoKnockdown` takes back.
- **Random hit locations** (since 1.43.0): `roll.hitLocation({ actor?, damageType?, arc? })`
  rolls 3d on the table through `gworld.randomHitLocation` and returns `{ hitLocation,
  addonLocation, roll }`.
- **Attacks come from the gear carried** (since 1.67.0): `derived.melee` and
  `derived.ranged` list the equipment the character carries (`system.carried` not false),
  an equipped shield, natural attacks and traits that are attacks. A weapon moved to
  storage leaves the list until it is carried again, and stowing it unequips it. A module
  that enumerated stored weapons through the derived lists should read `actor.items`.
- **Ammunition as carried items** (since 1.67.0): equipment filed as `ammunition` is a
  box of rounds -- `system.ammunition.kind` is what a weapon fires it as (the same list
  as a ranged mode's `ammunition`), `system.ammunition.fits` what it fits ("9mm", ".40",
  "12G", "arrow", "bolt", or a weapon's name; blank fits anything), `quantity` the rounds,
  weight and cost per round. `actors.loadAmmunition(actor, weaponId, modeIndex,
  ammunitionId)` loads a weapon from a box: the rounds come off it, what was in the weapon
  from another box goes back to that box, the mode's `ammunition` kind and `loadedFrom`
  follow, and a Reload draws on the same box until it is empty.
  `actors.carriedAmmunitionFor(actor, weaponId, modeIndex?)` lists what carried fits. A
  weapon whose mode names no `loadedFrom` reloads as before, from nowhere in particular.
- **Undoing damage** (since 1.66.0): `applyDamage` returns a `transaction` on its result
  recording what that application changed -- the pool and its value before and after, each
  ablative armour piece worn down, and an aim it spoiled.
  `actors.undoDamage(transaction)` takes it back for a user who owns the actor, and
  `actors.isUndoable(transaction)` says whether it still describes anything worth undoing.
  The undo **refuses rather than overwrites**: where any field it touched has moved since,
  nothing is written and the outcome is `{ ok: false, reason }` -- `poolChanged`,
  `armorChanged`, `armorGone` or `actorGone`. A module applying damage through its own
  path can keep the transaction and offer the same undo from its own card. The health
  conditions follow the pool, so call `syncHealthConditions` after a successful undo.
- **Knockdown** (since 1.39.0): `gworld.afterKnockdown` follows a knockdown roll once
  its result is applied, with `{ actor, outcome, result, previousPosture }` (`result` is
  `{ outcome, stunned, prone, unconscious }`; since 1.73.0 also `blow`, where
  the blow struck: see "Wounding"). `actors.undoKnockdown(actor, { posture })`
  takes it back for a user who owns the actor: no stun, not prone, not unconscious, and
  in `posture`.
- **Fright Checks** (since 1.39.0): `roll.frightCheck(actor, modifier)` rolls the
  system's Fright Check at that modifier.
- **Unspent points** (since 1.39.0): `points.spendUnspent(actor, amount, note)` charges a
  character's unspent points as a negative award, for its owner or the GM, and returns
  false, spending nothing, where they have fewer than `amount`.
- **Self-control rolls:** the Traits tab rolls a trait's self-control number, tagged
  `selfControl`, with the trait's name as `skill`; `gworld.afterSuccessRoll` follows.
- **First Aid** (since 1.36.0): `gworld.firstAid` gets `{ healer, patient, refusal,
  stopsBleeding }` before an attempt. Set `refusal` (text) to stop it, or
  `stopsBleeding: false` so success doesn't stop the patient's bleeding. The roll
  itself adds `gworld.successRollModifiers` lines, tagged `firstAid`, with the
  patient as `opponent`. `actors.stopBleeding(actor)` ends an actor's bleeding.
- **Technique defaults:** `gworld.techniqueDefaults` gets `{ actor, item, defaults }`;
  push `{ from, skill, modifier }` to offer another default. The best one is
  used.

`combat.hooks` lists every hook's name.

## The party

A `party` actor lists the characters a campaign follows. The terms the
campaign was set on -- the starting points, the disadvantage limit and the
Tech Level -- were kept on the party until 1.82.0; they are now world settings
(see `world.campaignTerms` below), so a character keeps them whether or not it
is in a party. `game.gworld.api.party` (since 1.68.0):

- **`party.of(actor)`** -- the party the actor is in, or null. A token's actor
  is looked up by its world actor.
- **`party.membersOf(party)`** -- the member actors that still exist, in the
  party's order.
- **`party.campaignTerms(actor)`** -- `{ party, tl, startingPoints,
  disadvantageLimit }`, each term null where the GM left it blank. Since
  1.82.0 the terms are the world's and reach every player character: `party`
  is `{ id, uuid, name }` or null for a character in no party, and the result
  is null only for an actor the terms don't bind (an NPC, a vehicle). Kept for
  modules written against 1.68.0; prefer `world.campaignTerms()`.
- **`party.addMembers(party, actors)`** and **`party.removeMember(party, uuid)`**
  -- change the roster, for a user who owns the party. Only characters and
  NPCs join, and an actor is in one party at a time.
- **`hooks.partyChanged`** (`gworld.partyChanged`) fires with `(party,
  members)` when a party's roster changes, after its members have been
  prepared again.

## The campaign world

`game.gworld.api.world` (since 1.77.0) reads facts about the campaign world
that are world settings rather than anything on an actor:

- **`world.controlRating()`** -- `{ rating, inPlay }`: the campaign's Control
  Rating (Campaigns pp. 506-507), 0 to 6, as the GM set it in the system
  settings, and whether the Legality Class rule is on. `rating` is null
  where the GM left it blank or the rule is off; the Gear tab's legality
  notes read the same figure. Compare an item's class against it with
  `rules.legalityUnder(lc, rating)`.
- **`world.campaignTerms()`** (since 1.82.0) -- `{ tl, startingPoints,
  disadvantageLimit }`: the terms every player character is made on
  (Characters pp. 10-11, 22), as the GM set them in the system settings or on
  a party's Campaign tab, each null where left blank. A term that is set
  replaces a player character's own during preparation -- `actor.system.tl`,
  `actor.system.points.starting` and `actor.system.points.disadvantageLimit`
  already read it, and `actor.system.derived.campaign.locked` says which terms
  are set. NPCs keep their own.
- **`hooks.campaignChanged`** (`gworld.campaignChanged`) fires with the terms
  when the GM changes one, after every player character has been prepared
  again.

## Taking over data the system is dropping

When rules move from the system into a module, existing worlds still store
their data in the system's fields. Foundry won't load a document whose type is
no longer registered, and drops undeclared fields on the next save. So the move
happens in this order:

1. A system release marks the data it is about to drop, in
   `CONFIG.GWORLD.deprecatedData`, while it still defines it.
2. The module's release migrates that data from its `ready` hook, and says so in
   its manifest with `"flags": { "gworld": { "migrates": ["<id>", ...] } }`.
3. The GM installs and enables the module, and loads the world once.
4. Only then does a system release stop defining the data.

At `ready`, before any module's own ready work, a GM whose world holds
deprecated data that no active module migrates gets a warning that stays until
dismissed. Nothing is saved. An item whose type is no longer registered counts,
though Foundry keeps it out of the world's collections as invalid.

Data deprecated in system 1.4.0 and removed in 1.5.0, by the id a module lists
in `migrates`. A world that still holds it should be loaded once under 1.4.0
with the module that migrates it. After 1.5.0, only the item type and the
stored switches can still be found:

- `ritual-items`: items of type `ritual`;
- `ritual-path`: characters' and NPCs' `ritualPath`, and equipment's `charm` and `grimoire`;
- `bonus-points`: characters' and NPCs' `bonusPoints`;
- `holy-items`: equipment's `holy`;
- `gear-options`: equipment's and armour's `improvements`, `holdout` and `signature`, and
  equipment's `weaponImprovements` and `improvisedPenalty` (and its ranged modes'
  `powder`, `payload`, `powderAdjust`, `payloadAdjust` and `magazineCost`);
- `rule-switches`: the switches `talentsSkipWildcards`, `holyAttacks`,
  `ritualPathMagic`, `monsterHuntersGear` and `bonusPointSpending`.

`game.gworld.api.migration`, for the GM's client:

- **`migrateItemType({ module, step?, fromType, toType, mapData })`.** Turns every
  item of `fromType` into `toType`, keeping its id, name and picture: world
  items, items on actors, and items in unlocked compendia.
  `mapData(source, item)` returns the new `system` data from a copy of the old.
- **`moveFields({ module, step?, documentName, types, fields, map? })`.** Copies
  `system.<from>` to `system.extensions.<module>.<to>` for each `from: to` in
  `fields`, on Actors or Items of those types (or `"*"`). `map(value, path,
  document)` may change a value on its way. The system's copy is left alone.
- **`moveRuleState({ module, step?, fromKey, toKey, turnOff? })`.** Carries a stored switch
  to the module's own `<module>.<key>`, unless that key already has a state.
  With `turnOff: true` (since 1.11.0) it also switches the old key off, so the
  rule isn't in play twice.
- **`hasMigrated(module, step)`** and **`resetMigration(module, step)`.**

Each step is recorded in the world under the module once every document it
touched has saved, so it runs once. A step with a failure isn't recorded and
runs again on the next load. Each helper returns
`{ skipped, changed, failed }`, and a long step reports its progress.
