/**
 * Weapons that break, on the sheet and in the chat log (GURPS Basic Set:
 * Campaigns pp. 376, 400-401, 483-485, 556).
 *
 * The rules are in `src/rules/breakage.ts`; this is where they meet an
 * item. A weapon is damaged three ways here -- struck at, parried against
 * something far heavier, or fumbled on the Critical Miss Table -- and each
 * ends the same way: the damage goes on the item, the item's state is read
 * off its HP, and a disabled weapon rolls on the Broken Weapons table.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { rollSuccess, rollDamage } from "./roll.js";
import {
  brokenWeaponKindFor,
  brokenWeaponResult,
  heavyParryBreakChance,
  heavyParryOutcome,
  isSolidCrushing,
  maxParryableWeight,
  resistsBreakage,
  strikeAtWeaponPenalty,
  weaponCondition,
  weaponState,
  type BrokenWeaponKind,
  type WeaponCondition,
} from "../rules/breakage.js";
import {
  breakageQuality,
  outranks,
  type WeaponClass,
  type WeaponMaterial,
  type WeaponQuality,
} from "../rules/weapon-quality.js";
import { diffuseInjuryCap, toleratedWoundingModifier, noInjuryTolerance } from "../rules/injury-tolerance.js";
import type { ObjectKind } from "../rules/objects.js";
import type { DamageType } from "../rules/types.js";
import { COMBAT_HOOKS, callCombatHook } from "./combat-extensions.js";
import { facingAgainstTarget } from "./attack-arc.js";
import { targetedTokens } from "./targets.js";
import { objectStats, weaponMakeOf } from "./object-stats.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/weapon-damage.hbs`;

/** What the breakage rules need to know about one weapon. */
export interface WeaponFacts {
  name: string;
  quality: WeaponQuality;
  material: WeaponMaterial;
  weaponClass: WeaponClass;
  firearm: boolean;
  ranged: boolean;
  skill: string;
  weight: number;
  /** How damage treats it, once modules have had their say (since API 1.126.0). */
  kind: ObjectKind;
  dr: number;
  hp: number;
  /** Its HT as an object (since API 1.90.0). */
  ht: number;
  /** What modules said about its DR, HP and HT (since API 1.90.0). */
  objectNotes: string[];
  hpLost: number;
  condition: WeaponCondition;
  brokenKind: BrokenWeaponKind;
  resistsBreakage: boolean;
}

/** Reads the facts off an equipment or shield item. */
export function weaponFacts(item: any): WeaponFacts {
  const sys = item?.system ?? {};
  const make = weaponMakeOf(item);
  const { melee, ranged, skills, types, material, weaponClass, firearm, weight, skill } = make;
  const quality = (isRuleOn("weaponQuality") ? String(sys.quality ?? "good") : "good") as WeaponQuality;
  const stats = objectStats(item, make);
  const { dr, hp, ht } = stats;
  const hpLost = Number(sys.hpLost ?? 0) || 0;
  return {
    name: String(item?.name ?? ""),
    quality,
    material,
    weaponClass,
    firearm,
    ranged: melee.length === 0 && ranged.length > 0,
    skill,
    weight,
    kind: stats.kind,
    dr,
    hp,
    ht,
    objectNotes: stats.notes,
    hpLost,
    condition: hp > 0 ? weaponCondition(weaponState(hpLost, hp)) : "sound",
    brokenKind: brokenWeaponKindFor({ skill, weightLbs: weight, ranged: melee.length === 0 && ranged.length > 0 }),
    resistsBreakage: resistsBreakage({
      quality,
      solidCrushing: isSolidCrushing(skill, types),
      magic: Array.isArray(sys.enchantments) && sys.enchantments.length > 0,
      firearm,
      wheelLockOrGuidedOrBeam: skills.some((s) => /Beam Weapons|Guided Missile/i.test(s)),
    }),
  };
}

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Breakage.${key}`, data) : game.i18n.localize(`GWORLD.Breakage.${key}`);

/** Posts one of this module's cards. */
async function postCard(actor: any, context: Record<string, unknown>, rolls: any[] = []): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, context);
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls,
  });
}

/**
 * A disabled weapon rolls on the Broken Weapons table (p. 485): what is
 * left in the hand, and what is lying on the ground.
 */
async function rollBrokenWeapon(facts: WeaponFacts): Promise<{ roll: any; result: string; text: string }> {
  const roll = new Roll("1d6");
  await roll.evaluate();
  const result = brokenWeaponResult(facts.brokenKind, roll.total);
  return { roll, result, text: game.i18n.localize(`GWORLD.Breakage.Broken.${result}`) };
}

/**
 * Breaks a weapon outright: a heavy parry that snapped it, a fumble that
 * the table says broke it. "Homogenous objects, such as swords, bend or
 * break, but might remain partially usable" (p. 484), so the weapon is put
 * at zero HP -- disabled -- and the Broken Weapons table says how usable.
 */
export async function breakWeapon(actor: any, item: any, reason: "parry" | "fumble"): Promise<void> {
  if (!item?.isOwner) return;
  const before = weaponFacts(item);
  const hpLost = Math.max(before.hpLost, before.hp);
  await item.update({ "system.hpLost": hpLost });
  const facts = weaponFacts(item);
  const broken = await rollBrokenWeapon(facts);
  await postCard(actor, {
    label: L(reason === "parry" ? "SnappedParrying" : "SnappedFumbling", { name: facts.name }),
    facts,
    broken,
  }, [broken.roll]);
}

/**
 * Parrying Heavy Weapons (p. 376), after the parry has been rolled.
 *
 * Only a weapon can snap this way -- "this does not apply to barehanded
 * parries" -- and only against something three times its weight. Blade
 * composition changes the quality the parrying weapon breaks as when the
 * attacker's swung weapon is of better metal (Characters p. 275).
 */
export async function heavyParryCheck(options: {
  defender: any;
  parryWeapon: { itemId: string; weight: number; quality: WeaponQuality; material: WeaponMaterial; natural: boolean; breakage?: number } | undefined;
  attackWeapon: { weight: number; material: string; swung: boolean };
  parried: boolean;
  /** Who attacked, and how, for the modules' hook (since 1.43.0). */
  attacker?: any;
  delivery?: string;
  /** The attack roll's tags (since 1.44.0). */
  attackTags?: readonly string[];
}): Promise<void> {
  const { defender, parryWeapon, attackWeapon } = options;
  if (!parryWeapon || parryWeapon.natural || !isRuleOn("weaponBreakage")) return;
  const item = defender?.items?.get?.(parryWeapon.itemId);
  const superiorSwing = attackWeapon.swung && outranks(attackWeapon.material as WeaponMaterial, parryWeapon.material);
  const quality = breakageQuality(parryWeapon.quality, parryWeapon.material, superiorSwing);
  // A module may set the odds a weapon breaks at, in place of its grade's.
  const odds = callCombatHook(COMBAT_HOOKS.breakageOdds, {
    defender,
    item,
    attackWeapon,
    quality,
    // Odds a module set replace the grade's, except against a superior swing.
    breakage: parryWeapon.breakage !== undefined && quality === parryWeapon.quality ? parryWeapon.breakage : undefined as number | undefined,
    // Since 1.25.0: the weight the parry counts, which a module may change,
    // and the weapon that breaks, which a module may name.
    weight: parryWeapon.weight,
    // Since 1.43.0: who attacked, and how the blow arrived.
    attacker: options.attacker ?? null,
    delivery: options.delivery ?? "",
    // Since 1.44.0: the attack's tags, and the weight the attack counts as,
    // which a module may change.
    attackTags: [...(options.attackTags ?? [])],
    attackWeight: attackWeapon.weight,
  });
  const breaking = odds.item ?? item;
  const chance = heavyParryBreakChance({
    parryingWeight: typeof odds.weight === "number" && Number.isFinite(odds.weight) && odds.weight > 0 ? odds.weight : parryWeapon.weight,
    attackingWeight: typeof odds.attackWeight === "number" && Number.isFinite(odds.attackWeight) && odds.attackWeight >= 0 ? odds.attackWeight : attackWeapon.weight,
    quality,
    ...(typeof odds.breakage === "number" && Number.isFinite(odds.breakage) ? { breakage: odds.breakage } : {}),
  });
  if (chance <= 0) return;

  const roll = new Roll("1d6");
  await roll.evaluate();
  const outcome = heavyParryOutcome(chance, roll.total);
  const name = String(breaking?.name ?? "");

  if (!outcome.breaks) {
    await postCard(defender, {
      label: L("HeavyParry", { name }),
      heavy: { chance, die: roll.total, held: true, parryCounts: true },
    }, [roll]);
    return;
  }

  // "If your weapon breaks, the parry still counts unless the odds of
  // breakage exceeded 6 in 6."
  await postCard(defender, {
    label: L("HeavyParry", { name }),
    heavy: { chance, die: roll.total, held: false, parryCounts: outcome.parryCounts && options.parried },
  }, [roll]);
  if (breaking) await breakWeapon(defender, breaking, "parry");
}

/**
 * Whether a parry may be attempted at all (p. 376): "you cannot parry a
 * weapon heavier than your Basic Lift -- or twice BL, if using a two-handed
 * weapon. Attempts to parry anything heavier fail automatically."
 */
export function parryTooHeavy(options: {
  basicLift: number;
  twoHanded: boolean;
  attackWeight: number;
}): boolean {
  return options.attackWeight > maxParryableWeight(options.basicLift, options.twoHanded);
}

/** Says a parry could not be made, and why. */
export async function postParryTooHeavy(defender: any, attackWeight: number, basicLift: number): Promise<void> {
  await postCard(defender, {
    label: L("TooHeavy"),
    tooHeavy: { attackWeight, basicLift },
  });
}

// ── striking at a weapon (pp. 400-401) ────────────────────────────────────

/** The weapons a foe has in hand, for the strike dialog to choose from. */
export function weaponsInHand(foe: any): Array<{ id: string; name: string; penalty: number }> {
  const rows: any[] = [...(foe?.system?.derived?.melee ?? []), ...(foe?.system?.derived?.ranged ?? [])];
  const out = new Map<string, { id: string; name: string; penalty: number }>();
  for (const row of rows) {
    const id = String(row?.itemId ?? "");
    if (!id || out.has(id)) continue;
    const penalty = row.reach !== undefined && row.reach !== ""
      ? strikeAtWeaponPenalty({ reach: String(row.reach) })
      : strikeAtWeaponPenalty({ bulk: Number(row.bulk ?? 0) || 0 });
    out.set(id, { id, name: String(row.name ?? ""), penalty });
  }
  return [...out.values()];
}

/** Something on a foe that can be struck at, and what striking at it allows (since 1.31.0). */
export interface WeaponTarget {
  id: string;
  name: string;
  /** The penalty to hit it. */
  penalty: number;
  /** Whether it can be knocked away as well as damaged. */
  canDisarm: boolean;
  /** The foe may not parry the blow. */
  noParry: boolean;
  /** The foe's Defense Bonus doesn't count against the blow. */
  noDefenseBonus: boolean;
  /** The disarm's extra -2 applies whatever the weapon striking. */
  disarmPenaltyForAll: boolean;
}

/**
 * The things a character may strike at on a foe: the weapons in hand, at the
 * penalty for their size, and what a module's rules add or change.
 */
export function weaponTargetsFor(actor: any, foe: any): WeaponTarget[] {
  const targets: WeaponTarget[] = weaponsInHand(foe).map((w) => ({ ...w, canDisarm: true, noParry: false, noDefenseBonus: false, disarmPenaltyForAll: false }));
  // Where the blow comes from, read as a called shot reads it (since API
  // 1.137.0): some of what a foe carries can't be reached from every side.
  // Only for the one token targeted, which is the foe a strike is made at.
  const facing = targetedTokens()[0]?.actor === foe ? facingAgainstTarget(actor) : null;
  const hooked = callCombatHook(COMBAT_HOOKS.weaponTargets, { actor, foe, targets, arc: facing?.arc ?? null, side: facing?.side ?? null });
  const out = new Map<string, WeaponTarget>();
  for (const t of Array.isArray(hooked.targets) ? hooked.targets : []) {
    const id = String(t?.id ?? "");
    if (!id || out.has(id) || !foe?.items?.get?.(id)) continue;
    out.set(id, {
      id,
      name: String(t.name ?? foe.items.get(id)?.name ?? ""),
      penalty: Math.round(Number(t.penalty) || 0),
      canDisarm: t.canDisarm !== false,
      noParry: t.noParry === true,
      noDefenseBonus: t.noDefenseBonus === true,
      disarmPenaltyForAll: t.disarmPenaltyForAll === true,
    });
  }
  return [...out.values()];
}

/**
 * What a ranged attack may be aimed at on a foe (p. 400; since API
 * 1.153.0). A blow to break a weapon may be made with any weapon, a firearm
 * included, so a shot may be; knocking one away takes a weapon that can
 * parry, so a shot only ever breaks. The same targets, at the same penalties,
 * as the melee strike, with nothing offered while weapon breakage is off.
 */
export function rangedWeaponTargets(actor: any, foe: any): WeaponTarget[] {
  if (!foe || !isRuleOn("weaponBreakage")) return [];
  return weaponTargetsFor(actor, foe);
}

/** A strike at a foe's weapon, as the attack records it for the damage roll (since API 1.153.0). */
export interface WeaponStrike {
  actorUuid: string;
  itemId: string;
  name: string;
}

/**
 * The line a strike at a weapon puts on the attack: the penalty for the
 * weapon's size (p. 400), keyed `strikeAtWeapon` and carrying the item's id,
 * so a listener can tell which weapon is being shot at (since API 1.153.0).
 */
export function weaponStrikeLine(target: Pick<WeaponTarget, "id" | "penalty">): {
  label: string;
  value: number;
  key: string;
  itemId: string;
} {
  return { label: L("StrikePenalty"), value: target.penalty, key: "strikeAtWeapon", itemId: target.id };
}

/** Where a shot at a weapon waits between the attack and the damage roll. */
export const WEAPON_STRIKE_FLAG = "weaponStrike";

/**
 * Remembers that the attack was aimed at a weapon, so the damage roll -- a
 * separate click -- is aimed at it too. Null clears it: every attack says
 * what it was aimed at, so an old one never carries over.
 */
export async function recordWeaponStrike(actor: any, strike: WeaponStrike | null): Promise<void> {
  if (!actor?.isOwner) return;
  if (!strike) {
    if (actor.getFlag?.(SYSTEM_ID, WEAPON_STRIKE_FLAG)) await actor.unsetFlag(SYSTEM_ID, WEAPON_STRIKE_FLAG);
    return;
  }
  await actor.setFlag(SYSTEM_ID, WEAPON_STRIKE_FLAG, { ...strike });
}

/** Collects it for the damage roll, and clears it either way. */
export async function consumeWeaponStrike(actor: any): Promise<WeaponStrike | null> {
  const held = actor?.getFlag?.(SYSTEM_ID, WEAPON_STRIKE_FLAG);
  if (!held) return null;
  if (actor.isOwner) await actor.unsetFlag(SYSTEM_ID, WEAPON_STRIKE_FLAG);
  const itemId = String(held.itemId ?? "");
  const actorUuid = String(held.actorUuid ?? "");
  if (!itemId || !actorUuid) return null;
  return { actorUuid, itemId, name: String(held.name ?? "") };
}

/**
 * Strikes at a foe's weapon to break it (p. 401): an ordinary attack at
 * the penalty for the weapon's size, and "if you hit and your foe fails to
 * defend, roll your normal damage against his weapon".
 *
 * The damage is rolled straight away, as a card aimed at the weapon; the
 * defense is the foe's to roll first, so the card is applied only once
 * somebody says the blow landed.
 */
export async function rollStrikeToBreak(options: {
  actor: any;
  foe: any;
  itemId: string;
  /** The attacker's own attack, as the Combat tab lists it. */
  attack: { name: string; skillLevel: number; damage: string; damageType: DamageType; armorDivisor: number };
}): Promise<void> {
  const { actor, foe, itemId, attack } = options;
  const item = foe?.items?.get?.(itemId);
  if (!item) return;
  const facts = weaponFacts(item);
  const target = weaponTargetsFor(actor, foe).find((w) => w.id === itemId);
  const penalty = target?.penalty ?? -4;

  const outcome = await rollSuccess({
    actor,
    base: attack.skillLevel,
    kind: "attack",
    label: L("StrikeLabel", { weapon: facts.name, foe: String(foe?.name ?? "") }),
    modifiers: [{ label: L("StrikePenalty"), value: penalty }],
    ...(target?.noParry || target?.noDefenseBonus ? { strikeLimits: { noParry: target.noParry, noDefenseBonus: target.noDefenseBonus } } : {}),
  });
  if (!outcome?.success) return;

  await rollDamage({
    actor,
    label: L("DamageLabel", { weapon: facts.name }),
    formula: attack.damage,
    damageType: attack.damageType,
    armorDivisor: attack.armorDivisor,
    weaponTarget: { actorUuid: String(foe.uuid), itemId, name: facts.name },
  });
}

/**
 * Applies a blow to a weapon (p. 483): its DR comes off, the rest is
 * injury by the wounding modifiers of an Unliving, Homogenous or Diffuse
 * thing (p. 380), and what it has lost says what state it is in.
 */
export async function applyDamageToWeapon(
  actor: any,
  item: any,
  damage: { basicDamage: number; damageType: DamageType; armorDivisor: number },
): Promise<{ facts: WeaponFacts; penetrating: number; injury: number; broken: { roll: any; text: string } | null } | null> {
  if (!item?.isOwner) return null;
  const before = weaponFacts(item);
  const divisor = damage.armorDivisor > 0 ? damage.armorDivisor : 1;
  const effectiveDr = divisor >= 1 ? Math.floor(before.dr / divisor) : Math.round(before.dr / divisor);
  const penetrating = Math.max(0, damage.basicDamage - effectiveDr);
  // A machine or a solid thing by default; a module may say otherwise.
  const tolerance = { ...noInjuryTolerance(), [before.kind]: true };
  const modifier = toleratedWoundingModifier(damage.damageType, tolerance) ?? 1;
  // "the minimum injury is 1 HP for any attack that penetrates DR at all";
  // a diffuse thing takes no more than a point or two, however hard it is hit.
  const cap = diffuseInjuryCap(damage.damageType, tolerance) ?? Number.POSITIVE_INFINITY;
  const injury = penetrating > 0 ? Math.min(cap, Math.max(1, Math.floor(penetrating * modifier))) : 0;

  if (injury > 0) await item.update({ "system.hpLost": before.hpLost + injury });
  const facts = weaponFacts(item);
  const disabledNow = injury > 0 && before.condition !== "disabled" && before.condition !== "destroyed"
    && (facts.condition === "disabled" || facts.condition === "destroyed");
  const broken = disabledNow && facts.condition === "disabled" ? await rollBrokenWeapon(facts) : null;

  await postCard(actor, {
    label: L("Struck", { name: facts.name }),
    facts,
    struck: { basicDamage: damage.basicDamage, effectiveDr, penetrating, modifier, injury },
    broken,
  }, broken ? [broken.roll] : []);

  return { facts, penetrating, injury, broken };
}

/** Mends a weapon: the repair rules (p. 484) are the GM's, this is the bookkeeping. */
export async function repairWeapon(item: any): Promise<void> {
  if (!item?.isOwner) return;
  await item.update({ "system.hpLost": 0 });
}
