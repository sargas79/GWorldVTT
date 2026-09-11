/**
 * Illness on a sheet (GURPS Basic Set: Campaigns pp. 442-444).
 *
 * "Diseases are defined in much the same way as poisons", and once caught a
 * disease behaves exactly like one: a cyclic resistance roll and a point of
 * damage per failure. So this catches them and hands them to the poison list,
 * rather than keeping a second list of the same shape -- from a character's
 * point of view "what is at work on me" is one question.
 *
 * What is here rather than there is the catching: a disease has to get to you,
 * and the contagion and infection tables are what say whether it did.
 */

import { SYSTEM_ID } from "./constants.js";
import { activePoisons, POISON_FLAG, type ActivePoison } from "./poison.js";
import {
  INFECTION_BASE,
  antibioticsPreventInfection,
  contagionModifier,
  diseaseNamed,
  infectionModifier,
  naturallyImmune,
  type Disease,
  type Exposure,
  type WoundDirt,
} from "../rules/disease.js";
import { resolveSuccess } from "../rules/success.js";

const DISEASE_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/disease.hbs`;

/** Diseases somebody has proved immune to, so the roll is not made twice. */
export const IMMUNITY_FLAG = "immuneTo";

/**
 * Diseases somebody has already been rolled against.
 *
 * Natural immunity is found on "your first attempt to resist a disease" and
 * nowhere else, so a later 3 or 4 is only a very good roll.
 */
export const EXPOSED_FLAG = "exposedTo";

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

function mayChange(actor: any): boolean {
  if (actor?.isOwner) return true;
  ui.notifications?.warn(
    game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }),
  );
  return false;
}

async function post(actor: any, context: Record<string, unknown>): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(DISEASE_TEMPLATE, {
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

/** What this character has already proved immune to. */
export function immunities(actor: any): string[] {
  const stored = actor?.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG);
  return Array.isArray(stored) ? (stored as string[]) : [];
}

/** What this character has been rolled against before. */
function exposures(actor: any): string[] {
  const stored = actor?.getFlag?.(SYSTEM_ID, EXPOSED_FLAG);
  return Array.isArray(stored) ? (stored as string[]) : [];
}

/** Adds one illness to the list of things at work on this character. */
async function takeIll(actor: any, disease: Disease): Promise<ActivePoison> {
  const active: ActivePoison = {
    id: foundry.utils.randomID(),
    name: disease.name,
    resistanceModifier: disease.resistanceModifier,
    damage: "toxic",
    dice: disease.dice,
    adds: disease.adds,
    damageMultiplier: 1,
    intervalSeconds: disease.intervalSeconds,
    cycles: disease.cycles,
    cyclesSuffered: 0,
    delaySeconds: disease.delaySeconds,
    treatment: 0,
    reference: disease.reference ?? "",
    illness: true,
  };

  await actor.setFlag(SYSTEM_ID, POISON_FLAG, [...activePoisons(actor), active]);
  return active;
}

/**
 * A day spent where something is going round (p. 443).
 *
 * "If you enter a disease-ridden area or encounter a disease carrier, make a HT
 * roll at the end of the day to resist the disease." The GM rolls it -- "the GM
 * makes your roll to avoid it" -- which is why the card says what happened
 * rather than the sheet quietly changing.
 */
export async function exposeToDisease(options: {
  actor: any;
  disease: Disease;
  exposures: readonly Exposure[];
  /** Anything the GM wants to add: precautions, a racial susceptibility. */
  modifier?: number;
}): Promise<boolean> {
  const { actor, disease } = options;
  if (!mayChange(actor)) return false;

  // "Anyone who survives a given disease may be immune in the future", and a
  // natural immunity found on a previous exposure never wears off.
  if (immunities(actor).includes(disease.name)) {
    await post(actor, { disease, immune: true, alreadyKnown: true });
    return false;
  }

  const ht = Number(actor.system?.attributes?.HT) || 10;
  const contact = contagionModifier(options.exposures);
  const target = ht + disease.resistanceModifier + contact + (options.modifier ?? 0);

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  // "If the GM rolls a 3 or 4 for your first attempt to resist a disease, you
  // are immune! He should note this fact and not tell you." Noting it is what
  // this can do; not telling them is between the GM and the chat log.
  const seen = exposures(actor);
  const immune = naturallyImmune(roll.total, !seen.includes(disease.name));
  if (immune) {
    await actor.setFlag(SYSTEM_ID, IMMUNITY_FLAG, [...immunities(actor), disease.name]);
  }
  if (!seen.includes(disease.name)) {
    await actor.setFlag(SYSTEM_ID, EXPOSED_FLAG, [...seen, disease.name]);
  }

  const caught = !outcome.success;
  if (caught) await takeIll(actor, disease);

  await post(actor, {
    disease,
    target,
    contact,
    dice: dieResults(roll),
    roll: roll.total,
    success: outcome.success,
    caught,
    immune,
    rolls: [roll],
  });

  return caught;
}

/**
 * Whether a wound goes bad (p. 444).
 *
 * "People wounded under less-than-clean circumstances and who do not receive
 * treatment must make a HT+3 roll." Antibiotics settle it without a roll, which
 * is worth saying on a card rather than silently skipping.
 */
export async function checkInfection(options: {
  actor: any;
  dirt: readonly WoundDirt[];
  antibiotics?: boolean;
  /** True when the First Aid or Physician roll that applied them was critical. */
  treatmentBotched?: boolean;
}): Promise<boolean> {
  const { actor } = options;
  if (!mayChange(actor)) return false;

  const techLevel = Number(actor.system?.tl) || 3;

  if (options.antibiotics && antibioticsPreventInfection(techLevel, options.treatmentBotched)) {
    await post(actor, { infection: true, protected: true, techLevel });
    return false;
  }

  const ht = Number(actor.system?.attributes?.HT) || 10;
  const target = ht + infectionModifier(options.dirt);

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  // "A typical infection requires a daily HT roll, modified as above" -- the
  // same filth, once the +3 for having a wound treated at all is taken back
  // out: that bonus is for whether it goes bad, not for shaking it off.
  const infection = {
    ...diseaseNamed("Infection")!,
    resistanceModifier: infectionModifier(options.dirt) - INFECTION_BASE,
  };
  const caught = !outcome.success;
  if (caught) await takeIll(actor, infection);

  await post(actor, {
    infection: true,
    disease: infection,
    target,
    dice: dieResults(roll),
    roll: roll.total,
    success: outcome.success,
    caught,
    rolls: [roll],
  });

  return caught;
}
