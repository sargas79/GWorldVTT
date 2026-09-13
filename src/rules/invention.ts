/**
 * Computers, and inventing things (GURPS Basic Set: Campaigns pp. 472-474).
 *
 * Two rules that only look unrelated. A computer's Complexity is what decides
 * which programs it can run, and a program is one of the things an inventor
 * can set out to write -- at which point the same number becomes the penalty
 * on his Concept roll.
 */

import type { DiceAdds } from "./types.js";

// ── computers (p. 472) ──────────────────────────────────────────────────────

/** "The programmable digital computer first appears at TL7." */
export const COMPUTER_TL = 7;

/**
 * Whether a program will run on a machine at all (p. 472).
 *
 * "Each piece of software has a Complexity rating, too, and can only run on a
 * computer of that Complexity level or higher."
 */
export function willRun(options: { computer: number; program: number }): boolean {
  return options.program <= options.computer;
}

/**
 * How many programs of a given Complexity a computer runs at once (p. 472).
 *
 * "It can run two programs of its own Complexity, 20 programs of one
 * Complexity level less, 200 programs of two Complexity levels less, and so
 * on."
 *
 * Which is two, times ten for every level the program is below the machine.
 * Nothing above the machine's own level runs at all.
 */
export function programsAtOnce(options: { computer: number; program: number }): number {
  if (!willRun(options)) return 0;
  const levelsBelow = options.computer - options.program;
  return 2 * 10 ** levelsBelow;
}

/**
 * Whether a set of programs fits on a machine at once (p. 472).
 *
 * The book's own worked example: "a Complexity 2 computer could run two
 * Complexity 2 programs or 20 Complexity 1 programs - or one Complexity 2
 * program and 10 Complexity 1 programs." So the capacity is shared, and what
 * each program takes is a share of it.
 */
export function fitsAtOnce(options: {
  computer: number;
  /** The Complexity of each program being asked for. */
  programs: readonly number[];
}): boolean {
  let used = 0;
  for (const program of options.programs) {
    if (!willRun({ computer: options.computer, program })) return false;
    // One program of the machine's own level is half its capacity; one of a
    // level below is a twentieth, and so on.
    used += 1 / programsAtOnce({ computer: options.computer, program });
  }
  // Floating point: twenty twentieths should not come to more than one.
  return used <= 1 + 1e-9;
}

// ── inventing (pp. 473-474) ─────────────────────────────────────────────────

/** How hard an invention is, by the book's four grades. */
export const INVENTION_GRADES = ["simple", "average", "complex", "amazing"] as const;
export type InventionGrade = (typeof INVENTION_GRADES)[number];

/** One row of the complexity table (p. 473). */
export interface GradeRow {
  /** "Required Skill Level" to come up with it at all. */
  skill: number;
  /** The retail price the grade runs up to, or null for the top band. */
  retailUpTo: number | null;
  /** The penalty on the Concept roll. */
  concept: number;
  /** Days or months a Prototype roll takes, as dice. */
  prototypeTime: { dice: DiceAdds; unit: "days" | "months" };
  /** What the facilities cost. */
  facilities: number;
}

const GRADES: Readonly<Record<InventionGrade, GradeRow>> = {
  simple: {
    skill: 14,
    retailUpTo: 100,
    concept: -6,
    prototypeTime: { dice: { dice: 1, adds: -2 }, unit: "days" },
    facilities: 50000,
  },
  average: {
    skill: 15,
    retailUpTo: 10000,
    concept: -10,
    prototypeTime: { dice: { dice: 2, adds: 0 }, unit: "days" },
    facilities: 100000,
  },
  complex: {
    skill: 18,
    retailUpTo: 1000000,
    concept: -14,
    prototypeTime: { dice: { dice: 1, adds: 0 }, unit: "months" },
    facilities: 250000,
  },
  amazing: {
    skill: 21,
    retailUpTo: null,
    concept: -22,
    prototypeTime: { dice: { dice: 3, adds: 0 }, unit: "months" },
    facilities: 500000,
  },
};

export function gradeRow(grade: InventionGrade): GradeRow {
  return GRADES[grade];
}

/**
 * Which grade a retail price falls in (p. 473).
 *
 * "Up to $100... up to $10,000... up to $1,000,000... over $1,000,000."
 */
export function gradeForPrice(retail: number): InventionGrade {
  if (retail <= 100) return "simple";
  if (retail <= 10000) return "average";
  if (retail <= 1000000) return "complex";
  return "amazing";
}

/**
 * Which grade a computer program's Complexity falls in (p. 473).
 *
 * "If a cost or time calculation requires one of the four ratings above, treat
 * Complexity 1-3 as Simple, 4-5 as Average" -- and the pattern the sentence is
 * cut off mid-way through continues with the two that are left.
 */
export function gradeForComplexity(complexity: number): InventionGrade {
  if (complexity <= 3) return "simple";
  if (complexity <= 5) return "average";
  if (complexity <= 7) return "complex";
  return "amazing";
}

/**
 * How much easier a thing gets for being old news (p. 473).
 *
 * "Reduce complexity by one step per TL by which the inventor's TL exceeds
 * that of the invention, to a minimum of Simple."
 */
export function reinventing(options: {
  grade: InventionGrade;
  inventorTl: number;
  inventionTl: number;
}): InventionGrade {
  const steps = Math.max(0, Math.floor(options.inventorTl - options.inventionTl));
  const at = INVENTION_GRADES.indexOf(options.grade);
  return INVENTION_GRADES[Math.max(0, at - steps)]!;
}

/**
 * The modifier on the Concept roll (p. 473).
 *
 * The grade's own penalty, and then the circumstances: "+5 if you have a
 * working model you're trying to copy, or +2 if the device already exists but
 * you don't have a model; +1 to +5 if the item is a variant on an existing
 * one; -5 if the basic technology is totally new to the campaign; -5 if the
 * device is one TL above the inventor's TL."
 *
 * A computer program is the exception: "apply a penalty equal to twice the
 * Complexity rating instead."
 */
export function conceptModifier(options: {
  grade: InventionGrade;
  /** For software, the Complexity rating, which replaces the grade's penalty. */
  complexity?: number | null;
  /** True with a working model to copy, worth +5. */
  workingModel?: boolean;
  /** True where it exists but they have no model, worth +2. */
  knownToExist?: boolean;
  /** A variant on something that exists, +1 to +5. */
  variant?: number;
  /** True where the basic technology is new to the campaign. */
  newTechnology?: boolean;
  /** True where the device is a tech level ahead of the inventor. */
  aheadOfItsTime?: boolean;
  /** "+1 or +2" for a clear or clever description, which is the GM's. */
  wellDescribed?: number;
}): number {
  const base =
    options.complexity !== undefined && options.complexity !== null
      ? -2 * Math.max(0, options.complexity)
      : GRADES[options.grade].concept;

  return (
    base +
    (options.workingModel ? 5 : options.knownToExist ? 2 : 0) +
    Math.min(5, Math.max(0, options.variant ?? 0)) +
    (options.newTechnology ? -5 : 0) +
    (options.aheadOfItsTime ? -5 : 0) +
    Math.min(2, Math.max(0, options.wellDescribed ?? 0))
  );
}

/** "+1 per assistant with skill 20+... to a maximum of +4." */
export function assistantBonus(assistants: number): number {
  return Math.min(4, Math.max(0, Math.floor(assistants)));
}

/**
 * The modifier on the Prototype roll (p. 474).
 *
 * Everything the Concept roll took, plus the helpers and the workshop: "-1 to
 * -10 (GM's discretion) if the inventor must make do with anything less than
 * the most advanced tools and facilities for his TL."
 */
export function prototypeModifier(options: {
  concept: number;
  assistants?: number;
  /** How much worse the tools are than the best of the age, 0 to 10. */
  poorTools?: number;
}): number {
  return (
    options.concept +
    assistantBonus(options.assistants ?? 0) -
    Math.min(10, Math.max(0, options.poorTools ?? 0))
  );
}

/** What a prototype attempt costs in facilities (p. 474). */
export function facilitiesCost(options: {
  grade: InventionGrade;
  /** True where the invention is one TL above the inventor's. */
  aheadOfItsTime?: boolean;
  /** True where a related project of equal or higher grade left its workshop. */
  reusingFacilities?: boolean;
}): number {
  let cost = GRADES[options.grade].facilities;
  // "Triple these costs if the invention is one TL above the inventor's TL."
  if (options.aheadOfItsTime) cost *= 3;
  // "Divide costs by 10 if the inventor has appropriate facilities left over."
  if (options.reusingFacilities) cost /= 10;
  return Math.round(cost);
}

/** How long a prototype attempt takes, and in what (p. 474). */
export function prototypeTime(options: {
  grade: InventionGrade;
  /** "Divide time required by the number of skilled people working." */
  people?: number;
}): { dice: DiceAdds; unit: "days" | "months"; dividedBy: number } {
  const row = GRADES[options.grade].prototypeTime;
  return {
    dice: row.dice,
    unit: row.unit,
    dividedBy: Math.max(1, Math.floor(options.people ?? 1)),
  };
}

/** "Minimum time is always one day." */
export const MINIMUM_INVENTION_DAYS = 1;

/** What came out of the workshop (p. 474). */
export interface Prototype {
  /** Major bugs, "catastrophic to the function of the device". */
  major: DiceAdds | null;
  /** Minor bugs, "annoying, but not critical". */
  minor: DiceAdds | null;
  /** True where it came out clean. */
  flawless: boolean;
}

/**
 * How buggy the prototype is (p. 474).
 *
 * "Critical success on the Prototype roll means there are no bugs; success by
 * three or more gives 1d/2 minor bugs; and any other success gives 1d/2 major
 * bugs and 1d minor bugs."
 */
export function prototypeBugs(roll: {
  success: boolean;
  margin: number;
  criticalSuccess: boolean;
}): Prototype | null {
  if (!roll.success) return null;
  if (roll.criticalSuccess) return { major: null, minor: null, flawless: true };
  if (roll.margin >= 3) {
    return { major: null, minor: { dice: 1, adds: 0 }, flawless: false };
  }
  return { major: { dice: 1, adds: 0 }, minor: { dice: 1, adds: 0 }, flawless: false };
}

/** "1d/2" bugs: a die, halved. */
export function halveDice(rolled: number): number {
  return Math.floor(Math.max(0, rolled) / 2);
}

/** "This inflicts at least 2d damage to the inventor and each assistant." */
export const WORKSHOP_EXPLOSION: DiceAdds = { dice: 2, adds: 0 };
