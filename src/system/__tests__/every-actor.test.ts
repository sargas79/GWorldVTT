import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { everyActor } from "../every-actor.js";

const globals = globalThis as Record<string, unknown>;

/** An actor whose conditions live in a plain flag store. */
function actor(id: string, conditions: unknown[] = []) {
  const store: Record<string, unknown> = { timedConditions: conditions };
  return {
    id,
    isOwner: true,
    getFlag: (_scope: string, key: string) => store[key],
    setFlag: vi.fn(async (_scope: string, key: string, value: unknown) => { store[key] = value; }),
    store,
  };
}

/** A timed condition that runs out at world time 1010. */
const timed = () => [{ id: "stunned", label: "Stunned", modifiers: [], turnsLeft: null, untilRound: null, untilTime: 1010, system: true }];

afterEach(() => {
  delete globals.game;
  delete globals.Hooks;
});

/** Timed conditions on unlinked tokens never expire (sargas79/GWorldVTT#651). */
describe("everyActor", () => {
  it("finds the directory's actors, unlinked tokens' actors on every scene, and combatants', once each", () => {
    const hero = actor("hero");
    const orc = actor("orc");
    const goblin = actor("goblin");
    const straggler = actor("straggler");
    globals.game = {
      actors: [hero],
      scenes: [
        { tokens: [{ actorLink: true, actor: hero }, { actorLink: false, actor: orc }] },
        { tokens: [{ actorLink: false, actor: goblin }, { actorLink: false, actor: null }] },
      ],
      combats: [{ combatants: [{ actor: orc }, { actor: straggler }, { actor: hero }] }],
    };
    expect(everyActor()).toEqual([hero, orc, goblin, straggler]);
  });

  it("copes with a game that has no scenes or combats yet", () => {
    globals.game = { actors: [actor("hero")] };
    expect(everyActor()).toHaveLength(1);
    delete globals.game;
    expect(everyActor()).toEqual([]);
  });
});

describe("the world-time expiry of timed conditions", () => {
  let handlers: Record<string, (...args: any[]) => void>;

  beforeEach(() => {
    handlers = {};
    globals.Hooks = { on: (name: string, fn: (...args: any[]) => void) => { handlers[name] = fn; }, callAll: () => {} };
  });

  async function register() {
    vi.resetModules();
    const { registerProcedureHooks } = await import("../procedure-extensions.js");
    const setSystemCondition = vi.fn(async () => {});
    registerProcedureHooks(setSystemCondition);
    return setSystemCondition;
  }

  it("ends a timed condition on an unlinked token's actor, and on a linked one once", async () => {
    const linked = actor("hero", timed());
    const unlinked = actor("orc", timed());
    globals.game = {
      user: { isGM: true },
      time: { worldTime: 1000 },
      actors: [linked],
      scenes: [{ tokens: [{ actorLink: true, actor: linked }, { actorLink: false, actor: unlinked }] }],
    };
    const setSystemCondition = await register();

    handlers.updateWorldTime!(1005);
    await Promise.resolve();
    expect(unlinked.store.timedConditions).toHaveLength(1);

    handlers.updateWorldTime!(1010);
    await vi.waitFor(() => expect(setSystemCondition).toHaveBeenCalledTimes(2));
    expect(unlinked.store.timedConditions).toEqual([]);
    expect(linked.store.timedConditions).toEqual([]);
    expect(linked.setFlag).toHaveBeenCalledTimes(1);
    expect(setSystemCondition).toHaveBeenCalledWith(unlinked, "stunned", false);
    expect(setSystemCondition).toHaveBeenCalledWith(linked, "stunned", false);
  });

  it("leaves it to the GM", async () => {
    const unlinked = actor("orc", timed());
    globals.game = { user: { isGM: false }, actors: [], scenes: [{ tokens: [{ actorLink: false, actor: unlinked }] }] };
    await register();
    handlers.updateWorldTime!(2000);
    await Promise.resolve();
    expect(unlinked.setFlag).not.toHaveBeenCalled();
  });
});
