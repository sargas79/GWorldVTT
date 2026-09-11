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

/** The best weapon skill this character has, which is what a disarm contests. */
function weaponSkill(actor: any): { name: string; level: number } | null {
  const melee: any[] = actor?.system?.derived?.melee ?? [];
  let best: { name: string; level: number } | null = null;

  for (const attack of melee) {
    const level = Number(attack?.skillLevel);
    if (!Number.isFinite(level)) continue;
    if (best === null || level > best.level) {
      best = { name: String(attack.skillName || attack.name || ""), level };
    }
  }

  return best;
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
}): Promise<void> {
  const { actor, foe } = options;

  const mine = weaponSkill(actor);
  const theirs = weaponSkill(foe);
  if (!mine) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Disarm.NoWeapon"));
    return;
  }

  const penalty = disarmPenalty(options.fencingWeapon);

  const outcome = await rollSuccess({
    actor,
    base: mine.level,
    kind: "attack",
    label: game.i18n.format("GWORLD.Disarm.Label", { foe: String(foe?.name ?? "") }),
    modifiers: penalty === 0
      ? []
      : [{ label: game.i18n.localize("GWORLD.Disarm.Strike"), value: penalty }],
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
    label: game.i18n.format("GWORLD.Disarm.ContestLabel", {
      attacker: String(actor?.name ?? ""),
      foe: String(foe?.name ?? ""),
    }),
    first: {
      actor,
      base: mine.level,
      note: mine.name,
      ...(bonus.attacker !== 0
        ? { modifiers: [{ label: game.i18n.localize("GWORLD.Disarm.Jitte"), value: bonus.attacker }] }
        : {}),
    },
    second: {
      actor: foe,
      // "if you're attempting to knock away a missile weapon, your opponent
      // rolls against DX" -- and somebody with no weapon skill at all rolls it
      // too, because there is nothing else to roll.
      base: theirs?.level ?? (Number(foe?.system?.attributes?.DX) || 10),
      note: theirs?.name ?? "DX",
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

  ui.notifications?.info(
    result.disarmed
      ? game.i18n.format("GWORLD.Disarm.Disarmed", { foe: String(foe?.name ?? "") })
      : result.unready
        ? game.i18n.format("GWORLD.Disarm.Unready", { foe: String(foe?.name ?? "") })
        : game.i18n.format("GWORLD.Disarm.HeldFast", { foe: String(foe?.name ?? "") }),
  );
}
