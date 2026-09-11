/**
 * Rolling and chat output.
 *
 * The dice go through Foundry's Roll class so that dice-animation modules and
 * the roll log behave normally; the *interpretation* — success, margin, and
 * critical status — comes from the pure rules engine, which is the only place
 * those rules are defined.
 */

import { SYSTEM_ID } from "./constants.js";
import { consumeMightyBlows, recordMightyBlows, spendFatigue } from "./extra-effort.js";
import { consumeFeint } from "./feint.js";
import {
  UNAIMED,
  consumeCalledShot,
  parseShot,
  recordCalledShot,
  shotOptions,
  type CalledShot,
} from "./called-shot.js";
import { consumeTurnedBlade, recordTurnedBlade } from "./turned-blade.js";
import { isRuleOn } from "./optional-rules.js";
import { targetedTokens } from "./targets.js";
import { canAttempt, resolveDefense, resolveSuccess, type SuccessRollResult } from "../rules/success.js";
import {
  criticalEntry,
  criticalMissTableFor,
  type CriticalTable,
} from "../rules/criticals.js";
import { applyDamageFloor, computeInjury } from "../rules/damage.js";
import { formatDiceAdds, maxRoll, parseDiceAdds, toRollFormula } from "../rules/dice.js";
import { blastRadius, fragmentationRadius } from "../rules/explosions.js";
import {
  EXTRA_EFFORT_FP,
  flurryOfBlowsPenalty,
  mightyBlowsBonus,
} from "../rules/extra-effort.js";
import {
  OPPORTUNITY_LINE_PENALTY,
  RAPID_STRIKE_PENALTY,
  bulkPenalty,
  canAimWhileWatching,
  deceptiveAttack,
  maxDeception,
  opportunityFirePenalty,
  dualWeaponAttack,
} from "../rules/attack-options.js";
import { penaltyForRoll } from "../rules/attribute-penalties.js";
import type { SkillAttribute } from "../rules/types.js";
import {
  elevationRange,
  rangedToHitModifier,
  rapidFireBonus,
  rapidFireHits,
} from "../rules/ranged.js";
import {
  REPAIRS,
  clearsItself,
  malfunctionFor,
  malfunctioned,
  mayExplode,
  type Malfunction,
} from "../rules/malfunctions.js";
import { attackWithoutSight, type Sight } from "../rules/visibility.js";
import { levelDifference } from "../rules/melee-situations.js";
import { turnedBlade } from "../rules/subduing.js";
import { coverShot, type CoverApproach } from "../rules/cover.js";
import type { DamageType } from "../rules/types.js";

const CHAT_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/success-roll.hbs`;
const DAMAGE_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/damage-roll.hbs`;

/** What rules a roll is judged by; only defenses skip the minimum-3 check. */
export type RollKind = "skill" | "attribute" | "attack" | "defense";

export interface RollModifier {
  label: string;
  value: number;
}

export interface SuccessRollOptions {
  actor: any;
  /** The unmodified target number, e.g. a skill level or defense score. */
  base: number;
  label: string;
  /** What kind of roll this is; defense rolls use the defense success rules. */
  kind?: RollKind;
  modifiers?: RollModifier[];
  /**
   * A burst, whose margin of success decides how many of its shots hit
   * (GURPS Basic Set: Campaigns p. 373).
   */
  rapidFire?: { shotsFired: number; recoil: number };
  /**
   * A penalty this attack imposes on the defender, from a Deceptive Attack or
   * a Feint. Recorded on the message so the defense card can apply it.
   */
  defensePenalty?: number;
  /**
   * True for a punch, kick, bite, grapple or slam, which reads its own critical
   * miss table (GURPS Basic Set: Campaigns p. 557).
   */
  unarmed?: boolean;
  /**
   * The weapon's Malf., and what it takes to put right if the roll reaches it
   * (GURPS Basic Set: Campaigns p. 407).
   */
  malfunction?: { number: number; techLevel: number; revolver: boolean } | null;
}

/**
 * Rolls 3d6 against a target number and posts the result to chat.
 *
 * Returns the resolved outcome so callers can chain on it (an attack that hits
 * going on to roll damage, for instance).
 */
export async function rollSuccess(options: SuccessRollOptions): Promise<SuccessRollResult | null> {
  const {
    actor, base, label, kind = "skill", modifiers = [], rapidFire, defensePenalty = 0,
    unarmed = false,
  } = options;

  const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
  const effective = base + totalModifier;

  // A roll at effective skill below 3 may not be attempted at all, and only
  // active defenses are exempt (GURPS Lite p. 2). Without this check a rolled
  // 3 or 4 would report success, since those always succeed once rolled.
  if (kind !== "defense" && !canAttempt(effective)) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Roll.TooLowToAttempt", { label, effective }),
    );
    return null;
  }

  const roll = new Roll("3d6");
  await roll.evaluate();

  const outcome =
    kind === "defense"
      ? resolveDefense(roll.total, effective, dieResults(roll))
      : resolveSuccess(roll.total, effective, dieResults(roll));

  // A critical hit or miss is read off a table rather than merely announced
  // (p. 381). The miss is rolled here, because its result lands on the attacker
  // straight away; the hit is rolled when the damage is applied, where the hit
  // location and the target's DR are both known.
  const criticalMiss =
    kind === "attack" && outcome.criticalFailure && isRuleOn("criticalTables")
      ? await rollCriticalMiss(criticalMissTableFor(unarmed))
      : null;
  const criticalHit = kind === "attack" && outcome.criticalSuccess && isRuleOn("criticalTables");

  // A gun that jams does so on the attack roll itself, whether or not the shot
  // would otherwise have hit -- "on any attack roll of Malf. or more".
  const jam =
    kind === "attack" && isRuleOn("malfunctions") && options.malfunction
      ? await rollMalfunction(roll.total, options.malfunction)
      : null;

  const content = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, {
    label,
    kind,
    criticalMiss,
    criticalHit,
    base,
    modifiers: modifiers.filter((m) => m.value !== 0),
    totalModifier,
    effective,
    outcome,
    resultLabel: describeOutcome(outcome, kind),
    resultClass: outcomeClass(outcome),
    // A burst that missed scored nothing, so hits are reported only on a hit.
    hits:
      rapidFire && outcome.success
        ? rapidFireHits({
            margin: outcome.margin,
            shotsFired: rapidFire.shotsFired,
            recoil: rapidFire.recoil,
          })
        : null,
    shotsFired: rapidFire?.shotsFired ?? null,
    jam,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll, ...(criticalMiss ? [criticalMiss.roll] : []), ...(jam ? [jam.roll] : [])],
    // An attack that connects is the moment to record who it was aimed at: the
    // defender rolls afterwards, by which time the attacker may well have
    // changed their target. A miss needs no defense, so it carries nothing.
    ...(kind === "attack" && outcome.success
      ? { flags: attackFlags(actor, label, defensePenalty, criticalHit) }
      : {}),
  });

  return outcome;
}

/**
 * The penalty a lowered attribute puts on this roll (p. 421).
 *
 * Returns zero for a roll the rule exempts, and for a button that does not say
 * what it is based on -- an attack rolls against a weapon skill whose attribute
 * is the skill's own business, and guessing at it would be worse than nothing.
 */
function temporaryPenalty(actor: any, basedOn: string | undefined, kind: RollKind): number {
  if (!basedOn) return 0;

  const penalties = actor?.system?.attributePenalties;
  if (!penalties) return 0;

  return penaltyForRoll({
    penalties,
    basedOn: basedOn as SkillAttribute,
    kind: kind === "defense" ? "activeDefense" : "skill",
  });
}

/**
 * Rolls on the Firearm Malfunction Table, if the shot jammed the gun (p. 407).
 *
 * "The weapon fires one shot, then jams" is the only outcome where the attack
 * still happens, so the shot is not cancelled here: the card reports both, and
 * the GM decides what a misfired attack that also rolled a hit means.
 */
async function rollMalfunction(
  attackRoll: number,
  weapon: { number: number; techLevel: number; revolver: boolean },
): Promise<{
  roll: any;
  kind: Malfunction;
  label: string;
  repair: string;
  fires: boolean;
  clears: boolean;
  explodes: boolean;
} | null> {
  if (!malfunctioned({ roll: attackRoll, malfunctionNumber: weapon.number })) return null;

  const roll = new Roll("3d6");
  await roll.evaluate();

  const rolled = malfunctionFor(roll.total);
  // "TL5+ weapons do not explode -- treat as a mechanical or electrical
  // problem", so the worst row of the table is two different results.
  const kind: Malfunction =
    rolled === "explosion" && !mayExplode(weapon.techLevel) ? "mechanical" : rolled;

  const repair = REPAIRS[kind];
  const clears = clearsItself(kind, weapon.revolver);

  return {
    roll,
    kind,
    label: game.i18n.localize(`GWORLD.Malfunction.${kind}`),
    repair: clears
      ? game.i18n.localize("GWORLD.Malfunction.Revolver")
      : repair.hours > 0
        ? game.i18n.format("GWORLD.Malfunction.Hours", { hours: repair.hours })
        : game.i18n.format("GWORLD.Malfunction.Ready", { ready: repair.readyManeuvers }),
    // "The weapon fires one shot, then jams. (Treat the fired shot as a normal
    // attack.)"
    fires: kind === "stoppage",
    clears,
    explodes: kind === "explosion",
  };
}

/**
 * Rolls on one of the critical miss tables and says what it landed on.
 *
 * The roll goes through Foundry's Roll class like any other, so that it shows
 * in the log and animates -- a result this unpleasant should be visibly rolled
 * rather than asserted.
 */
async function rollCriticalMiss(table: CriticalTable): Promise<{
  roll: any;
  total: number;
  effect: string;
  gmDecides: boolean;
}> {
  const roll = new Roll("3d6");
  await roll.evaluate();
  const entry = criticalEntry(table, roll.total);
  return {
    roll,
    total: roll.total,
    effect: game.i18n.localize(`GWORLD.Critical.${entry.effect}`),
    gmDecides: entry.gmDecides === true,
  };
}

/**
 * Who an attack was aimed at, recorded on the message so the card can offer
 * them a defense.
 *
 * Actors are named by UUID rather than by token, because the defense is rolled
 * by the actor and a token can be gone by the time anyone clicks.
 *
 * Only targeted tokens count. The selection is not a fallback here as it is
 * elsewhere: an attacker has their own token selected far more often than not,
 * and falling back would record them as defending against themselves.
 */
function attackFlags(
  actor: any,
  label: string,
  defensePenalty: number,
  criticalHit: boolean,
): object {
  const defenders = targetedTokens()
    .filter((token: any) => token?.actor?.uuid)
    .map((token: any) => ({
      uuid: String(token.actor.uuid),
      name: String(token.actor.name ?? ""),
      // The token as well as the actor: tactical combat needs to know where
      // the two of them were standing, which the actor alone cannot say.
      tokenUuid: token.document?.uuid ? String(token.document.uuid) : "",
    }));

  if (defenders.length === 0) return {};

  const attackerToken = actor?.getActiveTokens?.()?.[0]?.document?.uuid;
  return {
    [SYSTEM_ID]: {
      defense: {
        attack: label,
        defenders,
        attackerToken: attackerToken ? String(attackerToken) : "",
        defensePenalty,
        // "In all cases, the target gets no active defense against the attack"
        // (p. 556) -- so the defense card offers none.
        noDefense: criticalHit,
      },
    },
  };
}

export interface DamageRollOptions {
  actor: any;
  label: string;
  /** A dice+adds formula such as "1d+3". */
  formula: string;
  damageType: DamageType;
  armorDivisor?: number;
  modifiers?: RollModifier[];
  /** An explosive attack, which also hurts everyone near what it struck. */
  explosive?: boolean;
  /** Fragmentation thrown, as a dice formula -- the "[2d]" in "cr ex [2d]". */
  fragmentation?: string;
  /** Where the attack that earned this damage was aimed. */
  calledShot?: CalledShot | null;
}

/**
 * Rolls damage and posts it to chat with the wounding modifier shown.
 *
 * Applying it to a target needs that target's DR, so the card carries the
 * numbers a GM needs rather than guessing at whom it hit.
 */
export async function rollDamage(options: DamageRollOptions): Promise<number> {
  const {
    actor, label, formula, damageType, armorDivisor = 1, modifiers = [],
    fragmentation = "",
  } = options;
  const explosive = options.explosive === true && isRuleOn("explosions");

  const parsed = parseDiceAdds(formula);
  if (!parsed) {
    ui.notifications?.warn(`Could not parse damage formula "${formula}".`);
    return 0;
  }

  const bonus = modifiers.reduce((sum, m) => sum + m.value, 0);
  // The multiplier travels with the roll: "6dx10" is six dice times ten, and
  // dropping it here would roll a tenth of the attack.
  const rolled = {
    dice: parsed.dice,
    adds: parsed.adds + bonus,
    ...(parsed.multiplier ? { multiplier: parsed.multiplier } : {}),
  };
  const roll = new Roll(toRollFormula(rolled));
  await roll.evaluate();

  // The floor lives in the rules engine; duplicating it here would let chat
  // damage drift from the rules if it ever changes.
  const basicDamage = applyDamageFloor(roll.total, damageType);

  // Shown against DR 0 so the card states raw injury; the GM subtracts real DR.
  const undefended = computeInjury({ basicDamage, dr: 0, type: damageType });

  const content = await foundry.applications.handlebars.renderTemplate(DAMAGE_TEMPLATE, {
    label,
    formula,
    damageType,
    armorDivisor,
    // A divisor of 1 is the ordinary case and is not worth a line on the card.
    // Anything else is, in both directions: above 1 it divides the target's DR,
    // below 1 it multiplies it, and a stake at (0.5) doubling DR matters to the
    // GM every bit as much as a beam weapon halving it.
    hasArmorDivisor: armorDivisor !== 1,
    modifiers: modifiers.filter((m) => m.value !== 0),
    basicDamage,
    woundingModifier: undefended.woundingModifier,
    injuryIfUnarmored: undefended.injury,

    // An explosion reaches twice its dice in yards, and its fragments five
    // times theirs (GURPS Basic Set: Campaigns p. 414). Both are worth stating
    // on the card, because they decide who else is in trouble.
    explosive,
    // "if an explosion does 6dx2 damage, everyone within 24 yards is
    // vulnerable" -- twelve dice, not six. The multiplier counts.
    blastRadius: explosive ? blastRadius(parsed.dice * (parsed.multiplier ?? 1)) : 0,
    fragmentation,
    fragmentationRadius: fragmentation
      ? fragmentationRadius(parseDiceAdds(fragmentation)?.dice ?? 0)
      : 0,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
    // Carried on the message so the card can still apply the blow later: the
    // roll is over, but who it lands on is decided afterwards, and re-reading
    // the numbers out of the rendered HTML would be parsing our own output.
    flags: {
      [SYSTEM_ID]: {
        damage: {
          basicDamage, damageType, armorDivisor, label,
          // Carried so the apply control opens on the location that was aimed
          // at, and knows to halve the DR of a chink it found.
          ...(options.calledShot
            ? {
                hitLocation: options.calledShot.hitLocation,
                chink: options.calledShot.chink,
              }
            : {}),
          // The most these dice could have come up, for the critical results
          // that replace the roll with maximum damage.
          maxDamage: applyDamageFloor(maxRoll(rolled), damageType),
          explosive,
          // The dice, not the rolled total: the blast radius is set by how
          // many dice the attack rolls, whatever they came up -- and a
          // multiplied roll is that many dice again.
          diceOfDamage: parsed.dice * (parsed.multiplier ?? 1),
        },
      },
    },
  });

  return basicDamage;
}

/**
 * Asks for a situational modifier before rolling.
 *
 * Returns null when the dialog is dismissed, which cancels the roll — distinct
 * from returning 0, which rolls unmodified.
 */
export async function promptForModifier(): Promise<number | null> {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("GWORLD.Chat.ModifierTitle") },
    content: `<div class="gworld">
      <label style="display:flex;align-items:center;gap:8px">
        <span>${game.i18n.localize("GWORLD.Chat.Modifier")}</span>
        <input type="number" name="modifier" value="0" step="1" autofocus style="width:80px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const input = button
          .closest<HTMLElement>(".application")
          ?.querySelector<HTMLInputElement>('input[name="modifier"]');
        return Number(input?.value ?? 0);
      },
    },
    rejectClose: false,
  });

  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

/**
 * Handles a click on any element carrying the roll dataset.
 *
 * Shared by the character and NPC sheets so both route through chat and behave
 * identically — an NPC's Dodge should roll exactly like a PC's.
 */
export async function handleRollAction(
  actor: any,
  event: Event,
  target: HTMLElement,
): Promise<void> {
  const { rollType, rollLabel, rollTarget, ranged } = target.dataset;
  const base = Number(rollTarget);
  if (!Number.isFinite(base)) return;

  // A ranged attack always asks, rather than only on a shift-click: range is
  // not optional the way a situational modifier is, and defaulting it to zero
  // would quietly roll every shot as though it were point blank.
  const recoil = Number(target.dataset.recoil) || 0;
  const malfunctionNumber = Number(target.dataset.malfunction) || 0;
  const shot = ranged
    ? await promptForRangedAttack({
        damageType: (target.dataset.damageType ?? "cr") as DamageType,
        accuracy: Number(target.dataset.accuracy) || 0,
        scopeBonus: Number(target.dataset.scopeBonus) || 0,
        rateOfFire: Number(target.dataset.rateOfFire) || 1,
        recoil,
        bulk: Number(target.dataset.bulk) || 0,
        // A shooter on a Wait is covering ground, and the area they declared
        // is what the penalty comes off.
        watching:
          actor?.system?.maneuver === "wait"
            ? {
                hexesWatched: Number(actor.system?.wait?.hexesWatched ?? 1),
                coveringLine: Boolean(actor.system?.wait?.coveringLine),
              }
            : null,
      })
    : null;
  if (ranged && shot === null) return;

  // A melee attack asks only when asked -- shift-click, as every other roll --
  // but when it does ask, it asks about Deceptive Attack and Rapid Strike too,
  // since both are decided before the roll and both cost skill.
  const asksAboutMelee =
    !ranged && rollType === "attack" && (event as MouseEvent).shiftKey;
  const melee = asksAboutMelee
    ? await promptForMeleeAttack({
        effectiveSkill: base,
        damageType: (target.dataset.damageType ?? "cr") as DamageType,
        dualWeaponTechnique: Number(actor?.system?.derived?.techniques?.dualWeaponAttack) || 0,
        ambidextrous: actor?.system?.derived?.traitEffects?.ambidextrous === true,
        offHandTraining: Number(actor?.system?.derived?.techniques?.offHandWeaponTraining) || 0,
      })
    : null;
  if (asksAboutMelee && melee === null) return;

  const modifiers = shot
    ? shot.modifiers
    : melee
      ? melee.modifiers
      : await maybePromptModifiers(event);
  if (modifiers === null) return;

  // Something has temporarily knocked an attribute down (p. 421). It comes off
  // every skill that attribute governs -- and off nothing else: a defense, a
  // resistance roll and a Fright Check are all exempt, which is why this reads
  // the kind of roll rather than applying itself everywhere.
  const knockedDown = temporaryPenalty(actor, target.dataset.basedOn, rollKind(rollType));
  if (knockedDown !== 0) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Penalties.Label"), value: knockedDown });
  }

  // "You must declare that you are using extra effort and spend the required FP
  // before you make your attack" -- and a fighter who cannot pay does not get
  // the option, so the roll is abandoned rather than made on a promise.
  if (melee && melee.fatigue > 0) {
    const paid = await spendFatigue(actor, melee.fatigue, game.i18n.localize("GWORLD.ExtraEffort.Title"));
    if (!paid) return;
    if (melee.mightyBlows) await recordMightyBlows(actor);
  }

  // Where the blow was aimed travels to the damage roll, which is a separate
  // click: an attack that went for the skull should not have to be told twice.
  if (rollType === "attack") {
    await recordCalledShot(actor, melee?.calledShot ?? shot?.calledShot ?? null);
    await recordTurnedBlade(actor, melee?.turned === true);
  }

  // A Feint made last turn is spent by this attack, whether or not it is aimed
  // at the foe who was feinted -- it was good for one second either way.
  const feint =
    rollType === "attack" && isRuleOn("feint") ? await consumeFeint(actor) : 0;
  const defensePenalty = (melee?.defensePenalty ?? 0) + feint;

  await rollSuccess({
    actor,
    base,
    label: rollLabel ?? rollType ?? "Roll",
    kind: rollKind(rollType),
    modifiers,
    // Which critical miss table a fumble reads is decided by the attack, and
    // the sheet is where that is known.
    unarmed: target.dataset.unarmed === "1",
    // A Deceptive Attack's whole purpose is the penalty it puts on the
    // defender, and a Feint's is the same penalty bought a turn earlier, so
    // both travel with the attack to the defense card.
    ...(defensePenalty !== 0 ? { defensePenalty } : {}),
    // A weapon that can jam says so on the button; one that cannot -- a bow, a
    // thrown rock -- carries nothing and is never asked.
    ...(malfunctionNumber
      ? {
          malfunction: {
            number: malfunctionNumber,
            techLevel: Number(actor?.system?.tl) || 3,
            revolver: target.dataset.revolver === "1",
          },
        }
      : {}),
    // Only a burst needs its hits counted; a single shot either hits or does
    // not, and saying "1 hit" on every arrow would be noise.
    ...(shot && shot.shotsFired > 1
      ? { rapidFire: { shotsFired: shot.shotsFired, recoil } }
      : {}),
  });
}

/**
 * Asks for what a ranged attack needs before rolling: how far away the target
 * is, how fast it is moving, how big it is, and whether the shot was aimed.
 *
 * These are the modifiers GURPS Lite applies to a ranged attack (pp. 19-20 and
 * the Size and Speed/Range Table on p. 27). They are asked rather than
 * measured: the range to a target is knowable from the canvas only when both
 * tokens are on it, and a GM running a fight in the theatre of the mind has no
 * tokens at all.
 *
 * Returns null when the dialog is dismissed, which cancels the roll.
 */
export async function promptForRangedAttack(options: {
  /** What the weapon does, which decides where it can be aimed. */
  damageType: DamageType;
  accuracy: number;
  scopeBonus: number;
  rateOfFire: number;
  recoil: number;
  bulk: number;
  /**
   * Set when the shooter is on a Wait, covering ground with a ready weapon.
   * The area watched costs a penalty, and watching anything wider than one hex
   * forfeits Accuracy.
   */
  watching?: { hexesWatched: number; coveringLine: boolean } | null;
}): Promise<{
  modifiers: RollModifier[];
  shotsFired: number;
  calledShot: CalledShot | null;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Ranged.${key}`);
  const accuracyLabel = options.scopeBonus
    ? `${L("Aimed")} (+${options.accuracy}+${options.scopeBonus})`
    : `${L("Aimed")} (+${options.accuracy})`;

  const field = (name: string, label: string, value: string) => `
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${label}</span>
        <input type="number" name="${name}" value="${value}" step="1" style="width:90px">
      </label>`;

  // How many shots to fire is decided before the attack roll, and only a
  // weapon that can fire more than one is asked (p. 373).
  const rateOfFire = isRuleOn("rapidFire") ? Math.max(1, Math.floor(options.rateOfFire)) : 1;
  const shotsField =
    rateOfFire > 1 ? field("shots", `${L("Shots")} (1-${rateOfFire})`, "1") : "";

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      ${field("range", L("Range"), "0")}
      ${field("elevation", L("Elevation"), "0")}
      ${field("speed", L("TargetSpeed"), "0")}
      ${field("size", L("TargetSize"), "0")}
      ${shotsField}
      ${calledShotField(options.damageType, false)}
      ${sightField()}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize("GWORLD.Cover.Label")}</span>
        <select name="cover" style="width:150px">
          <option value="none">${game.i18n.localize("GWORLD.Cover.none")}</option>
          <option value="exposedLocation">${game.i18n.localize("GWORLD.Cover.exposedLocation")}</option>
          <option value="randomLocation">${game.i18n.localize("GWORLD.Cover.randomLocation")}</option>
          <option value="shootThrough">${game.i18n.localize("GWORLD.Cover.shootThrough")}</option>
        </select>
      </label>
      ${field("modifier", game.i18n.localize("GWORLD.Chat.Modifier"), "0")}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Situation")}</span>
        <select name="situation" style="width:150px">
          <option value="normal">${L("Normal")}</option>
          <option value="moveAndAttack">${L("MoveAndAttack")}</option>
          <option value="closeCombat">${L("CloseCombat")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="aimed">
        <span>${accuracyLabel}</span>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const num = (name: string) =>
          Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
        const aimed =
          form?.querySelector<HTMLInputElement>('input[name="aimed"]')?.checked ?? false;
        const situation =
          form?.querySelector<HTMLSelectElement>('select[name="situation"]')?.value ?? "normal";
        const sight = (form?.querySelector<HTMLSelectElement>('select[name="sight"]')?.value ??
          "clear") as Sight;
        const cover =
          form?.querySelector<HTMLSelectElement>('select[name="cover"]')?.value ?? "none";
        const calledShot =
          form?.querySelector<HTMLSelectElement>('select[name="calledShot"]')?.value ?? UNAIMED;
        return {
          range: num("range"),
          elevation: num("elevation"),
          speed: num("speed"),
          size: num("size"),
          modifier: num("modifier"),
          shots: rateOfFire > 1 ? num("shots") : 1,
          situation: situation as RangedInput["situation"],
          sight,
          cover: cover as CoverApproach | "none",
          calledShot,
          aimed,
        };
      },
    },
    rejectClose: false,
  });

  if (!result || typeof result !== "object") return null;

  const input = result as RangedInput & { calledShot?: string };
  // A weapon cannot fire more shots than its Rate of Fire, nor fewer than one.
  const shotsFired = Math.min(rateOfFire, Math.max(1, Math.floor(input.shots || 1)));

  const aimed = calledShotModifier(input.calledShot ?? UNAIMED, options.damageType, false);
  const modifiers = rangedModifiers({ ...input, shots: shotsFired }, options);
  if (aimed.modifier) modifiers.push(aimed.modifier);

  return { modifiers, shotsFired, calledShot: aimed.shot };
}

interface RangedInput {
  range: number;
  /** Yards the shooter stands above the target; negative when below. */
  elevation?: number;
  speed: number;
  size: number;
  modifier: number;
  /** Shots fired this attack, at most the weapon's Rate of Fire. */
  shots: number;
  /**
   * Why the weapon's Bulk applies, if it does: a Move and Attack takes the
   * worse of -2 and Bulk, and close combat takes Bulk in place of the
   * speed/range penalty (pp. 365, 391).
   */
  situation: "normal" | "moveAndAttack" | "closeCombat";
  /** What the shooter can see of the target. */
  sight?: Sight;
  /** What they decided to do about anything in the way. */
  cover?: CoverApproach | "none";
  aimed: boolean;
}

/**
 * Turns what the dialog collected into labelled modifiers, so the chat card
 * shows the shot's arithmetic rather than one opaque number.
 *
 * Accuracy is added only for an aimed shot: it is what taking the Aim maneuver
 * buys, and a snap shot gets none of it.
 */
export function rangedModifiers(
  input: RangedInput,
  weapon: {
    accuracy: number;
    scopeBonus: number;
    bulk: number;
    /** A laser, which the slope does not affect at all. */
    beamWeapon?: boolean;
    watching?: { hexesWatched: number; coveringLine: boolean } | null;
  },
): RollModifier[] {
  const L = (key: string) => game.i18n.localize(`GWORLD.Ranged.${key}`);
  const modifiers: RollModifier[] = [];

  // Height changes how far the shot has to travel before the table is read:
  // downhill is shorter, uphill is longer, and by different amounts (p. 408).
  const effectiveRange = elevationRange({
    groundYards: input.range,
    elevationYards: input.elevation ?? 0,
    beamWeapon: weapon.beamWeapon === true,
  });

  const { speedRange, size } = rangedToHitModifier({
    rangeYards: effectiveRange,
    targetSpeedYardsPerSecond: input.speed,
    targetSizeModifier: input.size,
  });

  const situation = input.situation ?? "normal";

  // Opportunity fire: the wider the ground being covered, the worse the shot
  // (p. 390). Watching a single line is a flat -2 whatever its length.
  const watching = isRuleOn("opportunityFire") ? weapon.watching : null;
  if (watching) {
    modifiers.push({
      label: L("OpportunityFire"),
      value: watching.coveringLine
        ? OPPORTUNITY_LINE_PENALTY
        : opportunityFirePenalty(watching.hexesWatched),
    });
  }
  // In close combat the speed/range penalty is dropped and Bulk stands in its
  // place: the target is right there, and the weapon is in the way.
  if (speedRange !== 0 && situation !== "closeCombat") {
    modifiers.push({
      label:
        effectiveRange === input.range
          ? L("SpeedRange")
          : game.i18n.format("GWORLD.Ranged.SpeedRangeUphill", { yards: effectiveRange }),
      value: speedRange,
    });
  }
  if (size !== 0) modifiers.push({ label: L("TargetSize"), value: size });

  const unseen = sightModifier(input.sight ?? "clear", false);
  if (unseen) modifiers.push(unseen);

  // Cover is a choice between three ways of dealing with it, not one modifier
  // (p. 407), so what it costs depends on which one was taken.
  if (input.cover && input.cover !== "none") {
    const shot = coverShot({ approach: input.cover });
    if (shot.modifier !== 0) {
      modifiers.push({
        label: game.i18n.localize(`GWORLD.Cover.${input.cover}`),
        value: shot.modifier,
      });
    }
  }

  if (situation !== "normal") {
    modifiers.push({ label: L("Bulk"), value: bulkPenalty(weapon.bulk, situation) });
  }

  // A Move and Attack loses the benefit of having aimed, whatever was ticked,
  // and so does anyone covering more than a single hex: "you cannot claim any
  // of the bonuses listed for the Aim maneuver ... Exception: if you watch a
  // single hex (only), you can Aim and Wait."
  const mayAim =
    situation !== "moveAndAttack" &&
    (!watching || (!watching.coveringLine && canAimWhileWatching(watching.hexesWatched)));
  if (input.aimed && mayAim && weapon.accuracy + weapon.scopeBonus !== 0) {
    modifiers.push({ label: L("Accuracy"), value: weapon.accuracy + weapon.scopeBonus });
  }
  const rapidFire = rapidFireBonus(input.shots ?? 1);
  if (rapidFire !== 0) modifiers.push({ label: L("RapidFire"), value: rapidFire });
  if (input.modifier !== 0) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Chat.Situational"), value: input.modifier });
  }

  return modifiers;
}

/**
 * Asks for a single number, for the handful of rolls that need one figure and
 * no options at all.
 *
 * Returns null when the dialog is dismissed, which cancels whatever asked.
 */
export async function promptForNumber(options: {
  title: string;
  label: string;
  initial?: number;
}): Promise<number | null> {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: options.title },
    content: `<div class="gworld">
      <label style="display:flex;align-items:center;gap:8px">
        <span>${options.label}</span>
        <input type="number" name="value" value="${options.initial ?? 0}" step="1" min="0"
               autofocus style="width:90px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const input = button
          .closest<HTMLElement>(".application")
          ?.querySelector<HTMLInputElement>('input[name="value"]');
        return Number(input?.value ?? 0);
      },
    },
    rejectClose: false,
  });

  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

/**
 * The markup for the called shot select, and what each option costs.
 *
 * Offered on every attack because the penalty is the whole decision: going for
 * the skull is -7 and going for the eye is -9, and a system that let you pick
 * the location only after the dice had landed was giving those away.
 */
function calledShotField(type: DamageType, tightBeam: boolean): string {
  const options = shotOptions(type, tightBeam)
    .map((option) => {
      const cost = option.penalty === 0 ? "" : ` (${option.penalty})`;
      return `<option value="${option.value}">${option.label}${cost}</option>`;
    })
    .join("");

  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
    <span>${game.i18n.localize("GWORLD.CalledShot.Label")}</span>
    <select name="calledShot" style="width:180px">${options}</select>
  </label>`;
}

/** What a chosen called shot costs, as a modifier line. */
function calledShotModifier(value: string, type: DamageType, tightBeam: boolean): {
  shot: CalledShot | null;
  modifier: RollModifier | null;
} {
  const shot = parseShot(value);
  if (shot === null) return { shot: null, modifier: null };

  const option = shotOptions(type, tightBeam).find((entry) => entry.value === value);
  if (!option || option.penalty === 0) return { shot, modifier: null };

  return { shot, modifier: { label: option.label, value: option.penalty } };
}

/**
 * The choices offered for what an attacker can see, worst first.
 *
 * Offered on every attack because it applies to every attack: a fight in a dark
 * room is not an exception, it is Tuesday.
 */
const SIGHT_OPTIONS: readonly Sight[] = ["clear", "positionKnown", "foeUnseen", "blind"];

/** The markup for the sight select, and the modifier it resolves to. */
function sightField(): string {
  const options = SIGHT_OPTIONS.map(
    (sight) =>
      `<option value="${sight}">${game.i18n.localize(`GWORLD.Sight.${sight}`)}</option>`,
  ).join("");

  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
    <span>${game.i18n.localize("GWORLD.Sight.Label")}</span>
    <select name="sight" style="width:150px">${options}</select>
  </label>`;
}

/** What the chosen sight costs, as a modifier line. */
function sightModifier(sight: Sight, lightSource: boolean): RollModifier | null {
  const penalty = attackWithoutSight({ sight, lightSource });
  if (penalty.modifier === 0) return null;
  return {
    label: game.i18n.localize(`GWORLD.Sight.${sight}`),
    value: penalty.modifier,
  };
}

/**
 * Asks what a melee attack is trading, before the roll.
 *
 * Deceptive Attack and Rapid Strike are both choices made before rolling
 * (pp. 369-370), and both cost skill, so they belong in the same place as the
 * situational modifier rather than being typed in as one.
 *
 * Returns null when the dialog is dismissed, which cancels the roll.
 */
export async function promptForMeleeAttack(options: {
  effectiveSkill: number;
  /** What the weapon does, which decides where it can be aimed. */
  damageType: DamageType;
  /** Levels of the Dual-Weapon Attack technique, which buy the -4 back. */
  dualWeaponTechnique?: number;
  /** Ambidexterity, or full Off-Hand Weapon Training. */
  ambidextrous?: boolean;
  /** Levels of Off-Hand Weapon Training, for somebody who is not. */
  offHandTraining?: number;
}): Promise<{
  modifiers: RollModifier[];
  defensePenalty: number;
  /** FP the chosen options cost, to be paid before the roll. */
  fatigue: number;
  /** True when Mighty Blows was bought, for the damage roll to collect. */
  mightyBlows: boolean;
  /** Where it was aimed, for the damage roll to collect. */
  calledShot: CalledShot | null;
  /** True when the blow was struck with the flat or the butt. */
  turned: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Melee.${key}`);

  // Only a cutting or impaling weapon has a flat or a butt to hit with, so the
  // option is offered only where there is something to turn.
  const turnable = turnedBlade({ type: options.damageType, damage: { dice: 1, adds: 0 } }) !== null;
  const E = (key: string) => game.i18n.localize(`GWORLD.ExtraEffort.${key}`);
  const deceptionAllowed = isRuleOn("deceptiveAttack");
  const rapidAllowed = isRuleOn("rapidStrike");
  const dualAllowed = isRuleOn("dualWeaponAttack");
  const effortAllowed = isRuleOn("extraEffort");

  // A fighter at skill 11 or less cannot buy any deception at all, so they are
  // not offered a field that can only be left at zero. The ceiling shown is
  // against the unmodified skill, which is all that is known before the
  // situational modifier is typed; what is actually taken is clamped again
  // afterwards, against the skill the modifier leaves.
  const most = deceptionAllowed ? maxDeception(options.effectiveSkill) : 0;
  const deceptiveField = most > 0
    ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
         <span>${L("Deceptive")} (0-${most})</span>
         <input type="number" name="deceptive" value="0" min="0" max="${most}" step="1" style="width:90px">
       </label>`
    : deceptionAllowed
      ? `<p style="margin:0;font-size:11px;opacity:0.8">${L("NoDeception")}</p>`
      : "";

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      ${deceptiveField}
      ${rapidAllowed
        ? `<label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="rapid">
             <span>${L("RapidStrike")} (${RAPID_STRIKE_PENALTY})</span>
           </label>`
        : ""}
      ${effortAllowed && rapidAllowed
        ? `<label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="flurry">
             <span>${E("Flurry")} (${flurryOfBlowsPenalty()}, ${EXTRA_EFFORT_FP} FP)</span>
           </label>`
        : ""}
      ${dualAllowed
        ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
             <span>${game.i18n.localize("GWORLD.Melee.DualWeapon")}</span>
             <select name="dual" style="width:150px">
               <option value="no">${game.i18n.localize("GWORLD.Melee.DualNone")}</option>
               <option value="primary">${game.i18n.localize("GWORLD.Melee.DualPrimary")}</option>
               <option value="off">${game.i18n.localize("GWORLD.Melee.DualOff")}</option>
             </select>
           </label>`
        : ""}
      ${effortAllowed
        ? `<label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="mighty">
             <span>${E("MightyBlows")} (${EXTRA_EFFORT_FP} FP)</span>
           </label>`
        : ""}
      ${calledShotField(options.damageType, false)}
      ${turnable
        ? `<label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="turned">
             <span>${game.i18n.localize("GWORLD.Subdue.Turned")}</span>
           </label>`
        : ""}
      ${sightField()}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize("GWORLD.Ground.Label")}</span>
        <select name="ground" style="width:150px">
          <option value="0">${game.i18n.localize("GWORLD.Ground.Level")}</option>
          <option value="3">${game.i18n.localize("GWORLD.Ground.Higher3")}</option>
          <option value="4">${game.i18n.localize("GWORLD.Ground.Higher4")}</option>
          <option value="5">${game.i18n.localize("GWORLD.Ground.Higher5")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize("GWORLD.Chat.Modifier")}</span>
        <input type="number" name="modifier" value="0" step="1" style="width:90px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const num = (name: string) =>
          Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
        const ticked = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
        return {
          deceptive: num("deceptive"),
          modifier: num("modifier"),
          rapid: ticked("rapid"),
          flurry: ticked("flurry"),
          mighty: ticked("mighty"),
          sight: (form?.querySelector<HTMLSelectElement>('select[name="sight"]')?.value ??
            "clear") as Sight,
          calledShot:
            form?.querySelector<HTMLSelectElement>('select[name="calledShot"]')?.value ?? UNAIMED,
          turned: ticked("turned"),
          ground:
            Number(form?.querySelector<HTMLSelectElement>('select[name="ground"]')?.value ?? 0) || 0,
          dual: form?.querySelector<HTMLSelectElement>('select[name="dual"]')?.value ?? "no",
        };
      },
    },
    rejectClose: false,
  });

  if (!result || typeof result !== "object") return null;
  const { deceptive, modifier, rapid, flurry, mighty, sight, calledShot, turned, ground, dual } =
    result as {
    deceptive: number;
    modifier: number;
    rapid: boolean;
    flurry: boolean;
    mighty: boolean;
    sight: Sight;
    calledShot: string;
    turned: boolean;
    ground: number;
    dual: string;
  };

  // "You may not reduce your final effective skill below 10", so the ceiling is
  // set against the skill after the situational modifier, not before it. A
  // fighter at 16 who is also at -4 for something can afford one level of
  // deception, not three.
  const deception = deceptiveAttack(options.effectiveSkill + modifier, deceptive);
  const modifiers: RollModifier[] = [];

  if (deception.attackPenalty !== 0) {
    modifiers.push({ label: L("Deceptive"), value: deception.attackPenalty });
  }
  // A Flurry of Blows buys half the Rapid Strike penalty back, so the two are
  // one modifier rather than a penalty and a refund.
  const flurried = rapid && flurry && effortAllowed;
  if (rapid) {
    modifiers.push({
      label: flurried ? `${L("RapidStrike")} + ${E("Flurry")}` : L("RapidStrike"),
      value: flurried ? flurryOfBlowsPenalty() : RAPID_STRIKE_PENALTY,
    });
  }
  // Both hands at once: each roll is separate, so this is the modifier for the
  // hand being rolled now (p. 417). The technique and Ambidexterity come off the
  // sheet rather than being asked about again.
  if (dual === "primary" || dual === "off") {
    const both = dualWeaponAttack({
      technique: options.dualWeaponTechnique ?? 0,
      ambidextrous: options.ambidextrous === true,
      offHandTraining: options.offHandTraining ?? 0,
    });
    modifiers.push({
      label: game.i18n.localize(dual === "off" ? "GWORLD.Melee.DualOff" : "GWORLD.Melee.DualPrimary"),
      value: dual === "off" ? both.offHand : both.primary,
    });
  }

  const aimed = calledShotModifier(calledShot, options.damageType, false);
  if (aimed.modifier) modifiers.push(aimed.modifier);

  const unseen = sightModifier(sight, false);
  if (unseen) modifiers.push(unseen);

  if (modifier !== 0) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Chat.Situational"), value: modifier });
  }

  // "the lower fighter is at -1 to any active defense" and worse as the drop
  // grows (p. 402). Only the defense half is applied: the rest of that rule is
  // about which locations each fighter can reach, which needs a called shot to
  // matter and a map to know.
  const levels = levelDifference(ground);
  const groundPenalty = levels.negligible ? 0 : levels.lower.defense;

  const mightyBlows = mighty && effortAllowed;
  return {
    modifiers,
    defensePenalty: deception.defensePenalty + groundPenalty,
    // Both cost a flat point each, and both are paid before the roll.
    fatigue: (flurried ? EXTRA_EFFORT_FP : 0) + (mightyBlows ? EXTRA_EFFORT_FP : 0),
    mightyBlows,
    calledShot: aimed.shot,
    turned: turned === true,
  };
}

/** Handles a click on any element carrying the damage dataset. */
export async function handleDamageAction(
  actor: any,
  event: Event,
  target: HTMLElement,
): Promise<void> {
  const { damageFormula, damageType, damageLabel, armorDivisor } = target.dataset;
  if (!damageFormula || !damageType) return;

  const modifiers = await maybePromptModifiers(event);
  if (modifiers === null) return;

  // Where the attack was aimed, so the apply control opens on that location
  // rather than asking again -- and, for a chink, so the DR it found is halved.
  const aimed = await consumeCalledShot(actor);

  // A blow struck with the flat of a blade crushes rather than cuts, and one
  // struck with the butt of a spear crushes for a point less.
  const flat = await consumeTurnedBlade(actor);

  // A Mighty Blows bought before the attack is collected here, where the dice
  // are known -- the bonus is "+2 to damage, or +1 per die if that is better".
  // It applies only to ST-based thrust and swing damage, so a force sword's
  // flat 8d collects nothing however much fatigue was spent.
  if (isRuleOn("extraEffort") && (await consumeMightyBlows(actor))) {
    // Melee only: "if you take an Attack maneuver in melee combat". A bow's
    // damage is ST-based too, and would otherwise collect a bonus bought for a
    // sword.
    if (target.dataset.melee === "1" && target.dataset.stBased === "1") {
      modifiers.push({
        label: game.i18n.localize("GWORLD.ExtraEffort.MightyBlows"),
        value: mightyBlowsBonus(parseDiceAdds(damageFormula)?.dice ?? 0),
      });
    } else {
      ui.notifications?.info(game.i18n.localize("GWORLD.ExtraEffort.NotStBased"));
    }
  }

  // A weapon whose damage cannot be parsed is not turned: substituting dice
  // for it would quietly change what the weapon does, which is worse than
  // simply hitting them with the sharp end.
  const parsed = flat ? parseDiceAdds(damageFormula) : null;
  const struck = parsed
    ? turnedBlade({
        type: damageType as DamageType,
        damage: parsed,
        reach: Number(target.dataset.reach) || 1,
      })
    : null;

  await rollDamage({
    actor,
    label: struck
      ? `${damageLabel ?? "Damage"} (${game.i18n.localize("GWORLD.Subdue.Turned")})`
      : damageLabel ?? "Damage",
    formula: struck ? formatDiceAdds(struck.damage) : damageFormula,
    damageType: struck ? struck.type : (damageType as DamageType),
    armorDivisor: Number(armorDivisor) || 1,
    ...(aimed ? { calledShot: aimed } : {}),
    explosive: target.dataset.explosive === "1",
    fragmentation: target.dataset.fragmentation ?? "",
    modifiers,
  });
}

/** Maps a roll's data-roll-type to the rules the roll should be judged by. */
function rollKind(rollType: string | undefined): RollKind {
  if (rollType === "dodge" || rollType === "parry" || rollType === "block") return "defense";
  if (rollType === "attribute") return "attribute";
  if (rollType === "attack") return "attack";
  return "skill";
}

/**
 * Shift-click asks for a situational modifier. Returns null when the prompt is
 * dismissed, meaning the caller should abandon the roll entirely.
 */
async function maybePromptModifiers(event: Event): Promise<RollModifier[] | null> {
  if (!(event as MouseEvent).shiftKey) return [];

  const value = await promptForModifier();
  if (value === null) return null;
  if (value === 0) return [];
  return [{ label: game.i18n.localize("GWORLD.Chat.Situational"), value }];
}

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  const dice = roll.dice?.[0]?.results ?? [];
  return dice.map((r: { result: number }) => r.result);
}

function describeOutcome(outcome: SuccessRollResult, kind: string): string {
  const key = outcome.criticalSuccess
    ? "CriticalSuccess"
    : outcome.criticalFailure
      ? "CriticalFailure"
      : outcome.success
        ? "Success"
        : "Failure";

  const base = game.i18n.localize(`GWORLD.Roll.${key}`);
  if (outcome.criticalSuccess || outcome.criticalFailure) return base;

  const marginKey = outcome.success ? "MarginOfSuccess" : "MarginOfFailure";
  // GURPS Lite defines no critical results for active defenses.
  const suffix = kind === "defense" ? "" : ` — ${game.i18n.localize(`GWORLD.Roll.${marginKey}`)} ${outcome.margin}`;
  return `${base}${suffix}`;
}

function outcomeClass(outcome: SuccessRollResult): string {
  if (outcome.criticalSuccess) return "crit-success";
  if (outcome.criticalFailure) return "crit-failure";
  return outcome.success ? "success" : "failure";
}
