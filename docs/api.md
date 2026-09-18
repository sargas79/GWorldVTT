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
| `actors` | Read-only: `derived`, `attribute`, `skillLevel`, `defenses`, `basicLift`, `encumbrance`. Also `applyCondition`, `removeCondition` and `conditions` (since 1.5.0), `applyInjury` (since 1.8.0), `setPosture(actor, posture)` (since 1.16.0), `stopBleeding(actor)` (since 1.36.0), `dosePoison`, `activePoisons`, `advancePoison` and `clearPoison` (since 1.57.0), and `firstAid`, `attendPatient`, `operate` and `rollMortalWound` (since 1.60.0). |
| `items` | Read-only: `derived`. `load(item, modeIndex, shots)` (since 1.28.0) loads a ranged mode immediately, with no Ready maneuver and no chat card, up to its capacity and across a shared magazine. It returns the new count, or null if the mode has no count or the user doesn't own the item. `restoreDr(item, points)` (since 1.59.0) gives a piece of armour back up to `points` of the ablative DR it has spent, and returns the new `drLost`, or null for an item that isn't armour or a user who doesn't own it. |
| `combat` | Combat extension points (since 1.1.0). |
| `data` | Data extension points (since 1.2.0). |
| `sheets`, `chat` | Sheet and chat extension points (since 1.3.0). |
| `points`, `magic` | Point pools, energy sources and spell attacks (since 1.4.0), and resistance cards (since 1.9.0). |
| `migration` | Moving world data from the system into a module (since 1.6.0). |

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
- **`registerAttackOption({ module, key, label, attack?, input?, available?, refuse?, apply })`.**
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
    they also get `mode` (`{ index, ranged }`), the mode it was rolled from;
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
      `halfDamageRange`, `maxRange`, `accuracy`, `malfunction`.
    - Change the row's `skillLevel`, `damage`, `damageType`, `armorDivisor`,
      `halfDamageRange`, `maxRange`, `accuracy`, `malfunction`, `projectiles`,
      `rateOfFire`, `minSt` or `material`.
    - Since 1.21.0, also its `reach` (text such as `"C, 1"`), `parry` (a whole
      number, or null for none) and `twoHanded`. A Parry moved up or down
      moves the weapon's parry modifier with it, so the character's Parry
      follows. The Parry isn't worked out again from a changed `skillLevel`.
    - Since 1.28.0, also `feint`: whether the Combat tab offers a Feint from the
      row. Melee rows start true and ranged rows false, derived modes included;
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
    Arms or Extra Attack. Push `{ effect, label, value? }` to `sources` to say
    what granted each one: `effect` is the field's path (`"sealed"`,
    `"protectedSense.vision"`) and `label` the thing it came from. The Traits
    tab lists them under what the character carries, so an effect nobody paid
    for is never unexplained. A listener that throws changes nothing.
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
and a hint `p.ihint`. Both character sheets style that markup, so a section
written for one reads the same on the other.

### Where a tab name shows

There are two character sheets: the classic one with eight tabs, and the new
one, whose tabs are Overview, Skills, Traits, Combat, Inventory, Progression,
Journal and Magic. A section or item type registered against any of these
names shows on both (since 1.62.0 for the new names):

| Registered against | Classic sheet | New sheet |
| --- | --- | --- |
| `attributes` | Attributes | Overview |
| `overview` | Attributes | Overview |
| `progression` | Attributes | Progression |
| `skills` | Skills | Skills |
| `magic` | Magic | Magic |
| `traits` | Traits | Traits |
| `combat` | Combat | Combat |
| `body` | Body | Combat, after the combat tab's own |
| `gear` | Gear | Inventory |
| `inventory` | Gear | Inventory |
| `description` | Description | Journal |
| `journal` | Description | Journal |

Row actions go on every element of a sheet that carries `data-item-id` for an
item of their types: table rows on the classic sheet, and on the new sheet the
list rows, cards and the detail panel of the selected item.

The new sheet is the default for characters and for the NPC sheet's full
sheet; the classic sheet stays registered as "GURPS Character Sheet (classic)".
On the new sheet, each tab is an `ApplicationV2` part named after the tab, a
module's sections sit on panels of their own, and the item descriptions a
module supplies are enriched and shown in full in the detail panels. An NPC's
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
  (`dodge`, `parry`, `block`). `gworld.afterSuccessRoll` follows with the
  `outcome`. Since 1.30.0 each side of a contest also gets `opponent`, the
  actor on the other side, and its `tags` say what the contest is: `feint`, or
  `quickContest` with `disarm` for a disarm (tags a Quick Contest's caller
  passes reach the contest resolvers too).
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
  holds metallic armour to DR 1. `hazards.irradiate({ actor, rads,
  protectionFactor, modifier })` adds a dose of radiation (p. 435). Before a
  dose is added, `gworld.radiationDose` fires with `{ actor, rads,
  protectionFactor, sources }`: change `rads`, and push a label to `sources`.
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
- **Modifier areas** (since 1.63.0): `areas.add(scene, { id?, label, center,
  radius, region, lines, expires })` keeps an area on a scene: a circle
  (`center` in scene pixels, `radius` in yards) or a scene region by id. Each
  line is `{ label, value, rolls?, applies? }`: `rolls` names roll kinds and
  tags as a condition modifier's do, and `applies` is `inside` (the roller
  stands in it), `through` (the line from the roller to the one token
  targeted, or the roll's `subject`, crosses it) or `both`. `expires` is a
  world time in seconds. Every success roll takes the lines of the areas that
  apply. `areas.remove(scene, id)` and `areas.list(scene)`.
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
  `gworld.attackModifiers` also receives `movement: { maneuver, yards }` (yards
  from the token's movement history, null where the map can't say) and `aim:
  { turns, braced, target, bonuses }`. A module aiding an aim at one foe writes
  `system.aim.bonuses` (`[{ label, value, key? }]`); a ranged attack takes
  them, keyed `aimTarget` unless given a key, only while aiming and only at
  `system.aim.target`. Both are cleared when the aim is lost, and when it is
  taken at a different foe.
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
  `{ outcome, stunned, prone, unconscious }`). `actors.undoKnockdown(actor, { posture })`
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

A `party` actor lists the characters a campaign follows and holds the terms
the campaign was set on: the starting points, the disadvantage limit and the
Tech Level. A term the GM has set on the party replaces the member's own
during preparation -- `actor.system.tl` and `actor.system.points.starting`
already read the party's figure, and `actor.system.derived.campaign` says
which party it came from and which terms are locked. `game.gworld.api.party`
(since 1.68.0):

- **`party.of(actor)`** -- the party the actor is in, or null. A token's actor
  is looked up by its world actor.
- **`party.membersOf(party)`** -- the member actors that still exist, in the
  party's order.
- **`party.campaignTerms(actor)`** -- `{ party: { id, uuid, name }, tl,
  startingPoints, disadvantageLimit }` for an actor in a party, each term
  null where the GM left it blank; null for an actor in no party.
- **`party.addMembers(party, actors)`** and **`party.removeMember(party, uuid)`**
  -- change the roster, for a user who owns the party. Only characters and
  NPCs join, and an actor is in one party at a time.
- **`hooks.partyChanged`** (`gworld.partyChanged`) fires with `(party,
  members)` when a party's roster or terms change, after its members have been
  prepared again.

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
