/**
 * Trampling (GURPS Basic Set: Campaigns p. 404).
 *
 * "You can trample a victim if your Size Modifier exceeds his by 2 or more --
 * or by only 1, if he's lying prone and you're not. Trampling is a melee
 * attack: roll vs. the higher of DX or Brawling to hit. The victim's only
 * legal defense is a dodge. If you hit, you inflict thrust/crushing damage
 * based on your ST; if you have Hooves, add +1 per die of damage."
 *
 * And the version with no rolls at all: "If you knock down a foe in a
 * collision or slam and keep on moving, you automatically overrun and trample
 * your opponent. Do not make any attack or defense rolls -- roll damage
 * immediately, based on half your ST, rounded down."
 */

import { thrustDamage } from "./damage.js";
import { addModifier } from "./dice.js";
import type { DiceAdds } from "./types.js";

/** The Size Modifier advantage a trampler needs over somebody on their feet. */
export const TRAMPLE_SM_GAP = 2;
/** The advantage that will do against somebody already on the ground. */
export const TRAMPLE_SM_GAP_PRONE = 1;
/** From this much larger, the blow "counts as a large-area injury" (p. 400). */
export const LARGE_AREA_SM_GAP = 3;

export interface TrampleCheck {
  /** Whether this trampler is big enough to trample this victim at all. */
  allowed: boolean;
  /** True when only the victim being prone made it possible. */
  needsProne: boolean;
  /** "Don't worry about hit location -- your attack counts as a large-area injury." */
  largeArea: boolean;
}

/** Whether one creature may trample another, and how the damage lands (p. 404). */
export function canTrample(options: {
  tramplerSm: number;
  victimSm: number;
  /** The victim is lying down and the trampler is not. */
  victimProne?: boolean;
}): TrampleCheck {
  const gap = options.tramplerSm - options.victimSm;
  const prone = options.victimProne === true;
  const allowed = gap >= TRAMPLE_SM_GAP || (prone && gap >= TRAMPLE_SM_GAP_PRONE);
  return {
    allowed,
    needsProne: allowed && gap < TRAMPLE_SM_GAP,
    largeArea: gap >= LARGE_AREA_SM_GAP,
  };
}

/**
 * What a trample is rolled against: "the higher of DX or Brawling" (p. 404).
 *
 * Brawling is passed as the level the character has it at, or null for one
 * who never learned it.
 */
export function trampleSkill(dx: number, brawling: number | null): { level: number; from: "DX" | "Brawling" } {
  return brawling !== null && brawling > dx
    ? { level: brawling, from: "Brawling" }
    : { level: dx, from: "DX" };
}

/**
 * The damage a trample does (p. 404): "thrust/crushing damage based on your
 * ST; if you have Hooves, add +1 per die of damage". An overrun after a
 * knockdown is thrust "based on half your ST, rounded down" and is not
 * rolled for at all.
 */
export function trampleDamage(options: {
  st: number;
  hooves?: boolean;
  /** The automatic version, after knocking the foe down and moving on. */
  overrun?: boolean;
}): DiceAdds {
  const st = options.overrun ? Math.floor(Math.max(0, options.st) / 2) : options.st;
  const thrust = thrustDamage(st);
  return options.hooves ? addModifier(thrust, thrust.dice) : thrust;
}
