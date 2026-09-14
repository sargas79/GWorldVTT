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
  weaponDr,
  weaponHitPoints,
  weaponObjectKind,
  weaponState,
  type BrokenWeaponKind,
  type WeaponCondition,
} from "../rules/breakage.js";
import {
  breakageQuality,
  outranks,
  weaponClassOf,
  type WeaponClass,
  type WeaponMaterial,
  type WeaponQuality,
} from "../rules/weapon-quality.js";
import { toleratedWoundingModifier, noInjuryTolerance } from "../rules/injury-tolerance.js";
import type { DamageType } from "../rules/types.js";
import { COMBAT_HOOKS, callCombatHook } from "./combat-extensions.js";

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
  dr: number;
  hp: number;
  hpLost: number;
  condition: WeaponCondition;
  brokenKind: BrokenWeaponKind;
  resistsBreakage: boolean;
}

/** Reads the facts off an equipment or shield item. */
export function weaponFacts(item: any): WeaponFacts {
  const sys = item?.system ?? {};
  const melee: any[] = sys.meleeModes ?? [];
  const ranged: any[] = sys.rangedModes ?? [];
  const modes = [...melee, ...ranged];
  const skills = modes.map((m) => String(m.skill ?? ""));
  const types = modes.map((m) => String(m.damageType ?? "")) as DamageType[];
  const quality = (isRuleOn("weaponQuality") ? String(sys.quality ?? "good") : "good") as WeaponQuality;
  const material = String(sys.material ?? "") as WeaponMaterial;
  const weaponClass = (String(sys.weaponClass ?? "") ||
    weaponClassOf({
      skills,
      damageTypes: types,
      hasMalfunction: ranged.some((m) => m.malfunction),
      isFencing: melee.some((m) => m.isFencing),
    })) as WeaponClass;
  const firearm = weaponClass === "firearm";
  const weight = Number(sys.weight ?? 0) || 0;
  const skill = skills[0] ?? "";
  // A shield's DR and HP are the table's own (Characters p. 287); a weapon's
  // come from its weight and what it is made of (Campaigns p. 483).
  const isShield = item?.type === "shield";
  const hp = isShield ? Number(sys.hp ?? 0) || 0 : weaponHitPoints(weight, firearm);
  const dr = isShield ? Number(sys.dr ?? 0) || 0 : weaponDr({ material, skill, firearm });
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
    dr,
    hp,
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
    // Monster Hunters 1's odds replace the grade's, except against a superior swing.
    breakage: parryWeapon.breakage !== undefined && quality === parryWeapon.quality ? parryWeapon.breakage : undefined as number | undefined,
  });
  const chance = heavyParryBreakChance({
    parryingWeight: parryWeapon.weight,
    attackingWeight: attackWeapon.weight,
    quality,
    ...(typeof odds.breakage === "number" && Number.isFinite(odds.breakage) ? { breakage: odds.breakage } : {}),
  });
  if (chance <= 0) return;

  const roll = new Roll("1d6");
  await roll.evaluate();
  const outcome = heavyParryOutcome(chance, roll.total);
  const name = String(item?.name ?? "");

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
  if (item) await breakWeapon(defender, item, "parry");
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
  const target = weaponsInHand(foe).find((w) => w.id === itemId);
  const penalty = target?.penalty ?? -4;

  const outcome = await rollSuccess({
    actor,
    base: attack.skillLevel,
    kind: "attack",
    label: L("StrikeLabel", { weapon: facts.name, foe: String(foe?.name ?? "") }),
    modifiers: [{ label: L("StrikePenalty"), value: penalty }],
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
 * injury by the wounding modifiers of an Unliving or Homogenous thing
 * (p. 380), and what it has lost says what state it is in.
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
  const tolerance = { ...noInjuryTolerance(), [weaponObjectKind(before.firearm)]: true };
  const modifier = toleratedWoundingModifier(damage.damageType, tolerance) ?? 1;
  // "the minimum injury is 1 HP for any attack that penetrates DR at all"
  const injury = penetrating > 0 ? Math.max(1, Math.floor(penetrating * modifier)) : 0;

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
