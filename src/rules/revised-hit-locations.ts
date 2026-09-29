/**
 * The missing hit locations (GURPS Basic Set, Fourth Edition Revised, p. 566,
 * Addendum 3).
 *
 * "Combat-heavy campaigns benefit from more hit locations." Ear, nose, jaw,
 * chest and abdomen, spine, pelvis, joints and veins/arteries are aimed at
 * like any location and are parts of a Basic Set one: each names the parent
 * whose armour and critical table it uses, and what it changes about the blow.
 * The refinements to the existing locations (skull and face from behind, the
 * 1d on a random hit, crushing at the vitals) and the bodies that lack a part
 * live here too.
 *
 * Nothing in here reads a switch or a document: the system registers these
 * rows and asks the questions (see `system/revised-hit-locations.ts`).
 */

import { woundingModifierAt, type HitLocation, type LimbCounts } from "./hit-locations.js";
import type { InjuryTolerance } from "./injury-tolerance.js";
import type { DamageType } from "./types.js";

/** The registering module id, and the prefix of every location key. */
export const REVISED_MODULE = "gworld";

export type RevisedLocationKey =
  | "ear"
  | "nose"
  | "jaw"
  | "chest"
  | "abdomen"
  | "spineTorso"
  | "spineNeck"
  | "pelvis"
  | "jointArm"
  | "jointLeg"
  | "jointHand"
  | "jointFoot"
  | "veinsArm"
  | "veinsLeg"
  | "veinsNeck";

/** The switches a row belongs to. */
export type RevisedSwitch = "finerHitLocations" | "chestAbdomenSplit";

/** What a wound tells the row, for the things that follow from its size. */
export interface WoundInfo {
  type: DamageType;
  /** Injury after the crippling limit. */
  injury: number;
  /** Injury before it, which is what dismemberment reads. */
  uncappedInjury: number;
  maxHp: number;
}

export interface RevisedLocationRule {
  key: RevisedLocationKey;
  /** The Basic Set location whose armour and table it uses. */
  parent: HitLocation;
  /** To-hit penalty in all, not on top of the parent's. */
  penalty: number;
  /** Damage types that may aim at it; empty for any. `burn` is read as tight-beam. */
  damageTypes: readonly DamageType[];
  /** Arcs it may be aimed from; omitted for any. */
  arcs?: ReadonlyArray<"front" | "side" | "back">;
  extraDr?: number;
  /** The wounding modifier, or null for the parent's. */
  wounding?: (type: DamageType) => number | null;
  /** Crippled above HP over this (excess lost); null for never; omitted for as the parent. */
  cripplingDivisor?: number | null | ((type: DamageType, limbs?: LimbCounts) => number | null | undefined);
  knockdownFor?: (type: DamageType) => number;
  /** Any shock calls for the knockdown roll. */
  shockKnockdown?: boolean;
  /** The knockdown penalty of a major wound here in place of the parent's. */
  majorWoundKnockdown?: number | ((type: DamageType) => number | null);
  /** True or false to force the wound major or not; null to leave it as the rules read it. */
  majorWound?: (info: WoundInfo) => boolean | null;
  /** Where a miss by 1 lands: a Basic Set location, or null. Omitted: the parent's rule. */
  missFallback?: string | null;
  /** Which switch offers it. */
  switch: RevisedSwitch;
  /** True where the body has no such part (Missing Hit Locations). */
  removedBy: (tolerance: InjuryTolerance) => boolean;
}

const PIERCING: readonly DamageType[] = ["pi-", "pi", "pi+", "pi++"];
/** Crushing, cutting, piercing and tight-beam burning: what a joint takes. */
const JOINT_TYPES: readonly DamageType[] = ["cr", "cut", ...PIERCING, "burn"];
/** Cutting, impaling, piercing and tight-beam burning: what a vein or artery takes. */
const VEIN_TYPES: readonly DamageType[] = ["cut", "imp", ...PIERCING, "burn"];
/** Crushing through tight-beam burning: what reaches the spine. */
const SPINE_TYPES: readonly DamageType[] = ["cr", "cut", "imp", ...PIERCING, "burn"];

/** The least whole injury over `threshold`, as the crippling rules count it (Campaigns p. 421). */
export function injuryToCripple(threshold: number): number {
  return Math.floor(threshold) + 1;
}

/** Whether an ear or nose was cut clean off: twice the injury that cripples it. */
export function removedByCut(uncappedInjury: number, maxHp: number): boolean {
  return uncappedInjury >= 2 * injuryToCripple(maxHp / 4);
}

/**
 * A joint cripples over HP/(one more than the body part does): HP/3 (not HP/2)
 * for a limb and HP/4 (not HP/3) for an extremity (p. 566). A body with more
 * than two of the limb cripples it over HP/n, an extremity over HP/(1.5n)
 * (Campaigns p. 421), so its joints take one more of the divisor again.
 */
export function jointDivisor(parent: HitLocation, extremity: boolean, limbs: LimbCounts = {}): number {
  const count = parent === "arm" || parent === "hand" ? limbs.arms : limbs.legs;
  const n = Math.max(2, Math.floor(Number(count) || 0));
  return (extremity ? 1.5 * n : n) + 1;
}

/** Where a miss by 1 lands from the ear, nose and jaw ("the torso (chest)"), and from the pelvis ("the torso (abdomen)"): a key the registry reads as the parent when the split is off. */
const CHEST_KEY = `${REVISED_MODULE}.chest`;
const ABDOMEN_KEY = `${REVISED_MODULE}.abdomen`;

const isCut = (type: DamageType) => type === "cut";
const neverGone = () => false;

const veinsWounding = (parent: HitLocation) => (type: DamageType) => woundingModifierAt(type, parent, { tightBeam: true }) + 0.5;

export const REVISED_LOCATIONS: readonly RevisedLocationRule[] = [
  {
    // Treat as face except for a cut to slice the ear off: injury over HP/4 is
    // lost with no special effect, twice that removes it, a major wound
    // without the face's -5 (p. 566).
    key: "ear",
    parent: "face",
    penalty: -7,
    damageTypes: [],
    cripplingDivisor: (type) => (isCut(type) ? 4 : null),
    majorWound: (info) => (isCut(info.type) ? removedByCut(info.uncappedInjury, info.maxHp) : null),
    majorWoundKnockdown: (type) => (isCut(type) ? 0 : null),
    missFallback: CHEST_KEY,
    switch: "finerHitLocations",
    removedBy: (tolerance) => tolerance.noHead,
  },
  {
    // A broken nose (injury over HP/4) is a major wound to the face; a cut to
    // lop it off is a major wound without the face's -5 (p. 566).
    key: "nose",
    parent: "face",
    penalty: -7,
    damageTypes: [],
    arcs: ["front"],
    cripplingDivisor: (type) => (isCut(type) ? 4 : null),
    majorWound: (info) => (isCut(info.type) ? null : info.uncappedInjury > info.maxHp / 4 ? true : null),
    majorWoundKnockdown: (type) => (isCut(type) ? 0 : null),
    missFallback: CHEST_KEY,
    switch: "finerHitLocations",
    removedBy: (tolerance) => tolerance.noHead,
  },
  {
    key: "jaw",
    parent: "face",
    penalty: -6,
    damageTypes: [],
    arcs: ["front"],
    knockdownFor: (type) => (type === "cr" ? -1 : 0),
    missFallback: CHEST_KEY,
    switch: "finerHitLocations",
    removedBy: (tolerance) => tolerance.noHead,
  },
  {
    key: "chest",
    parent: "torso",
    penalty: 0,
    damageTypes: [],
    switch: "chestAbdomenSplit",
    removedBy: neverGone,
  },
  {
    key: "abdomen",
    parent: "torso",
    penalty: -1,
    damageTypes: [],
    switch: "chestAbdomenSplit",
    removedBy: neverGone,
  },
  {
    // The torso's wounding, DR 3 more, any shock a knockdown roll (p. 566).
    key: "spineTorso",
    parent: "torso",
    penalty: -8,
    damageTypes: SPINE_TYPES,
    arcs: ["back"],
    extraDr: 3,
    shockKnockdown: true,
    majorWoundKnockdown: -5,
    missFallback: "torso",
    switch: "finerHitLocations",
    removedBy: (tolerance) => tolerance.diffuse || tolerance.homogenous || tolerance.invertebrate,
  },
  {
    key: "spineNeck",
    parent: "neck",
    penalty: -8,
    damageTypes: SPINE_TYPES,
    arcs: ["back"],
    extraDr: 3,
    wounding: (type) => woundingModifierAt(type, "torso", { tightBeam: true }),
    shockKnockdown: true,
    majorWoundKnockdown: -5,
    missFallback: "neck",
    switch: "finerHitLocations",
    removedBy: (tolerance) => tolerance.diffuse || tolerance.homogenous || tolerance.invertebrate || tolerance.noNeck,
  },
  {
    // Treat as torso; a major wound fells the target (p. 566).
    key: "pelvis",
    parent: "torso",
    penalty: -3,
    damageTypes: [],
    missFallback: ABDOMEN_KEY,
    switch: "finerHitLocations",
    removedBy: (tolerance) => tolerance.diffuse || tolerance.homogenous || tolerance.invertebrate,
  },
  ...(["Arm", "Leg", "Hand", "Foot"] as const).map((part): RevisedLocationRule => {
    const parent = part.toLowerCase() as HitLocation;
    const extremity = part === "Hand" || part === "Foot";
    return {
      // Crippled over HP/3 (limb) or HP/4 (extremity), the excess lost, and
      // recovery at -2 (p. 566).
      key: `joint${part}` as RevisedLocationKey,
      parent,
      penalty: extremity ? -7 : -5,
      damageTypes: JOINT_TYPES,
      cripplingDivisor: (_type, limbs = {}) => jointDivisor(parent, extremity, limbs),
      missFallback: parent,
      switch: "finerHitLocations",
      removedBy: (tolerance) =>
        tolerance.diffuse || tolerance.homogenous || tolerance.noManipulators || (part === "Leg" || part === "Foot" ? tolerance.noLegs : false),
    };
  }),
  ...(["Arm", "Leg"] as const).map((part): RevisedLocationRule => ({
    // The wounding modifier is 0.5 more, and a limb's crippling limit is
    // ignored (p. 566).
    key: `veins${part}` as RevisedLocationKey,
    parent: part === "Arm" ? "arm" : "leg",
    penalty: -5,
    damageTypes: VEIN_TYPES,
    wounding: veinsWounding(part === "Arm" ? "arm" : "leg"),
    cripplingDivisor: null,
    missFallback: part === "Arm" ? "arm" : "leg",
    switch: "finerHitLocations",
    removedBy: (tolerance) =>
      tolerance.diffuse || tolerance.homogenous || tolerance.noBlood || tolerance.noManipulators || (part === "Leg" ? tolerance.noLegs : false),
  })),
  {
    key: "veinsNeck",
    parent: "neck",
    penalty: -8,
    damageTypes: VEIN_TYPES,
    wounding: veinsWounding("neck"),
    missFallback: "neck",
    switch: "finerHitLocations",
    removedBy: (tolerance) => tolerance.diffuse || tolerance.homogenous || tolerance.noBlood || tolerance.noNeck,
  },
];

const BY_KEY = new Map<string, RevisedLocationRule>(REVISED_LOCATIONS.map((rule) => [rule.key, rule]));

/** A row by its key, with or without the module prefix. */
export function revisedLocation(key: string | null | undefined): RevisedLocationRule | undefined {
  if (!key) return undefined;
  return BY_KEY.get(key.startsWith(`${REVISED_MODULE}.`) ? key.slice(REVISED_MODULE.length + 1) : key);
}

/** Whether the target's body has no such part, so a blow aimed there lands on its parent (Missing Hit Locations, p. 566). */
export function isMissingPart(key: string | null | undefined, tolerance: InjuryTolerance): boolean {
  const rule = revisedLocation(key);
  return rule ? rule.removedBy(tolerance) : false;
}

/**
 * The penalty for aiming at the skull or face from behind, in place of the
 * ordinary one: the skull -5 (not -7), the face -7 (not -5) (p. 566). Zero
 * where nothing changes; else the difference to add to the ordinary penalty.
 */
export function fromBehindAdjustment(location: HitLocation, arc: "front" | "side" | "back" | null): number {
  if (arc !== "back") return 0;
  if (location === "skull") return 2;
  if (location === "face") return -2;
  return 0;
}

/** Crushing may aim at the vitals at -3, wounding x1 (p. 566): the qualifier canTarget reads. */
export function crushingMayTargetVitals(location: HitLocation, type: DamageType): boolean {
  return location === "vitals" && type === "cr";
}

const CUT_IMP_PIERCE: readonly DamageType[] = ["cut", "imp", ...PIERCING];
const IMP_PIERCE: readonly DamageType[] = ["imp", ...PIERCING];
const CR_CUT_PIERCE: readonly DamageType[] = ["cr", "cut", ...PIERCING];

/** What a random hit turned into, as a Basic Set location and the row of this page it falls on. */
export interface RefinedHit {
  location: HitLocation;
  key: RevisedLocationKey | null;
}

export interface RefineInput {
  roll: number;
  location: HitLocation;
  damageType: DamageType | null;
  arc: "front" | "side" | "back" | null;
  /** Rolls 1d; called only when a refinement asks for one. */
  d6: () => number;
  /** The finer locations are in play (the refinements below). */
  refine: boolean;
  /** Chest and abdomen are in play. */
  split: boolean;
  /** The blow is a tight-beam burn; a burn not known to be one is left out of every list. */
  tightBeam?: boolean;
}

/**
 * A random hit as the Revised text refines it (p. 566): the chest and abdomen
 * split of the torso, then the 1d that a few blows call for -- a face hit from
 * the front may be the nose or skull, a neck hit may be the veins or spine, a
 * torso hit the vitals or spine, a limb hit the veins or joint, a hand or foot
 * hit the joint. Returns null where the roll stands.
 *
 * A blow's type is read as the book does: burning counts only where the caller
 * says it is tight-beam (`tightBeam`), and is left out of every list where it
 * does not know.
 */
export function refineRandomHit(input: RefineInput): RefinedHit | null {
  const { roll, damageType: type, arc } = input;
  let { location } = input;
  let key: RevisedLocationKey | null = null;

  // The torso split: 9-10 the chest, and 11 the abdomen in place of the groin.
  if (input.split) {
    if (location === "torso") key = "chest";
    else if (location === "groin" && roll === 11) {
      location = "torso";
      key = "abdomen";
    }
  }
  if (!input.refine || !type) return key ? { location, key } : null;

  // Tight-beam burning stands with the piercing and impaling wherever the book lists it.
  const tight = type === "burn" && input.tightBeam === true;
  const among = (types: readonly DamageType[]) => types.includes(type) || tight;
  const back = arc === "back";
  const one = () => input.d6() === 1;

  switch (location) {
    case "face":
      // "If hit from in front" a 1 is the skull for a point and the nose otherwise.
      if (!back && one()) return among(IMP_PIERCE) ? { location: "skull", key: null } : { location: "face", key: "nose" };
      break;
    case "neck":
      if (among(CUT_IMP_PIERCE) && one()) return { location: "neck", key: "veinsNeck" };
      if (type === "cr" && back && one()) return { location: "neck", key: "spineNeck" };
      break;
    case "torso":
      if ((type === "cr" || among(IMP_PIERCE)) && one()) return { location: "vitals", key: null };
      if (type === "cut" && back && one()) return { location: "torso", key: "spineTorso" };
      break;
    case "arm":
    case "leg":
      if (among(CUT_IMP_PIERCE) && one()) return { location, key: location === "arm" ? "veinsArm" : "veinsLeg" };
      if (type === "cr" && one()) return { location, key: location === "arm" ? "jointArm" : "jointLeg" };
      break;
    case "hand":
    case "foot":
      if (among(CR_CUT_PIERCE) && one()) return { location, key: location === "hand" ? "jointHand" : "jointFoot" };
      break;
    default:
      break;
  }
  return key ? { location, key } : null;
}

/** A neck snap that injures over HP breaks the neck outright (p. 566). */
export function neckSnapBreaksNeck(injury: number, maxHp: number): boolean {
  return maxHp > 0 && injury > maxHp;
}

/** One outcome for the damage card, by lang key, with the figures it names. */
export interface WoundNote {
  key: string;
  data?: Record<string, number>;
  /** True when it is a lasting wound rather than a reminder. */
  grave?: boolean;
}

export interface WoundNoteInput {
  /** The row struck, or null for a Basic Set location. */
  row: RevisedLocationKey | null;
  hitLocation: HitLocation;
  type: DamageType;
  injury: number;
  uncappedInjury: number;
  maxHp: number;
  majorWound: boolean;
  crippled: boolean;
  deathCheck: boolean;
}

/**
 * What the wound did beyond its injury (p. 566): ear and nose lost, a broken
 * nose, the spine crippled or the neck broken, a pelvis that gives out, a
 * crippled joint, and the GM's rulings on a failed death roll from the veins
 * and arteries or a cut to the neck.
 */
export function woundNotes(input: WoundNoteInput): WoundNote[] {
  const { row, type, uncappedInjury, maxHp } = input;
  const notes: WoundNote[] = [];
  switch (row) {
    case "ear":
      if (type === "cut" && uncappedInjury > maxHp / 4) {
        notes.push(removedByCut(uncappedInjury, maxHp) ? { key: "EarRemoved", grave: true } : { key: "EarSliced", data: { lost: Math.max(0, uncappedInjury - input.injury) } });
      }
      break;
    case "nose":
      if (type === "cut") {
        if (removedByCut(uncappedInjury, maxHp)) notes.push({ key: "NoseRemoved", grave: true });
        else if (input.crippled) notes.push({ key: "NoseLopped", grave: true });
      } else if (uncappedInjury > maxHp / 4) notes.push({ key: "NoseBroken", grave: true });
      break;
    case "spineTorso":
      if (uncappedInjury > maxHp) notes.push({ key: "SpineCrippled", grave: true });
      break;
    case "spineNeck":
      if (uncappedInjury > maxHp) notes.push({ key: "NeckBroken", grave: true });
      break;
    case "pelvis":
      if (input.majorWound) notes.push({ key: "PelvisBroken", grave: true });
      break;
    case "jointArm":
    case "jointLeg":
    case "jointHand":
    case "jointFoot":
      if (input.crippled) notes.push({ key: "JointCrippled", grave: true });
      break;
    case "veinsArm":
    case "veinsLeg":
    case "veinsNeck":
      if (input.deathCheck) notes.push({ key: "VeinsBleedOut" });
      break;
    default:
      if (input.hitLocation === "neck" && type === "cut" && input.deathCheck) notes.push({ key: "Decapitation" });
      break;
  }
  return notes;
}

/** The coverage value for armour that protects the chest and not the abdomen (p. 566). */
export const CHEST_COVERAGE = "chest";

/**
 * "Torso armor often protects only the chest" (p. 566). A piece listing the
 * chest covers a blow at the chest, and one anywhere on the torso when the
 * split is off; it is no help against a blow at the abdomen. Returns the
 * pieces as the torso sees them, the chest read as torso where it covers.
 */
export function withChestCoverage<T extends { locations: readonly string[] }>(
  pieces: readonly T[],
  struckAt: string | null | undefined,
  split: boolean,
): T[] {
  const chest = !split || revisedLocation(struckAt)?.key === "chest";
  return pieces.map((piece) =>
    piece.locations.includes(CHEST_COVERAGE) && chest && !piece.locations.includes("torso")
      ? { ...piece, locations: [...piece.locations, "torso"] }
      : piece,
  );
}

/** A trait a lasting wound gives, by its record's name: at `level` when it has levels, or a loss of `appearance` levels. */
export interface WoundTrait {
  /** The trait's name in the compendia; empty for an Appearance change. */
  name: string;
  level?: number;
  /** Levels of Appearance lost (an ear one, a nose two, p. 566). */
  appearance?: number;
}

/**
 * What a lasting wound writes to the character (p. 566), for the note that
 * names it: the spine's Bad Back (Severe) and Lame (Paraplegic), a broken
 * neck's Quadriplegic, the pelvis's Lame (Missing Legs) until healed, a broken
 * nose's No Sense of Smell/Taste until it heals, and the Appearance an ear or
 * a nose lost takes. Empty for a note that is only a reminder.
 */
export function woundTraits(noteKey: string): WoundTrait[] {
  switch (noteKey) {
    case "SpineCrippled":
      return [{ name: "Bad Back", level: 2 }, { name: "Lame (Paraplegic)" }];
    case "NeckBroken":
      return [{ name: "Quadriplegic" }];
    case "PelvisBroken":
      return [{ name: "Lame (Missing Legs)" }];
    case "NoseBroken":
      return [{ name: "No Sense of Smell/Taste" }];
    case "EarRemoved":
      return [{ name: "", appearance: 1 }];
    case "NoseRemoved":
      return [{ name: "", appearance: 2 }];
    default:
      return [];
  }
}

/**
 * Where Appearance stands after losing levels: the advantage's levels count up
 * from Average, the disadvantage's down (Characters p. 21), and it stops at the
 * disadvantage's fifth level. `current` is the signed level now (Attractive +1,
 * Ugly -2); the result says which trait holds it, and how many levels.
 */
export function appearanceAfter(
  current: number,
  lost: number,
): { trait: "Appearance" | "Appearance (Disadvantage)" | null; levels: number; signed: number } {
  const signed = Math.max(-5, Math.floor(current) - Math.max(0, Math.floor(lost)));
  if (signed > 0) return { trait: "Appearance", levels: signed, signed };
  if (signed < 0) return { trait: "Appearance (Disadvantage)", levels: -signed, signed };
  return { trait: null, levels: 0, signed: 0 };
}
