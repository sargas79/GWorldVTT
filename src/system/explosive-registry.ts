/**
 * The explosives modules add to the Relative Explosive Force Table
 * (sargas79/GWorldVTT#597).
 *
 * The demolition tool offers the Basic Set's explosives (Campaigns p. 415);
 * another book's are registered here and offered after them, under the
 * `<module>.<key>` the registration returns.
 */

import { RELATIVE_EXPLOSIVE_FORCE } from "../rules/demolition.js";

export interface ExplosiveRegistration {
  module: string;
  key: string;
  /** A localization key or plain text, shown in the demolition tool and on the cards. */
  label: string;
  /** Its relative explosive force: TNT is 1. */
  ref: number;
  /** The tech level it appears at, for the list; none where left out. */
  tl?: number;
  /** Whether it is offered right now (e.g. "my switch is on"). Defaults to always. */
  available?: () => boolean;
}

/** An explosive as the demolition tool offers it: the Basic Set's by its row id, a module's by `<module>.<key>`. */
export interface OfferedExplosive {
  id: string;
  label: string;
  ref: number;
  tl: number | null;
}

interface RegisteredExplosive extends OfferedExplosive {
  available: () => boolean;
}

const explosives = new Map<string, RegisteredExplosive>();

const localize = (text: string): string => {
  const i18n = (globalThis as { game?: { i18n?: { localize?: (key: string) => string } } }).game?.i18n;
  return i18n?.localize ? i18n.localize(text) : text;
};

/**
 * Registers an explosive. Returns its `<module>.<key>`, or null for a
 * registration missing its module, key or label, or with no positive REF.
 */
export function registerExplosive(registration: ExplosiveRegistration): string | null {
  const module = String(registration?.module ?? "").trim();
  const key = String(registration?.key ?? "").trim();
  const label = String(registration?.label ?? "").trim();
  const ref = Number(registration?.ref);
  if (!module || !key || !label || !(Number.isFinite(ref) && ref > 0)) {
    console.warn("gworld | an explosive registration was refused: it needs a module, key, label and a REF above 0", registration);
    return null;
  }
  const id = `${module}.${key}`;
  if (explosives.has(id)) console.warn(`gworld | explosive ${id} registered twice; the later one stands`);
  const tl = Number(registration.tl);
  explosives.set(id, {
    id,
    label,
    ref,
    tl: Number.isFinite(tl) ? Math.floor(tl) : null,
    available: typeof registration.available === "function" ? registration.available : () => true,
  });
  return id;
}

function isOffered(entry: RegisteredExplosive): boolean {
  try {
    return entry.available() === true;
  } catch (error) {
    console.warn(`gworld | explosive ${entry.id}'s availability check failed`, error);
    return false;
  }
}

/** The Basic Set's explosives, then the registered ones offered right now, labels localized. */
export function offeredExplosives(): OfferedExplosive[] {
  const basic = RELATIVE_EXPLOSIVE_FORCE.map((row) => ({
    id: row.id,
    label: localize(`GWORLD.Demolition.Explosive.${row.id}`),
    ref: row.ref,
    tl: row.tl,
  }));
  const added = [...explosives.values()].filter(isOffered).map(({ id, label, ref, tl }) => ({ id, label: localize(label), ref, tl }));
  return [...basic, ...added];
}

/** One explosive by its id, whether offered right now or not, or null. */
export function explosiveById(id: string): OfferedExplosive | null {
  const row = RELATIVE_EXPLOSIVE_FORCE.find((r) => r.id === id);
  if (row) return { id: row.id, label: localize(`GWORLD.Demolition.Explosive.${row.id}`), ref: row.ref, tl: row.tl };
  const entry = explosives.get(id);
  return entry ? { id: entry.id, label: localize(entry.label), ref: entry.ref, tl: entry.tl } : null;
}

/** Forgets every registration; for tests. */
export function clearRegisteredExplosives(): void {
  explosives.clear();
}
