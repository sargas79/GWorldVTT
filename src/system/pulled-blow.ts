/**
 * A blow struck at less than full strength (GURPS Basic Set: Campaigns p. 401).
 *
 * "You can choose to use any ST value less than your own when you strike with
 * bare hands or a melee weapon, thrown weapon, bow, or sling (but not with a
 * crossbow or a firearm)." Chosen on the attack, which is where the strength
 * is decided, and collected by the damage roll, which is a separate click --
 * the same shape as a blade turned to strike with the flat.
 */

import { SYSTEM_ID } from "./constants.js";
import { formatDiceAdds } from "../rules/dice.js";
import { naturalAttacks, weaponUnarmedBonus } from "../rules/natural-attacks.js";
import { canPullPunches, pulledDamage, pulledStrength } from "../rules/subduing.js";

const PULLED_FLAG = "pulledBlow";

/** Records the ST a blow is being pulled to, or clears it for a full-strength blow. */
export async function recordPulledBlow(actor: any, strength: number | null): Promise<void> {
  if (!actor?.isOwner) return;
  if (strength && strength > 0) await actor.setFlag(SYSTEM_ID, PULLED_FLAG, Math.floor(strength));
  else if (actor.getFlag?.(SYSTEM_ID, PULLED_FLAG)) await actor.unsetFlag(SYSTEM_ID, PULLED_FLAG);
}

/** The ST the last attack was pulled to, spent by the damage roll that reads it. */
export async function consumePulledBlow(actor: any): Promise<number | null> {
  const strength = Number(actor?.getFlag?.(SYSTEM_ID, PULLED_FLAG) ?? 0);
  if (strength > 0 && actor.isOwner) await actor.unsetFlag(SYSTEM_ID, PULLED_FLAG);
  return strength > 0 ? strength : null;
}

/**
 * The damage of a blow pulled to a chosen ST, or null where it cannot be pulled.
 *
 * A muscle-powered attack is one whose damage comes off the Damage Table, so
 * that is the test for "muscle" here. A punch or a kick is worked out whole at
 * the lower ST, so a trained fighter's per-die bonus shrinks with the dice as
 * it should; a weapon re-reads its thrust or swing at that ST with its own
 * modifier.
 */
export function pulledFormula(options: {
  /** The striking ST the attack would otherwise use. */
  strength: number;
  chosen: number;
  stBased: boolean;
  damageBase: string;
  damageModifier: number;
  minSt: number | null;
  /** "punch" or "kick" for a bare-handed blow. */
  naturalKey: string;
  dx: number;
  skills: { Brawling?: number; Boxing?: number; Karate?: number };
  /** A weapon's blow that gets this unarmed skill's damage bonus, or "" (p. 271). */
  unarmedBonusSkill?: string;
}): string | null {
  if (!canPullPunches(options.stBased ? "muscle" : "mechanical")) return null;
  // Never harder than full strength, never below 1.
  const st = pulledStrength(options.strength, options.chosen);

  if (options.naturalKey === "punch" || options.naturalKey === "kick") {
    const blow = naturalAttacks({ st, dx: options.dx, skills: options.skills })
      .find((attack) => attack.key === options.naturalKey);
    return blow ? formatDiceAdds(blow.damage) : null;
  }

  if (options.damageBase !== "thr" && options.damageBase !== "sw") return null;
  // The bonus is per die of thrust at the ST the blow is struck with, so it
  // shrinks with the pull.
  const skill = options.unarmedBonusSkill ?? "";
  const bonus = skill
    ? weaponUnarmedBonus({
        skill,
        level: options.skills[skill as keyof typeof options.skills] ?? null,
        dx: options.dx,
        st,
      })
    : 0;
  return formatDiceAdds(
    pulledDamage({
      strength: options.strength,
      chosen: options.chosen,
      base: options.damageBase,
      modifier: options.damageModifier + bonus,
      weaponMinSt: options.minSt,
    }),
  );
}
