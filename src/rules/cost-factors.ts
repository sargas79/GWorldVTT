/**
 * Cost factors for equipment modifiers (Basic Set Revised p. 342).
 *
 * Every modifier that changes what an item costs is a cost factor (CF): "x N
 * cost" is N-1, "+N00%" is N. The final cost is the list price times (1 + the
 * total CF), and the total never falls below -0.8. Weight effects multiply
 * together; stat adjustments add. So a bejeweled (+19) fine (+3) sword is +22
 * total and costs x23, not x20 times x4.
 *
 * The Basic Set's own grade and material prices map exactly onto CFs, so they
 * stay where they are (weapon-quality.ts) and are read here as "multiple - 1".
 */

import {
  gradeAfterMaterial,
  qualityCostFactor,
  shieldComposition,
  silverCostFactor,
  type ShieldComposition,
  type WeaponClass,
  type WeaponMaterial,
  type WeaponQuality,
} from "./weapon-quality.js";
import type { EquipmentQuality } from "./wealth.js";

/** Total CF cannot fall below this, "no matter how bad an item is" (p. 342). */
export const COST_FACTOR_FLOOR = -0.8;

/** The CF of an effect worded "x N cost": N - 1 (x4 is +3, x0.4 is -0.6). */
export function cfFromMultiple(multiple: number): number {
  return round(multiple - 1);
}

/** The CF of "cost becomes N% of list price": N/100 - 1 (400% is +3, 40% is -0.6). */
export function cfFromPercentOfList(percent: number): number {
  return round(percent / 100 - 1);
}

/** The CF of "+N% to price": N/100 (+300% is +3; a reduction of 60% is -0.6 as a negative). */
export function cfFromPercentAdded(percent: number): number {
  return round(percent / 100);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The total of several CFs, held to the floor. */
export function totalCostFactor(factors: readonly number[]): number {
  return Math.max(COST_FACTOR_FLOOR, round(factors.reduce((sum, cf) => sum + cf, 0)));
}

/** Price from a list price and a set of CFs: list x (1 + total CF). */
export function priceFromCostFactors(list: number, factors: readonly number[]): number {
  return Math.round((Number(list) || 0) * (1 + totalCostFactor(factors)) * 100) / 100;
}

/** The generic modifiers of p. 342 and their CFs. */
export const MODIFIER_CF = Object.freeze({
  /** +1 to skill (or +1 Acc with a muscle-powered missile weapon). */
  balanced: 4,
  /** Weight x2/3; anything but armor or weapons. */
  cuttingEdge: 1,
  disguised: 4,
  /** Fine armor or shield: weight x3/4. */
  fineArmorOrShield: 9,
  /** Fine-quality equipment: +19 CF (p. 345 grade). */
  fineEquipment: 19,
  goodEquipment: 4,
  /** Rugged: +2 HT, DR x2, weight x1.2; anything but armor or weapons. */
  rugged: 1,
  /** Silver-coated ("mirrored") shield. */
  silverMirroredShield: 6,
} as const);

/** Presentation: +1, +2 or +3 to reactions for +1, +4 or +9 CF (p. 342). */
export const PRESENTATION_CF: Readonly<Record<number, number>> = Object.freeze({ 0: 0, 1: 1, 2: 4, 3: 9 });

/** The CF of a Presentation level (0 to 3), 0 for anything else. */
export function presentationCostFactor(level: number): number {
  return PRESENTATION_CF[Math.max(0, Math.min(3, Math.trunc(Number(level) || 0)))] ?? 0;
}

/** The weight factors of p. 342. */
export const MODIFIER_WEIGHT = Object.freeze({
  cuttingEdge: 2 / 3,
  fineArmorOrShield: 3 / 4,
  rugged: 1.2,
  plastic: 0.5,
});

/** What an item is, for pricing: a weapon (grades), a tool, armor or a shield. */
export type PricedKind = "weapon" | "tool" | "armor" | "shield";

export interface PricedFields {
  kind: PricedKind;
  tl?: number;
  weaponClass?: WeaponClass;
  quality?: WeaponQuality;
  material?: WeaponMaterial;
  composition?: ShieldComposition;
  equipmentQuality?: EquipmentQuality;
  fine?: boolean;
  balanced?: boolean;
  cuttingEdge?: boolean;
  disguised?: boolean;
  presentation?: number;
  rugged?: boolean;
}

export interface CostFactorLine {
  key: string;
  cf: number;
}

export interface Pricing {
  factors: CostFactorLine[];
  /** The total CF after the -0.8 floor. */
  total: number;
  /** Final cost over list cost: 1 + total. */
  costMultiplier: number;
  /** Product of the weight effects. */
  weightFactor: number;
  /** Stat adjustments the modifiers give, for the sheet to show (they add). */
  effects: { skill: number; accuracy: number; ht: number; drFactor: number; reactions: number };
}

/**
 * The pricing of an item from the modifiers it carries. Exclusions of p. 342
 * hold: fine, very fine and silver are mutually exclusive (a silver weapon is
 * priced at good quality), and a tool has one grade.
 */
export function pricingOf(fields: PricedFields): Pricing {
  const lines: CostFactorLine[] = [];
  let weight = 1;
  const effects = { skill: 0, accuracy: 0, ht: 0, drFactor: 1, reactions: 0 };
  const add = (key: string, cf: number) => {
    if (cf !== 0) lines.push({ key, cf });
  };
  const tl = Number(fields.tl) || 3;
  const material = fields.material ?? "";

  if (fields.kind === "weapon") {
    const quality = gradeAfterMaterial(fields.quality ?? "good", material);
    const cls = fields.weaponClass ?? "";
    const grade = qualityCostFactor(cls, quality, tl);
    add(quality, grade ?? 0);
    if (material === "plastic") {
      add("plastic", 1);
      weight *= MODIFIER_WEIGHT.plastic;
    }
    // A surcharge on the good-quality price, so it follows that price where it is not the list (TL7+).
    const good = qualityCostFactor(cls, "good", tl) ?? 0;
    add("silver", round(silverCostFactor(material) * (1 + good)));
    if (fields.balanced) {
      add("balanced", MODIFIER_CF.balanced);
      if (cls === "bow") effects.accuracy += 1;
      else effects.skill += 1;
    }
  }

  if (fields.kind === "shield") {
    const effect = shieldComposition(fields.composition ?? "wood");
    add(fields.composition ?? "wood", effect.costFactor - 1);
    weight *= effect.weightFactor;
    if (fields.fine) {
      add("fine", MODIFIER_CF.fineArmorOrShield);
      weight *= MODIFIER_WEIGHT.fineArmorOrShield;
    }
    if (fields.balanced) {
      add("balanced", MODIFIER_CF.balanced);
      effects.skill += 1;
    }
  }

  if (fields.kind === "armor" && fields.fine) {
    add("fine", MODIFIER_CF.fineArmorOrShield);
    weight *= MODIFIER_WEIGHT.fineArmorOrShield;
  }

  if (fields.kind === "tool") {
    if (fields.equipmentQuality === "good") add("goodEquipment", MODIFIER_CF.goodEquipment);
    if (fields.equipmentQuality === "fine") add("fineEquipment", MODIFIER_CF.fineEquipment);
    if (fields.cuttingEdge) {
      add("cuttingEdge", MODIFIER_CF.cuttingEdge);
      weight *= MODIFIER_WEIGHT.cuttingEdge;
    }
    if (fields.rugged) {
      add("rugged", MODIFIER_CF.rugged);
      weight *= MODIFIER_WEIGHT.rugged;
      effects.ht += 2;
      effects.drFactor *= 2;
    }
  }

  if (fields.disguised) add("disguised", MODIFIER_CF.disguised);
  const presentation = Math.max(0, Math.min(3, Math.trunc(Number(fields.presentation) || 0)));
  if (presentation > 0) {
    add("presentation", presentationCostFactor(presentation));
    effects.reactions += presentation;
  }

  const total = totalCostFactor(lines.map((line) => line.cf));
  return {
    factors: lines,
    total,
    costMultiplier: round(1 + total),
    weightFactor: round(weight * 10000) / 10000,
    effects,
  };
}
