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
  };
}

/** A trait as the sheet holds it: a name, and how many levels were bought. */
export interface HeldTrait {
  name: string;
  levels?: number;
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
  "no legs (aquatic)": () => ({ aquatic: true }),
};

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
  return matchName(name) in TRAIT_EFFECTS;
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
    const effect = TRAIT_EFFECTS[matchName(trait.name)];
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

    total.unfazeable ||= applied.unfazeable ?? false;
    total.noShock ||= applied.noShock ?? false;
    total.aquatic ||= applied.aquatic ?? false;
    total.ambidextrous ||= applied.ambidextrous ?? false;

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
