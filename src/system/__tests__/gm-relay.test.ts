import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dosing, injuring and conditioning an actor the user doesn't own, through the
 * GM's client (sargas79/GWorldVTT#807).
 *
 * The effects themselves are stood in for: what is tested is who makes them,
 * and where. Each stand-in refuses an actor this client doesn't own, as the
 * real ones do.
 */

const made: Array<{ action: string; actor: any; args: any }> = [];

function refusing<T>(action: string, result: T, refused: T) {
  return vi.fn(async (actor: any, args: any) => {
    if (!actor?.isOwner) return refused;
    made.push({ action, actor, args });
    return result;
  });
}

const dose = { id: "dose1", name: "Nerve gas" };
const outcome = { kind: "nonlethal", stunned: true };

const doPoison = refusing("dosePoison", dose, null);
const doCycle = refusing("advancePoison", 3, 0);
const doStop = refusing("stopBleeding", undefined, undefined);
const doApply = refusing("applyCondition", "stunned", null);
const doRemove = refusing("removeCondition", undefined, undefined);
const doShock = refusing("shock", outcome, null);

vi.mock("../poison.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dosePoison: vi.fn((o: any) => doPoison(o.actor, { poison: o.poison, doublings: o.doublings })),
  advancePoison: vi.fn((o: any) => doCycle(o.actor, { id: o.id })),
}));
vi.mock("../bleeding.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  stopBleeding: vi.fn((actor: any) => doStop(actor, {})),
}));
vi.mock("../hazards.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  shock: vi.fn(({ actor, ...rest }: any) => doShock(actor, rest)),
}));
vi.mock("../procedure-extensions.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  applyCondition: vi.fn((actor: any, application: any) => doApply(actor, { application })),
  removeCondition: vi.fn((actor: any, id: string) => doRemove(actor, { id })),
}));

import { EFFECT_QUERY, answerEffectQuery, registerEffectQuery } from "../gm-relay.js";
import { createApi } from "../api.js";

const globals = globalThis as Record<string, unknown>;

const PLAYER = { id: "player", isGM: false };
const STRANGER = { id: "stranger", isGM: false };
const GM = { id: "gm", isGM: true };

/** An actor owned by the users listed, and on this client by the current user if they are among them. */
function actor(uuid: string, owners: string[] = []) {
  return {
    uuid,
    name: uuid,
    documentName: "Actor",
    get isOwner() {
      const user = (globals.game as any)?.user;
      return user?.isGM === true || owners.includes(user?.id);
    },
    testUserPermission: (user: any, level: string) => level === "OWNER" && (user?.isGM === true || owners.includes(user?.id)),
  };
}

const notes: string[] = [];
let documents: Map<string, any>;

beforeEach(() => {
  made.length = 0;
  notes.length = 0;
  documents = new Map();
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` },
    user: PLAYER,
    users: { activeGM: null },
  };
  globals.ui = { notifications: { info: vi.fn(), warn: (text: string) => notes.push(text) } };
  globals.fromUuid = vi.fn(async (uuid: string) => documents.get(uuid) ?? null);
});

afterEach(() => {
  for (const key of ["game", "ui", "CONFIG", "fromUuid"]) delete globals[key];
});

/** A GM's client that answers the query as the real one would, for the user who sent it. */
function connectGm(sender: any = PLAYER) {
  const query = vi.fn(async (name: string, data: unknown) => {
    expect(name).toBe(EFFECT_QUERY);
    // The GM's client, answering: it is the GM there.
    const game = globals.game as any;
    const caller = game.user;
    game.user = GM;
    try {
      // Through JSON, as a socket carries it.
      return await answerEffectQuery(JSON.parse(JSON.stringify(data)), { user: sender });
    } finally {
      game.user = caller;
    }
  });
  (globals.game as any).users.activeGM = { isSelf: false, query };
  return query;
}

/** The six calls, each on the given target from the given source. */
function everyCall(api: ReturnType<typeof createApi>, target: any, source?: any) {
  return {
    dosePoison: () => api.actors.dosePoison(target, { name: "Nerve gas" } as any, { doublings: 1, ...(source ? { source } : {}) }),
    advancePoison: () => api.actors.advancePoison(target, "dose1", source ? { source } : {}),
    stopBleeding: () => api.actors.stopBleeding(target, source ? { source } : {}),
    applyCondition: () => api.actors.applyCondition(target, { key: "stunned" }, source ? { source } : {}),
    removeCondition: () => api.actors.removeCondition(target, "stunned", source ? { source } : {}),
    shock: () => api.hazards.shock({ actor: target, kind: "nonlethal", modifier: 0, continuous: false, formula: "", metalArmor: false, ...(source ? { sourceActor: source } : {}) }),
  };
}

const EXPECTED = { dosePoison: dose, advancePoison: 3, stopBleeding: undefined, applyCondition: "stunned", removeCondition: undefined, shock: outcome };
const REFUSED = { dosePoison: null, advancePoison: 0, stopBleeding: undefined, applyCondition: null, removeCondition: undefined, shock: null };

describe("a player's effect on an actor only the GM owns (API 1.149.0)", () => {
  it("reaches it through the GM's client, from a source the player owns, with the same results", async () => {
    const api = createApi();
    const foe = actor("Actor.foe");
    const mine = actor("Actor.mine", ["player"]);
    documents.set(foe.uuid, foe).set(mine.uuid, mine);
    const query = connectGm();
    for (const [action, call] of Object.entries(everyCall(api, foe, mine))) {
      made.length = 0;
      expect(await call(), action).toEqual(EXPECTED[action as keyof typeof EXPECTED]);
      expect(made.map((m) => m.action), action).toEqual([action]);
      expect(made[0].actor, action).toBe(foe);
    }
    expect(query).toHaveBeenCalledTimes(6);
    expect(query).toHaveBeenCalledWith(EFFECT_QUERY, { action: "dosePoison", actorUuid: "Actor.foe", sourceUuid: "Actor.mine", args: { poison: { name: "Nerve gas" }, doublings: 1 } }, expect.anything());
    // The shock goes without its actors: the GM's client finds them itself.
    const shockCall = query.mock.calls.find((c: any[]) => c[1].action === "shock") as any[];
    expect(shockCall[1].args.options).toEqual({ kind: "nonlethal", modifier: 0, continuous: false, formula: "", metalArmor: false });
  });

  it("takes a token as the source, for its actor", async () => {
    const api = createApi();
    const foe = actor("Actor.foe");
    const mine = actor("Actor.mine", ["player"]);
    documents.set(foe.uuid, foe).set(mine.uuid, mine);
    const query = connectGm();
    expect(await api.actors.applyCondition(foe, { key: "stunned" }, { source: { documentName: "Token", actor: mine } })).toBe("stunned");
    expect(query.mock.calls[0][1]).toMatchObject({ sourceUuid: "Actor.mine" });
  });

  it("is refused without a source the player owns, and the GM is never asked", async () => {
    const api = createApi();
    const foe = actor("Actor.foe");
    const theirs = actor("Actor.theirs", ["stranger"]);
    const query = connectGm();
    for (const source of [undefined, theirs]) {
      for (const [action, call] of Object.entries(everyCall(api, foe, source))) {
        expect(await call(), action).toEqual(REFUSED[action as keyof typeof REFUSED]);
      }
    }
    expect(query).not.toHaveBeenCalled();
    expect(made).toHaveLength(0);
  });

  it("returns what a refusal returns, and tells the player, with no GM connected", async () => {
    const api = createApi();
    const foe = actor("Actor.foe");
    const mine = actor("Actor.mine", ["player"]);
    for (const [action, call] of Object.entries(everyCall(api, foe, mine))) {
      expect(await call(), action).toEqual(REFUSED[action as keyof typeof REFUSED]);
    }
    expect(notes).toHaveLength(6);
    expect(notes.every((n) => n.startsWith("GWORLD.Chat.NoGmToApply"))).toBe(true);
    // Nor when this client is the GM's own, or it can't answer in time.
    (globals.game as any).users.activeGM = { isSelf: true, query: vi.fn() };
    expect(await api.actors.dosePoison(foe, { name: "Nerve gas" } as any, { source: mine })).toBeNull();
    (globals.game as any).users.activeGM = { isSelf: false, query: vi.fn(async () => { throw new Error("timed out"); }) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await api.actors.advancePoison(foe, "dose1", { source: mine })).toBe(0);
    warn.mockRestore();
  });
});

describe("an owner's or a GM's effect, as before", () => {
  it("is made on the caller's own client for the actor's owner, source or none", async () => {
    const api = createApi();
    const mine = actor("Actor.mine", ["player"]);
    const query = connectGm();
    for (const source of [undefined, actor("Actor.theirs", ["stranger"])]) {
      for (const [action, call] of Object.entries(everyCall(api, mine, source))) {
        expect(await call(), action).toEqual(EXPECTED[action as keyof typeof EXPECTED]);
      }
    }
    expect(made).toHaveLength(12);
    expect(query).not.toHaveBeenCalled();
  });

  it("is made on the GM's own client for a GM caller", async () => {
    const api = createApi();
    (globals.game as any).user = GM;
    const foe = actor("Actor.foe");
    const query = connectGm(GM);
    for (const [action, call] of Object.entries(everyCall(api, foe))) {
      expect(await call(), action).toEqual(EXPECTED[action as keyof typeof EXPECTED]);
    }
    expect(made).toHaveLength(6);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("the GM's side of the query", () => {
  function request(overrides: Record<string, unknown> = {}) {
    return { action: "applyCondition", actorUuid: "Actor.foe", sourceUuid: "Actor.mine", args: { application: { key: "stunned" } }, ...overrides };
  }

  beforeEach(() => {
    (globals.game as any).user = GM;
    documents.set("Actor.foe", actor("Actor.foe")).set("Actor.mine", actor("Actor.mine", ["player"])).set("Actor.theirs", actor("Actor.theirs", ["stranger"]));
  });

  it("is registered in CONFIG.queries", () => {
    globals.CONFIG = { queries: {} };
    registerEffectQuery();
    expect((globals.CONFIG as any).queries[EFFECT_QUERY]).toBe(answerEffectQuery);
  });

  it("acts for a GM, the target's owner, or the owner of the source named", async () => {
    expect(await answerEffectQuery(request({ sourceUuid: "" }), { user: GM })).toBe("stunned");
    documents.set("Actor.foe", actor("Actor.foe", ["stranger"]));
    expect(await answerEffectQuery(request({ sourceUuid: "" }), { user: STRANGER })).toBe("stunned");
    expect(await answerEffectQuery(request(), { user: PLAYER })).toBe("stunned");
    // Nothing to return is sent as null.
    expect(await answerEffectQuery(request({ action: "stopBleeding", args: {} }), { user: PLAYER })).toBeNull();
    expect(made.map((m) => m.action)).toEqual(["applyCondition", "applyCondition", "applyCondition", "stopBleeding"]);
  });

  it("refuses a sender who owns neither, whatever the payload claims", async () => {
    expect(await answerEffectQuery(request(), { user: STRANGER })).toBeNull();
    expect(await answerEffectQuery(request({ sourceUuid: "" }), { user: PLAYER })).toBeNull();
    expect(await answerEffectQuery(request({ sourceUuid: "Actor.theirs" }), { user: PLAYER })).toBeNull();
    expect(await answerEffectQuery(request(), {})).toBeNull();
    // A source that isn't an actor is no reason to act.
    documents.set("Item.sword", { ...actor("Item.sword", ["player"]), documentName: "Item" });
    expect(await answerEffectQuery(request({ sourceUuid: "Item.sword" }), { user: PLAYER })).toBeNull();
    expect(made).toHaveLength(0);
  });

  it("makes only the effects it knows, on an actor, with arguments of the right shape", async () => {
    expect(await answerEffectQuery(request({ action: "applyInjury" }), { user: GM })).toBeNull();
    expect(await answerEffectQuery(request({ action: "toString" }), { user: GM })).toBeNull();
    expect(await answerEffectQuery(request({ actorUuid: "Actor.nobody" }), { user: GM })).toBeNull();
    documents.set("Item.sword", { ...actor("Item.sword"), documentName: "Item" });
    expect(await answerEffectQuery(request({ actorUuid: "Item.sword" }), { user: GM })).toBeNull();
    expect(await answerEffectQuery(request({ action: "dosePoison", args: { poison: "gas" } }), { user: GM })).toBeNull();
    expect(await answerEffectQuery(request({ action: "advancePoison", args: {} }), { user: GM })).toBeNull();
    expect(await answerEffectQuery(null, { user: GM })).toBeNull();
    expect(made).toHaveLength(0);
  });
});
