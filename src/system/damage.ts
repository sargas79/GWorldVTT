/**
 * Applying damage to a target (GURPS Basic Set: Characters pp. 378-380).
 *
 * The rules engine already does the arithmetic: `computeInjury` takes basic
 * damage through DR, the armour divisor and the wounding modifier, and
 * `applyInjury` turns the result into a new HP total and everything that
 * follows from it. What lives here is the Foundry half -- reading a target's
 * worn armour, writing the new total back, and saying what happened.
 *
 * DR is resolved against the damage type actually being applied rather than
 * the figure the sheet shows. The sheet leads with each location's highest
 * band, which is the right thing to show a player, but mail is DR 4 against a
 * blade and DR 2 against a mace, and applying the headline would stop a mace
 * with the DR that stops a sword.
 */

import { parseVulnerability, worstVulnerability, type Vulnerability } from "../rules/vulnerability.js";
import { type ArmorPiece } from "../rules/armor.js";
import { bluntTraumaInjury } from "../rules/layered-armor.js";
import { ablativeLoss, drAgainst, drFromBelow, hardenedAgainst, remainingDr, drLostAfterWear } from "../rules/armor.js";
import { criticalDr } from "../rules/criticals.js";
import type { Arc } from "../rules/tactical.js";
import { isRuleOn } from "./optional-rules.js";
import {
  criticalBasicDamage,
  criticalShock,
  type CriticalEntry,
  type CriticalTable,
} from "../rules/criticals.js";
import { capInjury, computeInjury } from "../rules/damage.js";
import { locationDrAgainst, type HitLocation } from "../rules/hit-locations.js";
import { blastPlacementOf, INTERNAL_BLAST_WOUNDING, type BlastPlacement } from "../rules/explosions.js";
import { LARGE_AREA_LOCATIONS, largeAreaDr, largeAreaSingleLocation, type LargeAreaDr } from "../rules/large-area.js";
import { applyInjury, type InjuryConsequences } from "../rules/injury.js";
import { knockback, type KnockbackResult } from "../rules/maneuvers.js";
import { knockdownModifier, knockdownRequired } from "../rules/knockdown.js";
import { chinkDr } from "../rules/melee-situations.js";
import { woundBleeds } from "../rules/bleeding.js";
import {
  damageResistanceAtEyes,
  noTraitEffects,
  shockAfterTraits,
  traitEffects,
  type TraitEffects,
} from "../rules/trait-effects.js";
import type { DamageType } from "../rules/types.js";
import { attributeOf } from "./attributes.js";
import { loseAim } from "./aim.js";
import type { ArmorWear, DamagePool, DamageTransaction } from "./damage-undo.js";
import { syncHealthConditions } from "./conditions.js";
import { hasInjuryTolerance } from "../rules/injury-tolerance.js";
import {
  cannonFodderCollapses, cinematicExplosionInjury, knockbackStunPenalty,
} from "../rules/cinematic.js";
import { isCannonFodder } from "./cinematic.js";
import { COMBAT_HOOKS, callCombatHook, locationOverrides, type ArmorDrLine } from "./combat-extensions.js";
import { piecesAt, protectsAgainst } from "../rules/layered-armor.js";

/** A critical hit, already rolled for on one of the tables. */
export interface CriticalHit {
  table: CriticalTable;
  /** The 3d rolled on that table. */
  roll: number;
  entry: CriticalEntry;
}

/** A blow about to land. */
export interface IncomingDamage {
  /** Damage rolled, after the minimum-damage floor. */
  basicDamage: number;
  type: DamageType;
  /** Above 1 it divides the target's DR; below 1 it multiplies it. */
  armorDivisor: number;
  hitLocation: HitLocation;
  /**
   * A location a module registered, as `<module>.<key>`. `hitLocation` is
   * then its parent, which supplies the armour and anything it doesn't change.
   */
  addonLocation?: string | null;
  /**
   * The most the damage dice could have come up, for the critical results that
   * substitute maximum damage for what was rolled.
   */
  maxDamage?: number;
  /** A critical hit, whose table entry may multiply damage or halve DR. */
  critical?: CriticalHit;
  /**
   * True when the blow found a gap in the armour, which halves the DR it meets
   * (Campaigns p. 400) -- after the armour divisor, and on top of anything a
   * critical did to it.
   */
  chink?: boolean;
  /**
   * A shotgun's pellets striking as one mass multiply the target's DR as
   * well as the damage (Campaigns p. 409). One for every other blow.
   */
  drMultiplier?: number;
  /**
   * True when this is a blast and Cinematic Explosions is in play (p. 417).
   * The rolled figure then buys knockback and nothing else, and what the
   * victim loses is a token point a yard.
   */
  cinematicBlast?: boolean;
  /** What the weapon is made of, for a Vulnerability to silver (Characters p. 161). */
  material?: string;
  /**
   * How the attack was aimed (since API 1.108.0): the location called, a
   * module's location called there, and whether it went for a chink
   * (Campaigns p. 400). Null or left out for a blow nobody aimed. Where the
   * blow landed is `hitLocation`, which may differ.
   */
  calledShot?: { hitLocation: HitLocation; addonLocation: string | null; chink: boolean } | null;
  /** The attack options chosen for the attack, by `<module>.<key>` (since API 1.108.0). */
  attackOptions?: Record<string, unknown>;
  /**
   * Vulnerabilities this blow meets besides the victim's own traits (since
   * API 1.106.0; Characters p. 161), for a `gworld.injury` listener to add:
   * worn gear that makes its wearer vulnerable to a kind of damage, as
   * soaked clothing might to burning. Each is `{ form, multiplier, label? }`,
   * `form` written as a trait's is ("fire", "crushing") or a damage type's
   * code ("burn"), and it is weighed with the traits' own: the worst one that
   * applies multiplies the damage that penetrates DR, before the wounding
   * modifier.
   */
  vulnerabilities?: Vulnerability[];
  /**
   * True when "the target's DR has no effect" (Characters p. 106): a
   * Malediction. Worn armour, the target's own DR and a location's all count
   * for nothing.
   */
  ignoresDr?: boolean;
  /** Double Knockback (Characters p. 104): the shove is twice as far. */
  doubleKnockback?: boolean;
  /** An attack that shoves nobody, whatever its damage type. */
  noKnockback?: boolean;
  /**
   * A blow whose whole effect is its shove (since API 1.63.0): knockback as a
   * crushing blow's, blunt trauma where flexible armour stops it, and no other
   * injury -- what gets through DR bruises nobody further.
   */
  kineticOnly?: boolean;
  /** Surge (Characters p. 105): burning damage that does double to anything electrical, for the modules that read it (since API 1.63.0). */
  surge?: boolean;
  /**
   * A tight-beam burn (Campaigns p. 399; since API 1.97.0): a laser rather
   * than a torch, which wounds at x2 in the vitals.
   */
  tightBeam?: boolean;
  /** Yards from an explosion's centre, where the blow is one (since API 1.63.0). */
  blastDistance?: number;
  /**
   * Where a blast went off for this victim (since API 1.72.0; Campaigns
   * p. 415). `contact` is the caller's to have made maximum damage already;
   * `internal` is worked out here: no DR of any kind, the vitals, x3.
   */
  blastPlacement?: BlastPlacement | null;
  /**
   * A large-area injury (since API 1.72.0; Campaigns p. 400): DR is the
   * average of the torso's and the least-protected exposed location's, and
   * the blow is a torso hit -- unless a single location is exposed, when it is
   * an ordinary hit there.
   */
  largeArea?: boolean;
  /**
   * The locations a large-area blow is exposed to (since API 1.72.0). Left
   * out, all of them, as for a true area effect.
   */
  exposedLocations?: HitLocation[];
  /**
   * The most injury this blow may do (since API 1.73.0), for a
   * `gworld.injury` listener to set: HP (or FP) lost past it are not taken.
   * It comes on top of the Basic Set's own cap on a limb or extremity
   * (Campaigns p. 421), the lower of the two holding; the result keeps the
   * uncapped figure. Null or left out, none.
   */
  injuryCap?: number | null;
  /** Why the injury was capped, shown beside it on the applied card (since API 1.73.0). */
  injuryCapReason?: string;
  /** The first hit of a multiple-projectile shot, rolled with its own line (since API 1.73.0). */
  firstHit?: boolean;
  /** The item the blow was rolled from, where the card knows it. */
  itemUuid?: string;
  /** Where the blow came from, where its roll said (since 1.43.0): "parriedLimb" for the strike after a bare-handed parry. */
  source?: string;
  /** Which of the item's modes it was rolled from. */
  mode?: { index: number; ranged: boolean; derived?: string };
  /**
   * The arc the blow came from, where the table is playing with facing.
   * Armour marked "F" protects against the front alone (Characters p. 282);
   * null means no facing is in play, and every blow meets it.
   */
  arc?: Arc | null;
  /** A blow from underneath (since 1.63.0): a foot meets its footwear's `soleDr`. */
  fromBelow?: boolean;
}

/** What applying a blow did. */
export interface AppliedDamage {
  actorName: string;
  hitLocation: HitLocation;
  /** A module's location struck, as `<module>.<key>`, or null. */
  addonLocation: string | null;
  /** DR from worn armour alone, before the location's own is added. */
  wornDr: number;
  /** DR actually subtracted, after the location's own and the divisor. */
  effectiveDr: number;
  penetrating: number;
  woundingModifier: number;
  injury: number;
  /**
   * Injury from blunt trauma through flexible armour (Campaigns p. 379),
   * which is included in `injury` and stated apart because it is not a
   * wound: no wounding modifier was applied to it.
   */
  bluntTrauma: number;
  /** Injury discarded because it exceeded a limb's crippling threshold. */
  excessLost: number;
  /**
   * The injury before any cap (since API 1.73.0): the Basic Set's on a limb
   * or extremity, and a listener's `injuryCap`. What the wound was, as against
   * what it cost -- for bleeding, or anything else read off the wound.
   */
  uncappedInjury: number;
  /**
   * A listener's cap on this blow, where it took anything off (since API
   * 1.73.0): the cap, the injury it kept from being taken, and why.
   */
  injuryCap: { cap: number; lost: number; reason: string } | null;
  /**
   * The Vulnerability the blow met (since API 1.106.0; Characters p. 161):
   * its multiplier and what it came from -- a trait's name, or the label a
   * listener gave the gear's -- or null where none applied.
   */
  vulnerability: { multiplier: number; label: string } | null;
  crippled: boolean;
  /** True when the loss came off Fatigue Points rather than Hit Points. */
  costsFatigue: boolean;
  previous: number;
  current: number;
  max: number;
  consequences: InjuryConsequences;
  /**
   * What this application changed, for undoing it. Absent on a result that
   * only worked the damage out without applying it.
   */
  transaction?: DamageTransaction;
  /** Basic damage after a critical multiplied or maximised it. */
  basicDamage: number;
  critical: CriticalHit | null;
  /** How far the blow shoves the target, and what that costs them to stay up. */
  knockback: KnockbackResult;
  /** DR the target has of their own, under whatever they are wearing. */
  naturalDr: number;
  /**
   * A Force Field the blow met before any armour (Characters p. 47): what it
   * was worth after the divisor, and what it actually took off the blow.
   */
  forceField: { dr: number; stopped: number };
  /**
   * Whether an effect that relies on touch reaches the target. A Force Field
   * refuses one unless the attack carrying it "does enough damage to pierce
   * your DR" (p. 47); without a field, nothing is refused.
   */
  touchEffectsReach: boolean;
  /**
   * The armour items a `gworld.armorDr` listener refused against this blow,
   * by id. They stopped nothing, so none of their ablative DR is spent.
   */
  refusedPieces?: string[];
  /** The attack's armour divisor as Hardened left it (p. 47). */
  armorDivisorAfterHardening: number;
  /**
   * Modifiers the target's traits give to the HT rolls this blow calls for --
   * knockdown, staying conscious, staying alive. The rolls themselves are the
   * GM's; what the traits are worth to them is not.
   */
  htModifiers: { knockdown: number; consciousness: number; survival: number };
  /**
   * The knockdown roll this blow calls for, or null when it calls for none.
   * A major wound calls for one wherever it landed; a blow to the head or
   * vitals calls for one as soon as it causes any shock at all.
   */
  knockdown: { required: boolean; modifier: number } | null;
  /** True when a wound of this kind would bleed, which the GM may overrule. */
  bleeds: boolean;
  /**
   * The IQ roll Cinematic Knockback asks of anyone thrown about (p. 417),
   * or null when the rule is off or the blow shoved nobody.
   */
  knockbackStun: { required: boolean; penalty: number } | null;
  /** True when the injury is the token point a yard of a cinematic blast. */
  cinematicBlast: boolean;
  /** The DR a large-area blow met and the location that set it, or null (since API 1.72.0). */
  largeArea: LargeAreaDr | null;
  /** Where the blast went off for this victim, or null (since API 1.72.0). */
  blastPlacement: BlastPlacement | null;
  /**
   * True when this blow simply put a mook down (Campaigns p. 417). Nothing
   * about the wound is worth reporting then: "don't bother keeping track of
   * HP!"
   */
  collapsed: boolean;
}

/**
 * What a target's own traits do to a blow, read off their derived data.
 *
 * Falls back to nothing at all, so that a blow can be resolved against a plain
 * object -- a token with no prepared data, or a test.
 */
export function traitsOf(actor: any): TraitEffects {
  const effects = actor?.system?.derived?.traitEffects;
  return effects ? { ...noTraitEffects(), ...effects } : noTraitEffects();
}

/** The armour a target is actually wearing, as the rules engine wants it. */
export function wornArmor(actor: any): ArmorPiece[] {
  const items: any[] = [...(actor?.items ?? [])];
  return items
    .filter((item) => item.type === "armor" && item.system?.equipped)
    .map((item) => ({
      id: item.id,
      name: String(item.name ?? ""),
      dr: Number(item.system?.dr ?? 0),
      drSplit: item.system?.drSplit ?? null,
      drSplitAppliesTo: item.system?.drSplitAppliesTo ?? [],
      locations: item.system?.locations ?? [],
      flexible: item.system?.flexible === true,
      frontOnly: item.system?.frontOnly === true,
      concealable: item.system?.concealable === true,
      hardened: Number(item.system?.hardened ?? 0) || 0,
      drByLocation: (item.system?.drByLocation ?? []).map((e: { locations?: string[]; dr?: number }) => ({
        locations: (e?.locations ?? []) as HitLocation[],
        dr: Number(e?.dr ?? 0) || 0,
      })),
      ablative: item.system?.ablative ?? "none",
      drLost: Number(item.system?.drLost ?? 0) || 0,
      forceField: item.system?.forceField === true,
      soleDr: typeof item.system?.soleDr === "number" ? item.system.soleDr : null,
    }));
}

/**
 * Works out what a blow does to an actor, without writing anything.
 *
 * Separate from applying it so the numbers can be shown before -- or without --
 * changing the sheet, and so the arithmetic can be checked without a Foundry
 * document to write to.
 */
/**
 * The Vulnerabilities an actor has, read off their traits (Characters p. 161).
 * The name carries the form and the multiplier -- "Vulnerability (Silver x4)"
 * -- and so do any notes on it, for a trait whose name was left plain.
 */
export function vulnerabilitiesOf(actor: any): Vulnerability[] {
  const found: Vulnerability[] = [];
  for (const item of actor?.items ?? []) {
    if (item?.type !== "trait") continue;
    const name = String(item.name ?? "");
    if (!/vulnerab/i.test(name)) continue;
    const read = parseVulnerability(name) ?? parseVulnerability(String(item.system?.notes ?? ""));
    if (read) found.push({ ...read, label: name });
  }
  return found;
}

/**
 * Where a blow is worked out, once a blast's placement and a large-area
 * injury have had their say (since API 1.72.0). A blast inside the victim is
 * an attack on the vitals (Campaigns p. 415); a large-area blow is a torso hit
 * unless a single location was exposed (p. 400). A module's location stands
 * only for a blow that landed where it was aimed.
 */
function placedDamage(damage: IncomingDamage): { damage: IncomingDamage; largeArea: HitLocation[] | null } {
  if (blastPlacementOf(damage.blastPlacement) === "internal") {
    return { damage: { ...damage, hitLocation: "vitals", addonLocation: null }, largeArea: null };
  }
  if (damage.largeArea !== true) return { damage, largeArea: null };
  const exposed = damage.exposedLocations?.length ? damage.exposedLocations : [...LARGE_AREA_LOCATIONS];
  const single = largeAreaSingleLocation(exposed);
  if (single) {
    return {
      damage: { ...damage, hitLocation: single, ...(single === damage.hitLocation ? {} : { addonLocation: null }) },
      largeArea: null,
    };
  }
  return { damage: { ...damage, hitLocation: "torso", addonLocation: null }, largeArea: exposed };
}

export function resolveDamageAgainst(actor: any, incoming: IncomingDamage): AppliedDamage {
  const hp = actor?.system?.hp ?? { value: 0, max: 0 };
  const fp = actor?.system?.fp ?? { value: 0, max: 0 };

  const traits = traitsOf(actor);
  const placed = placedDamage(incoming);
  const damage = placed.damage;
  // "DR has no effect" on a blast inside its victim (Campaigns p. 415): not
  // worn armour, not the victim's own, not a field -- and so no Hardened to
  // step it down either.
  const internal = blastPlacementOf(damage.blastPlacement) === "internal";

  const worn = wornArmor(actor);
  const arc = isRuleOn("frontArmor") ? (damage.arc ?? null) : null;
  const { naturalDr, lines, layers } = armourAt(actor, damage, damage.hitLocation, traits, worn, arc);

  // A large-area blow meets the average of the torso's DR and the least
  // protected exposed location's, against this attack's own type (p. 400).
  // The torso's layers stand for the rest -- which of them is rigid and which
  // flexible, for blunt trauma -- and the average replaces the total.
  let largeArea: LargeAreaDr | null = null;
  if (placed.largeArea) {
    const totalAt = (location: HitLocation) => {
      const at = location === "torso" ? { naturalDr, layers } : armourAt(actor, damage, location, traits, worn, arc);
      return at.layers.totalDr + at.naturalDr + locationDrAgainst(location, damage.type);
    };
    largeArea = largeAreaDr({
      torsoDr: totalAt("torso"),
      exposed: placed.largeArea.map((location) => ({ location, dr: totalAt(location) })),
    });
  }

  return resolvePlaced(actor, damage, { hp, fp, traits, internal, naturalDr, lines, layers, largeArea });
}

/**
 * The DR an attack meets at a spot without doing any damage (since API
 * 1.105.0): what an affliction's resistance roll adds (Characters p. 35).
 *
 * It is read the way a blow's is -- worn armour, the target's own DR, a Force
 * Field and the location's own, after the modules' `gworld.armorDr` listeners
 * -- and Hardened steps the attack's divisor down as it would a blow's. The
 * figure comes back undivided, with the divisor and whether the attack ignores
 * DR as Hardened left them, for the caller to apply; an attack that ignores DR
 * meets none.
 */
export function drMetByAttack(actor: any, attack: {
  hitLocation: HitLocation;
  damageType: DamageType;
  armorDivisor: number;
  ignoresDr?: boolean;
  itemUuid?: string;
  mode?: { index: number; ranged: boolean; derived?: string } | null;
}): { dr: number; armorDivisor: number; ignoresDr: boolean } {
  const damage: IncomingDamage = {
    basicDamage: 0,
    type: attack.damageType,
    armorDivisor: attack.armorDivisor > 0 ? attack.armorDivisor : 1,
    hitLocation: attack.hitLocation,
    ...(attack.ignoresDr ? { ignoresDr: true } : {}),
    ...(attack.itemUuid ? { itemUuid: attack.itemUuid } : {}),
    ...(attack.mode ? { mode: attack.mode } : {}),
  };
  const { naturalDr, layers } = armourAt(actor, damage, attack.hitLocation, traitsOf(actor), wornArmor(actor), null);
  const hardened = hardenedAgainst(damage.armorDivisor, attack.ignoresDr === true, layers.hardened);
  if (hardened.ignoresDr) return { dr: 0, armorDivisor: 1, ignoresDr: true };
  return {
    dr: layers.totalDr + naturalDr + layers.fieldDr + locationDrAgainst(attack.hitLocation, attack.damageType),
    armorDivisor: hardened.divisor,
    ignoresDr: false,
  };
}

/** One location's armour against a blow, after the modules' `gworld.armorDr` listeners. */
function armourAt(
  actor: any,
  damage: IncomingDamage,
  location: HitLocation,
  traits: TraitEffects,
  worn: ArmorPiece[],
  arc: Arc | null,
): { naturalDr: number; lines: ArmorDrLine[]; layers: ArmourLayers } {
  // Damage Resistance is the target's own, under whatever they are wearing:
  // "each point of DR stops one point of basic damage", the same as armour.
  // A breastplate marked "F" counts against a blow from the front alone
  // (Characters p. 282), so the arc it came from is read here; the layers
  // are kept apart because blunt trauma only counts what got past the rigid.
  // What each piece is worth against this blow, offered to the modules before
  // any of it is added up (since 1.48.0): a listener may double a piece
  // against one kind of attack, refuse it against another, or harden it.
  const here = new Set(piecesAt(worn, location));
  const worns: ArmorDrLine[] = worn
    // A Force Field "protects your entire body - including your eyes - as well
    // as anything you are carrying" (Characters p. 47), wherever the blow fell.
    .filter((piece) => (piece.forceField === true || here.has(piece)) && protectsAgainst(piece, arc))
    .map((piece) => ({
      label: piece.name ?? "",
      // A Force Field covers everything, so it is read at the spot the blow
      // fell whatever its own list says (Characters p. 47).
      dr: damage.fromBelow === true ? drFromBelow(piece, damage.type, location) : drAgainst(piece, damage.type, location),
      applies: true,
      forceField: piece.forceField === true,
      flexible: piece.flexible === true,
      hardened: Math.max(0, Math.floor(piece.hardened ?? 0)),
      // Which item the line is, so a listener can read the piece's own data (since 1.56.0).
      ...(piece.id ? { itemId: piece.id } : {}),
      source: "armor" as const,
    }));
  // The target's own DR goes in beside the armour (since 1.98.0), so a rule
  // that divides or refuses "DR" for one blow -- burning liquid, which most DR
  // stops at a fifth (Campaigns p. 411) -- reaches all of it, not just what
  // is worn.
  const lines: ArmorDrLine[] = [...worns, ...naturalDrLines(actor, traits, location)];
  callCombatHook(COMBAT_HOOKS.armorDr, {
    actor,
    item: damage.itemUuid ? (fromUuidSync(damage.itemUuid) ?? null) : null,
    mode: damage.mode ?? null,
    hitLocation: location,
    damageType: damage.type,
    basicDamage: damage.basicDamage,
    // Whether the blow ignores DR, which is when a line's againstIgnoresDr is
    // read (since 1.55.0).
    ignoresDr: damage.ignoresDr === true,
    // Where the blow came from, as the card has it, whether or not the
    // table's front-only armour rule reads it (since 1.56.0).
    arc: damage.arc ?? null,
    // A blow from underneath (since 1.63.0).
    fromBelow: damage.fromBelow === true,
    // How the blow was aimed (since 1.108.0): the called shot, a chink
    // included, the module's location it landed on, and the attack options
    // chosen, so a rule about striking around armour needs no flag of its own.
    calledShot: damage.calledShot ? { ...damage.calledShot } : null,
    chink: damage.chink === true,
    addonLocation: damage.addonLocation ?? null,
    options: { ...(damage.attackOptions ?? {}) },
    lines,
  });

  const layers: ArmourLayers = { rigidDr: 0, flexibleDr: 0, totalDr: 0, fieldDr: 0, hardened: 0, fieldAgainstIgnoring: 0, armourAgainstIgnoring: 0 };
  let naturalDr = 0;
  for (const line of lines) {
    if (line.applies === false) continue;
    layers.hardened = Math.max(layers.hardened, Math.max(0, Math.floor(Number(line.hardened) || 0)));
    const dr = Math.max(0, Math.floor(Number(line.dr) || 0));
    // Natural DR is under whatever is worn, and counted apart from it: a chink
    // and blunt trauma read the two differently. A listener that makes it a
    // field (the advantage's Force Field, Characters p. 47) sends it first.
    if (line.forceField) layers.fieldDr += dr;
    else if (line.source === "natural") naturalDr += dr;
    else if (line.flexible) layers.flexibleDr += dr;
    else layers.rigidDr += dr;
    // The part a listener says still stands against an attack that ignores DR.
    const part = Math.max(0, Math.min(1, Number(line.againstIgnoresDr) || 0));
    if (part > 0) {
      if (line.forceField) layers.fieldAgainstIgnoring += Math.floor(dr * part);
      else layers.armourAgainstIgnoring += Math.floor(dr * part);
    }
  }
  layers.totalDr = layers.rigidDr + layers.flexibleDr;
  return { naturalDr, lines, layers };
}

/** The traits that give natural DR, the spot each covers, and its name for a line. */
const NATURAL_DR: ReadonlyArray<{ key: "damageResistance" | "footDr" | "nictitatingMembrane"; at: HitLocation | null; label: string }> = [
  { key: "damageResistance", at: null, label: "Damage Resistance" },
  // Hooves armour the feet and nothing else (Characters p. 42).
  { key: "footDr", at: "foot", label: "Hooves" },
  // A Nictitating Membrane the eyes alone, DR 1 a level (p. 71).
  { key: "nictitatingMembrane", at: "eye", label: "Nictitating Membrane" },
];

/**
 * The target's own DR at a spot, as `gworld.armorDr` lines (since 1.98.0).
 *
 * The figure is the one the traits add up to, which a module or worn gear may
 * have added to. Where the trait items on the actor account for all of it,
 * each is a line of its own naming the trait; where they don't, the figure is
 * one line with no trait, so nothing is counted twice or lost.
 */
function naturalDrLines(actor: any, traits: TraitEffects, location: HitLocation): ArmorDrLine[] {
  const held: any[] = [...(actor?.items ?? [])].filter((item) => item?.type === "trait");
  const lines: ArmorDrLine[] = [];
  for (const kind of NATURAL_DR) {
    if (kind.at !== null && kind.at !== location) continue;
    const total = Math.max(0, Math.floor(Number(traits[kind.key]) || 0));
    if (total <= 0) continue;
    const natural = { applies: true, forceField: false, flexible: false, hardened: 0, source: "natural" as const };
    const each = held
      .map((item) => {
        const trait = {
          name: String(item.name ?? ""),
          levels: Number(item.system?.levels ?? 0),
          specialty: String(item.system?.specialty ?? ""),
          modifiers: ((item.system?.modifiers ?? []) as Array<{ name?: string }>).map((m) => String(m?.name ?? "")),
        };
        return { item, trait, dr: traitEffects([trait])[kind.key] };
      })
      .filter((entry) => entry.dr > 0);
    const accounted = each.length > 0 && each.reduce((sum, entry) => sum + entry.dr, 0) === total;
    // Damage Resistance leaves the eyes bare unless it was bought to cover
    // them (Characters p. 46): only a trait taken as a Force Field or Partial
    // for the eyes reaches them. Where the traits don't account for the
    // figure, what does reach them is at most that figure.
    if (kind.key === "damageResistance" && location === "eye") {
      if (accounted) {
        for (const { item, trait, dr } of each) {
          if (damageResistanceAtEyes([trait]) <= 0) continue;
          lines.push({ label: String(item.name ?? kind.label), dr, ...natural, ...(item.id ? { traitId: String(item.id) } : {}) });
        }
      } else {
        const dr = Math.min(total, damageResistanceAtEyes(each.map((entry) => entry.trait)));
        if (dr > 0) lines.push({ label: kind.label, dr, ...natural });
      }
      continue;
    }
    if (accounted) {
      for (const { item, dr } of each) {
        lines.push({ label: String(item.name ?? kind.label), dr, ...natural, ...(item.id ? { traitId: String(item.id) } : {}) });
      }
    } else {
      lines.push({ label: kind.label, dr: total, ...natural });
    }
  }
  return lines;
}

/** A location's armour, added up by the layer it is in. */
interface ArmourLayers {
  rigidDr: number;
  flexibleDr: number;
  totalDr: number;
  fieldDr: number;
  hardened: number;
  fieldAgainstIgnoring: number;
  armourAgainstIgnoring: number;
}

/** The rest of {@link resolveDamageAgainst}, once the armour it meets is known. */
function resolvePlaced(actor: any, damage: IncomingDamage, context: {
  hp: any;
  fp: any;
  traits: TraitEffects;
  internal: boolean;
  naturalDr: number;
  lines: ArmorDrLine[];
  layers: ArmourLayers;
  largeArea: LargeAreaDr | null;
}): AppliedDamage {
  const { hp, fp, traits, internal, naturalDr, lines, largeArea } = context;
  // Inside the victim, nothing they wear or are stands in the way.
  const layers: ArmourLayers = internal
    ? { rigidDr: 0, flexibleDr: 0, totalDr: 0, fieldDr: 0, hardened: 0, fieldAgainstIgnoring: 0, armourAgainstIgnoring: 0 }
    : context.layers;
  const wornDr = largeArea ? largeArea.dr : layers.totalDr + naturalDr;

  // A blow that found a chink meets half the armour. It is applied to the worn
  // figure rather than inside the pipeline because natural DR is not armour
  // with gaps in it -- "joints or weak points in a suit of armor".
  const drMultiplier = Math.max(1, Math.floor(Number(damage.drMultiplier ?? 1)));

  // Hardened armour steps the attack's divisor down before any DR is read:
  // "Each level of Hardened reduces the armor divisor of an attack by one
  // step" (Characters p. 47), and six levels take one that ignores DR right
  // down to none at all.
  const hardened = internal
    ? { divisor: 1, ignoresDr: true }
    : hardenedAgainst(
        Number(damage.armorDivisor ?? 1) || 1,
        damage.ignoresDr === true,
        layers.hardened,
      );
  const armour = hardened.ignoresDr ? 0 : (damage.chink ? chinkDr(wornDr) : wornDr) * drMultiplier;

  // A critical can double or triple the blow, or replace the roll with the
  // most the dice could have given. All of that happens to basic damage, before
  // DR and before the wounding modifier.
  const critical = damage.critical?.entry.damage;
  const rolledDamage = criticalBasicDamage({
    rolled: damage.basicDamage,
    maximum: damage.maxDamage ?? damage.basicDamage,
    ...(critical ? { damage: critical } : {}),
  });

  // A Force Field "reduces the damage from attacks before armor DR" (p. 47),
  // so it comes off the rolled figure rather than adding to the armour under
  // it. It is DR like any other: the divisor divides it and a critical halves
  // or ignores it, which is what the pipeline does to the rest.
  // An attack that ignores DR meets only what a listener let stand against
  // it: that part of a force field first, then that part of the armour, each
  // off the rolled figure as a field's is, since everything else about the
  // blow -- the location's own DR included -- is still ignored.
  const fieldAgainst = hardened.ignoresDr
    ? criticalDr(layers.fieldAgainstIgnoring, critical)
    : criticalDr(Math.floor(layers.fieldDr / (hardened.divisor > 0 ? hardened.divisor : 1)), critical);
  const stoppedByField = Math.min(rolledDamage, fieldAgainst);
  const stoppedByArmour = hardened.ignoresDr
    ? Math.min(rolledDamage - stoppedByField, criticalDr(layers.armourAgainstIgnoring, critical))
    : 0;
  const basicDamage = Math.max(0, rolledDamage - stoppedByField - stoppedByArmour);

  // A location a module registered changes what it says it changes -- the
  // wounding modifier, the crippling threshold, DR of its own, the knockdown
  // roll -- and takes everything else from the Basic Set location it is part of.
  const overrides = locationOverrides(damage.addonLocation, damage.type, Number(hp.max) || 0);

  // A body with a Vulnerability is hurt worse by the thing it fears, and so
  // is one wearing something that makes it vulnerable (since API 1.106.0):
  // the worst of the traits' and the listeners' is the one that counts.
  const vulnerable = worstVulnerability({
    vulnerabilities: [...vulnerabilitiesOf(actor), ...(Array.isArray(damage.vulnerabilities) ? damage.vulnerabilities : [])],
    ...(damage.material ? { material: damage.material } : {}),
    damageType: damage.type,
  });

  // computeInjury adds the location's own natural DR itself, so it is given the
  // worn figure alone. maxHp is what caps injury to a limb at the point the
  // limb is crippled.
  const result = computeInjury({
    basicDamage,
    dr: armour + (damage.ignoresDr ? 0 : (overrides?.extraDr ?? 0)),
    ...(overrides && overrides.woundingModifier !== null ? { woundingOverride: overrides.woundingModifier } : {}),
    // A blast inside the victim is an attack on the vitals at x3 (p. 415),
    // whatever its type; a body whose Injury Tolerance sets the figure still
    // has the last word.
    ...(internal ? { woundingOverride: INTERNAL_BLAST_WOUNDING } : {}),
    ...(overrides && overrides.cripplingThreshold !== undefined ? { cripplingThreshold: overrides.cripplingThreshold } : {}),
    type: damage.type,
    // A tight-beam burn wounds at x2 in the vitals (Campaigns p. 399).
    ...(damage.tightBeam === true ? { qualifiers: { tightBeam: true } } : {}),
    // The divisor as Hardened left it, which is 1 where nothing hardened it.
    armorDivisor: hardened.divisor,
    hitLocation: damage.hitLocation,
    maxHp: Number(hp.max) || 0,
    // More than two arms or legs, and each cripples on less (p. 421).
    limbs: { arms: 2 + traits.extraArms, legs: 2 + traits.extraLegs },
    // Halving or ignoring DR is the critical's doing and belongs inside the
    // pipeline, because the tables halve what is left after the armour divisor.
    ...(critical ? { critical } : {}),
    // A Malediction ignores the location's own DR as well as the armour's,
    // which is the one place the pipeline already knows how to drop it all.
    ...(hardened.ignoresDr ? { critical: { ...(critical ?? {}), ignoreDr: true } } : {}),
    // A body that is not flesh is hurt as its substance allows.
    ...(hasInjuryTolerance(traits.injuryTolerance) ? { tolerance: traits.injuryTolerance } : {}),
    // And a Vulnerability multiplies what penetrates, before the wounding modifier.
    vulnerability: vulnerable.multiplier,
  });

  // Fatigue comes off FP, and the consequences that follow -- shock, major
  // wounds, death checks -- are read against the pool it actually cost.
  // "An attack that does crushing, cutting, impaling, or piercing damage may
  // inflict 'blunt trauma' if it fails to penetrate flexible DR" (Campaigns
  // p. 379), and only what got past anything rigid over it counts.
  const trauma =
    isRuleOn("bluntTrauma") && result.penetrating <= 0
      ? bluntTraumaInjury({
          reachingFlexible: Math.max(0, basicDamage - layers.rigidDr - naturalDr),
          flexibleDr: layers.flexibleDr,
          type: damage.type,
        })
      : 0;

  // Knockback is worked out from damage before DR, and a crushing blow causes
  // it whether or not it got through (p. 378). It comes before the injury
  // because under Cinematic Explosions the injury is worked out from it.
  const kinetic = damage.kineticOnly === true;
  const shoved = knockback({
    basicDamage,
    // A kinetic blow shoves as a crushing one does, through DR or not.
    type: kinetic ? "cr" : damage.type,
    penetratedDr: result.penetrating > 0,
    targetStrength: attributeOf(actor, "ST", Number(hp.max) || 10),
    cinematic: isRuleOn("cinematicKnockback"),
    ...(damage.doubleKnockback ? { doubled: true } : {}),
    ...(damage.noKnockback ? { suppressed: true } : {}),
  });

  const pool = result.costsFatigue ? fp : hp;
  const previous = Number(pool.value) || 0;
  const max = Number(pool.max) || 0;
  // "Explosions do no direct damage! Ignore fragmentation, too... Every yard
  // of knockback from a cinematic explosion causes a token 1 HP of crushing
  // damage" (p. 417). Whatever the pipeline made of the blast is thrown away:
  // it was only ever there to say how far the victim flew.
  const blast = damage.cinematicBlast === true;
  // Blunt trauma "is actual injury, not basic damage. There is no wounding
  // multiplier", so it is added after the pipeline rather than inside it.
  const beforeCap = blast ? cinematicExplosionInjury(shoved.yards) : kinetic ? trauma : result.injury + trauma;
  // A module's cap on this blow (since API 1.73.0), after the Basic Set's own
  // on a limb: the lower holds, and what follows from the injury -- shock,
  // the HP lost, a major wound by its size -- follows from what was kept.
  const capped = capInjury(beforeCap, damage.injuryCap);
  const injury = capped.injury;
  // A blow that crippled what it struck is a major wound whatever it cost
  // (Campaigns p. 420). Crippling is read from the wound before either cap,
  // so a listener's lower cap leaves the limb crippled and the wound major.
  const crippled = blast || kinetic ? false : result.crippled;
  const applied = applyInjury(injury, previous, max, { unkillable: traits.unkillable }, { crippled });

  // Two of the critical results change what follows from the injury rather than
  // the injury itself: one doubles shock past its usual floor, and the others
  // make a major wound of anything that penetrates, however little.
  const consequences: InjuryConsequences = {
    ...applied,
    // High Pain Threshold feels no shock at all and Low Pain Threshold feels it
    // twice; a critical's doubling is applied to whatever that left.
    shock: criticalShock(shockAfterTraits(applied.shock, traits), critical),
    majorWound:
      applied.majorWound || Boolean(critical?.majorWound && result.penetrating > 0),
  };

  // A module's location may call for the roll on any shock (API 1.22.0).
  const required = knockdownRequired({
    majorWound: consequences.majorWound,
    hitLocation: damage.hitLocation,
    shock: consequences.shock,
  }) || (overrides?.shockKnockdown === true && (consequences.shock ?? 0) !== 0);

  const record: AppliedDamage = {
    actorName: String(actor?.name ?? ""),
    hitLocation: damage.hitLocation,
    addonLocation: overrides ? (damage.addonLocation ?? null) : null,
    wornDr: armour,
    effectiveDr: result.effectiveDr,
    penetrating: result.penetrating,
    woundingModifier: result.woundingModifier,
    injury,
    // A cinematic blast threw the pipeline's figure away, and everything that
    // followed from it goes with it: a limb is not crippled, and nothing is
    // lost over the crippling threshold, by a wound the rule says never
    // happened.
    bluntTrauma: blast ? 0 : trauma,
    excessLost: blast || kinetic ? 0 : result.excessLost,
    // What the wound was before either cap: the Basic Set's limb limit and a
    // listener's. Crippling was read from it, as the book reads dismemberment
    // from the injury before its limit (p. 421).
    uncappedInjury: beforeCap + (blast || kinetic ? 0 : result.excessLost),
    injuryCap: capped.lost > 0
      ? { cap: Math.max(0, Math.floor(Number(damage.injuryCap))), lost: capped.lost, reason: String(damage.injuryCapReason ?? "") }
      : null,
    vulnerability: vulnerable.vulnerability && result.penetrating > 0 && !blast && !kinetic
      ? { multiplier: vulnerable.multiplier, label: String(vulnerable.vulnerability.label ?? vulnerable.vulnerability.form) }
      : null,
    crippled,
    costsFatigue: result.costsFatigue,
    previous,
    current: applied.currentHp,
    max,
    consequences,
    basicDamage,
    critical: damage.critical ?? null,
    knockback: shoved,
    // Being blasted off your feet leaves you reeling (p. 417). The roll is the
    // victim's to make; what it is at is not.
    knockbackStun:
      isRuleOn("cinematicKnockback") && shoved.yards > 0
        ? { required: true, penalty: knockbackStunPenalty(shoved.yards) }
        : null,
    cinematicBlast: blast,
    largeArea,
    blastPlacement: blastPlacementOf(damage.blastPlacement),
    naturalDr: internal ? 0 : naturalDr,
    forceField: { dr: fieldAgainst, stopped: stoppedByField },
    // "Effects that rely on touch ... only affect you if carried by an attack
    // that does enough damage to pierce your DR" (Characters p. 47). Without a
    // field there is nothing to refuse them.
    touchEffectsReach: fieldAgainst <= 0 || result.penetrating > 0,
    refusedPieces: lines.filter((line) => line.applies === false && line.itemId).map((line) => String(line.itemId)),
    armorDivisorAfterHardening: hardened.divisor,
    // Fit's "+1 to all HT rolls" goes on each of the three (Characters p. 55).
    htModifiers: {
      knockdown: traits.knockdown + traits.htRolls,
      consciousness: traits.consciousness + traits.htRolls,
      survival: traits.survival + traits.htRolls,
    },
    knockdown: required
      ? {
          required: true,
          modifier: knockdownModifier({
            majorWound: consequences.majorWound,
            // A module's location may set its own major-wound penalty in place
            // of the parent's, which the torso's zero leaves room for.
            hitLocation: overrides && overrides.majorWoundKnockdown !== null ? "torso" : damage.hitLocation,
            shock: consequences.shock,
            traitModifier: traits.knockdown + traits.htRolls,
          }) + (overrides?.knockdown ?? 0) + (overrides && overrides.majorWoundKnockdown !== null && consequences.majorWound ? overrides.majorWoundKnockdown : 0),
        }
      : null,
    // Nothing bleeds that has no blood, and nothing bleeds from a cinematic
    // blast: what it cost was a token point a yard for being thrown about,
    // not an open wound. "All a blast does is disarray clothing, blacken
    // faces, and ... cause knockback" (p. 417).
    bleeds:
      !blast &&
      result.injury > 0 &&
      !traits.injuryTolerance.noBlood &&
      woundBleeds(damage.type, consequences.majorWound),
    collapsed: false,
  };

  // "They collapse (unconscious or dead) if any penetrating damage gets
  // through DR ... In any event, don't bother keeping track of HP!" (p. 417).
  // A mook is not wounded by degrees, so nothing that follows from a wound
  // follows here: no shock, no major wound, no roll to stay standing. The
  // first thing that gets through is the last thing that happens to them, and
  // whether it killed them is the GM's to say.
  if (isCannonFodder(actor) && cannonFodderCollapses(result.penetrating)) {
    return {
      ...record,
      // What they lost is whatever they had. A mook already at or below zero
      // loses nothing further: they were down before this landed.
      injury: Math.max(0, previous),
      current: 0,
      consequences: {
        ...consequences,
        shock: 0,
        majorWound: false,
        consciousnessRollRequired: false,
        deathCheckRequired: false,
      },
      knockdown: null,
      bleeds: false,
      collapsed: true,
    };
  }

  return record;
}

/**
 * Applies a blow to an actor and writes the new total.
 *
 * Returns null when this user may not change that actor. Foundry refuses the
 * update anyway, but it refuses it with a permission error in the console
 * rather than something the GM can act on, so the check is made here.
 */
export async function applyDamageToActor(
  actor: any,
  damage: IncomingDamage,
): Promise<AppliedDamage | null> {
  if (!actor?.isOwner) return null;

  // A module may change the blow before it is worked out: where it lands,
  // how hard, what it meets.
  const item = damage.itemUuid ? (fromUuidSync(damage.itemUuid) ?? null) : null;
  const mode = damage.mode ?? null;
  const incoming = callCombatHook(COMBAT_HOOKS.injury, { actor, item, mode, damage: { ...damage } }).damage;

  const resolved = resolveDamageAgainst(actor, incoming);

  // Ablative DR is spent whether or not the blow got through: it "stops damage
  // once", and semi-ablative loses its point "regardless of whether the attack
  // penetrates DR" (Characters p. 47). So this comes before the early return
  // for a blow that did no injury -- armour that stopped it is still worn down.
  const worn = await spendAblativeDr(actor, incoming, resolved);

  // What this application changed, so it can be taken back: the pool, the
  // armour it wore down, and the aim it spoiled. Recorded before anything is
  // written, since afterwards the old values are gone.
  const pool: DamagePool = resolved.costsFatigue ? "fp" : "hp";
  const aimTurns = Number(actor.system?.aim?.turns ?? 0);
  const transaction: DamageTransaction = {
    actorUuid: String(actor.uuid ?? ""),
    actorName: String(actor.name ?? ""),
    pool,
    from: resolved.previous,
    to: resolved.current,
    armor: worn,
    aim: null,
    at: Date.now(),
  };

  if (resolved.injury === 0 && !resolved.collapsed) {
    callCombatHook(COMBAT_HOOKS.afterDamage, { actor, item, mode, damage: incoming, result: resolved });
    // Armour is worn down even by a blow that did no injury, so the pool it
    // never touched is recorded as unchanged rather than as a loss.
    return { ...resolved, transaction: { ...transaction, from: resolved.current } };
  }

  const path = resolved.costsFatigue ? "system.fp.value" : "system.hp.value";
  await actor.update({ [path]: resolved.current });
  // "If you are injured while aiming ... you lose your aim."
  if (aimTurns > 0) {
    transaction.aim = {
      turns: aimTurns,
      target: String(actor.system?.aim?.target ?? ""),
      bonuses: [...(actor.system?.aim?.bonuses ?? [])],
    };
  }
  await loseAim(actor, "injured");
  // And what it did, for a module with something that follows from it.
  callCombatHook(COMBAT_HOOKS.afterDamage, { actor, item, mode, damage: incoming, result: resolved });
  return { ...resolved, transaction };
}

/**
 * Takes what a blow destroyed off the ablative armour that stopped it
 * (Characters p. 47).
 *
 * Which layer stopped which point is not something the book works out, so each
 * ablative piece covering the spot is spent against the damage that reached
 * the armour: the rolled figure for a Force Field, which meets the blow first,
 * and what got past the field for everything under it.
 */
async function spendAblativeDr(actor: any, damage: IncomingDamage, resolved: AppliedDamage): Promise<ArmorWear[]> {
  // A blast inside its victim met no armour, so it wore none down.
  if (blastPlacementOf(damage.blastPlacement) === "internal") return [];
  const reachedArmour = resolved.basicDamage;
  const reachedField = reachedArmour + resolved.forceField.stopped;
  const updates: Array<Record<string, unknown>> = [];
  // What each piece lost, so an undo can put exactly that back.
  const worn: ArmorWear[] = [];

  for (const item of actor?.items ?? []) {
    if (item?.type !== "armor" || item.system?.equipped !== true) continue;
    const ablative = item.system?.ablative;
    if (ablative !== "ablative" && ablative !== "semiAblative") continue;
    // A piece refused against this blow stopped none of it.
    if (resolved.refusedPieces?.includes(String(item.id))) continue;

    const field = item.system?.forceField === true;
    const covered: string[] = item.system?.locations ?? [];
    // An empty list is whole-body coverage, and a field covers everything.
    // The location is the one the blow was worked out at, which a large-area
    // blow or a blast inside the victim moved.
    if (!field && covered.length > 0 && !covered.includes(resolved.hitLocation)) continue;

    const lost = ablativeLoss({
      ablative,
      dr: remainingDr(Number(item.system?.dr ?? 0), Number(item.system?.drLost ?? 0)),
      basicDamage: field ? reachedField : reachedArmour,
    });
    if (lost <= 0) continue;
    const before = Number(item.system?.drLost ?? 0) || 0;
    updates.push({ _id: item.id, "system.drLost": before + lost });
    worn.push({ itemId: String(item.id), from: before, to: before + lost });
  }

  if (updates.length > 0) await actor.updateEmbeddedDocuments?.("Item", updates);
  return worn;
}

/** DR worn off one piece outside a blow, as `items.wearDr` reports it. */
export interface DrWorn extends ArmorWear {
  /** The place it was worn at, or "" for the piece as a whole. */
  location: string;
  /** What wore it, as the caller gave it. */
  reason: string;
}

/**
 * Wears DR off a piece of armour for good (Characters p. 47) for something
 * other than a blow -- a corrosive, a fire, a module's own rule. The loss goes
 * into the same lost-DR count ablative spending adds to, so every figure that
 * reads the piece's DR (the damage pipeline, the sheet) sees it, and what
 * `restoreDr` gives back. It never takes the piece below 0 DR: at `location`
 * where one is given, anywhere on it otherwise.
 *
 * Null for an item that isn't armour, a user who doesn't own it, an amount
 * that isn't a positive number, or a location the piece doesn't cover.
 */
export async function wearDr(
  item: any,
  amount: number,
  options: { location?: string; reason?: string } = {},
): Promise<DrWorn | null> {
  const points = Math.floor(Number(amount));
  if (item?.type !== "armor" || !item.isOwner || !(points > 0)) return null;
  const location = String(options?.location ?? "");
  const covered: string[] = item.system?.locations ?? [];
  // An empty list is whole-body coverage, and a field covers everything.
  if (location && item.system?.forceField !== true && covered.length > 0 && !covered.includes(location)) return null;

  const from = Math.max(0, Math.floor(Number(item.system?.drLost) || 0));
  const to = drLostAfterWear({
    dr: Number(item.system?.dr ?? 0) || 0,
    drByLocation: ((item.system?.drByLocation ?? []) as Array<{ locations?: string[]; dr?: number }>).map((e) => ({
      locations: (e?.locations ?? []) as HitLocation[],
      dr: Number(e?.dr ?? 0) || 0,
    })),
    drLost: from,
    amount: points,
    ...(location ? { location: location as HitLocation } : {}),
  });
  if (to !== from) await item.update({ "system.drLost": to });
  return { itemId: String(item.id ?? ""), from, to, location, reason: String(options?.reason ?? "") };
}

/** Injury or fatigue taken off outside a damage card. */
export interface InjuryTaken {
  pool: "hp" | "fp";
  from: number;
  to: number;
  label: string;
}

/**
 * Takes a figure of injury, or of fatigue, straight off an actor: no DR, no
 * wounding modifier, no card. What follows from the new total follows as it
 * would from a blow -- the health conditions are brought into step, and an
 * injury spoils an aim (p. 364).
 *
 * Returns null when this user may not change the actor, or the amount isn't a
 * positive number.
 */
export async function takeInjury(
  actor: any,
  options: { amount: number; fatigue?: boolean; label?: string },
): Promise<InjuryTaken | null> {
  const amount = Math.floor(Number(options?.amount));
  if (!actor?.isOwner || !(amount > 0)) return null;

  const pool = options.fatigue ? "fp" : "hp";
  const from = Number(actor.system?.[pool]?.value) || 0;
  const to = from - amount;
  await actor.update({ [`system.${pool}.value`]: to });
  if (pool === "hp") await loseAim(actor, "injured");
  await syncHealthConditions(actor);
  return { pool, from, to, label: String(options.label ?? "") };
}
