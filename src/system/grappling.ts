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
import { attributeOf } from "./attributes.js";
import { PROCEDURE_HOOKS, grappleMoveRefusal, grappleMoveRules } from "./procedure-extensions.js";
import { callCombatHook } from "./combat-extensions.js";
import type { ContestSide } from "./contest.js";

type GrappleMove = "breakFree" | "takedown" | "pin" | "choke";
type ContestResult = { outcome: "first" | "second" | "tie"; marginOfVictory: number };

/**
 * Rolls one of the grapple contests, after the modules have had their say
 * (API 1.34.0): lines on either side, what either side rolls against, or the
 * winner outright for a fighter who can't resist at all.
 */
async function grappleContest(options: {
  move: GrappleMove;
  actor: any;
  foe: any;
  grapple: Grapple;
  label: string;
  first: ContestSide;
  second: ContestSide;
  regular?: boolean;
}): Promise<ContestResult> {
  const { move, actor, foe, grapple, label } = options;
  const lines = (list: unknown) => (Array.isArray(list) ? list : []).filter((m: any) => typeof m?.label === "string" && typeof m.value === "number" && Number.isFinite(m.value));
  const hooked = callCombatHook(PROCEDURE_HOOKS.grappleContest, {
    move,
    actor,
    foe,
    grapple: { ...grapple },
    first: { base: options.first.base, modifiers: [...(options.first.modifiers ?? [])] },
    second: { base: options.second.base, modifiers: [...(options.second.modifiers ?? [])] },
    winner: null as "first" | "second" | null,
  });
  const side = (given: ContestSide, changed: { base: unknown; modifiers: unknown }): ContestSide => {
    const modifiers = lines(changed.modifiers);
    return { ...given, base: Number.isFinite(Number(changed.base)) ? Number(changed.base) : given.base, ...(modifiers.length ? { modifiers } : { modifiers: [] }) };
  };
  const first = side(options.first, hooked.first);
  const second = side(options.second, hooked.second);

  let result: ContestResult;
  if (hooked.winner === "first" || hooked.winner === "second") {
    const winner = hooked.winner === "first" ? actor : foe;
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${foundry.utils.escapeHTML(label)}</span></div>
        <div class="gc-result">${foundry.utils.escapeHTML(game.i18n.format("GWORLD.Grapple.Decided", { winner: String(winner?.name ?? "") }))}</div></div>`,
    });
    result = { outcome: hooked.winner, marginOfVictory: 0 };
  } else if (options.regular) {
    const regular = await rollRegularContest({ label, first, second });
    result = { outcome: regular.outcome ?? "tie", marginOfVictory: 0 };
  } else {
    const quick = await rollQuickContest({ label, first, second, tags: ["grapple", move] });
    result = { outcome: quick.outcome, marginOfVictory: quick.marginOfVictory };
  }
  return result;
}

/** Tells the modules how a grapple contest went, once its result is applied (API 1.34.0). */
function afterGrappleContest(move: GrappleMove, actor: any, foe: any, grapple: Grapple, result: ContestResult): void {
  callCombatHook(PROCEDURE_HOOKS.afterGrappleContest, { move, actor, foe, grapple: { ...grapple }, outcome: result.outcome, marginOfVictory: result.marginOfVictory });
}

/**
 * Changes a grapple on both fighters (API 1.34.0): the hands on it, whether it
 * is a pin, and where it holds. The pinned condition follows.
 */
export async function updateGrapple(actor: any, patch: { hands?: number; pinned?: boolean; hitLocation?: string }, foe?: any): Promise<boolean> {
  const mine = grappleOf(actor, foe);
  if (!mine) return false;
  const other = await foeOf(mine);
  const theirs = grappleOf(other, actor);
  const next = (g: Grapple): Grapple => ({
    ...g,
    ...(patch.hands !== undefined && Number.isFinite(Number(patch.hands)) ? { hands: Math.max(1, Math.floor(Number(patch.hands))) } : {}),
    ...(typeof patch.pinned === "boolean" ? { pinned: patch.pinned } : {}),
    ...(typeof patch.hitLocation === "string" && patch.hitLocation ? { hitLocation: patch.hitLocation } : {}),
  });
  await writeGrapples(actor, grapplesOf(actor).map((g) => (g.foe === mine.foe ? next(g) : g)));
  if (theirs) await writeGrapples(other, grapplesOf(other).map((g) => (g.foe === theirs.foe ? next(g) : g)));
  return true;
}

/** Whether a module's rules refuse a grapple move, saying so when they do. */
function refusedMove(actor: any, foe: any, move: "breakFree" | "takedown" | "pin" | "choke"): boolean {
  const refusal = grappleMoveRefusal(actor, foe, move);
  if (refusal) ui.notifications?.warn(refusal);
  return refusal !== null;
}

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

/** Where every grapple is recorded, on each side of them (since 1.45.0). */
export const GRAPPLES_FLAG = "grapples";

/**
 * Every grapple this actor is in, the oldest first.
 *
 * A fighter can hold one foe and be held by another, or grab two at once
 * (sargas79/GWorldVTT#370). A world recorded before 1.45.0 has the one grapple
 * under its own flag, which is read here as a list of one.
 */
export function grapplesOf(actor: any): Grapple[] {
  const list = actor?.getFlag?.(SYSTEM_ID, GRAPPLES_FLAG);
  if (Array.isArray(list)) return list.filter((grapple: any) => typeof grapple?.foe === "string" && grapple.foe);
  const one = actor?.getFlag?.(SYSTEM_ID, GRAPPLE_FLAG) as Grapple | undefined;
  return one?.foe ? [one] : [];
}

/** The uuid a foe is named by, whether given as the actor or as the uuid itself. */
function uuidOf(foe: any): string {
  return typeof foe === "string" ? foe : String(foe?.uuid ?? "");
}

/**
 * One grapple this actor is in: the one against `foe`, or the first of them
 * where no foe is named.
 */
export function grappleOf(actor: any, foe?: any): Grapple | null {
  const list = grapplesOf(actor);
  if (foe === undefined || foe === null) return list[0] ?? null;
  const uuid = uuidOf(foe);
  return list.find((grapple) => grapple.foe === uuid) ?? null;
}

/**
 * Writes a fighter's grapples, and the conditions that follow from them.
 *
 * The single flag is kept as the first of them: a world, a macro or a module
 * that reads it sees what it always saw while a fighter is in one grapple.
 */
async function writeGrapples(actor: any, list: Grapple[]): Promise<void> {
  if (!actor?.isOwner) return;
  if (list.length > 0) await actor.setFlag(SYSTEM_ID, GRAPPLES_FLAG, list);
  else if (actor.getFlag?.(SYSTEM_ID, GRAPPLES_FLAG)) await actor.unsetFlag(SYSTEM_ID, GRAPPLES_FLAG);

  if (list[0]) await actor.setFlag(SYSTEM_ID, GRAPPLE_FLAG, list[0]);
  else if (actor.getFlag?.(SYSTEM_ID, GRAPPLE_FLAG)) await actor.unsetFlag(SYSTEM_ID, GRAPPLE_FLAG);

  await setCondition(actor, "grappling", list.some((grapple) => grapple.holding));
  await setCondition(actor, "grappled", list.some((grapple) => !grapple.holding));
  await setCondition(actor, "pinned", list.some((grapple) => !grapple.holding && grapple.pinned));
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

  // A grapple on a foe already held replaces that one; another foe is another
  // grapple beside it (since 1.45.0).
  const mine = grapplesOf(grappler).filter((grapple) => grapple.foe !== String(victim.uuid));
  await writeGrapples(grappler, [...mine, {
    foe: String(victim.uuid),
    holding: true,
    hands,
    pinned: false,
    hitLocation,
  } satisfies Grapple]);

  const theirs = grapplesOf(victim).filter((grapple) => grapple.foe !== String(grappler.uuid));
  await writeGrapples(victim, [...theirs, {
    foe: String(grappler.uuid),
    holding: false,
    hands,
    pinned: false,
    hitLocation,
  } satisfies Grapple]);
}

/**
 * Lets go, on both sides: of one foe, or of everybody where none is named.
 */
export async function endGrapple(actor: any, foe?: any): Promise<void> {
  const uuid = foe === undefined || foe === null ? null : uuidOf(foe);
  const ending = grapplesOf(actor).filter((grapple) => uuid === null || grapple.foe === uuid);
  if (ending.length === 0) return;

  await writeGrapples(actor, grapplesOf(actor).filter((grapple) => !ending.includes(grapple)));
  for (const grapple of ending) {
    const other = await foeOf(grapple);
    if (!other) continue;
    await writeGrapples(other, grapplesOf(other).filter((theirs) => theirs.foe !== String(actor?.uuid ?? "")));
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
  const skill = grapplingSkill(actor);
  return {
    strength: attributeOf(actor, "ST"),
    dexterity: attributeOf(actor, "DX"),
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
export async function rollBreakFree(options: { actor: any; foe?: any }): Promise<boolean> {
  const { actor } = options;
  const grapple = grappleOf(actor, options.foe);
  if (!grapple || grapple.holding) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.NotGrappled"));
    return false;
  }

  const foe = await foeOf(grapple);
  if (!foe) return false;
  if (refusedMove(actor, foe, "breakFree")) return false;

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

  const result = await grappleContest({
    move: "breakFree",
    actor,
    foe,
    grapple,
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
    afterGrappleContest("breakFree", actor, foe, grapple, result);
    return true;
  }

  ui.notifications?.info(
    game.i18n.format("GWORLD.Grapple.StillHeld", { seconds: grip.secondsBetweenAttempts }),
  );
  afterGrappleContest("breakFree", actor, foe, grapple, result);
  return false;
}

/**
 * Tries to bear a standing foe to the ground (p. 370).
 *
 * "If you lose, you suffer the same effects!" -- which is what makes it worth
 * rolling rather than simply declaring.
 */
export async function rollTakedown(options: { actor: any; foe?: any }): Promise<void> {
  const { actor } = options;
  const grapple = grappleOf(actor, options.foe);
  if (!grapple) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.NotInOne"));
    return;
  }

  const foe = await foeOf(grapple);
  if (!foe) return;
  if (refusedMove(actor, foe, "takedown")) return;

  const mine = scoresOf(actor);
  const theirs = scoresOf(foe);
  const posture = String(actor.system?.posture ?? "standing") as never;
  const modifier = takedownModifier(posture);

  const result = await grappleContest({
    move: "takedown",
    actor,
    foe,
    grapple,
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
  if (loser?.isOwner) {
    await loser.update({ "system.posture": "lying" });
    await setCondition(loser, "prone", true);
  }
  afterGrappleContest("takedown", actor, foe, grapple, result);
}

/**
 * Pins a foe who is already on the ground (p. 370).
 *
 * A Regular Contest of ST, which is the slow kind: both sides keep at it until
 * one succeeds where the other fails.
 */
export async function rollPin(options: { actor: any; foe?: any }): Promise<void> {
  const { actor } = options;
  const grapple = grappleOf(actor, options.foe);
  if (!grapple?.holding) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.MustBeHolding"));
    return;
  }

  const foe = await foeOf(grapple);
  if (!foe) return;
  const rules = grappleMoveRules(actor, foe, "pin");
  if (rules.refusal) {
    ui.notifications?.warn(rules.refusal);
    return;
  }

  // "You may only attempt a pin if your foe is on the ground and you are
  // grappling his torso" -- unless a module's rules waive it (API 1.35.0).
  if (!rules.waiveRequirements && (String(foe.system?.posture ?? "standing") === "standing" || grapple.hitLocation !== "torso")) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.PinRequires"));
    return;
  }

  const modifier = pinModifier({
    sizeModifier: Number(actor.system?.sm) || 0,
    foeSizeModifier: Number(foe.system?.sm) || 0,
    freeHands: Math.max(0, 2 - grapple.hands),
    foeFreeHands: 2,
  });

  const result = await grappleContest({
    move: "pin",
    actor,
    foe,
    grapple,
    regular: true,
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

  if (result.outcome === "first") {
    await setPinned(actor, grapple, true);
    ui.notifications?.info(game.i18n.format("GWORLD.Grapple.Pinned", { foe: String(foe.name ?? "") }));
  }
  afterGrappleContest("pin", actor, foe, grapple, result);
}

/**
 * Chokes a foe grappled by the neck (p. 370).
 *
 * "Roll a Quick Contest: your ST vs. the higher of your foe's ST or HT... If you
 * win, your foe takes crushing damage equal to your margin of victory."
 */
export async function rollChoke(options: { actor: any; foe?: any }): Promise<void> {
  const { actor } = options;
  const grapple = grappleOf(actor, options.foe);
  if (!grapple?.holding) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.MustBeHolding"));
    return;
  }

  const foe = await foeOf(grapple);
  if (!foe) return;
  if (refusedMove(actor, foe, "choke")) return;

  // Either a hold on the neck, or a bigger fighter squeezing the torso.
  const aroundTorso = grapple.hitLocation !== "neck";
  const modifier = chokeModifier({ hands: grapple.hands, aroundTorso });

  const resist = Math.max(attributeOf(foe, "ST"), attributeOf(foe, "HT"));

  const result = await grappleContest({
    move: "choke",
    actor,
    foe,
    grapple,
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

  const damage = result.outcome === "first" ? chokeDamage(result.marginOfVictory) : 0;
  if (damage > 0) {
    await applyDamageToActor(foe, {
      basicDamage: damage,
      type: "cr",
      armorDivisor: 1,
      // The neck's own wounding multiplier is applied by the pipeline, as it is
      // for any blow that lands there.
      hitLocation: aroundTorso ? "torso" : "neck",
    });
  }
  afterGrappleContest("choke", actor, foe, grapple, result);
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

  return preventsMovement(attributeOf(foe, "ST"), attributeOf(actor, "ST"));
}
