/**
 * The missing hit locations, registered with the system's own registry
 * (Basic Set Revised p. 566, Addendum 3).
 *
 * The rows and their rules are in `rules/revised-hit-locations.ts`; this
 * registers them as `gworld.<key>` locations, each offered only while its
 * switch is on, and listens to the random-hit-location hook to split the torso
 * and roll the 1d that a few blows call for. Nothing here changes a Basic Set
 * location: a row names its parent, which supplies the armour and the rest.
 */

import {
  REVISED_LOCATIONS,
  REVISED_MODULE,
  refineRandomHit,
  type RevisedLocationRule,
  type RevisedSwitch,
} from "../rules/revised-hit-locations.js";
import type { DamageType } from "../rules/types.js";
import { COMBAT_HOOKS, registerHitLocation } from "./combat-extensions.js";
import { isRuleOn } from "./optional-rules.js";

/** Whether a row's switch is on. */
function inPlay(rule: RevisedSwitch): boolean {
  return isRuleOn(rule);
}

/** The system's own key for a row: `gworld.<key>`. */
export function revisedKey(key: string): string {
  return `${REVISED_MODULE}.${key}`;
}

function register(rule: RevisedLocationRule): void {
  registerHitLocation({
    module: REVISED_MODULE,
    key: rule.key,
    label: `GWORLD.RevisedHitLocation.${rule.key}`,
    parent: rule.parent,
    penalty: rule.penalty,
    damageTypes: [...rule.damageTypes] as DamageType[],
    ...(rule.wounding ? { wounding: rule.wounding } : {}),
    ...(rule.cripplingDivisor !== undefined ? { cripplingDivisor: rule.cripplingDivisor } : {}),
    ...(rule.extraDr ? { extraDr: rule.extraDr } : {}),
    ...(rule.knockdownFor ? { knockdownFor: rule.knockdownFor } : {}),
    ...(rule.shockKnockdown ? { shockKnockdown: true } : {}),
    ...(rule.majorWoundKnockdown !== undefined ? { majorWoundKnockdown: rule.majorWoundKnockdown } : {}),
    ...(rule.majorWound ? { majorWound: rule.majorWound } : {}),
    ...(rule.missFallback !== undefined ? { missFallback: rule.missFallback } : {}),
    ...(rule.arcs ? { arcs: [...rule.arcs] } : {}),
    available: () => inPlay(rule.switch),
  });
}

/** Registers the rows and the random-hit refinements. Called once, at init. */
export function registerRevisedHitLocations(): void {
  for (const rule of REVISED_LOCATIONS) register(rule);

  (globalThis as { Hooks?: { on?: (event: string, fn: (context: any) => void) => unknown } }).Hooks?.on?.(
    COMBAT_HOOKS.randomHitLocation,
    (context: {
      roll: number;
      location: string;
      addonLocation: string | null;
      damageType: string | null;
      arc: "front" | "side" | "back" | null;
      d6: () => number;
    }) => {
      // Another listener has already decided where it landed.
      if (context.addonLocation) return;
      const refine = inPlay("finerHitLocations");
      const split = inPlay("chestAbdomenSplit");
      if (!refine && !split) return;
      const refined = refineRandomHit({
        roll: context.roll,
        location: context.location as never,
        damageType: (context.damageType as DamageType | null) ?? null,
        arc: context.arc ?? null,
        d6: context.d6,
        refine,
        split,
      });
      if (!refined) return;
      context.location = refined.location;
      context.addonLocation = refined.key ? revisedKey(refined.key) : null;
    },
  );
}
