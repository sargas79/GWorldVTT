import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CAMPAIGN_TERM_SETTINGS,
  actorCampaignTerms,
  boundByCampaign,
  mergePartyTerms,
  migratePartyCampaignTerms,
  setCampaignTerm,
  worldCampaignTerms,
} from "../campaign.js";
import { invalidatePartyIndex } from "../party.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.game;
  delete globals.ui;
  delete globals.foundry;
  vi.restoreAllMocks();
});

/** A world with these settings stored and these actors in it. */
function world(stored: Record<string, unknown>, actors: any[] = [], isGM = true) {
  const settings: Record<string, unknown> = { ...stored };
  invalidatePartyIndex();
  const set = vi.fn(async (_scope: string, key: string, value: unknown) => {
    settings[key] = value;
  });
  globals.game = {
    user: { isGM },
    actors: Object.assign([...actors], { get: (id: string) => actors.find((a) => a.id === id) }),
    settings: {
      get: (scope: string, key: string) => {
        if (scope !== "gworld") throw new Error("wrong scope");
        return settings[key];
      },
      set,
    },
    i18n: { format: (key: string) => key },
  };
  globals.foundry = { utils: { deepClone: (value: unknown) => structuredClone(value) } };
  const warn = vi.fn();
  globals.ui = { notifications: { warn } };
  return { settings, set, warn };
}

/** The campaign's terms are the world's, not a party's (sargas79/GWorldVTT#642). */
describe("the campaign's terms", () => {
  it("are read from the world settings, blank as not set", () => {
    expect(worldCampaignTerms()).toEqual({ tl: null, startingPoints: null, disadvantageLimit: null });
    world({ [CAMPAIGN_TERM_SETTINGS.tl]: 8, [CAMPAIGN_TERM_SETTINGS.startingPoints]: 150, [CAMPAIGN_TERM_SETTINGS.disadvantageLimit]: null });
    expect(worldCampaignTerms()).toEqual({ tl: 8, startingPoints: 150, disadvantageLimit: null });
  });

  it("reach every player character, in a party or not, and no NPC", () => {
    world({ [CAMPAIGN_TERM_SETTINGS.tl]: 3 });
    expect(actorCampaignTerms({ uuid: "Actor.loner", type: "character" })).toEqual({ party: null, tl: 3, startingPoints: null, disadvantageLimit: null });
    const party = { id: "p1", uuid: "Actor.p1", name: "The Crew", type: "party", system: { members: [{ uuid: "Actor.pc" }] } };
    world({ [CAMPAIGN_TERM_SETTINGS.tl]: 3 }, [party]);
    expect(actorCampaignTerms({ uuid: "Actor.pc", type: "character" })?.party).toEqual({ id: "p1", uuid: "Actor.p1", name: "The Crew" });
    expect(actorCampaignTerms({ uuid: "Actor.orc", type: "npc" })).toBeNull();
    expect(boundByCampaign("character")).toBe(true);
    expect(boundByCampaign("vehicle")).toBe(false);
  });

  it("are changed only by the GM, whole numbers, blank clearing them", async () => {
    const gm = world({});
    await setCampaignTerm("startingPoints", 152.7);
    expect(gm.set).toHaveBeenCalledWith("gworld", CAMPAIGN_TERM_SETTINGS.startingPoints, 152);
    await setCampaignTerm("tl", null);
    expect(gm.set).toHaveBeenCalledWith("gworld", CAMPAIGN_TERM_SETTINGS.tl, null);
    const player = world({}, [], false);
    await setCampaignTerm("tl", 8);
    expect(player.set).not.toHaveBeenCalled();
  });
});

describe("the terms a party held before #642", () => {
  const party = (name: string, campaign: object) => ({ id: name, uuid: `Actor.${name}`, name, type: "party", _source: { system: { campaign } }, system: { members: [] } });

  it("take the first party's figure for each term, and name the terms the parties disagree on", () => {
    expect(mergePartyTerms([
      { tl: 8, startingPoints: null, disadvantageLimit: 50 },
      { tl: 8, startingPoints: 100, disadvantageLimit: 40 },
    ])).toEqual({ chosen: { tl: 8, startingPoints: 100, disadvantageLimit: 50 }, conflicts: ["disadvantageLimit"] });
    expect(mergePartyTerms([])).toEqual({ chosen: { tl: null, startingPoints: null, disadvantageLimit: null }, conflicts: [] });
  });

  it("are copied into the world settings once, keeping any the GM already set", async () => {
    const { settings, warn } = world({ [CAMPAIGN_TERM_SETTINGS.tl]: 4, migrations: {} }, [
      party("Crew", { tl: 8, startingPoints: 150, disadvantageLimit: 75 }),
      party("Empty", { tl: null, startingPoints: null, disadvantageLimit: null }),
    ]);
    await migratePartyCampaignTerms();
    expect(settings[CAMPAIGN_TERM_SETTINGS.tl]).toBe(4);
    expect(settings[CAMPAIGN_TERM_SETTINGS.startingPoints]).toBe(150);
    expect(settings[CAMPAIGN_TERM_SETTINGS.disadvantageLimit]).toBe(75);
    expect(warn).not.toHaveBeenCalled();
    expect((settings.migrations as any).gworld["campaign-terms-to-world"]).toBeTruthy();

    // Run again, it does nothing: a term the GM clears since stays cleared.
    settings[CAMPAIGN_TERM_SETTINGS.startingPoints] = null;
    await migratePartyCampaignTerms();
    expect(settings[CAMPAIGN_TERM_SETTINGS.startingPoints]).toBeNull();
  });

  it("warn the GM when the parties disagreed", async () => {
    const { settings, warn } = world({ migrations: {} }, [
      party("First", { tl: 8, startingPoints: 150, disadvantageLimit: null }),
      party("Second", { tl: 3, startingPoints: 150, disadvantageLimit: null }),
    ]);
    await migratePartyCampaignTerms();
    expect(settings[CAMPAIGN_TERM_SETTINGS.tl]).toBe(8);
    expect(warn).toHaveBeenCalledOnce();
  });
});
