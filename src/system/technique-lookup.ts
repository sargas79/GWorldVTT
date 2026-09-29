/**
 * Reading a character's techniques by name (Basic Set Revised pp. 333-334).
 */

/**
 * The level of the character's best technique whose name starts with a prefix
 * (Neck Snap, Wrench Arm, Wrench Leg: ST-4 and bought up, Revised p. 334), or null.
 */
export function techniqueLevelByPrefix(actor: any, prefix: string): number | null {
  let best: number | null = null;
  for (const item of actor?.items ?? []) {
    if (item?.type !== "technique" || !String(item.name ?? "").toLowerCase().startsWith(prefix.toLowerCase())) continue;
    const level = item.system?.derived?.level;
    if (typeof level === "number" && (best === null || level > best)) best = level;
  }
  return best;
}

/** Levels bought in the techniques whose names start with a prefix, the most of any. */
export function techniqueLevelsBoughtByPrefix(actor: any, prefix: string): number {
  let most = 0;
  for (const item of actor?.items ?? []) {
    if (item?.type !== "technique" || !String(item.name ?? "").toLowerCase().startsWith(prefix.toLowerCase())) continue;
    most = Math.max(most, Number(item.system?.derived?.levels) || 0);
  }
  return most;
}
