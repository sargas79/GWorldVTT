/**
 * What the sheet says about powers (GURPS Basic Set: Characters pp. 254-255,
 * and the same framework in other books' powers).
 *
 * The powers a character holds were already worked out. What was not said was
 * everything a player building one needs to be told: which Talent helps which
 * power, what a latent's power could turn into, that a Talent past its cap
 * needs the GM's say-so, what a roll to use the power is against -- and, the
 * one that bites, that an advantage bought under a psi name but without its
 * power modifier is not psionic at all.
 */

import {
  PSI_POWERS,
  abilitiesOf,
  hasPowerModifier,
  isAbilityOf,
  powerOfAbility,
  type PsiPower,
} from "../rules/psionics.js";
import { powerRollTargets, powerTalentCost, type PowerHeld, type PowerTrait } from "../rules/powers.js";

/** One power as the sheet shows it. */
export interface PowerView extends PowerHeld {
  /** True where its abilities are only part of it with the power modifier on them. */
  needsModifier: boolean;
  /** For a latent of one of the six, the abilities the power could manifest as. */
  couldManifest: readonly string[];
  /** What the Talent levels cost. */
  talentPoints: number;
  /** A Talent past its cap needs the GM's permission. */
  talentNeedsPermission: boolean;
  /** IQ, Will and Perception with the Talent on top, for a roll to use the power. */
  rolls: { IQ: number; Will: number; Per: number };
}

/** Each held power, with what a player needs to know about it. */
export function describePowers(
  held: readonly PowerHeld[],
  scores: { IQ: number; will: number; per: number },
): PowerView[] {
  return held.map((power) => {
    const cost = powerTalentCost(power);
    return {
      ...power,
      // A book's own power carries its modifier in its price; one of the six
      // is only itself with the modifier on (Antipsi excepted).
      needsModifier: power.psi ? hasPowerModifier(power.psi) : false,
      couldManifest: power.latent && power.psi ? abilitiesOf(power.psi) : [],
      talentPoints: cost.points,
      talentNeedsPermission: cost.needsPermission,
      rolls: powerRollTargets(power, scores),
    };
  });
}

/** An advantage that carries a psi ability's name but is not filed under the power. */
export interface UnpoweredAbility {
  trait: string;
  power: PsiPower;
}

/**
 * Advantages bought under a psi ability's name that are not psionic (p. 254).
 *
 * "An advantage with a power modifier becomes part of the associated power" --
 * so a Mind Reading with no Telepathy modifier on it is not a telepathic
 * ability. It is a superpower, or a gadget, and no Telepathy Talent helps it
 * and no Antipsi stops it. That is almost never what the player meant, and
 * nothing else on the sheet would tell them. A trait whose entry names the
 * power it belongs to has said so, and is not asked again.
 */
export function unpoweredAbilities(traits: readonly PowerTrait[]): UnpoweredAbility[] {
  const found: UnpoweredAbility[] = [];
  for (const trait of traits) {
    if (trait.power?.trim() || powerOfAbility(trait) !== null) continue;
    const power = PSI_POWERS.find((p) => hasPowerModifier(p) && isAbilityOf(p, trait.name));
    if (power) found.push({ trait: trait.name, power });
  }
  return found;
}
