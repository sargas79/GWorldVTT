/**
 * Three things a fight throws up that no attack roll settles
 * (GURPS Basic Set: Campaigns pp. 405, 408, 414).
 *
 * Where the grenade went, whether the bullet came out the other side, and what
 * a drink in the face does. None of them belongs on a weapon's own line: each
 * is a question asked once the dice are already on the table, which is why they
 * are buttons rather than attacks.
 */

import { hearingTarget, heardUpClose, type Silencer } from "../rules/accessories.js";
import { SYSTEM_ID } from "./constants.js";
import {
  DIRECTIONS,
  fragmentHits,
  fragmentTarget,
  fragmentationRadius,
  scatterBearing,
  scatterDistance,
} from "../rules/scatter.js";
import { canOverpenetrate, coverDr, damageThrough, overpenetrates, type CoverKind } from "../rules/overpenetration.js";
import {
  FLINCH_PENALTY, LIQUID_IN_THE_FACE, liquidDefended, liquidEffects, liquidInTheFace, type LiquidDefense, type LiquidResult,
} from "../rules/dirty-tricks.js";
import { resolveSuccess } from "../rules/success.js";
import { relayEffect } from "./gm-relay.js";
import type { ConditionApplication } from "./procedure-extensions.js";

const GUNPLAY_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/gunplay.hbs`;

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

async function post(actor: any, context: Record<string, unknown>): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(GUNPLAY_TEMPLATE, {
    name: String(actor?.name ?? ""),
    ...context,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: (context.rolls as any[]) ?? [],
  });
}

/**
 * Where a missed area attack came down (p. 414).
 *
 * The direction is a real die so that the table sees it roll: which way the
 * grenade bounced decides who is standing in the blast, and that is not a
 * result anybody should have to take on trust.
 */
export async function rollScatter(options: {
  actor: any;
  /** The attacker's margin of failure, or the defender's margin if dodged. */
  margin: number;
  distanceYards: number;
  dodged: boolean;
  unseen: boolean;
  /** The weapon's miss is always squared (since API 1.72.0). */
  squared?: boolean;
  /** Dice of fragmentation, for the radius the card reports. */
  fragmentationDice: number;
}): Promise<void> {
  const direction = new Roll("1d6");
  await direction.evaluate();

  const scatter = scatterDistance({
    margin: options.margin,
    distanceYards: options.distanceYards,
    dodged: options.dodged,
    unseen: options.unseen,
    squared: options.squared === true,
    directionRoll: direction.total,
  });

  await post(options.actor, {
    scatter: true,
    yards: scatter.yards,
    direction: scatter.direction,
    directions: DIRECTIONS,
    bearing: scatterBearing(scatter.direction),
    onTarget: scatter.yards === 0,
    squared: (options.unseen || options.squared === true) && !options.dodged,
    fragmentRadius: fragmentationRadius(options.fragmentationDice),
    fragmentSkillAt: fragmentTarget({
      rangeModifier: 0,
      postureModifier: 0,
      sizeModifier: 0,
    }),
    fragmentPerMargin: fragmentHits(3),
    rolls: [direction],
  });
}

/**
 * Whether a shot came out the other side, and what hit whoever was behind
 * (p. 408).
 *
 * Everything is asked rather than measured: who is standing behind whom is the
 * GM's to say, and the thing in the way is as likely to be a door as a person.
 */
export async function checkOverpenetration(options: {
  actor: any;
  basicDamage: number;
  coverDr: number;
  coverHp: number;
  coverKind: CoverKind;
  armorDivisor: number;
  behindDr: number;
  /** What the shot does: only a piercing, impaling or tight-beam burning one goes through. */
  damageType: string;
  tightBeam: boolean;
  /** The weapon's row refuses overpenetration (since API 1.73.0), and what it is called. */
  refused?: boolean;
  weapon?: string;
}): Promise<number> {
  // A row that says its shot stays in what it hits (since API 1.73.0).
  if (options.refused === true) {
    await post(options.actor, {
      overpenetration: true,
      basicDamage: options.basicDamage,
      cannotOverpenetrate: true,
      refusedBy: options.weapon || options.damageType,
      damageType: options.damageType,
      went: false,
      through: 0,
    });
    return 0;
  }

  // "When you inflict piercing, impaling, or tight-beam burning damage with a
  // ranged attack" (p. 408) -- and nothing else. A club through a door is a
  // club stopped by a door, and a flamethrower does not drill through people.
  if (!canOverpenetrate({ type: options.damageType, ranged: true, tightBeam: options.tightBeam })) {
    await post(options.actor, {
      overpenetration: true,
      basicDamage: options.basicDamage,
      cannotOverpenetrate: true,
      damageType: options.damageType,
      went: false,
      through: 0,
    });
    return 0;
  }

  const cover = coverDr({
    dr: options.coverDr,
    hp: options.coverHp,
    kind: options.coverKind,
    armorDivisor: options.armorDivisor,
  });

  const through = damageThrough({
    basicDamage: options.basicDamage,
    cover,
    targetDr: options.behindDr,
    armorDivisor: options.armorDivisor,
  });

  await post(options.actor, {
    overpenetration: true,
    basicDamage: options.basicDamage,
    cover,
    went: overpenetrates(options.basicDamage, cover),
    through,
  });

  return through;
}

/**
 * Whether somebody hears a shot, and can tell where it came from (p. 411).
 *
 * Somebody in front of the gun and close enough to be shot at "automatically
 * hears the shot - even with a silencer", but a silencer leaves them an IQ roll
 * rather than a sight of the shooter to place it. Anybody further off rolls
 * Hearing+5, less the silencer, give or take four for the gun and the room.
 */
export async function hearTheShot(options: {
  actor: any;
  listener: any;
  silencer: Silencer;
  loudness: number;
  upClose: boolean;
  inPlainSight: boolean;
}): Promise<void> {
  const name = String(options.listener?.name ?? "");

  if (options.upClose) {
    const close = heardUpClose({ silencer: options.silencer, inPlainSight: options.inPlainSight });
    await post(options.actor, {
      hearing: true,
      victim: name,
      line: game.i18n.localize(close.locates ? "GWORLD.Hearing.HeardAndPlaced" : "GWORLD.Hearing.HeardNotPlaced"),
    });
    return;
  }

  const senses = options.listener?.system?.derived?.senses ?? [];
  const hearing = Number(senses.find((s: any) => s.sense === "hearing")?.score)
    || Number(options.listener?.system?.derived?.per) || 10;
  const target = hearingTarget({ hearing, silencer: options.silencer, loudness: options.loudness });
  const roll = new Roll("3d6");
  await roll.evaluate();
  const heard = resolveSuccess(roll.total, target, dieResults(roll)).success;
  await post(options.actor, {
    hearing: true,
    victim: name,
    target,
    dice: dieResults(roll),
    roll: roll.total,
    line: game.i18n.localize(heard ? "GWORLD.Hearing.Heard" : "GWORLD.Hearing.NotHeard"),
    rolls: [roll],
  });
}

/** What a splash in the face is called with. */
export interface SplashOptions {
  /** The thrower, whom the card speaks for. */
  actor: any;
  /** The victim, who is the one who rolls. */
  victim: any;
  hit: boolean;
  criticalHit: boolean;
  /** Whether a defense worked; `defense` in its place works it out. */
  defended?: boolean;
  /** True where a parry was tried, which does nothing against a liquid. */
  parried?: boolean;
  /** The defense tried and made (since API 1.155.0): a parry stops nothing. */
  defense?: LiquidDefense;
  /** What was thrown, for the card (since API 1.155.0). */
  liquid?: string;
  /** Leaves the flinch or the blindness on the victim as timed conditions (since API 1.155.0). */
  apply?: boolean;
  /** The actor it comes from, for a victim the user doesn't own: the thrower where left out (since API 1.155.0). */
  source?: any;
}

/** What a splash did, and the conditions it left (since API 1.155.0). */
export interface SplashOutcome extends LiquidResult {
  /** The victim's Will, which the roll to keep from flinching was made against. */
  will: number;
  /** The ids of the conditions `apply` left on the victim. */
  conditions: string[];
}

/**
 * A drink in somebody's face (p. 405).
 *
 * The throw itself is an ordinary ranged attack at -5 for the face, which the
 * attacker makes with whatever they are holding; what this rolls is the Will
 * check that decides whether they flinch, since that is the part with a number
 * on it. A module's weapon that squirts something starts it through
 * `combat.liquidInTheFace` (since API 1.155.0).
 */
export async function splashInTheFace(options: SplashOptions): Promise<SplashOutcome> {
  const will = Number(options.victim?.system?.derived?.will) || 10;
  // The defense tried, where the caller names it: a parry stops nothing (since API 1.155.0).
  const defense = typeof options.defense === "string" ? options.defense : null;
  const defended = defense !== null ? liquidDefended(defense) : options.defended === true;
  const parried = defense !== null ? defense === "parry" : options.parried === true;

  // Only somebody who was actually splashed rolls: a critical hit allows no
  // defense and blinds outright, and a miss is a miss.
  const rolls: any[] = [];
  let keptComposure = true;

  if (options.hit && !options.criticalHit && !defended) {
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    keptComposure = resolveSuccess(roll.total, will, dieResults(roll)).success;
  }

  const blind = options.criticalHit ? new Roll("1d6") : null;
  if (blind) {
    await blind.evaluate();
    rolls.push(blind);
  }

  const result = liquidInTheFace({
    hit: options.hit,
    criticalHit: options.criticalHit,
    defended,
    keptComposure,
    ...(blind ? { blindRoll: blind.total } : {}),
  });

  // What it leaves on the victim, as timed conditions, where the caller asks
  // (since API 1.155.0): through the GM's client for a victim the user
  // doesn't own, on behalf of the thrower.
  const conditions: string[] = [];
  if (options.apply === true) {
    const L = (key: string) => game.i18n.localize(`GWORLD.Splash.${key}`);
    for (const effect of liquidEffects(result)) {
      const label = L(`Effect.${effect.key}`);
      const application: ConditionApplication = {
        module: SYSTEM_ID,
        key: `splash-${effect.key}`,
        label,
        effects: { modifiers: effect.value === 0 ? [] : [{ label, value: effect.value, rolls: effect.rolls }] },
        duration: { ...(effect.turns !== null ? { turns: effect.turns } : {}), seconds: effect.seconds },
      };
      const id = await relayEffect("applyCondition", options.victim, options.source ?? options.actor, { application }, null);
      if (id) conditions.push(id);
    }
  }

  await post(options.actor, {
    splash: true,
    liquid: typeof options.liquid === "string" ? options.liquid.trim() : "",
    victim: String(options.victim?.name ?? ""),
    will,
    accuracy: LIQUID_IN_THE_FACE.accuracy,
    maxRange: LIQUID_IN_THE_FACE.maxRangeYards,
    faceModifier: LIQUID_IN_THE_FACE.faceModifier,
    ...result,
    triedToParry: parried,
    flinchPenalty: FLINCH_PENALTY,
    dice: rolls[0] ? dieResults(rolls[0]) : null,
    roll: rolls[0]?.total ?? null,
    rolls,
  });
  return { ...result, will, conditions };
}
