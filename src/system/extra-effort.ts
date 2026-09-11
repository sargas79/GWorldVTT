/**
 * Spending fatigue to push past your limits in a fight
 * (GURPS Basic Set: Campaigns p. 357).
 *
 * The combat half of Extra Effort is deliberately roll-free: you say what you
 * are doing, you pay the FP, and you get it. So there is nothing here but the
 * paying -- and, for Mighty Blows, remembering between the attack roll and the
 * damage roll that it was bought.
 *
 * "You must declare that you are using extra effort and spend the required FP
 * before you make your attack or defense roll", so the FP goes out when the
 * option is chosen, not when it pays off. Mighty Blows is bought at the attack
 * and collected at the damage roll, which is why it needs remembering at all.
 *
 * Out of combat it is a Will roll instead, which is the other half of this
 * file: the same fatigue, but earned rather than simply bought.
 */

import { SYSTEM_ID } from "./constants.js";
import { applyFatigue } from "./fatigue.js";
import { EXTRA_EFFORT_FP, extraEffortModifier, extraEffortTarget } from "../rules/extra-effort.js";
import { resolveSuccess } from "../rules/success.js";

const EFFORT_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/extra-effort.hbs`;

/** Where a bought-but-unspent Mighty Blows is kept on the attacker. */
export const MIGHTY_BLOWS_FLAG = "mightyBlows";

/**
 * Takes FP off an actor for an extra-effort option.
 *
 * Returns false when they cannot pay, in which case nothing is spent and the
 * option must not be applied. Fatigue can be pushed below zero in GURPS, at the
 * price of hit points and a HT roll to do anything at all (p. 426), and the
 * system does keep that chart -- but extra effort is paid before you know
 * whether it worked, so buying it with hit points is a decision worth making
 * deliberately rather than one a button press makes for you.
 */
export async function spendFatigue(actor: any, points: number, what: string): Promise<boolean> {
  if (points <= 0) return true;
  if (!actor?.isOwner) return false;

  const current = Number(actor.system?.fp?.value);
  if (!Number.isFinite(current) || current < points) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.ExtraEffort.NoFatigue", { what, cost: points }),
    );
    return false;
  }

  await applyFatigue(actor, points);
  return true;
}

/** Remembers a Mighty Blows bought this turn, for the damage roll to collect. */
export async function recordMightyBlows(actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  await actor.setFlag(SYSTEM_ID, MIGHTY_BLOWS_FLAG, true);
}

/**
 * Collects a Mighty Blows bought before the attack roll.
 *
 * Spent by the next damage roll whatever it is, the way the feint is spent by
 * the next attack: it was bought for one blow, and this is that blow.
 */
export async function consumeMightyBlows(actor: any): Promise<boolean> {
  if (!actor?.getFlag?.(SYSTEM_ID, MIGHTY_BLOWS_FLAG)) return false;
  if (actor.isOwner) await actor.unsetFlag(SYSTEM_ID, MIGHTY_BLOWS_FLAG);
  return true;
}

/**
 * Rolls an attempt at extra effort outside combat (p. 356).
 *
 * "Extra effort costs FP whether you succeed or fail", so the point is paid on
 * every outcome but one: "on a critical success, you do not have to pay FP".
 * A critical failure costs hit points instead of nothing -- "you lose HP equal
 * to the FP spent on the attempt" -- and the task fails outright. The book
 * counts "any FP the task would have cost without extra effort" into that,
 * which is a cost only the GM knows, so only the effort's own point is taken.
 *
 * The natural 18, which also calls for a HT roll against a temporary
 * disadvantage "appropriate to the task", is named on the card and left to the
 * GM: which disadvantage depends on what was being attempted.
 */
export async function rollExtraEffort(options: {
  actor: any;
  /** How much more is being asked for, as a percentage. */
  percentIncrease: number;
  /** The GM's +5 for fear, anger or concern for a loved one. */
  motivated: boolean;
}): Promise<boolean> {
  const { actor, percentIncrease, motivated } = options;

  const will = Number(actor?.system?.derived?.will) || 10;
  const fp = actor?.system?.fp ?? { value: 0, max: 0 };
  const missingFp = Math.max(0, (Number(fp.max) || 0) - (Number(fp.value) || 0));

  const effective = extraEffortTarget({ will, percentIncrease, missingFp, motivated });

  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice = roll.dice?.[0]?.results?.map((r: { result: number }) => r.result) ?? [];
  const outcome = resolveSuccess(roll.total, effective, dice);

  // A critical success is the one outcome that costs nothing at all.
  const cost = outcome.criticalSuccess ? 0 : EXTRA_EFFORT_FP;
  if (cost > 0 && actor?.isOwner) {
    // "A critical failure means you lose HP equal to the FP spent on the
    // attempt ... and the task fails automatically!" -- both losses in one
    // write, so the sheet moves once.
    const hp = Number(actor.system?.hp?.value) || 0;
    await actor.update({
      "system.fp.value": (Number(fp.value) || 0) - cost,
      ...(outcome.criticalFailure ? { "system.hp.value": hp - cost } : {}),
    });
  }

  const content = await foundry.applications.handlebars.renderTemplate(EFFORT_TEMPLATE, {
    name: String(actor?.name ?? ""),
    percentIncrease,
    will,
    penalty: extraEffortModifier(percentIncrease),
    missingFp,
    motivated,
    effective,
    dice,
    roll: roll.total,
    success: outcome.success,
    criticalSuccess: outcome.criticalSuccess,
    criticalFailure: outcome.criticalFailure,
    cost,
    // A natural 18 is worse again, and what it costs is the GM's to decide.
    naturalEighteen: roll.total === 18,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
  });

  return outcome.success;
}
