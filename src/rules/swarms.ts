/**
 * Swarms (GURPS Basic Set: Campaigns p. 461).
 *
 * "Treat a group of small creatures as a unit when it attacks. This 'swarm'
 * fills one hex on a combat map." It needs no attack roll and allows no
 * defense: "a swarm attack hits automatically ... Every turn until it is
 * dispersed, it does the listed damage to its victim(s)." Attacking one back
 * is the same bargain in reverse -- "any attack against a swarm hits
 * automatically. The swarm gets no defense roll" -- and what it takes is
 * capped, because "a swarm takes damage as if it were Diffuse", which the
 * injury rules already know how to do.
 *
 * What armour is worth depends on what the swarm is made of. "Against tiny
 * creatures like insects, ordinary clothing gives complete immunity for two
 * seconds, while low-tech armor protects for five seconds; then the bugs get
 * in and the protection becomes worthless! Against larger creatures like
 * rats, armor protects indefinitely with its normal DR."
 */

import type { DiceAdds } from "./types.js";

/** What the swarm is made of, which is what decides whether armour lasts. */
export type SwarmKind = "tiny" | "large";

/** What the victim is wearing against it. */
export type SwarmProtection =
  /** Nothing that keeps anything out. */
  | "none"
  /** Ordinary clothing: two seconds against the tiny. */
  | "clothing"
  /** Low-tech armour: five seconds against the tiny. */
  | "armor"
  /** A wetsuit, a beekeeper's suit, airtight armour: proof against the tiny. */
  | "sealed";

/** Seconds each kind of covering holds the tiny ones out (p. 461). */
export const TINY_PROTECTION_SECONDS: Readonly<Record<SwarmProtection, number>> = {
  none: 0,
  clothing: 2,
  armor: 5,
  sealed: Infinity,
};

/** A shield "does 2 HP per turn" to flying creatures, alongside a weapon. */
export const SHIELD_CRUSH_HP = 2;
/** "Stomping does 1 HP per turn to nonflying vermin", alongside a weapon. */
export const STOMP_HP = 1;

/** One of the book's three swarms, or a GM's own. */
export interface Swarm {
  /** What a "swarm" of them is: about a dozen bats, about a thousand bees. */
  about: string;
  kind: SwarmKind;
  move: number;
  flying: boolean;
  /** Damage a turn: a die of cutting for bats and rats, a flat point for bees. */
  damage: DiceAdds | null;
  /** A flat point of injury a turn, for the swarm that stings rather than bites. */
  flatInjury: number;
  damageType: "cut" | "pi-" | "cr";
  /** Hit points: "dispersed after losing 8 HP". */
  disperseAt: number;
}

/** The three the book works out (p. 461). */
export const SWARMS: Readonly<Record<"bats" | "bees" | "rats", Swarm>> = {
  bats: {
    about: "about a dozen carnivorous bats",
    kind: "large", move: 8, flying: true,
    damage: { dice: 1, adds: 0 }, flatInjury: 0, damageType: "cut", disperseAt: 8,
  },
  bees: {
    about: "about 1,000 common bees",
    kind: "tiny", move: 6, flying: true,
    damage: null, flatInjury: 1, damageType: "pi-", disperseAt: 12,
  },
  rats: {
    about: "about a dozen rats",
    kind: "large", move: 4, flying: false,
    damage: { dice: 1, adds: 0 }, flatInjury: 0, damageType: "cut", disperseAt: 6,
  },
};

/**
 * Whether armour still keeps this swarm out, and what DR it is worth
 * (p. 461).
 *
 * Against the large ones "armor protects indefinitely with its normal DR".
 * Against the tiny ones a covering holds for its few seconds and then "the
 * protection becomes worthless"; a sealed suit never lets them in at all.
 */
export function swarmProtection(options: {
  kind: SwarmKind;
  protection: SwarmProtection;
  /** Seconds the victim has already been in the swarm. */
  secondsExposed: number;
  /** The DR of what is worn, for the swarms armour actually stops. */
  dr: number;
}): { dr: number; immune: boolean; lasted: boolean } {
  if (options.protection === "sealed") return { dr: options.dr, immune: true, lasted: true };
  if (options.kind === "large") {
    return { dr: options.protection === "none" ? 0 : options.dr, immune: false, lasted: true };
  }
  const seconds = TINY_PROTECTION_SECONDS[options.protection];
  const lasted = options.secondsExposed < seconds;
  return { dr: lasted ? options.dr : 0, immune: lasted, lasted };
}

/** What a swarm does to somebody in its hex this second, before any armour. */
export function swarmAttackDamage(swarm: Swarm): { damage: DiceAdds | null; flatInjury: number } {
  return { damage: swarm.damage, flatInjury: swarm.flatInjury };
}

/** Whether the damage taken has broken the swarm up (p. 461). */
export function dispersed(hpTaken: number, swarm: Swarm): boolean {
  return hpTaken >= swarm.disperseAt;
}

/**
 * What a turn spent fighting a swarm does to it: the weapon's damage, plus
 * a shield crushing the fliers or a boot on the crawlers (p. 461).
 */
export function swarmDamageTaken(options: {
  weapon?: number;
  swarm: Swarm;
  shield?: boolean;
  stomp?: boolean;
}): { weapon: number; shield: number; stomp: number; total: number } {
  const weapon = Math.max(0, options.weapon ?? 0);
  // "Shields can crush flying creatures", and stomping is for "nonflying vermin".
  const shield = options.shield && options.swarm.flying ? SHIELD_CRUSH_HP : 0;
  const stomp = options.stomp && !options.swarm.flying ? STOMP_HP : 0;
  return { weapon, shield, stomp, total: weapon + shield + stomp };
}
