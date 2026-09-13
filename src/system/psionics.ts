/**
 * What the sheet says about psionic powers (GURPS Basic Set: Characters
 * pp. 254-255).
 *
 * The powers a character holds were already worked out. What was not said was
 * everything a player building one needs to be told: which Talent helps which
 * power, what a latent's power could turn into, that a Talent past level four
 * needs the GM's say-so -- and, the one that bites, that an advantage bought
 * under a psi name but without its power modifier is not psionic at all.
 */

import {
  PSI_POWERS,
  abilitiesOf,
  hasPowerModifier,
  isAbilityOf,
  powerOfAbility,
  talentCost,
  talentFor,
  type PsiPower,
  type PsiPowerHeld,
  type PsiTrait,
} from "../rules/psionics.js";

/** One power as the sheet shows it. */
export interface PsiPowerView extends PsiPowerHeld {
  /** The Talent that helps it, or null for Antipsi. */
  talentName: string | null;
  /** True where its abilities are only psionic with the power modifier on them. */
  needsModifier: boolean;
  /** For a latent, the abilities the power could manifest as. */
  couldManifest: readonly string[];
  /** What the Talent levels cost. */
  talentPoints: number;
  /** "You may not buy more than four levels of a given Talent without the GM's permission." */
  talentNeedsPermission: boolean;
}

/** Each held power, with what a player needs to know about it. */
export function describePowers(held: readonly PsiPowerHeld[]): PsiPowerView[] {
  return held.map((power) => {
    const cost = talentCost(power.talent);
    return {
      ...power,
      talentName: talentFor(power.power),
      needsModifier: hasPowerModifier(power.power),
      couldManifest: power.latent ? abilitiesOf(power.power) : [],
      talentPoints: cost.points,
      talentNeedsPermission: cost.needsPermission,
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
 * nothing else on the sheet would tell them.
 */
export function unpoweredAbilities(traits: readonly PsiTrait[]): UnpoweredAbility[] {
  const found: UnpoweredAbility[] = [];
  for (const trait of traits) {
    if (powerOfAbility(trait) !== null) continue;
    const power = PSI_POWERS.find((p) => hasPowerModifier(p) && isAbilityOf(p, trait.name));
    if (power) found.push({ trait: trait.name, power });
  }
  return found;
}
