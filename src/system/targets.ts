/**
 * Who an action is aimed at.
 *
 * Its own module so that both halves of a fight can ask -- an attack recording
 * who it was aimed at, and a damage card deciding who to apply to -- without
 * the chat code and the roll code having to import each other.
 */

/** Tokens standing in for the user's targets while one attack of a sequence is rolled. */
let override: any[] | null = null;

/** The tokens this user has targeted, which is how you say who you are attacking. */
export function targetedTokens(): any[] {
  if (override) return [...override];
  return [...(game.user?.targets ?? [])];
}

/**
 * Rolls with these tokens as the targets, for an attack in a sequence that
 * picked its own. Each is `{ actor, document }`, as a token placeable reads.
 */
export async function withTargets<T>(tokens: any[], run: () => Promise<T>): Promise<T> {
  const previous = override;
  override = tokens;
  try {
    return await run();
  } finally {
    override = previous;
  }
}

/**
 * The tokens an action should act on: whatever the user has targeted, falling
 * back to what they have selected.
 *
 * The fallback is for acting on a token rather than at one -- a GM applying
 * damage usually just has the victim selected, and refusing to act on that
 * would make the button useless exactly when it is most wanted.
 *
 * It is deliberately not used for an attack. An attacker has their own token
 * selected far more often than not, so falling back there would record the
 * attacker as the person defending against themselves.
 */
export function currentTargets(): any[] {
  const targeted = targetedTokens();
  if (targeted.length > 0) return targeted;
  return [...(canvas?.tokens?.controlled ?? [])];
}

/**
 * Whether this user has an actor of their own standing on the scene.
 *
 * A control that acts on the user's own character -- applying a blow to the
 * character who took it -- belongs to everyone who has such a character, and
 * to nobody else: a player with none would be offered a button that only ever
 * fails. The GM and whoever rolled the attack are asked separately, since
 * they may act on somebody else's.
 */
export function ownsATokenOnScene(): boolean {
  return [...(canvas?.tokens?.placeables ?? [])].some((token: any) => token?.actor?.isOwner === true);
}

/** A token an attack was aimed at, as a chat card keeps it. */
export interface RecordedTarget {
  tokenUuid: string;
  /** The token's own name, which is what the table sees on the canvas. */
  name: string;
}

/** This user's targets as a card keeps them: the tokens with an actor and a document to find again. */
export function recordableTargets(): RecordedTarget[] {
  return targetedTokens()
    .filter((token: any) => token?.actor && (token.document?.uuid ?? token.uuid))
    .map((token: any) => ({
      tokenUuid: String(token.document?.uuid ?? token.uuid),
      name: String(token.document?.name ?? token.name ?? token.actor?.name ?? ""),
    }));
}

/** Recorded targets from a stored flag, dropping anything that is not one. */
export function recordedTargetsOf(stored: unknown): RecordedTarget[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((entry: any) => typeof entry?.tokenUuid === "string" && entry.tokenUuid !== "")
    .map((entry: any) => ({ tokenUuid: String(entry.tokenUuid), name: String(entry.name ?? "") }));
}

/**
 * The tokens a card recorded, found again: each as its token document, which
 * carries the actor as a placeable does. A token deleted since is left out.
 */
export async function resolveRecordedTargets(recorded: readonly RecordedTarget[]): Promise<any[]> {
  const found: any[] = [];
  for (const entry of recorded) {
    const token: any = await fromUuid(entry.tokenUuid).catch(() => null);
    if (token?.actor) found.push(token);
  }
  return found;
}

/**
 * Who a damage card's blow lands on: the tokens its attack was aimed at, found
 * again, unless the presser asked for their own targets. The presser's
 * targets, or their selection, where the card recorded none or none is left.
 */
export async function damageRecipients(recorded: readonly RecordedTarget[], mine: boolean): Promise<any[]> {
  const found = !mine && recorded.length > 0 ? await resolveRecordedTargets(recorded) : [];
  return found.length > 0 ? found : currentTargets();
}

/** Token name display modes that show a token's name to a user who does not own it: on hover, and always. */
const NAME_SHOWN_TO_ALL = new Set([30, 50]);

/**
 * A recorded target's name as this user may see it. The GM and the token's
 * owners see it; anybody else sees it only where the token shows its name to
 * everyone, and otherwise null, so that a card does not name the NPC the
 * canvas keeps anonymous. A token gone from the scene keeps the name it was
 * recorded under, which was seen when it was targeted.
 */
export function shownTargetName(entry: RecordedTarget): string | null {
  if (game.user?.isGM === true) return entry.name;
  let token: any = null;
  try {
    token = fromUuidSync(entry.tokenUuid, { strict: false });
  } catch {
    token = null;
  }
  if (!token) return entry.name;
  if (token.isOwner === true) return String(token.name ?? entry.name);
  if (token.hidden === true) return null;
  return NAME_SHOWN_TO_ALL.has(Number(token.displayName)) ? String(token.name ?? entry.name) : null;
}
