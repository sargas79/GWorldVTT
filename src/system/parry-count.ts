/**
 * Which parry of the turn this is, for the penalty on parrying more than once
 * (Campaigns p. 376).
 *
 * The count is kept per weapon, and each attack parried is remembered by its
 * card, so that pressing Parry again on the same attack -- a re-roll, a
 * misclick -- is the same parry rather than the next one. The defender may
 * also say which parry it is, where the count has it wrong: a parry made off
 * the cards, or one that should not have counted.
 */

/** The parries a defender has made this turn: how many with each weapon, and against which attacks. */
export interface ParryLedger {
  parries: Record<string, number>;
  /** The attack cards parried with each weapon, in order (since API 1.195.0). */
  parriedBy: Record<string, string[]>;
}

/**
 * How many parries with this weapon come before this one: the number the
 * defender chose, where they chose one; the place of this attack among those
 * already parried, where it is one; and otherwise every parry so far.
 */
export function parriesBefore(ledger: ParryLedger, weapon: string, attack: string, chosen: number | null): number {
  if (chosen !== null && Number.isInteger(chosen) && chosen >= 0) return chosen;
  const place = attack ? (ledger.parriedBy[weapon] ?? []).indexOf(attack) : -1;
  if (place >= 0) return place;
  return Math.max(0, ledger.parries[weapon] ?? 0);
}

/** The ledger after a parry with this weapon against this attack, as `parriesBefore` placed it. */
export function afterParry(ledger: ParryLedger, weapon: string, attack: string, chosen: number | null): ParryLedger {
  const parried = ledger.parriedBy[weapon] ?? [];
  // A parry made again against an attack already counted is the same parry.
  if (chosen === null && attack !== "" && parried.includes(attack)) {
    return { parries: { ...ledger.parries }, parriedBy: { ...ledger.parriedBy } };
  }
  // Any other sets the count to this parry's place, whatever was counted before.
  const before = parriesBefore(ledger, weapon, attack, chosen);
  const kept = parried.filter((id) => id !== attack).slice(0, before);
  return {
    parries: { ...ledger.parries, [weapon]: before + 1 },
    parriedBy: { ...ledger.parriedBy, [weapon]: attack ? [...kept, attack] : kept },
  };
}
