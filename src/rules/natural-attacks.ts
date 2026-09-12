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
 * number the dice are rolled against.
 *
 * Skill at unarmed combat hits harder (Characters pp. 182, 203): Brawling is
 * +1 per die of damage at DX+2, Boxing +1 per die at DX+1 and +2 at DX+2,
 * Karate +1 per die at DX itself and +2 at DX+1. The bonus goes on the dice
 * of thrust, and only for a blow made with that skill -- Boxing punches and
 * does not kick.
 */

import { thrustDamage } from "./damage.js";
import { addModifier } from "./dice.js";
import type { DamageType, DiceAdds } from "./types.js";

/** The kick's to-hit penalty (Characters p. 271). */
export const KICK_PENALTY = -2;

/** What the sheet knows that a natural attack needs. */
export interface NaturalAttackInput {
  st: number;
  dx: number;
  /** Levels of the unarmed skills the character has, by name; missing means untrained. */
  skills: Partial<Record<"Brawling" | "Boxing" | "Karate", number>>;
}

/** The unarmed skills that hit harder with training, and from what level. */
export type UnarmedSkill = "Brawling" | "Boxing" | "Karate";

/**
 * Bonus damage per die for a blow made with an unarmed skill at a level.
 *
 * Measured against DX because that is how the book states it: "Brawling at
 * DX+2 or better", "Boxing at DX+1", "Karate at DX". Anything else -- DX
 * itself, or a skill not on the list -- adds nothing.
 */
export function unarmedDamageBonusPerDie(skill: string, level: number, dx: number): number {
  const above = level - dx;
  switch (skill) {
    case "Brawling":
      return above >= 2 ? 1 : 0;
    case "Boxing":
      return above >= 2 ? 2 : above >= 1 ? 1 : 0;
    case "Karate":
      return above >= 1 ? 2 : above >= 0 ? 1 : 0;
    default:
      return 0;
  }
}

export interface NaturalAttack {
  key: "punch" | "kick" | "bite" | "claw" | "striker";
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

  // Training adds per die of thrust: a fighter with ST 17 (2d) and Karate at
  // DX+1 punches for 2d-1+4.
  const bonus = (chosen: { name: string; level: number }) =>
    unarmedDamageBonusPerDie(chosen.name, chosen.level, dx) * thrust.dice;

  return [
    {
      key: "punch",
      skillName: punch.name,
      skillLevel: punch.level,
      damage: addModifier(thrust, -1 + bonus(punch)),
      reach: "C",
      canParry: true,
    },
    {
      key: "kick",
      skillName: kick.name,
      skillLevel: kick.level + KICK_PENALTY,
      damage: addModifier(thrust, bonus(kick)),
      reach: "C, 1",
      canParry: false,
    },
  ];
}

// ── the beasts (Campaigns p. 460; Characters pp. 42, 88, 91) ──────────────

/** What a creature bites, claws and strikes with, read off its traits. */
export interface BeastTraits {
  /** Teeth: blunt, sharp (cutting), fangs (impaling), or a sharp beak (large piercing). */
  teeth?: "blunt" | "sharp" | "fangs" | "beak" | null;
  /** "Weak Bite, common for large herbivores, gives an extra -2 per die." */
  weakBite?: boolean;
  /** Claws: blunt (+1 per die, crushing), sharp (cutting, no bonus), or hooves (as blunt, for kicks). */
  claws?: "blunt" | "sharp" | "hooves" | "talons" | null;
  /** Strikers -- horns, tusks, antlers -- each with its damage type. */
  strikers?: Array<{ name: string; type: DamageType }>;
}

/** An animal attack, beside the punch and the kick. */
export interface BeastAttack extends NaturalAttack {
  damageType: DamageType;
}

/**
 * "Damage for Animals" (Campaigns p. 460).
 *
 * "Basic damage for a beast is thrust for its ST ... A bite does thrust-1.
 * Weak Bite ... gives an extra -2 per die. A bite is crushing unless the
 * creature has Sharp Teeth (cutting) or Fangs (impaling). A claw does
 * thrust-1, like a punch. Blunt Claws give +1 per die, and damage is
 * crushing. Sharp Claws give no bonus, but inflict cutting damage. ... Most
 * other attacks (horns, tusks, etc.) are Strikers. These inflict thrust
 * damage, at +1 per die. ... Brawling at DX+2 level or better ... adds +1
 * per die to basic thrust damage for any of these attacks!"
 *
 * A creature without teeth traits, claws or strikers has none of these: an
 * ordinary set of blunt teeth is a bite the book does not bother to list.
 */
export function beastAttacks(input: NaturalAttackInput & { beast: BeastTraits }): BeastAttack[] {
  const { st, dx, skills, beast } = input;
  const thrust = thrustDamage(st);
  const skill = best([["Brawling", skills.Brawling]], dx);
  const trained = unarmedDamageBonusPerDie(skill.name, skill.level, dx) * thrust.dice;
  const out: BeastAttack[] = [];

  if (beast.teeth || beast.weakBite) {
    const type: DamageType =
      beast.teeth === "sharp" ? "cut" : beast.teeth === "fangs" ? "imp" : beast.teeth === "beak" ? "pi+" : "cr";
    out.push({
      key: "bite",
      skillName: skill.name,
      skillLevel: skill.level,
      damage: addModifier(thrust, -1 + trained - (beast.weakBite ? 2 * thrust.dice : 0)),
      damageType: type,
      reach: "C",
      canParry: false,
    });
  }

  if (beast.claws && beast.claws !== "hooves") {
    const blunt = beast.claws === "blunt";
    out.push({
      key: "claw",
      skillName: skill.name,
      skillLevel: skill.level,
      damage: addModifier(thrust, -1 + trained + (blunt ? thrust.dice : 0)),
      damageType: blunt ? "cr" : "cut",
      reach: "C",
      canParry: false,
    });
  }

  for (const striker of beast.strikers ?? []) {
    out.push({
      key: "striker",
      skillName: striker.name,
      skillLevel: skill.level,
      damage: addModifier(thrust, thrust.dice + trained),
      damageType: striker.type,
      reach: "C",
      canParry: false,
    });
  }

  return out;
}

/** The natural weapons a beast has, read off the names of its traits. */
export function beastTraitsFrom(names: readonly string[]): BeastTraits {
  const beast: BeastTraits = { teeth: null, weakBite: false, claws: null, strikers: [] };
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (name === "teeth (sharp teeth)" || name === "sharp teeth") beast.teeth = "sharp";
    else if (name === "teeth (fangs)" || name === "fangs") beast.teeth = "fangs";
    else if (name === "teeth (sharp beak)" || name === "sharp beak") beast.teeth = "beak";
    else if (name === "teeth (blunt teeth)" || name === "vampiric bite") beast.teeth = beast.teeth ?? "blunt";
    else if (name === "weak bite") beast.weakBite = true;
    else if (name === "claws (sharp claws)" || name === "sharp claws") beast.claws = "sharp";
    else if (name === "claws (blunt claws)" || name === "blunt claws") beast.claws = "blunt";
    else if (name === "claws (talons)" || name === "claws (long talons)") beast.claws = "talons";
    else if (name === "claws (hooves)" || name === "hooves") beast.claws = beast.claws ?? "hooves";
    else {
      const striker = /^striker \((crushing|cutting|impaling|piercing|large piercing)(?:; )?([^)]*)\)(?:: (.*))?$/.exec(name);
      if (striker) {
        const type: DamageType =
          striker[1] === "crushing" ? "cr" : striker[1] === "cutting" ? "cut" : striker[1] === "impaling" ? "imp" : striker[1] === "large piercing" ? "pi+" : "pi";
        const label = (striker[3] || striker[2] || "").trim();
        beast.strikers!.push({ name: label ? label.replace(/^\w/, (c) => c.toUpperCase()) : "Striker", type });
      }
    }
  }
  if (beast.claws === "talons") beast.claws = "sharp";
  return beast;
}
