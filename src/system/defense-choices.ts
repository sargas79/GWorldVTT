/**
 * Which of the three active defenses a defender is offered on an attack card,
 * and why any of them is not.
 *
 * The card used to list only the defenses that could be rolled, so a fighter
 * with no shield saw a Dodge button and nothing else, and could not tell
 * whether Parry was missing because they had no weapon, because they were
 * attacked from behind, or because the card had forgotten it. All three are
 * listed now, every time, and the ones that cannot be rolled say why.
 *
 * Kept apart from the chat module so it can be tested without Foundry.
 */

/** The three active defenses, in the order the sheet lists them. */
export const DEFENSE_ORDER = ["dodge", "parry", "block"] as const;
export type DefenseKey = (typeof DEFENSE_ORDER)[number];

/** A defense as the actor's derived block reports it. */
export interface DefenseScore {
  total: number;
  skillName?: string;
  isFencing?: boolean;
}

/** What the tactical rules say about an attack from a given arc. */
export interface ArcRestriction {
  helpless: boolean;
  canDodge: boolean;
  canParry: boolean;
  canBlock: boolean;
  /** Penalty to every defense from the arc. */
  modifier: number;
  /** A further penalty to the parry alone. */
  parryModifier: number;
}

/** Why a defense is not on offer. */
export type DefenseRefusal =
  /** Attacked from behind, or otherwise unable to react at all. */
  | "helpless"
  /** The arc the attack came from puts this defense out of reach. */
  | "arc"
  /** This turn's maneuver forfeits the defense. */
  | "maneuver"
  /** Nothing in hand that can parry. */
  | "noParry"
  /** No shield to block with. */
  | "noBlock";

export interface DefenseChoice {
  key: DefenseKey;
  /** True when the button may be pressed. */
  available: boolean;
  /** The number the button shows, after the arc and any deception. Null when unavailable. */
  shown: number | null;
  /** The unmodified score, which is what the roll is made against. */
  total: number;
  /** The penalty the arc adds, for the roll's modifier line. */
  arcPenalty: number;
  reason: DefenseRefusal | null;
  skillName: string;
  isFencing: boolean;
}

/**
 * The three defenses for one defender against one attack.
 *
 * `maneuver` says whether the defender's maneuver forbids defending at all, or
 * parrying in particular, which is otherwise indistinguishable from having no
 * weapon: both leave the parry null on the sheet.
 */
export function defenseChoices(options: {
  defenses: Partial<Record<DefenseKey, DefenseScore | null | undefined>>;
  arc?: ArcRestriction | null;
  /** A penalty the attack imposes on every defense: a Deceptive Attack or a Feint. */
  deception?: number;
  maneuver?: { defenseAvailable?: boolean; parryAvailable?: boolean } | null;
}): DefenseChoice[] {
  const { defenses } = options;
  const arc = options.arc ?? null;
  const deception = options.deception ?? 0;
  const maneuver = options.maneuver ?? null;

  return DEFENSE_ORDER.map((key) => {
    const score = defenses[key] ?? null;
    const arcPenalty = arc ? arc.modifier + (key === "parry" ? arc.parryModifier : 0) : 0;

    const refused = (reason: DefenseRefusal): DefenseChoice => ({
      key,
      available: false,
      shown: null,
      total: score?.total ?? 0,
      arcPenalty,
      reason,
      skillName: score?.skillName ?? "",
      isFencing: Boolean(score?.isFencing),
    });

    // The arc comes first: a fighter struck from behind has no defense however
    // well armed, and saying "no shield" about it would be answering the wrong
    // question.
    if (arc?.helpless) return refused("helpless");
    if (arc && key === "dodge" && !arc.canDodge) return refused("arc");
    if (arc && key === "parry" && !arc.canParry) return refused("arc");
    if (arc && key === "block" && !arc.canBlock) return refused("arc");

    if (!score) {
      if (maneuver?.defenseAvailable === false) return refused("maneuver");
      if (key === "parry" && maneuver?.parryAvailable === false) return refused("maneuver");
      if (key === "parry") return refused("noParry");
      if (key === "block") return refused("noBlock");
      return refused("maneuver");
    }

    return {
      key,
      available: true,
      shown: score.total + arcPenalty + deception,
      total: score.total,
      arcPenalty,
      reason: null,
      skillName: score.skillName ?? "",
      isFencing: Boolean(score.isFencing),
    };
  });
}
