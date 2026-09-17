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
import { applyDamageToActor, takeInjury, type AppliedDamage, type IncomingDamage } from "./damage.js";
import { HURTING_YOURSELF_DR, hurtingYourself } from "../rules/hurting-yourself.js";
import { applyDamageToWeapon, heavyParryCheck, parryTooHeavy, postParryTooHeavy } from "./weapon-damage.js";
import { applyDamageToShield, consumeShieldNote, noteShieldTookIt } from "./shields.js";
import { rollDamage, rollSuccess, type AttackWeaponFlag } from "./roll.js";
import { currentTargets } from "./targets.js";
import { blastAt } from "../rules/explosions.js";
import { criticalEntry, criticalHitTableFor, isUnarmedSkill } from "../rules/criticals.js";
import { BLOCKS_PER_TURN, acrobaticDefenseModifier, bareHandedParryModifier, mayTryAcrobatic, blockableAttack, canParryFlail, flailDefenseModifier, masterHalvesParry, multipleParryPenalty, parriedLimbStrikeModifier, thrownParryModifier } from "../rules/defenses.js";
import { getCombatState, setCombatState } from "./combat-extensions.js";
import { rollKnockdown } from "./knockdown.js";
import { afterSuccessRoll, successRollTags } from "./procedure-extensions.js";
import { addConsciousnessControls, consciousnessEntries } from "./consciousness.js";
import { rollDeathCheck } from "./dying.js";
import { setCondition, syncHealthConditions } from "./conditions.js";
import { catchFire, irradiate } from "./hazards.js";
import { EXTRA_EFFORT_FP, FEVERISH_DEFENSE_BONUS } from "../rules/extra-effort.js";
import { spendFatigue } from "./extra-effort.js";
import { isRuleOn } from "./optional-rules.js";
import { combatStyle } from "./settings.js";
import { arcDefense, attackArc, retreatBonus, type Arc } from "../rules/tactical.js";
import { attackDirection, facingOf } from "./hex.js";
import { tacticalOnScene } from "./settings.js";
import { handednessOf, visionOf } from "./tactical-context.js";
import { HIT_LOCATION_ORDER, type HitLocation } from "../rules/hit-locations.js";
import { defenseChoices, type DefenseChoice, type DefenseKey } from "./defense-choices.js";
import { loseAim } from "./aim.js";
import { blockingSpellsOf, castBlockingSpell } from "./casting.js";
import { addResistControls } from "./spell-resistance.js";
import { addBuySuccessControls, addGuidanceControls } from "./bonus-points.js";
import { anyPointPools } from "./roll-extensions.js";
import {
  ADDON_LOCATION_PREFIX,
  COMBAT_HOOKS,
  anyDefenseOptions,
  applyDefenseOptions,
  callCombatHook,
  defenseModifiersFor,
  defenseOptionsFor,
  hitLocationsFor,
  hookedAttackArc,
  moduleDefenseRefusals,
  type DefenseParryWeapon,
  moduleDefensesFor,
  readLocationValue,
  registeredHitLocation,
} from "./combat-extensions.js";
import { buyDefenseBack, declareFleshWound, type FleshWoundEntry, type TvActionEntry } from "./cinematic.js";
import {
  canAvertWithFatigue, facesHimSquarely, worthDeclaring, type Delivery,
} from "../rules/cinematic.js";
import { isCannonFodder } from "./cinematic.js";
import { inflict } from "./afflictions.js";
import { vehicleAboard } from "./vehicle-aboard.js";
import { defendWithoutSight } from "../rules/visibility.js";
import { occupantMayDodge } from "../rules/scale.js";
import { afflictionsOf, type Affliction } from "../rules/afflictions.js";
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
  /** The most those dice could have come up, for a critical that maximises them. */
  maxDamage?: number;
  /** Where the attack was aimed, if it was aimed anywhere. */
  hitLocation?: HitLocation;
  /** True when it went for a gap in the armour, which halves what it finds. */
  chink?: boolean;
  /** A location a module registered that the attack was aimed at, as `<module>.<key>`. */
  addonLocation?: string;
  /** Pellets striking as one: the figure the target's DR is multiplied by. */
  drMultiplier?: number;
  /** A blow aimed at a weapon rather than at its wielder (Campaigns p. 401). */
  weaponTarget?: { actorUuid: string; itemId: string; name: string };
  /** What the weapon is made of, for a Vulnerability to silver (Characters p. 161). */
  material?: string;
  /** True when DR has no effect on the blow, as for a Malediction (Characters p. 106). */
  ignoresDr?: boolean;
  /** Incendiary (Characters p. 104): the blow's flame can set things alight. */
  incendiary?: boolean;
  /** Radiation (Characters p. 104): a rad per point of basic damage rolled. */
  radiation?: boolean;
  /** Double Knockback (Characters p. 104): the shove is twice as far. */
  doubleKnockback?: boolean;
  /** An attack that shoves nobody, whatever its damage type. */
  noKnockback?: boolean;
  /** A blow whose whole effect is knockback and blunt trauma, with no other injury (since API 1.63.0). */
  kineticOnly?: boolean;
  /** The item the damage was rolled from. */
  itemUuid?: string;
  /** Where the blow came from (since 1.43.0). */
  source?: string;
  /** Which of its modes. */
  mode?: { index: number; ranged: boolean; derived?: string };
  /** The body part an unarmed blow struck with, and who struck it (Campaigns p. 379). */
  strikingPart?: HitLocation;
  strikerUuid?: string;
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

  // A blow at a weapon lands on the item, not on a token: one button, no
  // hit location, and the weapon's own DR and HP do the rest (p. 483).
  if (flag.weaponTarget) {
    addWeaponApplyControl(root, flag, flag.weaponTarget);
    return;
  }

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
    // The location the attack was aimed at, or the torso, which is what an
    // unaimed blow hits.
    if (!flag.addonLocation && location === (flag.hitLocation ?? "torso")) option.selected = true;
    select.append(option);
  }
  // Locations a module registered, offered for this damage type -- and the one
  // the attack was aimed at, even if it no longer would be.
  const aimedAt = flag.addonLocation ? registeredHitLocation(flag.addonLocation) : undefined;
  const added = hitLocationsFor({ damageType: flag.damageType });
  if (aimedAt && !added.includes(aimedAt)) added.push(aimedAt);
  for (const location of added) {
    const option = document.createElement("option");
    option.value = `${ADDON_LOCATION_PREFIX}${location.key}`;
    option.textContent = game.i18n.localize(location.label);
    if (location.key === flag.addonLocation) option.selected = true;
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

  // Armour marked "F" protects against the front alone (Characters p. 282),
  // and only a table playing with facing has arcs to tell apart: in basic
  // combat every blow meets the breastplate.
  let arcSelect: HTMLSelectElement | null = null;
  if (isRuleOn("frontArmor") && combatStyle() === "tactical") {
    arcSelect = document.createElement("select");
    arcSelect.className = "gc-location";
    arcSelect.setAttribute("aria-label", game.i18n.localize("GWORLD.Armor.StruckFrom"));
    for (const arc of ["front", "side", "back"]) {
      const option = document.createElement("option");
      option.value = arc;
      option.textContent = game.i18n.localize(`GWORLD.Tactical.${arc}`);
      arcSelect.append(option);
    }
    row.append(arcSelect);
  }

  // Whether the blow was a critical is known by whoever rolled the attack, not
  // by this card: the attack was a separate roll, possibly minutes ago. So it
  // is asked rather than assumed, and the table is rolled at the moment of
  // application, where the hit location that decides which table to read has
  // just been chosen.
  let critical: HTMLInputElement | null = null;
  let criticalLabel: HTMLLabelElement | null = null;
  if (isRuleOn("criticalTables")) {
    critical = document.createElement("input");
    critical.type = "checkbox";
    criticalLabel = document.createElement("label");
    criticalLabel.className = "gc-retreat";
    criticalLabel.append(
      critical,
      document.createTextNode(game.i18n.localize("GWORLD.Critical.CriticalHit")),
    );
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-apply-button";
  button.textContent = game.i18n.localize("GWORLD.Chat.ApplyDamage");

  button.addEventListener("click", () => {
    const where = readLocationValue(select.value) ?? { hitLocation: "torso" as HitLocation, addonLocation: null };
    void applyFromCard({
      flag,
      hitLocation: where.hitLocation,
      addonLocation: where.addonLocation,
      arc: (arcSelect?.value ?? null) as Arc | null,
      distanceYards: distance ? Math.max(0, Number(distance.value) || 0) : 0,
      critical: critical?.checked ?? false,
    });
  });

  row.append(select);
  if (distance) row.append(distance);
  if (criticalLabel) row.append(criticalLabel);
  row.append(button);
  root.append(row);
}

/**
 * A modifier as it reads beside a roll, or nothing at all when it is zero.
 *
 * "+3" says something; "+0" says the same as an empty space and takes more room
 * to say it.
 */
function signedOrBlank(value: number): string {
  if (value === 0) return "";
  return value > 0 ? `+${value}` : String(value);
}

/** Resolves the blow against every target and reports what it did. */
/**
 * Hurting Yourself (Campaigns p. 379): an unarmed blow that met DR 3+ costs
 * its striker a point of crushing damage per 5 of basic damage, up to that DR,
 * on the part they struck with and less their own DR there. A module may
 * change when it applies (API 1.32.0).
 */
async function hurtStriker(flag: DamageFlag, target: any, result: AppliedDamage, basicDamage: number): Promise<void> {
  const striker: any = await fromUuid(String(flag.strikerUuid)).catch(() => null);
  const part = flag.strikingPart;
  if (!striker || !part) return;
  const context = callCombatHook(COMBAT_HOOKS.hurtingYourself, {
    attacker: striker,
    target,
    part,
    hitLocation: result.hitLocation,
    addonLocation: result.addonLocation,
    dr: result.effectiveDr,
    basicDamage,
    minimumDr: HURTING_YOURSELF_DR,
    applies: true,
  });
  if (context.applies === false) return;
  const ownDr = Number(striker.system?.derived?.drByLocation?.[part]) || 0;
  const hurt = hurtingYourself({ basicDamage, targetDr: Number(context.dr) || 0, ownDr, minimumDr: Number(context.minimumDr) });
  if (hurt.damage <= 0) return;
  const partLabel = game.i18n.localize(`GWORLD.HitLocation.${part}`).toLowerCase();
  if (hurt.injury > 0 && striker.isOwner) {
    await takeInjury(striker, { amount: hurt.injury, label: game.i18n.localize("GWORLD.HurtingYourself.Title") });
  }
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: striker }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${game.i18n.localize("GWORLD.HurtingYourself.Title")}</span></div>
      <div class="gc-result">${foundry.utils.escapeHTML(game.i18n.format("GWORLD.HurtingYourself.Result", {
        name: String(striker.name ?? ""), damage: hurt.damage, part: partLabel, dr: ownDr, injury: hurt.injury,
      }))}</div></div>`,
  });
}

async function applyFromCard(options: {
  flag: DamageFlag;
  hitLocation: HitLocation;
  /** A module's location chosen on the card, as `<module>.<key>`; `hitLocation` is its parent. */
  addonLocation?: string | null;
  distanceYards: number;
  critical: boolean;
  arc?: Arc | null;
}): Promise<void> {
  const { flag, hitLocation, distanceYards } = options;
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

  // "Use torso armor to determine DR against explosion damage" (p. 414),
  // whatever part of them happened to be nearest.
  const struck: HitLocation = blast && !blast.direct ? "torso" : hitLocation;

  // One roll on the table, applied to everyone the blow lands on: a critical is
  // something the attacker did, not something each victim rolls separately.
  const critical = options.critical ? await rollCriticalHit(struck) : null;

  // "In cinematic combat, explosions do no direct damage... All a blast does
  // is disarray clothing, blacken faces, and (most importantly) cause
  // knockback" (p. 417). The rolled figure still travels: it is what sets how
  // far the victim flies, and a token point a yard is what that costs them.
  const cinematicBlast = Boolean(flag.explosive) && isRuleOn("cinematicExplosions");

  const damage: IncomingDamage = {
    basicDamage: blast ? blast.damage : flag.basicDamage,
    type: flag.damageType,
    armorDivisor: blast ? blast.armorDivisor : flag.armorDivisor,
    hitLocation: struck,
    // A blast meets the torso whatever was aimed at; a module's location only
    // counts for a blow that landed where it was aimed.
    ...(options.addonLocation && struck === hitLocation ? { addonLocation: options.addonLocation } : {}),
    // "If you hit, halve DR. This is cumulative with any armor divisors"
    // (p. 400), so it goes in beside the critical's halving rather than
    // instead of it.
    ...(flag.chink ? { chink: true } : {}),
    ...(flag.drMultiplier && flag.drMultiplier > 1 ? { drMultiplier: flag.drMultiplier } : {}),
    ...(flag.material ? { material: flag.material } : {}),
    ...(flag.ignoresDr ? { ignoresDr: true } : {}),
    ...(flag.doubleKnockback ? { doubleKnockback: true } : {}),
    ...(flag.noKnockback ? { noKnockback: true } : {}),
    ...(flag.kineticOnly ? { kineticOnly: true } : {}),
    ...(flag.itemUuid ? { itemUuid: flag.itemUuid } : {}),
    ...(flag.mode ? { mode: flag.mode } : {}),
    ...(flag.source ? { source: flag.source } : {}),
    // The maximum belongs to the dice as rolled, so it is only the maximum for
    // someone the blast struck directly: collateral damage has already been
    // scaled down by distance, and pairing it with the undiminished maximum
    // would let a critical hand a bystander the whole explosion.
    ...(flag.maxDamage !== undefined && (!blast || blast.direct)
      ? { maxDamage: flag.maxDamage }
      : {}),
    ...(critical ? { critical: critical.hit } : {}),
    ...(options.arc ? { arc: options.arc } : {}),
    ...(cinematicBlast ? { cinematicBlast: true } : {}),
  };

  const applied: AppliedDamage[] = [];
  const refused: string[] = [];
  const knockdowns: Array<{ actor: any; result: AppliedDamage }> = [];

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

    // A shield that turned this blow by the width of its own Defense Bonus
    // took it squarely, and takes it now (Campaigns p. 484). What punches
    // through the shield is what reaches its owner.
    const shield = await consumeShieldNote(actor);
    let incoming = damage;
    if (shield) {
      const shielded = await applyDamageToShield(actor, shield, {
        basicDamage: damage.basicDamage,
        damageType: damage.type,
        armorDivisor: damage.armorDivisor,
        hitLocation: damage.hitLocation,
        ignoresDr: (damage as any).ignoresDr === true,
      });
      if (shielded) {
        if (shielded.overpenetration <= 0) continue;
        incoming = {
          ...damage,
          basicDamage: shielded.overpenetration,
          hitLocation: shielded.through?.location ?? damage.hitLocation,
          // The shield already stood in for armour; what came through it
          // meets the wearer's own DR normally.
        };
      }
    }

    // Radiation (Characters p. 104): "whether or not the attack penetrates
    // DR, it inflicts 1 rad per point of basic damage rolled". The dose is
    // read off the figure that reached this victim, so a bystander caught by
    // the edge of a blast takes the smaller one.
    if (flag.radiation) {
      await irradiate({ actor, rads: incoming.basicDamage, protectionFactor: 1, modifier: 0 });
      // "For a toxic attack, this dosage is instead of regular damage": the
      // rads are the whole of what the attack did, so nothing is applied.
      if (incoming.type === "tox") continue;
    }

    const result = await applyDamageToActor(actor, incoming);
    // A null result is a permission refusal, which is worth naming: silently
    // skipping a target looks identical to a blow that did nothing.
    if (result) {
      applied.push(result);
      // Reeling and dead are not judgements, they are what the hit point total
      // means -- so the token says so without anybody being asked.
      await syncHealthConditions(actor);
      if (result.bleeds && isRuleOn("bleeding")) await setCondition(actor, "bleeding", true);
      // Incendiary (Characters p. 104) "gives the damage a secondary flame
      // effect that can ignite volatile material", and Campaigns p. 433 counts
      // incendiary damage with burning for what it takes to set things alight.
      // The clothes are the volatile material a victim is wearing.
      if (flag.incendiary) {
        await catchFire({ actor, basicBurningDamage: incoming.basicDamage, tightBeam: false });
      }
      // Remembered so the knockdown control on the card knows whose roll it is.
      knockdowns.push({ actor, result });
      // A bare-handed blow into hard DR hurts the hand that struck it (p. 379).
      if (flag.strikingPart && flag.strikerUuid) await hurtStriker(flag, actor, result, incoming.basicDamage);
    } else refused.push(String(actor.name ?? ""));
  }

  if (refused.length > 0) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Chat.CannotApply", { names: refused.join(", ") }),
    );
  }
  if (applied.length === 0) return;

  const content = await foundry.applications.handlebars.renderTemplate(APPLIED_TEMPLATE, {
    critical: critical
      ? {
          roll: critical.hit.roll,
          effect: game.i18n.localize(`GWORLD.Critical.${critical.hit.entry.effect}`),
          gmDecides: critical.hit.entry.gmDecides === true,
          table: game.i18n.localize(`GWORLD.Critical.Table.${critical.hit.table}`),
        }
      : null,
    label: blast && !blast.direct
      ? `${flag.label} - ${game.i18n.format("GWORLD.Chat.Collateral", { yards: distanceYards })}`
      : flag.label,
    damageType: flag.damageType,
    results: applied.map((result) => ({
      ...result,
      // Handlebars cannot compare, so anything the card branches on is decided
      // here where the rules are in view.
      stopped: result.injury === 0,
      // What a Force Field took off before the armour under it, and whether a
      // touch effect got through it (Characters p. 47).
      forceFieldStopped: result.forceField?.stopped ?? 0,
      touchEffectsReach: result.touchEffectsReach !== false,
      pool: result.costsFatigue ? "FP" : "HP",
      shock: result.consequences.shock,
      hasShock: result.consequences.shock !== 0,
      majorWound: result.consequences.majorWound,
      deathCheck: result.consequences.deathCheckRequired,
      unconsciousCheck: result.consequences.consciousnessRollRequired,
      // Each HT roll the blow calls for is shown with what the victim's traits
      // are worth to it: High Pain Threshold on the knockdown roll, Hard to
      // Subdue on staying conscious, Hard to Kill on staying alive.
      knockdownModifier: signedOrBlank(result.htModifiers.knockdown),
      survivalModifier: signedOrBlank(result.htModifiers.survival),
      unconsciousPenalty:
        result.consequences.consciousnessRollPenalty + result.htModifiers.consciousness,
      status: game.i18n.localize(`GWORLD.Health.${result.consequences.status}`),
      location: result.addonLocation && registeredHitLocation(result.addonLocation)
        ? game.i18n.localize(registeredHitLocation(result.addonLocation)!.label)
        : game.i18n.localize(`GWORLD.HitLocation.${result.hitLocation}`),
      // Knockback is reported even where the blow did no injury: a crushing
      // hit that armour stopped still shoves, which is most of the point of
      // the rule (p. 378).
      knockback: isRuleOn("knockback") && result.knockback.yards > 0 ? result.knockback : null,
      // The IQ roll for being thrown about, which only Cinematic Knockback
      // asks for, and only where the blow actually shoved them (p. 417).
      knockbackStun: isRuleOn("knockback") ? result.knockbackStun : null,
      cinematicBlast: result.cinematicBlast,
      collapsed: result.collapsed,
      // A critical may have changed what the dice said, which is worth showing
      // beside the injury rather than leaving to be inferred.
      criticalDamage:
        result.critical && result.basicDamage !== damage.basicDamage ? result.basicDamage : null,
    })),
  });

  await ChatMessage.implementation.create({
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    ...(critical ? { rolls: [critical.roll] } : {}),
    flags: {
      [SYSTEM_ID]: {
        // Whoever this blow knocked about still owes a HT roll, and the card
        // is where they are standing when they remember it.
        knockdown: knockdowns
          .filter((entry) => entry.result.knockdown?.required)
          .map((entry) => ({
            uuid: String(entry.actor.uuid ?? ""),
            name: String(entry.actor.name ?? ""),
            modifier: entry.result.knockdown!.modifier,
          })),
        // At 0 HP or less, a roll to stay conscious (Campaigns p. 419). In a
        // combat the start of each turn offers it instead.
        consciousness: game.combat?.started ? [] : consciousnessEntries(knockdowns.map((entry) => ({
          actor: entry.actor,
          required: entry.result.consequences.consciousnessRollRequired === true,
          penalty: entry.result.consequences.consciousnessRollPenalty,
        }))),
        // A blow that took somebody past a multiple of their HP owes a roll
        // against death, which is the other roll this card used only to name.
        deathCheck: knockdowns
          .filter((entry) => entry.result.consequences.deathCheckRequired)
          .map((entry) => ({
            uuid: String(entry.actor.uuid ?? ""),
            name: String(entry.actor.name ?? ""),
          })),
        // "Immediately after you suffer damage, you may declare that the
        // attack that damaged you ... was just a flesh wound" (p. 417). The
        // offer stands on the card that did the damage, which is the only
        // place "immediately after" can mean anything.
        // A mook is not offered it: they have no unspent character points, and
        // the whole of Cannon Fodder is that they go down.
        // A module's point pools may pay for it too, where one is in play.
        fleshWound: isRuleOn("fleshWounds") || anyPointPools()
          ? knockdowns
              .filter(
                (entry) =>
                  entry.actor?.type === "character" &&
                  !entry.result.collapsed &&
                  worthDeclaring(entry.result.injury),
              )
              .map((entry) => ({
                uuid: String(entry.actor.uuid ?? ""),
                name: String(entry.actor.name ?? ""),
                injury: entry.result.injury,
                fatigue: entry.result.costsFatigue,
              }))
          : [],
      },
    },
  });
}

/**
 * Rolls 3d on the critical hit table the location calls for.
 *
 * A blow to the face, skull or eye is read on the head blow table, which is a
 * good deal nastier and rounds halved DR the other way (p. 556).
 */
async function rollCriticalHit(hitLocation: HitLocation): Promise<{
  roll: any;
  hit: NonNullable<IncomingDamage["critical"]>;
}> {
  const table = criticalHitTableFor(hitLocation);
  const roll = new Roll("3d6");
  await roll.evaluate();
  return { roll, hit: { table, roll: roll.total, entry: criticalEntry(table, roll.total) } };
}

/** What an attack that connected recorded about who it was aimed at. */
interface DefenseFlag {
  attack: string;
  defenders: Array<{ uuid: string; name: string; tokenUuid?: string }>;
  /** The attacker's token, so tactical combat can work out the arc. */
  attackerToken?: string;
  /** A penalty the attack imposes on every defense, from a Deceptive Attack. */
  defensePenalty?: number;
  /** How the blow arrived, for TV Action Violence (p. 417). */
  delivery?: Delivery;
  /** What it does, blank for a grapple and anything else that does nothing. */
  damageType?: string;
  /** True for a critical hit, which no active defense may be rolled against. */
  noDefense?: boolean;
  /**
   * True where what stopped the defense was an area attack rather than a
   * critical hit (Campaigns p. 413): the defender may still dive for cover or
   * retreat out of the area, which is worth saying instead of "no defense".
   */
  areaAttack?: boolean;
  /** True for a thrown Missile spell, which may be dodged or blocked but not parried. */
  noParry?: boolean;
  /** The attacking weapon, for the parry to weigh and what it does to a defense (Characters p. 208, Campaigns p. 376). */
  weapon?: AttackWeaponFlag;
  /** The attack roll's tags (since 1.44.0). */
  tags?: string[];
  /** +1 to Dodge alone, for a target who saw the laser dot (Campaigns p. 411). */
  dodgeBonus?: number;
  /** Lines a module's attack option put on the defender's rolls, each for the defenses it names. */
  defenseModifiers?: Array<{ label: string; value: number; defenses?: DefenseKey[] }>;
  /** Where the blow was aimed, or where a miss by 1 landed (since 1.25.0). */
  calledShot?: { hitLocation: string; addonLocation: string | null };
  /** A strike at a weapon or shield: no parry, or no Defense Bonus (since 1.31.0). */
  strikeLimits?: { noParry: boolean; noDefenseBonus: boolean };
}

function defenseFlag(message: any): DefenseFlag | null {
  const flag = message?.getFlag?.(SYSTEM_ID, "defense");
  if (!flag || !Array.isArray(flag.defenders) || flag.defenders.length === 0) return null;
  return flag as DefenseFlag;
}

/** The localization key each defense is labelled by. */
const DEFENSE_LABELS: Record<DefenseKey, string> = {
  dodge: "GWORLD.Secondary.Dodge",
  parry: "GWORLD.Secondary.Parry",
  block: "GWORLD.Secondary.Block",
};

/** Why a defense is not on offer, as the card says it. */
const REFUSAL_LABELS: Record<NonNullable<DefenseChoice["reason"]>, string> = {
  helpless: "GWORLD.Tactical.Helpless",
  arc: "GWORLD.Defense.Arc",
  maneuver: "GWORLD.Defense.Maneuver",
  noParry: "GWORLD.Defense.NoParry",
  noBlock: "GWORLD.Defense.NoBlock",
  missile: "GWORLD.Defense.MissileSpell",
  strappedIn: "GWORLD.Defense.StrappedIn",
  occupant: "GWORLD.Defense.Occupant",
  flail: "GWORLD.Defense.Flail",
  blockedAlready: "GWORLD.Defense.BlockedAlready",
  unblockable: "GWORLD.Defense.Unblockable",
  cannonFodder: "GWORLD.Cinematic.CannonFodderDefense",
};

/**
 * Adds a defense control per defender to an attack that connected.
 *
 * Only defenders this user can roll for are offered, so a table of players does
 * not each see three buttons for everyone else's character. All three defenses
 * are named for each of them: one that cannot be rolled -- no shield to block
 * with, a maneuver that forfeits it, an attack from the wrong side -- is shown
 * disabled with the reason, rather than left out and leaving the defender to
 * wonder whether the card forgot it.
 *
 * The defender's name has a line of its own. A long one used to sit in the
 * same row as the buttons and push the last of them out of the card.
 */
async function addDefenseControls(message: any, html: HTMLElement): Promise<void> {
  const flag = defenseFlag(message);
  if (!flag) return;

  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-defend]")) return;

  // Who attacked: the card's speaker.
  const attacker = (() => {
    try {
      return (ChatMessage as any).implementation?.getSpeakerActor?.(message?.speaker) ?? null;
    } catch {
      return null;
    }
  })();
  for (const entry of flag.defenders) {
    const defender: any = await fromUuid(entry.uuid).catch(() => null);
    if (!defender?.isOwner) continue;

    const row = document.createElement("div");
    row.className = "gc-apply";
    row.dataset.gworldDefend = entry.uuid;

    const who = document.createElement("div");
    who.className = "gc-who";
    who.textContent = String(defender.name ?? entry.name);
    row.append(who);

    // "In all cases, the target gets no active defense against the attack"
    // (p. 556). Saying so is worth more than three buttons nobody may press.
    if (flag.noDefense) {
      const note = document.createElement("span");
      note.className = "gc-warn";
      note.textContent = game.i18n.localize(
        flag.areaAttack ? "GWORLD.Guided.NoDefense" : "GWORLD.Critical.NoDefense",
      );
      who.append(note);
      root.append(row);
      continue;
    }

    // In tactical combat the arc the attack came from decides what is even
    // possible: a blow from behind cannot be defended at all by most people,
    // and one from the side reaches only the hand on that side.
    //
    // Unless the table is playing Melee Etiquette, under which "his opponents
    // always face him one-on-one, one at a time" (p. 417): nobody gets at a
    // player character's flank or back while they are fighting hand to hand,
    // whatever the tokens on the map are doing.
    //
    // The book hangs the rule on what the PC chose to fight with; this hangs
    // it on how the blow arrived, because every character has fists and so
    // "is he fighting unarmed" has no honest answer to read off a sheet. The
    // two agree in a melee, which is the case the rule is written for, and a
    // shot is left alone either way.
    const squarely =
      isRuleOn("meleeEtiquette") &&
      defender?.type === "character" &&
      facesHimSquarely((flag.delivery ?? "ranged") as Delivery);
    const arc = squarely ? null : await tacticalArc(flag, entry, defender);
    if (arc) {
      const note = document.createElement("span");
      note.className = arc.helpless ? "gc-warn" : "gc-mod";
      note.textContent = arc.helpless
        ? game.i18n.localize("GWORLD.Tactical.Helpless")
        : game.i18n.format("GWORLD.Tactical.Arc", {
            arc: game.i18n.localize(`GWORLD.Tactical.${arc.arc}`),
          });
      who.append(note);
    }

    const deception = flag.defensePenalty ?? 0;
    const choices = defenseChoices({
      defenses: defender.system?.derived?.defenses ?? {},
      arc,
      deception,
      maneuver: defender.system?.derived?.maneuver ?? null,
      cannonFodder: isCannonFodder(defender),
    });
    // Aboard a vehicle (Campaigns p. 469): "Occupants who are free to move (not
    // strapped in, etc.) may dodge attacks specifically targeted on them" --
    // and that is all. Anybody on this card was targeted, so the question is
    // only whether they are strapped in.
    const seat = vehicleAboard(defender);
    if (seat) {
      const strappedIn = (seat.vehicle.system?.crew ?? [])
        .find((s: { uuid: string }) => s.uuid === defender.uuid)?.strappedIn === true;
      const mayDodge = occupantMayDodge({ strappedIn, targeted: true });
      for (const choice of choices) {
        if (!choice.available) continue;
        if (!mayDodge) Object.assign(choice, { available: false, shown: null, reason: "strappedIn" });
        else if (choice.key !== "dodge") Object.assign(choice, { available: false, shown: null, reason: "occupant" });
      }
    }

    // "Your target may block or dodge, but not parry" a Missile spell
    // (Characters p. 241): the parry stays on the card, refused, with why.
    if (flag.noParry) {
      for (const choice of choices) {
        if (choice.key === "parry") Object.assign(choice, { available: false, shown: null, reason: "missile" });
      }
    }
    // A strike a module's rules say can't be parried (API 1.31.0).
    if (flag.strikeLimits?.noParry) {
      for (const choice of choices) {
        if (choice.key === "parry" && choice.available) Object.assign(choice, { available: false, shown: null, reason: "noParry" });
      }
    }

    // What the attacking weapon does (Characters p. 208, Campaigns p. 376): a
    // flail can't be parried with a fencing weapon or a knife, and a flail, a
    // thrown weapon, or a weapon met bare-handed puts a penalty on the defense,
    // which the button shows.
    const parryNatural = defender.system?.derived?.defenses?.parry?.weapon?.natural === true;
    const parryWith = parryWeaponOf(defender, choices.find((c) => c.key === "parry"));

    // What a module's rules take away from this defender: a defense, with the
    // reason on the refused button, or Retreat or Feverish Defense -- and
    // whether its rules let this parry meet a flail.
    const refused = moduleDefenseRefusals({
      defender,
      attacker,
      attack: flag.attack,
      delivery: flag.delivery ?? "",
      damageType: flag.damageType ?? "",
      choices,
      arc: arc?.arc ?? null,
      attackWeapon: (flag.weapon ?? null) as Record<string, unknown> | null,
      parryWeapon: parryWith,
      defenseCounts: countsFor(defender, parryWith),
    });
    for (const choice of choices) {
      if (!choice.available) continue;
      if (choice.key === "parry" && flag.weapon?.flail && !refused.parriesFlail) {
        Object.assign(choice, { available: false, shown: null, reason: "flail" });
        continue;
      }
      // "You cannot block bullets or beam weapons", and "you may attempt to
      // block only one attack per turn" (p. 375).
      if (choice.key === "block" && !blockableAttack(flag.weapon?.skill)) {
        Object.assign(choice, { available: false, shown: null, reason: "unblockable" });
        continue;
      }
      if (choice.key === "block" && defenseCountsOf(defender).blocks >= BLOCKS_PER_TURN && !refused.blockAgain) {
        Object.assign(choice, { available: false, shown: null, reason: "blockedAlready" });
        continue;
      }
      const lines = [
        ...weaponDefenseLines(flag.weapon, flag.delivery, choice.key, choice.skillName, parryNatural),
        ...(choice.key === "parry" ? multipleParryLines(defender, parryWith) : []),
      ];
      if (choice.shown !== null) choice.shown += lines.reduce((sum, line) => sum + line.value, 0);
    }
    for (const choice of choices) {
      const refusal = refused.choices.get(choice.key);
      if (refusal !== undefined) Object.assign(choice, { available: false, shown: null, reason: "maneuver", refusal: refusal || null });
    }

    // A module may offer a bare-handed parry beside a weapon parry it refused
    // (API 1.43.0): the defender's best parry with a natural attack.
    const bareView = defender.system?.derived?.bareHandedParry;
    const bareRow = refused.bareHandedParry && parryWith && !parryWith.natural && typeof bareView?.total === "number"
      ? { parry: Number(bareView.total), skillName: String(bareView.skillName ?? "") }
      : null;
    const bareChoice: DefenseChoice | null = bareRow
      ? (() => {
          const base = choices.find((c) => c.key === "parry");
          const arcPenalty = base?.arcPenalty ?? 0;
          const skill = String(bareRow.skillName ?? "");
          const lines = [
            ...weaponDefenseLines(flag.weapon, flag.delivery, "parry", skill, true),
            ...multipleParryLines(defender, { itemId: "", twoHanded: false, natural: true, skill, isFencing: false }),
          ];
          return {
            key: "parry" as DefenseKey, available: true, total: bareRow.parry, arcPenalty, reason: null, skillName: skill, isFencing: false,
            shown: bareRow.parry + arcPenalty + deception + lines.reduce((sum, line) => sum + line.value, 0),
          };
        })()
      : null;
    const bareWeapon: DefenseParryWeapon | null = bareRow
      ? { itemId: "", twoHanded: false, natural: true, skill: String(bareRow.skillName ?? ""), isFencing: false }
      : null;

    // A Blocking spell "is cast instantly as a defense against either a
    // physical attack or another spell" (Characters p. 241), so a defender
    // who knows one is offered it beside the three ordinary defenses.
    const blocking = isRuleOn("magic") ? blockingSpellsOf(defender) : [];
    // And the defenses a module resolves itself.
    const moduleDefenses = moduleDefensesFor(defender, flag.attack);

    if (!choices.some((choice) => choice.available) && !bareChoice && blocking.length === 0 && moduleDefenses.length === 0) {
      for (const choice of choices) row.append(refusedButton(choice));
      root.append(row);
      continue;
    }

    // Retreating is an option on any defense against a melee attack, and it is
    // worth more to some defenses than others, so it is a choice made here
    // rather than a modifier typed in afterwards.
    const retreatBox = isRuleOn("retreat") && refused.retreat === null ? document.createElement("input") : null;
    const retreat = document.createElement("label");
    retreat.className = "gc-retreat";
    if (retreatBox) {
      retreatBox.type = "checkbox";
      retreat.append(retreatBox, document.createTextNode(
        game.i18n.localize("GWORLD.Tactical.Retreat"),
      ));
      row.append(retreat);
    }

    // An attacker the defender cannot see (Campaigns p. 394): "he may dodge at
    // -4. If the defender makes a Hearing-2 roll, he may also parry or block --
    // still at -4. If he is completely unaware of his attacker, he gets no
    // defense at all!" Chosen here, since only the table knows who saw what.
    const sightSelect = document.createElement("select");
    sightSelect.className = "gc-sight";
    for (const [value, key] of [
      ["sees", "Sees"], ["heard", "Heard"], ["unheard", "Unheard"], ["unaware", "Unaware"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = game.i18n.localize(`GWORLD.Defense.Unseen.${key}`);
      sightSelect.append(option);
    }
    row.append(sightSelect);

    // A point of fatigue for +2 on this one defense (Campaigns p. 357). Ticked
    // before the button is pressed, because the FP is spent whatever the roll
    // then does.
    const feverishBox = isRuleOn("extraEffort") && refused.feverish === null ? document.createElement("input") : null;
    if (feverishBox) {
      feverishBox.type = "checkbox";
      const feverish = document.createElement("label");
      feverish.className = "gc-retreat";
      feverish.append(feverishBox, document.createTextNode(
        `${game.i18n.localize("GWORLD.ExtraEffort.Feverish")} (+${FEVERISH_DEFENSE_BONUS})`,
      ));
      row.append(feverish);
    }

    // "If you have put at least one point into the Acrobatics skill, you can
    // try a 'fancy' dodge once during your turn" (Campaigns p. 375); a module
    // may widen it to other defenses, or more of them (API 1.38.0).
    const acrobatics = acrobaticsOf(defender);
    const acrobaticBox = refused.acrobatic.refusal === null && acrobatics && acrobatics.level !== null
      && mayTryAcrobatic({ points: acrobatics.points, used: defenseCountsOf(defender).acrobatic, perTurn: refused.acrobatic.perTurn })
      && refused.acrobatic.defenses.length > 0
      ? document.createElement("input")
      : null;
    if (acrobaticBox) {
      acrobaticBox.type = "checkbox";
      const acrobatic = document.createElement("label");
      acrobatic.className = "gc-retreat";
      acrobatic.append(acrobaticBox, document.createTextNode(game.i18n.localize("GWORLD.Defense.Acrobatic.Label")));
      row.append(acrobatic);
    }

    // A module's defense options, beside Retreat. Which defense each applies
    // to is settled when a defense button is pressed.
    const addonBase = {
      defender,
      attack: flag.attack,
      damageType: flag.damageType ?? "",
      delivery: flag.delivery ?? "",
      retreating: false,
      chosen: {},
      attacker,
      attackWeapon: (flag.weapon ?? null) as Record<string, unknown> | null,
      arc: arc?.arc ?? null,
      parryWeapon: parryWith,
      calledShot: flag.calledShot ?? null,
      defenseCounts: countsFor(defender, parryWith),
    };
    // Each option's control: a checkbox, or a number or a choice (API 1.25.0).
    const addonControls = anyDefenseOptions(addonBase).map((option) => {
      const label = document.createElement("label");
      label.className = "gc-retreat";
      let control: HTMLInputElement | HTMLSelectElement;
      if (option.input.type === "select") {
        const select = document.createElement("select");
        select.append(new Option("", ""));
        for (const choice of option.input.choices) select.append(new Option(game.i18n.localize(choice.label), choice.value));
        control = select;
        label.append(document.createTextNode(`${game.i18n.localize(option.label)} `), select);
      } else if (option.input.type === "number") {
        const input = document.createElement("input");
        input.type = "number";
        input.value = "0";
        input.style.width = "3.5em";
        if (option.input.min !== undefined) input.min = String(option.input.min);
        if (option.input.max !== undefined) input.max = String(option.input.max);
        control = input;
        label.append(document.createTextNode(`${game.i18n.localize(option.label)} `), input);
      } else {
        const box = document.createElement("input");
        box.type = "checkbox";
        control = box;
        label.append(box, document.createTextNode(game.i18n.localize(option.label)));
      }
      control.dataset.addonDefense = option.key;
      row.append(label);
      return { option, control };
    });
    const addonValues = (): Record<string, unknown> => Object.fromEntries(addonControls.flatMap(({ option, control }): Array<[string, unknown]> => {
      if (option.input.type === "checkbox") return (control as HTMLInputElement).checked ? [[option.key, true]] : [];
      if (option.input.type === "number") {
        const value = Number(control.value);
        return Number.isFinite(value) && value !== 0 ? [[option.key, value]] : [];
      }
      return control.value ? [[option.key, control.value]] : [];
    }));

    const defendWith = (choice: DefenseChoice, technique?: { name: string; delta: number }, parryOverride?: DefenseParryWeapon | null) => {
      const sight = sightSelect.value;
      const blind = sight === "sees"
        ? null
        : defendWithoutSight({ aware: sight !== "unaware", heardAttacker: sight === "heard" });
      if (blind && !blind.anyDefense) {
        ui.notifications?.warn(game.i18n.localize("GWORLD.Defense.Unseen.NoDefense"));
        return;
      }
      if (blind && choice.key !== "dodge" && !blind.canParryOrBlock) {
        ui.notifications?.warn(game.i18n.localize("GWORLD.Defense.Unseen.OnlyDodge"));
        return;
      }
      void rollDefense({
        defender,
        key: choice.key,
        unseenPenalty: blind?.modifier ?? 0,
        laserDodge: choice.key === "dodge" ? (flag.dodgeBonus ?? 0) : 0,
        total: choice.total,
        attack: flag.attack,
        arcPenalty: choice.arcPenalty,
        deception,
        retreating: retreatBox?.checked ?? false,
        feverish: feverishBox?.checked ?? false,
        acrobatic: acrobaticBox?.checked ? refused.acrobatic.defenses : null,
        skill: choice.skillName,
        isFencing: choice.isFencing,
        ...(flag.weapon ? { attackWeapon: flag.weapon } : {}),
        ...(flag.tags ? { attackTags: flag.tags } : {}),
        ...(flag.delivery ? { delivery: flag.delivery } : {}),
        ...(flag.damageType ? { damageType: flag.damageType } : {}),
        ...(technique ? { technique } : {}),
        addonOptions: addonValues(),
        attackDefenseModifiers: [
          ...(flag.defenseModifiers ?? []),
          // The Defense Bonus doesn't count against this strike (API 1.31.0).
          ...(flag.strikeLimits?.noDefenseBonus && Number(defender.system?.derived?.shieldDb) > 0
            ? [{ label: game.i18n.localize("GWORLD.Defense.NoDefenseBonus"), value: -Number(defender.system.derived.shieldDb) }]
            : []),
        ],
        attacker,
        arc: arc?.arc ?? null,
        parryWeapon: choice.key === "parry" ? (parryOverride ?? parryWith) : null,
        calledShot: flag.calledShot ?? null,
      });
    };

    for (const choice of choices) {
      if (!choice.available) {
        row.append(refusedButton(choice));
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-apply-button";
      button.textContent = `${game.i18n.localize(DEFENSE_LABELS[choice.key])} ${choice.shown}`;
      button.addEventListener("click", () => defendWith(choice));
      row.append(button);
    }

    if (bareChoice && bareWeapon) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-apply-button";
      button.textContent = `${game.i18n.localize("GWORLD.Defense.BareHandedParry")} ${bareChoice.shown}`;
      button.addEventListener("click", () => defendWith(bareChoice, undefined, bareWeapon));
      row.append(button);
      for (const technique of defensiveTechniquesOf(defender)) {
        if (technique.key !== "parry" || technique.skill.trim().toLowerCase() !== bareChoice.skillName.trim().toLowerCase()) continue;
        const techniqueButton = document.createElement("button");
        techniqueButton.type = "button";
        techniqueButton.className = "gc-apply-button";
        techniqueButton.textContent = `${technique.name} ${(bareChoice.shown ?? 0) + technique.delta}`;
        techniqueButton.title = game.i18n.localize("GWORLD.Technique.DefenseHint");
        techniqueButton.addEventListener("click", () => defendWith(bareChoice, { name: technique.name, delta: technique.delta }, bareWeapon));
        row.append(techniqueButton);
      }
    }

    // A defensive technique stands in for the defense it is bought off -- a
    // parry at "prerequisite skill Parry-1", say, or a dodge at "active
    // defense-2", as its own default says -- so it is offered beside
    // that defense, at the defense's figure moved by what the technique stands
    // at against it. Which situation calls for it is the player's to judge.
    for (const technique of defensiveTechniquesOf(defender)) {
      const choice = choices.find((c) => c.available && c.key === technique.key
        && (technique.key === "dodge" || c.skillName.trim().toLowerCase() === technique.skill.trim().toLowerCase()));
      if (!choice || choice.shown === null) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-apply-button";
      button.textContent = `${technique.name} ${choice.shown + technique.delta}`;
      button.title = game.i18n.localize("GWORLD.Technique.DefenseHint");
      button.addEventListener("click", () => defendWith(choice, { name: technique.name, delta: technique.delta }));
      row.append(button);
    }

    for (const spell of blocking) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-apply-button";
      button.textContent = `${spell.name} ${spell.level}${spell.cost !== null ? ` (${spell.cost})` : ""}`;
      button.title = game.i18n.localize("GWORLD.Cast.BlockingHint");
      button.addEventListener("click", () => {
        void castBlockingSpell(defender, spell.item, flag.attack);
      });
      row.append(button);
    }

    for (const defense of moduleDefenses) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-apply-button";
      button.dataset.moduleDefense = defense.defense;
      button.textContent = defense.label;
      if (defense.hint) button.title = defense.hint;
      button.addEventListener("click", () => {
        void defense.run(message);
      });
      row.append(button);
    }

    root.append(row);
  }
}

/**
 * The techniques a defender has that are bought off a defense: which defense,
 * the skill it comes with, and the technique's level against that defense's
 * own figure -- -1 for one at a Parry-1 default, 0 once bought up to the Parry
 * it cannot exceed.
 */
function defensiveTechniquesOf(defender: any): Array<{ name: string; key: DefenseKey; skill: string; delta: number }> {
  const out: Array<{ name: string; key: DefenseKey; skill: string; delta: number }> = [];
  for (const item of defender?.items ?? []) {
    if (item?.type !== "technique") continue;
    const derived = item.system?.derived ?? {};
    const key = derived.defaultFrom;
    if (key !== "parry" && key !== "block" && key !== "dodge") continue;
    if (typeof derived.level !== "number" || typeof derived.defaultBase !== "number") continue;
    out.push({
      name: String(item.name ?? ""),
      key,
      skill: String(derived.defaultSkill ?? ""),
      delta: derived.level - derived.defaultBase,
    });
  }
  return out;
}

/** This turn's defenses so far, as the system keeps them on the defender. */
interface DefenseCounts {
  /** Parries by the weapon's item id, or "bare" for bare hands. */
  parries: Record<string, number>;
  blocks: number;
  dodges: number;
  /** Acrobatic defenses (Campaigns p. 375). */
  acrobatic: number;
}

const DEFENSE_COUNTS = "defenses";

function defenseCountsOf(defender: any): DefenseCounts {
  const stored = getCombatState(defender, SYSTEM_ID, DEFENSE_COUNTS) as Partial<DefenseCounts> | undefined;
  return { parries: { ...(stored?.parries ?? {}) }, blocks: Number(stored?.blocks) || 0, dodges: Number(stored?.dodges) || 0, acrobatic: Number(stored?.acrobatic) || 0 };
}

const parryKey = (weapon: { itemId?: string; natural?: boolean } | null | undefined) => (weapon && !weapon.natural && weapon.itemId ? weapon.itemId : "bare");

/** The counts the defense hooks see: the parries already made with this weapon, and the blocks and dodges. */
function countsFor(defender: any, parryWeapon: { itemId?: string; natural?: boolean } | null | undefined): { parries: number; blocks: number; dodges: number; acrobatic: number } {
  const counts = defenseCountsOf(defender);
  return { parries: counts.parries[parryKey(parryWeapon)] ?? 0, blocks: counts.blocks, dodges: counts.dodges, acrobatic: counts.acrobatic };
}

/** Counts an acrobatic defense for the rest of the defender's turn, whether or not it worked. */
async function countAcrobatic(defender: any): Promise<void> {
  if (!defender?.isOwner) return;
  const counts = defenseCountsOf(defender);
  counts.acrobatic += 1;
  await setCombatState(defender, SYSTEM_ID, DEFENSE_COUNTS, counts, "turn");
}

/** The defender's Acrobatics skill: its points and level, or null without one. */
function acrobaticsOf(defender: any): { points: number; level: number | null } | null {
  const skill = [...(defender?.items ?? [])].find((item: any) => item?.type === "skill" && String(item.name ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase() === "acrobatics");
  if (!skill) return null;
  const level = skill.system?.derived?.level;
  return { points: Number(skill.system?.points) || 0, level: typeof level === "number" ? level : null };
}

/** Counts one more defense of this kind for the rest of the defender's turn. */
async function countDefense(defender: any, key: DefenseKey, parryWeapon: { itemId?: string; natural?: boolean } | null | undefined): Promise<void> {
  if (!defender?.isOwner) return;
  const counts = defenseCountsOf(defender);
  if (key === "parry") counts.parries[parryKey(parryWeapon)] = (counts.parries[parryKey(parryWeapon)] ?? 0) + 1;
  if (key === "block") counts.blocks += 1;
  if (key === "dodge") counts.dodges += 1;
  await setCombatState(defender, SYSTEM_ID, DEFENSE_COUNTS, counts, "turn");
}

/**
 * Whether a master parries at half the penalty with this weapon.
 *
 * Trained By A Master and Weapon Master each halve the penalty "to parry more
 * than once per turn" on the same terms as a Rapid Strike (Characters pp. 93,
 * 99): the first with an unarmed or Melee Weapon skill, the second with a
 * weapon of its class and a skill actually learned. The attack rows have
 * already made that test, so the parry reads their answer rather than asking
 * again -- and a weapon with no row of its own halves nothing.
 */
function masterTrained(defender: any, parryWeapon: DefenseParryWeapon | null): boolean {
  return masterHalvesParry(defender?.system?.derived?.melee ?? [], parryWeapon);
}

/** The multiple-parry line for a parry with this weapon (Campaigns p. 376). */
function multipleParryLines(defender: any, parryWeapon: DefenseParryWeapon | null): Array<{ label: string; value: number }> {
  const value = multipleParryPenalty(countsFor(defender, parryWeapon).parries, { fencing: parryWeapon?.isFencing === true, trained: masterTrained(defender, parryWeapon) });
  return value ? [{ label: game.i18n.localize("GWORLD.Defense.MultipleParries"), value }] : [];
}

/** The weapon a parry would be made with, as the defense hooks see it; null where there is no parry. */
function parryWeaponOf(defender: any, choice: DefenseChoice | undefined): DefenseParryWeapon | null {
  const weapon = defender?.system?.derived?.defenses?.parry?.weapon;
  if (!weapon || !choice) return null;
  const skill = String(choice.skillName ?? "");
  return {
    itemId: String(weapon.itemId ?? ""),
    twoHanded: weapon.twoHanded === true,
    natural: weapon.natural === true,
    skill,
    isFencing: choice.isFencing === true,
    parriesFlail: canParryFlail({ skill, isFencing: choice.isFencing === true }),
  };
}

/**
 * The lines the attacking weapon puts on a defense: a flail's -4 to parry and
 * -2 to block, halved for a nunchaku (Characters p. 208, Campaigns pp. 405,
 * 548); a thrown weapon's -1 to parry, or -2 for one of 1 lb. or less; and -3
 * to parry a weapon bare-handed, unless it thrusts or the parry is Judo or
 * Karate (Campaigns p. 376).
 */
function weaponDefenseLines(
  weapon: AttackWeaponFlag | undefined,
  delivery: Delivery | undefined,
  key: DefenseKey,
  skill: string,
  parryNatural: boolean,
): Array<{ label: string; value: number }> {
  const lines: Array<{ label: string; value: number }> = [];
  const flail = flailDefenseModifier(weapon?.flail ?? null, key);
  if (flail) lines.push({ label: game.i18n.localize("GWORLD.Defense.FlailLine"), value: flail });
  if (key !== "parry") return lines;
  if (delivery === "thrown" && weapon) {
    lines.push({ label: game.i18n.localize("GWORLD.Defense.ThrownLine"), value: thrownParryModifier(weapon.weight) });
  }
  const bare = bareHandedParryModifier({
    parrySkill: skill,
    bareHanded: parryNatural || isUnarmedSkill(skill),
    attackIsWeapon: delivery === "melee" || delivery === "thrown",
    attackIsThrust: weapon?.thrust === true,
  });
  if (bare) lines.push({ label: game.i18n.localize("GWORLD.Defense.BareHandedLine"), value: bare });
  return lines;
}

/**
 * "If you successfully parry an unarmed attack (bite, punch, etc.) with a
 * weapon, you may injure your attacker. Immediately roll against your skill
 * with the weapon you used to parry. This roll is at -4 if your attacker used
 * Judo or Karate." On a success he gets no defense, and damage is rolled
 * normally (Campaigns p. 376).
 */
async function strikeParriedLimb(defender: any, itemId: string, attackSkill: string | undefined): Promise<void> {
  const rows = ((defender?.system?.derived?.melee ?? []) as any[])
    .filter((row) => row.itemId === itemId && row.damageRollable && typeof row.skillLevel === "number" && row.parry !== null);
  const row = rows.sort((a, b) => (Number(b.parry) || 0) - (Number(a.parry) || 0))[0];
  if (!row) return;
  const penalty = parriedLimbStrikeModifier(attackSkill);
  const label = game.i18n.format("GWORLD.Defense.StrikeLimb", { weapon: String(row.name ?? "") });
  const outcome = await rollSuccess({
    actor: defender,
    base: row.skillLevel,
    label,
    kind: "skill",
    skill: String(row.skillName ?? ""),
    modifiers: penalty ? [{ label: game.i18n.localize("GWORLD.Defense.StrikeLimbJudoKarate"), value: penalty }] : [],
  });
  if (!outcome?.success) return;
  await rollDamage({
    actor: defender,
    label,
    formula: String(row.damage),
    damageType: row.damageType,
    armorDivisor: Number(row.armorDivisor) || 1,
    item: defender.items?.get?.(itemId) ?? null,
    mode: { index: Number(row.modeIndex) || 0, ranged: false },
    source: "parriedLimb",
  });
}

/** A defense that cannot be rolled: named, greyed, and carrying its reason. */
function refusedButton(choice: DefenseChoice): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-apply-button";
  button.disabled = true;
  button.textContent = `${game.i18n.localize(DEFENSE_LABELS[choice.key])} \u2014`;
  if (choice.reason) {
    const why = choice.refusal || game.i18n.localize(REFUSAL_LABELS[choice.reason]);
    button.title = why;
    button.setAttribute("aria-label", `${game.i18n.localize(DEFENSE_LABELS[choice.key])}: ${why}`);
  }
  return button;
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

  // A module may say the attack counts as coming from another arc (since 1.38.0).
  const { arc, side } = hookedAttackArc({ defender, attacker: attackerToken.actor ?? null, ...attackArc(facingOf(defenderToken, gridType), from) });
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

type SettledDefense = "success" | "failure" | "criticalSuccess" | "criticalFailure";

/** A listener's settled result, when it is one the card knows. */
function settledDefense(value: unknown): SettledDefense | null {
  return ["success", "failure", "criticalSuccess", "criticalFailure"].includes(String(value)) ? (value as SettledDefense) : null;
}

/**
 * A defense a module settled without a roll (since 1.43.0): the card says so,
 * and the listeners that follow a roll hear the outcome as if it were rolled.
 */
async function postSettledDefense(defender: any, key: DefenseKey, label: string, settled: SettledDefense, reason: unknown) {
  const success = settled === "success" || settled === "criticalSuccess";
  const outcome = { dice: [] as number[], roll: 0, effectiveSkill: 0, success, criticalSuccess: settled === "criticalSuccess", criticalFailure: settled === "criticalFailure", margin: 0 };
  const why = typeof reason === "string" && reason.trim() ? ` (${foundry.utils.escapeHTML(reason.trim())})` : "";
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: defender }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${foundry.utils.escapeHTML(label)}</span></div><div class="gc-result ${success ? "success" : "failure"}">${game.i18n.localize(`GWORLD.Defense.Settled.${settled}`)}${why}</div></div>`,
  });
  afterSuccessRoll({ actor: defender, label, kind: "defense", skill: "", tags: successRollTags({ kind: "defense", tags: [key] }), outcome });
  return outcome;
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
  feverish: boolean;
  /** An acrobatic defense was ticked: the defenses it may be (Campaigns p. 375, API 1.38.0), or null. */
  acrobatic?: DefenseKey[] | null;
  skill: string;
  isFencing: boolean;
  /** The attacking weapon, which a parry has to weigh, and what it does to the defense (Campaigns p. 376). */
  attackWeapon?: AttackWeaponFlag;
  /** The attack roll's tags (since 1.44.0). */
  attackTags?: string[];
  /** How the blow arrived, and what it does (p. 417). */
  delivery?: Delivery;
  damageType?: string;
  /** -4 for an attacker the defender cannot see (Campaigns p. 394), or 0. */
  unseenPenalty?: number;
  /** +1 to a Dodge against a shot whose laser dot the defender saw (p. 411). */
  laserDodge?: number;
  /** A defensive technique rolled in place of the defense, and what it stands at against it. */
  technique?: { name: string; delta: number };
  /** The modules' defense options chosen on the card, by `<module>.<key>`, with their values. */
  addonOptions?: Record<string, unknown>;
  /** Lines a module's attack option put on the defender's rolls. */
  attackDefenseModifiers?: Array<{ label: string; value: number; defenses?: DefenseKey[] }>;
  /** The attacking actor, for the modules' hooks. */
  attacker?: any;
  /** The arc the attack came from, for the modules' hooks. */
  arc?: Arc | null;
  /** The weapon the parry is made with, for the modules' hooks. */
  parryWeapon?: DefenseParryWeapon | null;
  /** Where the blow was aimed, for the modules' options. */
  calledShot?: { hitLocation: string; addonLocation: string | null } | null;
}): Promise<void> {
  const {
    defender, key, total, attack, arcPenalty, deception, retreating, feverish, skill, isFencing,
  } = options;
  const name = game.i18n.localize(DEFENSE_LABELS[key]);

  // A module's options ticked for this defense: refused ones are named and
  // the defense is not rolled, so the defender can untick and press again.
  const addonContext = {
    defender,
    defense: key,
    attack,
    damageType: options.damageType ?? "",
    delivery: options.delivery ?? "",
    retreating,
    chosen: { ...(options.addonOptions ?? {}) },
    attacker: options.attacker ?? null,
    attackWeapon: (options.attackWeapon ?? null) as Record<string, unknown> | null,
    arc: options.arc ?? null,
    parryWeapon: options.parryWeapon ?? null,
    calledShot: options.calledShot ?? null,
    defenseCounts: countsFor(defender, key === "parry" ? options.parryWeapon : null),
  };
  for (const option of defenseOptionsFor(addonContext)) {
    if (!(option.key in (options.addonOptions ?? {}))) continue;
    const why = option.refuse(addonContext);
    if (why) {
      ui.notifications?.warn(game.i18n.format("GWORLD.Addon.Refused", {
        option: game.i18n.localize(option.label), reason: game.i18n.localize(why),
      }));
      return;
    }
  }
  const addon = applyDefenseOptions(addonContext, options.addonOptions ?? {});

  // "You cannot parry a weapon heavier than your Basic Lift -- or twice BL,
  // if using a two-handed weapon. Attempts to parry anything heavier fail
  // automatically" (p. 376).
  // A bare-handed parry a module offered beside the weapon's (API 1.43.0)
  // parries with the hands, not with the weapon.
  const derivedParryWeapon = key === "parry" ? defender.system?.derived?.defenses?.parry?.weapon : undefined;
  const parryWeapon = key === "parry" && options.parryWeapon?.natural === true && derivedParryWeapon && !derivedParryWeapon.natural
    ? { itemId: "", weight: 0, quality: "good", material: "", twoHanded: false, natural: true }
    : derivedParryWeapon;
  // An unarmed attack carries no weapon, and weighs nothing -- unless a
  // module's `gworld.breakageOdds` says what it weighs (since 1.44.0).
  const attackWeapon = options.attackWeapon ?? (options.delivery === "unarmed" ? { weight: 0, material: "", swung: false } : undefined);
  const heavy = key === "parry" && attackWeapon && isRuleOn("weaponBreakage");
  if (heavy && attackWeapon) {
    const basicLift = Number(defender.system?.derived?.basicLift ?? 0) || 0;
    if (parryTooHeavy({ basicLift, twoHanded: parryWeapon?.twoHanded === true, attackWeight: attackWeapon.weight })) {
      await postParryTooHeavy(defender, attackWeapon.weight, basicLift);
      return;
    }
  }

  // Paid before the roll, and a defender who cannot pay does not get the bonus
  // -- so the defense is abandoned rather than rolled on a promise, and they
  // can press the button again without it.
  if (feverish) {
    const paid = await spendFatigue(
      defender,
      EXTRA_EFFORT_FP,
      game.i18n.localize("GWORLD.ExtraEffort.Feverish"),
    );
    if (!paid) return;
  }
  // And what the modules' options cost.
  if (addon.fatigue > 0) {
    const paid = await spendFatigue(defender, addon.fatigue, game.i18n.localize("GWORLD.ExtraEffort.Title"));
    if (!paid) return;
  }

  // An acrobatic defense rolls Acrobatics first, and counts whether or not it worked (Campaigns p. 375).
  let acrobaticLine: { label: string; value: number } | null = null;
  if (options.acrobatic) {
    if (!options.acrobatic.includes(key)) {
      ui.notifications?.warn(game.i18n.format("GWORLD.Defense.Acrobatic.NotThis", { defense: name }));
      return;
    }
    const level = acrobaticsOf(defender)?.level;
    if (typeof level !== "number") return;
    const acrobatic = await rollSuccess({
      actor: defender,
      base: level,
      label: game.i18n.format("GWORLD.Defense.Acrobatic.Roll", { defense: name }),
      skill: "Acrobatics",
      tags: ["acrobaticDefense", key],
    });
    if (!acrobatic) return;
    await countAcrobatic(defender);
    acrobaticLine = { label: game.i18n.localize("GWORLD.Defense.Acrobatic.Label"), value: acrobaticDefenseModifier(acrobatic.success) };
  }

  const modifiers = [];
  if (options.technique && options.technique.delta !== 0) {
    modifiers.push({ label: options.technique.name, value: options.technique.delta });
  }
  if (options.laserDodge) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Ranged.LaserSeen"), value: options.laserDodge });
  }
  if (options.unseenPenalty) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Defense.Unseen.Label"), value: options.unseenPenalty });
  }
  if (arcPenalty !== 0) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Tactical.ArcPenalty"), value: arcPenalty });
  }
  if (deception !== 0) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Melee.Deceptive"), value: deception });
  }
  const bareHanded = key === "parry" && (parryWeapon?.natural === true || isUnarmedSkill(skill));
  modifiers.push(...weaponDefenseLines(options.attackWeapon, options.delivery, key, skill, bareHanded));
  if (key === "parry") modifiers.push(...multipleParryLines(defender, options.parryWeapon ?? null));
  if (feverish) {
    modifiers.push({
      label: game.i18n.localize("GWORLD.ExtraEffort.Feverish"),
      value: FEVERISH_DEFENSE_BONUS,
    });
  }
  if (retreating) {
    modifiers.push({
      label: game.i18n.localize("GWORLD.Tactical.Retreat"),
      // A retreat is worth three to a Dodge and only one to most parries, but
      // three again to the parries that make superior use of mobility.
      value: retreatBonus({ defense: key, skill, isFencing }),
    });
  }
  if (acrobaticLine) modifiers.push(acrobaticLine);

  // What a module's attack option put on this defense, what the defender's
  // own options add, and whatever a module's hook adds on top.
  modifiers.push(...defenseModifiersFor(options.attackDefenseModifiers, key));
  modifiers.push(...addon.modifiers);
  const hookedDefense = callCombatHook(COMBAT_HOOKS.defenseModifiers, {
    defender, defense: key, attack, modifiers, deception, attacker: options.attacker ?? null,
    // Since 1.43.0: a listener may settle the defense without a roll.
    settle: null as string | null,
    settleLabel: null as string | null,
    // Since 1.21.0: where the blow came from, and the weapons on either side of it.
    arc: options.arc ?? null,
    attackWeapon: options.attackWeapon ? { ...options.attackWeapon } : null,
    parryWeapon: key === "parry" ? (options.parryWeapon ?? null) : null,
    // Since 1.24.0: this turn's defenses so far.
    defenseCounts: countsFor(defender, key === "parry" ? options.parryWeapon : null),
    // Since 1.27.0: whether Feverish Defense was bought for this defense.
    feverish,
    // Since 1.33.0: where the blow was aimed, and whether the defender is retreating.
    calledShot: options.calledShot ?? null,
    retreating: options.retreating === true,
  });

  // "If struck by a potentially lethal attack ... the hero can choose to
  // convert his failed defense roll into a success" (p. 417) -- but not
  // against a punch, a club or a thrown rock, unless it was aimed at his head.
  const averted =
    isRuleOn("tvActionViolence") &&
    canAvertWithFatigue({
      delivery: options.delivery ?? "ranged",
      damageType: (options.damageType || null) as DamageType | null,
    });

  const settled = settledDefense(hookedDefense?.settle);
  const outcome = settled
    ? await postSettledDefense(defender, key, game.i18n.format("GWORLD.Chat.DefendingAgainst", { defense: name, attack }), settled, hookedDefense?.settleLabel)
    : await rollSuccess({
    actor: defender,
    base: total,
    label: game.i18n.format("GWORLD.Chat.DefendingAgainst", { defense: name, attack }),
    kind: "defense",
    tags: [key],
    modifiers,
    ...(averted
      ? {
          tvAction: {
            uuid: String(defender.uuid ?? ""),
            name: String(defender.name ?? ""),
            attack,
          },
        }
      : {}),
  });

  // "If your shield's DB makes the difference between success and failure on
  // any active defense (not just a block), the blow struck the shield
  // squarely" (p. 484) -- so the next blow applied to them goes into it.
  if (outcome && !settled) {
    const took = await noteShieldTookIt(defender, {
      succeeded: outcome.success,
      margin: outcome.margin,
    });
    if (took) ui.notifications?.info(game.i18n.localize("GWORLD.Shield.TookIt"));
  }

  // "Your weapon may break if it parries anything three or more times its
  // own weight" (p. 376) -- whether or not the parry succeeded.
  if (heavy && attackWeapon) {
    await heavyParryCheck({
      defender,
      parryWeapon,
      attackWeapon,
      parried: outcome?.success === true,
      attacker: options.attacker ?? null,
      delivery: options.delivery ?? "",
      attackTags: options.attackTags ?? [],
    });
  }

  // "A failed parry against a weapon means your attacker may choose to hit his
  // original target or the arm you parried with!" (p. 376).
  const armed = options.delivery === "melee" || options.delivery === "thrown";
  if (outcome && !outcome.success && bareHanded && armed && isRuleOn("hitLocations")) {
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: defender }),
      content: `<p class="gc-note">${game.i18n.localize("GWORLD.Defense.ParriedArm")}</p>`,
    });
  }
  // And a weapon that turned an unarmed attack may strike the limb (p. 376).
  if (outcome?.success && key === "parry" && parryWeapon && !parryWeapon.natural && options.delivery === "unarmed") {
    await strikeParriedLimb(defender, parryWeapon.itemId, options.attackWeapon?.skill);
  }

  // Counted for the rest of the turn, whether or not it worked (pp. 375-376).
  if (outcome) await countDefense(defender, key, key === "parry" ? (options.parryWeapon ?? parryWeapon ?? null) : null);

  // "... or forced to make an active defense, you lose your aim."
  await loseAim(defender, "defended");

  // The modules' options that asked to hear how the defense went.
  for (const option of addon.chosen) {
    try {
      await option.after(addonContext, outcome ? { success: outcome.success, margin: outcome.margin } : null, (options.addonOptions ?? {})[option.key]);
    } catch (error) {
      console.warn(`gworld | defense option ${option.key} failed after the roll`, error);
    }
  }
}

/** The apply control for a blow aimed at a weapon (Campaigns p. 401). */
function addWeaponApplyControl(
  root: HTMLElement,
  flag: DamageFlag,
  target: NonNullable<DamageFlag["weaponTarget"]>,
): void {
  const row = document.createElement("div");
  row.className = "gc-apply";
  row.dataset.gworldApply = "";

  const who = document.createElement("span");
  who.className = "gc-who";
  who.textContent = target.name;
  row.append(who);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-apply-button";
  button.textContent = game.i18n.localize("GWORLD.Breakage.ApplyToWeapon");
  button.addEventListener("click", async () => {
    const owner: any = await fromUuid(target.actorUuid).catch(() => null);
    const item = owner?.items?.get?.(target.itemId);
    if (!item?.isOwner) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Breakage.CannotApply"));
      return;
    }
    await applyDamageToWeapon(owner, item, {
      basicDamage: flag.basicDamage,
      damageType: flag.damageType,
      armorDivisor: flag.armorDivisor,
    });
  });
  row.append(button);
  root.append(row);
}

/** What an applied blow recorded about who still owes a knockdown roll. */
interface KnockdownFlag {
  uuid: string;
  name: string;
  modifier: number;
}

/**
 * Adds a knockdown control for everyone the blow calls one for.
 *
 * On the applied-damage card rather than rolled with it: the roll is the
 * victim's to make, and they may have a say in it -- a GM ruling, a trait this
 * system does not read -- before it is made.
 */
async function addKnockdownControls(message: any, html: HTMLElement): Promise<void> {
  const entries = message?.getFlag?.(SYSTEM_ID, "knockdown") as KnockdownFlag[] | undefined;
  if (!Array.isArray(entries) || entries.length === 0) return;

  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-knockdown]")) return;

  for (const entry of entries) {
    const actor: any = await fromUuid(entry.uuid).catch(() => null);
    if (!actor?.isOwner) continue;

    const row = document.createElement("div");
    row.className = "gc-apply";
    row.dataset.gworldKnockdown = entry.uuid;

    const who = document.createElement("div");
    who.className = "gc-who";
    who.textContent = entry.name;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gc-apply-button";
    button.textContent = entry.modifier === 0
      ? game.i18n.localize("GWORLD.Knockdown.Roll")
      : `${game.i18n.localize("GWORLD.Knockdown.Roll")} ${entry.modifier > 0 ? "+" : ""}${entry.modifier}`;
    button.addEventListener("click", () => {
      button.disabled = true;
      void rollKnockdown({ actor, modifier: entry.modifier });
    });

    row.append(who, button);
    root.append(row);
  }
}

/**
 * Adds a death check control for everyone the blow calls one for.
 *
 * The same shape as the knockdown control, and for the same reason: the roll
 * belongs to the person making it, and a card that rolled it for them would
 * take the decision away from the table.
 */
async function addDeathCheckControls(message: any, html: HTMLElement): Promise<void> {
  const entries = message?.getFlag?.(SYSTEM_ID, "deathCheck") as
    | Array<{ uuid: string; name: string }>
    | undefined;
  if (!Array.isArray(entries) || entries.length === 0) return;

  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-death]")) return;

  for (const entry of entries) {
    const actor: any = await fromUuid(entry.uuid).catch(() => null);
    if (!actor?.isOwner) continue;

    const row = document.createElement("div");
    row.className = "gc-apply";
    row.dataset.gworldDeath = entry.uuid;

    const who = document.createElement("div");
    who.className = "gc-who";
    who.textContent = entry.name;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gc-apply-button";
    button.textContent = game.i18n.localize("GWORLD.Dying.Roll");
    button.addEventListener("click", () => {
      button.disabled = true;
      void rollDeathCheck({ actor });
    });

    row.append(who, button);
    root.append(row);
  }
}

/**
 * Adds the "just a flesh wound" control to whoever the blow hurt (p. 417).
 *
 * It sits on the card that wrote the damage down, and costs a character point
 * when pressed, so it is offered only to the owner and only once.
 */
async function addFleshWoundControls(message: any, html: HTMLElement): Promise<void> {
  const entries = message?.getFlag?.(SYSTEM_ID, "fleshWound") as FleshWoundEntry[] | undefined;
  if (!Array.isArray(entries) || entries.length === 0 || !(isRuleOn("fleshWounds") || anyPointPools())) return;

  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-flesh]")) return;

  for (const entry of entries) {
    const actor: any = await fromUuid(entry.uuid).catch(() => null);
    if (!actor?.isOwner) continue;

    const row = document.createElement("div");
    row.className = "gc-apply";
    row.dataset.gworldFlesh = entry.uuid;

    const who = document.createElement("div");
    who.className = "gc-who";
    who.textContent = entry.name;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gc-apply-button";
    button.textContent = game.i18n.localize("GWORLD.Cinematic.FleshWound");
    button.title = game.i18n.localize("GWORLD.Cinematic.FleshWoundHint");
    button.addEventListener("click", async () => {
      button.disabled = true;
      // A refusal -- no ownership, the rule switched off between card and
      // click -- puts the offer back rather than swallowing it.
      if (!(await declareFleshWound(actor, entry))) button.disabled = false;
    });

    row.append(who, button);
    root.append(row);
  }
}

/**
 * Adds the control that buys a failed defense back (p. 417).
 *
 * Only on a defense that failed, only where the attack was one FP can avert,
 * and only for the defender: it is their fatigue and their next turn.
 */
async function addTvActionControls(message: any, html: HTMLElement): Promise<void> {
  const entry = message?.getFlag?.(SYSTEM_ID, "tvAction") as TvActionEntry | undefined;
  if (!entry?.uuid || !isRuleOn("tvActionViolence")) return;

  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-tv]")) return;

  const actor: any = await fromUuid(entry.uuid).catch(() => null);
  if (!actor?.isOwner) return;

  const row = document.createElement("div");
  row.className = "gc-apply";
  row.dataset.gworldTv = entry.uuid;

  const who = document.createElement("div");
  who.className = "gc-who";
  who.textContent = entry.name;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-apply-button";
  button.textContent = game.i18n.localize("GWORLD.Cinematic.TvAction");
  button.title = game.i18n.localize("GWORLD.Cinematic.TvActionHint");
  button.addEventListener("click", async () => {
    button.disabled = true;
    // Nobody pays for nothing: a defender who cannot find the fatigue keeps
    // the offer.
    if (!(await buyDefenseBack(actor, entry))) button.disabled = false;
  });

  row.append(who, button);
  root.append(row);
}

/**
 * Adds the control that turns a failed resistance roll into a condition
 * (Campaigns pp. 428-429).
 *
 * Which condition it is belongs to whatever caused it -- a gas, a spell, a
 * poison -- and the compendium does not carry that, so the card asks rather
 * than guesses. The list is the book's, in the book's three bands.
 */
async function addAfflictionControls(message: any, html: HTMLElement): Promise<void> {
  const entry = message?.getFlag?.(SYSTEM_ID, "affliction") as
    | { uuid: string; name: string; label: string }
    | undefined;
  if (!entry?.uuid || !isRuleOn("afflictions")) return;

  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-afflict]")) return;

  const victim: any = await fromUuid(entry.uuid).catch(() => null);
  if (!victim?.isOwner) return;

  const row = document.createElement("div");
  row.className = "gc-apply";
  row.dataset.gworldAfflict = entry.uuid;

  const who = document.createElement("div");
  who.className = "gc-who";
  who.textContent = entry.name;

  const select = document.createElement("select");
  select.className = "gc-location";
  select.setAttribute("aria-label", game.i18n.localize("GWORLD.Affliction.Inflict"));
  for (const severity of ["irritating", "incapacitating", "mortal"] as const) {
    const group = document.createElement("optgroup");
    group.label = game.i18n.localize(`GWORLD.Affliction.Severity.${severity}`);
    for (const key of afflictionsOf(severity)) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = game.i18n.localize(`GWORLD.Affliction.Name.${key}`);
      group.append(option);
    }
    select.append(group);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-apply-button";
  button.textContent = game.i18n.localize("GWORLD.Affliction.Inflict");
  button.title = game.i18n.localize("GWORLD.Affliction.InflictHint");
  button.addEventListener("click", async () => {
    button.disabled = true;
    await inflict(victim, select.value as Affliction);
    button.disabled = false;
  });

  row.append(who, select, button);
  root.append(row);
}

/** Registers the chat hooks. Called once, at init. */
export function registerChatHooks(): void {
  Hooks.on("renderChatMessageHTML", (message: any, html: HTMLElement) => {
    addApplyControls(message, html);
    void addDefenseControls(message, html);
    void addKnockdownControls(message, html);
    void addDeathCheckControls(message, html);
    void addConsciousnessControls(message, html);
    void addResistControls(message, html);
    void addFleshWoundControls(message, html);
    void addTvActionControls(message, html);
    void addAfflictionControls(message, html);
    void addBuySuccessControls(message, html);
    void addGuidanceControls(message, html);
  });
}
