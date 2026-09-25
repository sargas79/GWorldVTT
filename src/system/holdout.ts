/**
 * Hiding one item on your person with Holdout (GURPS Basic Set: Characters
 * p. 200), and a searcher's Quick Contest of Search against it.
 *
 * The roll is an ordinary success roll: its size line, what the character
 * wears and whether the thing moves or makes noise are lines the caller's
 * figures give, keyed so a listener can find them, and it passes through
 * `gworld.successRollModifiers` tagged `holdout` with the item, where a module
 * adds its own line -- a concealment holster, clothing cut to hide things.
 */

import { SYSTEM_ID } from "./constants.js";
import { attributeOf } from "./attributes.js";
import { skillLevelOf } from "./skill-level.js";
import { rollSuccess, type RollModifier } from "./roll.js";
import { rollQuickContest } from "./contest.js";
import { holdoutClothingModifier, holdoutLevel, holdoutMovingModifier, holdoutSizeModifier, searchLevel, HOLDOUT_SIZES } from "../rules/holdout.js";
import type { SuccessRollResult } from "../rules/success.js";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Holdout.${key}`, data) : game.i18n.localize(`GWORLD.Holdout.${key}`);

/** What `roll.holdout` is asked to roll (since API 1.152.0). */
export interface HoldoutOptions {
  /**
   * The item's size modifier from the skill's table: a row's key (see
   * `roll.holdoutSizes`) or the modifier as a number. Left out, the item's
   * `flags.gworld.holdoutSize` is used; with neither, nothing is rolled.
   */
  size?: number | string;
  /** What the character wears, as the modifier it gives: -7 to +5 (p. 200), held to that range. */
  clothing?: number;
  /** The thing moves or makes noise: true for -1, or a worse penalty as a negative number. */
  moving?: boolean | number;
  /** Other lines on the Holdout roll. */
  modifiers?: RollModifier[];
  /**
   * Someone searching for it: rolls a Quick Contest of their Search against
   * the Holdout, which the GM rolls in secret (p. 219) unless `rollMode` or
   * `secret` says otherwise.
   */
  searcher?: any;
  /** Lines on the searcher's side. */
  searchModifiers?: RollModifier[];
  /** The card's label, in place of the system's. */
  label?: string;
  rollMode?: string;
  secret?: boolean;
}

/** What a Holdout roll against a searcher came to (since API 1.152.0). */
export interface HoldoutContestResult {
  /** Whether the item stays hidden: the searcher did not win. */
  hidden: boolean;
  outcome: "first" | "second" | "tie";
  marginOfVictory: number;
  messageId: string;
}

/** The size table's rows with their labels, for a module's own picker. */
export function holdoutSizes(): Array<{ key: string; modifier: number; label: string }> {
  return HOLDOUT_SIZES.map((row) => ({ ...row, label: L(`Sizes.${row.key}`) }));
}

/** A number line, left out where it is zero or not a number. */
function line(label: string, value: unknown, key: string): RollModifier[] {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n !== 0 ? [{ label, value: n, key }] : [];
}

function validLines(lines: unknown): RollModifier[] {
  return Array.isArray(lines)
    ? lines.filter((m): m is RollModifier => typeof m?.label === "string" && typeof m.value === "number" && Number.isFinite(m.value))
    : [];
}

/**
 * Rolls Holdout to hide one item (p. 200): the skill, or IQ-5 or Sleight of
 * Hand-3, with the item's size modifier, what the character wears, a -1 for
 * a thing that moves or makes noise, and the lines the caller gives. With a
 * `searcher`, rolls the book's Quick Contest of Search (or Perception-5)
 * against it instead. Resolves to the success roll's result, or the
 * contest's with `hidden`; null where no size is known or no roll was made.
 */
export async function rollHoldout(actor: any, item: any, options: HoldoutOptions = {}): Promise<SuccessRollResult | HoldoutContestResult | null> {
  if (!actor) return null;
  const itemName = String(item?.name ?? "");
  // A blank size is no size: the item's own is read, as for one left out.
  const given = typeof options.size === "string" && !options.size.trim() ? undefined : options.size;
  const size = holdoutSizeModifier(given ?? item?.flags?.[SYSTEM_ID]?.holdoutSize);
  if (size === null) {
    ui.notifications?.warn(L("NoSize", { item: itemName }));
    return null;
  }
  const skill = holdoutLevel({
    holdout: skillLevelOf(actor, "Holdout"),
    iq: attributeOf(actor, "IQ"),
    sleightOfHand: skillLevelOf(actor, "Sleight of Hand"),
  });
  const modifiers: RollModifier[] = [
    ...line(L("Size"), size, "holdoutSize"),
    ...line(L("Clothing"), holdoutClothingModifier(options.clothing), "clothing"),
    ...line(L("Moving"), holdoutMovingModifier(options.moving), "moving"),
    ...validLines(options.modifiers),
  ];
  const custom = typeof options.label === "string" && options.label.trim() ? options.label.trim() : null;
  // The default in use, where the skill isn't: "IQ-5" or "Sleight of Hand-3".
  const basis = skill.from === "Holdout" ? null : skill.from === "IQ" ? "IQ-5" : L("SleightOfHand");
  const label = custom ?? (basis ? L("LabelDefault", { item: itemName, from: basis }) : L("Label", { item: itemName }));
  const visibility = {
    ...(options.rollMode !== undefined ? { rollMode: options.rollMode } : {}),
    ...(options.secret !== undefined ? { secret: options.secret } : {}),
  };

  if (!options.searcher) {
    return rollSuccess({ actor, base: skill.level, label, skill: "Holdout", tags: ["holdout"], item: item ?? null, modifiers, ...visibility });
  }

  const searcher = options.searcher;
  const search = searchLevel({
    search: skillLevelOf(searcher, "Search"),
    per: Number(searcher?.system?.derived?.per) || attributeOf(searcher, "IQ"),
    criminology: skillLevelOf(searcher, "Criminology"),
  });
  // Both sides are tagged `holdout` and carry the item; a listener tells
  // them apart by `skill`, "Holdout" or "Search", whatever default is used.
  // The GM rolls a search in secret (p. 219) unless the caller says who sees it.
  const secretly = options.rollMode === undefined && options.secret === undefined;
  const contest = await rollQuickContest({
    // The card names the hider's default, as the solo roll's label does;
    // the side's `skill` stays "Holdout" for the listeners.
    label: custom ?? (basis ? L("SearchLabelDefault", { item: itemName, from: basis }) : L("SearchLabel", { item: itemName })),
    first: { actor, base: skill.level, modifiers, note: "Holdout", ...(item ? { item } : {}) },
    second: {
      actor: searcher, base: search.level, modifiers: validLines(options.searchModifiers), note: "Search",
      ...(item ? { item } : {}),
    },
    tags: ["holdout"],
    ...(secretly ? { secret: true } : visibility),
  });
  return {
    hidden: contest.outcome !== "second",
    outcome: contest.outcome,
    marginOfVictory: contest.marginOfVictory,
    messageId: contest.messageId,
  };
}
