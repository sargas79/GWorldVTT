/**
 * What worn gear grants in trait terms (GURPS Basic Set: Characters pp. 285-286).
 *
 * The armour table's notes describe several suits by naming advantages rather
 * than by giving numbers: a vacc suit worn with its helmet "gives Doesn't
 * Breathe (for 12 hours), Protected Smell, Sealed, and Vacuum Support", and an
 * NBC suit worn "with a mask or a helmet with note [7] ... provides the Sealed
 * advantage". Those are the two the system carries; anything else a book grants
 * is its module's, through the `gworld.traitEffects` hook.
 *
 * A suit grants nothing while it is off, and the two-piece suits grant nothing
 * until both pieces are worn -- which is the whole of what the notes say.
 */

import type { TraitEffects } from "./trait-effects.js";

/** A piece of gear as the sheet holds it, for reading what wearing it grants. */
export interface WornGear {
  name: string;
  equipped: boolean;
}

/** One thing a piece of gear grants, and the piece it came from. */
export interface GearEffect {
  /** The gear, for the sheet's breakdown: "Vacc Suit (TL 9)". */
  source: string;
  /** What it grants, as a piece of the trait effects. */
  effect: Partial<TraitEffects>;
}

const worn = (gear: readonly WornGear[], pattern: RegExp): string | null =>
  gear.find((piece) => piece.equipped && pattern.test(piece.name.trim().toLowerCase()))?.name ?? null;

/** The vacc suit and its helmet, at every tech level the table prints. */
const VACC_SUIT = /^vacc suit(?: \(tl ?\d+\))?$/;
const VACC_HELMET = /^vacc suit helmet(?: \(tl ?\d+\))?$/;

/** The NBC suit, and what may seal it: a gas mask, or a helmet carrying note [7]. */
const NBC_SUIT = /^nbc suit$/;
const SEALING_HEADGEAR = /^(gas mask|vacc suit helmet|space suit helmet)(?: \(tl ?\d+\))?$/;

/**
 * What the gear a character is wearing grants, each naming the piece it came
 * from. Nothing here is a number the armour already carries: DR is the
 * armour's own field, and these are the advantages the notes name instead.
 */
export function gearEffects(gear: readonly WornGear[]): GearEffect[] {
  const granted: GearEffect[] = [];

  // Note [10]: "Requires Vacc Suit skill. If worn with its helmet, the suit
  // gives Doesn't Breathe (for 12 hours), Protected Smell, Sealed, and Vacuum
  // Support." The twelve hours are the air supply's, which the sheet does not
  // track; what it grants while it lasts is what is read here.
  const suit = worn(gear, VACC_SUIT);
  if (suit && worn(gear, VACC_HELMET)) {
    granted.push({
      source: suit,
      effect: {
        doesntBreathe: true,
        sealed: true,
        vacuumSupport: true,
        protectedSense: { vision: false, hearing: false, tasteSmell: true, touch: false },
      },
    });
  }

  // Note [5]: "Worn with a mask or a helmet with note [7], the combination
  // provides the Sealed advantage." The suit alone provides none of it.
  const nbc = worn(gear, NBC_SUIT);
  if (nbc && worn(gear, SEALING_HEADGEAR)) {
    granted.push({ source: nbc, effect: { sealed: true } });
  }

  // Note [7], which the gas mask and the vacc and space helmets carry:
  // "Provides Filter Lungs, Protected Smell, and Protected Vision - but before
  // TL9, it also gives the No Peripheral Vision disadvantage." The last of
  // those is the armour's own field, already set on the two pre-TL9 pieces,
  // so what is left is what is granted here -- suit or no suit.
  const headgear = worn(gear, SEALING_HEADGEAR);
  if (headgear) {
    granted.push({
      source: headgear,
      effect: {
        filterLungs: true,
        protectedSense: { vision: true, hearing: false, tasteSmell: true, touch: false },
      },
    });
  }

  return granted;
}

/**
 * What one piece of granted gear should be shown as, effect by effect. A flag
 * names itself; a sense-by-sense effect names the sense it turned on.
 */
export function grantedEffectSources(granted: GearEffect): Array<{ effect: string; label: string; value?: number }> {
  const lines: Array<{ effect: string; label: string; value?: number }> = [];
  for (const [effect, value] of Object.entries(granted.effect)) {
    if (value === true) lines.push({ effect, label: granted.source });
    else if (typeof value === "number" && value !== 0) lines.push({ effect, label: granted.source, value });
    else if (value && typeof value === "object") {
      for (const [sense, on] of Object.entries(value as Record<string, unknown>)) {
        if (on === true) lines.push({ effect: `${effect}.${sense}`, label: granted.source });
      }
    }
  }
  return lines;
}
