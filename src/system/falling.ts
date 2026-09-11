/**
 * Someone hitting the ground (GURPS Basic Set: Campaigns pp. 430-431).
 *
 * Three rules this system already runs end with a character on the floor -- a
 * critical miss, knockback, and a failed Climbing roll -- and all three say
 * "see Falling" and stop. This is what happens next.
 *
 * A fall is resolved against the faller rather than by them, so it goes through
 * the ordinary damage pipeline: their worn armour, at a hit location, with the
 * wounding modifier for crushing. Two things about a fall are its own, and both
 * are applied here rather than in that pipeline, because both are true only of
 * falling:
 *
 * - all armour counts as flexible, so a fall the armour stops still leaves
 *   blunt trauma;
 * - injury past what cripples a limb is not discarded, it comes off HP.
 */

import { SYSTEM_ID } from "./constants.js";
import { resolveDamageAgainst, type IncomingDamage } from "./damage.js";
import { bluntTrauma, fallingDamage, type LandingSurface } from "../rules/falling.js";
import { randomHitLocation, type HitLocation } from "../rules/hit-locations.js";
import { applyInjury } from "../rules/injury.js";

const FALL_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/fall.hbs`;

export interface FallOptions {
  actor: any;
  yardsFallen: number;
  surface: LandingSurface;
  /** An Acrobatics roll landed it properly, taking five yards off. */
  controlled: boolean;
}

/**
 * Drops an actor and writes what it cost them.
 *
 * Returns the injury taken, or null when this user may not change that actor --
 * the same refusal `applyDamageToActor` makes, for the same reason.
 */
export async function rollFall(options: FallOptions): Promise<number | null> {
  const { actor, yardsFallen, surface, controlled } = options;
  if (!actor?.isOwner) return null;

  const hp = actor.system?.hp ?? { value: 0, max: 0 };
  const fall = fallingDamage({
    hitPoints: Number(hp.max) || 0,
    yardsFallen,
    surface,
    controlled,
  });

  // Nothing to roll for a fall of no distance -- a controlled landing from four
  // yards is a landing, not a fall.
  if (fall.velocity <= 0) {
    ui.notifications?.info(game.i18n.localize("GWORLD.Fall.NoFall"));
    return 0;
  }

  const formula = fall.damage.modifier === 0
    ? `${fall.damage.dice}d6`
    : `${fall.damage.dice}d6 ${fall.damage.modifier > 0 ? "+" : "-"} ${Math.abs(fall.damage.modifier)}`;
  const roll = new Roll(formula);
  await roll.evaluate();

  // "If using hit locations, roll randomly for the hit location damaged in a
  // fall." The location roll is 3d, like every other, and is shown.
  const locationRoll = new Roll("3d6");
  await locationRoll.evaluate();
  const hitLocation: HitLocation = randomHitLocation(locationRoll.total).location;

  const damage: IncomingDamage = {
    basicDamage: Math.max(0, roll.total),
    type: "cr",
    armorDivisor: 1,
    hitLocation,
  };
  const resolved = resolveDamageAgainst(actor, damage);

  // "All armor, flexible or not (but not innate DR), counts as flexible for the
  // purpose of calculating blunt trauma from falling damage" -- so a fall the
  // armour stopped still bruises, at a point per five stopped.
  const trauma = bluntTrauma({
    stopped: damage.basicDamage,
    penetrated: resolved.penetrating > 0,
    crushing: true,
  });

  // "If the injury is to an extremity or a limb, do not ignore injury in excess
  // of that required to cripple it. Instead, subtract the full amount from HP!"
  const injury = resolved.penetrating > 0 ? resolved.injury + resolved.excessLost : trauma;

  const previous = Number(hp.value) || 0;
  const applied = applyInjury(injury, previous, Number(hp.max) || 0);
  if (injury > 0) await actor.update({ "system.hp.value": applied.currentHp });

  const content = await foundry.applications.handlebars.renderTemplate(FALL_TEMPLATE, {
    name: String(actor.name ?? ""),
    yardsFallen: fall.yardsFallen,
    shortened: controlled && fall.yardsFallen < yardsFallen,
    velocity: fall.velocity,
    surface: game.i18n.localize(`GWORLD.Fall.Surface.${surface}`),
    formula,
    rolled: roll.total,
    location: game.i18n.localize(`GWORLD.HitLocation.${hitLocation}`),
    dr: resolved.effectiveDr,
    stopped: resolved.penetrating === 0,
    trauma,
    injury,
    // Injury past a crippled limb is kept rather than discarded, which is worth
    // saying: everywhere else on this card's siblings it is thrown away.
    excessKept: resolved.penetrating > 0 && resolved.excessLost > 0 ? resolved.excessLost : 0,
    crippled: resolved.crippled,
    previous,
    current: applied.currentHp,
    max: Number(hp.max) || 0,
    status: game.i18n.localize(`GWORLD.Health.${applied.status}`),
    majorWound: applied.majorWound,
    deathCheck: applied.deathCheckRequired,
    knockdownModifier: resolved.htModifiers.knockdown,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll, locationRoll],
  });

  return injury;
}
