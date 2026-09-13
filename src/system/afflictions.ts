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
import { setCondition } from "./conditions.js";
import {
  AFFLICTIONS,
  afflictionEffect,
  type Affliction,
  type AfflictionEffect,
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

/** What a set of afflictions comes to, added up. */
export function totalAfflictionEffect(afflictions: readonly Affliction[]): AfflictionEffect {
  const total: AfflictionEffect = {
    severity: "irritating",
    dx: 0, iq: 0, selfControl: 0, defense: 0,
    helpless: false, fallsDown: false, forbids: [],
  };
  const forbids = new Set<string>();

  for (const key of afflictions) {
    const effect = afflictionEffect(key);
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
export function afflictionsOn(actor: any): {
  active: Affliction[];
  effect: AfflictionEffect;
} {
  const active = activeAfflictions(actor);
  return { active, effect: totalAfflictionEffect(active) };
}

/**
 * Puts an affliction on somebody, and says what it costs them.
 *
 * A condition that knocks the victim over lays them down as well, because a
 * paralysed man standing up is a token that disagrees with its own icon.
 */
export async function inflict(actor: any, affliction: Affliction): Promise<boolean> {
  if (!actor?.isOwner) return false;
  const effect = afflictionEffect(affliction);

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
