import { afterEach, describe, expect, it, vi } from "vitest";

const { rollSuccess } = vi.hoisted(() => ({ rollSuccess: vi.fn(async (...args: any[]) => ({ success: args.length >= 0 })) }));
vi.mock("../roll.js", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), rollSuccess }));

import { perksOf } from "../../rules/addendum-perks.js";
import { CONTROLLABLE_FLAG, inflictControllableDisadvantage } from "../controllable-disadvantage.js";
import { workAMonth } from "../life.js";
import { maybePromptModifiers } from "../roll.js";

/**
 * The roll flows of #909 and #911: the wildcard, Talent and equipment bonuses
 * offered in a roll's own dialog, Controllable Disadvantage's roll, and No
 * Nuisance Rolls waiving a month's work (Basic Set Revised pp. 324-325, 328-329, 333).
 */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Roll", "ui"]) delete globals[key];
  rollSuccess.mockClear();
  vi.restoreAllMocks();
});

const perk = (name: string, specialty = "", levels = 1) => ({ name, specialty, levels });

function actorWith(perks: Array<ReturnType<typeof perk>>, items: any[] = [], extra: Record<string, unknown> = {}) {
  const flags: Record<string, unknown> = {};
  return {
    name: "Ada",
    isOwner: true,
    items,
    flags,
    system: { tl: 8, money: 0, derived: { attributes: { ST: 10, DX: 10, IQ: 10, HT: 12 }, will: 11, per: 10, perks: perksOf(perks), wealth: { jobPay: 1000 }, traitEffects: {} }, ...extra },
    getFlag: (scope: string, key: string) => flags[`${scope}.${key}`],
    setFlag: vi.fn(async (scope: string, key: string, value: unknown) => { flags[`${scope}.${key}`] = structuredClone(value); }),
    update: vi.fn(async () => {}),
  };
}

function foundryWith(options: { rules?: Record<string, boolean>; worldTime?: number; prompt?: (options: any) => Promise<unknown> } = {}) {
  const cards: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s },
    applications: {
      handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) },
      api: { DialogV2: { prompt: options.prompt ?? (async () => null) } },
    },
  };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}`, has: () => true },
    settings: { get: () => options.rules ?? {} },
    user: { id: "u", isGM: false },
    time: { worldTime: options.worldTime ?? 0 },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  return { cards };
}

const wildcard = () => ({ id: "wc", type: "skill", name: "Detective!", system: { attribute: "IQ", derived: { level: 15 } } });

describe("a plain click on a roll with a bonus on offer", () => {
  /** A dialog answered as its OK button would, with these fields. */
  function answer(values: Record<string, string>, ticked: string[] = []) {
    let content = "";
    const prompt = async (options: any) => {
      content = options.content;
      const form = {
        querySelector: (selector: string) => {
          const name = /name="([^"]+)"/.exec(selector)?.[1] ?? "";
          return name in values ? { value: values[name], checked: values[name] === "on" } : null;
        },
        querySelectorAll: () => ticked.map((value) => ({ value })),
      };
      return options.ok.callback({}, { closest: () => form });
    };
    return { prompt, content: () => content };
  }

  it("opens the dialog without a shift-click and adds the wildcard's bonus, halved for a defense", async () => {
    const dialog = answer({ bonusWildcard: "wc", bonusCategory: "resist", bonusHalve: "off", modifier: "0" });
    foundryWith({ rules: { wildcardBonus: true }, prompt: dialog.prompt });
    const actor = actorWith([], [wildcard()]);
    const lines = await maybePromptModifiers({ shiftKey: false } as any, [], actor, { kind: "defense" });
    expect(dialog.content()).toContain('name="bonusWildcard"');
    expect(lines).toEqual([expect.objectContaining({ value: 3, key: "wildcard" })]);
  });

  it("keeps the situational modifier beside the offered lines", async () => {
    const dialog = answer({ bonusWildcard: "wc", bonusCategory: "noSkill", bonusHalve: "off", modifier: "-2" });
    foundryWith({ rules: { wildcardBonus: true }, prompt: dialog.prompt });
    const lines = await maybePromptModifiers({ shiftKey: false } as any, [], actorWith([], [wildcard()]), { kind: "skill", skill: "Streetwise" });
    expect(lines).toEqual([
      expect.objectContaining({ value: -2 }),
      expect.objectContaining({ value: 5, key: "wildcard" }),
    ]);
  });

  it("cancels the roll when the dialog is dismissed", async () => {
    foundryWith({ rules: { wildcardBonus: true }, prompt: async () => null });
    expect(await maybePromptModifiers({ shiftKey: false } as any, [], actorWith([], [wildcard()]), { kind: "skill", skill: "Streetwise" })).toBeNull();
  });

  it("opens no dialog when the rule is off or nothing applies", async () => {
    const prompt = vi.fn(async () => null);
    foundryWith({ prompt });
    expect(await maybePromptModifiers({ shiftKey: false } as any, [], actorWith([], [wildcard()]), { kind: "skill", skill: "Streetwise" })).toEqual([]);
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe("Controllable Disadvantage", () => {
  it("rolls HT for a physical disadvantage, and -1 for each further try in the hour", async () => {
    foundryWith({ worldTime: 1000 });
    const actor = actorWith([]);
    const item = { name: "Controllable Disadvantage", system: { specialty: "Lame (P)" } };
    expect(await inflictControllableDisadvantage(actor, item)).toBe(true);
    expect(rollSuccess.mock.calls[0]![0]).toMatchObject({ base: 12, modifiers: [] });
    (globals.game as any).time.worldTime = 1500;
    await inflictControllableDisadvantage(actor, item);
    expect(rollSuccess.mock.calls[1]![0]).toMatchObject({ base: 12, modifiers: [expect.objectContaining({ value: -1 })] });
    expect((actor.flags as any)[`gworld.${CONTROLLABLE_FLAG}`].lame.count).toBe(2);
    // An hour later the count starts over.
    (globals.game as any).time.worldTime = 1000 + 4000;
    await inflictControllableDisadvantage(actor, item);
    expect(rollSuccess.mock.calls[2]![0].modifiers).toEqual([]);
  });

  it("rolls Will for a mental one, and asks when the specialty doesn't say", async () => {
    foundryWith({ prompt: async () => "mental" });
    const actor = actorWith([]);
    await inflictControllableDisadvantage(actor, { name: "Controllable Disadvantage", system: { specialty: "Bad Temper" } });
    expect(rollSuccess.mock.calls[0]![0]).toMatchObject({ base: 11, tags: ["Will"] });
  });

  it("does nothing for a perk with no disadvantage named, or when the question is dismissed", async () => {
    foundryWith({ prompt: async () => null });
    const actor = actorWith([]);
    expect(await inflictControllableDisadvantage(actor, { name: "Controllable Disadvantage", system: { specialty: "" } })).toBeNull();
    expect(await inflictControllableDisadvantage(actor, { name: "Controllable Disadvantage", system: { specialty: "Bad Temper" } })).toBeNull();
    expect(rollSuccess).not.toHaveBeenCalled();
  });
});

describe("No Nuisance Rolls for a month's work", () => {
  const job = { title: "Courier", skill: "Driving (Automobile)", kind: "wage" };
  const driving = (level: number) => ({ id: "d", type: "skill", name: "Driving/TL8 (Automobile)", system: { attribute: "DX", derived: { level } } });

  it("pays without a roll when the perk names the job and the skill is 16+", async () => {
    const { cards } = foundryWith();
    const actor = actorWith([perk("No Nuisance Rolls", "Courier")], [driving(17)], { job });
    await workAMonth({ actor, modifier: 0 });
    expect(actor.update).toHaveBeenCalledWith({ "system.money": 1000 });
    const card = JSON.parse(cards[0].content);
    expect(card.dice).toEqual([]);
    expect(card.lines.join(" ")).toContain("GWORLD.Perks.NuisanceWaived");
  });

  it("rolls as ever when the skill is below 16", async () => {
    globals.Roll = class {
      total = 10; dice = [{ results: [{ result: 3 }, { result: 3 }, { result: 4 }] }];
      async evaluate() { return this; }
    };
    const { cards } = foundryWith();
    const actor = actorWith([perk("No Nuisance Rolls", "Courier")], [driving(15)], { job });
    await workAMonth({ actor, modifier: 0 });
    expect(JSON.parse(cards[0].content).dice).toEqual([3, 3, 4]);
  });
});
