/**
 * Surgery, medical care and bringing somebody back (GURPS Basic Set:
 * Campaigns pp. 424-425).
 *
 * The system already had bandaging, treating shock and natural recovery. What
 * it had nothing for was the three that need a physician: an operation, a
 * doctor's rounds, and the minute somebody spends on a drowned man's chest.
 */

/** "Basic equipment gives -6 at TL1, -5 at TL2-3, -4 at TL4, -2 at TL5, and +(TL-6) at TL6+." */
export function surgeryEquipment(techLevel: number): number {
  const tl = Math.max(0, Math.floor(techLevel));
  if (tl >= 6) return tl - 6;
  if (tl === 5) return -2;
  if (tl === 4) return -4;
  if (tl >= 2) return -5;
  return -6;
}

/** "the invention of anesthesia (mid-TL5)". Below that there is none to lack. */
export const ANESTHESIA_TL = 5;

/** "Before TL5... antiseptic practice is poor. Check for infection after any surgery." */
export const ANTISEPTIC_TL = 5;

/**
 * The whole modifier on a surgery roll (p. 424).
 *
 * "The modifiers for TL5+ surgery assume that anesthetic is available. If it
 * isn't, apply a -2 penalty to skill. This is instead of the usual -1 for a
 * missing item."
 *
 * The quality of the kit is the equipment-modifier rule's business (p. 345)
 * and is taken as a figure rather than worked out again here.
 */
export function surgeryModifier(options: {
  techLevel: number;
  /** What the tools are worth over basic, from the equipment modifiers. */
  equipmentQuality?: number;
  /** True where anaesthetic is to hand. Assumed where the tech level has it. */
  anesthetic?: boolean;
  /** A repair of a crippling injury, which is "-3 or worse to skill". */
  repairingCrippled?: boolean;
}): number {
  const tl = Math.max(0, Math.floor(options.techLevel));
  const anesthetic = options.anesthetic ?? tl >= ANESTHESIA_TL;
  return (
    surgeryEquipment(tl) +
    (options.equipmentQuality ?? 0) +
    (tl >= ANESTHESIA_TL && !anesthetic ? -2 : 0) +
    (options.repairingCrippled ? -3 : 0)
  );
}

/** Whether an operation at this tech level risks infection afterwards (p. 424). */
export function risksInfection(techLevel: number): boolean {
  return techLevel < ANTISEPTIC_TL;
}

/** "the patient needs 1d months to recover before another attempt is possible." */
export const FAILED_REPAIR_MONTHS_DICE = 1;

// ── medical care (p. 424) ───────────────────────────────────────────────────

/** "Anyone under the care of a competent physician (Physician skill 12+)." */
export const COMPETENT_PHYSICIAN = 12;

/** "gets +1 on all rolls for natural recovery." */
export const CARED_FOR_BONUS = 1;

/** "a single physician can care for up to 200 patients." */
export const PATIENTS_PER_PHYSICIAN = 200;

/** Whether a physician is good enough to help somebody heal (p. 424). */
export function competentCare(physicianSkill: number | null): boolean {
  return (physicianSkill ?? 0) >= COMPETENT_PHYSICIAN;
}

/** What being looked after is worth to a roll for natural recovery (p. 424). */
export function careBonus(physicianSkill: number | null): number {
  return competentCare(physicianSkill) ? CARED_FOR_BONUS : 0;
}

/** What a physician's roll to cure did (p. 424). */
export type CureResult = "worsened" | "nothing" | "healed" | "healedWell";

/**
 * The physician's roll (p. 424).
 *
 * "On a success, the patient recovers 1 HP; on a critical success, he recovers
 * 2 HP. This is in addition to natural healing. However, a critical failure
 * costs the patient 1 HP!"
 *
 * "Only one physician may roll per patient", which is the caller's to honour.
 */
export function cureResult(roll: {
  success: boolean;
  criticalSuccess: boolean;
  criticalFailure: boolean;
}): CureResult {
  if (roll.criticalSuccess) return "healedWell";
  if (roll.criticalFailure) return "worsened";
  return roll.success ? "healed" : "nothing";
}

/** The hit points a physician's roll moved, up or down (p. 424). */
export function cureHitPoints(result: CureResult): number {
  if (result === "healedWell") return 2;
  if (result === "healed") return 1;
  return result === "worsened" ? -1 : 0;
}

// ── resuscitation (p. 425) ──────────────────────────────────────────────────

/** "Each attempt takes one minute." */
export const RESUSCITATION_MINUTES = 1;

/** "Make a successful Physician/TL7+ roll - or a First Aid/TL7+ roll at -4." */
export const RESUSCITATION_FIRST_AID_PENALTY = -4;

/**
 * "First Aid rolls (but not default rolls) to revive victims of drowning or
 * asphyxiation are at -2 instead of -4" where CPR is known.
 */
export const CPR_FIRST_AID_PENALTY = -2;

/** "Cardiopulmonary resuscitation... widely taught after 1960." */
export const CPR_KNOWN_FROM = 1960;

/** Why somebody needs reviving, which decides whether CPR helps. */
export type ResuscitationCause = "drowning" | "asphyxiation" | "heartAttack";

/**
 * The modifier on a roll to bring somebody back (p. 425).
 *
 * A Physician rolls at no penalty. First Aid is -4, or -2 for drowning and
 * asphyxiation where CPR is known -- but "not default rolls", so somebody who
 * never learned First Aid gets no help from the improvement.
 */
export function resuscitationModifier(options: {
  skill: "physician" | "firstAid";
  cause: ResuscitationCause;
  /** True where CPR is taught, which is to say from 1960. */
  cpr?: boolean;
  /** True when the First Aid roll is a default rather than a learned skill. */
  byDefault?: boolean;
}): number {
  if (options.skill === "physician") return 0;

  const helpedByCpr =
    options.cpr === true &&
    !options.byDefault &&
    (options.cause === "drowning" || options.cause === "asphyxiation");

  return helpedByCpr ? CPR_FIRST_AID_PENALTY : RESUSCITATION_FIRST_AID_PENALTY;
}

/**
 * Whether the tech level has the skill at all (p. 425).
 *
 * The book asks for "Physician/TL7+" and "First Aid/TL7+", which is a
 * requirement on the skill rather than on the world: reviving the drowned is
 * a modern art.
 */
export const RESUSCITATION_TL = 7;

export function canResuscitate(skillTechLevel: number): boolean {
  return skillTechLevel >= RESUSCITATION_TL;
}
