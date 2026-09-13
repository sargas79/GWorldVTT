/**
 * What the GCA parser shares with the tests.
 *
 * The parser itself is plain JavaScript, run by node rather than compiled, so it
 * carries no types of its own. This declares only what the tests import: the
 * mapping of which damage a split DR applies to, which must match
 * SPLIT_AGAINST in `src/rules/armor.ts`, and the two readers that decide which
 * book a record is filed under.
 */
import type { DamageType } from "../src/rules/types.js";

export declare const SPLIT_AGAINST: {
  lowTech: readonly DamageType[];
  highTech: readonly DamageType[];
};

/**
 * The readers the equipment pack test imports: what the parser makes of the
 * ST column, the damage column, an armour or shield DR, a Legality Class and
 * a record with alternative readings of one column.
 */
export interface ParsedMinSt {
  minSt: number | null;
  twoHanded: boolean;
  unreadyAfterAttack: boolean;
  mount: "" | "rest" | "bipod" | "mounted";
}

export interface ParsedDamage {
  fields: Record<string, unknown> & {
    damageBase: "thr" | "sw" | "fixed";
    damageModifier: number;
    damageFormula: string;
    damageType: string;
    damageExtraDice: number;
    damageSpecial: boolean;
    surge: boolean;
    affliction: boolean;
    afflictionAttribute: string;
    afflictionModifier: number;
  };
  usesWeaponSt: boolean;
}

export interface ParsedDr {
  dr: number;
  drSplit: number | null;
  drSplitAppliesTo: readonly DamageType[];
  flags: string;
  sole?: number;
  lowTech?: boolean;
}

export declare function parseMinSt(value: string | undefined): ParsedMinSt;
export declare function parseDamage(damage: string | undefined, damtype: string | undefined): ParsedDamage | null;
export declare function parseDr(value: string | undefined): ParsedDr | null;
export declare function parseShieldStats(dr: string | undefined, hp: string | undefined): { dr: number; hp: number | null };
export declare function legalityClass(value: string | undefined): number | null;
export declare function alternatives(
  name: string,
  f: Map<string, string>,
): Array<{ name: string; f: Map<string, string> }>;
export declare function weaponClassOf(mods: string | undefined): "" | "sword" | "cutting" | "crushing" | "firearm" | "bow";
export declare function fullLoad(shots: string | undefined): number;
export declare function costOfLivingPercent(text: string | undefined): number;
export declare function displayWeight(text: string | undefined): number;
/** The page reference for one book: "Martial Arts p. 52". */
export declare function reference(page: string | undefined, prefix: string, book: string): string;

/** Where a record belongs, for the pack being built. */
export declare function classifyCitation(
  page: string | undefined,
  prefix: string,
  base?: string,
): "own" | "overlap" | "elsewhere";
