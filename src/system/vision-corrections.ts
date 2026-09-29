/**
 * Terrain, illumination, vision, frostbite and the horizon (Basic Set Revised
 * pp. 573-575), the parts that reach an actor or the chat.
 *
 * The figures are `rules/vision-corrections.ts`. This file has: frostbite after
 * a failed roll against the cold (switch `frostbite`), the Vision roll that
 * decides whether an unseen attack allows a defense (switch
 * `visionRollsInCombat`), a foraging roll by terrain (switch `terrainTypes`),
 * and the visual-signal range and Vision bonus.
 */

import { spendHitPointsFor } from "./fatigue.js";
import { wornArmor } from "./damage.js";
import { isRuleOn } from "./optional-rules.js";
import { attributeOf } from "./attributes.js";
import { HIT_LOCATION_ORDER } from "../rules/hit-locations.js";
import { resolveSuccess } from "../rules/success.js";
import {
  AQUATIC_FORAGING, combatVision, exposedLocations, foragingModifier, frostbiteDamage, plainSightBonus,
  signalRange, signalVisionBonus, TERRAIN_TYPES, type AquaticTerrain, type CombatVision, type TerrainType,
} from "../rules/vision-corrections.js";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Vision.${key}`, data) : game.i18n.localize(`GWORLD.Vision.${key}`);

async function post(actor: any, html: string, rolls: any[] = []): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><p>${html}</p></div>`,
    rolls,
  });
}

/** The locations something worn covers, gloves and balaclavas included; a piece naming none covers all. */
export function coveredLocations(actor: any): string[] {
  const covered = new Set<string>();
  for (const piece of wornArmor(actor)) {
    const places = piece.locations?.length ? piece.locations : HIT_LOCATION_ORDER;
    for (const place of places) covered.add(place);
  }
  return [...covered];
}

/** The exposed locations of an actor, from what it wears (p. 574). */
export function exposedOf(actor: any): string[] {
  return exposedLocations(coveredLocations(actor));
}

/**
 * Frostbite (p. 574): 1 HP on each exposed hit location per FP lost to cold.
 * Returns the HP lost, 0 where the rule is off or nothing is exposed. The
 * damage is charged in one sum; a location's crippling is the GM's to rule.
 */
export async function applyFrostbite(actor: any, fpLost: number): Promise<number> {
  if (!isRuleOn("frostbite") || !actor?.isOwner) return 0;
  const parts = frostbiteDamage(fpLost, exposedOf(actor));
  const total = parts.reduce((sum, part) => sum + part.hp, 0);
  if (total <= 0) return 0;
  await spendHitPointsFor(actor, total, { reason: "frostbite" });
  const where = parts.map((part) => `${game.i18n.localize(`GWORLD.HitLocation.${part.location}`)} ${part.hp}`).join(", ");
  await post(actor, L("Frostbitten", { name: String(actor.name ?? ""), hp: total, where }));
  return total;
}

/**
 * The Vision roll that decides whether an attack is seen coming (pp. 574-575).
 * `modifier` is the whole modifier the caller has worked out apart from the
 * attacker's SM and the range penalty; where no roll is needed, or Vision is
 * at a bonus, the defender sees it. Returns whether the defender may defend.
 */
export async function rollCombatVision(options: {
  actor: any;
  attackerSm?: number;
  rangePenalty?: number;
  other?: number;
  /** Unseen ranged attacks from concealment: the roll has no +10 (a second attack on). */
  fromConcealment?: boolean;
}): Promise<{ sees: boolean; rolled: boolean; check: CombatVision }> {
  const check = combatVision({ attackerSm: options.attackerSm, rangePenalty: options.rangePenalty, other: options.other });
  if (!isRuleOn("visionRollsInCombat") || !check.needsRoll) return { sees: true, rolled: false, check };
  const modifier = check.modifier - (options.fromConcealment ? 10 : 0);
  const target = (Number(options.actor?.system?.derived?.per) || attributeOf(options.actor, "IQ")) + modifier;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const sees = resolveSuccess(roll.total, target, roll.dice.flatMap((die: any) => die.results.map((r: any) => r.result))).success;
  await post(options.actor, L(sees ? "Saw" : "Missed", { name: String(options.actor?.name ?? ""), target, roll: roll.total }), [roll]);
  return { sees, rolled: true, check };
}

/** What a foraging roll came to. */
export interface ForageResult {
  modifier: number;
  terrain: TerrainType | AquaticTerrain;
}

/**
 * The foraging modifier for a terrain (p. 573), rolled (2d-7 and the like) or,
 * with `average`, the listed one; exceptional terrain takes the maximum or
 * minimum. It is posted for the GM to add to the Foraging roll.
 */
export async function forageModifier(options: {
  actor?: any;
  terrain: TerrainType | AquaticTerrain;
  average?: boolean;
  exceptional?: "rich" | "desolate";
}): Promise<ForageResult> {
  const aquatic = (AQUATIC_FORAGING as Record<string, { dice: number; add: number }>)[options.terrain];
  const land = (TERRAIN_TYPES as Record<string, (typeof TERRAIN_TYPES)[TerrainType]>)[options.terrain];
  const dice = (aquatic ?? land?.foraging) ?? { dice: 2, add: -7 };
  let modifier: number;
  const rolls: any[] = [];
  if (options.exceptional && land) modifier = foragingModifier(options.terrain as TerrainType, { exceptional: options.exceptional });
  else if (options.exceptional) modifier = options.exceptional === "rich" ? dice.dice * 6 + dice.add : dice.dice + dice.add;
  else if (options.average) modifier = land ? land.foragingAverage : Math.round(dice.dice * 3.5 + dice.add);
  else {
    const roll = new Roll(`${dice.dice}d6`);
    await roll.evaluate();
    rolls.push(roll);
    modifier = roll.total + dice.add;
  }
  await post(options.actor, L("Forage", { terrain: game.i18n.localize(`GWORLD.Vision.Terrain_${options.terrain}`), modifier }), rolls);
  return { modifier, terrain: options.terrain };
}

/** The namespace of the API (since 1.180.0). */
export const visionApi = Object.freeze({
  rollCombatVision,
  exposedOf,
  applyFrostbite,
  forageModifier,
  signalRange,
  signalVisionBonus,
  plainSightBonus,
});
