/**
 * Hurting Yourself (GURPS Basic Set: Campaigns p. 379).
 *
 * "Any time you strike unarmed (with bare hands, feet, fangs, etc.) and hit a
 * target with DR 3+, you may hurt yourself! For every 5 points of basic damage
 * you roll, you take one point of crushing damage, up to a maximum equal to
 * the DR of the target you hit. Apply this damage to the body part you used to
 * attack ... Your own DR protects against this damage."
 */

import type { HitLocation } from "./hit-locations.js";

/** The DR a target must have for an unarmed blow to hurt the striker. */
export const HURTING_YOURSELF_DR = 3;

/** The body part a natural attack strikes with, or null for one that doesn't count. */
export function strikingPart(naturalKey: string): HitLocation | null {
  switch (naturalKey) {
    case "punch":
    case "claw":
      return "hand";
    case "kick":
      return "foot";
    case "bite":
      return "face";
    default:
      return null;
  }
}

/** What an unarmed blow does to its striker: the crushing damage, and the injury past their own DR. */
export function hurtingYourself(options: { basicDamage: number; targetDr: number; ownDr: number; minimumDr?: number }): { damage: number; injury: number } {
  const dr = Math.max(0, Math.floor(Number(options.targetDr) || 0));
  const minimum = options.minimumDr ?? HURTING_YOURSELF_DR;
  if (dr < minimum || dr <= 0) return { damage: 0, injury: 0 };
  const damage = Math.min(dr, Math.floor(Math.max(0, Number(options.basicDamage) || 0) / 5));
  return { damage, injury: Math.max(0, damage - Math.max(0, Math.floor(Number(options.ownDr) || 0))) };
}
