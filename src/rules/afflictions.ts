/**
 * What an affliction actually does to somebody (GURPS Basic Set: Campaigns
 * pp. 428-429).
 *
 * "An 'affliction' is any harmful effect other than direct injury or fatigue,
 * usually the result of an attack, hazard, illness, magic spell, or toxin."
 * The system could already roll to resist one; what it could not do was say
 * what happened when the roll was failed, so every poison, disease, spell and
 * gas ended at "the GM decides".
 *
 * This is the table they all point at. Three bands: irritating conditions that
 * leave you able to act badly, incapacitating ones that stop you acting at
 * all, and the two that kill.
 */

/** How bad an affliction is, which decides what it stops you doing. */
export type AfflictionSeverity = "irritating" | "incapacitating" | "mortal";

/** The conditions the book names, in the order it names them. */
export const AFFLICTIONS = [
  // Irritating (p. 428)
  "coughing", "drowsy", "drunk", "euphoria", "nauseated",
  "moderatePain", "severePain", "terriblePain", "tipsy",
  // Incapacitating (pp. 428-429)
  "agony", "choking", "daze", "ecstasy", "hallucinating",
  "paralysis", "retching", "seizure", "unconsciousness",
  // Mortal (p. 429)
  "coma", "heartAttack",
] as const;

export type Affliction = (typeof AFFLICTIONS)[number];

/** What a condition costs whoever has it. */
export interface AfflictionEffect {
  severity: AfflictionSeverity;
  /**
   * Penalty to DX and to every DX-based roll, skills included.
   *
   * The book writes these as "-3 to all DX, IQ, skill, and self-control
   * rolls", which is one penalty listed across the kinds of roll it reaches
   * rather than one per kind. A skill is DX- or IQ-based, so it is already
   * covered by the attribute it hangs off; a separate skill figure here would
   * be that penalty applied twice.
   */
  dx: number;
  /**
   * Penalty to IQ and to every IQ-based roll. Perception and Will follow IQ
   * down, as any temporary penalty does (p. 421).
   */
  iq: number;
  /** Penalty to self-control rolls, which the book states separately. */
  selfControl: number;
  /** Penalty to active defenses. */
  defense: number;
  /**
   * True when no voluntary action is possible. "All of these afflictions
   * prevent you from taking voluntary action for the duration."
   */
  helpless: boolean;
  /** True when the victim falls over on taking it. */
  fallsDown: boolean;
  /** Skills this condition forbids outright. */
  forbids: readonly string[];
}

/**
 * "In addition to their other effects, you're effectively stunned (-4 to
 * active defenses)" -- every incapacitating condition, and the mortal ones.
 */
export const INCAPACITATED_DEFENSE = -4;

const NOTHING = {
  dx: 0, iq: 0, selfControl: 0, defense: 0,
  helpless: false, fallsDown: false, forbids: [] as readonly string[],
};

/** An incapacitating condition, which shares most of its effects with the rest. */
function incapacitating(extra: Partial<AfflictionEffect> = {}): AfflictionEffect {
  return {
    ...NOTHING,
    severity: "incapacitating",
    defense: INCAPACITATED_DEFENSE,
    helpless: true,
    ...extra,
  };
}

const EFFECTS: Readonly<Record<Affliction, AfflictionEffect>> = {
  // "You are at -3 to DX and -1 to IQ, and cannot use Stealth."
  coughing: { ...NOTHING, severity: "irritating", dx: -3, iq: -1, forbids: ["Stealth"] },
  // On a successful Will roll: "-2 to DX, IQ, and self-control rolls."
  drowsy: { ...NOTHING, severity: "irritating", dx: -2, iq: -2, selfControl: -2 },
  // "-2 to DX and IQ, and -4 to self-control rolls except those to resist Cowardice."
  drunk: { ...NOTHING, severity: "irritating", dx: -2, iq: -2, selfControl: -4 },
  // "-3 penalty to all DX, IQ, skill, and self-control rolls."
  euphoria: { ...NOTHING, severity: "irritating", dx: -3, iq: -3, selfControl: -3 },
  // "-2 to all attribute and skill rolls, and -1 to active defenses."
  nauseated: { ...NOTHING, severity: "irritating", dx: -2, iq: -2, defense: -1 },
  moderatePain: { ...NOTHING, severity: "irritating", dx: -2, iq: -2, selfControl: -2 },
  severePain: { ...NOTHING, severity: "irritating", dx: -4, iq: -4, selfControl: -4 },
  terriblePain: { ...NOTHING, severity: "irritating", dx: -6, iq: -6, selfControl: -6 },
  // "-1 to DX and IQ, and -2 to self-control rolls except those to resist Cowardice."
  tipsy: { ...NOTHING, severity: "irritating", dx: -1, iq: -1, selfControl: -2 },

  // "If standing or sitting, you fall down." A point of fatigue a minute.
  agony: incapacitating({ fallsDown: true }),
  choking: incapacitating(),
  // "You are conscious - if you are standing, you remain upright."
  daze: incapacitating(),
  ecstasy: incapacitating({ fallsDown: true }),
  // "You can try to act, but you must roll vs. Will before each success roll."
  hallucinating: incapacitating({ helpless: false }),
  // "You cannot move any voluntary muscles, and fall over if you are not in a
  // balanced position."
  paralysis: incapacitating({ fallsDown: true }),
  // "You can try to act, but you will be at -5 to DX, IQ, and Per."
  retching: incapacitating({ helpless: false, dx: -5, iq: -5 }),
  // "Your limbs tremble uncontrollably, you fall down if standing."
  seizure: incapacitating({ fallsDown: true }),
  unconsciousness: incapacitating({ fallsDown: true }),

  coma: { ...incapacitating({ fallsDown: true }), severity: "mortal" },
  heartAttack: { ...incapacitating({ fallsDown: true }), severity: "mortal" },
};

/** What a condition does to whoever has it. */
export function afflictionEffect(affliction: Affliction): AfflictionEffect {
  return EFFECTS[affliction];
}

/** Every condition of one severity, in the book's order. */
export function afflictionsOf(severity: AfflictionSeverity): Affliction[] {
  return AFFLICTIONS.filter((key) => EFFECTS[key].severity === severity);
}

// ── pain (p. 428) ───────────────────────────────────────────────────────────

/** The three grades of pain the book names. */
export const PAIN_GRADES = ["moderate", "severe", "terrible"] as const;
export type PainGrade = (typeof PAIN_GRADES)[number];

/** Where somebody's pain threshold sits, which halves or doubles what it costs. */
export type PainThreshold = "high" | "normal" | "low";

/**
 * What pain costs (p. 428).
 *
 * "This is -2 for Moderate Pain, -4 for Severe Pain, and -6 for Terrible
 * Pain. High Pain Threshold halves these penalties; Low Pain Threshold
 * doubles them." Halving rounds towards zero, since the penalty is a whole
 * number and the book gives no fraction.
 */
export function painPenalty(grade: PainGrade, threshold: PainThreshold = "normal"): number {
  const base = grade === "moderate" ? 2 : grade === "severe" ? 4 : 6;
  if (threshold === "high") return -Math.floor(base / 2);
  if (threshold === "low") return -(base * 2);
  return -base;
}

/** The condition a grade of pain inflicts. */
export function painAffliction(grade: PainGrade): Affliction {
  return grade === "moderate" ? "moderatePain" : grade === "severe" ? "severePain" : "terriblePain";
}

// ── agony and ecstasy (pp. 428-429) ─────────────────────────────────────────

/** "While the affliction endures, you lose 1 FP per minute or fraction thereof." */
export const AGONY_FP_PER_MINUTE = 1;

/** "... anyone who can credibly threaten you with a resumption of the pain gets +3." */
export const TORTURE_BONUS = 3;

/**
 * What a spell of agony costs in fatigue, and what it is worth to whoever
 * caused it (p. 428).
 *
 * "Low Pain Threshold doubles the FP loss and torture bonus. High Pain
 * Threshold lets you overcome the agony enough to function, but at -3 to DX
 * and IQ." Ecstasy is the same thing from the other direction, and neither
 * threshold touches it.
 */
export function agonyCost(options: {
  minutes: number;
  threshold?: PainThreshold;
  /** True for ecstasy, which the pain thresholds do not reach. */
  ecstasy?: boolean;
}): { fatigue: number; torture: number; functionsAt: number | null } {
  const minutes = Math.max(0, Math.ceil(options.minutes));
  const threshold = options.ecstasy ? "normal" : (options.threshold ?? "normal");
  const doubled = threshold === "low" ? 2 : 1;
  return {
    fatigue: minutes * AGONY_FP_PER_MINUTE * doubled,
    torture: TORTURE_BONUS * doubled,
    // High Pain Threshold buys the ability to act at all, at a price.
    functionsAt: threshold === "high" ? -3 : null,
  };
}

// ── nausea (p. 428) ─────────────────────────────────────────────────────────

/**
 * The roll a nauseated character makes when something sets them off (p. 428).
 *
 * "Roll vs. HT after you eat, are exposed to a foul odor, fail a Fright Check,
 * or are stunned, and every hour in free fall... A rich meal in the past hour
 * gives -2; anti-nausea remedies give +2."
 */
export function nauseaTarget(options: {
  health: number;
  richMeal?: boolean;
  remedy?: boolean;
}): number {
  return options.health + (options.richMeal ? -2 : 0) + (options.remedy ? 2 : 0);
}

/** "On a failure, you vomit for (25 - HT) seconds - treat as Retching." */
export function vomitingSeconds(health: number): number {
  return Math.max(0, 25 - Math.round(health));
}

// ── retching and seizure (p. 429) ───────────────────────────────────────────

/** "At the end of the retching spell, you lose 1 FP." */
export const RETCHING_FP = 1;

/** "At the end of the seizure, you lose 1d FP." */
export const SEIZURE_FP_DICE = 1;

// ── hallucinating (p. 429) ──────────────────────────────────────────────────

export interface Hallucination {
  /** What the penalty is while it lasts. */
  penalty: number;
  /** How long, and in what units. */
  duration: string;
  /** True for the critical failure, where the GM says what they do. */
  freakOut: boolean;
}

/**
 * What a hallucinating character's Will roll came to (p. 429).
 *
 * "On a success, you merely suffer 2d seconds of disorientation. This gives -2
 * on success rolls. On a failure, you actually hallucinate for 1d minutes. In
 * this case, the penalty is -5. On a critical failure, you 'freak out' for 3d
 * minutes."
 */
export function hallucinationOutcome(roll: {
  success: boolean;
  criticalFailure: boolean;
}): Hallucination {
  if (roll.criticalFailure) return { penalty: -5, duration: "3d minutes", freakOut: true };
  if (!roll.success) return { penalty: -5, duration: "1d minutes", freakOut: false };
  return { penalty: -2, duration: "2d seconds", freakOut: false };
}

// ── the mortal two (p. 429) ─────────────────────────────────────────────────

/** "You get a single HT roll to awaken after 12 hours... roll vs. HT every 12 hours." */
export const COMA_CHECK_HOURS = 12;

/**
 * How long somebody in cardiac arrest has (p. 429).
 *
 * "You immediately drop to -1xFP. Regardless of your current HP, you will die
 * in HT/3 minutes unless resuscitated."
 */
export function heartAttackMinutes(health: number): number {
  return Math.max(0, health) / 3;
}

/**
 * Whether this body can have a heart attack at all (p. 429).
 *
 * "Injury Tolerance (Diffuse, Homogenous, or No Vitals) grants immunity to
 * this affliction."
 */
export function canHaveHeartAttack(tolerance: {
  diffuse?: boolean;
  homogenous?: boolean;
  noVitals?: boolean;
}): boolean {
  return !(tolerance.diffuse || tolerance.homogenous || tolerance.noVitals);
}

/** What a heart attack leaves behind, if it is survived (p. 429). */
export function heartAttackSurvival(currentHp: number): number {
  // "If you survive, you will be at 0 HP or your current HP, whichever is worse."
  return Math.min(0, currentHp);
}
