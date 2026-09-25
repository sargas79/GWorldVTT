/**
 * Crippled body parts kept on a character (GURPS Basic Set: Campaigns p. 422;
 * since API 1.114.0).
 *
 * A crippling injury is temporary, lasting or permanent. Temporary crippling
 * lasts until the character is back at full HP; lasting crippling heals after
 * 1d months (less when a physician treats it); permanent crippling never heals.
 * A module records one here -- a poison's paralysis that heals as a crippled
 * limb would -- and the sheet shows it until it heals or someone takes it off.
 * Healing is read when the list is read: nothing needs to run for time to pass.
 *
 * Which of the three it is comes from an HT roll after the fight, so a part
 * may be recorded before anyone knows (since 1.129.0) and settled later. And
 * not every crippling is an injury: an affliction that blinds an eye costs no
 * HP, so "back at full HP" can't be what ends it. A temporary crippling with
 * no injury behind it lasts until it is taken off, or for the time its caller
 * gives it.
 */

import { SYSTEM_ID } from "./constants.js";
import { HIT_LOCATIONS, type HitLocation } from "../rules/hit-locations.js";
import { cripplingMonths, cripplingRelief, type CripplingDuration } from "../rules/mortal-wounds.js";
import { registeredHitLocation } from "./combat-extensions.js";

const CRIPPLED_FLAG = "crippled";

/** Seconds in a month of healing: thirty days. */
export const SECONDS_PER_MONTH = 30 * 24 * 60 * 60;

/**
 * How long a crippling lasts, or `undecided` until the HT roll (or the
 * caller) says which of the three it is.
 */
export type CrippledDuration = CripplingDuration | "undecided";

/** One crippled part, as kept on the actor. */
export interface CrippledPart {
  id: string;
  /** A Basic Set location that can be crippled (arm, leg, hand, foot, eye), or a module's `<module>.<key>`. */
  location: string;
  duration: CrippledDuration;
  /**
   * Whether HP lost crippled it (since 1.129.0). Only then does a temporary
   * crippling end at full HP. Parts recorded before this was kept read as true.
   */
  injury: boolean;
  /** What crippled it, for the sheet: "Paralysing venom", "Left arm". */
  label: string;
  /** The world time it was crippled at, in seconds. */
  since: number;
  /**
   * For lasting crippling, the months it takes to heal. `healsAt` is the
   * world time a lasting crippling heals at, or a temporary one given a
   * length of its own.
   */
  months: number | null;
  healsAt: number | null;
  /**
   * The medical TL of the physician treating it, where one is (since 1.155.0):
   * a lasting crippling heals that much sooner (p. 422).
   */
  treatedAtTl?: number | null;
  /** The 1d rolled for a lasting crippling's months, before any relief (since 1.155.0). */
  roll?: number;
}

/** How long a crippling is to last, as a caller gives it. */
export interface CripplingLength {
  /** For lasting crippling: the months, where the 1d roll is not wanted. */
  months?: number;
  /** For lasting crippling: the tech level of the physician treating it. */
  treatedAtTl?: number | null;
  /** For temporary crippling with no injury behind it: the seconds it lasts. */
  seconds?: number;
  /** For lasting crippling given its `months`: the 1d they came from, kept for a later treatment (since 1.155.0). */
  roll?: number;
}

function worldTime(): number {
  return Number((globalThis as { game?: { time?: { worldTime?: number } } }).game?.time?.worldTime) || 0;
}

function stored(actor: any): CrippledPart[] {
  const list = actor?.getFlag?.(SYSTEM_ID, CRIPPLED_FLAG);
  return Array.isArray(list)
    ? list.filter((part) => part && typeof part.id === "string").map((part) => ({ ...part, injury: part.injury !== false }))
    : [];
}

/** Whether a crippled part has healed by now (p. 422). */
export function hasHealed(part: CrippledPart, actor: any, now = worldTime()): boolean {
  // Nobody knows yet how long it lasts, so it lasts until somebody does.
  if (part.duration === "undecided" || part.duration === "permanent") return false;
  if (part.healsAt !== null && now >= part.healsAt) return true;
  if (part.duration === "lasting") return false;
  // Temporary: "Once you are fully healed, these effects disappear." That
  // reads HP only where HP was lost: with no injury behind it, full HP is
  // where the character already was.
  if (part.injury === false) return false;
  const hp = actor?.system?.hp ?? {};
  return (Number(hp.value) || 0) >= (Number(hp.max) || 0);
}

/** Whether a location can be crippled: a limb, an extremity or an eye, or a module's registered location. */
export function crippleableLocation(location: string): boolean {
  const basic = HIT_LOCATIONS[location as HitLocation];
  if (basic) return basic.cripplingKind !== "none";
  return registeredHitLocation(location) !== undefined;
}

/** What a crippled location is called: a registered location by its own label. */
export function crippledPartName(location: string): string {
  const registered = registeredHitLocation(location);
  return game.i18n.localize(registered ? registered.label : `GWORLD.HitLocation.${location}`);
}

/** The parts crippled now, healed ones left out. */
export function crippledParts(actor: any): CrippledPart[] {
  const now = worldTime();
  return stored(actor).filter((part) => !hasHealed(part, actor, now));
}

/**
 * The months and the world time a crippling heals at, from the time it began.
 * A lasting crippling heals after `months`, or after 1d months less the
 * treatment's relief (`treatedAtTl`) where none is given, never under one. A
 * temporary one with no injury behind it heals after `seconds`, where given.
 */
async function lengthOf(
  duration: CrippledDuration,
  injury: boolean,
  since: number,
  length: CripplingLength,
): Promise<{ months: number | null; healsAt: number | null; roll?: number }> {
  if (duration === "lasting") {
    let months: number;
    let roll: number | undefined;
    if (typeof length.months === "number" && Number.isFinite(length.months)) {
      months = Math.max(1, Math.round(length.months));
      if (typeof length.roll === "number" && Number.isFinite(length.roll)) roll = Math.round(length.roll);
    } else {
      const die = new Roll("1d6");
      await die.evaluate();
      roll = Number(die.total);
      months = cripplingMonths({ roll, treatedAtTl: length.treatedAtTl ?? null });
    }
    return { months, healsAt: since + months * SECONDS_PER_MONTH, ...(roll !== undefined ? { roll } : {}) };
  }
  if (duration === "temporary" && !injury && typeof length.seconds === "number" && Number.isFinite(length.seconds)) {
    return { months: null, healsAt: since + Math.max(0, length.seconds) };
  }
  return { months: null, healsAt: null };
}

const DURATIONS: readonly string[] = ["temporary", "lasting", "permanent"];

/**
 * Cripples a part (p. 422). Resolves to the part recorded, or null for a user
 * who can't change the actor, a location that can't be crippled, or a
 * duration that is neither one of the three nor `undecided`. Left out, the
 * duration is undecided (since 1.129.0). `injury: false` records a crippling
 * no HP loss caused. Healed parts are cleared as it writes.
 */
export async function cripple(actor: any, location: string, options: CripplingLength & {
  duration?: CrippledDuration;
  label?: string;
  injury?: boolean;
} = {}): Promise<CrippledPart | null> {
  if (!actor?.isOwner || !crippleableLocation(String(location ?? ""))) return null;
  const duration = options?.duration ?? "undecided";
  if (duration !== "undecided" && !DURATIONS.includes(duration)) return null;
  const injury = options.injury !== false;
  const since = worldTime();
  const length = await lengthOf(duration, injury, since, options);
  const part: CrippledPart = {
    id: foundry.utils.randomID(),
    location: String(location),
    duration,
    injury,
    label: String(options.label ?? ""),
    since,
    ...keptTreatment(duration, options.treatedAtTl, length),
    ...length,
  };
  await actor.setFlag(SYSTEM_ID, CRIPPLED_FLAG, [...crippledParts(actor), part]);
  return part;
}

/**
 * Says how long an undecided crippling lasts (p. 422; since 1.129.0), found
 * by its id or its location: the HT roll's answer, or the caller's. The time
 * it heals at runs from when it was crippled, not from now. Resolves to the
 * part as settled, or null for a user who can't change the actor, no
 * undecided part there, or a duration that isn't one of the three.
 */
export async function settleCrippling(actor: any, which: string, options: CripplingLength & {
  duration: CripplingDuration;
}): Promise<CrippledPart | null> {
  if (!actor?.isOwner || !DURATIONS.includes(options?.duration)) return null;
  const parts = crippledParts(actor);
  const index = parts.findIndex((part) => part.duration === "undecided" && (part.id === which || part.location === which));
  const part = parts[index];
  if (!part) return null;
  // A physician recorded on the part before it was settled treats it still (since 1.155.0).
  const treatedAtTl = options.treatedAtTl ?? part.treatedAtTl ?? null;
  const length = await lengthOf(options.duration, part.injury, part.since, { ...options, treatedAtTl });
  const untreated: CrippledPart = { ...part };
  delete untreated.treatedAtTl;
  const settled: CrippledPart = {
    ...untreated,
    duration: options.duration,
    ...keptTreatment(options.duration, treatedAtTl, length),
    ...length,
  };
  parts[index] = settled;
  await actor.setFlag(SYSTEM_ID, CRIPPLED_FLAG, parts);
  return settled;
}

/** A treating TL as kept on a part: a whole number 0 or more, or none. */
function treatment(treatedAtTl: unknown): { treatedAtTl?: number } {
  const tl = Number(treatedAtTl);
  return treatedAtTl !== null && treatedAtTl !== undefined && Number.isFinite(tl) && tl >= 0 ? { treatedAtTl: Math.floor(tl) } : {};
}

/**
 * The treating TL a part keeps (since 1.155.0). A lasting part keeps it only
 * where its months came from a die the relief was taken off, so that a later
 * treatment can work from that die; months a caller gave stand as given, with
 * no TL beside them to be taken off again.
 */
function keptTreatment(duration: CrippledDuration, treatedAtTl: unknown, length: { roll?: number }): { treatedAtTl?: number } {
  if (duration === "lasting" && length.roll === undefined) return {};
  return treatment(treatedAtTl);
}

/**
 * The months a lasting crippling takes once a physician at this medical TL
 * treats it (p. 422; since 1.155.0): its 1d again, less the new relief, never
 * under a month. A part whose die wasn't kept is read back from its months
 * and the relief it had.
 */
export function treatedMonths(part: Pick<CrippledPart, "months" | "roll" | "treatedAtTl">, treatedAtTl: number | null): number | null {
  const roll = crippledDie(part);
  return roll === null ? null : cripplingMonths({ roll, treatedAtTl });
}

/**
 * The 1d behind a lasting crippling's months (since 1.155.0): the one kept,
 * or else read back from the months and any relief recorded -- which for a
 * part recorded before 1.155.0, or given its months, is none. Held to 1-6.
 */
export function crippledDie(part: Pick<CrippledPart, "months" | "roll" | "treatedAtTl">): number | null {
  if (part.months === null) return null;
  const die = typeof part.roll === "number" ? part.roll : part.months + cripplingRelief(part.treatedAtTl ?? null);
  return Math.min(6, Math.max(1, Math.round(die)));
}

/**
 * Puts a crippled part in a physician's care (p. 422; since 1.155.0), by its
 * id or its location: `treatedAtTl` is the medical TL (null takes it off). A
 * lasting crippling then heals after its 1d months less the relief, counted
 * from when it was crippled; an undecided one keeps the TL for when it is
 * settled; a temporary or permanent one only records it. Resolves to the
 * part, or null for a user who can't change the actor or no part there.
 */
export async function treatCrippled(actor: any, which: string, options: { treatedAtTl: number | null }): Promise<CrippledPart | null> {
  if (!actor?.isOwner) return null;
  const parts = crippledParts(actor);
  const index = parts.findIndex((part) => part.id === which || part.location === which);
  const part = parts[index];
  if (!part) return null;
  const kept = treatment(options?.treatedAtTl);
  const treated: CrippledPart = { ...part, ...kept };
  if (kept.treatedAtTl === undefined) delete treated.treatedAtTl;
  if (part.duration === "lasting") {
    const roll = crippledDie(part);
    if (roll !== null) {
      const months = cripplingMonths({ roll, treatedAtTl: kept.treatedAtTl ?? null });
      // The die is kept, so a later treatment works from it and not from these months.
      treated.roll = roll;
      treated.months = months;
      treated.healsAt = part.since + months * SECONDS_PER_MONTH;
    }
  }
  parts[index] = treated;
  await actor.setFlag(SYSTEM_ID, CRIPPLED_FLAG, parts);
  return treated;
}

/** Takes a crippled part off, by its id or its location. False where there was none. */
export async function healCrippled(actor: any, which: string): Promise<boolean> {
  if (!actor?.isOwner) return false;
  const now = stored(actor);
  const kept = now.filter((part) => part.id !== which && part.location !== which);
  if (kept.length === now.length) return false;
  await actor.setFlag(SYSTEM_ID, CRIPPLED_FLAG, kept);
  return true;
}
