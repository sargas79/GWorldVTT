/**
 * Swarms at the table (GURPS Basic Set: Campaigns p. 461).
 *
 * A swarm is an NPC like any other beast, with the hit points it takes to
 * disperse it and Injury Tolerance (Diffuse), so everything already written
 * about damage applies to it. What is its own is the attack: "a swarm attack
 * hits automatically -- there is no attack or defense roll. Every turn until
 * it is dispersed, it does the listed damage to its victim(s)", and what the
 * victim is wearing may or may not keep it out.
 */

import { SYSTEM_ID } from "./constants.js";
import { syncHealthConditions } from "./conditions.js";
import { resolveDamageAgainst, type IncomingDamage } from "./damage.js";
import { currentTargets, targetedTokens } from "./targets.js";
import { parseDiceAdds, toRollFormula } from "../rules/dice.js";
import { randomHitLocation } from "../rules/hit-locations.js";
import { applyInjury } from "../rules/injury.js";
import {
  dispersed, swarmDamageTaken, swarmProtection, type SwarmKind, type SwarmProtection,
} from "../rules/swarms.js";
import type { DamageType } from "../rules/types.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/life.hbs`;

const S = (key: string) => game.i18n.localize(`GWORLD.Swarm.${key}`);
const SF = (key: string, data: Record<string, unknown>) => game.i18n.format(`GWORLD.Swarm.${key}`, data);

async function post(actor: any, context: Record<string, unknown>): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
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

/** The swarm block an NPC carries, with the book's defaults for anything missing. */
export function swarmOf(actor: any): {
  kind: SwarmKind; damage: string; flatInjury: number; damageType: DamageType; flying: boolean;
} | null {
  const swarm = actor?.system?.swarm;
  if (!swarm?.isSwarm) return null;
  return {
    kind: swarm.kind === "tiny" ? "tiny" : "large",
    damage: String(swarm.damage ?? ""),
    flatInjury: Number(swarm.flatInjury) || 0,
    damageType: (swarm.damageType ?? "cut") as DamageType,
    flying: swarm.flying === true,
  };
}

/**
 * A second of being swarmed (p. 461).
 *
 * No attack roll and no defense: the damage is rolled once and applied to
 * everyone in the swarm's hex, which is whoever is targeted. Armour is asked
 * about rather than read off the sheet, because what matters is whether it is
 * the kind that keeps insects out -- and how long it has been keeping them
 * out, since against the tiny ones it only lasts a few seconds.
 */
export async function swarmAttack(options: {
  actor: any;
  protection: SwarmProtection;
  secondsExposed: number;
}): Promise<void> {
  const swarm = swarmOf(options.actor);
  if (!swarm) return;

  const victims = targetedTokens().map((t: any) => t.actor).filter(Boolean);
  if (victims.length === 0) {
    ui.notifications?.warn(S("NoTargets"));
    return;
  }

  const rolls: any[] = [];
  const lines: string[] = [];

  for (const victim of victims) {
    if (!victim.isOwner) {
      lines.push(SF("CannotApply", { name: String(victim.name ?? "") }));
      continue;
    }

    // What the victim is wearing, and whether it is still keeping them out.
    const location = "torso" as const;
    const wornDr = Number(victim.system?.derived?.drByLocation?.[location]) || 0;
    const cover = swarmProtection({
      kind: swarm.kind,
      protection: options.protection,
      secondsExposed: options.secondsExposed,
      dr: wornDr,
    });

    if (cover.immune) {
      lines.push(SF("Immune", { name: String(victim.name ?? ""), seconds: options.secondsExposed }));
      continue;
    }

    let injury = swarm.flatInjury;
    let rolled = 0;
    // "1d" is how the book writes it; the dice want "1d6".
    const dice = swarm.damage ? parseDiceAdds(swarm.damage) : null;
    if (swarm.damage && !dice) {
      lines.push(SF("BadFormula", { formula: swarm.damage }));
      continue;
    }
    if (dice) {
      const roll = new Roll(toRollFormula(dice));
      await roll.evaluate();
      rolls.push(roll);
      rolled = roll.total;
      const damage: IncomingDamage = {
        basicDamage: Math.max(0, rolled),
        type: swarm.damageType,
        armorDivisor: 1,
        hitLocation: randomHitLocation(10).location,
      };
      // The DR is whatever the covering is still worth: the ordinary
      // pipeline where it holds, and nothing at all once the bugs are inside.
      injury = cover.dr > 0 ? resolveDamageAgainst(victim, damage).injury : Math.max(0, rolled);
    }

    const hp = victim.system?.hp ?? { value: 0, max: 0 };
    const previous = Number(hp.value) || 0;
    const applied = applyInjury(injury, previous, Number(hp.max) || 0);
    if (injury > 0) {
      await victim.update({ "system.hp.value": applied.currentHp });
      await syncHealthConditions(victim);
    }
    lines.push(
      SF("Bitten", {
        name: String(victim.name ?? ""),
        rolled: swarm.damage ? `${swarm.damage} = ${rolled}` : String(swarm.flatInjury),
        injury,
        previous,
        now: applied.currentHp,
      }),
    );
    if (!cover.lasted && options.protection !== "none") {
      lines.push(SF("GotIn", { name: String(victim.name ?? "") }));
    }
  }

  await post(options.actor, {
    kind: S("Attack"),
    detail: SF("Detail", { seconds: options.secondsExposed, protection: S(`Protection.${options.protection}`) }),
    lines,
    bad: true,
    rolls,
  });
}

/**
 * Beating a swarm off (p. 461).
 *
 * "Any attack against a swarm hits automatically. The swarm gets no defense
 * roll", and a shield or a boot adds its own points to whatever the weapon
 * did: "a shield does 2 HP per turn, and can attack at the same time as a
 * weapon. Stomping does 1 HP per turn to nonflying vermin."
 */
export async function fightOffSwarm(options: {
  actor: any;
  weaponDamage: number;
  shield: boolean;
  stomp: boolean;
}): Promise<void> {
  const swarms = currentTargets()
    .map((t: any) => t.actor)
    .filter((a: any) => a && swarmOf(a));
  if (swarms.length !== 1) {
    ui.notifications?.warn(S("TargetOne"));
    return;
  }
  const swarm = swarms[0];
  const block = swarmOf(swarm)!;
  if (!swarm.isOwner) {
    ui.notifications?.warn(SF("CannotApply", { name: String(swarm.name ?? "") }));
    return;
  }

  const taken = swarmDamageTaken({
    weapon: options.weaponDamage,
    swarm: {
      about: "", kind: block.kind, move: 0, flying: block.flying,
      damage: null, flatInjury: 0, damageType: "cut",
      disperseAt: Number(swarm.system?.hp?.max) || 0,
    },
    shield: options.shield,
    stomp: options.stomp,
  });

  const hp = swarm.system?.hp ?? { value: 0, max: 0 };
  const previous = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;
  const now = previous - taken.total;
  await swarm.update({ "system.hp.value": now });

  // "Dispersed after losing 8 HP": the pool counts down from what it takes.
  const broken = dispersed(max - now, {
    about: "", kind: block.kind, move: 0, flying: block.flying,
    damage: null, flatInjury: 0, damageType: "cut", disperseAt: max,
  });
  if (broken) await swarm.update({ "system.conditions.stunned": false });

  const lines = [SF("Beaten", { weapon: taken.weapon, shield: taken.shield, stomp: taken.stomp, total: taken.total })];
  lines.push(SF("Left", { now: Math.max(0, now), max }));
  if (broken) lines.push(S("Dispersed"));

  await post(options.actor, {
    kind: S("FightOff"),
    detail: SF("FightingOff", { name: String(swarm.name ?? "") }),
    lines,
    good: broken,
  });
}

/** A damage formula for the swarm's own line, for the sheet to show. */
export function swarmDamageText(actor: any): string {
  const swarm = swarmOf(actor);
  if (!swarm) return "";
  return swarm.damage || String(swarm.flatInjury);
}
