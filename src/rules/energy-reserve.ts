/**
 * Energy Reserve (GURPS Basic Set Revised p. 326).
 *
 * A pool that works like Fatigue Points for paying the FP costs of abilities
 * of one origin -- magical, psionic, chi, divine -- and for nothing else. It
 * recharges 1 a 10 minutes whatever the character does; Slow Recharge stretches
 * that to an hour or a day, and a reserve only energy theft refills never
 * recharges by itself.
 */

/** Seconds between one point recharged and the next, without Slow Recharge. */
export const RESERVE_RECHARGE_SECONDS = 600;

/** A reserve the character holds: one per origin, its levels added up. */
export interface EnergyReserve {
  /** The origin, lower-cased and made regular: "magical", "psionic". */
  key: string;
  /** The origin as the sheet says it. */
  origin: string;
  max: number;
  /** Seconds a point takes to come back, or null where only energy theft refills it. */
  interval: number | null;
}

/** What a reserve has used, and the seconds counted toward its next point. */
export interface ReserveUse {
  spent: number;
  carry: number;
}

const ORIGIN_ALIASES: Record<string, string> = {
  magic: "magical",
  psi: "psionic",
  psychic: "psionic",
};

/** An origin as a key: case and the odd spelling do not make two of them. */
export function originKey(origin: string): string {
  const key = String(origin ?? "").trim().toLowerCase();
  return ORIGIN_ALIASES[key] ?? key;
}

/** The seconds a point takes, from a reserve's limitations (Slow Recharge, Special Recharge). */
export function rechargeInterval(modifiers: readonly string[]): number | null {
  let interval: number | null = RESERVE_RECHARGE_SECONDS;
  for (const name of modifiers) {
    const text = String(name).toLowerCase();
    if (/special recharge/.test(text) && /theft|steal|drain/.test(text)) return null;
    if (/slow recharge/.test(text)) {
      const seconds = /day|-\s*60/.test(text) ? 86400 : 3600;
      interval = interval === null ? null : Math.max(interval, seconds);
    }
  }
  return interval;
}

/**
 * The reserves a character's traits give. Two of the same origin are one
 * reserve, which recharges as slowly as the slower of them.
 */
export function energyReserves(
  traits: readonly { name: string; levels?: number; specialty?: string; modifiers?: readonly string[] }[],
): EnergyReserve[] {
  const byKey = new Map<string, EnergyReserve>();
  for (const t of traits) {
    if (!/^energy reserve\b/i.test(t.name.trim())) continue;
    // "Energy Reserve (Magical)" carries the origin in the name where it has no specialty.
    const fromName = /\(([^)]+)\)/.exec(t.name)?.[1] ?? "";
    const origin = String(t.specialty ?? "").trim() || fromName.trim();
    const key = originKey(origin);
    if (!key) continue;
    const max = Math.max(0, Math.floor(Number(t.levels ?? 0)) || 0);
    if (max <= 0) continue;
    const interval = rechargeInterval(t.modifiers ?? []);
    const held = byKey.get(key);
    if (!held) {
      byKey.set(key, { key, origin, max, interval });
    } else {
      held.max += max;
      held.interval = held.interval === null || interval === null ? null : Math.max(held.interval, interval);
    }
  }
  return [...byKey.values()];
}

/** What is left of a reserve. */
export function reserveValue(max: number, spent: number): number {
  return Math.max(0, Math.floor(max) - Math.max(0, Math.floor(spent)));
}

/**
 * How a cost of FP is met where an ability's origin has a reserve: as much as
 * the reserve holds comes out of it, and the rest is FP (p. 326).
 */
export function payFromReserve(cost: number, value: number): { reserve: number; rest: number } {
  const owed = Math.max(0, Math.floor(cost));
  const reserve = Math.min(owed, Math.max(0, Math.floor(value)));
  return { reserve, rest: owed - reserve };
}

/**
 * Whether a hostile power can deplete a reserve: only one of the same origin
 * does. "Magical FP drains cannot deplete ER (Chi)"; poison, missed sleep and
 * exertion have no origin and never do.
 */
export function drainsReserve(reserveOrigin: string, powerOrigin: string | undefined | null): boolean {
  const power = originKey(powerOrigin ?? "");
  return power !== "" && power === originKey(reserveOrigin);
}

/**
 * Time passing recharges a reserve: a point for each whole interval, from the
 * seconds carried over as well. A reserve without an interval does not.
 */
export function rechargeReserve(
  use: ReserveUse,
  interval: number | null,
  seconds: number,
): { spent: number; carry: number; gained: number } {
  if (interval === null || interval <= 0) return { ...use, gained: 0 };
  if (use.spent <= 0) return { spent: 0, carry: 0, gained: 0 };
  const total = Math.max(0, use.carry) + Math.max(0, seconds);
  const gained = Math.min(use.spent, Math.floor(total / interval));
  const spent = use.spent - gained;
  // At full, there is nothing to count toward.
  return { spent, carry: spent > 0 ? total - gained * interval : 0, gained };
}
