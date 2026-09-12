/**
 * Traits that change the numbers (GURPS Basic Set: Characters pp. 32-178).
 *
 * The compendia carry 641 traits and every one of them costs points. Most of
 * what they buy is narrative, or conditional, or the GM's to adjudicate -- but
 * a couple of dozen say something exact about a roll this system already makes,
 * and until now none of them said it.
 *
 * This is that couple of dozen. A trait is listed here only when the book gives
 * it a number and this system has somewhere to put that number: Combat Reflexes
 * adds one to every active defense, High Pain Threshold removes shock, Damage
 * Resistance adds DR. Everything else stays where it belongs, which is the
 * character's own sheet and the GM's judgement.
 *
 * Traits are matched by name, because that is what a compendium record carries.
 * A trait somebody renamed stops being read, which is the right way round: a
 * house-ruled "Combat Reflexes (Feline)" is the GM's own trait, and quietly
 * applying the book's numbers to it would be a guess.
 */

import { injuryToleranceFrom, noInjuryTolerance, type InjuryTolerance } from "./injury-tolerance.js";

/** What a character's traits do to the rolls this system makes. */
export interface TraitEffects {
  /** Added to every active defense roll (Combat Reflexes). */
  activeDefense: number;
  /** Added to Fright Checks. */
  frightCheck: number;
  /** True when no Fright Check is made at all (Unfazeable). */
  unfazeable: boolean;
  /** True when injury causes no shock at all (High Pain Threshold). */
  noShock: boolean;
  /** Shock is multiplied (Low Pain Threshold doubles it). */
  shockMultiplier: number;
  /** Added to HT rolls to avoid knockdown and stunning. */
  knockdown: number;
  /** Added to HT rolls made to survive at negative HP (Hard to Kill). */
  survival: number;
  /** Added to HT rolls made to stay conscious (Hard to Subdue). */
  consciousness: number;
  /** Natural DR, which protects everywhere and under any armour. */
  damageResistance: number;
  /** Levels of Super Jump, each of which doubles jumping distance. */
  superJump: number;
  /** The Enhanced Move (Ground) multiplier, or 1 for someone without it. */
  enhancedMove: number;
  /** True for anything that swims at its full Basic Move. */
  aquatic: boolean;
  /** No penalty for using the off hand (Ambidexterity, Characters p. 39). */
  ambidextrous: boolean;
  /** Influence rolls fail against them outright (Indomitable, Characters p. 60). */
  indomitable: boolean;
  /** Intimidation fails against them outright (Unfazeable, Characters p. 95). */
  slaveMentality: boolean;
  /**
   * Levels added to the four attributes by traits that buy them as traits --
   * Extra ST, Extra DX and so on (Characters pp. 14-17 price them; GCA
   * carries them by these names). Read everywhere the attribute is.
   */
  attributes: { ST: number; DX: number; IQ: number; HT: number };
  /** Striking ST: added to ST for thrust and swing damage only (p. 88). */
  strikingSt: number;
  /** Lifting ST: added to ST for Basic Lift and everything carried (p. 65). */
  liftingSt: number;
  /** Levels of the secondary characteristics bought as traits. */
  secondary: { hp: number; fp: number; will: number; per: number; basicMove: number; basicSpeed: number };
  /**
   * Arm ST (Characters p. 40): ST for lifting and striking with the arms,
   * and nothing else -- not HP, not ST-based skills.
   */
  armSt: number;
  /** Extra Attack (p. 53): attacks beyond the one an Attack maneuver allows. */
  extraAttacks: number;
  /** Extra Arms (p. 53): arms beyond the usual two. */
  extraArms: number;
  /** Regeneration (p. 80), as the level bought: 1 slow to 5 extreme, 0 for none. */
  regeneration: number;
  /** Unkillable (p. 95), as its level: 0 for the mortal. */
  unkillable: number;
  /** Injury Tolerance (pp. 60-61): what parts the body lacks and how it is hurt. */
  injuryTolerance: InjuryTolerance;
}

/** What no traits at all come to, and the shape everything is added onto. */
export function noTraitEffects(): TraitEffects {
  return {
    activeDefense: 0,
    frightCheck: 0,
    unfazeable: false,
    noShock: false,
    shockMultiplier: 1,
    knockdown: 0,
    survival: 0,
    consciousness: 0,
    damageResistance: 0,
    superJump: 0,
    enhancedMove: 1,
    aquatic: false,
    ambidextrous: false,
    indomitable: false,
    slaveMentality: false,
    attributes: { ST: 0, DX: 0, IQ: 0, HT: 0 },
    strikingSt: 0,
    liftingSt: 0,
    secondary: { hp: 0, fp: 0, will: 0, per: 0, basicMove: 0, basicSpeed: 0 },
    armSt: 0,
    extraAttacks: 0,
    extraArms: 0,
    regeneration: 0,
    unkillable: 0,
    injuryTolerance: noInjuryTolerance(),
  };
}

/** A trait as the sheet holds it: a name, how many levels were bought, and its modifiers by name. */
export interface HeldTrait {
  name: string;
  levels?: number;
  /**
   * The names of its enhancements and limitations. Most say nothing this
   * module reads; Injury Tolerance's kind is one that does.
   */
  modifiers?: readonly string[];
}

type EffectOf = (levels: number) => Partial<TraitEffects>;

/**
 * The traits this system reads, by name, with the page each comes from.
 *
 * Levels are what the sheet says were bought; a trait with no levels is handed
 * a 1, so a per-level effect and a flat one can be written the same way.
 */
const TRAIT_EFFECTS: Record<string, EffectOf> = {
  // "+1 to all active defense rolls... and +2 to Fright Checks" (p. 43).
  "combat reflexes": () => ({ activeDefense: 1, frightCheck: 2 }),

  // "-2 to Fright Checks" is the Campaigns modifier list (p. 360); the trait's
  // own paralysis in a fight is the GM's to run.
  "combat paralysis": () => ({ frightCheck: -2 }),

  // "Add your level of Fearlessness to your Will whenever you make a Fright
  // Check" (p. 55), and Fearfulness is the same in reverse (p. 136).
  fearlessness: (levels) => ({ frightCheck: levels }),
  fearfulness: (levels) => ({ frightCheck: -levels }),

  // "Unfazeable characters don't make Fright Checks!" (Campaigns p. 360).
  unfazeable: () => ({ unfazeable: true }),

  // "You never suffer a shock penalty when you are injured. In addition, you
  // get +3 on all HT rolls to avoid knockdown and stunning" (p. 59).
  "high pain threshold": () => ({ noShock: true, knockdown: 3 }),

  // "Double the shock from any injury... You roll at -4 to resist knockdown,
  // stunning, and physical torture" (p. 142).
  "low pain threshold": () => ({ shockMultiplier: 2, knockdown: -4 }),

  // "Each level of Hard to Kill gives +1 to HT rolls made for survival at -HP
  // or below" (p. 58).
  "hard to kill": (levels) => ({ survival: levels }),

  // "Each level of Hard to Subdue gives +1 to any HT roll to avoid
  // unconsciousness" (p. 59).
  "hard to subdue": (levels) => ({ consciousness: levels }),

  // "Each point of DR stops one point of basic damage" (p. 46).
  "damage resistance": (levels) => ({ damageResistance: levels }),

  // "Those who have Super Jump double the final jumping distance for each level
  // of that advantage" (Campaigns p. 352).
  "super jump": (levels) => ({ superJump: levels }),

  // "Each level of Enhanced Move doubles your top speed" (p. 52), which the
  // jumping rules use as a multiplier on Basic Move for a running jump. Only
  // the ground one: the compendium carries Air, Space and Water as well, and
  // none of those helps you jump over a chair.
  "enhanced move (ground)": (levels) => ({ enhancedMove: 2 ** Math.max(0, levels) }),

  // "Amphibious and Aquatic beings have water Move equal to their full Basic
  // Move" (Campaigns p. 354). Aquatic is a meta-trait rather than a record of
  // its own, and what the compendium carries for it is No Legs (Aquatic).
  amphibious: () => ({ aquatic: true }),

  // "You can use either hand... you suffer no -4 penalty for using the 'off'
  // hand" (Characters p. 39).
  ambidexterity: () => ({ ambidextrous: true }),

  // "You cannot be affected by Influence rolls" (Characters p. 60), and its
  // opposite: "you win automatically against those with Slave Mentality"
  // (Campaigns p. 359).
  indomitable: () => ({ indomitable: true }),
  "slave mentality": () => ({ slaveMentality: true }),
  "no legs (aquatic)": () => ({ aquatic: true }),

  // The attributes bought as traits. Each level is a point of the attribute,
  // and the sheet reads the sum wherever it reads the attribute.
  "extra st": (levels) => ({ attributes: { ST: levels, DX: 0, IQ: 0, HT: 0 } }),
  "extra dx": (levels) => ({ attributes: { ST: 0, DX: levels, IQ: 0, HT: 0 } }),
  "extra iq": (levels) => ({ attributes: { ST: 0, DX: 0, IQ: levels, HT: 0 } }),
  "extra ht": (levels) => ({ attributes: { ST: 0, DX: 0, IQ: 0, HT: levels } }),

  // "Striking ST ... adds to ST only for the purpose of damage" (p. 88), and
  // "Lifting ST ... for Basic Lift" and what follows from it (p. 65).
  "striking st": (levels) => ({ strikingSt: levels }),
  "lifting st": (levels) => ({ liftingSt: levels }),

  // The secondary characteristics bought as traits rather than adjusted on the
  // sheet. Basic Speed comes in quarter steps.
  "extra hit points": (levels) => ({ secondary: { hp: levels, fp: 0, will: 0, per: 0, basicMove: 0, basicSpeed: 0 } }),
  "extra fatigue points": (levels) => ({ secondary: { hp: 0, fp: levels, will: 0, per: 0, basicMove: 0, basicSpeed: 0 } }),
  "extra will": (levels) => ({ secondary: { hp: 0, fp: 0, will: levels, per: 0, basicMove: 0, basicSpeed: 0 } }),
  "extra perception": (levels) => ({ secondary: { hp: 0, fp: 0, will: 0, per: levels, basicMove: 0, basicSpeed: 0 } }),
  "extra basic move": (levels) => ({ secondary: { hp: 0, fp: 0, will: 0, per: 0, basicMove: levels, basicSpeed: 0 } }),
  "extra basic speed": (levels) => ({ secondary: { hp: 0, fp: 0, will: 0, per: 0, basicMove: 0, basicSpeed: levels * 0.25 } }),

  // "Arm ST ... adds to ST for the purpose of lifting or striking with that
  // arm" (p. 40): it goes where Striking ST and Lifting ST go, and nowhere else.
  "arm st": (levels) => ({ armSt: levels }),
  // One more attack a turn per level (p. 53), and more arms to hold things in.
  "extra attack": (levels) => ({ extraAttacks: levels }),
  "extra arms": (levels) => ({ extraArms: levels }),

  // Regeneration's levels are its rates -- Slow, Regular, Fast, Very Fast,
  // Extreme -- and Unkillable's are how far past death it goes (pp. 80, 95).
  regeneration: (levels) => ({ regeneration: levels }),
  unkillable: (levels) => ({ unkillable: levels }),
};

/**
 * Injury Tolerance is one trait whose kind is in its modifiers or its name:
 * "Injury Tolerance (Unliving)", or "Injury Tolerance" with a modifier
 * called Unliving. Both are read, so it is matched by prefix rather than
 * looked up whole.
 */
const INJURY_TOLERANCE = /^injury tolerance\b/;

/**
 * The name a trait is matched by.
 *
 * Trailing parenthetical detail is kept, because it can change what the trait
 * is -- Enhanced Move (Ground) and Enhanced Move (Air) are different
 * advantages, and only one of them helps you jump.
 */
function matchName(name: string): string {
  return name.trim().toLowerCase();
}

/** Whether a named trait is one this system reads at all. */
export function isReadTrait(name: string): boolean {
  const key = matchName(name);
  return key in TRAIT_EFFECTS || INJURY_TOLERANCE.test(key);
}

/** Every trait name this system reads, for showing what is understood. */
export function readTraitNames(): string[] {
  return Object.keys(TRAIT_EFFECTS);
}

/**
 * What a character's traits come to, added together.
 *
 * Bonuses add, which is what the book does with them. The two that cannot add
 * are `unfazeable` and `noShock`, which are either true or not, and
 * `shockMultiplier` and `enhancedMove`, where the largest wins -- nobody has
 * two of those, and if they did, the more extreme is the one that matters.
 */
export function traitEffects(traits: readonly HeldTrait[]): TraitEffects {
  const total = noTraitEffects();

  for (const trait of traits) {
    const key = matchName(trait.name);
    if (INJURY_TOLERANCE.test(key)) {
      total.injuryTolerance = injuryToleranceFrom(
        [trait.name, ...(trait.modifiers ?? [])],
        total.injuryTolerance,
      );
      continue;
    }

    const effect = TRAIT_EFFECTS[key];
    if (!effect) continue;

    // A trait with no levels field is a flat one, and counts once.
    const levels = Math.max(1, Math.floor(trait.levels ?? 0) || 1);
    const applied = effect(levels);

    total.activeDefense += applied.activeDefense ?? 0;
    total.frightCheck += applied.frightCheck ?? 0;
    total.knockdown += applied.knockdown ?? 0;
    total.survival += applied.survival ?? 0;
    total.consciousness += applied.consciousness ?? 0;
    total.damageResistance += applied.damageResistance ?? 0;
    total.superJump += applied.superJump ?? 0;
    total.strikingSt += applied.strikingSt ?? 0;
    total.liftingSt += applied.liftingSt ?? 0;
    total.armSt += applied.armSt ?? 0;
    total.extraAttacks += applied.extraAttacks ?? 0;
    total.extraArms += applied.extraArms ?? 0;
    // Two Regenerations or two Unkillables do not add: the better one holds.
    total.regeneration = Math.max(total.regeneration, applied.regeneration ?? 0);
    total.unkillable = Math.max(total.unkillable, applied.unkillable ?? 0);
    for (const key of ["ST", "DX", "IQ", "HT"] as const) {
      total.attributes[key] += applied.attributes?.[key] ?? 0;
    }
    for (const key of ["hp", "fp", "will", "per", "basicMove", "basicSpeed"] as const) {
      total.secondary[key] += applied.secondary?.[key] ?? 0;
    }

    total.unfazeable ||= applied.unfazeable ?? false;
    total.noShock ||= applied.noShock ?? false;
    total.aquatic ||= applied.aquatic ?? false;
    total.ambidextrous ||= applied.ambidextrous ?? false;
    total.indomitable ||= applied.indomitable ?? false;
    total.slaveMentality ||= applied.slaveMentality ?? false;

    total.shockMultiplier = Math.max(total.shockMultiplier, applied.shockMultiplier ?? 1);
    total.enhancedMove = Math.max(total.enhancedMove, applied.enhancedMove ?? 1);
  }

  return total;
}

/**
 * Shock after the traits that change it (pp. 59, 142).
 *
 * High Pain Threshold removes it; Low Pain Threshold doubles it. Ordinary shock
 * stops at -4, and the doubled kind stops at -8 -- the same floor a critical's
 * doubled shock reaches, because it is the same doubling.
 */
export function shockAfterTraits(shock: number, effects: TraitEffects): number {
  if (effects.noShock) return 0;
  if (effects.shockMultiplier <= 1 || shock >= 0) return shock;
  return Math.max(-8, shock * effects.shockMultiplier);
}

/**
 * Jumping distance after Super Jump, which "doubles the final jumping distance
 * for each level" (Campaigns p. 352).
 */
export function afterSuperJump(distance: number, levels: number): number {
  return distance * 2 ** Math.max(0, Math.floor(levels));
}
