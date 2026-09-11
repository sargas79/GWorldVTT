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
import { isRuleOn } from "./optional-rules.js";
import { arcDefense, attackArc, retreatBonus, type Arc } from "../rules/tactical.js";
import { attackDirection, facingOf } from "./hex.js";
import { tacticalOnScene } from "./settings.js";
import { handednessOf, visionOf } from "./tactical-context.js";
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
  // torso armour is what stands between them and it. Nothing else needs the
  // field, so nothing else builds it.
  let distance: HTMLInputElement | null = null;
  if (flag.explosive && isRuleOn("explosions")) {
    distance = document.createElement("input");
    distance.type = "number";
    distance.className = "gc-distance";
    distance.min = "0";
    distance.step = "1";
    distance.value = "0";
    distance.setAttribute("aria-label", game.i18n.localize("GWORLD.Chat.Distance"));
    distance.title = game.i18n.localize("GWORLD.Chat.Distance");
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-apply-button";
  button.textContent = game.i18n.localize("GWORLD.Chat.ApplyDamage");

  button.addEventListener("click", () => {
    void applyFromCard(
      flag,
      select.value as HitLocation,
      distance ? Math.max(0, Number(distance.value) || 0) : 0,
    );
  });

  row.append(select);
  if (distance) row.append(distance);
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
  defenders: Array<{ uuid: string; name: string; tokenUuid?: string }>;
  /** The attacker's token, so tactical combat can work out the arc. */
  attackerToken?: string;
  /** A penalty the attack imposes on every defense, from a Deceptive Attack. */
  defensePenalty?: number;
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

    // In tactical combat the arc the attack came from decides what is even
    // possible: a blow from behind cannot be defended at all by most people,
    // and one from the side reaches only the hand on that side.
    const arc = await tacticalArc(flag, entry, defender);
    const available = (Object.keys(DEFENSES) as DefenseKey[]).filter((key) => {
      if (defenses[key] == null) return false;
      if (!arc) return true;
      if (arc.helpless) return false;
      if (key === "parry") return arc.canParry;
      if (key === "block") return arc.canBlock;
      return arc.canDodge;
    });

    const row = document.createElement("div");
    row.className = "gc-apply";
    row.dataset.gworldDefend = entry.uuid;

    const who = document.createElement("span");
    who.className = "gc-mod";
    who.textContent = String(defender.name ?? entry.name);
    row.append(who);

    if (arc) {
      const note = document.createElement("span");
      note.className = arc.helpless ? "gc-warn" : "gc-mod";
      note.textContent = arc.helpless
        ? game.i18n.localize("GWORLD.Tactical.Helpless")
        : game.i18n.format("GWORLD.Tactical.Arc", {
            arc: game.i18n.localize(`GWORLD.Tactical.${arc.arc}`),
          });
      row.append(note);
    }

    if (available.length === 0) {
      root.append(row);
      continue;
    }

    // Retreating is an option on any defense against a melee attack, and it is
    // worth more to some defenses than others, so it is a choice made here
    // rather than a modifier typed in afterwards.
    const retreatBox = isRuleOn("retreat") ? document.createElement("input") : null;
    const retreat = document.createElement("label");
    retreat.className = "gc-retreat";
    if (retreatBox) {
      retreatBox.type = "checkbox";
      retreat.append(retreatBox, document.createTextNode(
        game.i18n.localize("GWORLD.Tactical.Retreat"),
      ));
      row.append(retreat);
    }

    for (const key of available) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-apply-button";
      const label = game.i18n.localize(DEFENSES[key]);
      const arcPenalty = arc ? arc.modifier + (key === "parry" ? arc.parryModifier : 0) : 0;
      const deception = flag.defensePenalty ?? 0;
      button.textContent = `${label} ${defenses[key].total + arcPenalty + deception}`;
      button.addEventListener("click", () => {
        void rollDefense({
          defender,
          key,
          total: defenses[key].total,
          attack: flag.attack,
          arcPenalty,
          deception,
          retreating: retreatBox?.checked ?? false,
          skill: defenses[key].skillName ?? "",
          isFencing: Boolean(defenses[key].isFencing),
        });
      });
      row.append(button);
    }

    root.append(row);
  }
}

/**
 * The arc an attack came from, or null when the tactical rules do not apply --
 * a world using basic combat, a scene without a hex grid, or an attack with no
 * token on either end to measure between.
 */
async function tacticalArc(
  flag: DefenseFlag,
  entry: { tokenUuid?: string },
  defender: any,
): Promise<(ReturnType<typeof arcDefense> & { arc: Arc }) | null> {
  if (!flag.attackerToken || !entry.tokenUuid) return null;

  const attackerToken: any = await fromUuid(flag.attackerToken).catch(() => null);
  const defenderToken: any = await fromUuid(entry.tokenUuid).catch(() => null);
  if (!attackerToken || !defenderToken) return null;

  const gridType = defenderToken.parent?.grid?.type;
  if (!tacticalOnScene(gridType)) return null;

  const from = attackDirection(attackerToken, defenderToken, gridType);
  if (from === null) return null;

  const { arc, side } = attackArc(facingOf(defenderToken, gridType), from);
  // A shield is held in the off hand, so a two-handed weapon means no shield;
  // what matters for the parry is whether the weapon is held in one hand.
  return {
    arc,
    ...arcDefense({
      arc,
      side,
      vision: visionOf(defender),
      hands: handednessOf(defender),
      oneHandedWeapon: true,
    }),
  };
}

/** Rolls one active defense for one defender. */
async function rollDefense(options: {
  defender: any;
  key: DefenseKey;
  total: number;
  attack: string;
  arcPenalty: number;
  deception: number;
  retreating: boolean;
  skill: string;
  isFencing: boolean;
}): Promise<void> {
  const {
    defender, key, total, attack, arcPenalty, deception, retreating, skill, isFencing,
  } = options;
  const name = game.i18n.localize(DEFENSES[key]);

  const modifiers = [];
  if (arcPenalty !== 0) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Tactical.ArcPenalty"), value: arcPenalty });
  }
  if (deception !== 0) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Melee.Deceptive"), value: deception });
  }
  if (retreating) {
    modifiers.push({
      label: game.i18n.localize("GWORLD.Tactical.Retreat"),
      // A retreat is worth three to a Dodge and only one to most parries, but
      // three again to the parries that make superior use of mobility.
      value: retreatBonus({ defense: key, skill, isFencing }),
    });
  }

  await rollSuccess({
    actor: defender,
    base: total,
    label: game.i18n.format("GWORLD.Chat.DefendingAgainst", { defense: name, attack }),
    kind: "defense",
    modifiers,
  });
}

/** Registers the chat hooks. Called once, at init. */
export function registerChatHooks(): void {
  Hooks.on("renderChatMessageHTML", (message: any, html: HTMLElement) => {
    addApplyControls(message, html);
    void addDefenseControls(message, html);
  });
}
