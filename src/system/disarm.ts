/**
 * Knocking a weapon out of somebody's hand
 * (GURPS Basic Set: Campaigns pp. 400-401).
 *
 * Two rolls rather than one: a strike at the weapon, which the foe may defend
 * against, and then a Quick Contest to see whether it comes loose. That second
 * roll is where the rule lives -- a two-handed grip is worth +2, a jitte or a
 * whip is worth +2 the other way, and a critical failure means you are the one
 * standing there empty-handed.
 */

import { rollQuickContest } from "./contest.js";
import { rollSuccess } from "./roll.js";
import { disarmContestModifier, disarmPenalty, disarmResult } from "../rules/melee-situations.js";
import { attributeOf } from "./attributes.js";
import { callCombatHook } from "./combat-extensions.js";
import { PROCEDURE_HOOKS } from "./procedure-extensions.js";
import { knockWeaponAway, setWeaponUnready } from "./held-weapons.js";
import type { WeaponTarget } from "./weapon-damage.js";

/** A weapon skill a disarm is rolled at, and the item it is with (none for a punch). */
interface WeaponSkill {
  name: string;
  level: number;
  itemId: string;
}

/**
 * The best weapon skill this character can strike with, which is what the
 * attacker's side of a disarm rolls. A weapon swung and not yet readied, or
 * stuck in somebody, can't strike at anything.
 */
export function strikingSkill(actor: any): WeaponSkill | null {
  const melee: any[] = actor?.system?.derived?.melee ?? [];
  let best: WeaponSkill | null = null;

  for (const attack of melee) {
    if (attack?.unready || attack?.stuck) continue;
    const level = Number(attack?.skillLevel);
    if (!Number.isFinite(level)) continue;
    if (best === null || level > best.level) {
      best = { name: String(attack.skillName || attack.name || ""), level, itemId: String(attack.itemId ?? "") };
    }
  }

  return best;
}

/**
 * What the foe's side of a disarm rolls (p. 401): their skill with the weapon
 * struck at, the best of its melee modes. "If you're attempting to knock away
 * a missile weapon, your opponent rolls against DX", and so does somebody
 * holding a thing none of whose modes is a melee one. Where no weapon was
 * named, their best weapon skill, as before there was a choice of weapon.
 */
export function holdingSkill(foe: any, itemId: string | null): { name: string; level: number } {
  const melee: any[] = foe?.system?.derived?.melee ?? [];
  let best: { name: string; level: number } | null = null;
  for (const attack of melee) {
    if (itemId && String(attack?.itemId ?? "") !== itemId) continue;
    const level = Number(attack?.skillLevel);
    if (!Number.isFinite(level)) continue;
    if (best === null || level > best.level) best = { name: String(attack.skillName || attack.name || ""), level };
  }
  return best ?? { name: "DX", level: attributeOf(foe, "DX") };
}

/**
 * Strikes at a foe's weapon to knock it away.
 *
 * The strike is an ordinary attack, so the foe defends against it on the
 * ordinary defense card -- which is why the contest is only rolled when the
 * attacker chooses to press on after it lands.
 */
export async function rollDisarm(options: {
  actor: any;
  foe: any;
  /** A main-gauche, rapier, saber or smallsword, which waives the -2. */
  fencingWeapon: boolean;
  /** Jitte/Sai or Whip, which is worth +2 in the contest that follows. */
  jitteOrWhip: boolean;
  /** The foe's two-handed grip, worth +2 to them. */
  foeTwoHanded: boolean;
  /** What is being knocked away, where the attacker said: its size's penalty, and what striking at it allows. */
  target?: WeaponTarget | null;
}): Promise<void> {
  const { actor, foe } = options;

  const mine = strikingSkill(actor);
  if (!mine) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Disarm.NoWeapon"));
    return;
  }

  const target = options.target ?? null;
  // The weapon each side holds, carried on its roll so a listener can tell
  // which one is being held on to.
  const myWeapon = mine.itemId ? actor?.items?.get?.(mine.itemId) ?? null : null;
  const theirWeapon = target ? foe?.items?.get?.(target.id) ?? null : null;
  const theirs = holdingSkill(foe, target?.id ?? null);
  const penalty = disarmPenalty(options.fencingWeapon && !target?.disarmPenaltyForAll);

  const outcome = await rollSuccess({
    actor,
    base: mine.level,
    kind: "attack",
    ...(myWeapon ? { item: myWeapon } : {}),
    label: game.i18n.format("GWORLD.Disarm.Label", { foe: String(foe?.name ?? "") }),
    modifiers: [
      // The penalty for hitting the weapon itself, which the extra -2 is on top of (p. 401).
      ...(target && target.penalty ? [{ label: game.i18n.localize("GWORLD.Breakage.StrikePenalty"), value: target.penalty }] : []),
      ...(penalty === 0 ? [] : [{ label: game.i18n.localize("GWORLD.Disarm.Strike"), value: penalty }]),
    ],
    ...(target?.noParry || target?.noDefenseBonus ? { strikeLimits: { noParry: target.noParry, noDefenseBonus: target.noDefenseBonus } } : {}),
  });

  // "If you hit and your foe fails to defend, roll a Quick Contest" -- the
  // defense is theirs to roll on the card, so a hit is as far as this goes
  // until somebody says it landed.
  if (!outcome?.success) return;
  if (outcome.criticalFailure) return;

  const bonus = disarmContestModifier({
    jitteOrWhip: options.jitteOrWhip,
    foeTwoHanded: options.foeTwoHanded,
  });

  const contest = await rollQuickContest({
    tags: ["disarm"],
    label: game.i18n.format("GWORLD.Disarm.ContestLabel", {
      attacker: String(actor?.name ?? ""),
      foe: String(foe?.name ?? ""),
    }),
    first: {
      actor,
      base: mine.level,
      note: mine.name,
      ...(myWeapon ? { item: myWeapon } : {}),
      ...(bonus.attacker !== 0
        ? { modifiers: [{ label: game.i18n.localize("GWORLD.Disarm.Jitte"), value: bonus.attacker }] }
        : {}),
    },
    second: {
      actor: foe,
      base: theirs.level,
      note: theirs.name,
      ...(theirWeapon ? { item: theirWeapon } : {}),
      ...(bonus.defender !== 0
        ? {
            modifiers: [
              { label: game.i18n.localize("GWORLD.Disarm.TwoHanded"), value: bonus.defender },
            ],
          }
        : {}),
    },
  });

  const result = disarmResult({
    outcome: contest.outcome,
    marginOfVictory: contest.marginOfVictory,
  });

  await applyDisarm({ actor, foe, item: theirWeapon, result });
}

/**
 * Does what the contest decided to the foe's weapon, says so, and tells the
 * modules: knocked away, left unready, or still held and ready. The change
 * goes through the GM's client where this user doesn't own the foe.
 */
export async function applyDisarm(options: {
  actor: any;
  foe: any;
  item: any;
  result: { disarmed: boolean; unready: boolean; attackerDisarmed: boolean };
}): Promise<void> {
  const { actor, foe, item, result } = options;
  const foeName = String(foe?.name ?? "");
  const weapon = String(item?.name ?? "");

  let applied = true;
  // On the attacker's behalf, which is what lets a player who doesn't own
  // the foe have the GM's client make the change.
  if (item && result.disarmed) applied = (await knockWeaponAway(item, { reason: "disarm", attacker: actor })) !== null;
  else if (item && result.unready) applied = (await setWeaponUnready(item, true, { reason: "disarm", attacker: actor })) !== null;

  const key = result.disarmed ? "Disarmed" : result.unready ? "Unready" : "HeldFast";
  ui.notifications?.info(
    item
      ? game.i18n.format(`GWORLD.Disarm.${key}Weapon`, { foe: foeName, weapon })
      : game.i18n.format(`GWORLD.Disarm.${key}`, { foe: foeName }),
  );
  // This user may not have the weapon changed, or no GM is connected to: the table
  // has to do it by hand, and ought to be told so.
  if (!applied) ui.notifications?.warn(game.i18n.format("GWORLD.Disarm.NotApplied", { foe: foeName, weapon }));

  callCombatHook(PROCEDURE_HOOKS.afterDisarm, { actor, foe, item: item ?? null, result: { ...result } });
}
