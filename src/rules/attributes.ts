/**
 * Basic attributes and secondary characteristics (GURPS Lite pp. 4-6).
 */

import type { Attribute, Attributes } from "./types.js";

/** Character point cost per level for each attribute (GURPS Lite p. 4). */
export const ATTRIBUTE_COST_PER_LEVEL: Record<Attribute, number> = {
  ST: 10,
  HT: 10,
  DX: 20,
  IQ: 20,
};

/** The human-average score every attribute starts at, free of charge. */
export const ATTRIBUTE_BASELINE = 10;

/**
 * Character points spent on one attribute. Scores below 10 have a negative cost,
 * refunding points (GURPS Lite p. 4).
 */
export function attributePointCost(attribute: Attribute, score: number): number {
  return (score - ATTRIBUTE_BASELINE) * ATTRIBUTE_COST_PER_LEVEL[attribute];
}

/** Total character points spent across all four basic attributes. */
export function attributesPointCost(attributes: Attributes): number {
  return (
    attributePointCost("ST", attributes.ST) +
    attributePointCost("DX", attributes.DX) +
    attributePointCost("IQ", attributes.IQ) +
    attributePointCost("HT", attributes.HT)
  );
}

/**
 * Basic Lift: the most you can lift overhead with one hand in one second,
 * in pounds. `(ST*ST)/5`, rounded to the nearest whole number once it reaches
 * 10 lbs. or more (GURPS Lite p. 5).
 */
export function basicLift(st: number): number {
  const raw = (st * st) / 5;
  return raw >= 10 ? Math.round(raw) : raw;
}

/**
 * Basic Speed: `(HT + DX) / 4`, deliberately *not* rounded — GURPS Lite p. 6
 * notes that 5.25 is better than 5.
 */
export function basicSpeed(dx: number, ht: number): number {
  return (dx + ht) / 4;
}

/** Basic Move: Basic Speed with all fractions dropped (GURPS Lite p. 6). */
export function basicMove(speed: number): number {
  return Math.floor(speed);
}

/**
 * Secondary characteristics derived from the four basic attributes.
 *
 * GURPS Lite ties each of these directly to an attribute and offers no way to
 * buy them separately, but every value accepts an optional bonus so racial
 * templates and GM adjustments can shift them without a schema change.
 */
export interface SecondaryBonuses {
  hp?: number;
  will?: number;
  per?: number;
  fp?: number;
  basicSpeed?: number;
  basicMove?: number;
}

export interface SecondaryCharacteristics {
  hp: number;
  will: number;
  per: number;
  fp: number;
  basicLift: number;
  basicSpeed: number;
  basicMove: number;
}

/** Computes every secondary characteristic from the basic attributes. */
export function secondaryCharacteristics(
  attributes: Attributes,
  bonuses: SecondaryBonuses = {},
): SecondaryCharacteristics {
  const speed = basicSpeed(attributes.DX, attributes.HT) + (bonuses.basicSpeed ?? 0);
  return {
    hp: attributes.ST + (bonuses.hp ?? 0),
    will: attributes.IQ + (bonuses.will ?? 0),
    per: attributes.IQ + (bonuses.per ?? 0),
    fp: attributes.HT + (bonuses.fp ?? 0),
    basicLift: basicLift(attributes.ST),
    basicSpeed: speed,
    basicMove: Math.max(0, basicMove(speed) + (bonuses.basicMove ?? 0)),
  };
}
