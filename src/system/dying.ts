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
  type CripplingDuration,
  deathCheck,
  mortalWoundCheck,
  mortalWoundInterval,
  mortalWoundTarget,
} from "../rules/mortal-wounds.js";
import { resolveSuccess } from "../rules/success.js";
import { PROCEDURE_HOOKS, successRollModifiers } from "./procedure-extensions.js";
import { callCombatHook } from "./combat-extensions.js";
import { attributeOf, healthRollBonus, healthRollScore } from "./attributes.js";
import { hasCondition, syncHealthConditions } from "./conditions.js";
import { fragileExplodes } from "./hazards.js";
import { crippledPartName, crippledParts, settleCrippling, type CrippledPart } from "./crippling.js";
import { failsDeathChecks, fragileDeathCheck, fragileExplosion } from "../rules/fragile.js";

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
  // Hard to Kill, and Fit's bonus to every HT roll with it (pp. 55, 58).
  const bonus = traitsOf(actor).survival + healthRollBonus(actor);
  const fragile = traitsOf(actor).fragile ?? [];
  // Brittle: "should you fail any HT roll to avoid death, you are instantly
  // destroyed ... and instantly go to -10×HP" (Characters p. 136).
  const shatter = async () => {
    await actor.update({ "system.hp.value": fragileExplosion(Number(actor.system?.hp?.max) || 0).hpAfter });
    await syncHealthConditions(actor);
    await setCondition(actor, "dead", true);
  };

  // Unnatural: "You automatically fail the HT roll to stay alive if reduced
  // to -HP or below" (Characters p. 137) -- so there is no roll to make.
  if (failsDeathChecks(fragile)) {
    // An automatic failure is a failure: a Brittle skeleton shatters too.
    if (fragile.includes("brittle")) await shatter();
    else await setCondition(actor, "dead", true);
    await post(actor, {
      kind: game.i18n.localize("GWORLD.Dying.DeathCheck"),
      ht,
      modifier: bonus,
      modifierLabel: game.i18n.localize("GWORLD.Dying.HardToKill"),
      target: ht + bonus,
      outcome: game.i18n.localize("GWORLD.Dying.Unnatural"),
      bad: true,
      fatal: true,
    });
    return;
  }

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, ht + bonus, dieResults(roll));
  const result = deathCheck(outcome);
  // Brittle shatters, Explosive goes up, and Flammable alight goes up on a
  // critical failure (Characters pp. 136-137).
  const fragileResult = fragileDeathCheck({ kinds: fragile, roll: outcome, burning: hasCondition(actor, "burning") });

  if (fragileResult === "explodes") {
    await fragileExplodes({ actor, cause: game.i18n.localize("GWORLD.Hazard.FragileExplosiveDeath") });
  } else if (fragileResult === "destroyed") {
    await shatter();
  } else if (result === "dead") {
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
    outcome: game.i18n.localize(`GWORLD.Dying.${fragileResult ?? result}`),
    bad: result !== "survived",
    fatal: result === "dead" || fragileResult !== null,
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
  /** A modifier the caller knows of (since 1.60.0). */
  modifier?: number;
}): Promise<void> {
  const { actor, physician = null, traumaMaintenance = false } = options;
  if (!actor?.isOwner) return;

  const ht = healthRollScore(actor);
  // What the modules add: a life-support unit's quality, say (API 1.60.0, tagged "mortalWound").
  const added = successRollModifiers({
    actor, label: game.i18n.localize("GWORLD.Dying.MortalWound"), kind: "attribute", skill: "HT",
    base: mortalWoundTarget({ health: ht, physician }), tags: ["mortalWound", ...(traumaMaintenance ? ["traumaMaintenance"] : [])], modifiers: [],
  }).reduce((sum, line) => sum + line.value, 0);
  const modifier = (Number(options.modifier) || 0) + added;
  const target = mortalWoundTarget({ health: ht, physician }) + modifier;

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

  // How often the check comes round: a module's care may stretch it (since API 1.63.0).
  const interval = callCombatHook(PROCEDURE_HOOKS.mortalWoundInterval, {
    actor, traumaMaintenance, minutes: mortalWoundInterval(traumaMaintenance), label: "",
  });
  const minutes = Math.max(1, Math.floor(Number(interval.minutes) || mortalWoundInterval(traumaMaintenance)));
  await post(actor, {
    kind: game.i18n.localize("GWORLD.Dying.MortalWound"),
    ht,
    modifier,
    target,
    detail: [
      minutes % 1440 === 0
        ? game.i18n.format("GWORLD.Dying.EveryDays", { days: minutes / 1440 })
        : game.i18n.format("GWORLD.Dying.EveryMinutes", { minutes }),
      String(interval.label ?? ""),
    ].filter(Boolean).join(" · "),
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
 * Given an undecided crippled part (by id or location; since 1.129.0), the
 * roll settles it. Resolves to the duration and, for a lasting one, its
 * months; null for a user who can't change the actor, or a part named that
 * isn't there waiting to be settled.
 */
export async function rollCripplingDuration(options: {
  actor: any;
  /** The tech level of the medicine treating it, if any. */
  treatedAtTl?: number | null;
  /** An undecided crippled part the roll settles. */
  part?: string;
  /** For that part, if no injury caused it: how long a temporary crippling lasts. */
  seconds?: number;
}): Promise<{ duration: CripplingDuration; months: number | null; part: CrippledPart | null } | null> {
  const { actor, treatedAtTl = null } = options;
  if (!actor?.isOwner) return null;
  const waiting = options.part
    ? crippledParts(actor).find((p) => p.duration === "undecided" && (p.id === options.part || p.location === options.part))
    : undefined;
  if (options.part && !waiting) return null;

  const ht = healthRollScore(actor);

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, ht, dieResults(roll));
  const duration = cripplingDuration(outcome);

  // Only a lasting crippling has a length; a temporary one ends when the
  // character is back at full HP, and a permanent one does not end.
  const months = new Roll("1d6");
  if (duration === "lasting") await months.evaluate();
  const monthsToHeal = duration === "lasting" ? cripplingMonths({ roll: months.total, treatedAtTl }) : null;

  // A temporary crippling no HP loss caused doesn't end at full HP, so the
  // card says so rather than promising what won't happen.
  const outcomeKey = duration === "temporary" && waiting?.injury === false
    ? "GWORLD.Crippled.TemporaryNoInjury"
    : `GWORLD.Dying.${duration}`;

  await post(actor, {
    kind: waiting
      ? `${game.i18n.localize("GWORLD.Dying.Crippling")}: ${waiting.label || crippledPartName(waiting.location)}`
      : game.i18n.localize("GWORLD.Dying.Crippling"),
    ht,
    modifier: 0,
    target: ht,
    dice: dieResults(roll),
    roll: roll.total,
    outcome: game.i18n.localize(outcomeKey),
    detail:
      monthsToHeal !== null
        ? game.i18n.format("GWORLD.Dying.Months", { months: monthsToHeal })
        : "",
    bad: duration !== "temporary",
    fatal: duration === "permanent",
    rolls: duration === "lasting" ? [roll, months] : [roll],
  });

  const part = waiting
    ? await settleCrippling(actor, waiting.id, {
        duration,
        ...(monthsToHeal !== null ? { months: monthsToHeal } : {}),
        ...(options.seconds !== undefined ? { seconds: options.seconds } : {}),
      })
    : null;
  return { duration, months: monthsToHeal, part };
}
