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
 */

import { SYSTEM_ID } from "./constants.js";
import { HIT_LOCATIONS, type HitLocation } from "../rules/hit-locations.js";
import { cripplingMonths, type CripplingDuration } from "../rules/mortal-wounds.js";
import { registeredHitLocation } from "./combat-extensions.js";

const CRIPPLED_FLAG = "crippled";

/** Seconds in a month of healing: thirty days. */
export const SECONDS_PER_MONTH = 30 * 24 * 60 * 60;

/** One crippled part, as kept on the actor. */
export interface CrippledPart {
  id: string;
  /** A Basic Set location that can be crippled (arm, leg, hand, foot, eye), or a module's `<module>.<key>`. */
  location: string;
  duration: CripplingDuration;
  /** What crippled it, for the sheet: "Paralysing venom", "Left arm". */
  label: string;
  /** The world time it was crippled at, in seconds. */
  since: number;
  /** For lasting crippling, the months it takes to heal, and the world time it heals at. */
  months: number | null;
  healsAt: number | null;
}

function worldTime(): number {
  return Number((globalThis as { game?: { time?: { worldTime?: number } } }).game?.time?.worldTime) || 0;
}

function stored(actor: any): CrippledPart[] {
  const list = actor?.getFlag?.(SYSTEM_ID, CRIPPLED_FLAG);
  return Array.isArray(list) ? list.filter((part) => part && typeof part.id === "string") : [];
}

/** Whether a crippled part has healed by now (p. 422). */
export function hasHealed(part: CrippledPart, actor: any, now = worldTime()): boolean {
  if (part.duration === "permanent") return false;
  if (part.duration === "lasting") return part.healsAt !== null && now >= part.healsAt;
  // Temporary: "Once you are fully healed, these effects disappear."
  const hp = actor?.system?.hp ?? {};
  return (Number(hp.value) || 0) >= (Number(hp.max) || 0);
}

/** Whether a location can be crippled: a limb, an extremity or an eye, or a module's registered location. */
export function crippleableLocation(location: string): boolean {
  const basic = HIT_LOCATIONS[location as HitLocation];
  if (basic) return basic.cripplingKind !== "none";
  return registeredHitLocation(location) !== undefined;
}

/** The parts crippled now, healed ones left out. */
export function crippledParts(actor: any): CrippledPart[] {
  const now = worldTime();
  return stored(actor).filter((part) => !hasHealed(part, actor, now));
}

/**
 * Cripples a part (p. 422). A lasting crippling heals after `months`, or
 * after 1d months less the treatment's relief (`treatedAtTl`) where none is
 * given, never under one. Resolves to the part recorded, or null for a user
 * who can't change the actor, a location that can't be crippled, or a
 * duration that isn't one of the three. Healed parts are cleared as it writes.
 */
export async function cripple(actor: any, location: string, options: {
  duration: CripplingDuration;
  label?: string;
  months?: number;
  treatedAtTl?: number | null;
}): Promise<CrippledPart | null> {
  if (!actor?.isOwner || !crippleableLocation(String(location ?? ""))) return null;
  const duration = options?.duration;
  if (duration !== "temporary" && duration !== "lasting" && duration !== "permanent") return null;
  const since = worldTime();
  let months: number | null = null;
  if (duration === "lasting") {
    if (typeof options.months === "number" && Number.isFinite(options.months)) {
      months = Math.max(1, Math.round(options.months));
    } else {
      const die = new Roll("1d6");
      await die.evaluate();
      months = cripplingMonths({ roll: die.total, treatedAtTl: options.treatedAtTl ?? null });
    }
  }
  const part: CrippledPart = {
    id: foundry.utils.randomID(),
    location: String(location),
    duration,
    label: String(options.label ?? ""),
    since,
    months,
    healsAt: months === null ? null : since + months * SECONDS_PER_MONTH,
  };
  await actor.setFlag(SYSTEM_ID, CRIPPLED_FLAG, [...crippledParts(actor), part]);
  return part;
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
