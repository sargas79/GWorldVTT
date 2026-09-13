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

// ── Bulletproof Nudity ──────────────────────────────────────────────────────

/** How much a fighter is wearing, for the rule that rewards wearing less. */
export type Dress =
  /** Ordinary clothing, or armour. No bonus. */
  | "clothed"
  /** "Any outfit that bares legs, chest, or midriff." */
  | "bares"
  /** "Just a loincloth or skimpy swimwear." */
  | "skimpy"
  /** Nothing at all. */
  | "nude";

/** The four states, in the order a picker should offer them. */
export const DRESS_STATES: readonly Dress[] = ["clothed", "bares", "skimpy", "nude"];

/**
 * The bonus to active defenses for wearing very little (p. 417).
 *
 * "PCs with Attractive or better appearance can get a bonus to active defenses
 * simply by undressing! Any outfit that bares legs, chest, or midriff is +1.
 * Just a loincloth or skimpy swimwear is +2. Topless females get an extra +1.
 * Total nudity gives no further bonus to defense."
 *
 * The extra point the book gives a bare chest is a flag of its own rather than
 * anything read off the sheet: what a character is wearing is the player's to
 * say, and it is not something to be inferred.
 */
export function nudityDefenseBonus(options: {
  dress: Dress;
  /** Levels of the Appearance advantage. Attractive is 1, and nothing below counts. */
  appearance: number;
  /** The book's extra +1 for a bare chest. */
  topless?: boolean;
}): number {
  if (options.appearance < 1) return 0;
  const base = options.dress === "clothed" ? 0 : options.dress === "bares" ? 1 : 2;
  if (base === 0) return 0;
  return base + (options.topless ? 1 : 0);
}

/**
 * What wearing nothing is worth to Move, on land and in water (p. 417).
 *
 * "Total nudity ... adds +1 to Move and +2 water Move." Unlike the defense
 * bonus this is not gated on looks: a swimmer is faster out of their clothes
 * whoever is watching, and the book gives no reason to read it otherwise.
 */
export function nudityMoveBonus(dress: Dress): { move: number; water: number } {
  return dress === "nude" ? { move: 1, water: 2 } : { move: 0, water: 0 };
}

// ── Cannon Fodder ───────────────────────────────────────────────────────────

/**
 * Whether a mook may attempt an active defense (p. 417).
 *
 * "They automatically fail all defense rolls" -- so none is rolled. A roll
 * whose result is known is a roll worth not making.
 */
export function cannonFodderDefends(): boolean {
  return false;
}

/** "... yet never All-Out Attack." */
export function cannonFodderMayUse(maneuver: string): boolean {
  return maneuver !== "allOutAttack";
}

/**
 * Whether this blow finishes a mook (p. 417).
 *
 * "They collapse (unconscious or dead) if any penetrating damage gets through
 * DR... In any event, don't bother keeping track of HP!"
 */
export function cannonFodderCollapses(penetrating: number): boolean {
  return penetrating > 0;
}

// ── Infinite Ammunition ─────────────────────────────────────────────────────

/**
 * What is left in the magazine after firing (p. 417).
 *
 * "PCs always have spare ammunition or power cells. If they use up all they
 * are carrying, they immediately find more." Which comes to the same thing as
 * the count never going down.
 */
export function shotsAfterFiring(options: {
  loaded: number;
  fired: number;
  infinite?: boolean;
}): number {
  if (options.infinite) return options.loaded;
  return Math.max(0, options.loaded - Math.max(0, Math.floor(options.fired)));
}

/** "Furthermore, weapons never malfunction." */
export function canMalfunction(infinite: boolean): boolean {
  return !infinite;
}

// ── Melee Etiquette ─────────────────────────────────────────────────────────

/**
 * Whether the attacker has to come at the defender face to face (p. 417).
 *
 * "If a PC chooses to fight unarmed or with melee weapons, his opponents
 * always face him one-on-one, one at a time." Facing him is the mechanical
 * half of it: nobody gets at his flank or his back while he is fighting hand
 * to hand, whatever the tokens on the map are doing. Gunfire is untouched --
 * the rule is about a melee.
 */
export function facesHimSquarely(delivery: Delivery): boolean {
  return delivery === "unarmed" || delivery === "melee";
}
