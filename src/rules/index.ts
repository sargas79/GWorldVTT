/**
 * The GURPS Lite rules engine.
 *
 * Every module here is pure and free of Foundry dependencies so that the maths
 * can be unit tested headlessly. The Foundry integration layer in `src/system`
 * consumes these functions but never the other way around.
 */

export * from "./types.js";
export * from "./dice.js";
export * from "./attributes.js";
export * from "./attribute-penalties.js";
export * from "./accessories.js";
export * from "./acid.js";
export * from "./afflictions.js";
export * from "./affliction-resistance.js";
export * from "./atmosphere.js";
export * from "./bleeding.js";
export * from "./character-points.js";
export * from "./cinematic.js";
export * from "./contests.js";
export * from "./cover.js";
export * from "./criticals.js";
export * from "./damage.js";
export * from "./hurting-yourself.js";
export * from "./grappling.js";
export * from "./hit-locations.js";
export * from "./armor.js";
export * from "./size.js";
export * from "./skills.js";
export * from "./magic.js";
export * from "./casting.js";
export * from "./spell-attacks.js";
export * from "./enchanting.js";
export * from "./trait-effects.js";
export * from "./gear-effects.js";
export * from "./trait-attacks.js";
export * from "./templates.js";
export * from "./traits.js";
export * from "./visibility.js";
export * from "./disease.js";
export * from "./dirty-tricks.js";
export * from "./encumbrance.js";
export * from "./extra-effort.js";
export * from "./success.js";
export * from "./structures.js";
export * from "./subduing.js";
export * from "./suffocation.js";
export * from "./defenses.js";
export * from "./falling.js";
export * from "./fatigue.js";
export * from "./fright.js";
export * from "./injury.js";
export * from "./intoxication.js";
export * from "./knockdown.js";
export * from "./maneuvers.js";
export * from "./malfunctions.js";
export * from "./picks.js";
export * from "./physical.js";
export * from "./poison.js";
export * from "./melee-situations.js";
export * from "./medicine.js";
export * from "./modifiers.js";
export * from "./motion.js";
export * from "./pressure.js";
export * from "./psionics.js";
export * from "./powers.js";
export * from "./scale.js";
export * from "./natural-attacks.js";
export * from "./aim.js";
export * from "./readiness.js";
export * from "./shotguns.js";
export * from "./injury-tolerance.js";
export * from "./mortal-wounds.js";
export * from "./mounted.js";
export * from "./objects.js";
export * from "./repairs.js";
export * from "./breakage.js";
export * from "./ammunition.js";
export * from "./weapon-quality.js";
export * from "./weakness.js";
export * from "./overpenetration.js";
export * from "./posture.js";
export * from "./ranged.js";
export * from "./scatter.js";
export * from "./reactions.js";
export * from "./recovery.js";
export * from "./senses.js";
export * from "./social.js";
export * from "./talents.js";
export * from "./aging.js";
export * from "./invention.js";
export * from "./jobs.js";
export * from "./languages.js";
export * from "./study.js";
export * from "./wealth.js";
export * from "./collisions.js";
export * from "./electricity.js";
export * from "./fire.js";
export * from "./entangling.js";
export * from "./guided.js";
export * from "./hiking.js";
export * from "./radiation.js";
export * from "./sleep.js";
export * from "./vehicles.js";
export * from "./swarms.js";
export * from "./trampling.js";
export * from "./unarmed-techniques.js";
export * from "./vehicle-combat.js";
export * from "./fragile.js";
export * from "./attack-options.js";
export * from "./bonus-points.js";
export * from "./environment.js";
// scatter.js already gives the same fragmentation radius.
export {
  blastAt, blastRadius, collateralDamage, FRAGMENTATION_SKILL, type BlastEffect,
  BLAST_PLACEMENTS, INTERNAL_BLAST_WOUNDING, FRAGMENTATION_TYPE, blastPlacementOf, contactCoverDr,
  fragmentationSpec, fragmentationLabel, fragmentationStrikes, type BlastPlacement, type FragmentationSpec,
} from "./explosions.js";
export * from "./demolition.js";
export * from "./large-area.js";
export * from "./layered-armor.js";
export * from "./legality.js";
export * from "./shield-damage.js";
export * from "./tactical.js";
export * from "./technique-skills.js";
export * from "./vulnerability.js";
export * from "./tech-level.js";
export * from "./zen-archery.js";
export * from "./surprise.js";
