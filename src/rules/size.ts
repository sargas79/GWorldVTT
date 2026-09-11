/**
 * Being very large (GURPS Basic Set: Campaigns p. 402).
 *
 * Size Modifier already decides how easy somebody is to shoot at, which the
 * Size and Speed/Range Table handles. In melee it does something else: a big
 * fighter's arms are longer, so their weapons reach further, and they have an
 * easier time getting hold of somebody smaller.
 */

/**
 * The extra reach a positive Size Modifier gives (p. 402).
 *
 * "Increase the upper end of the reach of any melee weapon according to the
 * table." It is not linear -- SM +5 is worth five yards and SM +10 is worth
 * thirty -- so the table is the table.
 */
const REACH_BY_SIZE: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [2, 1], [3, 2], [4, 3], [5, 5],
  [6, 7], [7, 10], [8, 15], [9, 20], [10, 30],
];

/**
 * Extra reach for a Size Modifier, in yards.
 *
 * SM +1 adds nothing to the numbers -- its only effect is that "a reach C
 * weapon increases to reach 1" -- and anything past the table keeps the
 * largest listed value rather than guessing at a bigger one.
 */
export function reachBonusForSize(sizeModifier: number): number {
  const sm = Math.floor(sizeModifier);
  if (sm < 1) return 0;

  let bonus = 0;
  for (const [listed, reach] of REACH_BY_SIZE) {
    if (sm >= listed) bonus = reach;
  }
  return bonus;
}

/**
 * Whether a reach C weapon becomes reach 1 in these hands (p. 402).
 *
 * "A reach C weapon increases to reach 1, but there are no other effects" at
 * SM +1 -- and anything larger reaches further still.
 */
export function closeWeaponReaches(sizeModifier: number): boolean {
  return Math.floor(sizeModifier) >= 1;
}

/**
 * A weapon's reach in the hands of somebody this size.
 *
 * Reach is written as a string on every weapon -- "1", "1,2", "C,1", "2-3" --
 * and only the upper end moves, so the string is rewritten rather than
 * reinterpreted. A weapon nobody can parse is returned untouched.
 */
export function reachForSize(reach: string, sizeModifier: number): string {
  const bonus = reachBonusForSize(sizeModifier);
  const close = closeWeaponReaches(sizeModifier);
  if (bonus === 0 && !close) return reach;

  const parts = reach.split(/\s*,\s*/).filter(Boolean);
  if (parts.length === 0) return reach;

  // "C" on its own becomes 1 for anything SM +1 or larger; a weapon that
  // already reaches further keeps its close option and extends its longest.
  // Anything else -- a reach this cannot read -- is handed back untouched
  // rather than guessed at: a weapon with a reach nobody can parse is one
  // whose reach nobody should be inventing.
  const numbers = parts.filter((part) => /^\d/.test(part));
  if (numbers.length === 0) {
    const onlyClose = parts.every((part) => part.toUpperCase() === "C");
    return close && onlyClose ? parts.map(() => "1").join(",") : reach;
  }

  const last = numbers[numbers.length - 1]!;
  const range = last.split("-");
  const longest = Number(range[range.length - 1]);
  if (!Number.isFinite(longest)) return reach;

  const extended = String(longest + bonus);
  const rewritten = range.length > 1 ? `${range[0]}-${extended}` : extended;

  return parts.map((part) => (part === last ? rewritten : part)).join(",");
}

/**
 * The bonus to grapple somebody smaller than you (p. 402).
 *
 * "You also get +1 to hit when you grapple per +1 SM advantage you have over
 * your target." A giant gets nothing for grappling another giant.
 */
export function grappleSizeBonus(sizeModifier: number, foeSizeModifier: number): number {
  return Math.max(0, Math.floor(sizeModifier) - Math.floor(foeSizeModifier));
}
