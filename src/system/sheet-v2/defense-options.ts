/**
 * The quick choices under each active defense on the character sheet
 * (GWorldVTT #877): Retreat and Defend.
 *
 * Retreat (Campaigns p. 377) is chosen for one defense and taken on its next
 * roll: +3 to Dodge, +1 to Parry or Block, and +3 to a Parry made with a
 * fencing weapon, Boxing, Judo or Karate. Until rolled, the defense shows
 * with it.
 *
 * Defend is All-Out Defense (Increased Defense), +2 to one defense (p. 366):
 * the character's maneuver, chosen from under the defense it raises. The
 * defense's figure already carries the +2 once it is chosen, so the choice
 * only says which it is.
 *
 * Kept apart from Foundry so it can be tested without it.
 */

import { retreatBonus } from "../../rules/tactical.js";

export type DefenseKey = "dodge" | "parry" | "block";

export const DEFENSE_KEYS: readonly DefenseKey[] = ["dodge", "parry", "block"];

/** What All-Out Defense (Increased Defense) adds to the defense it names (p. 366). */
export const INCREASED_DEFENSE_BONUS = 2;

/** A defense card as the sheet draws it. */
export interface DefenseCard {
  key: string;
  label: string;
  total: number;
  source: string;
  math: string;
  available: boolean;
}

/** As much of the character as the choices read. */
export interface DefenseState {
  maneuver?: unknown;
  allOutDefenseOption?: unknown;
  allOutDefenseTarget?: unknown;
  /** The All-Out Defense condition, which stands for the maneuver. */
  allOutDefense?: unknown;
  /** Whether the Retreat rule is in play (it is an optional rule); on unless said otherwise. */
  retreatAllowed?: boolean;
  /** What the parry and the block are made with, for Retreat's exception. */
  defenses?: Partial<Record<DefenseKey, { skillName?: unknown; isFencing?: unknown } | null>> | null;
}

export type DefenseCardWithOptions<C extends DefenseCard> = C & {
  /** The figure the card shows: its total, and a retreat's bonus while one is chosen. */
  shown: number;
  retreat: { bonus: number; on: boolean };
  defend: { bonus: number; on: boolean };
};

function isDefenseKey(key: string): key is DefenseKey {
  return (DEFENSE_KEYS as readonly string[]).includes(key);
}

/** The defense All-Out Defense (Increased Defense) raises, or null where it raises none. */
export function increasedDefense(state: DefenseState): DefenseKey | null {
  const allOut = state.maneuver === "allOutDefense" || state.allOutDefense === true;
  if (!allOut || state.allOutDefenseOption !== "increased") return null;
  const target = String(state.allOutDefenseTarget ?? "");
  return isDefenseKey(target) ? target : null;
}

/** Adds the Retreat and Defend choices to each defense card. */
export function withDefenseOptions<C extends DefenseCard>(
  cards: readonly C[],
  state: DefenseState,
  retreating: ReadonlySet<string>,
): Array<DefenseCardWithOptions<C>> {
  const increased = increasedDefense(state);
  return cards.map((card) => {
    const key = isDefenseKey(card.key) ? card.key : null;
    const used = key ? state.defenses?.[key] : null;
    const bonus = key && state.retreatAllowed !== false
      ? retreatBonus({ defense: key, skill: String(used?.skillName ?? ""), isFencing: used?.isFencing === true })
      : 0;
    const on = card.available && bonus > 0 && retreating.has(card.key);
    return {
      ...card,
      shown: card.total + (on ? bonus : 0),
      retreat: { bonus, on },
      defend: { bonus: INCREASED_DEFENSE_BONUS, on: key !== null && increased === key },
    };
  });
}

/**
 * The actor update that picks Defend for a defense, or takes it back where
 * that defense is already the one raised: back to Do Nothing, as the maneuver
 * was given up for it.
 */
export function defendUpdate(state: DefenseState, defense: DefenseKey): Record<string, unknown> {
  if (increasedDefense(state) === defense) {
    return {
      ...(state.maneuver === "allOutDefense" ? { "system.maneuver": "doNothing" } : {}),
      ...(state.allOutDefense === true ? { "system.conditions.allOutDefense": false } : {}),
    };
  }
  return {
    "system.maneuver": "allOutDefense",
    "system.allOutDefenseOption": "increased",
    "system.allOutDefenseTarget": defense,
  };
}
