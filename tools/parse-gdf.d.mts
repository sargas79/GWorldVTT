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
/** What a trait is, once its cost has been read: the sign has the last word. */
export declare function traitCategoryOf(
  section: string,
  cost: { points: number; pointsPerLevel: number; costTable: number[] },
): "advantage" | "perk" | "disadvantage" | "quirk" | undefined;
/** The tech level a record is written at, superscience carets kept (Campaigns p. 513). */
export declare function techLevel(value: string | undefined): string;
export declare function fullLoad(shots: string | undefined): number;
export declare function costOfLivingPercent(text: string | undefined): number;
export declare function displayWeight(text: string | undefined): number;
/** The page reference for one book: "My Book p. 52". */
export declare function reference(page: string | undefined, prefix: string, book: string): string;

/** A page prefix as the book prints it, without GCA's colon: "MH1:" is "MH1". */
export declare function bookPrefix(prefix: string): string;

/** Throws, naming the citation forms the file uses, when no record cites this prefix. */
export declare function assertCitesBook(recs: ReadonlyArray<{ section: string; text: string }>, prefix: string): void;

/** The name a record is filed under, given the other names in its section. */
export declare function entryName(
  raw: string,
  siblings: ReadonlySet<string>,
  options?: { supplement?: boolean; blankSpecialty?: boolean },
): string;

/** Whether a record is GCA's own bookkeeping (a Basic Set record with a leading underscore). */
export declare function isBookkeeping(raw: string, options?: { supplement?: boolean }): boolean;

/** The names a book keeps by hand in its advantages and disadvantages packs, beside the parser's own files. */
export declare function handKeptTraitNames(outDir: string, basic: boolean, book: string): Set<string>;

/** The skill a weapon mode is used with, from GCA's skillused list, or "" for none. */
export declare function parseSkillUsed(value: string | undefined): string;
/** The skill, and a to-hit modifier every entry of the list shares (0 for none). */
export declare function parseSkillUsedWithModifier(value: string | undefined): { skill: string; modifier: number };

/** The unarmed skills (Brawling, Boxing, Karate) a skillused list names outright, in order. */
export declare function unarmedSkillsIn(value: string | undefined): string[];

/** The skill a technique defaults from and its penalty, from GCA's default(), bare or quoted; null when not a skill. */
export declare function techniqueDefault(
  raw: string | undefined,
): { prerequisite: string; modifier: number } | null;

/** The skills a Talent record gives its level to, from the file's group of its name. */
export declare function talentSkillsOf(
  name: string,
  f: Map<string, string>,
  groups: ReadonlyMap<string, readonly string[]>,
): string[];

/** The power a record belongs to by its category, and whether it is the power's Talent. */
export declare function powerOfRecord(
  f: Map<string, string>,
  pattern: RegExp | null,
): { power: string; powerTalent: boolean };

/** The attack an advantage is, as a ranged mode, or a note saying why there is none. */
export declare function traitAttackModes(f: Map<string, string>): {
  rangedModes: Array<Record<string, unknown>>;
  meleeModes: Array<Record<string, unknown>>;
  note?: string;
};

/** The file's `[GROUPS]`, by group name. */
export declare function groupsOf(text: string): Map<string, string[]>;

/** The base item a "(Good)" or "(Fine)" record restates, or null. */
export declare function qualityVariantOf(name: string, siblings: ReadonlySet<string>): string | null;

/** Where a record belongs, for the pack being built. */
export declare function classifyCitation(
  page: string | undefined,
  prefix: string,
  base?: string,
): "own" | "overlap" | "elsewhere";

/** Every default a technique lists: a skill's level, its Parry or Block, Dodge, or an attribute; null when one is unreadable. */
export declare function techniqueDefaults(
  raw: string | undefined,
): Array<{ from: string; skill: string; modifier: number }> | null;

/** The attribute terms a skill's default adds to rebase the technique ("+ST-DX"), or "" for none. */
export declare function techniqueRebasing(raw: string | undefined): string;
