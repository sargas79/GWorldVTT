/**
 * The poisons modules add (sargas79/GWorldVTT#453).
 *
 * The dose dialog offers the Basic Set's named poisons (Campaigns p. 439);
 * another book's agents are registered here and offered beside them. A dose
 * made from one carries its `<module>.<key>` as `source`, so the module can
 * tell its own doses apart when `gworld.poisonCycle` reports a cycle.
 */

import type { Poison } from "../rules/poison.js";

export interface PoisonRegistration {
  module: string;
  key: string;
  /** A localization key or plain text, shown in the dose dialog and on the cards. */
  label: string;
  /** The poison's numbers; its `name` is replaced by the label. */
  poison: Omit<Poison, "name" | "source"> & { name?: string };
  /** Whether it is offered right now (e.g. "my switch is on"). Defaults to always. */
  available?: () => boolean;
}

interface RegisteredPoison {
  source: string;
  label: string;
  poison: PoisonRegistration["poison"];
  available: () => boolean;
}

const poisons = new Map<string, RegisteredPoison>();

const localize = (text: string): string => {
  const i18n = (globalThis as { game?: { i18n?: { localize?: (key: string) => string } } }).game?.i18n;
  return i18n?.localize ? i18n.localize(text) : text;
};

/** Registers a poison. Returns its `<module>.<key>`, or null for a registration missing its module, key or label. */
export function registerPoison(registration: PoisonRegistration): string | null {
  const module = String(registration?.module ?? "").trim();
  const key = String(registration?.key ?? "").trim();
  const label = String(registration?.label ?? "").trim();
  if (!module || !key || !label || !registration.poison) return null;
  const source = `${module}.${key}`;
  if (poisons.has(source)) console.warn(`gworld | poison ${source} registered twice; the later one stands`);
  poisons.set(source, { source, label, poison: registration.poison, available: registration.available ?? (() => true) });
  return source;
}

/** A registered poison as the dose machinery takes it, by its `<module>.<key>`, or null. */
export function registeredPoison(source: string): Poison | null {
  const entry = poisons.get(source);
  if (!entry) return null;
  return { ...entry.poison, name: localize(entry.label), source };
}

/** The registered poisons offered right now, for the dose dialog. */
export function offeredPoisons(): Array<{ source: string; label: string }> {
  return [...poisons.values()]
    .filter((entry) => {
      try {
        return entry.available();
      } catch (error) {
        console.warn(`gworld | poison ${entry.source}'s availability check failed`, error);
        return false;
      }
    })
    .map((entry) => ({ source: entry.source, label: localize(entry.label) }));
}

/** Forgets every registration; for tests. */
export function clearRegisteredPoisons(): void {
  poisons.clear();
}
