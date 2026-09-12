/**
 * Drinking on a sheet (GURPS Basic Set: Campaigns pp. 439-441).
 *
 * An hour of drinking is one roll, so this is called once per hour of game time
 * rather than run on a clock. What it keeps between calls is how far down the
 * track somebody is and how much they have had all told -- the second because
 * sobering up takes half an hour per drink, and nobody remembers by then.
 */

import { SYSTEM_ID } from "./constants.js";
import { healthRollScore } from "./attributes.js";
import { setCondition } from "./conditions.js";
import {
  PINK_ELEPHANTS_MODIFIER,
  drinkModifier,
  drinkResult,
  hangover,
  hangoverModifier,
  mustRollForDrink,
  risksHangover,
  soberUp,
  soberingHours,
  type Intoxication,
} from "../rules/intoxication.js";
import { resolveSuccess } from "../rules/success.js";

const DRINK_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/drink.hbs`;

/** Where the evening is recorded. */
export const DRINK_FLAG = "drink";

/** What somebody has had, and where it has got them. */
export interface DrinkingState {
  level: Intoxication;
  /** Drinks consumed all told, which sets how long sobering up takes. */
  total: number;
}

/** How the evening is going. */
export function drinkingState(actor: any): DrinkingState {
  const stored = actor?.getFlag?.(SYSTEM_ID, DRINK_FLAG) as Partial<DrinkingState> | undefined;
  return {
    level: (stored?.level as Intoxication) ?? "sober",
    total: Number(stored?.total) || 0,
  };
}

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
  const content = await foundry.applications.handlebars.renderTemplate(DRINK_TEMPLATE, {
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

/** Writes the state, clearing the flag once somebody is sober and empty. */
async function store(actor: any, state: DrinkingState): Promise<void> {
  if (state.level === "sober" && state.total === 0) {
    if (actor.getFlag?.(SYSTEM_ID, DRINK_FLAG) !== undefined) {
      await actor.unsetFlag(SYSTEM_ID, DRINK_FLAG);
    }
    return;
  }
  await actor.setFlag(SYSTEM_ID, DRINK_FLAG, state);
}

/**
 * The unconscious condition follows the track.
 *
 * A drunken stupor and a coma are both being out cold, and the token should say
 * so. Coming round again is `soberUpRoll`, which walks the same track back.
 */
async function syncCondition(actor: any, level: Intoxication): Promise<void> {
  await setCondition(actor, "unconscious", level === "unconscious" || level === "coma");
}

/**
 * An hour of drinking (p. 439).
 *
 * "Roll against the higher of HT or Carousing" -- both of which are on the
 * sheet, so neither is asked for. The extra rolls the failure calls for, for
 * pink elephants and for the Heaves, are made here too: they are consequences
 * of this roll rather than separate decisions.
 */
export async function drinkForAnHour(options: {
  actor: any;
  drinks: number;
  emptyStomach?: boolean;
  recentlyEaten?: boolean;
  tolerance?: boolean;
  intolerance?: boolean;
}): Promise<Intoxication> {
  const { actor } = options;
  if (!mayChange(actor)) return drinkingState(actor).level;

  const state = drinkingState(actor);
  const drinks = Math.max(0, options.drinks);
  const strength = Number(actor.system?.attributes?.ST) || 10;

  const after: DrinkingState = { level: state.level, total: state.total + drinks };

  // "At the end of any hour during which you consume more than ST/4 drinks,
  // roll" -- so a modest hour is recorded and costs nothing.
  if (!mustRollForDrink({ strength, drinks })) {
    await store(actor, after);
    await post(actor, {
      drinks,
      total: after.total,
      level: after.level,
      levelLabel: game.i18n.localize(`GWORLD.Drink.Level_${after.level}`),
      steady: true,
    });
    return after.level;
  }

  const health = healthRollScore(actor);
  const carousing = Number(actor.system?.derived?.recovery?.carousing) || 0;
  const base = Math.max(health, carousing);

  const modifier = drinkModifier({
    strength,
    drinks,
    ...(options.emptyStomach === undefined ? {} : { emptyStomach: options.emptyStomach }),
    ...(options.recentlyEaten === undefined ? {} : { recentlyEaten: options.recentlyEaten }),
    ...(options.tolerance === undefined ? {} : { tolerance: options.tolerance }),
    ...(options.intolerance === undefined ? {} : { intolerance: options.intolerance }),
  });
  const target = base + modifier;

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  const result = drinkResult({
    level: state.level,
    success: outcome.success,
    criticalFailure: outcome.criticalFailure,
    effectiveTarget: target,
  });

  const rolls: any[] = [roll];

  // "If you are drunk, make one additional HT+4 roll. On a failure, you are
  // also hallucinating."
  let hallucinating = false;
  if (result.pinkElephantsRoll) {
    const elephants = new Roll("3d6");
    await elephants.evaluate();
    rolls.push(elephants);
    hallucinating = !resolveSuccess(
      elephants.total,
      health + PINK_ELEPHANTS_MODIFIER,
      dieResults(elephants),
    ).success;
  }

  // "On a success, you vomit up the alcohol instead of passing out... On a
  // critical failure, however, you pass out and then retch."
  let retching = false;
  let choking = false;
  let level = result.level;
  if (result.heavesRoll) {
    const heaves = new Roll("3d6");
    await heaves.evaluate();
    rolls.push(heaves);
    const kept = resolveSuccess(heaves.total, health, dieResults(heaves));
    if (kept.success) {
      retching = true;
      level = state.level;
    } else if (kept.criticalFailure) {
      choking = true;
    }
  }

  after.level = level;
  await store(actor, after);
  await syncCondition(actor, level);

  await post(actor, {
    drinks,
    total: after.total,
    target,
    modifier,
    dice: dieResults(roll),
    roll: roll.total,
    success: outcome.success,
    criticalFailure: outcome.criticalFailure,
    steps: result.steps,
    level,
    levelLabel: game.i18n.localize(`GWORLD.Drink.Level_${level}`),
    hallucinating,
    retching,
    choking,
    soberingHours: soberingHours(after.total),
    rolls,
  });

  return level;
}

/**
 * A roll towards sober (p. 439).
 *
 * Made once every half-hour-per-drink; how many of those have passed is the
 * GM's to say, which is why this rolls one rather than running a clock.
 */
export async function soberUpRoll(options: { actor: any; modifier: number }): Promise<Intoxication> {
  const { actor } = options;
  if (!mayChange(actor)) return drinkingState(actor).level;

  const state = drinkingState(actor);
  if (state.level === "sober") return "sober";

  const health = healthRollScore(actor);
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, health + options.modifier, dieResults(roll));

  // "Exception: to recover from a coma, you need medical help!" -- the roll is
  // still shown, so the table can see it was made, but it moves nobody.
  const level = outcome.success ? soberUp(state.level) : state.level;

  await store(actor, { level, total: level === "sober" ? 0 : state.total });
  await syncCondition(actor, level);

  await post(actor, {
    sobering: true,
    target: health + options.modifier,
    dice: dieResults(roll),
    roll: roll.total,
    success: outcome.success,
    level,
    levelLabel: game.i18n.localize(`GWORLD.Drink.Level_${level}`),
    stuck: outcome.success && state.level === "coma",
    hours: soberingHours(state.total),
    rolls: [roll],
  });

  return level;
}

/**
 * The roll on stopping, for whether tomorrow hurts (p. 439).
 *
 * Made when the drinking stops rather than when the hangover starts, because
 * the state it depends on is how drunk somebody was at the time.
 */
export async function hangoverRoll(options: { actor: any; modifier: number }): Promise<boolean> {
  const { actor } = options;
  if (!mayChange(actor)) return false;

  const state = drinkingState(actor);
  if (!risksHangover(state.level)) return false;

  const health = healthRollScore(actor);
  const target = health + hangoverModifier(state.level) + options.modifier;

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  const delay = new Roll("1d6");
  if (!outcome.success) await delay.evaluate();

  const suffering = outcome.success
    ? null
    : hangover({ delayRoll: delay.total ?? 1, marginOfFailure: target - roll.total });

  await post(actor, {
    hangover: true,
    target,
    dice: dieResults(roll),
    roll: roll.total,
    success: outcome.success,
    level: state.level,
    levelLabel: game.i18n.localize(`GWORLD.Drink.Level_${state.level}`),
    ...(suffering ?? {}),
    rolls: outcome.success ? [roll] : [roll, delay],
  });

  return !outcome.success;
}
