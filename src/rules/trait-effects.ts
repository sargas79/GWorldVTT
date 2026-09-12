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
import { isTalent } from "./talents.js";
import { isSocialTrait } from "./social.js";

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
  /**
   * Magery (Characters p. 66): null for somebody with none, 0 for Magery 0
   * alone, and the level bought above that otherwise. Kept apart from a plain
   * number because "no Magery" and "Magery 0" are different things: one
   * cannot learn spells in a normal-mana world and the other can.
   */
  magery: number | null;
  /** Ritual Magery, the separate advantage the ritual style of magic uses (p. 242). */
  ritualMagery: number | null;
  /**
   * Magic Resistance (p. 67): "Subtract your Magic Resistance from the skill
   * of anyone casting a spell on you, and add it to your roll to resist".
   */
  magicResistance: number;
  /** Enhanced Dodge (p. 51): added to Dodge. */
  enhancedDodge: number;
  /** Enhanced Parry (p. 51): to every parry, or to bare-handed ones alone. */
  enhancedParry: { all: number; bareHands: number };
  /** Enhanced Block (p. 51): added to Block. */
  enhancedBlock: number;
  /**
   * Fit or Very Fit (p. 55): "+1 to all HT rolls" for Fit and +2 for Very
   * Fit, which is also what is added to every HT roll this system makes.
   */
  htRolls: number;
  /** Fit and Very Fit both "recover FP at twice the normal rate". */
  fatigueRecoveryMultiplier: number;
  /** Very Fit alone "lose[s] FP at only half the normal rate". */
  fatigueLossHalved: boolean;
  /** Night Vision (p. 71): each level cancels a point of darkness penalty, to nine. */
  nightVision: number;
  /** Dark Vision (p. 47): no darkness penalty at all, even in total darkness. */
  darkVision: boolean;
  /** Infravision (p. 60): the same against anything warm, which a foe is. */
  infravision: boolean;
  /** Acute Senses (p. 35): a level each to the Perception roll for that sense. */
  acute: { vision: number; hearing: number; tasteSmell: number; touch: number };
  /** Bad Sight (p. 123): nearsighted is -2 to ranged attacks, farsighted -3 to melee. */
  badSight: "nearsighted" | "farsighted" | null;
  /** One Eye (p. 147): -1 to ranged attacks, from the lack of depth. */
  oneEye: boolean;
  /** Hard of Hearing (p. 138): -4 on Hearing rolls. */
  hardOfHearing: boolean;
  /** Deafness (p. 129): no Hearing roll at all. */
  deafness: boolean;
  /** Blindness (p. 124): no Vision roll, and every attack is made blind, at the accustomed -6. */
  blindness: boolean;
  /**
   * Lame (p. 141): crippled legs halve Basic Move; missing legs leave Move 2;
   * legless or paraplegic leaves none. Each is a penalty to attacks and defenses
   * on foot as well.
   */
  lame: "crippled" | "missing" | "none" | null;
  /** One Arm (p. 147): nothing two-handed can be used. */
  oneArm: boolean;
  /**
   * Temperature Tolerance (p. 93): degrees added to the comfort zone on the
   * cold side and on the hot side. The book gives ten a level to divide as the
   * player chooses; a modifier named Cold or Heat on the trait puts them all on
   * one side, and without one they are split.
   */
  temperatureTolerance: { coldF: number; heatF: number };
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
    magery: null,
    ritualMagery: null,
    magicResistance: 0,
    enhancedDodge: 0,
    enhancedParry: { all: 0, bareHands: 0 },
    enhancedBlock: 0,
    htRolls: 0,
    fatigueRecoveryMultiplier: 1,
    fatigueLossHalved: false,
    nightVision: 0,
    darkVision: false,
    infravision: false,
    acute: { vision: 0, hearing: 0, tasteSmell: 0, touch: 0 },
    badSight: null,
    oneEye: false,
    hardOfHearing: false,
    deafness: false,
    blindness: false,
    lame: null,
    oneArm: false,
    temperatureTolerance: { coldF: 0, heatF: 0 },
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
  // "Magery 0 costs 5 points for all mages ... 10 points/level (on top of the
  // 5 points for Magery 0)" (p. 66). GCA carries the two as separate records,
  // and so do the compendia: Magery 0 is the awareness, Magery the levels.
  "magery 0": () => ({ magery: 0 }),
  magery: (levels) => ({ magery: levels }),
  // The ritual style's own Magery, "separate advantages" when both systems
  // are in play (p. 242).
  "ritual magery 0": () => ({ ritualMagery: 0 }),
  "ritual magery": (levels) => ({ ritualMagery: levels }),

  // "-3 to cast spells on you and you get +3 to resist" for three levels (p. 67).
  "magic resistance": (levels) => ({ magicResistance: levels }),

  // "+1 to Dodge", "+1 to Parry" and "+1 to Block" a level (p. 51). The
  // compendium prices two Enhanced Parries: one for all parries, one for the
  // bare hands.
  "enhanced dodge": (levels) => ({ enhancedDodge: levels }),
  "enhanced block": (levels) => ({ enhancedBlock: levels }),
  "enhanced parry (all parries)": (levels) => ({ enhancedParry: { all: levels, bareHands: 0 } }),
  "enhanced parry (bare hands)": (levels) => ({ enhancedParry: { all: 0, bareHands: levels } }),

  // Fit: "+1 to all HT rolls ... you recover FP at twice the normal rate."
  // Very Fit: "+2 to all HT rolls ... you lose FP at only half the normal
  // rate" and recover them twice as fast (p. 55). The compendium carries Very
  // Fit as a trait of its own and as Fit's second level, so both are read.
  fit: (levels) =>
    levels >= 2
      ? { htRolls: 2, fatigueRecoveryMultiplier: 2, fatigueLossHalved: true }
      : { htRolls: 1, fatigueRecoveryMultiplier: 2 },
  "very fit": () => ({ htRolls: 2, fatigueRecoveryMultiplier: 2, fatigueLossHalved: true }),

  // "Each level of Night Vision allows you to ignore -1 in darkness penalties"
  // (p. 71); Dark Vision "can see in total darkness" (p. 47); Infravision sees
  // the warmth of a living foe (p. 60).
  "night vision": (levels) => ({ nightVision: Math.min(9, levels) }),
  "dark vision": () => ({ darkVision: true }),
  infravision: () => ({ infravision: true }),

  // "+1 per level to all Sense rolls" for that sense (p. 35).
  "acute vision": (levels) => ({ acute: { vision: levels, hearing: 0, tasteSmell: 0, touch: 0 } }),
  "acute hearing": (levels) => ({ acute: { vision: 0, hearing: levels, tasteSmell: 0, touch: 0 } }),
  "acute taste and smell": (levels) => ({ acute: { vision: 0, hearing: 0, tasteSmell: levels, touch: 0 } }),
  "acute touch": (levels) => ({ acute: { vision: 0, hearing: 0, tasteSmell: 0, touch: levels } }),

  // "Nearsighted ... -2 to hit with ranged weapons. Farsighted ... -3 to hit
  // in melee combat" (p. 123), and the senses that are missing outright.
  "bad sight (nearsighted)": () => ({ badSight: "nearsighted" }),
  "bad sight (farsighted)": () => ({ badSight: "farsighted" }),
  "one eye": () => ({ oneEye: true }),
  "hard of hearing": () => ({ hardOfHearing: true }),
  deafness: () => ({ deafness: true }),
  blindness: () => ({ blindness: true }),
  "one arm": () => ({ oneArm: true }),

  // Lame (p. 141): "Crippled Legs: ... halve your Basic Move (round down)";
  // "Missing Legs: ... Basic Move 2"; "Legless" and "Paraplegic" have none.
  "lame (crippled legs)": () => ({ lame: "crippled" }),
  "lame (missing legs)": () => ({ lame: "missing" }),
  "lame (legless)": () => ({ lame: "none" }),
  "lame (paraplegic)": () => ({ lame: "none" }),
};

/**
 * Temperature Tolerance is read from its modifiers as well as its levels:
 * "each level adds 10 degrees to your comfort zone. You may divide the range
 * ... as you see fit" (p. 93). A modifier called Cold or Heat on the trait is
 * how the sheet says which side; without one the ten is split five and five.
 */
const TEMPERATURE_TOLERANCE = /^temperature tolerance\b/;
const DEGREES_PER_LEVEL = 10;

function temperatureTolerance(trait: HeldTrait): { coldF: number; heatF: number } {
  const levels = Math.max(1, Math.floor(trait.levels ?? 0) || 1);
  const degrees = levels * DEGREES_PER_LEVEL;
  const side = (trait.modifiers ?? []).map((m) => m.trim().toLowerCase());
  if (side.includes("cold")) return { coldF: degrees, heatF: 0 };
  if (side.includes("heat")) return { coldF: 0, heatF: degrees };
  return { coldF: degrees / 2, heatF: degrees / 2 };
}

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
  return (
    key in TRAIT_EFFECTS ||
    INJURY_TOLERANCE.test(key) ||
    TEMPERATURE_TOLERANCE.test(key) ||
    isTalent(key) ||
    isSocialTrait(key)
  );
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
    if (TEMPERATURE_TOLERANCE.test(key)) {
      const zone = temperatureTolerance(trait);
      total.temperatureTolerance.coldF += zone.coldF;
      total.temperatureTolerance.heatF += zone.heatF;
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

    // Magery 0 and Magery N are two records for one talent, so the level is
    // the highest either says rather than their sum: Magery 0 beside Magery 3
    // is Magery 3, not Magery 3 counted twice.
    total.magery = highest(total.magery, applied.magery);
    total.ritualMagery = highest(total.ritualMagery, applied.ritualMagery);
    total.magicResistance += applied.magicResistance ?? 0;
    total.enhancedDodge += applied.enhancedDodge ?? 0;
    total.enhancedBlock += applied.enhancedBlock ?? 0;
    total.enhancedParry.all += applied.enhancedParry?.all ?? 0;
    total.enhancedParry.bareHands += applied.enhancedParry?.bareHands ?? 0;
    // Fit and Very Fit do not add: whoever has both is Very Fit.
    total.htRolls = Math.max(total.htRolls, applied.htRolls ?? 0);
    total.fatigueRecoveryMultiplier = Math.max(
      total.fatigueRecoveryMultiplier, applied.fatigueRecoveryMultiplier ?? 1,
    );
    total.fatigueLossHalved ||= applied.fatigueLossHalved ?? false;
    total.nightVision = Math.min(9, total.nightVision + (applied.nightVision ?? 0));
    total.darkVision ||= applied.darkVision ?? false;
    total.infravision ||= applied.infravision ?? false;
    for (const sense of ["vision", "hearing", "tasteSmell", "touch"] as const) {
      total.acute[sense] += applied.acute?.[sense] ?? 0;
    }
    if (applied.badSight) total.badSight = applied.badSight;
    total.oneEye ||= applied.oneEye ?? false;
    total.hardOfHearing ||= applied.hardOfHearing ?? false;
    total.deafness ||= applied.deafness ?? false;
    total.blindness ||= applied.blindness ?? false;
    total.oneArm ||= applied.oneArm ?? false;
    // Two kinds of Lame do not add either: the worse one is the one you have.
    if (applied.lame) total.lame = worseLameness(total.lame, applied.lame);
  }

  return total;
}

/** The higher of two levels, where null means the talent is absent. */
function highest(a: number | null, b: number | null | undefined): number | null {
  if (b === null || b === undefined) return a;
  return a === null ? b : Math.max(a, b);
}

const LAMENESS_ORDER: ReadonlyArray<TraitEffects["lame"]> = [null, "crippled", "missing", "none"];

function worseLameness(a: TraitEffects["lame"], b: TraitEffects["lame"]): TraitEffects["lame"] {
  return LAMENESS_ORDER.indexOf(a) >= LAMENESS_ORDER.indexOf(b) ? a : b;
}

/**
 * Basic Move after Lame (p. 141).
 *
 * "Crippled Legs ... halve your Basic Move (round down)", "Missing Legs ...
 * Basic Move 2", and the legless or paraplegic "have a Basic Move of 0".
 */
export function lameMove(basicMove: number, lame: TraitEffects["lame"]): number {
  switch (lame) {
    case "crippled":
      return Math.floor(basicMove / 2);
    case "missing":
      return Math.min(basicMove, 2);
    case "none":
      return 0;
    default:
      return basicMove;
  }
}

/**
 * What Lame costs in a fight (p. 141): "-3 to attack and defense rolls" with
 * crippled legs, and "-6" without them.
 */
export function lameCombatPenalty(lame: TraitEffects["lame"]): number {
  switch (lame) {
    case "crippled":
      return -3;
    case "missing":
    case "none":
      return -6;
    default:
      return 0;
  }
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

/** One penalty a physical disadvantage puts on an attack, with the trait to blame. */
export interface ImpairedAttack {
  trait: string;
  value: number;
}

/**
 * What the physical disadvantages cost an attack (pp. 123, 141, 147).
 *
 * Nearsighted is "-2 to hit with ranged weapons" and farsighted "-3 to hit
 * in melee combat"; One Eye is "-1 to all ranged attacks"; Lame is a penalty
 * to every attack made on foot. Each is listed under its own name, because a
 * roll at -6 should say which three things it was.
 */
export function impairedAttacks(
  effects: Pick<TraitEffects, "badSight" | "oneEye" | "lame">,
  ranged: boolean,
): ImpairedAttack[] {
  const out: ImpairedAttack[] = [];
  if (ranged && effects.badSight === "nearsighted") out.push({ trait: "Bad Sight", value: -2 });
  if (!ranged && effects.badSight === "farsighted") out.push({ trait: "Bad Sight", value: -3 });
  if (ranged && effects.oneEye) out.push({ trait: "One Eye", value: -1 });
  const lame = lameCombatPenalty(effects.lame);
  if (lame !== 0) out.push({ trait: "Lame", value: lame });
  return out;
}
