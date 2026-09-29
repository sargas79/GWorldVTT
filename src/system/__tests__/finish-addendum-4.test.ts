import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const on = vi.hoisted(() => new Set<string>());
vi.mock("../optional-rules.js", () => ({ isRuleOn: (key: string) => on.has(key) }));
const spent = vi.hoisted(() => [] as Array<[number, string]>);
vi.mock("../extra-effort.js", () => ({
  spendFatigue: async (_actor: unknown, points: number, what: string) => {
    spent.push([points, what]);
    return true;
  },
}));

import {
  applyAttackOptions,
  attackOptionsFor,
  type AttackContext,
} from "../combat-extensions.js";
import {
  declareRapidRecovery,
  extrasCapRefusal,
  extrasOfOptions,
  extrasThisRound,
  mayRapidRecover,
  rapidRecoveryDeclared,
  recordExtras,
  registerCombatExtras,
} from "../combat-extras.js";
import {
  allOutConcentrateLines,
  attackAfterSlamRefusal,
  fallRollLines,
  registerConcentrationRun,
  slamRefusal,
  stepsFor,
} from "../more-maneuvers.js";
import {
  addPermanentDisadvantage,
  applyHardship,
  derangementPowerLines,
  mentalTimePasses,
} from "../stress.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";

const globals = globalThis as Record<string, unknown>;

/** A character whose flags are kept in a plain object, as far as these functions read and write them. */
function actor(system: Record<string, unknown> = {}, flags: Record<string, unknown> = {}) {
  const items: any[] = [];
  const created: any[] = [];
  const self: any = {
    name: "Tester",
    isOwner: true,
    system: { maneuver: "attack", derived: { will: 10, melee: [] }, conditions: {}, stress: 0, derangement: 0, ...system },
    items,
    created,
    updates: [] as any[],
    flags,
    getFlag: (_scope: string, key: string) => key.split(".").reduce((o: any, k) => (o == null ? undefined : o[k]), flags),
    setFlag: async (_scope: string, key: string, value: unknown) => {
      const parts = key.split(".");
      let target: any = flags;
      for (const part of parts.slice(0, -1)) target = target[part] ??= {};
      target[parts[parts.length - 1]!] = value;
    },
    unsetFlag: async (_scope: string, key: string) => {
      delete flags[key];
    },
    update: async (data: Record<string, unknown>) => {
      self.updates.push(data);
      for (const [path, value] of Object.entries(data)) {
        const parts = path.split(".");
        let target: any = self;
        for (const part of parts.slice(0, -1)) target = target[part];
        target[parts[parts.length - 1]!] = value;
      }
    },
    createEmbeddedDocuments: async (_type: string, data: any[]) => {
      created.push(...data);
      for (const d of data) {
        items.push({
          ...d,
          getFlag: (_s: string, k: string) => d.flags?.gworld?.[k],
          update: async (change: Record<string, unknown>) => {
            d.system.points = change["system.points"];
          },
        });
      }
      return data;
    },
  };
  return self;
}

beforeEach(() => {
  on.clear();
  spent.length = 0;
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d?: Record<string, unknown>) => `${k}${d ? JSON.stringify(d) : ""}` },
    combat: { id: "c", started: true, round: 1 },
    combats: [],
    user: { isGM: true },
    time: { worldTime: 0 },
    settings: { get: () => ({}) },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  globals.ChatMessage = { implementation: { create: vi.fn(async () => ({})), getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
});

afterEach(() => {
  for (const key of ["game", "ui", "Hooks", "ChatMessage", "CONST", "Roll"]) delete globals[key];
});

describe("the cap of one offensive and one defensive option a round", () => {
  it("refuses a second option of a kind in the same round, and lets the next round start again", async () => {
    const a = actor();
    expect(extrasCapRefusal(a, ["giantStep"])).toBeNull();
    await recordExtras(a, ["giantStep"]);
    expect(extrasThisRound(a)).toEqual(["giantStep"]);
    expect(extrasCapRefusal(a, ["greatLunge"])).toContain("OverCap");
    expect(extrasCapRefusal(a, ["giantStep"])).toBeNull();
    expect(extrasCapRefusal(a, ["feverishDefense"])).toBeNull();
    (globals.game as any).combat.round = 2;
    expect(extrasThisRound(a)).toEqual([]);
    expect(extrasCapRefusal(a, ["greatLunge"])).toBeNull();
  });

  it("tracks nothing outside a battle", async () => {
    (globals.game as any).combat = null;
    const a = actor();
    await recordExtras(a, ["flurry"]);
    expect(extrasThisRound(a)).toEqual([]);
    expect(extrasCapRefusal(a, ["flurry", "mightyBlows"])).toBeNull();
  });

  it("reads the combat options among an attack's option values", () => {
    expect(extrasOfOptions({ "gworld.giantStep": true, "gworld.fatigueTrade": 2, "x.y": true })).toEqual(["giantStep"]);
    expect(extrasOfOptions(undefined)).toEqual([]);
  });
});

describe("Giant Step, Great Lunge and Heroic Charge in the attack dialog", () => {
  // The options register once for the file, so the listener they add is kept.
  const heard: Array<[string, (context: any) => void]> = [];
  let registered = false;
  beforeEach(() => {
    globals.Hooks = { on: (event: string, fn: (context: any) => void) => { heard.push([event, fn]); } };
    on.add("extraEffort");
    if (!registered) {
      registerCombatExtras();
      registered = true;
    }
  });

  const context = (maneuver: string, ranged = false, extra: Partial<AttackContext> = {}): AttackContext => ({
    actor: actor({ maneuver }), item: null, ranged, damageType: "cut", reach: "1", effectiveSkill: 12, maneuver, targets: [], chosen: {}, ...extra,
  });

  it("offers each on its own maneuvers only", () => {
    const keys = (c: AttackContext) => attackOptionsFor(c).map((o) => o.key).filter((k) => k.startsWith("gworld."));
    expect(keys(context("attack"))).toEqual(["gworld.giantStep", "gworld.greatLunge"]);
    expect(keys(context("moveAndAttack"))).toEqual(["gworld.greatLunge", "gworld.heroicCharge"]);
    expect(keys(context("allOutAttack"))).toEqual([]);
    expect(keys(context("committedAttack"))).toEqual(["gworld.greatLunge"]);
    expect(keys(context("attack", true))).toEqual(["gworld.giantStep"]);
  });

  it("charges 1 FP and gives the reach, the to-hit and the notes", () => {
    const merged = applyAttackOptions(context("moveAndAttack"), { "gworld.greatLunge": true, "gworld.heroicCharge": true });
    expect(merged.fatigue).toBe(2);
    expect(merged.reachBonus).toBe(1);
    expect(merged.modifiers).toEqual([{ label: "GWORLD.ExtraEffort.Extra.heroicCharge", value: 4 }]);
    expect(merged.notes).toHaveLength(2);
  });

  it("lifts Move and Attack's cap for a Heroic Charge and leaves it otherwise", () => {
    const listener = heard.find(([event]) => event === "gworld.attackModifiers")![1];
    const charging = { options: { "gworld.heroicCharge": true }, skillCap: 9 as number | null };
    listener(charging);
    expect(charging.skillCap).toBeNull();
    const plain = { options: {}, skillCap: 9 as number | null };
    listener(plain);
    expect(plain.skillCap).toBe(9);
  });

  it("refuses a second offensive option once one was used this round", async () => {
    const a = actor({ maneuver: "attack" });
    await recordExtras(a, ["flurry"]);
    const merged = applyAttackOptions(context("attack", false, { actor: a }), { "gworld.giantStep": true });
    expect(merged.fatigue).toBe(0);
  });

  it("offers a spinner to trade FP for an attack's skill when the rule is on", () => {
    on.add("fatigueForSkill");
    const options = attackOptionsFor(context("attack"));
    const trade = options.find((o) => o.key === "gworld.fatigueTrade");
    expect(trade?.input).toEqual({ type: "number", min: 0, max: 4 });
    const merged = applyAttackOptions(context("attack"), { "gworld.fatigueTrade": 3 });
    expect(merged.fatigue).toBe(3);
    expect(merged.modifiers).toEqual([{ label: "GWORLD.ExtraEffort.TradeSkillLine", value: 3 }]);
    expect(applyAttackOptions(context("attack"), { "gworld.fatigueTrade": 9 }).fatigue).toBe(4);
  });
});

describe("Rapid Recovery", () => {
  beforeEach(() => on.add("extraEffort"));

  it("is for an unbalanced weapon that attacked, or any weapon after a Move and Attack", () => {
    expect(mayRapidRecover(actor({ maneuver: "attack", conditions: { attackedThisTurn: true }, derived: { melee: [{ unbalanced: true }] } }))).toBe(true);
    expect(mayRapidRecover(actor({ maneuver: "attack", conditions: { attackedThisTurn: false }, derived: { melee: [{ unbalanced: true }] } }))).toBe(false);
    expect(mayRapidRecover(actor({ maneuver: "moveAndAttack" }))).toBe(true);
    expect(mayRapidRecover(actor({ maneuver: "allOutAttack" }))).toBe(false);
  });

  it("costs 1 FP, is remembered for the round, and counts against the defensive cap", async () => {
    const a = actor({ maneuver: "moveAndAttack" });
    expect(rapidRecoveryDeclared(a)).toBe(false);
    expect(await declareRapidRecovery(a)).toBe(true);
    expect(spent).toEqual([[1, "GWORLD.ExtraEffort.Extra.rapidRecovery"]]);
    expect(rapidRecoveryDeclared(a)).toBe(true);
    expect(extrasThisRound(a)).toEqual(["rapidRecovery"]);
    // Again the same round: no second charge.
    expect(await declareRapidRecovery(a)).toBe(true);
    expect(spent).toHaveLength(1);
    (globals.game as any).combat.round = 2;
    expect(rapidRecoveryDeclared(a)).toBe(false);
  });

  it("is refused outside its maneuvers and over the cap, without charging", async () => {
    expect(await declareRapidRecovery(actor({ maneuver: "allOutAttack" }))).toBe(false);
    const a = actor({ maneuver: "moveAndAttack" });
    await recordExtras(a, ["feverishDefense"]);
    expect(await declareRapidRecovery(a)).toBe(false);
    expect(spent).toEqual([]);
  });
});

describe("All-Out Concentrate over the whole task", () => {
  beforeEach(() => on.add("allOutConcentrate"));

  it("gives the +1 on an unbroken run and takes it off after a plain Concentrate", () => {
    const fresh = actor({ maneuver: "allOutConcentrate" });
    expect(allOutConcentrateLines(fresh, "skill")).toEqual([{ label: "GWORLD.Maneuver.allOutConcentrate", value: 1 }]);
    const unbroken = actor({ maneuver: "allOutConcentrate" }, { allOutConcentrationRun: true });
    expect(allOutConcentrateLines(unbroken, "skill")).toHaveLength(1);
    const broken = actor({ maneuver: "allOutConcentrate" }, { allOutConcentrationRun: false });
    expect(allOutConcentrateLines(broken, "skill")).toEqual([]);
    expect(allOutConcentrateLines(broken, "skill", ["distraction"])).toHaveLength(1);
    expect(allOutConcentrateLines(fresh, "attack")).toEqual([]);
  });

  it("keeps the run as each turn ends", async () => {
    const handlers: Record<string, (combat: unknown, combatant: any) => void> = {};
    globals.Hooks = { on: (event: string, fn: any) => { handlers[event] = fn; } };
    registerConcentrationRun();
    const a = actor({ maneuver: "allOutConcentrate" });
    handlers[PROCEDURE_HOOKS.turnEnd]!({}, { actor: a });
    await Promise.resolve();
    expect(a.flags.allOutConcentrationRun).toBe(true);
    a.system.maneuver = "concentrate";
    handlers[PROCEDURE_HOOKS.turnEnd]!({}, { actor: a });
    await Promise.resolve();
    expect(a.flags.allOutConcentrationRun).toBe(false);
    a.system.maneuver = "attack";
    handlers[PROCEDURE_HOOKS.turnEnd]!({}, { actor: a });
    await Promise.resolve();
    expect(a.flags.allOutConcentrationRun).toBeUndefined();
  });
});

describe("Committed Attack's steps, the kick and the Double's slam", () => {
  it("counts a second step and a Giant Step", async () => {
    on.add("committedAttack");
    const a = actor({ maneuver: "committedAttack" }, { maneuverOptions: { gworld: { committedStep: true } } });
    expect(stepsFor(a, "step")).toBe(2);
    await recordExtras(a, ["giantStep"]);
    expect(stepsFor(a, "step")).toBe(3);
    expect(stepsFor(a, "full")).toBe(0);
    expect(stepsFor(actor({ maneuver: "attack" }), "step")).toBe(1);
  });

  it("puts +2 on a roll to avoid falling after a Defensive Attack kick, and -2 after a Heroic Charge", async () => {
    on.add("defensiveAttack");
    on.add("extraEffort");
    const kicker = actor({ maneuver: "defensiveAttack" }, { maneuverOptions: { gworld: { defensiveBenefit: "kick" } } });
    expect(fallRollLines(kicker, ["fall", "DX"])).toEqual([{ label: "GWORLD.MoreManeuvers.KickBalanceLine", value: 2 }]);
    expect(fallRollLines(kicker, ["DX"])).toEqual([]);
    const charger = actor({ maneuver: "moveAndAttack" });
    await recordExtras(charger, ["heroicCharge"]);
    expect(fallRollLines(charger, ["fall"])).toEqual([{ label: "GWORLD.ExtraEffort.HeroicChargeFall", value: -2 }]);
  });

  it("lets a Double slam once and attack only before it", () => {
    on.add("allOutSlams");
    const flags = { maneuverOptions: { gworld: { slam: true } } };
    const doubler = actor({ maneuver: "allOutAttack", allOutAttackOption: "double" }, flags);
    expect(slamRefusal(doubler)).toBeNull();
    const slammed = actor(
      { maneuver: "allOutAttack", allOutAttackOption: "double" },
      { ...flags, combatState: { gworld: { slamMade: { value: true, lifetime: "turn" } } } },
    );
    expect(slamRefusal(slammed)).toBe("GWORLD.MoreManeuvers.SlamTwice");
    expect(attackAfterSlamRefusal(slammed)).toBe("GWORLD.MoreManeuvers.AttackAfterSlam");
    const strong = actor(
      { maneuver: "allOutAttack", allOutAttackOption: "strong" },
      { ...flags, combatState: { gworld: { slamMade: { value: true, lifetime: "turn" } } } },
    );
    expect(slamRefusal(strong)).toBeNull();
    expect(attackAfterSlamRefusal(strong)).toBeNull();
  });
});

describe("Derangement's overflow, the clock and the powers", () => {
  beforeEach(() => {
    on.add("stressAndDerangement");
  });

  it("turns Derangement past Will into a disadvantage on the character, and adds to it", async () => {
    const a = actor({ derangement: 9, derived: { will: 10 } });
    await applyHardship(a, { kind: "sanity", amount: 3 });
    expect(a.system.derangement).toBe(10);
    expect(a.created).toHaveLength(1);
    expect(a.created[0]).toMatchObject({ type: "trait", system: { category: "disadvantage", points: -2 } });
    // More overflow adds to the one already there.
    expect(await addPermanentDisadvantage(a, 3)).toBe(5);
    expect(a.items[0].system.points).toBe(-5);
    expect(a.created).toHaveLength(1);
  });

  it("holds no disadvantage where nothing overflowed", async () => {
    const a = actor({ derangement: 1, derived: { will: 10 } });
    await applyHardship(a, { kind: "sanity", amount: 1 });
    expect(a.created).toEqual([]);
  });

  it("sheds Stress as the clock runs, carrying the odd seconds, but not in a battle", async () => {
    on.add("mentalOnTheClock");
    const a = actor({ stress: 5 });
    expect(await mentalTimePasses(a, { from: 0, to: 1500 })).toEqual({ shed: 2, days: 0 });
    expect(a.system.stress).toBe(3);
    expect(a.flags.mentalClockCarry).toBe(300);
    (globals.game as any).combats = [{ started: true, combatants: [{ actor: a }] }];
    expect(await mentalTimePasses(a, { from: 1500, to: 6000 })).toEqual({ shed: 0, days: 0 });
    expect(a.system.stress).toBe(3);
  });

  it("does nothing on the clock without the switch", async () => {
    const a = actor({ stress: 5 });
    expect(await mentalTimePasses(a, { from: 0, to: 6000 })).toEqual({ shed: 0, days: 0 });
    expect(a.system.stress).toBe(5);
  });

  it("rolls the day's end at midnight for a character with Derangement, unless the day had hardship", async () => {
    on.add("mentalOnTheClock");
    globals.Roll = class {
      total = 3;
      dice = [{ results: [{ result: 1 }, { result: 1 }, { result: 1 }] }];
      async evaluate() { return this; }
    };
    const quiet = actor({ derangement: 2 });
    expect(await mentalTimePasses(quiet, { from: 80000, to: 90000 })).toEqual({ shed: 0, days: 1 });
    expect(quiet.system.derangement).toBe(1);
    // A hardship inside the day that ended: no day's end.
    const troubled = actor({ derangement: 2 }, { mentalLastHardship: 70000 });
    expect(await mentalTimePasses(troubled, { from: 80000, to: 90000 })).toEqual({ shed: 0, days: 0 });
    expect(troubled.system.derangement).toBe(2);
    // A hardship in an earlier day leaves the later one quiet.
    const earlier = actor({ derangement: 2 }, { mentalLastHardship: 50000 });
    expect(await mentalTimePasses(earlier, { from: 86400, to: 180000 })).toEqual({ shed: 0, days: 1 });
    const fresh = actor({ derangement: 2 }, { mentalLastHardship: 10000 });
    expect(await mentalTimePasses(fresh, { from: 0, to: 90000 })).toEqual({ shed: 0, days: 0 });
    expect(fresh.system.derangement).toBe(2);
  });

  it("penalizes a power's roll by half the Derangement, and the evil ones the other way", () => {
    on.add("derangementRollPenalties");
    const a = actor({ derangement: 6 });
    expect(derangementPowerLines({ actor: a, tags: ["skill", "power"] })).toEqual([{ label: "GWORLD.Stress.DerangementPowerLine", value: -3 }]);
    expect(derangementPowerLines({ actor: a, tags: ["evil"] })).toEqual([{ label: "GWORLD.Stress.DerangementPowerLine", value: 3 }]);
    expect(derangementPowerLines({ actor: a, tags: ["evil", "resist"] })).toEqual([{ label: "GWORLD.Stress.DerangementPowerLine", value: -3 }]);
    expect(derangementPowerLines({ actor: a, tags: ["skill"] })).toEqual([]);
    on.delete("derangementRollPenalties");
    expect(derangementPowerLines({ actor: a, tags: ["power"] })).toEqual([]);
  });
});

describe("the roll dialog's spinner for trading FP (Basic Set Revised p. 572)", () => {
  /** A dialog answering as the Roll button does, with these values in its fields. */
  function dialog(values: Record<string, string>, ticked: string[] = []) {
    let content = "";
    globals.foundry = {
      utils: { escapeHTML: (s: string) => s },
      applications: {
        api: {
          DialogV2: {
            prompt: async (options: any) => {
              content = options.content;
              const form = {
                querySelector: (selector: string) => {
                  const name = /name="([^"]+)"/.exec(selector)?.[1] ?? "";
                  return { value: values[name] ?? "0", checked: ticked.includes(name) };
                },
                querySelectorAll: () => [],
              };
              return options.ok.callback({}, { closest: () => form });
            },
          },
        },
      },
    };
    return () => content;
  }

  const shift = { shiftKey: true } as unknown as Event;

  it("offers the spinner on a skill roll where the switch is on, and pays and adds the bonus", async () => {
    on.add("fatigueForSkill");
    const content = dialog({ modifier: "1", tradeFp: "3" });
    const { maybePromptModifiers } = await import("../roll.js");
    const a = actor({}, {});
    a.system.fp = { value: 6, max: 10 };
    const lines = await maybePromptModifiers(shift, [], a, { rollType: "skill" });
    expect(content()).toContain('name="tradeFp"');
    expect(content()).toContain('max="4"');
    expect(lines).toEqual([
      { label: "GWORLD.Chat.Situational", value: 1 },
      { label: "GWORLD.ExtraEffort.TradeSkillLine", value: 3 },
    ]);
    expect(spent).toEqual([[3, "GWORLD.ExtraEffort.TradeTitle"]]);
  });

  it("limits the spinner to the FP the character has", async () => {
    on.add("fatigueForSkill");
    const content = dialog({ tradeFp: "9" });
    const { maybePromptModifiers } = await import("../roll.js");
    const a = actor({}, {});
    a.system.fp = { value: 2, max: 10 };
    const lines = await maybePromptModifiers(shift, [], a, { rollType: "skill" });
    expect(content()).toContain('max="2"');
    expect(lines).toEqual([{ label: "GWORLD.ExtraEffort.TradeSkillLine", value: 2 }]);
  });

  it("offers nothing to trade without the switch, or on an attack", async () => {
    const content = dialog({});
    const { maybePromptModifiers } = await import("../roll.js");
    const a = actor({}, {});
    a.system.fp = { value: 6, max: 10 };
    expect(await maybePromptModifiers(shift, [], a, { rollType: "skill" })).toEqual([]);
    expect(content()).not.toContain("tradeFp");
    on.add("fatigueForSkill");
    await maybePromptModifiers(shift, [], a, { rollType: "attack" });
    expect(content()).not.toContain("tradeFp");
  });

  it("adds the kick's +2 when a DX roll is ticked as avoiding a fall", async () => {
    on.add("defensiveAttack");
    const content = dialog({}, ["fall"]);
    const { maybePromptModifiers } = await import("../roll.js");
    const kicker = actor({ maneuver: "defensiveAttack" }, { maneuverOptions: { gworld: { defensiveBenefit: "kick" } } });
    const lines = await maybePromptModifiers(shift, [], kicker, { rollType: "attribute", basedOn: "DX" });
    expect(content()).toContain('name="fall"');
    expect(lines).toEqual([{ label: "GWORLD.MoreManeuvers.KickBalanceLine", value: 2 }]);
    await maybePromptModifiers(shift, [], kicker, { rollType: "attribute", basedOn: "HT" });
    expect(content()).not.toContain('name="fall"');
  });
});
