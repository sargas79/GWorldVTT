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
import { HIT_LOCATIONS, HIT_LOCATION_ORDER, cripplingThreshold, type HitLocation } from "../rules/hit-locations.js";
import { resolveSuccess } from "../rules/success.js";
import { rangedToHitModifier } from "../rules/ranged.js";
import {
  AQUATIC_FORAGING, combatVision, exposedLocations, foragingModifier, frostbiteCripples, frostbiteDamage, plainSightBonus,
  signalRange, signalVisionBonus, TERRAIN_TYPES, type AquaticTerrain, type CombatVision, type TerrainType,
} from "../rules/vision-corrections.js";
import { SYSTEM_ID } from "./constants.js";
import { cripple } from "./crippling.js";
import { skillLevelOf } from "./skill-level.js";
import { rollSuccess, yardsBetween } from "./roll.js";
import { currentTerrain } from "./vision-prompts.js";

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
  // Each location keeps a running tally: "This can cripple extremities or even
  // limbs" (p. 574), which is the same injury as any other over the location's
  // crippling threshold. The tally starts over once the victim is back at full HP.
  const max = Number(actor.system?.hp?.max) || 0;
  const healed = (Number(actor.system?.hp?.value) || 0) >= max;
  const tally: Record<string, number> = healed ? {} : { ...((actor.getFlag?.(SYSTEM_ID, FROSTBITE_FLAG) as Record<string, number> | undefined) ?? {}) };
  const crippledNow: string[] = [];
  for (const part of parts) {
    const before = Number(tally[part.location]) || 0;
    const after = before + part.hp;
    tally[part.location] = after;
    const threshold = HIT_LOCATIONS[part.location as HitLocation] ? cripplingThreshold(part.location as HitLocation, max) : null;
    if (!frostbiteCripples(before, threshold) && frostbiteCripples(after, threshold)) crippledNow.push(part.location);
  }
  await spendHitPointsFor(actor, total, { reason: "frostbite" });
  if (typeof actor.setFlag === "function") await actor.setFlag(SYSTEM_ID, FROSTBITE_FLAG, tally);
  const where = parts.map((part) => `${game.i18n.localize(`GWORLD.HitLocation.${part.location}`)} ${part.hp}`).join(", ");
  await post(actor, L("Frostbitten", { name: String(actor.name ?? ""), hp: total, where }));
  for (const location of crippledNow) {
    // Lasting is the GM's ruling by the usual HT roll; recorded undecided, as an injury.
    await cripple(actor, location, { label: L("FrostbiteLabel") });
    await post(actor, L("FrostbiteCrippled", { name: String(actor.name ?? ""), part: game.i18n.localize(`GWORLD.HitLocation.${location}`) }));
  }
  return total;
}

/** Where the running frostbite tally is kept on an actor. */
const FROSTBITE_FLAG = "frostbite";

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
  /** Leave the chat line to the caller, which is about to roll the skill. */
  quiet?: boolean;
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
  if (!options.quiet) await post(options.actor, L("Forage", { terrain: game.i18n.localize(`GWORLD.Vision.Terrain_${options.terrain}`), modifier }), rolls);
  return { modifier, terrain: options.terrain };
}

/** Whether a terrain key is an aquatic one, foraged with Fishing. */
const isAquatic = (terrain: string): terrain is AquaticTerrain => terrain in AQUATIC_FORAGING;

/**
 * The skill a foraging roll is made with (p. 427): Survival in the terrain's
 * specialty, or Fishing under water. Where the character lacks it, Naturalist-3
 * or Per-5, the defaults Survival has.
 */
export function forageSkill(actor: any, terrain: TerrainType | AquaticTerrain): { name: string; level: number } {
  const specialty = game.i18n.localize(`GWORLD.Vision.Terrain_${terrain}`);
  const name = isAquatic(terrain) ? "Fishing" : `Survival (${specialty})`;
  const known = skillLevelOf(actor, name);
  if (known !== null) return { name, level: known };
  const naturalist = isAquatic(terrain) ? null : skillLevelOf(actor, "Naturalist");
  if (naturalist !== null) return { name, level: naturalist - 3 };
  return { name, level: (Number(actor?.system?.derived?.per) || attributeOf(actor, "IQ")) - 5 };
}

/**
 * A foraging roll (p. 427) in a terrain (p. 573): the terrain's modifier,
 * rolled, averaged or the exceptional extreme, added to the roll of the skill
 * foraging uses. Terrain defaults to the one the GM set. Returns the modifier
 * and the roll, or null where nothing can be rolled.
 */
export async function forage(options: {
  actor: any;
  terrain?: TerrainType | AquaticTerrain;
  average?: boolean;
  exceptional?: "rich" | "desolate";
}): Promise<{ modifier: number; roll: Awaited<ReturnType<typeof rollSuccess>> } | null> {
  const terrain = options.terrain ?? currentTerrain()?.terrain;
  if (!terrain || !options.actor?.isOwner) return null;
  const found = await forageModifier({ actor: options.actor, terrain, ...(options.average !== undefined ? { average: options.average } : {}), ...(options.exceptional ? { exceptional: options.exceptional } : {}), quiet: true });
  const skill = forageSkill(options.actor, terrain);
  const roll = await rollSuccess({
    actor: options.actor,
    base: skill.level,
    label: L("ForageRoll", { skill: skill.name }),
    kind: "skill",
    skill: skill.name,
    modifiers: [{ label: L("ForageLine", { terrain: game.i18n.localize(`GWORLD.Vision.Terrain_${terrain}`) }), value: found.modifier, key: "terrain" }],
  });
  return { modifier: found.modifier, roll };
}

// -- Vision rolls in the defense flow (pp. 574-575) ---------------------------

/** What a defender must see to defend: the attacker's SM and the range penalty, and whether a roll is called for. */
export interface CombatVisionNeed {
  check: CombatVision;
  attackerSm: number;
  rangePenalty: number;
}

const VISION_MEMO_FLAG = "combatVision";
const VISION_MEMO_KEPT = 12;

/**
 * Whether the attack on this card calls for a Vision roll before the defender
 * may defend (switch `visionRollsInCombat`): an attacker of SM -10 or smaller,
 * or a ranged one at a range penalty of -10 or worse, the range read off the map.
 * Null where the rule is off or no roll is called for.
 */
export async function combatVisionNeed(options: {
  attacker: any;
  attackerToken?: string | undefined;
  defenderToken?: string | undefined;
  delivery?: string | undefined;
}): Promise<CombatVisionNeed | null> {
  if (!isRuleOn("visionRollsInCombat")) return null;
  const attackerSm = Number(options.attacker?.system?.sm) || 0;
  let rangePenalty = 0;
  if (options.delivery === "ranged" && options.attackerToken && options.defenderToken) {
    const from: any = await fromUuid(options.attackerToken).catch(() => null);
    const to: any = await fromUuid(options.defenderToken).catch(() => null);
    const yards = yardsBetween(from?.object ?? null, to?.object ?? null);
    if (yards !== null) rangePenalty = rangedToHitModifier({ rangeYards: yards, targetSpeedYardsPerSecond: 0, targetSizeModifier: 0 }).speedRange;
  }
  const check = combatVision({ attackerSm, rangePenalty });
  return check.needsRoll ? { check, attackerSm, rangePenalty } : null;
}

/** What the defender already found out about the attack on this card: true (saw), false (did not), null (not yet rolled). */
export function combatVisionMemo(defender: any, messageId: string): boolean | null {
  const memo = defender?.getFlag?.(SYSTEM_ID, VISION_MEMO_FLAG) as Record<string, boolean> | undefined;
  const value = memo?.[messageId];
  return typeof value === "boolean" ? value : null;
}

/**
 * Rolls the Vision roll an attack calls for, once per attack and defender (the
 * answer is kept on the defender), and returns whether they saw it coming.
 * Failure means the attacker is invisible to them: no active defense.
 */
export async function settleCombatVision(defender: any, messageId: string, need: CombatVisionNeed): Promise<boolean> {
  const known = combatVisionMemo(defender, messageId);
  if (known !== null) return known;
  const { sees } = await rollCombatVision({ actor: defender, attackerSm: need.attackerSm, rangePenalty: need.rangePenalty });
  if (defender?.isOwner && typeof defender.setFlag === "function") {
    const memo = { ...((defender.getFlag?.(SYSTEM_ID, VISION_MEMO_FLAG) as Record<string, boolean> | undefined) ?? {}), [messageId]: sees };
    const keys = Object.keys(memo);
    for (const key of keys.slice(0, Math.max(0, keys.length - VISION_MEMO_KEPT))) delete memo[key];
    await defender.setFlag(SYSTEM_ID, VISION_MEMO_FLAG, memo);
  }
  return sees;
}

/** The namespace of the API (since 1.180.0). */
export const visionApi = Object.freeze({
  rollCombatVision,
  exposedOf,
  applyFrostbite,
  forageModifier,
  forage,
  forageSkill,
  combatVisionNeed,
  settleCombatVision,
  signalRange,
  signalVisionBonus,
  plainSightBonus,
});
