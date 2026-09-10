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
import { applyDamageToActor, type AppliedDamage, type IncomingDamage } from "./damage.js";
import { rollSuccess } from "./roll.js";
import { currentTargets } from "./targets.js";
import { blastAt } from "../rules/explosions.js";
import { HIT_LOCATION_ORDER, type HitLocation } from "../rules/hit-locations.js";
import type { DamageType } from "../rules/types.js";

const APPLIED_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/damage-applied.hbs`;

/** What `rollDamage` stored on the message. */
interface DamageFlag {
  basicDamage: number;
  damageType: DamageType;
  armorDivisor: number;
  label: string;
  explosive?: boolean;
  /** Dice the attack rolls, which is what sets the blast radius. */
  diceOfDamage?: number;
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

  // An explosion asks how far away the victim was. At zero they were struck
  // directly and take the listed damage; further out it falls off, and their
  // torso armour is what stands between them and it.
  const distance = document.createElement("input");
  distance.type = "number";
  distance.className = "gc-distance";
  distance.min = "0";
  distance.step = "1";
  distance.value = "0";
  distance.setAttribute("aria-label", game.i18n.localize("GWORLD.Chat.Distance"));
  distance.title = game.i18n.localize("GWORLD.Chat.Distance");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-apply-button";
  button.textContent = game.i18n.localize("GWORLD.Chat.ApplyDamage");

  button.addEventListener("click", () => {
    void applyFromCard(
      flag,
      select.value as HitLocation,
      flag.explosive ? Math.max(0, Number(distance.value) || 0) : 0,
    );
  });

  row.append(select);
  if (flag.explosive) row.append(distance);
  row.append(button);
  root.append(row);
}

/** Resolves the blow against every target and reports what it did. */
async function applyFromCard(
  flag: DamageFlag,
  hitLocation: HitLocation,
  distanceYards: number,
): Promise<void> {
  const targets = currentTargets();
  if (targets.length === 0) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Chat.NoTarget"));
    return;
  }

  // Outside a blast, distance means nothing and the blow lands as rolled.
  const blast = flag.explosive
    ? blastAt({
        rolledDamage: flag.basicDamage,
        distanceYards,
        diceOfDamage: flag.diceOfDamage ?? 0,
        armorDivisor: flag.armorDivisor,
      })
    : null;

  if (blast?.outOfRange) {
    ui.notifications?.info(game.i18n.localize("GWORLD.Chat.OutOfBlast"));
    return;
  }

  const damage: IncomingDamage = {
    basicDamage: blast ? blast.damage : flag.basicDamage,
    type: flag.damageType,
    armorDivisor: blast ? blast.armorDivisor : flag.armorDivisor,
    // "Use torso armor to determine DR against explosion damage" (p. 414),
    // whatever part of them happened to be nearest.
    hitLocation: blast && !blast.direct ? "torso" : hitLocation,
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
    label: blast && !blast.direct
      ? `${flag.label} - ${game.i18n.format("GWORLD.Chat.Collateral", { yards: distanceYards })}`
      : flag.label,
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

/** What an attack that connected recorded about who it was aimed at. */
interface DefenseFlag {
  attack: string;
  defenders: Array<{ uuid: string; name: string }>;
}

function defenseFlag(message: any): DefenseFlag | null {
  const flag = message?.getFlag?.(SYSTEM_ID, "defense");
  if (!flag || !Array.isArray(flag.defenders) || flag.defenders.length === 0) return null;
  return flag as DefenseFlag;
}

/**
 * The three active defenses, in the order the sheet lists them, with the
 * localization key each is labelled by.
 */
const DEFENSES = {
  dodge: "GWORLD.Secondary.Dodge",
  parry: "GWORLD.Secondary.Parry",
  block: "GWORLD.Secondary.Block",
} as const;
type DefenseKey = keyof typeof DEFENSES;

/**
 * Adds a defense control per defender to an attack that connected.
 *
 * Only defenders this user can roll for are offered, so a table of players does
 * not each see three buttons for everyone else's character. A defense that is
 * not available -- no shield to block with, a maneuver that forfeits the
 * defense entirely -- is left out rather than shown as a button that refuses.
 */
async function addDefenseControls(message: any, html: HTMLElement): Promise<void> {
  const flag = defenseFlag(message);
  if (!flag) return;

  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-defend]")) return;

  for (const entry of flag.defenders) {
    const defender: any = await fromUuid(entry.uuid).catch(() => null);
    if (!defender?.isOwner) continue;

    const defenses = defender.system?.derived?.defenses ?? {};
    const available = (Object.keys(DEFENSES) as DefenseKey[]).filter(
      (key) => defenses[key] != null,
    );
    if (available.length === 0) continue;

    const row = document.createElement("div");
    row.className = "gc-apply";
    row.dataset.gworldDefend = entry.uuid;

    const who = document.createElement("span");
    who.className = "gc-mod";
    who.textContent = String(defender.name ?? entry.name);
    row.append(who);

    for (const key of available) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-apply-button";
      const label = game.i18n.localize(DEFENSES[key]);
      button.textContent = `${label} ${defenses[key].total}`;
      button.addEventListener("click", () => {
        void rollDefense(defender, key, defenses[key].total, flag.attack);
      });
      row.append(button);
    }

    root.append(row);
  }
}

/** Rolls one active defense for one defender. */
async function rollDefense(
  defender: any,
  key: DefenseKey,
  total: number,
  attack: string,
): Promise<void> {
  const name = game.i18n.localize(DEFENSES[key]);
  await rollSuccess({
    actor: defender,
    base: total,
    label: game.i18n.format("GWORLD.Chat.DefendingAgainst", { defense: name, attack }),
    kind: "defense",
  });
}

/** Registers the chat hooks. Called once, at init. */
export function registerChatHooks(): void {
  Hooks.on("renderChatMessageHTML", (message: any, html: HTMLElement) => {
    addApplyControls(message, html);
    void addDefenseControls(message, html);
  });
}
