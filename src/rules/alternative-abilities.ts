/**
 * Alternative Abilities, Character Point-Powered Abilities and the wildcard
 * bonus (Basic Set Revised pp. 324-325, 333; Alternative Attacks, p. 61).
 *
 * Pure rules: what each ability of an alternative set costs, which of them are
 * on, what a swap takes, what a point-powered ability costs to build and to
 * use, and what a wildcard's level adds to a related roll.
 */

/** An ability of an alternative set, as the sheet holds it. */
export interface AlternativeMember {
  id: string;
  /** The set it belongs to; blank for a trait in none. */
  group: string;
  /** The slots the set has, as this member states them. */
  slots: number;
  /** What it costs at full price, modifiers applied. */
  cost: number;
  /** In a slot right now. */
  active?: boolean;
  /** Burned out, crippled, neutralized or drained. */
  disabled?: boolean;
  /** Can't be swapped out: its duration hasn't expired (p. 324, drawback 3). */
  frozen?: boolean;
  /** An attack, for the free swap between attacks. */
  attack?: boolean;
  /** Carries a Link enhancement, which a set can't have between its abilities. */
  linked?: boolean;
}

/** The divisor of an alternative ability that isn't among the dearest. */
export const ALTERNATIVE_DIVISOR = 5;

/** Round up, away from zero for a negative figure. */
function ceilFraction(value: number): number {
  return value < 0 ? -Math.ceil(-value - 1e-9) : Math.ceil(value - 1e-9);
}

/** The key a set is kept under: names match without regard to case or spacing. */
export function alternativeKey(group: string | null | undefined): string {
  return String(group ?? "").trim().toLowerCase();
}

/** The cost of an ability built as a fifth of its price: divide by 5 and round up (p. 324). */
export function fifthCost(cost: number): number {
  return ceilFraction(cost / ALTERNATIVE_DIVISOR);
}

/**
 * What each member of a set is billed (p. 324): full price for the `slots`
 * dearest, a fifth of the price, rounded up, for the rest. Slots are the
 * greatest any member states, and at least one. A member of no set, or one
 * that costs nothing or pays points back, is billed as it is.
 */
export function alternativeBilling(members: readonly AlternativeMember[]): Map<string, number> {
  const billed = new Map<string, number>();
  const sets = new Map<string, AlternativeMember[]>();
  for (const member of members) {
    const key = alternativeKey(member.group);
    if (!key || !(member.cost > 0)) {
      billed.set(member.id, member.cost);
      continue;
    }
    sets.set(key, [...(sets.get(key) ?? []), member]);
  }
  for (const list of sets.values()) {
    const slots = alternativeSlots(list);
    const ranked = list.map((m, index) => ({ m, index })).sort((a, b) => b.m.cost - a.m.cost || a.index - b.index);
    ranked.forEach(({ m }, place) => billed.set(m.id, place < slots ? m.cost : fifthCost(m.cost)));
  }
  return billed;
}

/** How many slots a set has: the most any member states, never fewer than one. */
export function alternativeSlots(members: readonly Pick<AlternativeMember, "slots">[]): number {
  return Math.max(1, ...members.map((m) => Math.max(1, Math.floor(Number(m.slots) || 1))));
}

/** The state of one set. */
export interface AlternativeSet {
  key: string;
  slots: number;
  /** Anything disabling one ability disables the whole collection (p. 324, drawback 2). */
  disabled: boolean;
  /** The ability ids in a slot and usable. */
  active: string[];
  /** Slots with nothing in them. */
  free: number;
  /** Slots held by an ability that can't be swapped out yet. */
  frozen: number;
  members: string[];
}

/** Sorts members into their sets, with what each set has on and free. */
export function alternativeSets(members: readonly AlternativeMember[]): AlternativeSet[] {
  const sets = new Map<string, AlternativeMember[]>();
  for (const member of members) {
    const key = alternativeKey(member.group);
    if (key) sets.set(key, [...(sets.get(key) ?? []), member]);
  }
  return [...sets.entries()].map(([key, list]) => {
    const slots = alternativeSlots(list);
    const disabled = list.some((m) => m.disabled === true);
    // An ability can hold only one slot, and a set holds no more than it has slots.
    const active = disabled ? [] : list.filter((m) => m.active === true).slice(0, slots).map((m) => m.id);
    const frozen = list.filter((m) => m.active === true && m.frozen === true).length;
    return { key, slots, disabled, active, free: disabled ? 0 : Math.max(0, slots - active.length), frozen: Math.min(frozen, slots), members: list.map((m) => m.id) };
  });
}

/** Whether an ability's effects count: in a slot and not disabled, or in no set at all. */
export function alternativeUsable(member: AlternativeMember, sets: readonly AlternativeSet[]): boolean {
  const key = alternativeKey(member.group);
  if (!key) return true;
  const set = sets.find((s) => s.key === key);
  return set ? set.active.includes(member.id) : true;
}

/** What swapping an ability into a set takes. */
export type SwapResult =
  | { ok: true; action: "none" | "ready" | "free"; replaces: string | null }
  | { ok: false; reason: "disabled" | "already" | "frozen" };

/**
 * Bringing an ability into a slot (p. 324): free if a slot is empty and it
 * is not being filled by a change of setting, otherwise a Ready maneuver; a
 * swap from one attack to another is free. The slot given up is the first
 * ability in it that isn't frozen. Where every slot is held by an ability
 * still running, the swap can't be made.
 */
export function swapAlternative(members: readonly AlternativeMember[], incomingId: string): SwapResult {
  const incoming = members.find((m) => m.id === incomingId);
  if (!incoming) return { ok: false, reason: "already" };
  const set = alternativeSets(members).find((s) => s.key === alternativeKey(incoming.group));
  if (!set) return { ok: true, action: "none", replaces: null };
  if (set.disabled) return { ok: false, reason: "disabled" };
  if (set.active.includes(incomingId)) return { ok: false, reason: "already" };
  const byId = new Map(members.map((m) => [m.id, m]));
  if (set.free > 0) return { ok: true, action: "ready", replaces: null };
  const out = set.active.map((id) => byId.get(id)!).find((m) => m.frozen !== true);
  if (!out) return { ok: false, reason: "frozen" };
  // "After switching to an attack, switching to a different attack in that slot is a free action."
  const free = out.attack === true && incoming.attack === true;
  return { ok: true, action: free ? "free" : "ready", replaces: out.id };
}

// ── Character point-powered abilities (p. 325) ────────────────────────────

/** What a point-powered ability costs to buy: the normal cost over five, rounded up. */
export function pointPoweredCost(cost: number): number {
  return fifthCost(cost);
}

/** How well a use suits the story, and so what it costs (p. 325). */
export type PointPoweredFit = "perfect" | "believable" | "showing";

/** The points a use is priced at: 1 when it fits the scene, 2 when believable, 3 up to the ability's cost for showing off. */
export function pointPoweredUse(fit: PointPoweredFit, options: { cost: number; disruption?: number }): number {
  if (fit === "perfect") return 1;
  if (fit === "believable") return 2;
  const ceiling = Math.max(3, Math.floor(options.cost) || 3);
  return Math.min(ceiling, Math.max(3, Math.floor(Number(options.disruption ?? 3)) || 3));
}

/** The dearest a use can cost: the ability's own cost, never below 3. */
export function pointPoweredCeiling(cost: number): number {
  return Math.max(3, Math.floor(cost) || 3);
}

// ── Bonuses for wildcard skills (p. 333) ──────────────────────────────────

/** The kinds of roll a wildcard's positive relative level can aid, each one a category the GM picks. */
export const WILDCARD_CATEGORIES = [
  "noSkill", "advantage", "resist", "hazard", "reaction", "penalty", "accuracy", "damage", "healing", "others",
] as const;

export type WildcardCategory = (typeof WILDCARD_CATEGORIES)[number];

/**
 * A wildcard's bonus to a related roll: its positive relative level, halved
 * (rounded up) when the roll is under three dice, an active defense, a large
 * group all the time, or a direct damage or Accuracy bonus the GM halves.
 * Nothing for a level of zero or less. A bonus never stacks with itself, so
 * `applied` names the categories already given a bonus this roll.
 */
export function wildcardBonus(options: {
  relativeLevel: number;
  category: WildcardCategory;
  dice?: number;
  activeDefense?: boolean;
  halve?: boolean;
  applied?: readonly WildcardCategory[];
}): number {
  const level = Math.trunc(Number(options.relativeLevel) || 0);
  if (level <= 0) return 0;
  if ((options.applied ?? []).length > 0) return 0;
  return wildcardHalved(options) ? Math.ceil(level / 2) : level;
}

/**
 * Whether a wildcard's bonus is halved for a roll (p. 333): under three
 * dice, an active defense, a category the book calls best halved (Accuracy),
 * or when the GM has said so (a large group all the time, direct damage).
 */
export function wildcardHalved(options: { category: WildcardCategory; dice?: number; activeDefense?: boolean; halve?: boolean }): boolean {
  return options.halve === true
    || options.category === "accuracy"
    || options.activeDefense === true
    || (options.dice !== undefined && options.dice < 3);
}

/**
 * The categories of bonus a wildcard can give to a roll of this kind (p. 333):
 * a to-hit roll takes only Accuracy and an offset against penalties; an
 * active defense resists, avoids hazards or offsets penalties; a skill or
 * attribute roll takes the rest but a weapon's Accuracy and ST or damage,
 * which belong to attacks.
 */
export function wildcardCategoriesFor(rollKind: "skill" | "attribute" | "defense" | "attack" | "damage"): readonly WildcardCategory[] {
  switch (rollKind) {
    case "attack": return ["accuracy", "penalty"];
    case "damage": return ["damage"];
    case "defense": return ["resist", "hazard", "penalty"];
    default: return ["noSkill", "advantage", "resist", "hazard", "reaction", "penalty", "healing", "others"];
  }
}

/** The category a roll offers first: an active defense is resistance; an attack is Accuracy; a plain roll has no skill of its own. */
export function defaultWildcardCategory(rollKind: "skill" | "attribute" | "defense" | "attack" | "damage"): WildcardCategory {
  if (rollKind === "defense") return "resist";
  if (rollKind === "attack") return "accuracy";
  if (rollKind === "damage") return "damage";
  return "noSkill";
}

// ── Links between alternatives (p. 324, drawback 1) ───────────────────────

/** A member of a set that carries a Link enhancement, as the check reads it. */
export type LinkableMember = Pick<AlternativeMember, "id" | "group"> & {
  /** The ability has a Link enhancement (p. 106). */
  linked?: boolean;
};

/**
 * The abilities that break the rule "it's impossible to have a Link between"
 * alternative abilities (p. 324): any member carrying a Link enhancement in a
 * set of two or more, since a Link ties one ability to another and only the
 * ones in slots work at a time. Returned by id.
 */
export function alternativeLinkConflicts(members: readonly LinkableMember[]): string[] {
  const sets = new Map<string, LinkableMember[]>();
  for (const member of members) {
    const key = alternativeKey(member.group);
    if (key) sets.set(key, [...(sets.get(key) ?? []), member]);
  }
  const out: string[] = [];
  for (const list of sets.values()) {
    if (list.length < 2) continue;
    for (const member of list) if (member.linked === true) out.push(member.id);
  }
  return out;
}

/** Whether a modifier's name is the Link enhancement (with or without a note after it). */
export function isLinkModifier(name: string): boolean {
  return /^link\b/i.test(String(name ?? "").trim());
}

// ── Alternative benefits for Talents (pp. 324-325) ────────────────────────

/**
 * What a Talent gives in place of its reaction bonus, as the GM chooses
 * (pp. 324-325): blank keeps the reaction bonus; "none" is no extra benefit;
 * the rest are the other benefits the book lists, each a bonus the roll
 * dialog offers as the Talent's levels.
 */
export const TALENT_BENEFITS = [
  "", "none", "influence", "followUp", "defaults", "noSkill", "contests", "advantages", "selfless", "penalty", "feat",
] as const;

export type TalentBenefit = (typeof TALENT_BENEFITS)[number];

/** A stored value read as one of the benefits; anything unknown is the reaction bonus. */
export function talentBenefitOf(value: unknown): TalentBenefit {
  const text = String(value ?? "").trim();
  return (TALENT_BENEFITS as readonly string[]).includes(text) ? (text as TalentBenefit) : "";
}

/** Whether a Talent still gives its reaction bonus: no benefit chosen in its place and the flag not set. */
export function talentGivesReaction(talent: { noReactionBonus?: boolean; benefit?: unknown }): boolean {
  return talent.noReactionBonus !== true && talentBenefitOf(talent.benefit) === "";
}

/**
 * The modifier a Talent's alternative benefit puts on a roll it is offered
 * for: its levels as a bonus, or for access to a feat (p. 325) the roll at
 * attribute-4 plus the Talent's level, which is levels - 4 to the attribute.
 * Nothing for the reaction bonus or for "none".
 */
export function talentBenefitBonus(options: { benefit: unknown; levels: number }): number {
  const benefit = talentBenefitOf(options.benefit);
  const levels = Math.max(0, Math.floor(Number(options.levels) || 0));
  if (benefit === "" || benefit === "none") return 0;
  return benefit === "feat" ? levels - 4 : levels;
}
