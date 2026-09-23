/**
 * The campaign's terms: the starting points and the disadvantage limit
 * (GURPS Basic Set: Characters pp. 10-11) and the Tech Level (Characters
 * p. 22).
 *
 * They are facts about the campaign, so they are world settings, which only
 * the GM changes. Every player character reads them, in a party or not:
 * joining or leaving a party changes none of them (#642). A term left blank
 * is not set, and each character keeps its own figure.
 *
 * Until #642 the terms were kept on each party. A world that still has them
 * there has them copied into the settings once, at `ready`.
 */

import { SYSTEM_ID } from "./constants.js";
import { everyActor } from "./every-actor.js";
import { hasMigrated, recordMigration } from "./migration.js";
import { partyOf, refreshActor, worldParties } from "./party.js";
import { CAMPAIGN_TERM_KEYS, termsFrom, type CampaignTermKey, type CampaignTerms } from "./party/roster.js";

/** Fired with the terms whenever the GM changes one of them. */
export const CAMPAIGN_CHANGED_HOOK = "gworld.campaignChanged";

/** The world setting each term is stored in. */
export const CAMPAIGN_TERM_SETTINGS: Readonly<Record<CampaignTermKey, string>> = Object.freeze({
  startingPoints: "campaignStartingPoints",
  disadvantageLimit: "campaignDisadvantageLimit",
  tl: "campaignTL",
});

/** The actor types the terms apply to: player characters, not NPCs or monsters. */
const BOUND_TYPES = ["character"];

/** Whether the campaign's terms apply to an actor of this type. */
export function boundByCampaign(type: unknown): boolean {
  return typeof type === "string" && BOUND_TYPES.includes(type);
}

/** The terms as the GM set them, nulls for those left blank. */
export function worldCampaignTerms(): CampaignTerms {
  const stored: Partial<Record<CampaignTermKey, unknown>> = {};
  for (const key of CAMPAIGN_TERM_KEYS) {
    try {
      stored[key] = game.settings.get(SYSTEM_ID, CAMPAIGN_TERM_SETTINGS[key]);
    } catch {
      // Not registered yet (or in a test): not set.
    }
  }
  return termsFrom(stored);
}

/** Sets one term, or clears it with null. Only the GM may. */
export async function setCampaignTerm(key: CampaignTermKey, value: number | null): Promise<void> {
  if (!game.user?.isGM || !CAMPAIGN_TERM_KEYS.includes(key)) return;
  const clean = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
  await game.settings.set(SYSTEM_ID, CAMPAIGN_TERM_SETTINGS[key], clean);
}

/** The terms as they reach one actor, with the party it is in (the API's shape since 1.68.0). */
export interface ActorCampaignTerms extends CampaignTerms {
  party: { id: string; uuid: string; name: string } | null;
}

/**
 * The terms that reach an actor, and the party it is in, if any. Null for an
 * actor the terms don't bind, an NPC or a vehicle.
 */
export function actorCampaignTerms(actor: any): ActorCampaignTerms | null {
  if (!boundByCampaign(actor?.type)) return null;
  const party = partyOf(actor);
  return {
    party: party ? { id: String(party.id), uuid: String(party.uuid), name: String(party.name ?? "") } : null,
    ...worldCampaignTerms(),
  };
}

/**
 * Where a locked term is changed: the GM gets the settings page; a player the
 * party sheet, if the character is in one, where the terms are shown.
 */
export async function openCampaignTerms(actor: any): Promise<void> {
  if (game.user?.isGM) {
    const SettingsConfig = (foundry.applications as any).settings?.SettingsConfig;
    if (SettingsConfig) await new SettingsConfig().render({ force: true });
    return;
  }
  const party = partyOf(actor);
  if (!party?.sheet) return;
  party.sheet.tabGroups.primary = "campaign";
  await party.sheet.render({ force: true });
}

/** Every character prepared again and redrawn, and the party sheets redrawn, once per burst of changes. */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function refreshAll(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    // An unlinked token's character is its own copy, so it is prepared again too.
    for (const actor of everyActor()) {
      if (boundByCampaign(actor.type)) refreshActor(actor);
    }
    for (const party of worldParties()) {
      if (party.sheet?.rendered) void party.sheet.render();
    }
    Hooks.callAll(CAMPAIGN_CHANGED_HOOK, worldCampaignTerms());
  }, 50);
}

export function registerCampaignSettings(): void {
  const fields = foundry.data.fields;
  const steps: Record<CampaignTermKey, number> = { startingPoints: 5, disadvantageLimit: 5, tl: 1 };
  for (const key of CAMPAIGN_TERM_KEYS) {
    game.settings.register(SYSTEM_ID, CAMPAIGN_TERM_SETTINGS[key], {
      name: `GWORLD.Campaign.${key}.Name`,
      hint: `GWORLD.Campaign.${key}.Hint`,
      scope: "world",
      config: true,
      // Blank is "not set", so a new world changes nobody's sheet until the GM types a figure.
      type: new fields.NumberField({ required: false, nullable: true, integer: true, min: 0, step: steps[key], initial: null }),
      default: null,
      onChange: () => refreshAll(),
    });
  }
}

/** The step under which the party terms were copied into the settings. */
const MIGRATION_STEP = "campaign-terms-to-world";

/**
 * Copies the terms a party held before #642 into the world settings, once.
 * A term the GM has already set in the settings is kept. Where parties
 * disagree the first party's figure is taken and the GM is told.
 */
export async function migratePartyCampaignTerms(): Promise<void> {
  if (!game.user?.isGM || hasMigrated(SYSTEM_ID, MIGRATION_STEP)) return;
  const parties = worldParties()
    .map((party) => ({ name: String(party.name ?? ""), terms: termsFrom(party._source?.system?.campaign) }))
    .filter(({ terms }) => CAMPAIGN_TERM_KEYS.some((key) => terms[key] !== null));
  const current = worldCampaignTerms();
  const { chosen, conflicts } = mergePartyTerms(parties.map((p) => p.terms));
  for (const key of CAMPAIGN_TERM_KEYS) {
    if (current[key] === null && chosen[key] !== null) await setCampaignTerm(key, chosen[key]);
  }
  if (conflicts.length > 0) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Campaign.Migrated", {
      party: parties[0]?.name ?? "",
    }), { permanent: true });
  }
  await recordMigration(SYSTEM_ID, MIGRATION_STEP);
}

/** The first figure set for each term across the parties, and the terms they disagree on. */
export function mergePartyTerms(list: readonly CampaignTerms[]): { chosen: CampaignTerms; conflicts: CampaignTermKey[] } {
  const chosen: CampaignTerms = { tl: null, startingPoints: null, disadvantageLimit: null };
  const conflicts: CampaignTermKey[] = [];
  for (const key of CAMPAIGN_TERM_KEYS) {
    const values = list.map((terms) => terms[key]).filter((value): value is number => value !== null);
    chosen[key] = values[0] ?? null;
    if (new Set(values).size > 1) conflicts.push(key);
  }
  return { chosen, conflicts };
}
