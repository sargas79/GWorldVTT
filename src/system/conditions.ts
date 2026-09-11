/**
 * The states a character can be in, as Foundry knows them
 * (GURPS Basic Set: Campaigns pp. 419-423, 428).
 *
 * Foundry ships a list of status effects built for another game -- charmed,
 * blinded, restrained -- and a GURPS table has no use for most of it. These
 * replace it: what a wound actually does to somebody, on the token, where
 * everyone at the table can see it.
 *
 * Until now the damage card *reported* these -- "major wound", "unconscious
 * check" -- and left every one of them to be remembered. A condition on the
 * token is the difference between a rule the system knows and a rule the GM
 * has to hold in their head for eleven combatants at once.
 */

/** A state a token can be in, with the icon it shows. */
export interface ConditionDefinition {
  id: string;
  /** Localization key for its name. */
  label: string;
  /** An icon from Foundry's own set, so no art ships with this system. */
  img: string;
}

/**
 * Every condition this system sets.
 *
 * Posture is deliberately absent: it is a field on the sheet with rules of its
 * own attached, and a token icon that could disagree with it would be worse
 * than no icon at all. Prone is the exception, because knockdown sets it and a
 * fighter on the ground is the single most important thing to see on a map.
 */
export const CONDITIONS: readonly ConditionDefinition[] = [
  { id: "stunned", label: "GWORLD.Condition.Stunned", img: "icons/svg/daze.svg" },
  { id: "prone", label: "GWORLD.Condition.Prone", img: "icons/svg/falling.svg" },
  { id: "unconscious", label: "GWORLD.Condition.Unconscious", img: "icons/svg/unconscious.svg" },
  { id: "reeling", label: "GWORLD.Condition.Reeling", img: "icons/svg/downgrade.svg" },
  { id: "bleeding", label: "GWORLD.Condition.Bleeding", img: "icons/svg/blood.svg" },
  { id: "grappling", label: "GWORLD.Condition.Grappling", img: "icons/svg/net.svg" },
  { id: "grappled", label: "GWORLD.Condition.Grappled", img: "icons/svg/padlock.svg" },
  { id: "pinned", label: "GWORLD.Condition.Pinned", img: "icons/svg/paralysis.svg" },
  { id: "dead", label: "GWORLD.Condition.Dead", img: "icons/svg/skull.svg" },
];

const CONDITION_IDS = new Set(CONDITIONS.map((c) => c.id));

/**
 * Replaces Foundry's status effect list with this one. Called once, at init.
 *
 * Replaced rather than added to: the shipped list is another game's, and
 * leaving it in place would offer a GM two dozen states this system has no
 * rules for beside the six it does.
 *
 * `CONFIG.statusEffects` looks like an array and is not one: it is a Proxy that
 * also indexes each entry by its id, which is how `Actor#toggleStatusEffect`
 * finds a status. Assigning a plain array over it would leave the list looking
 * right and every toggle throwing "Invalid status ID", so the list is emptied
 * through the proxy and each condition assigned by id, exactly as Foundry
 * populates its own.
 */
export function registerConditions(): void {
  CONFIG.statusEffects.length = 0;
  for (const condition of CONDITIONS) {
    CONFIG.statusEffects[condition.id] = {
      id: condition.id,
      name: condition.label,
      img: condition.img,
    };
  }
}

/** Whether an actor is currently in a given state. */
export function hasCondition(actor: any, id: string): boolean {
  return actor?.statuses?.has?.(id) === true;
}

/**
 * Sets or clears one condition on an actor.
 *
 * Silent about a condition nobody registered: a typo should not put an icon on
 * a token that nothing can ever take off again.
 */
export async function setCondition(actor: any, id: string, active: boolean): Promise<void> {
  if (!CONDITION_IDS.has(id) || !actor?.isOwner) return;
  if (hasCondition(actor, id) === active) return;
  await actor.toggleStatusEffect?.(id, { active });
}

/**
 * Brings the conditions that follow from a character's hit points into line
 * with what the sheet says.
 *
 * Reeling and dead are not judgements anybody makes -- they are what the HP
 * total means (pp. 419-423) -- so they are set from it rather than asked about.
 * Stun, knockdown and unconsciousness are the results of rolls, and are left
 * alone here: a character who woke up should not be knocked out again by the
 * next point of damage.
 */
export async function syncHealthConditions(actor: any): Promise<void> {
  if (!actor?.isOwner) return;

  const status = actor.system?.derived?.status;
  if (typeof status !== "string") return;

  await setCondition(actor, "reeling", status === "reeling" || status === "collapsing");
  await setCondition(actor, "dead", status === "dead" || status === "destroyed");
}
