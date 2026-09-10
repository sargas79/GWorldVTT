/**
 * Chat card behaviour.
 *
 * A damage card is posted before anyone has decided who it hits, so applying it
 * is a second, later gesture. The card keeps the numbers it rolled in a flag and
 * offers a hit location and a button; pressing it resolves the blow against
 * whoever is targeted or selected and writes the result.
 *
 * Nothing is read back out of the rendered card. Parsing our own HTML to
 * recover a number we already had is how a display change quietly becomes a
 * rules change.
 */

import { SYSTEM_ID } from "./constants.js";
import {
  applyDamageToActor,
  damageTargets,
  type AppliedDamage,
  type IncomingDamage,
} from "./damage.js";
import { HIT_LOCATION_ORDER, type HitLocation } from "../rules/hit-locations.js";
import type { DamageType } from "../rules/types.js";

const APPLIED_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/damage-applied.hbs`;

/** What `rollDamage` stored on the message. */
interface DamageFlag {
  basicDamage: number;
  damageType: DamageType;
  armorDivisor: number;
  label: string;
}

function damageFlag(message: any): DamageFlag | null {
  const flag = message?.getFlag?.(SYSTEM_ID, "damage");
  if (!flag || typeof flag.basicDamage !== "number") return null;
  return flag as DamageFlag;
}

/**
 * Adds the apply controls to a damage card.
 *
 * They are built here rather than in the card's own template because the card
 * is rendered once, for everyone, while who may press the button depends on who
 * is looking: a player with no actor to change would get a control that only
 * ever fails.
 */
function addApplyControls(message: any, html: HTMLElement): void {
  const flag = damageFlag(message);
  if (!flag) return;
  if (!game.user?.isGM && !message.isAuthor) return;

  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-apply]")) return;

  const row = document.createElement("div");
  row.className = "gc-apply";
  row.dataset.gworldApply = "";

  const select = document.createElement("select");
  select.className = "gc-location";
  select.setAttribute("aria-label", game.i18n.localize("GWORLD.Chat.HitLocation"));
  for (const location of HIT_LOCATION_ORDER) {
    const option = document.createElement("option");
    option.value = location;
    option.textContent = game.i18n.localize(`GWORLD.HitLocation.${location}`);
    // The torso is what an unaimed blow hits, so it is what the card offers
    // until someone says otherwise.
    if (location === "torso") option.selected = true;
    select.append(option);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-apply-button";
  button.textContent = game.i18n.localize("GWORLD.Chat.ApplyDamage");

  button.addEventListener("click", () => {
    void applyFromCard(flag, select.value as HitLocation);
  });

  row.append(select, button);
  root.append(row);
}

/** Resolves the blow against every target and reports what it did. */
async function applyFromCard(flag: DamageFlag, hitLocation: HitLocation): Promise<void> {
  const targets = damageTargets();
  if (targets.length === 0) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Chat.NoTarget"));
    return;
  }

  const damage: IncomingDamage = {
    basicDamage: flag.basicDamage,
    type: flag.damageType,
    armorDivisor: flag.armorDivisor,
    hitLocation,
  };

  const applied: AppliedDamage[] = [];
  const refused: string[] = [];

  // One blow lands once. Two tokens can share an actor -- a linked token
  // dragged onto the scene twice -- and applying to each in turn would take the
  // damage off the same sheet twice over.
  const seen = new Set<string>();

  for (const token of targets) {
    const actor = token?.actor;
    if (!actor) continue;
    const key = String(actor.uuid ?? actor.id ?? "");
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);

    const result = await applyDamageToActor(actor, damage);
    // A null result is a permission refusal, which is worth naming: silently
    // skipping a target looks identical to a blow that did nothing.
    if (result) applied.push(result);
    else refused.push(String(actor.name ?? ""));
  }

  if (refused.length > 0) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Chat.CannotApply", { names: refused.join(", ") }),
    );
  }
  if (applied.length === 0) return;

  const content = await foundry.applications.handlebars.renderTemplate(APPLIED_TEMPLATE, {
    label: flag.label,
    damageType: flag.damageType,
    results: applied.map((result) => ({
      ...result,
      // Handlebars cannot compare, so anything the card branches on is decided
      // here where the rules are in view.
      stopped: result.injury === 0,
      pool: result.costsFatigue ? "FP" : "HP",
      shock: result.consequences.shock,
      hasShock: result.consequences.shock !== 0,
      majorWound: result.consequences.majorWound,
      deathCheck: result.consequences.deathCheckRequired,
      unconsciousCheck: result.consequences.consciousnessRollRequired,
      unconsciousPenalty: result.consequences.consciousnessRollPenalty,
      status: game.i18n.localize(`GWORLD.Health.${result.consequences.status}`),
      location: game.i18n.localize(`GWORLD.HitLocation.${result.hitLocation}`),
    })),
  });

  await ChatMessage.implementation.create({
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
  });
}

/** Registers the chat hooks. Called once, at init. */
export function registerChatHooks(): void {
  Hooks.on("renderChatMessageHTML", (message: any, html: HTMLElement) => {
    addApplyControls(message, html);
  });
}
