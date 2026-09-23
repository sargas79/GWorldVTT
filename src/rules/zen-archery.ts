/**
 * Zen Archery (GURPS Basic Set: Characters p. 228).
 *
 * The cinematic skill of hitting what should be too small, too fast or too
 * far away to hit with a bow: IQ/Very Hard, no default, and learned only with
 * Trained By A Master or Weapon Master, Bow at 18+ and Meditation. On a
 * success, the shot's penalties for size and for speed/range are added up and
 * divided by three, rounding down.
 *
 * The roll itself is harder the less time is spent on it: -10 used on the
 * instant, -5 after a turn of concentration, and one less for each doubling
 * of the turns after that, to nothing at 32 turns.
 *
 * Nothing here is bows alone: which weapon skills such a skill covers is the
 * caller's to say, so a skill of the same shape for another weapon works the
 * same way.
 */

import { normalizeSkillName } from "./skills.js";

export const ZEN_ARCHERY = "Zen Archery";

/** The weapon skill Zen Archery is used with: "when using a bow". */
export const ZEN_ARCHERY_COVERS: readonly string[] = ["Bow"];

/**
 * The modifier to the skill roll for the turns spent concentrating first:
 * -10 on the instant, -5 after 1 turn, -4 after 2, -3 after 4, -2 after 8,
 * -1 after 16, and none after 32.
 */
export function zenConcentrationModifier(turns: number): number {
  const t = Math.max(0, Math.floor(Number(turns) || 0));
  if (t >= 32) return 0;
  if (t >= 16) return -1;
  if (t >= 8) return -2;
  if (t >= 4) return -3;
  if (t >= 2) return -4;
  if (t >= 1) return -5;
  return -10;
}

/**
 * What a successful roll is worth to the shot, as a line beside the ones it
 * eases: "add up the penalties for size and speed/range, and then divide them
 * by three (round down)". Only penalties are added up -- a target big enough
 * to be a bonus keeps its bonus, and gives nothing to divide -- and rounding
 * down leaves the smaller penalty: -7 becomes -2. Returns the positive
 * amount to add, or 0 where there was no penalty to ease.
 */
export function zenShotBonus(lines: { size: number; speedRange: number }): number {
  const penalty = Math.min(0, Number(lines.size) || 0) + Math.min(0, Number(lines.speedRange) || 0);
  if (penalty >= 0) return 0;
  const eased = -Math.floor(-penalty / 3);
  return eased - penalty;
}

/**
 * Whether a zen skill covers the skill an attack is rolled with. A name that
 * is covered covers its specialties too: "Guns" covers "Guns (Pistol)", and
 * "Guns/TL8 (Rifle)" is compared as "Guns (Rifle)".
 */
export function zenSkillCovers(covers: readonly string[], skill: string): boolean {
  const name = normalizeSkillName(String(skill ?? ""));
  if (!name) return false;
  const base = name.replace(/\s*\(.*\)\s*$/, "");
  return covers.some((c) => {
    const wanted = normalizeSkillName(String(c ?? ""));
    return wanted !== "" && (wanted === name || wanted === base);
  });
}

/**
 * The turns spent concentrating after a combatant's turn ends: one more after
 * a Concentrate maneuver, and none after anything else -- the concentration
 * the roll asks for is unbroken.
 */
export function concentrateTurnsAfterTurn(turns: number, maneuver: string): number {
  if (maneuver !== "concentrate") return 0;
  return Math.max(0, Math.floor(Number(turns) || 0)) + 1;
}
