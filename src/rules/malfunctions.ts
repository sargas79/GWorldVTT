/**
 * When the gun does not go off (GURPS Basic Set: Campaigns p. 407).
 *
 * A weapon malfunctions on an attack roll at or above its Malf. number, and
 * what happened is a second roll on a table. The three outcomes differ in how
 * long they take to put right rather than in what they cost immediately, which
 * is why this module is mostly about Ready maneuvers.
 */

/** What went wrong (p. 407). */
export type Malfunction =
  /** The weapon fails to fire, and fixing it is an hour of Armoury work. */
  | "mechanical"
  /** The weapon fails to fire; three Ready maneuvers and a good roll clear it. */
  | "misfire"
  /** It fires once and then jams. */
  | "stoppage"
  /** A mechanical problem on a low-tech weapon, which may blow up. */
  | "explosion";

/** One row of the Firearm Malfunction Table (p. 407). */
export interface MalfunctionEntry {
  /** Inclusive range of the 3d roll. */
  min: number;
  max: number;
  kind: Malfunction;
}

/**
 * The Firearm Malfunction Table (p. 407).
 *
 * "3-4 mechanical or electrical problem; 5-8 misfire; 9-11 stoppage; 12-14
 * misfire; 15-18 mechanical or electrical problem, and possible explosion."
 * Misfire appears twice, on either side of stoppage, which is the table's own
 * shape and not a mistake here.
 */
export const MALFUNCTION_TABLE: readonly MalfunctionEntry[] = [
  { min: 3, max: 4, kind: "mechanical" },
  { min: 5, max: 8, kind: "misfire" },
  { min: 9, max: 11, kind: "stoppage" },
  { min: 12, max: 14, kind: "misfire" },
  { min: 15, max: 18, kind: "explosion" },
];

/** What a 3d roll on the malfunction table came to (p. 407). */
export function malfunctionFor(roll: number): Malfunction {
  const clamped = Math.min(18, Math.max(3, Math.round(roll)));
  const entry = MALFUNCTION_TABLE.find((row) => clamped >= row.min && clamped <= row.max);
  return entry?.kind ?? "mechanical";
}

/**
 * Whether an attack roll malfunctioned the weapon (p. 407).
 *
 * "Malf." is the number at or above which the weapon fails; most modern
 * firearms are Malf. 17, and a weapon with no Malf. never jams.
 */
export function malfunctioned(options: { roll: number; malfunctionNumber?: number }): boolean {
  const malf = options.malfunctionNumber;
  if (!malf) return false;
  return options.roll >= malf;
}

/** What putting one right takes. */
export interface Repair {
  /** Ready maneuvers each attempt costs; zero where it is an hour's work. */
  readyManeuvers: number;
  /** Hours each attempt takes, for the repairs measured in hours. */
  hours: number;
  /** Modifier to the Armoury roll. */
  armouryModifier: number;
  /** Modifier to the IQ-based weapon skill roll, where one is allowed. */
  weaponSkillModifier: number;
  /** True where both hands must be free to try. */
  needsBothHands: boolean;
  /** What a critical failure on the repair costs. */
  criticalFailure: "destroyed" | "mechanical";
}

/**
 * What it takes to clear each kind of malfunction (p. 407).
 *
 * A mechanical problem is the bad one: "each repair attempt takes one hour, and
 * any critical failure destroys the weapon." The other two are measured in
 * Ready maneuvers and only degrade into a mechanical problem when botched.
 */
export const REPAIRS: Readonly<Record<Malfunction, Repair>> = {
  mechanical: {
    readyManeuvers: 0,
    hours: 1,
    armouryModifier: 0,
    weaponSkillModifier: 0,
    needsBothHands: true,
    criticalFailure: "destroyed",
  },
  explosion: {
    readyManeuvers: 0,
    hours: 1,
    armouryModifier: 0,
    weaponSkillModifier: 0,
    needsBothHands: true,
    criticalFailure: "destroyed",
  },
  misfire: {
    readyManeuvers: 3,
    hours: 0,
    armouryModifier: 2,
    weaponSkillModifier: 0,
    needsBothHands: true,
    criticalFailure: "mechanical",
  },
  stoppage: {
    readyManeuvers: 3,
    hours: 0,
    armouryModifier: 0,
    weaponSkillModifier: -4,
    needsBothHands: true,
    criticalFailure: "mechanical",
  },
};

/**
 * Whether the weapon blows up in the gunner's face (p. 407).
 *
 * "Any TL3 firearm or TL4 grenade, breechloader, or repeating firearm may blow
 * up... TL5+ weapons do not explode -- treat as a mechanical or electrical
 * problem."
 */
export function mayExplode(techLevel: number): boolean {
  return techLevel <= 4;
}

/** What a weapon that blows up does to whoever was holding it (p. 407). */
export const EXPLOSION_DAMAGE = { dice: 1, adds: 2, type: "cr ex", fragmentation: 2 } as const;

/**
 * Whether a revolver simply carries on after a misfire (p. 407).
 *
 * "If the weapon is a revolver, the next shot will fire normally." The one case
 * where a malfunction costs nothing but the shot.
 */
export function clearsItself(kind: Malfunction, revolver: boolean): boolean {
  return kind === "misfire" && revolver;
}
