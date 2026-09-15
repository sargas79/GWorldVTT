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
  // Caught in a net, a bolas or a lariat (Campaigns pp. 410-411).
  { id: "entangled", label: "GWORLD.Condition.Entangled", img: "icons/svg/net.svg" },
  { id: "suffocating", label: "GWORLD.Condition.Suffocating", img: "icons/svg/silenced.svg" },
  {
    id: "mortallyWounded",
    label: "GWORLD.Condition.MortallyWounded",
    img: "icons/svg/hazard.svg",
  },
  { id: "dead", label: "GWORLD.Condition.Dead", img: "icons/svg/skull.svg" },

  // The affliction table (pp. 428-429). A poison, a gas, a spell or a blow
  // leaves somebody in one of these, and until now the card said which and
  // left it to be remembered.
  { id: "coughing", label: "GWORLD.Affliction.Name.coughing", img: "icons/svg/silenced.svg" },
  { id: "drowsy", label: "GWORLD.Affliction.Name.drowsy", img: "icons/svg/sleep.svg" },
  { id: "tipsy", label: "GWORLD.Affliction.Name.tipsy", img: "icons/svg/tankard.svg" },
  { id: "drunk", label: "GWORLD.Affliction.Name.drunk", img: "icons/svg/stoned.svg" },
  { id: "euphoria", label: "GWORLD.Affliction.Name.euphoria", img: "icons/svg/aura.svg" },
  { id: "nauseated", label: "GWORLD.Affliction.Name.nauseated", img: "icons/svg/poison.svg" },
  { id: "moderatePain", label: "GWORLD.Affliction.Name.moderatePain", img: "icons/svg/degen.svg" },
  { id: "severePain", label: "GWORLD.Affliction.Name.severePain", img: "icons/svg/degen.svg" },
  { id: "terriblePain", label: "GWORLD.Affliction.Name.terriblePain", img: "icons/svg/degen.svg" },
  { id: "agony", label: "GWORLD.Affliction.Name.agony", img: "icons/svg/terror.svg" },
  { id: "choking", label: "GWORLD.Affliction.Name.choking", img: "icons/svg/silenced.svg" },
  { id: "daze", label: "GWORLD.Affliction.Name.daze", img: "icons/svg/daze.svg" },
  { id: "ecstasy", label: "GWORLD.Affliction.Name.ecstasy", img: "icons/svg/angel.svg" },
  { id: "hallucinating", label: "GWORLD.Affliction.Name.hallucinating", img: "icons/svg/stoned.svg" },
  { id: "paralysis", label: "GWORLD.Affliction.Name.paralysis", img: "icons/svg/paralysis.svg" },
  { id: "retching", label: "GWORLD.Affliction.Name.retching", img: "icons/svg/acid.svg" },
  { id: "seizure", label: "GWORLD.Affliction.Name.seizure", img: "icons/svg/lightning.svg" },
  { id: "coma", label: "GWORLD.Affliction.Name.coma", img: "icons/svg/unconscious.svg" },
  { id: "heartAttack", label: "GWORLD.Affliction.Name.heartAttack", img: "icons/svg/blood.svg" },
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

/**
 * Keeps the posture field and the prone icon saying the same thing.
 *
 * A takedown or a failed knockdown roll writes both -- posture "lying" on the
 * sheet, prone on the token -- and until now nothing wrote them back. A player
 * who chose "standing" on the sheet kept the prone icon, and a GM who cleared
 * the icon from the token left the sheet lying down, with its posture
 * penalties still applied. Either control now moves the other.
 *
 * Only the client that made the change acts on it, so a table of six does not
 * write the same update six times.
 */
export function registerPostureSync(): void {
  Hooks.on("updateActor", (actor: any, changes: any, _options: unknown, userId: string) => {
    if (userId !== game.user?.id) return;
    const posture = changes?.system?.posture;
    if (typeof posture !== "string") return;
    void setCondition(actor, "prone", posture === "lying");
  });

  const fromEffect = (active: boolean) => (effect: any, _options: unknown, userId: string) => {
    if (userId !== game.user?.id) return;
    if (!effect?.statuses?.has?.("prone")) return;
    const actor = effect.parent;
    if (!actor?.isOwner || typeof actor.system?.posture !== "string") return;

    // Lying down when knocked prone; standing when the icon is cleared. The
    // book's Change Posture progression -- crawl, kneel, sit, then stand --
    // is the sheet's to offer, and a GM taking the icon off a token is saying
    // the character is up.
    if (active && actor.system.posture !== "lying") {
      void actor.update({ "system.posture": "lying" });
    } else if (!active && actor.system.posture === "lying") {
      void actor.update({ "system.posture": "standing" });
    }
  };
  Hooks.on("createActiveEffect", fromEffect(true));
  Hooks.on("deleteActiveEffect", fromEffect(false));
}

/** A condition's name, localized, or null for an id that isn't one of the system's. */
export function conditionLabel(id: string): string | null {
  const condition = CONDITIONS.find((c) => c.id === id);
  return condition ? game.i18n.localize(condition.label) : null;
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
  // One at a time for each actor and condition, each looking again once the
  // last has landed: a posture change sets prone as well as whoever changed
  // it, and two at once made two prone effects, or deleted one twice.
  const key = `${String(actor.uuid ?? actor.id)}:${id}`;
  const run = (pendingConditions.get(key) ?? Promise.resolve()).then(async () => {
    if (hasCondition(actor, id) === active) return;
    await actor.toggleStatusEffect?.(id, { active });
  });
  const settled = run.catch(() => undefined);
  pendingConditions.set(key, settled);
  try {
    await run;
  } finally {
    if (pendingConditions.get(key) === settled) pendingConditions.delete(key);
  }
}

/** The condition changes still landing, by actor and condition. */
const pendingConditions = new Map<string, Promise<void>>();

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
