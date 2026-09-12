/**
 * The rolls that decide whether somebody lives
 * (GURPS Basic Set: Campaigns pp. 422-423).
 *
 * The applied-damage card has been saying "death check" the way it used to say
 * "major wound": naming a roll and leaving it. This rolls it, and knows about
 * the narrow band the book puts between surviving and dying -- a failure by one
 * or two is a mortal wound, which is not the same as being dead, and is a state
 * somebody can be carried out of.
 */

import { SYSTEM_ID } from "./constants.js";
import { setCondition } from "./conditions.js";
import { traitsOf } from "./damage.js";
import {
  cripplingDuration,
  cripplingMonths,
  deathCheck,
  mortalWoundCheck,
  mortalWoundInterval,
  mortalWoundTarget,
} from "../rules/mortal-wounds.js";
import { resolveSuccess } from "../rules/success.js";
import { attributeOf } from "./attributes.js";

const DYING_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/dying.hbs`;

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/** Posts one of these cards. */
async function post(actor: any, context: Record<string, unknown>): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(DYING_TEMPLATE, {
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
 * Rolls the HT check against death (p. 423).
 *
 * Hard to Kill is worth its levels here, which is the advantage's whole
 * purpose, and the card says so rather than folding it into one number.
 */
export async function rollDeathCheck(options: { actor: any }): Promise<void> {
  const { actor } = options;
  if (!actor?.isOwner) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }),
    );
    return;
  }

  const ht = attributeOf(actor, "HT");
  const bonus = traitsOf(actor).survival;

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, ht + bonus, dieResults(roll));
  const result = deathCheck(outcome);

  if (result === "dead") {
    await setCondition(actor, "dead", true);
  } else if (result === "mortallyWounded") {
    // "you are instantly incapacitated" -- and stay that way even if they pull
    // through, so both conditions go on.
    await setCondition(actor, "mortallyWounded", true);
    await setCondition(actor, "unconscious", true);
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Dying.DeathCheck"),
    ht,
    modifier: bonus,
    modifierLabel: game.i18n.localize("GWORLD.Dying.HardToKill"),
    target: ht + bonus,
    dice: dieResults(roll),
    roll: roll.total,
    outcome: game.i18n.localize(`GWORLD.Dying.${result}`),
    bad: result !== "survived",
    fatal: result === "dead",
    rolls: [roll],
  });
}

/**
 * Rolls the check a mortally wounded character makes every half-hour (p. 423).
 *
 * "On any failure, you die" -- there is no margin here, which is what makes a
 * mortal wound different from merely being at negative hit points.
 */
export async function rollMortalWound(options: {
  actor: any;
  /** A caregiver's Physician skill, which replaces HT at TL6+ if better. */
  physician?: number | null;
  traumaMaintenance?: boolean;
}): Promise<void> {
  const { actor, physician = null, traumaMaintenance = false } = options;
  if (!actor?.isOwner) return;

  const ht = attributeOf(actor, "HT");
  const target = mortalWoundTarget({ health: ht, physician });

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const result = mortalWoundCheck(outcome);

  if (result === "dead") {
    await setCondition(actor, "dead", true);
    await setCondition(actor, "mortallyWounded", false);
  } else if (result === "recovered") {
    // "you are no longer mortally wounded (but you are still incapacitated)".
    await setCondition(actor, "mortallyWounded", false);
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Dying.MortalWound"),
    ht,
    modifier: 0,
    target,
    detail: game.i18n.format("GWORLD.Dying.EveryMinutes", {
      minutes: mortalWoundInterval(traumaMaintenance),
    }),
    dice: dieResults(roll),
    roll: roll.total,
    outcome: game.i18n.localize(`GWORLD.Dying.${result}`),
    bad: result !== "recovered",
    fatal: result === "dead",
    rolls: [roll],
  });
}

/**
 * Rolls to see how serious a crippling injury turned out to be (p. 422).
 *
 * "For battlefield injuries, roll at the end of combat" -- so this is a button
 * somebody presses afterwards rather than something the blow does on the spot.
 */
export async function rollCripplingDuration(options: {
  actor: any;
  /** The tech level of the medicine treating it, if any. */
  treatedAtTl?: number | null;
}): Promise<void> {
  const { actor, treatedAtTl = null } = options;
  if (!actor?.isOwner) return;

  const ht = attributeOf(actor, "HT");

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, ht, dieResults(roll));
  const duration = cripplingDuration(outcome);

  // Only a lasting crippling has a length; a temporary one ends when the
  // character is back at full HP, and a permanent one does not end.
  const months = new Roll("1d6");
  if (duration === "lasting") await months.evaluate();

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Dying.Crippling"),
    ht,
    modifier: 0,
    target: ht,
    dice: dieResults(roll),
    roll: roll.total,
    outcome: game.i18n.localize(`GWORLD.Dying.${duration}`),
    detail:
      duration === "lasting"
        ? game.i18n.format("GWORLD.Dying.Months", {
            months: cripplingMonths({ roll: months.total, treatedAtTl }),
          })
        : "",
    bad: duration !== "temporary",
    fatal: duration === "permanent",
    rolls: duration === "lasting" ? [roll, months] : [roll],
  });
}
