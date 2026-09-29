/**
 * Simplified Resources, batteries and power cells (Basic Set Revised p. 578).
 * Pure arithmetic: the tally of five reloads, the day of power every gizmo
 * has, and the substitution ratios between battery and cell sizes.
 */

/** The reloads the GM tallies for a firearm, or one full quiver or pouch for low-tech ammunition. */
export const SIMPLIFIED_RELOADS = 5;

export interface ReloadTallyInput {
  /** Cost of one full reload of ammunition. */
  reloadCost: number;
  /** Weight of one full reload, in lbs. */
  reloadWeight: number;
  /** Cost of the magazines, quivers or speedloaders to hold them. */
  containerCost?: number;
  /** Weight of those containers, in lbs. */
  containerWeight?: number;
  /** Reloads to carry: 5 for a firearm, 1 for a quiver or pouch. */
  reloads?: number;
}

/** What the reloads and their containers cost and weigh, to subtract from the budget and add to encumbrance. */
export function reloadTally(input: ReloadTallyInput): { cost: number; weight: number } {
  const reloads = input.reloads ?? SIMPLIFIED_RELOADS;
  const n = (v: number | undefined) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return {
    cost: round(n(input.reloadCost) * n(reloads) + n(input.containerCost)),
    weight: round(n(input.reloadWeight) * n(reloads) + n(input.containerWeight)),
  };
}

/** Spare power that gives one person one more day: $3 and 1 lb at TL6-8, $10 and 0.5 lb at TL9+. */
export function sparesPerDay(tl: number): { cost: number; weight: number } {
  return Number(tl) >= 9 ? { cost: 10, weight: 0.5 } : { cost: 3, weight: 1 };
}

/** Days of power for one person: the day every gizmo has, plus one per full set of spares carried. */
export function daysOfPower(options: { tl: number; spareCost?: number; spareWeight?: number }): number {
  const per = sparesPerDay(options.tl);
  const byCost = Math.floor((Number(options.spareCost) || 0) / per.cost);
  const byWeight = Math.floor((Number(options.spareWeight) || 0) / per.weight);
  return 1 + Math.max(0, Math.min(byCost, byWeight));
}

/** Whether ammunition escapes the shortcut: explosives, fine or magical ammunition, anything but generic. */
export function trackedRegardless(ammunition: { explosive?: boolean; fine?: boolean; magical?: boolean; generic?: boolean }): boolean {
  return !!(ammunition.explosive || ammunition.fine || ammunition.magical || ammunition.generic === false);
}

export type PowerKind = "battery" | "cell";

export interface PowerType {
  code: string;
  name: string;
  kind: PowerKind;
  cost: number;
  weight: number;
}

/** TL6-8 batteries, smallest first. Rechargeable ones cost 5x as much. */
export const BATTERY_TYPES: readonly PowerType[] = [
  { code: "T", name: "Tiny", kind: "battery", cost: 0.25, weight: 0.02 },
  { code: "XS", name: "Extra-Small", kind: "battery", cost: 0.5, weight: 0.1 },
  { code: "S", name: "Small", kind: "battery", cost: 1, weight: 0.33 },
  { code: "M", name: "Medium", kind: "battery", cost: 5, weight: 2 },
  { code: "L", name: "Large", kind: "battery", cost: 10, weight: 10 },
  { code: "VL", name: "Very Large", kind: "battery", cost: 20, weight: 50 },
];

/** TL9+ power cells, smallest first. */
export const CELL_TYPES: readonly PowerType[] = [
  { code: "AA", name: "AA", kind: "cell", cost: 1, weight: 0.0005 },
  { code: "A", name: "A", kind: "cell", cost: 2, weight: 0.005 },
  { code: "B", name: "B", kind: "cell", cost: 3, weight: 0.05 },
  { code: "C", name: "C", kind: "cell", cost: 10, weight: 0.5 },
  { code: "D", name: "D", kind: "cell", cost: 100, weight: 5 },
  { code: "E", name: "E", kind: "cell", cost: 2000, weight: 20 },
  { code: "F", name: "F", kind: "cell", cost: 20000, weight: 200 },
];

/** Rechargeable batteries cost 5x as much. */
export const RECHARGEABLE_COST_FACTOR = 5;

export function rechargeableCost(cost: number): number {
  return cost * RECHARGEABLE_COST_FACTOR;
}

/** Non-rechargeable cells get double the uptime or shots, then are useless. */
export const DISPOSABLE_CELL_UPTIME_FACTOR = 2;

function seriesOf(code: string): readonly PowerType[] {
  return BATTERY_TYPES.some((t) => t.code === code) ? BATTERY_TYPES : CELL_TYPES;
}

/**
 * How many batteries (or cells) of one size stand in for those a device asks
 * for: divide the number by 10 per line down the table, multiply it by 10 per
 * line up, and by 2 per TL the battery's TL exceeds (falls short of) the
 * device's. The result may be fractional; a caller rounds up to whole
 * batteries. Returns null where either code is not of the same series.
 */
export function substituteCount(options: {
  required: number;
  /** The size the device asks for. */
  from: string;
  /** The size on hand. */
  to: string;
  /** The battery's TL less the device's TL. */
  tlDifference?: number | undefined;
}): number | null {
  const list = seriesOf(options.from);
  const a = list.findIndex((t) => t.code === options.from);
  const b = list.findIndex((t) => t.code === options.to);
  if (a < 0 || b < 0) return null;
  const lines = b - a; // positive: the size on hand is further down, so fewer are needed
  const tl = Math.trunc(Number(options.tlDifference) || 0);
  return (Number(options.required) || 0) / Math.pow(10, lines) / Math.pow(2, tl);
}

/** The same ratio applied to uptime or shots: multiplied by 10 per line down, by 2 per TL of surplus. */
export function substituteUptime(options: { uptime: number; from: string; to: string; tlDifference?: number }): number | null {
  const factor = substituteCount({ required: 1, from: options.from, to: options.to, tlDifference: options.tlDifference });
  return factor === null ? null : (Number(options.uptime) || 0) / factor;
}
