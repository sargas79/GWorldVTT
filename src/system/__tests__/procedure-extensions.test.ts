import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Registries are module-level state, so each test loads a fresh copy. */
async function load() {
  vi.resetModules();
  return import("../procedure-extensions.js");
}

const globals = globalThis as Record<string, unknown>;

/** An actor whose flags live in a plain object. */
function actor(system: Record<string, unknown> = {}, flags: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...flags };
  return {
    id: "a1",
    isOwner: true,
    system,
    getFlag: (_scope: string, key: string) => key.split(".").reduce<any>((v, k) => v?.[k], store),
    setFlag: vi.fn(async (_scope: string, key: string, value: unknown) => {
      const parts = key.split(".");
      let node: any = store;
      for (const part of parts.slice(0, -1)) node = node[part] ??= {};
      node[parts.at(-1)!] = value;
    }),
    store,
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globals.game = { combat: null, time: { worldTime: 1000 } };
});

afterEach(() => {
  delete globals.Hooks;
  delete globals.game;
  vi.restoreAllMocks();
});

/** More extension points for add-on modules (sargas79/GWorldVTT#245). */
describe("maneuver options", () => {
  it("offers an option on its maneuver only while available, and saves a choice only when not refused", async () => {
    const api = await load();
    let on = true;
    api.registerManeuverOption({ module: "test-addon", key: "sprint", maneuver: "move", label: "Sprint", available: () => on });
    api.registerManeuverOption({ module: "test-addon", key: "lunge", maneuver: "move", label: "Lunge", refuse: (c) => (c.chosen["test-addon.sprint"] ? "Not while sprinting" : null) });
    const mover = actor({ maneuver: "move" });
    expect(api.maneuverOptionsFor(mover).map((o) => o.id)).toEqual(["test-addon.sprint", "test-addon.lunge"]);
    expect(await api.chooseManeuverOption(mover, "test-addon.sprint", true)).toBe(true);
    expect(api.maneuverOptionsFor(mover).find((o) => o.id === "test-addon.lunge")?.refused).toBe("Not while sprinting");
    expect(await api.chooseManeuverOption(mover, "test-addon.lunge", true)).toBe(false);
    on = false;
    expect(api.maneuverOptionsFor(mover).map((o) => o.id)).toEqual(["test-addon.lunge"]);
    expect(api.maneuverOptionsFor(actor({ maneuver: "attack" }))).toEqual([]);
  });

  it("puts a chosen option's lines on attacks and defenses, and offers its Wait response", async () => {
    const api = await load();
    const trigger = vi.fn();
    api.registerManeuverOption({
      module: "test-addon", key: "braced", maneuver: "wait", label: "Braced",
      attack: () => ({ modifiers: [{ label: "Braced", value: 1 }] }),
      defense: (c) => (c.defense === "parry" ? [{ label: "Braced", value: 2 }] : []),
      response: { label: "Stop thrust", trigger },
    });
    const waiter = actor({ maneuver: "wait" }, { maneuverOptions: { "test-addon": { braced: true } } });
    expect(api.maneuverOptionsFor(waiter)[0]!.response).toBe("Stop thrust");
    const effect = api.maneuverOptionAttackEffect({ actor: waiter } as never);
    expect(effect.modifiers).toEqual([{ label: "Braced", value: 1 }]);
    expect(api.maneuverOptionDefenseLines(waiter, "parry")).toEqual([{ label: "Braced", value: 2 }]);
    expect(api.maneuverOptionDefenseLines(waiter, "dodge")).toEqual([]);
    await api.triggerManeuverResponse(waiter, "test-addon.braced");
    expect(trigger).toHaveBeenCalledWith(waiter, true);
    // Nothing applies once the maneuver changes.
    waiter.system.maneuver = "attack";
    expect(api.maneuverOptionAttackEffect({ actor: waiter } as never).modifiers).toEqual([]);
  });
});

describe("success rolls and contests", () => {
  it("tags a roll by its kind and skill", async () => {
    const api = await load();
    expect(api.successRollTags({ kind: "skill", skill: "Fast-Draw (Knife)" }).sort()).toEqual(["fastDraw", "skill"]);
    expect(api.successRollTags({ kind: "skill", skill: "Teaching", tags: ["x"] }).sort()).toEqual(["skill", "teaching", "x"]);
  });

  it("gathers a listener's lines, the actor's conditions and a defender's maneuver options", async () => {
    const api = await load();
    globals.Hooks = {
      callAll: (hook: string, context: any) => {
        if (hook === api.PROCEDURE_HOOKS.successRollModifiers && context.tags.includes("fastDraw")) context.modifiers.push({ label: "Test", value: -2 });
      },
    };
    api.registerManeuverOption({ module: "test-addon", key: "braced", maneuver: "wait", label: "Braced", defense: () => [{ label: "Braced", value: 1 }] });
    const hero = actor({ maneuver: "wait" }, {
      maneuverOptions: { "test-addon": { braced: true } },
      timedConditions: [{ id: "test-addon.dazed", label: "Dazed", modifiers: [{ label: "", value: -1, rolls: ["skill"] }], turnsLeft: 2, untilRound: null, untilTime: null, system: false }],
    });
    const context = (kind: string, skill: string, tags: string[]) => ({ actor: hero, label: "", kind, skill, base: 12, tags: api.successRollTags({ kind, skill, tags }), modifiers: [{ label: "Given", value: 3 }] });
    expect(api.successRollModifiers(context("skill", "Fast-Draw (Knife)", []))).toEqual([{ label: "Dazed", value: -1 }, { label: "Test", value: -2 }]);
    expect(api.successRollModifiers(context("skill", "Stealth", []))).toEqual([{ label: "Dazed", value: -1 }]);
    expect(api.successRollModifiers(context("defense", "", ["parry"]))).toEqual([{ label: "Braced", value: 1 }]);
  });

  it("lets the first resolver that applies propose the scores of a Quick Contest", async () => {
    const api = await load();
    api.registerContestResolver({
      module: "test-addon", key: "sense", label: "Sense",
      applies: (c) => c.tags.includes("quickContest"),
      resolve: () => ({ second: { base: 15, note: "Per" } }),
    });
    const scores = api.resolveContestScores({ label: "", first: { actor: {}, base: 12 }, second: { actor: {}, base: 10 }, tags: ["quickContest"] });
    expect(scores).toEqual({ first: { base: 12 }, second: { base: 15, note: "Per" }, resolver: "Sense" });
    expect(api.resolveContestScores({ label: "", first: { actor: {}, base: 12 }, second: { actor: {}, base: 10 }, tags: [] }).resolver).toBeNull();
  });
});

describe("attack sequences", () => {
  it("starts from the maneuver's attacks and takes a listener's count and target picking", async () => {
    const api = await load();
    expect(api.attackSequenceFor(actor({ maneuver: "attack" }))).toEqual({ count: 1, pickTargets: false, made: 0 });
    expect(api.attackSequenceFor(actor({ maneuver: "allOutAttack", allOutAttackOption: "double" })).count).toBe(2);
    expect(api.attackSequenceFor(actor({ maneuver: "doNothing" })).count).toBe(0);
    globals.Hooks = { callAll: (_hook: string, c: any) => { if (c.maneuver === "attack") { c.count = 3; c.pickTargets = true; } } };
    const fighter = actor({ maneuver: "attack" }, { combatState: { gworld: { attacksMade: { value: 1, lifetime: "turn" } } } });
    expect(api.attackSequenceFor(fighter)).toEqual({ count: 3, pickTargets: true, made: 1 });
  });
});

describe("derived attack modes", () => {
  it("adds a row per item the mode applies to, over the defaults, without touching the item", async () => {
    const api = await load();
    api.registerDerivedAttackMode({
      module: "test-addon", key: "pommel", label: "Pommel", kind: "melee",
      applies: (item) => item.system.pommel === true,
      mode: (_item, _actor, h) => ({ skillName: "Broadsword", skillLevel: (h.skillLevel("Broadsword") ?? 10) - 1, damage: "1d", damageType: "cr" }),
    });
    const sword = { id: "s1", name: "Sword", system: { pommel: true } };
    const rows = api.derivedAttackRows("melee", [sword, { id: "k", name: "Knife", system: {} }], {}, { skillLevel: () => 14 }, { reach: "C", usable: true });
    expect(rows).toEqual([{ reach: "C", usable: true, itemId: "s1", modeIndex: -1, name: "Sword", mode: "Pommel", skillName: "Broadsword", skillLevel: 13, damage: "1d", damageType: "cr", derivedMode: "test-addon.pommel" }]);
    expect(api.derivedAttackRows("ranged", [sword], {}, { skillLevel: () => 14 }, {})).toEqual([]);
    expect(sword.system).toEqual({ pommel: true });
  });
});

describe("grapple actions", () => {
  it("offers an action to the end of the grapple it applies to, and runs it with the foe", async () => {
    const api = await load();
    const run = vi.fn();
    api.registerGrappleAction({ module: "test-addon", key: "twist", label: "Twist", applies: (g) => g.holding, run });
    const held = { holding: true, pinned: false, hands: 2, hitLocation: "arm", foe: "Actor.foe" };
    expect(api.grappleActionsFor({}, held)).toEqual([{ id: "test-addon.twist", label: "Twist" }]);
    expect(api.grappleActionsFor({}, { ...held, holding: false })).toEqual([]);
    expect(api.grappleActionsFor({}, null)).toEqual([]);
    globals.fromUuid = async () => ({ name: "Foe" });
    const grappler = actor();
    await api.runGrappleAction(grappler, "test-addon.twist", held);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ actor: grappler, foe: { name: "Foe" } }));
    delete globals.fromUuid;
  });
});

describe("conditions", () => {
  const hooks = (systemIds: string[] = []) => ({
    setSystemCondition: vi.fn(async () => {}),
    systemConditionLabel: (id: string) => (systemIds.includes(id) ? `System ${id}` : null),
  });

  it("applies a module's condition with its modifiers and a duration, and replaces it when applied again", async () => {
    const api = await load();
    const target = actor();
    const h = hooks();
    expect(await api.applyCondition(target, { module: "test-addon", key: "shaken", label: "Shaken", effects: { modifiers: [{ label: "", value: -2, rolls: ["attack"] }] }, duration: { turns: 2 } }, h)).toBe("test-addon.shaken");
    expect(api.conditionModifiers(target, "attack")).toEqual([{ label: "Shaken", value: -2 }]);
    expect(api.conditionModifiers(target, "skill")).toEqual([]);
    await api.applyCondition(target, { module: "test-addon", key: "shaken", label: "Shaken", duration: { seconds: 30 } }, h);
    expect(api.activeConditions(target)).toEqual([expect.objectContaining({ id: "test-addon.shaken", turnsLeft: null, untilTime: 1030 })]);
  });

  it("sets and clears a system condition alongside, and refuses an id that isn't one", async () => {
    const api = await load();
    const target = actor();
    const h = hooks(["stunned"]);
    expect(await api.applyCondition(target, { key: "stunned", duration: { turns: 1 } }, h)).toBe("stunned");
    expect(h.setSystemCondition).toHaveBeenCalledWith(target, "stunned", true);
    expect(api.activeConditions(target)[0]!.label).toBe("System stunned");
    expect(await api.applyCondition(target, { key: "made-up" }, h)).toBeNull();
    await api.removeCondition(target, "stunned", h);
    expect(h.setSystemCondition).toHaveBeenCalledWith(target, "stunned", false);
    expect(api.activeConditions(target)).toEqual([]);
  });

  it("ends a condition when its turns, round or time run out", async () => {
    const api = await load();
    const base = { label: "X", modifiers: [], system: false };
    const conditions = [
      { ...base, id: "turns", turnsLeft: 1, untilRound: null, untilTime: null },
      { ...base, id: "round", turnsLeft: null, untilRound: 3, untilTime: null },
      { ...base, id: "time", turnsLeft: null, untilRound: null, untilTime: 1060 },
      { ...base, id: "long", turnsLeft: 3, untilRound: null, untilTime: null },
    ];
    const atTurn = api.expiringConditions(conditions, { ownTurnStarted: true, round: 2 });
    expect(atTurn.ended.map((c) => c.id)).toEqual(["turns"]);
    expect(atTurn.kept.find((c) => c.id === "long")?.turnsLeft).toBe(2);
    expect(api.expiringConditions(conditions, { round: 3 }).ended.map((c) => c.id)).toEqual(["round"]);
    expect(api.expiringConditions(conditions, { time: 1060 }).ended.map((c) => c.id)).toEqual(["time"]);
  });
});

describe("bleeding and technique defaults", () => {
  it("lets a listener change the bleeding interval and modifier", async () => {
    const api = await load();
    expect(api.bleedingSchedule({}, -1)).toEqual({ intervalSeconds: 60, modifier: -1 });
    globals.Hooks = { callAll: (_h: string, c: any) => { c.intervalSeconds = 10; c.modifier -= 2; } };
    expect(api.bleedingSchedule({}, -1)).toEqual({ intervalSeconds: 10, modifier: -3 });
  });

  it("adds a listener's alternative defaults, and drops malformed ones", async () => {
    const api = await load();
    globals.Hooks = { callAll: (_h: string, c: any) => { c.defaults.push({ from: "skill", skill: "Brawling", modifier: -1 }, { from: "skill" }); } };
    expect(api.techniqueDefaultsWithHooks({}, {}, [{ from: "skill", skill: "Karate", modifier: -2 }])).toEqual([
      { from: "skill", skill: "Karate", modifier: -2 },
      { from: "skill", skill: "Brawling", modifier: -1 },
    ]);
  });
});
