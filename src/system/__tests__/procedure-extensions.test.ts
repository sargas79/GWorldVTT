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

  it("hands a mode the item's own rows and ST-based damage, where the sheet gives them (since 1.21.0)", async () => {
    const api = await load();
    api.registerDerivedAttackMode({
      module: "test-addon",
      key: "slash",
      label: "Slash",
      kind: "melee",
      applies: () => true,
      mode: (item, _actor, h) => {
        const thrust = h.rows?.(item).melee.find((row) => row.damageType === "imp");
        return thrust ? { skillName: thrust.skillName, skillLevel: thrust.skillLevel, damage: `${String(thrust.damage)}-2`, damageType: "cut", reach: h.damage?.("thr", -2) } : null;
      },
    });
    const rapier = { id: "r", name: "Rapier", system: {} };
    const helpers = {
      skillLevel: () => 14,
      rows: () => ({ melee: [{ skillName: "Rapier", skillLevel: 14, damage: "1d+1", damageType: "imp" }], ranged: [] }),
      damage: (base: string, modifier: number) => `${base}${modifier}`,
    };
    expect(api.derivedAttackRows("melee", [rapier], {}, helpers, {})).toEqual([
      expect.objectContaining({ mode: "Slash", skillLevel: 14, damage: "1d+1-2", damageType: "cut", reach: "thr-2", derivedMode: "test-addon.slash" }),
    ]);
  });
});

describe("grapple moves (since 1.23.0)", () => {
  it("takes a listener's refusal of a move, and nothing without one", async () => {
    const api = await load();
    expect(api.grappleMoveRefusal({}, {}, "takedown")).toBeNull();
    globals.Hooks = { callAll: (_event: string, context: any) => { if (context.move === "takedown") context.refusal = "Not twice in a row"; } };
    expect(api.grappleMoveRefusal({}, {}, "takedown")).toBe("Not twice in a row");
    expect(api.grappleMoveRefusal({}, {}, "pin")).toBeNull();
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

  /** A stun held while a current flows, then its seconds after (sargas79/GWorldVTT#653). */
  it("withholds recovery rolls for some seconds, to a world time, or until removed", async () => {
    const api = await load();
    const target = actor();
    const h = hooks(["stunned", "unconscious"]);
    await api.applyCondition(target, { key: "stunned", holdRecovery: { seconds: 7 } }, h);
    expect(api.activeConditions(target)[0]).toEqual(expect.objectContaining({ id: "stunned", untilTime: null, recoveryHeld: { until: 1007 } }));
    expect(api.recoveryHold(target, "stunned", 1006)).toEqual({ until: 1007 });
    expect(api.recoveryHold(target, "stunned", 1007)).toBeNull();
    expect(api.recoveryHold(target, "unconscious", 1000)).toBeNull();

    await api.applyCondition(target, { key: "stunned", holdRecovery: true }, h);
    expect(api.recoveryHold(target, "stunned", 99999)).toEqual({ until: null });
    await api.applyCondition(target, { key: "stunned", holdRecovery: { until: 1030 } }, h);
    expect(api.recoveryHold(target, "stunned", 1020)).toEqual({ until: 1030 });
    // Applied again without it, or with a time already past: rolls at once.
    await api.applyCondition(target, { key: "stunned", holdRecovery: { until: 900 } }, h);
    expect(api.recoveryHold(target, "stunned", 1000)).toBeNull();
    expect(api.activeConditions(target)[0]).not.toHaveProperty("recoveryHeld");

    await api.applyCondition(target, { key: "stunned", holdRecovery: true }, h);
    await api.forgetSystemCondition(target, "stunned");
    expect(api.recoveryHold(target, "stunned", 1000)).toBeNull();
    expect(api.activeConditions(target)).toEqual([]);
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

/** Feint extension points (sargas79/GWorldVTT#292). */
describe("a feint's result", () => {
  it("is recorded unless a listener takes it over", async () => {
    const api = await load();
    expect(api.feintResultRecorded({ feinter: {}, foe: {}, result: { success: true } })).toBe(true);
    globals.Hooks = { callAll: (event: string, context: any) => { if (event === "gworld.feintResult") context.record = false; } };
    expect(api.feintResultRecorded({ feinter: {}, foe: {}, result: { success: true } })).toBe(false);
  });

  it("lets a contest resolver propose a feint's scores", async () => {
    const api = await load();
    api.registerContestResolver({
      module: "test-addon", key: "ruse", label: "Ruse",
      applies: (context) => (context.tags ?? []).includes("feint"),
      resolve: () => ({ first: { base: 13, note: "IQ" } }),
    });
    const scores = api.resolveContestScores({ label: "Feint", first: { actor: {}, base: 15 }, second: { actor: {}, base: 12 }, tags: ["feint"] });
    expect(scores.first).toEqual({ base: 13, note: "IQ" });
    expect(scores.second).toEqual({ base: 12 });
  });
});

describe("self derived modes (since 1.35.0)", () => {
  it("works a self mode out once per character, with no item", async () => {
    const api = await load();
    let calls = 0;
    api.registerDerivedAttackMode({
      module: "test-addon",
      key: "nip",
      label: "Nip",
      kind: "melee",
      self: true,
      applies: (item: unknown) => item === null,
      mode: () => { calls += 1; return { skillName: "DX", skillLevel: 10, damage: "1d-2", damageType: "cr", naturalKey: "bite" }; },
    } as never);
    const rows = api.derivedAttackRows("melee", [{ id: "s", name: "Sword", system: {} }, { id: "k", name: "Knife", system: {} }], {}, { skillLevel: () => 10 }, { reach: "C" });
    expect(calls).toBe(1);
    expect(rows).toEqual([expect.objectContaining({ itemId: "", name: "Nip", mode: "Nip", naturalKey: "bite", natural: true, derivedMode: "test-addon.nip" })]);
  });

  it("lets a grapple move listener waive the pin's requirements", async () => {
    const api = await load();
    globals.Hooks = { callAll: (_event: string, context: any) => { if (context.move === "pin") context.waiveRequirements = true; } };
    expect(api.grappleMoveRules({}, {}, "pin")).toEqual({ refusal: null, waiveRequirements: true });
    expect(api.grappleMoveRules({}, {}, "takedown")).toEqual({ refusal: null, waiveRequirements: false });
  });
});

describe("First Aid rules (since 1.36.0)", () => {
  it("passes a listener's refusal and whether a bandage stops the bleeding", async () => {
    const api = await load();
    expect(api.firstAidRules({}, {})).toEqual({ refusal: null, stopsBleeding: true, techLevel: 3 });
    globals.Hooks = { callAll: (_event: string, context: any) => { context.stopsBleeding = false; context.refusal = " Needs surgery "; } };
    expect(api.firstAidRules({}, {})).toEqual({ refusal: "Needs surgery", stopsBleeding: false, techLevel: 3 });
  });
});

describe("Quick Contest results (since 1.37.0)", () => {
  it("tells a listener both sides, the tags and who won", async () => {
    const api = await load();
    const heard: any[] = [];
    globals.Hooks = { callAll: (event: string, context: any) => { heard.push([event, context]); } };
    const tags = ["quickContest", "evade"];
    api.afterQuickContest({
      label: "Evade",
      tags,
      first: { actor: { name: "mover" }, base: 12, effective: 10, outcome: { success: true, margin: 2 } },
      second: { actor: { name: "foe" }, base: 11, effective: 11, outcome: { success: false, margin: 1 } },
      outcome: "first",
      marginOfVictory: 3,
    });
    expect(heard).toHaveLength(1);
    expect(heard[0][0]).toBe("gworld.afterQuickContest");
    expect(heard[0][1]).toMatchObject({ label: "Evade", tags: ["quickContest", "evade"], outcome: "first", marginOfVictory: 3, second: { effective: 11 } });
    heard[0][1].tags.push("changed");
    expect(tags).toEqual(["quickContest", "evade"]);
  });
});
