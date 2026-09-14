/**
 * What the spell parser exports for the tests.
 *
 * The parser is plain JavaScript run by node, so it carries no types of its
 * own. The tests import its text readers -- cost, time, duration, class and
 * the prerequisite grammar -- because a wrong reading there is a wrong number
 * on every sheet that drags the spell in.
 */

export interface ParsedEnergy {
  cast: number | null;
  castMax: number | null;
  maintain: number | null;
  text: string;
}

export interface ParsedSpan {
  seconds: number | null;
  text: string;
}

export interface ParsedClass {
  classes: string[];
  resistedBy: string;
}

/** What the prerequisite reader asks about the rest of the file. */
export interface NeedsLookup {
  isSpell: (name: string) => boolean;
  isSkill: (name: string) => boolean;
  isTrait: (name: string) => boolean;
  isCollege: (name: string) => boolean;
}

export declare function parseEnergy(raw: string | undefined): ParsedEnergy;
export declare function parseTime(raw: string | undefined): ParsedSpan;
export declare function parseDuration(raw: string | undefined): ParsedSpan;
export declare function parseClass(raw: string | undefined): ParsedClass;
export declare function parseSkillUsed(raw: string | undefined): string;
export declare function parseNeeds(raw: string | undefined, lookup: NeedsLookup): string;
export declare function reference(page: string | undefined, prefix: string, book: string): string;
export declare function spellName(raw: string): string;
export declare function existingIds(dir: string): Map<string, string>;
export declare function parseSpells(
  recs: unknown[],
  options: {
    reject: (what: string, why: string) => void;
    ids: Map<string, string>;
    prefix: string;
    book: string;
  },
): unknown[];
