/**
 * The attacks everybody has (GURPS Basic Set: Characters p. 271, "Natural
 * Attacks"; Campaigns p. 370, "Unarmed Combat").
 *
 * A character with no weapon on the sheet had no attack to roll, and a fighter
 * with a sword in the pack still had fists. So a punch and a kick are always
 * on the list, priced by the book:
 *
 * - **Punch**: thrust-1 crushing, reach C, rolled against the best of Brawling,
 *   Boxing, Karate or DX. It can parry, at the usual 3 + skill/2.
 * - **Kick**: thrust crushing, reach C and 1, rolled at -2 against the best of
 *   Brawling, Karate or DX. Boxing does not kick, and a kick cannot parry.
 *
 * The -2 for a kick is folded into the skill level shown, since that is the
 * number the dice are rolled against. Karate's bonus damage (+1 per die at
 * DX+1, +2 per die at DX+2) is not applied: it depends on the skill's level
 * relative to DX, which the sheet knows, but it is the sort of thing a table
 * house-rules, and a wrong bonus would be worse than none.
 */

import { thrustDamage } from "./damage.js";
import { addModifier } from "./dice.js";
import type { DiceAdds } from "./types.js";

/** The kick's to-hit penalty (Characters p. 271). */
export const KICK_PENALTY = -2;

/** What the sheet knows that a natural attack needs. */
export interface NaturalAttackInput {
  st: number;
  dx: number;
  /** Levels of the unarmed skills the character has, by name; missing means untrained. */
  skills: Partial<Record<"Brawling" | "Boxing" | "Karate", number>>;
}

export interface NaturalAttack {
  key: "punch" | "kick";
  /** The skill the level came from, or "DX" when none applies. */
  skillName: string;
  /** The number to roll against, penalty included. */
  skillLevel: number;
  damage: DiceAdds;
  reach: string;
  /** Whether it can be used to parry. */
  canParry: boolean;
}

function best(
  candidates: Array<[name: string, level: number | undefined]>,
  fallback: number,
): { name: string; level: number } {
  let chosen: { name: string; level: number } = { name: "DX", level: fallback };
  for (const [name, level] of candidates) {
    if (level !== undefined && level > chosen.level) chosen = { name, level };
  }
  return chosen;
}

/** The punch and the kick, as the sheet should list them. */
export function naturalAttacks(input: NaturalAttackInput): NaturalAttack[] {
  const { st, dx, skills } = input;
  const thrust = thrustDamage(st);

  const punch = best(
    [["Brawling", skills.Brawling], ["Boxing", skills.Boxing], ["Karate", skills.Karate]],
    dx,
  );
  // "Kicking ... is at -2 to hit" -- the penalty applies whatever the kick is
  // rolled against, so it goes on after the best skill is chosen.
  const kick = best([["Brawling", skills.Brawling], ["Karate", skills.Karate]], dx);

  return [
    {
      key: "punch",
      skillName: punch.name,
      skillLevel: punch.level,
      damage: addModifier(thrust, -1),
      reach: "C",
      canParry: true,
    },
    {
      key: "kick",
      skillName: kick.name,
      skillLevel: kick.level + KICK_PENALTY,
      damage: thrust,
      reach: "C, 1",
      canParry: false,
    },
  ];
}
