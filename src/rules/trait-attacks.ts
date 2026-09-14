/**
 * Advantages that are attacks (GURPS Basic Set: Characters pp. 61-62, 106).
 *
 * An Innate Attack is a ranged attack a character is rather than carries --
 * "Burning Attack 3d" is fire from the eyes or the hands -- and it rolls to hit
 * and does damage the way a weapon does, off a skill (Innate Attack) or an
 * attribute. So a trait carries attack modes in the same shape a weapon does,
 * with the two things a weapon never needs:
 *
 *   - **damage per level.** "1d per level" is what the trait is bought in, so
 *     the dice follow the levels held rather than being typed again.
 *   - **Malediction** (p. 106). The attack works "more like a Regular spell":
 *     roll against Will at a range penalty, the victim may resist in a Quick
 *     Contest, and "the target's DR has no effect". Its price sets which range
 *     penalty it takes.
 *
 * A power from a data file may use both: fatigue damage per level, by
 * Malediction 2.
 */

import { formatDiceAdds, parseDiceAdds } from "./dice.js";
import { speedRangeModifier } from "./ranged.js";

/** 0 for an ordinary attack, or which of the three Maledictions this is. */
export type MaledictionLevel = 0 | 1 | 2 | 3;

/** The attributes an attack may be rolled against instead of a skill. */
export const ATTACK_ATTRIBUTES = ["ST", "DX", "IQ", "HT", "Will", "Per"] as const;
export type AttackAttribute = (typeof ATTACK_ATTRIBUTES)[number];

/**
 * The attribute a mode rolls against, where its "skill" names one: GCA
 * writes a Malediction's `skillused(Will)`, and "roll against your Will" is the
 * book's own instruction (p. 106). Null for a real skill.
 */
export function attackAttribute(skill: string): AttackAttribute | null {
  const wanted = skill.trim().replace(/^ST:/i, "").toLowerCase();
  const alias = wanted === "perception" ? "per" : wanted;
  return ATTACK_ATTRIBUTES.find((a) => a.toLowerCase() === alias) ?? null;
}

/**
 * Long-Distance Modifiers (Characters p. 241): nothing to 200 yards, then -1
 * at half a mile, -2 at a mile, -3 at 3 miles, -4 at 10, -5 at 30, -6 at 100,
 * -7 at 300, -8 at 1,000, and "another -2 per additional factor of 10". A
 * distance between two values takes the higher penalty.
 */
export function longDistanceModifier(yards: number): number {
  if (yards <= 200) return 0;
  const miles = yards / 1760;
  const rows: Array<[number, number]> = [
    [0.5, -1], [1, -2], [3, -3], [10, -4], [30, -5], [100, -6], [300, -7], [1000, -8],
  ];
  for (const [upTo, penalty] of rows) if (miles <= upTo) return penalty;
  return -8 - 2 * Math.ceil(Math.log10(miles / 1000));
}

/**
 * The range penalty a Malediction takes (p. 106): "-1 per yard of range, like
 * a Regular spell" at +100%, "the range penalties on the Size and Speed/Range
 * Table" at +150%, and "the penalties given under Long-Distance Modifiers" at
 * +200%. Nothing for an ordinary attack, whose range is the weapon's business.
 */
export function maledictionRangeModifier(level: MaledictionLevel, yards: number): number {
  const distance = Math.max(0, yards);
  switch (level) {
    case 1:
      return -Math.ceil(distance);
    case 2:
      return speedRangeModifier(distance);
    case 3:
      return longDistanceModifier(distance);
    default:
      return 0;
  }
}

/**
 * Damage for the levels held, where a mode is "per level": "1d-1" at three
 * levels is "3d-3". Levels below one count as one, since a trait on the sheet
 * is at least the first level of itself. A formula that is not dice is left as
 * it is.
 */
export function levelledDamage(formula: string, levels: number): string {
  const parsed = parseDiceAdds(formula);
  if (!parsed) return formula;
  const times = Math.max(1, Math.floor(levels) || 1);
  return formatDiceAdds({ ...parsed, dice: parsed.dice * times, adds: parsed.adds * times });
}
