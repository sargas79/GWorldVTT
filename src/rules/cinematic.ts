/**
 * Cinematic combat (GURPS Basic Set: Campaigns p. 417).
 *
 * "The following rules are shamelessly unrealistic and strictly optional, but
 * can be fun in larger-than-life games!" -- which is why every one of them is
 * off until a table asks for it, and why they are gathered here rather than
 * scattered through the rules they bend.
 *
 * This module holds the four that change what a blow does. The four that
 * change who is fighting and with what live beside them.
 */

import type { DamageType } from "./types.js";
import type { HitLocation } from "./hit-locations.js";

// ── Cinematic Explosions ────────────────────────────────────────────────────

/**
 * "Every yard of knockback from a cinematic explosion causes a token 1 HP of
 * crushing damage."
 */
export const EXPLOSION_DAMAGE_PER_YARD = 1;

/**
 * What a blast does when explosions are cinematic.
 *
 * "In cinematic combat, explosions do no direct damage! Ignore fragmentation,
 * too. All a blast does is disarray clothing, blacken faces, and (most
 * importantly) cause knockback."
 *
 * So the rolled damage is spent entirely on working out how far the victim
 * flies, and what they actually lose is a point a yard. It is token damage:
 * DR has already had its say in the knockback, which is worked out from damage
 * before DR, and subtracting it twice would leave an armoured man untouched by
 * a blast that threw him across the room.
 */
export function cinematicExplosionInjury(knockbackYards: number): number {
  return Math.max(0, Math.floor(knockbackYards)) * EXPLOSION_DAMAGE_PER_YARD;
}

// ── Cinematic Knockback ─────────────────────────────────────────────────────

/**
 * Whether this kind of damage shoves as a crushing blow would.
 *
 * "In reality, guns cause little or no knockback. But in cinematic combat, a
 * big gun can blast foes through windows and even walls! Work out knockback
 * for a piercing attack just as if it were a crushing attack."
 *
 * Only piercing is named, and only piercing is changed: an impaling spear and
 * a cutting sword go on behaving as the ordinary rule says.
 */
export function shovesLikeCrushing(type: DamageType): boolean {
  return type === "pi-" || type === "pi" || type === "pi+" || type === "pi++";
}

/**
 * The penalty on the IQ roll not to be stunned by being thrown about.
 *
 * "Anyone who suffers knockback from any attack must make an IQ roll or be
 * mentally stunned on his next turn. This roll is at -1 per yard of
 * knockback." Per yard, not per yard after the first -- unlike the roll to
 * stay on your feet, which the ordinary knockback rule handles.
 */
export function knockbackStunPenalty(yards: number): number {
  const shoved = Math.max(0, Math.floor(yards));
  return shoved === 0 ? 0 : -shoved;
}

// ── Flesh Wounds ────────────────────────────────────────────────────────────

/** "... at the cost of one unspent character point." */
export const FLESH_WOUND_COST = 1;

/**
 * What a wound comes to once it is declared a flesh wound.
 *
 * "Immediately after you suffer damage, you may declare that the attack that
 * damaged you (which can include multiple hits, if the foe used rapid fire)
 * was a glancing blow or 'just a flesh wound.' This lets you ignore all but 1
 * HP (or FP) of damage."
 *
 * A blow that did nothing cannot be shrugged off any further, and there is no
 * sense charging a point for it.
 */
export function fleshWound(injury: number): { taken: number; ignored: number } {
  const suffered = Math.max(0, Math.floor(injury));
  const taken = Math.min(suffered, 1);
  return { taken, ignored: suffered - taken };
}

/** Whether declaring a flesh wound would do anything at all. */
export function worthDeclaring(injury: number): boolean {
  return fleshWound(injury).ignored > 0;
}

// ── TV Action Violence ──────────────────────────────────────────────────────

/** "This costs him 1 FP and he loses his next turn." */
export const TV_ACTION_FP = 1;

/** How an attack reached its target, which is what decides whether FP can avert it. */
export type Delivery = "unarmed" | "melee" | "thrown" | "ranged";

/**
 * Whether a hero may buy his failed defense back (p. 417).
 *
 * "If struck by a potentially lethal attack (including a rapid-fire attack
 * that inflicts multiple hits), the hero can choose to convert his failed
 * defense roll into a success."
 *
 * With three exceptions, all of them about blows that are not lethal enough to
 * be worth a point of fatigue: "The hero cannot spend FP to avoid unarmed
 * attacks or melee or thrown weapon attacks that inflict crushing damage (or
 * no damage, such as a grapple), unless they would hit the skull or neck.
 * Likewise, he cannot avert attacks on his weapons or nonliving possessions."
 *
 * A bullet is none of those, which is the point: the hero ducks gunfire all
 * day and still has to take the punch.
 */
export function canAvertWithFatigue(options: {
  delivery: Delivery;
  /** Null for a grapple or any other attack that inflicts no damage. */
  damageType: DamageType | null;
  /** Where the blow was aimed, where anyone was aiming. */
  hitLocation?: HitLocation | null;
  /** True for a blow struck at a weapon or a possession rather than at him. */
  atPossession?: boolean;
}): boolean {
  if (options.atPossession) return false;
  if (options.delivery === "ranged") return true;
  // The skull and the neck are the exception to the exception: a punch to the
  // head is lethal enough to duck.
  const vital = options.hitLocation === "skull" || options.hitLocation === "neck";
  if (vital) return true;
  return options.damageType !== null && options.damageType !== "cr";
}
