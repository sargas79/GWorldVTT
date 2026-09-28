import { afterEach, describe, expect, it, vi } from "vitest";

import { complementaryHeldFor, isMasterSkill, rollComplementary } from "../complementary.js";
import {
  pendingModifiers,
  addPendingModifier,
  COMPLEMENTARY_SOURCE,
} from "../pending-modifiers.js";
import { maybePromptModifiers, promptForModifier, rollSuccess } from "../roll.js";
import { rollTeamEffort, teamEffortMembers, type TeamEffortMember } from "../team-effort.js";

/**
 * A complementary roll holds +2 to -2 for the master skill's next roll, and a
 * team effort rolls once for the party (Basic Set Revised pp. 206 and 185).
 */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of [
    "ChatMessage",
    "CONST",
    "CONFIG",
    "foundry",
    "fromUuidSync",
    "game",
    "Hooks",
    "Roll",
    "ui",
  ])
    delete globals[key];
  vi.restoreAllMocks();
});

/** A character with nothing on them that could change a roll, keeping its flags. */
function character(
  name = "Ada",
  owner = true,
  skills: Array<{ name: string; level: number; points: number }> = [],
) {
  const flags: Record<string, unknown> = {};
  return {
    name,
    uuid: `Actor.${name}`,
    isOwner: owner,
    system: {
      hp: { value: 10, max: 10 },
      fp: { value: 10, max: 10 },
      derived: { attributes: { ST: 10, DX: 10, IQ: 10, HT: 10 }, traitEffects: {} },
    },
    items: skills.map((s) => ({
      type: "skill",
      name: s.name,
      system: { points: s.points, derived: { level: s.level } },
    })),
    statuses: new Set<string>(),
    effects: [],
    flags,
    getFlag: (scope: string, key: string) => flags[`${scope}.${key}`],
    setFlag: vi.fn(async (scope: string, key: string, value: unknown) => {
      flags[`${scope}.${key}`] = structuredClone(value);
    }),
  };
}

/** Foundry with dice that come up as given, and every card kept. */
function foundryWith(faces: number[]) {
  const cards: any[] = [];
  let ids = 0;
  let next = 0;
  globals.ChatMessage = {
    implementation: {
      create: async (data: any, options: any) => {
        cards.push({ data, options });
        return data;
      },
      getSpeaker: () => ({}),
    },
  };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.foundry = {
    utils: {
      randomID: () => `held${++ids}`,
      escapeHTML: (s: string) => s,
      deepClone: (o: any) => structuredClone(o),
      mergeObject: (a: any, b: any) => ({ ...a, ...b }),
    },
    applications: {
      handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) },
    },
  };
  const warn = vi.fn();
  globals.game = {
    i18n: {
      localize: (k: string) => k,
      format: (k: string, d: any) => `${k}:${JSON.stringify(d)}`,
    },
    settings: { get: () => ({}) },
    user: { id: "gm", isGM: true, targets: new Set() },
    time: { worldTime: 1000 },
    actors: [],
  };
  globals.ui = { notifications: { warn, info: vi.fn() } };
  globals.Hooks = { call: () => true, callAll: () => true };
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: Array<{ results: Array<{ result: number }> }> = [];
    constructor(formula: string) {
      this.formula = formula;
    }
    async evaluate() {
      const count = Number(/^(\d+)d6/.exec(this.formula)?.[1] ?? 0);
      const results = Array.from({ length: count }, () => ({
        result: faces[next++ % faces.length]!,
      }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  /** The notes the complementary card posts, in order. */
  const notes = () =>
    cards
      .map((c) => c.data)
      .filter((d) => d.flags?.gworld?.complementary)
      .map((d) => d.flags.gworld.complementary);
  return { cards, warn, notes };
}

const stealth = { name: "Stealth", level: 12, attribute: "DX" };

describe("a complementary roll", () => {
  it("holds +1 for the master skill's next roll on a success, and the next roll uses it up", async () => {
    // 3d6 = 10 against 12: a success.
    const { notes, cards } = foundryWith([3, 3, 4]);
    const actor = character();
    const result = await rollComplementary({ actor, skill: stealth, master: "Climbing" });
    expect(result).toMatchObject({ bonus: 1, held: 1 });
    expect(pendingModifiers(actor)).toEqual([
      expect.objectContaining({
        value: 1,
        skill: "Climbing",
        source: COMPLEMENTARY_SOURCE,
        tags: [],
      }),
    ]);
    expect(notes()).toEqual([{ skill: "Stealth", master: "Climbing", bonus: 1, held: 1 }]);
    expect(cards.length).toBe(2);

    const master = await rollSuccess({
      actor,
      base: 11,
      label: "Climbing",
      kind: "skill",
      skill: "Climbing",
    });
    expect(master).toMatchObject({ effectiveSkill: 12 });
    expect(pendingModifiers(actor)).toEqual([]);
  });

  it("holds +2 on a critical success, -1 on a failure and -2 on a critical failure", async () => {
    const cases: Array<[number[], number]> = [
      [[1, 1, 2], 2],
      [[4, 5, 5], -1],
      [[6, 6, 6], -2],
    ];
    for (const [faces, expected] of cases) {
      const { notes } = foundryWith(faces);
      const actor = character();
      const result = await rollComplementary({ actor, skill: stealth, master: "Climbing" });
      expect(result?.bonus).toBe(expected);
      expect(pendingModifiers(actor).map((m) => m.value)).toEqual([expected]);
      expect(notes()[0]).toMatchObject({ bonus: expected, held: expected });
    }
  });

  it("rolls at personal modifiers only: the equipment in the skill's level is taken out", async () => {
    const { cards } = foundryWith([3, 3, 4]);
    const actor = character();
    await rollComplementary({
      actor,
      skill: { ...stealth, level: 14, equipment: 2 },
      master: "Climbing",
    });
    const roll = JSON.parse(String(cards[0].data.content));
    expect(roll.base).toBe(14);
    expect(roll.modifiers).toEqual([{ label: "GWORLD.Complementary.NoEquipment", value: -2 }]);
    expect(roll.effective).toBe(12);
  });

  it("holds it for whoever will attempt the master skill, when that is somebody else", async () => {
    foundryWith([3, 3, 4]);
    const helper = character("Ada");
    const climber = character("Bo");
    await rollComplementary({
      actor: helper,
      skill: stealth,
      master: "Climbing",
      recipient: climber,
    });
    expect(pendingModifiers(helper)).toEqual([]);
    expect(pendingModifiers(climber)).toEqual([
      expect.objectContaining({
        value: 1,
        skill: "Climbing",
        label: expect.stringContaining("Ada"),
      }),
    ]);
  });

  it("refuses to hold a modifier for a character the user doesn't own, before rolling", async () => {
    const { cards, warn } = foundryWith([3, 3, 4]);
    const helper = character("Ada");
    const other = character("Bo", false);
    expect(
      await rollComplementary({
        actor: helper,
        skill: stealth,
        master: "Climbing",
        recipient: other,
      }),
    ).toBeNull();
    expect(cards).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("does nothing without a master skill", async () => {
    const { cards } = foundryWith([3, 3, 4]);
    expect(
      await rollComplementary({ actor: character(), skill: stealth, master: "  " }),
    ).toBeNull();
    expect(cards).toEqual([]);
  });

  it("replaces the last complementary bonus for the same master skill, but leaves other skills' alone", async () => {
    foundryWith([3, 3, 4]);
    const actor = character();
    await rollComplementary({ actor, skill: stealth, master: "Climbing" });
    await rollComplementary({ actor, skill: stealth, master: "Swimming" });
    await rollComplementary({
      actor,
      skill: { ...stealth, name: "Acrobatics" },
      master: "Climbing",
    });
    expect(pendingModifiers(actor).map((m) => [m.skill, m.value])).toEqual([
      ["Swimming", 1],
      ["Climbing", 1],
    ]);
  });

  it("can't chain: a skill that holds a complementary bonus can't complement another", async () => {
    const { cards, warn } = foundryWith([3, 3, 4]);
    const actor = character();
    await rollComplementary({ actor, skill: stealth, master: "Climbing" });
    expect(isMasterSkill(actor, "Climbing")).toBe(true);
    expect(isMasterSkill(actor, "Stealth")).toBe(false);
    const before = cards.length;
    expect(
      await rollComplementary({
        actor,
        skill: { name: "Climbing", level: 11 },
        master: "Swimming",
      }),
    ).toBeNull();
    expect(cards.length).toBe(before);
    expect(warn).toHaveBeenCalledOnce();
    // A bonus held by a module for the same skill doesn't make it a master skill.
    const other = character();
    await addPendingModifier(other, { label: "Survey", value: 2, skill: "Climbing" });
    expect(isMasterSkill(other, "Climbing")).toBe(false);
  });

  it("adds up on a long task, and the total never passes +4", async () => {
    const { notes } = foundryWith([1, 1, 2]);
    const actor = character();
    const long = { actor, master: "Engineer", longTask: true };
    await rollComplementary({ ...long, skill: stealth });
    await rollComplementary({ ...long, skill: { ...stealth, name: "Carpentry" } });
    expect(complementaryHeldFor(actor, "Engineer").map((m) => m.value)).toEqual([2, 2]);
    // A third critical success finds no room left.
    const third = await rollComplementary({ ...long, skill: { ...stealth, name: "Mechanic" } });
    expect(third).toMatchObject({ bonus: 2, held: 0, id: null });
    expect(complementaryHeldFor(actor, "Engineer").map((m) => m.value)).toEqual([2, 2]);
    expect(notes().at(-1)).toMatchObject({ bonus: 2, held: 0 });
  });

  it("holds only the room left when the cap cuts a bonus short", async () => {
    foundryWith([1, 1, 2]);
    const actor = character();
    await addPendingModifier(actor, {
      label: "Carpentry",
      value: 2,
      skill: "Engineer",
      source: COMPLEMENTARY_SOURCE,
    });
    await addPendingModifier(actor, {
      label: "Mechanic",
      value: 1,
      skill: "Engineer",
      source: COMPLEMENTARY_SOURCE,
    });
    const result = await rollComplementary({
      actor,
      skill: stealth,
      master: "Engineer",
      longTask: true,
    });
    expect(result).toMatchObject({ bonus: 2, held: 1 });
    expect(complementaryHeldFor(actor, "Engineer").reduce((sum, m) => sum + m.value, 0)).toBe(4);
  });

  it("takes the whole penalty of a failure on a long task, whatever is held", async () => {
    foundryWith([6, 6, 6]);
    const actor = character();
    await addPendingModifier(actor, {
      label: "Carpentry",
      value: 2,
      skill: "Engineer",
      source: COMPLEMENTARY_SOURCE,
    });
    await addPendingModifier(actor, {
      label: "Mechanic",
      value: 2,
      skill: "Engineer",
      source: COMPLEMENTARY_SOURCE,
    });
    await rollComplementary({ actor, skill: stealth, master: "Engineer", longTask: true });
    expect(complementaryHeldFor(actor, "Engineer").map((m) => m.value)).toEqual([2, 2, -2]);
  });

  it("is a Quick Contest where the target resists, read by the margin of victory", async () => {
    // Ada rolls 4 (critical success, margin 8 at 12); the foe rolls 13 against 12 (fails by 1): won by 9.
    foundryWith([1, 1, 2, 4, 4, 5]);
    const actor = character();
    const foe = character("Guard");
    const result = await rollComplementary({
      actor,
      skill: stealth,
      master: "Climbing",
      contest: { foe, base: 12 },
    });
    expect(result?.bonus).toBe(2);
    expect(pendingModifiers(actor)).toEqual([
      expect.objectContaining({ value: 2, skill: "Climbing" }),
    ]);
  });

  it("does nothing where the rule is switched off", async () => {
    const { cards } = foundryWith([3, 3, 4]);
    (globals.game as any).settings.get = () => ({ complementarySkills: false });
    expect(
      await rollComplementary({ actor: character(), skill: stealth, master: "Climbing" }),
    ).toBeNull();
    expect(cards).toEqual([]);
  });
});

describe("the modifier dialog offers to discard a held bonus", () => {
  /** A dialog whose form has these boxes ticked, answering as the Roll button does. */
  function dialog(ticked: string[], modifier = "0") {
    let content = "";
    (globals.foundry as any).applications.api = {
      DialogV2: {
        prompt: async (options: any) => {
          content = options.content;
          const form = {
            querySelector: () => ({ value: modifier }),
            querySelectorAll: () => ticked.map((value) => ({ value })),
          };
          return options.ok.callback({}, { closest: () => form });
        },
      },
    };
    return () => content;
  }

  it("shows a checkbox on a bonus that can be discarded, and hands the ticked ones to the callback", async () => {
    foundryWith([3, 3, 4]);
    const content = dialog(["held1"]);
    const discarded: string[][] = [];
    const value = await promptForModifier(
      [
        { label: "Complementary", value: 1, key: "pendingModifier", heldId: "held1" },
        { label: "Survey", value: 2, key: "pendingModifier" },
      ],
      async (ids) => {
        discarded.push(ids);
      },
    );
    expect(value).toBe(0);
    expect(discarded).toEqual([["held1"]]);
    expect(content()).toContain('name="discard" value="held1"');
    expect(content().match(/name="discard"/g)).toHaveLength(1);
    expect(content()).toContain("Complementary +1");
  });

  it("offers nothing to discard without a callback, or a bonus with no id", async () => {
    foundryWith([3, 3, 4]);
    const content = dialog([]);
    await promptForModifier([{ label: "Complementary", value: 1, heldId: "held1" }]);
    expect(content()).not.toContain('name="discard"');
    await promptForModifier([{ label: "Survey", value: 2 }], async () => {});
    expect(content()).not.toContain('name="discard"');
  });

  it("does not call the callback when nothing is ticked", async () => {
    foundryWith([3, 3, 4]);
    dialog([]);
    const discard = vi.fn(async () => {});
    await promptForModifier([{ label: "Complementary", value: 1, heldId: "held1" }], discard);
    expect(discard).not.toHaveBeenCalled();
  });
});

describe("rolling the master skill", () => {
  it("puts a held complementary bonus to the roller before an ordinary click, and discards it when told to", async () => {
    foundryWith([3, 3, 4]);
    const actor = character();
    await rollComplementary({ actor, skill: stealth, master: "Climbing" });
    const [held] = pendingModifiers(actor);

    let content = "";
    (globals.foundry as any).applications.api = {
      DialogV2: {
        prompt: async (options: any) => {
          content = options.content;
          const form = {
            querySelector: () => ({ value: "0" }),
            querySelectorAll: () => [{ value: held!.id }],
          };
          return options.ok.callback({}, { closest: () => form });
        },
      },
    };
    const line = {
      label: held!.label,
      value: held!.value,
      key: "pendingModifier",
      heldId: held!.id,
    };
    // No shift key: the dialog still comes up, because a bonus is held that can be discarded.
    expect(
      await maybePromptModifiers({ shiftKey: false } as unknown as Event, [line], actor),
    ).toEqual([]);
    expect(content).toContain('name="discard"');
    expect(pendingModifiers(actor)).toEqual([]);
    // Discarded before the roll, so the roll doesn't find it.
    expect(
      await rollSuccess({ actor, base: 11, label: "Climbing", kind: "skill", skill: "Climbing" }),
    ).toMatchObject({ effectiveSkill: 11 });
  });

  it("asks nothing on an ordinary click when only a module's bonus is held", async () => {
    foundryWith([3, 3, 4]);
    const prompt = vi.fn();
    (globals.foundry as any).applications.api = { DialogV2: { prompt } };
    expect(
      await maybePromptModifiers(
        { shiftKey: false } as unknown as Event,
        [{ label: "Survey", value: 2 }],
        character(),
      ),
    ).toEqual([]);
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe("a team effort", () => {
  function party(members: any[]) {
    return { system: { members: members.map((m) => ({ uuid: m.uuid })) } };
  }

  function world(members: any[]) {
    const byUuid = new Map(members.map((m) => [m.uuid, m]));
    globals.fromUuidSync = (uuid: string) => byUuid.get(uuid) ?? null;
  }

  it("reads what each member has of the skill, with no defaults counted", () => {
    foundryWith([3, 3, 4]);
    const ada = character("Ada", true, [{ name: "Stealth", level: 14, points: 4 }]);
    const bo = character("Bo", true, [{ name: "Stealth", level: 10, points: 0 }]);
    const cy = character("Cy");
    world([ada, bo, cy]);
    const members = teamEffortMembers(party([ada, bo, cy]), "stealth");
    expect(members.map((m) => [m.name, m.level, m.points, m.knows])).toEqual([
      ["Ada", 14, 4, true],
      ["Bo", 10, 0, false],
      ["Cy", null, 0, false],
    ]);
  });

  it("rolls once, as the best member, at the best level plus those who know the skill less the group's size", async () => {
    const { cards } = foundryWith([3, 3, 4]);
    const ada = character("Ada", true, [{ name: "Stealth", level: 12, points: 2 }]);
    const bo = character("Bo", true, [{ name: "Stealth", level: 14, points: 4 }]);
    const cy = character("Cy", true, [{ name: "Stealth", level: 10, points: 1 }]);
    const di = character("Di");
    world([ada, bo, cy, di]);
    const members = teamEffortMembers(party([ada, bo, cy, di]), "Stealth");
    const result = await rollTeamEffort({ members, skill: "Stealth" });

    // 14 + 3 who know it - 4 in the group = 13; a 10 succeeds.
    expect(result).toMatchObject({ success: true, effectiveSkill: 13 });
    const roll = JSON.parse(String(cards[0].data.content));
    expect(roll).toMatchObject({ base: 14, effective: 13 });
    expect(roll.modifiers).toEqual([
      { label: "GWORLD.TeamEffort.Knowers", value: 3 },
      { label: "GWORLD.TeamEffort.GroupSize", value: -4 },
    ]);
    const rolls = cards.filter((c) => c.data.rolls);
    expect(rolls).toHaveLength(1);
    // Bo, the best, rolled for the team; the card names everyone it applies to.
    expect(cards[1].data.content).toContain("Bo, Ada, Cy, Di");
  });

  it("counts only who takes part, and takes a situational modifier", async () => {
    const { cards } = foundryWith([3, 3, 4]);
    const ada = character("Ada", true, [{ name: "Stealth", level: 12, points: 2 }]);
    const bo = character("Bo", true, [{ name: "Stealth", level: 14, points: 4 }]);
    world([ada, bo]);
    const [first, second] = teamEffortMembers(party([ada, bo]), "Stealth") as [
      TeamEffortMember,
      TeamEffortMember,
    ];
    const result = await rollTeamEffort({ members: [first], skill: "Stealth", modifier: -2 });
    // Ada alone: 12 + 1 - 1 - 2.
    expect(result).toMatchObject({ effectiveSkill: 10 });
    expect(JSON.parse(String(cards[0].data.content)).modifiers).toContainEqual({
      label: "GWORLD.Chat.Situational",
      value: -2,
    });
    expect(second.name).toBe("Bo");
  });

  it("rolls nothing where no one in it knows the skill", async () => {
    const { cards, warn } = foundryWith([3, 3, 4]);
    const ada = character("Ada", true, [{ name: "Stealth", level: 9, points: 0 }]);
    world([ada]);
    expect(
      await rollTeamEffort({
        members: teamEffortMembers(party([ada]), "Stealth"),
        skill: "Stealth",
      }),
    ).toBeNull();
    expect(cards).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("does nothing where the rule is switched off", async () => {
    const { cards } = foundryWith([3, 3, 4]);
    (globals.game as any).settings.get = () => ({ teamEfforts: false });
    const ada = character("Ada", true, [{ name: "Stealth", level: 12, points: 2 }]);
    world([ada]);
    expect(
      await rollTeamEffort({
        members: teamEffortMembers(party([ada]), "Stealth"),
        skill: "Stealth",
      }),
    ).toBeNull();
    expect(cards).toEqual([]);
  });
});
