/**
 * The Aim maneuver (GURPS Basic Set: Campaigns p. 364).
 *
 * "Aim: Aim a ranged weapon at a specific target. ... If you make an Attack
 * with that weapon on your next turn, you get a bonus equal to its Accuracy.
 * ... You may aim for up to three turns. Each turn beyond the first gives a
 * further +1, to a maximum of +2 for three turns." A braced weapon -- resting
 * on something, or a two-handed weapon held in both hands and steadied --
 * is worth another +1.
 *
 * And the aim is fragile: "If you are injured while aiming, or forced to
 * defend, you lose your aim" and start again.
 */

/** The most turns beyond the first that keep improving the shot. */
export const MAX_EXTRA_AIM_TURNS = 2;

/** What a braced weapon is worth on top of Accuracy. */
export const BRACED_BONUS = 1;

export interface AimInput {
  /** Turns spent aiming so far, this one included. Zero means not aiming. */
  turnsAimed: number;
  /** The weapon's Accuracy, with any built-in scope. */
  accuracy: number;
  /** Whether the weapon is braced against something. */
  braced?: boolean;
}

export interface AimBonus {
  /** The Accuracy claimed, or 0 when no turn has been spent aiming. */
  accuracy: number;
  /** The extra +1 or +2 for the second and third turns. */
  extraTurns: number;
  /** The +1 for bracing, claimed only while aiming at all. */
  braced: number;
  total: number;
}

/**
 * What aiming has bought so far.
 *
 * Nothing at all without a turn spent: Accuracy is what the Aim maneuver
 * buys, and a snap shot gets none of it, braced or not.
 */
export function aimBonus(input: AimInput): AimBonus {
  const turns = Math.max(0, Math.floor(input.turnsAimed));
  if (turns === 0) return { accuracy: 0, extraTurns: 0, braced: 0, total: 0 };

  const accuracy = Math.max(0, input.accuracy);
  const extraTurns = Math.min(MAX_EXTRA_AIM_TURNS, turns - 1);
  const braced = input.braced ? BRACED_BONUS : 0;
  return { accuracy, extraTurns, braced, total: accuracy + extraTurns + braced };
}

/** Why an aim was lost, for saying so. */
export type AimLoss = "injured" | "defended" | "fired" | "moved";
