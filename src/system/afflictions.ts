/**
 * Afflictions on the sheet (GURPS Basic Set: Campaigns pp. 428-429).
 *
 * The system could roll to resist an affliction and then had nothing to say:
 * the card named the roll and left what happened to it to be remembered. Now
 * a failed roll puts a condition on the token, and the condition costs what
 * the book says it costs -- on every roll the character makes, without
 * anybody having to hold nine penalties in their head.
 *
 * The penalties ride the temporary-attribute machinery that was already here
 * (p. 421), so a rule that reads a lowered DX picks up a coughing fit without
 * being told about afflictions at all.
 */

import { SYSTEM_ID } from "./constants.js";
import { conditionLabel, setCondition } from "./conditions.js";
import { callCombatHook } from "./combat-extensions.js";
import { PROCEDURE_HOOKS, applyCondition, type ConditionApplication } from "./procedure-extensions.js";
import {
  AFFLICTIONS,
  PAIN_GRADES,
  afflictionEffect,
  agonyCost,
  canHaveHeartAttack,
  hallucinationOutcome,
  heartAttackMinutes,
  heartAttackSurvival,
  nauseaTarget,
  painAffliction,
  painPenalty,
  vomitingSeconds,
  type Affliction,
  type AfflictionEffect,
  type PainGrade,
  type PainThreshold,
} from "../rules/afflictions.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/affliction.hbs`;

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Affliction.${key}`, data) : game.i18n.localize(`GWORLD.Affliction.${key}`);

/**
 * The token condition each affliction sets.
 *
 * All but one share their name with the condition. Unconsciousness is the
 * exception: being knocked out by a gas and being knocked out by an axe leave
 * a character in the same state, and two icons for one condition would be two
 * things to remember to take off.
 */
export function conditionFor(affliction: Affliction): string {
  return affliction === "unconsciousness" ? "unconscious" : affliction;
}

/** Every affliction a character currently has. */
export function activeAfflictions(actor: any): Affliction[] {
  const statuses = actor?.statuses;
  if (!statuses?.has) return [];
  return AFFLICTIONS.filter((key) => statuses.has(conditionFor(key)));
}

/**
 * Where a character's pain threshold sits, read off the traits (p. 428).
 *
 * The trait effects already know both: High Pain Threshold is the one that
 * feels no shock, and Low Pain Threshold the one whose shock is doubled.
 */
export function painThresholdOf(
  traits: { noShock?: boolean; shockMultiplier?: number } | null | undefined,
): PainThreshold {
  if (traits?.noShock) return "high";
  if ((traits?.shockMultiplier ?? 1) > 1) return "low";
  return "normal";
}

/** The grade of pain an affliction is, or null where it is not pain. */
function painGradeOf(affliction: Affliction): PainGrade | null {
  return PAIN_GRADES.find((grade) => painAffliction(grade) === affliction) ?? null;
}

/**
 * What one affliction costs this particular character (pp. 428-429).
 *
 * The table's figures are for somebody with an ordinary pain threshold, and
 * the book adjusts two conditions for anybody else. Pain: "High Pain Threshold
 * halves these penalties; Low Pain Threshold doubles them." Agony: "High Pain
 * Threshold lets you overcome the agony enough to function, but at -3 to DX
 * and IQ" -- so for them it stops being incapacitating at all.
 */
export function afflictionEffectFor(
  affliction: Affliction,
  threshold: PainThreshold = "normal",
): AfflictionEffect {
  const effect = afflictionEffect(affliction);

  const grade = painGradeOf(affliction);
  if (grade) {
    const penalty = painPenalty(grade, threshold);
    return { ...effect, dx: penalty, iq: penalty, selfControl: penalty };
  }

  if (affliction === "agony") {
    const functionsAt = agonyCost({ minutes: 0, threshold }).functionsAt;
    if (functionsAt !== null) {
      return {
        ...effect,
        severity: "irritating",
        helpless: false,
        fallsDown: false,
        dx: functionsAt,
        iq: functionsAt,
      };
    }
  }

  return effect;
}

/** What a set of afflictions comes to, added up. */
export function totalAfflictionEffect(
  afflictions: readonly Affliction[],
  threshold: PainThreshold = "normal",
): AfflictionEffect {
  const total: AfflictionEffect = {
    severity: "irritating",
    dx: 0, iq: 0, selfControl: 0, defense: 0,
    helpless: false, fallsDown: false, forbids: [],
  };
  const forbids = new Set<string>();

  for (const key of afflictions) {
    const effect = afflictionEffectFor(key, threshold);
    // Penalties from separate afflictions stack: the book gives no rule for
    // taking the worst, and two different poisons are two different problems.
    total.dx += effect.dx;
    total.iq += effect.iq;
    total.selfControl += effect.selfControl;
    total.defense += effect.defense;
    total.helpless ||= effect.helpless;
    total.fallsDown ||= effect.fallsDown;
    for (const skill of effect.forbids) forbids.add(skill);
    if (effect.severity === "mortal") total.severity = "mortal";
    else if (effect.severity === "incapacitating" && total.severity === "irritating") {
      total.severity = "incapacitating";
    }
  }

  total.forbids = [...forbids];
  return total;
}

/** What the afflictions an actor has come to. */
export function afflictionsOn(actor: any, threshold: PainThreshold = "normal"): {
  active: Affliction[];
  effect: AfflictionEffect;
} {
  const active = activeAfflictions(actor);
  return { active, effect: totalAfflictionEffect(active, threshold) };
}

/** One further line of what an affliction means, for the card. */
export interface AfflictionNote {
  key: string;
  data?: Record<string, unknown>;
  grave?: boolean;
}

/**
 * What an affliction asks of the table beyond its penalties (pp. 428-429).
 *
 * Several conditions are not a number on a roll but a clock or a roll of their
 * own: agony drains fatigue by the minute, nausea is a HT roll whenever the
 * stomach is tested, a hallucination is a Will roll before acting, and a heart
 * attack is a countdown. The card says so, with this character's own figures.
 */
export function afflictionNotes(options: {
  affliction: Affliction;
  health: number;
  hitPoints: number;
  threshold: PainThreshold;
}): AfflictionNote[] {
  const { affliction, health, threshold } = options;
  const notes: AfflictionNote[] = [];

  if (affliction === "agony" || affliction === "ecstasy") {
    const ecstasy = affliction === "ecstasy";
    const cost = agonyCost({ minutes: 1, threshold, ecstasy });
    notes.push({ key: "AgonyDrain", data: { fatigue: cost.fatigue } });
    notes.push({ key: ecstasy ? "EcstasyInfluence" : "TortureBonus", data: { bonus: cost.torture } });
    if (cost.functionsAt !== null) {
      notes.push({ key: "AgonyFunctions", data: { penalty: cost.functionsAt } });
    }
  }

  if (affliction === "nauseated") {
    notes.push({ key: "NauseaRoll", data: { target: nauseaTarget({ health }) } });
    notes.push({ key: "Vomits", data: { seconds: vomitingSeconds(health) } });
  }

  if (affliction === "hallucinating") {
    // Every outcome of the Will roll, so the table need not look them up.
    const success = hallucinationOutcome({ success: true, criticalFailure: false });
    const failure = hallucinationOutcome({ success: false, criticalFailure: false });
    const freakOut = hallucinationOutcome({ success: false, criticalFailure: true });
    notes.push({
      key: "HallucinationRoll",
      data: {
        success: success.penalty,
        successFor: success.duration,
        failure: failure.penalty,
        failureFor: failure.duration,
        freakOutFor: freakOut.duration,
      },
    });
  }

  if (affliction === "heartAttack") {
    notes.push({
      key: "HeartAttackClock",
      data: { minutes: Math.round(heartAttackMinutes(health) * 10) / 10 },
      grave: true,
    });
    notes.push({ key: "HeartAttackSurvives", data: { hp: heartAttackSurvival(options.hitPoints) } });
  }

  return notes;
}

/**
 * The three kinds of Injury Tolerance that spare a body a heart attack, read
 * off its traits (p. 429). Injury Tolerance keeps its kind in its modifiers.
 */
export function injuryToleranceOf(actor: any): {
  diffuse: boolean;
  homogenous: boolean;
  noVitals: boolean;
} {
  const kinds = new Set<string>();
  for (const item of actor?.items ?? []) {
    if (item?.type !== "trait") continue;
    if (String(item.name ?? "").trim().toLowerCase() !== "injury tolerance") continue;
    for (const modifier of item.system?.modifiers ?? []) {
      kinds.add(String(modifier?.name ?? "").trim().toLowerCase());
    }
  }
  return {
    diffuse: kinds.has("diffuse"),
    homogenous: kinds.has("homogenous") || kinds.has("homogeneous"),
    noVitals: kinds.has("no vitals"),
  };
}

/**
 * Puts an affliction on somebody, and says what it costs them.
 *
 * A condition that knocks the victim over lays them down as well, because a
 * paralysed man standing up is a token that disagrees with its own icon.
 */
export async function inflict(actor: any, affliction: Affliction): Promise<boolean> {
  if (!actor?.isOwner) return false;

  // "Injury Tolerance (Diffuse, Homogenous, or No Vitals) grants immunity to
  // this affliction." A body with no heart to stop is not given a heart attack.
  if (affliction === "heartAttack" && !canHaveHeartAttack(injuryToleranceOf(actor))) {
    ui.notifications?.info(L("ImmuneToHeartAttack", { name: String(actor.name ?? "") }));
    return false;
  }

  const threshold = painThresholdOf(actor.system?.derived?.traitEffects);
  const effect = afflictionEffectFor(affliction, threshold);

  await setCondition(actor, conditionFor(affliction), true);
  if (effect.fallsDown && actor.system?.posture !== "lying") {
    await actor.update({ "system.posture": "lying" });
  }

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
      name: String(actor.name ?? ""),
      affliction: L(`Name.${affliction}`),
      what: L(`What.${affliction}`),
      severity: L(`Severity.${effect.severity}`),
      mortal: effect.severity === "mortal",
      helpless: effect.helpless,
      fallsDown: effect.fallsDown,
      modifiers: describe(effect),
      notes: afflictionNotes({
        affliction,
        health: Number(actor.system?.attributes?.HT ?? 10) || 10,
        hitPoints: Number(actor.system?.hp?.value ?? 0) || 0,
        threshold,
      }),
    }),
  });
  return true;
}

/** Takes an affliction off, for when it wears out. */
export async function relieve(actor: any, affliction: Affliction): Promise<void> {
  await setCondition(actor, conditionFor(affliction), false);
}

/** The penalties an affliction carries, as the card lists them. */
function describe(effect: AfflictionEffect): string[] {
  const out: string[] = [];
  const at = (value: number, label: string) => {
    if (value !== 0) out.push(`${value} ${game.i18n.localize(label)}`);
  };
  at(effect.dx, "GWORLD.Attribute.DXAbbr");
  at(effect.iq, "GWORLD.Attribute.IQAbbr");
  at(effect.selfControl, "GWORLD.Affliction.SelfControl");
  at(effect.defense, "GWORLD.Affliction.Defenses");
  for (const skill of effect.forbids) out.push(L("Forbids", { skill }));
  return out;
}

/**
 * What a failed resistance roll leaves behind (since 1.49.0).
 *
 * The Basic Set's own afflictions are the GM's to pick: "the GM should choose"
 * which of the three bands an attack inflicts, and the card asks rather than
 * guesses. A module whose book says exactly what its own weapon does has no
 * such choice to offer, so `gworld.afflictionEffect` lets it name the
 * condition instead -- or add a second one beside whatever the GM picks.
 *
 * Nothing is applied where no listener pushed anything, which is every
 * affliction the system carries on its own.
 */
export async function applyAfflictionEffects(context: {
  actor: any;
  attacker: any;
  item: any;
  mode: { index: number; ranged: boolean; derived?: string } | null;
  label: string;
  margin: number;
  /** The Fright Check table's entry, where the affliction was resisted with one (since 1.63.0). */
  frightEffect?: string | null;
  /** For an area attack, yards from its centre (since 1.63.0). */
  distance?: number;
}): Promise<string[]> {
  const fired = callCombatHook(PROCEDURE_HOOKS.afflictionEffect, {
    ...context,
    effects: [] as ConditionApplication[],
  });
  const effects = Array.isArray(fired.effects) ? fired.effects : [];
  const applied: string[] = [];
  for (const effect of effects) {
    const key = await applyCondition(context.actor, effect, {
      setSystemCondition: setCondition,
      systemConditionLabel: conditionLabel,
    });
    if (key) applied.push(key);
  }
  return applied;
}

