/**
 * A spell in the hand (GURPS Basic Set: Characters pp. 240-241).
 *
 * A Melee spell "charges" the hand with something that affects the first
 * target struck; a Missile spell puts a bolt in it to be thrown. Either is
 * held until used: the caster can take other maneuvers but cannot cast
 * again, a Missile can be enlarged for two more seconds, and a hit while
 * holding one is a Will roll not to have it go off in the hand.
 *
 * The held spell is a flag on the caster, like a Feint or a Mighty Blow: a
 * state between two rolls rather than a fact about the character. Throwing
 * and striking go through the same attack rolls a weapon's do, so the range
 * table, the defense card and the damage card all read as they always have.
 */

import { SYSTEM_ID } from "./constants.js";
import { applyFatigue } from "./fatigue.js";
import { isRuleOn } from "./optional-rules.js";
import { handleRollAction, promptForNumber, rollDamage, rollSuccess } from "./roll.js";
import { catalogSkill, defaultLevelFrom } from "./skill-catalog.js";
import { targetedTokens } from "./targets.js";
import { postResistCard } from "./spell-resistance.js";
import { formatDiceAdds, parseDiceAdds } from "../rules/dice.js";
import { normalizeSkillName } from "../rules/skills.js";
import { canEnlargeMissile, spellDamage } from "../rules/spell-attacks.js";
import type { DamageType, SkillAttribute } from "../rules/types.js";

export const HELD_SPELL_FLAG = "heldSpell";

/** What is in the caster's hand. */
export interface HeldSpell {
  itemId: string;
  name: string;
  kind: "missile" | "melee";
  /** Energy put into it, which its damage scales with. */
  energy: number;
  /** Seconds a Missile has been built up over, of the three allowed. */
  seconds: number;
  /** Damage per point of energy, as dice; blank where the spell says what it does. */
  damage: string;
  damageType: string;
  explosive: boolean;
  /** The Innate Attack specialty a Missile is thrown with. */
  skill: string;
  accuracy: number;
  halfDamageRange: number;
  maxRange: number;
  /** What a Melee spell's target resists with once struck, or blank. */
  resistedBy: string;
}

const L = (key: string) => game.i18n.localize(`GWORLD.Held.${key}`);

/** The spell in the caster's hand, or null. */
export function heldSpell(actor: any): HeldSpell | null {
  const flag = actor?.getFlag?.(SYSTEM_ID, HELD_SPELL_FLAG);
  return flag && typeof flag === "object" && flag.itemId ? (flag as HeldSpell) : null;
}

/** Puts a spell in the hand. There is only ever one there. */
export async function holdSpell(actor: any, held: HeldSpell): Promise<void> {
  if (!actor?.isOwner) return;
  await actor.setFlag(SYSTEM_ID, HELD_SPELL_FLAG, held);
}

async function releaseSpell(actor: any): Promise<void> {
  if (actor?.getFlag?.(SYSTEM_ID, HELD_SPELL_FLAG) !== undefined && actor.isOwner) {
    await actor.unsetFlag(SYSTEM_ID, HELD_SPELL_FLAG);
  }
}

/** The damage the held spell would do now, as dice, or blank. */
export function heldDamage(held: HeldSpell): string {
  const per = parseDiceAdds(held.damage);
  if (!per) return "";
  return formatDiceAdds(spellDamage(per, held.energy));
}

/** What the Magic tab shows of the spell in hand. */
export function describeHeld(held: HeldSpell): {
  name: string;
  kind: string;
  energy: number;
  damage: string;
  damageType: string;
  seconds: number;
  missile: boolean;
  canEnlarge: boolean;
} {
  return {
    name: held.name,
    kind: L(held.kind),
    energy: held.energy,
    damage: heldDamage(held),
    damageType: held.damageType,
    seconds: held.seconds,
    missile: held.kind === "missile",
    canEnlarge: held.kind === "missile" && canEnlargeMissile(held.seconds),
  };
}

/**
 * The level a Missile is thrown at: the caster's Innate Attack specialty if
 * they have it, else what the book defaults it to -- DX-4 for anybody.
 */
function innateAttackLevel(actor: any, skillName: string): number {
  const wanted = normalizeSkillName(skillName || "Innate Attack (Projectile)");
  for (const item of actor?.items ?? []) {
    if (item.type !== "skill") continue;
    if (normalizeSkillName(String(item.name ?? "")) !== wanted) continue;
    const level = item.system?.derived?.level;
    if (typeof level === "number") return level;
  }
  const derived = actor?.system?.derived ?? {};
  const attributeScore = (a: SkillAttribute): number => {
    if (a === "Will") return Number(derived.will) || 10;
    if (a === "Per") return Number(derived.per) || 10;
    return Number(derived.attributes?.[a] ?? actor?.system?.attributes?.[a]) || 10;
  };
  const listed = catalogSkill(skillName);
  const fromCatalog = listed
    ? defaultLevelFrom(listed.defaults, attributeScore, (other) => {
        for (const item of actor?.items ?? []) {
          if (item.type === "skill" && normalizeSkillName(String(item.name ?? "")) === normalizeSkillName(other)) {
            return typeof item.system?.derived?.level === "number" ? item.system.derived.level : null;
          }
        }
        return null;
      })
    : null;
  return fromCatalog ?? attributeScore("DX") - 4;
}

/** The best unarmed attack the caster has, for striking with a charged hand. */
function unarmedStrikeLevel(actor: any): { level: number; skill: string } {
  const natural = (actor?.system?.derived?.melee ?? []).filter((a: any) => a.natural && a.reach === "C");
  let best: { level: number; skill: string } | null = null;
  for (const attack of natural) {
    const level = Number(attack.skillLevel);
    if (Number.isFinite(level) && (best === null || level > best.level)) {
      best = { level, skill: String(attack.skillName ?? "DX") };
    }
  }
  return best ?? { level: Number(actor?.system?.derived?.attributes?.DX) || 10, skill: "DX" };
}

/** A control the attack pipeline can read, built rather than clicked. */
function syntheticControl(data: Record<string, string>): HTMLElement {
  const el = document.createElement("span");
  for (const [key, value] of Object.entries(data)) el.dataset[key] = value;
  return el;
}

/**
 * Puts more energy into a held Missile (p. 240): "you may invest more energy
 * in the spell, anything from one point to points equal to your Magery
 * level. This does not require a skill roll."
 */
export async function enlargeMissile(actor: any): Promise<void> {
  const held = heldSpell(actor);
  if (!held || held.kind !== "missile" || !actor?.isOwner) return;
  if (!canEnlargeMissile(held.seconds)) {
    ui.notifications?.warn(L("NoMoreEnlarging"));
    return;
  }
  const magery = Math.max(1, Number(actor.system?.derived?.magic?.magery ?? 1) || 1);
  const more = await promptForNumber({
    title: L("Enlarge"),
    label: game.i18n.format("GWORLD.Held.EnlargeBy", { max: magery }),
    initial: 1,
  });
  if (more === null) return;
  const added = Math.max(1, Math.min(magery, Math.floor(more)));
  await applyFatigue(actor, added);
  await holdSpell(actor, { ...held, energy: held.energy + added, seconds: held.seconds + 1 });
  ui.notifications?.info(game.i18n.format("GWORLD.Held.Enlarged", { spell: held.name, energy: held.energy + added }));
}

/**
 * Throws a held Missile (p. 241): "roll against your Innate Attack skill to
 * hit. This is a standard ranged attack, subject to the usual modifiers for
 * target size, speed, and range ... Your target may block or dodge, but not
 * parry." A hit rolls the damage the energy bought straight away, since the
 * missile is gone whatever the defender does with it.
 */
export async function throwMissile(actor: any, event: Event): Promise<void> {
  const held = heldSpell(actor);
  if (!held || held.kind !== "missile" || !actor?.isOwner) return;

  const control = syntheticControl({
    rollType: "attack",
    rollLabel: `${held.name} (${heldDamage(held) || held.energy})`,
    rollTarget: String(innateAttackLevel(actor, held.skill)),
    basedOn: "DX",
    ranged: "1",
    damageType: held.damageType || "cr",
    accuracy: String(held.accuracy),
    halfDamageRange: String(held.halfDamageRange),
    rateOfFire: "1",
    recoil: "0",
    bulk: "0",
    noParry: "1",
  });
  const outcome = await handleRollAction(actor, event, control);
  if (!outcome) return;

  // Launched, hit or miss: "Once launched, the missile flies in a straight
  // line to the target."
  await releaseSpell(actor);

  if (outcome.success) await rollHeldDamage(actor, held, held.name);
}

/**
 * Strikes with a charged hand (p. 240): "roll against DX or an unarmed combat
 * skill to hit with a hand ... This is a standard melee attack. Your target
 * may attempt any active defense. If he succeeds, your spell is not
 * triggered; you may try again next turn. If he fails, your melee attack
 * does its usual damage and your spell affects him immediately."
 */
export async function strikeWithMelee(actor: any, event: Event): Promise<void> {
  const held = heldSpell(actor);
  if (!held || held.kind !== "melee" || !actor?.isOwner) return;

  const strike = unarmedStrikeLevel(actor);
  const control = syntheticControl({
    rollType: "attack",
    rollLabel: `${held.name} (${strike.skill})`,
    rollTarget: String(strike.level),
    basedOn: "DX",
    damageType: held.damageType || "cr",
    unarmed: "1",
  });
  const outcome = await handleRollAction(actor, event, control);
  if (!outcome || !outcome.success) return;

  // The hand is discharged by the blow, whatever the defense then does; a
  // successful defense means "you may try again next turn", which is a new
  // casting in this system rather than a held charge kept through a parry.
  await releaseSpell(actor);
  if (held.damage) await rollHeldDamage(actor, held, held.name);

  // Some Melee spells are Resisted as well, "when the spell actually takes
  // effect" (p. 240): the subject's roll waits on the defense.
  if (held.resistedBy) {
    const subjects = targetedTokens()
      .map((token: any) => token?.actor)
      .filter((subject: any) => subject?.uuid)
      .slice(0, 1);
    await postResistCard({
      caster: actor,
      spell: held.name,
      casterRoll: outcome.roll,
      casterEffective: outcome.effectiveSkill,
      resistedBy: held.resistedBy,
      area: false,
      subjects,
    });
  }
}

/** The damage a held spell does, rolled and posted like a weapon's. */
async function rollHeldDamage(actor: any, held: HeldSpell, label: string): Promise<void> {
  const formula = heldDamage(held);
  if (!formula) {
    ui.notifications?.info(game.i18n.format("GWORLD.Held.AsDescribed", { spell: held.name }));
    return;
  }
  await rollDamage({
    actor,
    label,
    formula,
    damageType: (held.damageType || "cr") as DamageType,
    explosive: held.explosive && isRuleOn("explosions"),
  });
}

/**
 * Lets a held spell go without using it: "You can do this as a free action
 * at any point during your turn; simply state that you are dissipating the
 * spell and it 'evaporates' harmlessly" (p. 241).
 */
export async function dissipateSpell(actor: any): Promise<void> {
  const held = heldSpell(actor);
  if (!held || !actor?.isOwner) return;
  await releaseSpell(actor);
  ui.notifications?.info(game.i18n.format("GWORLD.Held.Dissipated", { spell: held.name }));
}

/**
 * A blow taken while holding a Missile (p. 241): "if you are injured while
 * you have a missile 'in hand,' you must make a Will roll. If you fail, the
 * missile immediately affects you!"
 */
export async function injuredWhileHolding(actor: any): Promise<void> {
  const held = heldSpell(actor);
  if (!held || held.kind !== "missile" || !actor?.isOwner) return;
  const will = Number(actor.system?.derived?.will) || 10;
  const outcome = await rollSuccess({
    actor,
    base: will,
    label: game.i18n.format("GWORLD.Held.InjuredLabel", { spell: held.name }),
    kind: "skill",
  });
  if (!outcome || outcome.success) return;
  await releaseSpell(actor);
  await rollHeldDamage(actor, held, game.i18n.format("GWORLD.Held.OnSelf", { spell: held.name, name: String(actor.name) }));
}
