/**
 * Damage to Shields on the sheet (GURPS Basic Set: Campaigns p. 484).
 *
 * The rule triggers on a defense and lands on a damage roll, and those are
 * two separate clicks minutes apart. So a defense the shield made the
 * difference to leaves a note on the defender, and the next blow applied to
 * them goes into the shield -- the same way an aimed shot leaves a note for
 * the damage roll that follows it.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import {
  overpenetrationLocation,
  shieldCoverDr,
  shieldFallsOff,
  shieldGivesDb,
  shieldState,
  shieldTookTheBlow,
  strikeShield,
} from "../rules/shield-damage.js";
import type { DamageType } from "../rules/types.js";
import type { HitLocation } from "../rules/hit-locations.js";

const FLAG = "shieldTookIt";
const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/shield-damage.hbs`;

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Shield.${key}`, data) : game.i18n.localize(`GWORLD.Shield.${key}`);

/** The shield on the defender's arm, or null. */
export function equippedShield(actor: any): any {
  return [...(actor?.items ?? [])].find((item: any) => item.type === "shield" && item.system?.equipped) ?? null;
}

/**
 * Notes that a defense owed its success to the shield, so the blow that
 * follows lands on the shield rather than on its owner.
 *
 * "If your shield's DB makes the difference between success and failure on
 * any active defense (not just a block), the blow struck the shield
 * squarely, and may damage it."
 */
export async function noteShieldTookIt(defender: any, options: {
  succeeded: boolean;
  margin: number;
}): Promise<boolean> {
  if (!isRuleOn("damageToShields") || !defender?.isOwner) return false;
  const shield = equippedShield(defender);
  if (!shield) return false;
  const db = Number(shield.system?.db ?? 0) || 0;
  const hp = Number(shield.system?.hp ?? 0) || 0;
  if (hp <= 0) return false;
  if (!shieldTookTheBlow({ succeeded: options.succeeded, margin: options.margin, defenseBonus: db })) return false;
  await defender.setFlag(SYSTEM_ID, FLAG, shield.id);
  return true;
}

/** The shield a pending note names, clearing the note. Null when there is none. */
export async function consumeShieldNote(actor: any): Promise<any> {
  if (!isRuleOn("damageToShields")) return null;
  const id = actor?.getFlag?.(SYSTEM_ID, FLAG);
  if (!id) return null;
  if (actor.isOwner) await actor.unsetFlag(SYSTEM_ID, FLAG);
  return actor.items?.get?.(id) ?? null;
}

/** What a blow did to a shield, for the card and for whatever came through. */
export interface ShieldOutcome {
  shieldName: string;
  stopped: number;
  shieldInjury: number;
  overpenetration: number;
  fullKnockback: boolean;
  hpLost: number;
  hp: number;
  disabled: boolean;
  fellOff: boolean;
  /** Where a blow that punched through landed, once rolled for. */
  through: { location: HitLocation; die: number } | null;
}

/**
 * Puts a blow into a shield (p. 484) and says what it did.
 *
 * Anything past the shield's cover DR -- its own DR plus a quarter of its
 * HP -- comes through at the defender, on the shield arm a third of the
 * time and where the attacker aimed otherwise.
 */
export async function applyDamageToShield(
  defender: any,
  shield: any,
  damage: { basicDamage: number; damageType: DamageType; armorDivisor: number; hitLocation: HitLocation },
): Promise<ShieldOutcome | null> {
  if (!shield?.isOwner) return null;
  const dr = Number(shield.system?.dr ?? 0) || 0;
  const hp = Number(shield.system?.hp ?? 0) || 0;
  const divisor = damage.armorDivisor > 0 ? damage.armorDivisor : 1;
  // The divisor works on the shield's DR as it does on anyone's.
  const effectiveDr = divisor >= 1 ? Math.floor(dr / divisor) : Math.round(dr / divisor);
  const hit = strikeShield({ basicDamage: damage.basicDamage, dr: effectiveDr, hp });

  const before = Number(shield.system?.hpLost ?? 0) || 0;
  const after = before + hit.shieldInjury;
  if (hit.shieldInjury > 0) await shield.update({ "system.hpLost": after });

  let through: ShieldOutcome["through"] = null;
  if (hit.overpenetration > 0) {
    const die = new Roll("1d6");
    await die.evaluate();
    through = {
      location: overpenetrationLocation(die.total, damage.hitLocation) as HitLocation,
      die: die.total,
    };
  }

  const state = hp > 0 ? shieldState(after, hp) : "sound";
  const outcome: ShieldOutcome = {
    shieldName: String(shield.name ?? ""),
    stopped: hit.stopped,
    shieldInjury: hit.shieldInjury,
    overpenetration: hit.overpenetration,
    fullKnockback: hit.fullKnockback,
    hpLost: after,
    hp,
    disabled: !shieldGivesDb(state),
    fellOff: shieldFallsOff(after, hp),
    through,
  };

  // A shield beaten right off the arm is no longer equipped.
  if (outcome.fellOff) await shield.update({ "system.equipped": false });

  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    label: L("Card", { name: outcome.shieldName }),
    coverDr: shieldCoverDr(effectiveDr, hp),
    effectiveDr,
    outcome,
    locationLabel: through ? game.i18n.localize(`GWORLD.HitLocation.${through.location}`) : "",
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: defender }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
  });

  return outcome;
}
