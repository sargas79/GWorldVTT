/**
 * What an unarmed fighter does besides punch (GURPS Basic Set: Campaigns
 * pp. 402-404).
 *
 * "Here are some additional options for unarmed fighters who are not content
 * merely to punch, kick, and grapple." Four of them, and two rules from the
 * same pages that belong with them: how far a long weapon really reaches, and
 * what to do with a chair leg.
 *
 * The thread running through the locks is the same one: the damage is not an
 * attack. It is a Quick Contest made every turn while the hold lasts, and the
 * margin is the damage. So flexible armour is no use at all -- there is
 * nothing to cut -- while a rigid plate and a thick hide both are.
 */

/** The techniques the book names. */
export type UnarmedTechnique = "armLock" | "chokeHold" | "elbowStrike" | "neckSnap" | "piercingStrike";

/** Which skill a technique is rolled against, and at what. */
export interface TechniqueRoll {
  /** The skills it may be used with, best first. */
  skills: readonly string[];
  /** The modifier on the roll to hit, by skill. */
  modifier: Readonly<Record<string, number>>;
}

const ROLLS: Readonly<Record<UnarmedTechnique, TechniqueRoll>> = {
  // "It uses Judo or Wrestling skill... make a successful barehanded parry."
  armLock: { skills: ["Judo", "Wrestling"], modifier: { Judo: 0, Wrestling: 0 } },
  // "roll against your Judo at -2 or Wrestling at -3 to hit."
  chokeHold: { skills: ["Judo", "Wrestling"], modifier: { Judo: -2, Wrestling: -3 } },
  // "Roll against Brawling-2 or Karate-2 to hit."
  elbowStrike: { skills: ["Brawling", "Karate"], modifier: { Brawling: -2, Karate: -2 } },
  // A ST-based contest rather than a skill roll; the grapple comes first.
  neckSnap: { skills: ["Judo", "Wrestling"], modifier: { Judo: 0, Wrestling: 0 } },
  // "Roll against Karate to hit, but at -2 over and above any other penalties."
  piercingStrike: { skills: ["Karate"], modifier: { Karate: -2 } },
};

/** What a technique is rolled against with a given skill (pp. 403-404). */
export function techniqueModifier(technique: UnarmedTechnique, skill: string): number | null {
  const roll = ROLLS[technique];
  const found = Object.entries(roll.modifier).find(([name]) => name.toLowerCase() === skill.trim().toLowerCase());
  return found ? found[1] : null;
}

/** The skills a technique may be used with. */
export function techniqueSkills(technique: UnarmedTechnique): readonly string[] {
  return ROLLS[technique].skills;
}

// ── what armour a lock gets through (pp. 403-404) ───────────────────────────

/**
 * The DR that protects against a lock or a wrench (pp. 403-404).
 *
 * "The target's natural DR (unless it has the Tough Skin limitation) and the
 * DR of his rigid armor protect normally. Flexible armor has no effect!"
 *
 * A mail shirt stops a blade and does nothing whatever against an arm being
 * bent the wrong way, which is the whole reason the sentence is there.
 */
export function lockDr(options: {
  /** The victim's own DR, from hide or scales. */
  naturalDr: number;
  /** True when that natural DR is Tough Skin, which a lock ignores. */
  toughSkin?: boolean;
  rigidDr: number;
  flexibleDr: number;
}): number {
  const natural = options.toughSkin ? 0 : Math.max(0, options.naturalDr);
  return natural + Math.max(0, options.rigidDr);
}

// ── arm lock (p. 403) ───────────────────────────────────────────────────────

/** "you are at +4 in the Quick Contest" to keep an arm lock on. */
export const ARM_LOCK_HOLD_BONUS = 4;

/** "If he loses, he has a cumulative -1 on future attempts to break free." */
export const ARM_LOCK_STRUGGLE_PENALTY = -1;

/** "your opponent... defends at -4" against close combat attacks while locked. */
export const LOCKED_DEFENSE_PENALTY = -4;

/**
 * What an arm lock does on a turn it is winning (p. 403).
 *
 * "Roll a Quick Contest: the highest of your Judo, Wrestling, or ST vs. the
 * higher of your victim's ST or HT. If you win, you inflict crushing damage
 * equal to your margin of victory."
 *
 * Once the limb is crippled the damage stops but the contest does not: "You
 * can inflict no further damage on a crippled limb, but you can continue to
 * roll the Contest each turn. If you win, your target suffers shock and
 * stunning just as if you had inflicted damage."
 */
export function armLockDamage(options: {
  margin: number;
  dr: number;
  /** True once the arm is already crippled. */
  crippled?: boolean;
}): { damage: number; shockOnly: boolean } {
  if (options.margin <= 0) return { damage: 0, shockOnly: false };
  if (options.crippled) return { damage: 0, shockOnly: true };
  return { damage: Math.max(0, options.margin - Math.max(0, options.dr)), shockOnly: false };
}

/** The higher of the two attributes a lock is resisted with (p. 403). */
export function lockResistance(options: { strength: number; health: number }): number {
  return Math.max(options.strength, options.health);
}

/** The best of the three a lock is applied with (p. 403). */
export function lockAttack(options: {
  judo?: number | null;
  wrestling?: number | null;
  strength: number;
}): number {
  return Math.max(options.strength, options.judo ?? 0, options.wrestling ?? 0);
}

// ── choke hold (p. 404) ─────────────────────────────────────────────────────

/** "You are at +5 in the Quick Contest" to keep a choke on. */
export const CHOKE_HOLD_BONUS = 5;

/** "your victim loses 1 FP, per Suffocation." */
export const CHOKE_FP_PER_TURN = 1;

/** "get +3 to ST for this purpose" when choking for damage as well. */
export const CHOKE_DAMAGE_ST_BONUS = 3;

/**
 * What a choke hold leaves the victim able to do (p. 404).
 *
 * "note that you control your victim's neck and head - not his arms and legs.
 * He can attack you with a Wild Swing, Back Kick, etc., at the usual -4 for
 * being grappled."
 */
export function chokedCanStillFight(): { canAttack: boolean; penalty: number } {
  return { canAttack: true, penalty: -4 };
}

// ── neck snap and wrench limb (p. 404) ──────────────────────────────────────

/** "roll a Quick Contest: your ST-4 vs. the higher of your victim's ST or HT." */
export const NECK_SNAP_PENALTY = -4;

/** "Damage to the neck has the usual x1.5 wounding modifier for hit location." */
export const NECK_WOUNDING = 1.5;

/**
 * What a wrench does where it took hold (p. 404).
 *
 * "If you win, you inflict swing/crushing damage on the neck or limb." The
 * neck carries its own wounding modifier; a limb does not.
 */
export function wrenchWounding(location: string): number {
  return location.trim().toLowerCase() === "neck" ? NECK_WOUNDING : 1;
}

// ── piercing strike (p. 403) ────────────────────────────────────────────────

/** "You get -1 to damage, but your blow is piercing instead of crushing." */
export const PIERCING_STRIKE_DAMAGE = -1;

/**
 * What a Karate strike on a single point costs and buys (p. 403).
 *
 * "It is an option for any punch or kick with Karate... This lets you target
 * the vitals or eyes! There is a down side: the Hurting Yourself rule applies
 * if your target has DR 1+ (as opposed to DR 3+)."
 */
export function piercingStrike(): {
  toHit: number;
  damage: number;
  damageType: "pi";
  hurtsYourselfAtDr: number;
} {
  return { toHit: -2, damage: PIERCING_STRIKE_DAMAGE, damageType: "pi", hurtsYourselfAtDr: 1 };
}

// ── the effects of reach (p. 402) ───────────────────────────────────────────

/** "each yard past the first brings the foe three feet closer to you." */
export const FEET_PER_EXTRA_YARD = 3;

/**
 * How much closer a long weapon makes the foe (p. 402).
 *
 * "If your weapon or Size Modifier gives you more than one yard of reach, each
 * yard past the first brings the foe three feet closer to you. This does not
 * bring you any closer to your foe!"
 *
 * Which is the sentence that matters: reach is not symmetrical, and a man with
 * a greatsword fighting somebody on a table is better off without the man on
 * the table being any better off at all.
 */
export function reachAdvantageFeet(reachYards: number): number {
  return Math.max(0, Math.floor(reachYards) - 1) * FEET_PER_EXTRA_YARD;
}

/**
 * The vertical difference a long weapon leaves to be dealt with (p. 402).
 *
 * The reach closes the gap for the fighter who has it, and the level rules
 * are then read at whatever is left.
 */
export function effectiveLevelDifference(options: {
  feet: number;
  reachYards: number;
}): number {
  return Math.max(0, options.feet - reachAdvantageFeet(options.reachYards));
}

// ── improvised weapons (p. 404) ─────────────────────────────────────────────

/**
 * What swinging a chair leg costs (p. 404).
 *
 * "If an improvised weapon is especially clumsy, add a penalty of -1 to -3 to
 * hit or parry with it, or increase the minimum ST required. If it is shorter
 * or lighter than a 'real' weapon of the same type (or not very sharp, for a
 * blade), reduce damage."
 *
 * The book leaves the figures to the GM, so this only bounds them: what it
 * knows is that the penalty is never a bonus and never worse than three.
 */
export function improvisedPenalty(clumsiness: number): number {
  const asked = Math.abs(Math.round(clumsiness));
  if (asked === 0) return 0;
  return -Math.min(3, asked);
}
