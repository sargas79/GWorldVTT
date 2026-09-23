import { describe, expect, it } from "vitest";

import {
  addMembers,
  canJoin,
  isPinned,
  lockedTerms,
  memberRow,
  membersByName,
  partyLanguages,
  partySkills,
  removeMember,
  termsFrom,
} from "../party/roster.js";

describe("the member list", () => {
  const list = [{ uuid: "Actor.a" }, { uuid: "Actor.b" }];

  it("lets people join, and nothing else", () => {
    expect(canJoin("character")).toBe(true);
    expect(canJoin("npc")).toBe(true);
    expect(canJoin("vehicle")).toBe(false);
    expect(canJoin("party")).toBe(false);
    expect(canJoin(undefined)).toBe(false);
  });

  it("adds each new member once, at the end, in the order given", () => {
    expect(addMembers(list, ["Actor.c", "Actor.a", "Actor.c", "", "Actor.d"])).toEqual([
      { uuid: "Actor.a" }, { uuid: "Actor.b" }, { uuid: "Actor.c" }, { uuid: "Actor.d" },
    ]);
  });

  it("does not change the list it was given", () => {
    addMembers(list, ["Actor.c"]);
    removeMember(list, "Actor.a");
    expect(list).toEqual([{ uuid: "Actor.a" }, { uuid: "Actor.b" }]);
  });

  it("takes a member off", () => {
    expect(removeMember(list, "Actor.a")).toEqual([{ uuid: "Actor.b" }]);
    expect(removeMember(list, "Actor.zzz")).toEqual(list);
  });

  it("shows the members by name, whatever order they joined in (#584)", () => {
    const joined = [
      { uuid: "Actor.z", actor: { name: "Zara" } },
      { uuid: "Actor.gone", actor: null },
      { uuid: "Actor.a", actor: { name: "aria" } },
      { uuid: "Actor.b2", actor: { name: "Borin" } },
      { uuid: "Actor.c", actor: { name: "Ćelia" } },
      { uuid: "Actor.b1", actor: { name: "Borin" } },
    ];
    expect(membersByName(joined).map((m) => m.uuid)).toEqual([
      "Actor.a", "Actor.b1", "Actor.b2", "Actor.c", "Actor.z", "Actor.gone",
    ]);
    expect(joined[0]!.uuid).toBe("Actor.z");
  });
});

describe("a member's row", () => {
  const system = {
    hp: { value: 4, max: 12 },
    fp: { value: 10, max: 10 },
    derived: {
      will: 12,
      per: 13,
      basicSpeed: 5.75,
      basicMove: 5,
      move: 4,
      dr: 3,
      status: "reeling",
      fatigue: { status: "fresh" },
      defenses: { dodge: { total: 9, source: "" }, parry: { total: 11, source: "Broadsword" }, block: null },
      hitLocations: [{ key: "skull", dr: 5, splits: false }, { key: "torso", dr: 3, splits: true }],
      encumbrance: { key: "light", level: 1 },
      points: { spent: 152, available: 150, unspent: -2 },
    },
  };

  it("reads the pools with their bars and statuses", () => {
    const row = memberRow(system);
    expect(row.hp).toEqual({ value: 4, max: 12, percent: 33, status: "reeling" });
    expect(row.fp).toEqual({ value: 10, max: 10, percent: 100, status: "fresh" });
  });

  it("reads the passive figures and the defenses, a missing one as null", () => {
    const row = memberRow(system);
    expect([row.will, row.per, row.basicSpeed, row.move, row.basicMove]).toEqual([12, 13, 5.75, 4, 5]);
    expect(row.defenses.dodge).toEqual({ total: 9, source: "" });
    expect(row.defenses.parry).toEqual({ total: 11, source: "Broadsword" });
    expect(row.defenses.block).toBeNull();
  });

  it("takes the torso's DR and says when it splits by damage type", () => {
    expect(memberRow(system).dr).toEqual({ value: 3, splits: true });
    expect(memberRow({ derived: { dr: 2 } }).dr).toEqual({ value: 2, splits: false });
  });

  it("flags an overspend on the points badge", () => {
    const row = memberRow(system);
    expect(row.points.state).toBe("over");
    expect(row.points.overBy).toBe(2);
    expect(row.encumbrance).toEqual({ key: "light", level: 1 });
  });

  it("reads an empty actor without complaint", () => {
    const row = memberRow({});
    expect(row.hp).toEqual({ value: 0, max: 0, percent: 0, status: "healthy" });
    expect(row.will).toBeNull();
    expect(row.defenses).toEqual({ dodge: null, parry: null, block: null });
    expect(row.dr).toEqual({ value: 0, splits: false });
    expect(row.encumbrance).toEqual({ key: "none", level: 0 });
  });
});

describe("the best of each skill", () => {
  const members = [
    {
      uuid: "Actor.a",
      name: "Ada",
      skills: [
        { id: "1", name: "Stealth", level: 14, points: 4, attribute: "DX" },
        { id: "2", name: "First Aid", level: 12, points: 1, attribute: "IQ" },
        { id: "3", name: "Tracking", level: 9, points: 0, attribute: "Per" },
      ],
    },
    {
      uuid: "Actor.b",
      name: "Bo",
      skills: [
        { id: "4", name: "Stealth", level: 16, points: 8, attribute: "DX" },
        { id: "5", name: "First Aid", level: 12, points: 1, attribute: "IQ" },
        { id: "6", name: "Climbing", level: null, points: 2, attribute: "DX" },
      ],
    },
  ];

  it("names the best holder of each skill, the rest beside them, by name", () => {
    const rows = partySkills(members);
    expect(rows.map((r) => r.name)).toEqual(["First Aid", "Stealth"]);
    const stealth = rows[1]!;
    expect(stealth.best).toEqual({ uuid: "Actor.b", memberName: "Bo", id: "4", level: 16, attribute: "DX" });
    expect(stealth.others.map((h) => h.memberName)).toEqual(["Ada"]);
  });

  it("keeps the member listed first on a tie", () => {
    expect(partySkills(members)[0]!.best.memberName).toBe("Ada");
  });

  it("leaves out untrained skills and ones with no level", () => {
    const names = partySkills(members).map((r) => r.name);
    expect(names).not.toContain("Tracking");
    expect(names).not.toContain("Climbing");
  });
});

describe("the party's languages", () => {
  it("lists every speaker and every writer of each, best first", () => {
    const rows = partyLanguages([
      { uuid: "Actor.a", name: "Ada", languages: [{ name: "Elvish", spoken: "accented", written: "none" }, { name: "Common", spoken: "native", written: "native" }] },
      { uuid: "Actor.b", name: "Bo", languages: [{ name: "Elvish", spoken: "broken", written: "accented" }, { name: "Dwarvish", spoken: "none", written: "none" }] },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Common", "Elvish"]);
    const elvish = rows[1]!;
    expect(elvish.known).toBe(2);
    expect(elvish.spoken).toEqual([
      { uuid: "Actor.a", memberName: "Ada", level: "accented" },
      { uuid: "Actor.b", memberName: "Bo", level: "broken" },
    ]);
    expect(elvish.written).toEqual([{ uuid: "Actor.b", memberName: "Bo", level: "accented" }]);
  });

  // The bug this replaced: the best speaker took the only slot, so three
  // members with native Common showed one name and the party looked
  // monolingual.
  it("names everyone who has it equally well", () => {
    const row = partyLanguages([
      { uuid: "Actor.c", name: "Cai", languages: [{ name: "Common", spoken: "native", written: "native" }] },
      { uuid: "Actor.a", name: "Ada", languages: [{ name: "Common", spoken: "native", written: "none" }] },
      { uuid: "Actor.b", name: "Bo", languages: [{ name: "Common", spoken: "accented", written: "broken" }] },
    ])[0]!;
    expect(row.known).toBe(3);
    expect(row.spoken.map((h) => `${h.memberName} ${h.level}`)).toEqual([
      "Ada native", "Cai native", "Bo accented",
    ]);
    expect(row.written.map((h) => h.memberName)).toEqual(["Cai", "Bo"]);
  });

  it("has no speaker for a language only written", () => {
    const row = partyLanguages([{ uuid: "Actor.a", name: "Ada", languages: [{ name: "Latin", spoken: "none", written: "broken" }] }])[0]!;
    expect(row.spoken).toEqual([]);
    expect(row.written[0]?.level).toBe("broken");
  });
});

describe("the campaign's terms", () => {
  it("keeps a blank as not set, and reads a figure", () => {
    expect(termsFrom({ tl: 8, startingPoints: null, disadvantageLimit: undefined })).toEqual({ tl: 8, startingPoints: null, disadvantageLimit: null });
    expect(termsFrom(null)).toEqual({ tl: null, startingPoints: null, disadvantageLimit: null });
    expect(termsFrom({ tl: "3" as unknown as number })).toEqual({ tl: null, startingPoints: null, disadvantageLimit: null });
  });

  it("locks only what is set", () => {
    expect(lockedTerms({ tl: 8, startingPoints: null, disadvantageLimit: 50 })).toEqual({ tl: true, startingPoints: false, disadvantageLimit: true });
    expect(lockedTerms(null)).toEqual({ tl: false, startingPoints: false, disadvantageLimit: false });
  });
});

describe("pinning a party to the top of the sidebar", () => {
  it("is pinned only by the system's flag set true", () => {
    expect(isPinned({ flags: { gworld: { pinned: true } } })).toBe(true);
    expect(isPinned({ flags: { gworld: { pinned: false } } })).toBe(false);
    expect(isPinned({ flags: { gworld: {} } })).toBe(false);
    expect(isPinned({ flags: { other: { pinned: true } } })).toBe(false);
    expect(isPinned({})).toBe(false);
    expect(isPinned(null)).toBe(false);
  });
});
