/**
 * Every actor in the world: the Actors directory's, the synthetic actor of
 * every unlinked token on every scene, and every combatant's.
 *
 * `game.actors` holds only the directory's actors, so a walk over it misses
 * each unlinked token, whose actor is its own copy living on the token. A
 * linked token's actor is the directory's, so it is left out here rather than
 * met twice.
 */
export function everyActor(): any[] {
  const g = (globalThis as any).game;
  const seen = new Set<any>();
  const found: any[] = [];
  const add = (actor: any) => {
    if (!actor || seen.has(actor)) return;
    seen.add(actor);
    found.push(actor);
  };
  for (const actor of g?.actors ?? []) add(actor);
  for (const scene of g?.scenes ?? []) {
    for (const token of scene?.tokens ?? []) {
      if (token?.actorLink) continue;
      add(token?.actor);
    }
  }
  // A combatant's actor is its token's, so this only finds one whose token
  // the scenes did not offer.
  for (const combat of g?.combats ?? []) {
    for (const combatant of combat?.combatants ?? []) add(combatant?.actor);
  }
  return found;
}
