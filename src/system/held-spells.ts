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

import { applyInjury } from "../rules/injury.js";
import { randomHitLocation } from "../rules/hit-locations.js";
import { syncHealthConditions } from "./conditions.js";
import { resolveDamageAgainst, type IncomingDamage } from "./damage.js";
import { SYSTEM_ID } from "./constants.js";
import { applyFatigue } from "./fatigue.js";
import { isRuleOn } from "./optional-rules.js";
import { handleRollAction, promptForNumber, rollDamage, rollSuccess } from "./roll.js";
import { catalogSkill, defaultLevelFrom } from "./skill-catalog.js";
import { targetedTokens } from "./targets.js";
import { postResistCard } from "./spell-resistance.js";
import {
  formatDiceAdds,
  parseDiceAdds,
  toRollFormula,
} from "../rules/dice.js";
import { normalizeSkillName } from "../rules/skills.js";
import {
  canEnlargeMissile,
  spellDamage,
  rainDamage,
} from "../rules/spell-attacks.js";
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
  await applyFatigue(actor, added, { exertion: false });
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

  // The hand is discharged by the blow, whatever the defense then does.
  //
  // The book keeps the charge: "if he succeeds, your spell is not triggered;
  // you may try again next turn" (p. 240). Restoring it automatically would
  // mean the defender's client writing a flag on the caster's actor, which
  // ownership does not allow, or the caster's client watching every defense
  // card for one of its own -- machinery out of proportion to the case.
  //
  // So this is left to the table: on a successful defense the caster simply
  // holds the spell again, which costs what it cost the first time. Deliberate,
  // and not to be "fixed" without deciding to build that machinery.
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

/** What a spell that attacks directly brings to the attack: a jet, a breath, a rain. */
export interface SpellAttack {
  name: string;
  /** Damage per point of energy for a jet; per second, as written, for a rain. */
  damage: string;
  damageType: string;
  explosive: boolean;
  /** The Innate Attack specialty it is aimed with. */
  skill: string;
  energy: number;
}

/** A spell item's attack, as the casting and the running-spell row read it. */
export function spellAttackOf(item: any, energy: number): SpellAttack {
  const attack = item?.system?.attack ?? {};
  return {
    name: String(item?.name ?? ""),
    damage: String(attack.damage ?? ""),
    damageType: String(attack.damageType ?? ""),
    explosive: Boolean(attack.explosive),
    skill: String(attack.skill ?? ""),
    energy: Math.max(1, Math.floor(Number(energy) || 1)),
  };
}

/**
 * A jet, breath or stare striking (Magic pp. 73-76, 187-198): "Each turn, the
 * caster rolls versus DX-4 or Innate Attack skill to hit, and rolls for damage
 * if he hits. This attack may be dodged or blocked, but not parried." It is no
 * Missile, so nothing is held and nothing thrown: the attack is rolled as the
 * spell takes effect, and again each turn it is kept up. Damage is the spell's
 * dice for each point of energy in it.
 */
export async function strikeWithSpell(actor: any, attack: SpellAttack, event: Event = new MouseEvent("click")): Promise<void> {
  if (!actor?.isOwner) return;
  const control = syntheticControl({
    rollType: "attack",
    rollLabel: `${attack.name} (${jetDamage(attack) || attack.energy})`,
    rollTarget: String(innateAttackLevel(actor, attack.skill || "Innate Attack (Beam)")),
    basedOn: "DX",
    damageType: attack.damageType || "cr",
    noParry: "1",
  });
  const outcome = await handleRollAction(actor, event, control);
  if (!outcome?.success) return;
  const formula = jetDamage(attack);
  if (!formula) {
    ui.notifications?.info(game.i18n.format("GWORLD.Held.AsDescribed", { spell: attack.name }));
    return;
  }
  await rollDamage({
    actor,
    label: attack.name,
    formula,
    damageType: (attack.damageType || "cr") as DamageType,
    explosive: attack.explosive && isRuleOn("explosions"),
  });
}

/** A jet's damage for the energy in it: Flame Jet at 3 points is 3d. */
export function jetDamage(attack: SpellAttack): string {
  const per = parseDiceAdds(attack.damage);
  return per ? formatDiceAdds(spellDamage(per, attack.energy)) : "";
}

/**
 * A second of an Area spell's rain (Magic pp. 53, 74, 188, 192): its damage
 * "per second to all within it", on each creature in the area -- whoever is
 * targeted -- rolled for each, with "armor protects in the usual fashion".
 * No attack roll and no defense. Half, rounded down, for one who spent less
 * than the whole second there.
 */
export async function rainOnTargets(actor: any, attack: SpellAttack, options: { formula: string; wholeSecond: boolean }): Promise<void> {
  const dice = parseDiceAdds(options.formula);
  if (!dice) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Rain.BadFormula", { formula: options.formula }));
    return;
  }
  const victims = targetedTokens().map((token: any) => token?.actor).filter(Boolean);
  if (victims.length === 0) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Rain.NoTargets"));
    return;
  }
  const rolls: any[] = [];
  const lines: string[] = [];
  for (const victim of victims) {
    if (!victim.isOwner) {
      lines.push(game.i18n.format("GWORLD.Rain.CannotApply", { name: String(victim.name ?? "") }));
      continue;
    }
    const roll = new Roll(toRollFormula(dice));
    await roll.evaluate();
    rolls.push(roll);
    const basic = rainDamage(roll.total, options.wholeSecond);
    const damage: IncomingDamage = {
      basicDamage: basic,
      type: (attack.damageType || "cr") as DamageType,
      armorDivisor: 1,
      hitLocation: randomHitLocation(10).location,
    };
    const injury = resolveDamageAgainst(victim, damage).injury;
    const hp = victim.system?.hp ?? { value: 0, max: 0 };
    const previous = Number(hp.value) || 0;
    const applied = applyInjury(injury, previous, Number(hp.max) || 0);
    if (injury > 0) {
      await victim.update({ "system.hp.value": applied.currentHp });
      await syncHealthConditions(victim);
    }
    lines.push(game.i18n.format("GWORLD.Rain.Struck", {
      name: String(victim.name ?? ""),
      rolled: `${options.formula} = ${roll.total}${options.wholeSecond ? "" : ` (${game.i18n.localize("GWORLD.Rain.Halved")} ${basic})`}`,
      location: game.i18n.localize(`GWORLD.HitLocation.${damage.hitLocation}`),
      injury,
      previous,
      now: applied.currentHp,
    }));
  }
  // The card every no-roll, no-defense harm posts: the swarm's and the rest.
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/life.hbs`, {
    name: attack.name,
    kind: game.i18n.localize("GWORLD.Rain.Kind"),
    detail: game.i18n.format("GWORLD.Rain.Detail", { formula: options.formula }),
    lines,
    bad: true,
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls,
  });
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
