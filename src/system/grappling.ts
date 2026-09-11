/**
 * Holding on to somebody (GURPS Basic Set: Campaigns pp. 370-371).
 *
 * A grapple is a state rather than an event: from the moment it lands, both
 * fighters are in it until somebody breaks free, and almost everything either
 * of them can do is decided by that. So the grapple is recorded on both of
 * them -- who is holding whom, with how many hands, and whether it has become
 * a pin -- and the actions that follow read it.
 *
 * The contests themselves live in `src/rules/grappling.ts`; this is the half
 * that knows who is in the fight.
 */

import { SYSTEM_ID } from "./constants.js";
import { setCondition } from "./conditions.js";
import { rollQuickContest, rollRegularContest } from "./contest.js";
import { applyDamageToActor } from "./damage.js";
import {
  GRAPPLING_SKILLS,
  breakFree,
  chokeDamage,
  chokeModifier,
  pinModifier,
  preventsMovement,
  takedownModifier,
  takedownScore,
} from "../rules/grappling.js";

/** Where a grapple is recorded on each side of it. */
export const GRAPPLE_FLAG = "grapple";

/** A grapple, as both fighters carry it. */
export interface Grapple {
  /** UUID of the other person in it. */
  foe: string;
  /** True for the one doing the holding. */
  holding: boolean;
  /** Hands on them. One is a weaker hold than two. */
  hands: number;
  /** True once the victim has been pinned. */
  pinned: boolean;
  /** Where they were grabbed; the torso unless somebody aimed. */
  hitLocation: string;
}

/** The grapple this actor is in, or null when they are in none. */
export function grappleOf(actor: any): Grapple | null {
  const flag = actor?.getFlag?.(SYSTEM_ID, GRAPPLE_FLAG) as Grapple | undefined;
  return flag?.foe ? flag : null;
}

/** Reads the other side of a grapple off the canvas. */
async function foeOf(grapple: Grapple): Promise<any> {
  return fromUuid(grapple.foe).catch(() => null);
}

/**
 * Records a grapple on both fighters.
 *
 * On both, because either of them may be the one whose sheet is open when the
 * next thing happens, and a grapple only one of them knows about is a grapple
 * that half the table cannot act on.
 */
export async function beginGrapple(options: {
  grappler: any;
  victim: any;
  hands: number;
  hitLocation?: string;
}): Promise<void> {
  const { grappler, victim, hands } = options;
  const hitLocation = options.hitLocation ?? "torso";

  if (grappler?.isOwner) {
    await grappler.setFlag(SYSTEM_ID, GRAPPLE_FLAG, {
      foe: String(victim.uuid),
      holding: true,
      hands,
      pinned: false,
      hitLocation,
    } satisfies Grapple);
    await setCondition(grappler, "grappling", true);
  }

  if (victim?.isOwner) {
    await victim.setFlag(SYSTEM_ID, GRAPPLE_FLAG, {
      foe: String(grappler.uuid),
      holding: false,
      hands,
      pinned: false,
      hitLocation,
    } satisfies Grapple);
    await setCondition(victim, "grappled", true);
  }
}

/** Lets go, on both sides. */
export async function endGrapple(actor: any): Promise<void> {
  const grapple = grappleOf(actor);
  if (!grapple) return;

  const foe = await foeOf(grapple);

  for (const [who, condition] of [
    [actor, grapple.holding ? "grappling" : "grappled"],
    [foe, grapple.holding ? "grappled" : "grappling"],
  ] as const) {
    if (!who?.isOwner) continue;
    if (who.getFlag?.(SYSTEM_ID, GRAPPLE_FLAG)) await who.unsetFlag(SYSTEM_ID, GRAPPLE_FLAG);
    await setCondition(who, condition, false);
    await setCondition(who, "pinned", false);
  }
}

/** Marks a grapple as a pin, on both sides. */
async function setPinned(actor: any, grapple: Grapple, pinned: boolean): Promise<void> {
  const foe = await foeOf(grapple);

  if (actor?.isOwner) {
    await actor.setFlag(SYSTEM_ID, GRAPPLE_FLAG, { ...grapple, pinned });
  }
  const theirs = grappleOf(foe);
  if (foe?.isOwner && theirs) {
    await foe.setFlag(SYSTEM_ID, GRAPPLE_FLAG, { ...theirs, pinned });
    await setCondition(foe, "pinned", pinned);
  }
}

/** The best grappling skill this character has, or null for none of them. */
export function grapplingSkill(actor: any): { name: string; level: number } | null {
  let best: { name: string; level: number } | null = null;

  for (const item of actor?.items ?? []) {
    if (item?.type !== "skill") continue;
    const name = String(item.name ?? "");
    if (!GRAPPLING_SKILLS.some((skill) => name.toLowerCase() === skill.toLowerCase())) continue;

    const level = Number(item.system?.derived?.level);
    if (Number.isFinite(level) && (best === null || level > best.level)) best = { name, level };
  }

  return best;
}

/** ST, DX and the best grappling skill, which is what most of these contest. */
function scoresOf(actor: any) {
  const attributes = actor?.system?.attributes ?? {};
  const skill = grapplingSkill(actor);
  return {
    strength: Number(attributes.ST) || 10,
    dexterity: Number(attributes.DX) || 10,
    skill,
  };
}

/**
 * Tries to get loose (p. 371).
 *
 * A Quick Contest of ST, with the grappler's grip worth a good deal: +5 for two
 * hands, +10 when it has become a pin, and -4 when they have just been rattled.
 * An unconscious grappler is not holding on at all, so there is nothing to
 * contest.
 */
export async function rollBreakFree(options: { actor: any }): Promise<boolean> {
  const { actor } = options;
  const grapple = grappleOf(actor);
  if (!grapple || grapple.holding) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.NotGrappled"));
    return false;
  }

  const foe = await foeOf(grapple);
  if (!foe) return false;

  const grip = breakFree({
    hands: grapple.hands,
    pinned: grapple.pinned,
    grapplerStunned: foe.statuses?.has?.("stunned") === true,
    grapplerUnconscious: foe.statuses?.has?.("unconscious") === true,
  });

  if (grip.automatic) {
    await endGrapple(actor);
    ui.notifications?.info(
      game.i18n.format("GWORLD.Grapple.FreeAutomatically", { foe: String(foe.name ?? "") }),
    );
    return true;
  }

  const result = await rollQuickContest({
    label: game.i18n.format("GWORLD.Grapple.BreakFreeLabel", {
      victim: String(actor.name),
      foe: String(foe.name ?? ""),
    }),
    first: { actor, base: scoresOf(actor).strength, note: "ST" },
    second: {
      actor: foe,
      base: scoresOf(foe).strength,
      note: "ST",
      modifiers: [{ label: game.i18n.localize("GWORLD.Grapple.Grip"), value: grip.grapplerBonus }],
    },
  });

  if (result.outcome === "first") {
    await endGrapple(actor);
    // "If you successfully break free, you may immediately move one yard in any
    // direction" -- the yard is the player's to take.
    ui.notifications?.info(game.i18n.localize("GWORLD.Grapple.Free"));
    return true;
  }

  ui.notifications?.info(
    game.i18n.format("GWORLD.Grapple.StillHeld", { seconds: grip.secondsBetweenAttempts }),
  );
  return false;
}

/**
 * Tries to bear a standing foe to the ground (p. 370).
 *
 * "If you lose, you suffer the same effects!" -- which is what makes it worth
 * rolling rather than simply declaring.
 */
export async function rollTakedown(options: { actor: any }): Promise<void> {
  const { actor } = options;
  const grapple = grappleOf(actor);
  if (!grapple) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.NotInOne"));
    return;
  }

  const foe = await foeOf(grapple);
  if (!foe) return;

  const mine = scoresOf(actor);
  const theirs = scoresOf(foe);
  const posture = String(actor.system?.posture ?? "standing") as never;
  const modifier = takedownModifier(posture);

  const result = await rollQuickContest({
    label: game.i18n.format("GWORLD.Grapple.TakedownLabel", {
      attacker: String(actor.name),
      foe: String(foe.name ?? ""),
    }),
    first: {
      actor,
      base: takedownScore({ ...mine, grapplingSkill: mine.skill?.level ?? null }),
      note: mine.skill?.name ?? "ST/DX",
      ...(modifier !== 0
        ? { modifiers: [{ label: game.i18n.localize("GWORLD.Field.Posture"), value: modifier }] }
        : {}),
    },
    second: {
      actor: foe,
      base: takedownScore({ ...theirs, grapplingSkill: theirs.skill?.level ?? null }),
      note: theirs.skill?.name ?? "ST/DX",
    },
  });

  // "If you win, your victim falls down next to you... If you lose, you suffer
  // the same effects!" A tie does nothing at all.
  const loser = result.outcome === "first" ? foe : result.outcome === "second" ? actor : null;
  if (!loser?.isOwner) return;

  await loser.update({ "system.posture": "lying" });
  await setCondition(loser, "prone", true);
}

/**
 * Pins a foe who is already on the ground (p. 370).
 *
 * A Regular Contest of ST, which is the slow kind: both sides keep at it until
 * one succeeds where the other fails.
 */
export async function rollPin(options: { actor: any }): Promise<void> {
  const { actor } = options;
  const grapple = grappleOf(actor);
  if (!grapple?.holding) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.MustBeHolding"));
    return;
  }

  const foe = await foeOf(grapple);
  if (!foe) return;

  // "You may only attempt a pin if your foe is on the ground and you are
  // grappling his torso."
  if (String(foe.system?.posture ?? "standing") === "standing" || grapple.hitLocation !== "torso") {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.PinRequires"));
    return;
  }

  const modifier = pinModifier({
    sizeModifier: Number(actor.system?.sm) || 0,
    foeSizeModifier: Number(foe.system?.sm) || 0,
    freeHands: Math.max(0, 2 - grapple.hands),
    foeFreeHands: 2,
  });

  const result = await rollRegularContest({
    label: game.i18n.format("GWORLD.Grapple.PinLabel", {
      attacker: String(actor.name),
      foe: String(foe.name ?? ""),
    }),
    first: {
      actor,
      base: scoresOf(actor).strength,
      ...(modifier !== 0
        ? { modifiers: [{ label: game.i18n.localize("GWORLD.Grapple.Advantage"), value: modifier }] }
        : {}),
    },
    second: { actor: foe, base: scoresOf(foe).strength },
  });

  if (result.outcome !== "first") return;

  await setPinned(actor, grapple, true);
  ui.notifications?.info(game.i18n.format("GWORLD.Grapple.Pinned", { foe: String(foe.name ?? "") }));
}

/**
 * Chokes a foe grappled by the neck (p. 370).
 *
 * "Roll a Quick Contest: your ST vs. the higher of your foe's ST or HT... If you
 * win, your foe takes crushing damage equal to your margin of victory."
 */
export async function rollChoke(options: { actor: any }): Promise<void> {
  const { actor } = options;
  const grapple = grappleOf(actor);
  if (!grapple?.holding) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.MustBeHolding"));
    return;
  }

  const foe = await foeOf(grapple);
  if (!foe) return;

  // Either a hold on the neck, or a bigger fighter squeezing the torso.
  const aroundTorso = grapple.hitLocation !== "neck";
  const modifier = chokeModifier({ hands: grapple.hands, aroundTorso });

  const foeAttributes = foe.system?.attributes ?? {};
  const resist = Math.max(Number(foeAttributes.ST) || 10, Number(foeAttributes.HT) || 10);

  const result = await rollQuickContest({
    label: game.i18n.format("GWORLD.Grapple.ChokeLabel", {
      attacker: String(actor.name),
      foe: String(foe.name ?? ""),
    }),
    first: {
      actor,
      base: scoresOf(actor).strength,
      note: "ST",
      ...(modifier !== 0
        ? { modifiers: [{ label: game.i18n.localize("GWORLD.Grapple.Hold"), value: modifier }] }
        : {}),
    },
    second: { actor: foe, base: resist, note: "ST/HT" },
  });

  if (result.outcome !== "first") return;

  const damage = chokeDamage(result.marginOfVictory);
  if (damage <= 0) return;

  await applyDamageToActor(foe, {
    basicDamage: damage,
    type: "cr",
    armorDivisor: 1,
    // The neck's own wounding multiplier is applied by the pipeline, as it is
    // for any blow that lands there.
    hitLocation: aroundTorso ? "torso" : "neck",
  });
}

/**
 * Whether this character is currently held in a way that stops them walking off
 * (p. 370).
 */
export async function heldInPlace(actor: any): Promise<boolean> {
  const grapple = grappleOf(actor);
  if (!grapple || grapple.holding) return false;

  const foe = await foeOf(grapple);
  if (!foe) return false;

  return preventsMovement(
    Number(foe.system?.attributes?.ST) || 10,
    Number(actor.system?.attributes?.ST) || 10,
  );
}
