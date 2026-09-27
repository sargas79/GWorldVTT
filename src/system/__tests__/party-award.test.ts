import { afterEach, describe, expect, it, vi } from "vitest";

import { awardPartyPoints, awardRecipientsOf } from "../party.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["game", "foundry", "fromUuidSync", "ChatMessage", "CONST"]) delete globals[key];
  vi.restoreAllMocks();
});

function person(id: string, type: string, awards: unknown[] = []) {
  const actor: any = { uuid: `Actor.${id}`, name: id, type, system: { points: { awards } } };
  actor.update = vi.fn(async (diff: Record<string, unknown>) => {
    actor.system.points.awards = diff["system.points.awards"];
  });
  return actor;
}

/** A world with these actors in it, a GM or a player at the keyboard, and a chat that records. */
function world(actors: any[], isGM = true) {
  const byUuid = new Map(actors.map((a) => [a.uuid, a]));
  const create = vi.fn(async () => ({}));
  globals.game = { user: { isGM }, i18n: { localize: (k: string) => k, format: (k: string) => k } };
  globals.foundry = { utils: { escapeHTML: (s: string) => s } };
  globals.fromUuidSync = (uuid: string) => byUuid.get(uuid) ?? null;
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.ChatMessage = { implementation: { create, getSpeaker: (s: unknown) => s } };
  return { create };
}

function partyOf(members: any[]) {
  return { uuid: "Actor.party", name: "The Crew", type: "party", system: { members: members.map((m) => ({ uuid: m.uuid ?? m })) } };
}

describe("awarding the party character points (#871)", () => {
  it("gives every character the whole award, and the NPC nothing", async () => {
    const ada = person("Ada", "character", [{ points: 5, note: "", at: 1, session: "Session 1" }]);
    const bo = person("Bo", "character");
    const guide = person("Guide", "npc");
    const { create } = world([ada, bo, guide]);
    const party = partyOf([ada, guide, bo, "Actor.gone"]);

    expect(awardRecipientsOf(party)).toEqual([ada, bo]);
    const awarded = await awardPartyPoints(party, 3, { note: "the heist", session: "Session 2" });

    expect(awarded).toEqual([ada, bo]);
    expect(ada.system.points.awards).toHaveLength(2);
    expect(ada.system.points.awards[1]).toMatchObject({ points: 3, note: "the heist", session: "Session 2" });
    expect(bo.system.points.awards).toEqual([expect.objectContaining({ points: 3, note: "the heist", session: "Session 2" })]);
    expect(guide.update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
    const message = (create.mock.calls[0] as unknown[])[0] as any;
    expect(message.flags.gworld.partyAward).toEqual({ partyUuid: "Actor.party", points: 3, members: ["Actor.Ada", "Actor.Bo"] });
  });

  it("gives the rest their award when one character's update fails, and names only them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ada = person("Ada", "character");
    const bo = person("Bo", "character");
    bo.update.mockRejectedValueOnce(new Error("invalid"));
    const { create } = world([ada, bo]);
    expect(await awardPartyPoints(partyOf([bo, ada]), 3)).toEqual([ada]);
    expect(ada.system.points.awards).toHaveLength(1);
    expect(bo.system.points.awards).toEqual([]);
    expect((create.mock.calls[0] as any)[0].flags.gworld.partyAward.members).toEqual(["Actor.Ada"]);
  });

  it("gives the award only to the characters who attended, and names the absent (#890)", async () => {
    const ada = person("Ada", "character");
    const bo = person("Bo", "character");
    const cy = person("Cy", "character");
    const guide = person("Guide", "npc");
    const { create } = world([ada, bo, cy, guide]);
    const party = partyOf([ada, bo, guide, cy]);

    // Cy is named as the actor, Ada by UUID; the NPC and a stranger are ignored.
    const awarded = await awardPartyPoints(party, 2, { members: [cy, "Actor.Ada", "Actor.Guide", "Actor.stranger"] });

    expect(awarded).toEqual([ada, cy]);
    expect(bo.update).not.toHaveBeenCalled();
    expect(guide.update).not.toHaveBeenCalled();
    const message = (create.mock.calls[0] as unknown[])[0] as any;
    expect(message.flags.gworld.partyAward.members).toEqual(["Actor.Ada", "Actor.Cy"]);
    expect(message.content).toContain("AwardChatAbsent");
  });

  it("awards no one when nobody attended", async () => {
    const ada = person("Ada", "character");
    const { create } = world([ada]);
    expect(await awardPartyPoints(partyOf([ada]), 3, { members: [] })).toEqual([]);
    expect(ada.update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("names no one absent when everyone got the award", async () => {
    const ada = person("Ada", "character");
    const { create } = world([ada]);
    await awardPartyPoints(partyOf([ada]), 3);
    expect(((create.mock.calls[0] as unknown[])[0] as any).content).not.toContain("AwardChatAbsent");
  });

  it("refuses zero, a negative or a fraction", async () => {
    const ada = person("Ada", "character");
    const { create } = world([ada]);
    for (const bad of [0, -2, 1.5]) expect(await awardPartyPoints(partyOf([ada]), bad)).toEqual([]);
    expect(ada.update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("is the GM's alone", async () => {
    const ada = person("Ada", "character");
    const { create } = world([ada], false);
    expect(await awardPartyPoints(partyOf([ada]), 3)).toEqual([]);
    expect(ada.update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("does nothing for a party with no characters, or for something that is not a party", async () => {
    const guide = person("Guide", "npc");
    const { create } = world([guide]);
    expect(await awardPartyPoints(partyOf([guide]), 3)).toEqual([]);
    expect(await awardPartyPoints({ ...partyOf([guide]), type: "character" }, 3)).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});
