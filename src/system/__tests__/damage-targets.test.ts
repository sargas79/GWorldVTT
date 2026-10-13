import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => false }));

import { attackTargetsFor, rollDamage } from "../roll.js";
import { damageRecipients, recordableTargets, recordedTargetsOf, shownTargetName } from "../targets.js";

const globals = globalThis as Record<string, unknown>;
const created: any[] = [];

/** A token on the canvas, as `game.user.targets` holds it. */
function token(id: string, name: string, actorName = name) {
  const actor = { name: actorName, uuid: `Actor.${id}` };
  const document = { uuid: `Scene.s.Token.${id}`, name, actor };
  return { actor, document, name };
}

const bandit = token("bandit", "Bandit", "Bandit (template)");
const guard = token("guard", "Guard");

beforeEach(() => {
  created.length = 0;
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) }, user: { targets: new Set() } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { applications: { handlebars: { renderTemplate: async () => "" } } };
  globals.ChatMessage = { implementation: { getSpeaker: () => ({}), create: vi.fn(async (data: unknown) => created.push(data)) } };
  globals.Roll = class {
    total = 4;
    constructor(public formula: string) {}
    async evaluate() { return this; }
  };
  const byUuid = new Map([bandit, guard].map((t) => [t.document.uuid, t.document]));
  globals.fromUuid = async (uuid: string) => byUuid.get(uuid) ?? null;
  globals.canvas = { tokens: { controlled: [] } };
});

afterEach(() => {
  for (const key of ["game", "ui", "CONST", "foundry", "ChatMessage", "Roll", "Hooks", "fromUuid", "canvas"]) delete globals[key];
  vi.restoreAllMocks();
});

const target = (...tokens: unknown[]) => { (globals.game as any).user.targets = new Set(tokens); };

/** The damage card applies to the attack's target, not the GM's (sargas79/GWorldVTT#980). */
describe("who a damage card is for", () => {
  it("records the targeted tokens by token, under the token's own name", () => {
    target(bandit);
    expect(recordableTargets()).toEqual([{ tokenUuid: "Scene.s.Token.bandit", name: "Bandit" }]);
  });

  it("keeps the roller's targets on the card", async () => {
    target(bandit);
    await rollDamage({ actor: { name: "A" }, label: "Sword", formula: "1d", damageType: "cut", distanceYards: null });
    expect(created[0].flags.gworld.damage.targets).toEqual([{ tokenUuid: "Scene.s.Token.bandit", name: "Bandit" }]);
  });

  it("keeps the attack's targets over whatever is targeted when the damage is rolled", async () => {
    target(guard);
    await rollDamage({
      actor: { name: "A" }, label: "Sword", formula: "1d", damageType: "cut", distanceYards: null,
      targets: [{ tokenUuid: "Scene.s.Token.bandit", name: "Bandit" }],
    });
    expect(created[0].flags.gworld.damage.targets).toEqual([{ tokenUuid: "Scene.s.Token.bandit", name: "Bandit" }]);
  });

  it("records nothing for a roll with no target", async () => {
    await rollDamage({ actor: { name: "A" }, label: "Sword", formula: "1d", damageType: "cut", distanceYards: null });
    expect(created[0].flags.gworld.damage.targets).toBeUndefined();
  });

  it("reads a row's attack targets back for that row only", () => {
    const stored = { row: "sword||0", targets: [{ tokenUuid: "Scene.s.Token.bandit", name: "Bandit" }] };
    const actor = { getFlag: () => stored };
    expect(attackTargetsFor(actor, "sword||0")).toEqual(stored.targets);
    expect(attackTargetsFor(actor, "bow||0")).toBeNull();
    expect(attackTargetsFor({ getFlag: () => undefined }, "sword||0")).toBeNull();
  });

  it("drops anything stored that is not a target", () => {
    expect(recordedTargetsOf([{ tokenUuid: "T.1", name: "One" }, { name: "no uuid" }, null, { tokenUuid: "" }])).toEqual([{ tokenUuid: "T.1", name: "One" }]);
    expect(recordedTargetsOf(undefined)).toEqual([]);
  });

  it("applies to the recorded token, not to the presser's targets", async () => {
    target(guard);
    const found = await damageRecipients([{ tokenUuid: "Scene.s.Token.bandit", name: "Bandit" }], false);
    expect(found).toEqual([bandit.document]);
  });

  it("applies to the presser's targets when asked to", async () => {
    target(guard);
    expect(await damageRecipients([{ tokenUuid: "Scene.s.Token.bandit", name: "Bandit" }], true)).toEqual([guard]);
  });

  it("falls back to the presser's targets for a card that recorded none, or whose token is gone", async () => {
    target(guard);
    expect(await damageRecipients([], false)).toEqual([guard]);
    expect(await damageRecipients([{ tokenUuid: "Scene.s.Token.deleted", name: "Gone" }], false)).toEqual([guard]);
  });
});

/** The attack card names its target to the whole table (sargas79/GWorldVTT#981). */
describe("a target's name as the card shows it", () => {
  const recorded = { tokenUuid: "Scene.s.Token.orc", name: "Orc" };
  const seen = (tokenDoc: unknown, isGM = false) => {
    (globals.game as any).user.isGM = isGM;
    globals.fromUuidSync = () => tokenDoc;
  };
  afterEach(() => { delete globals.fromUuidSync; });

  it("shows the GM every name", () => {
    seen({ name: "Orc", displayName: 0, isOwner: false }, true);
    expect(shownTargetName(recorded)).toBe("Orc");
  });

  it("shows a token's owner its name", () => {
    seen({ name: "Orc", displayName: 0, isOwner: true });
    expect(shownTargetName(recorded)).toBe("Orc");
  });

  it("shows anybody a name the token shows on hover or always", () => {
    seen({ name: "Orc", displayName: 30, isOwner: false });
    expect(shownTargetName(recorded)).toBe("Orc");
    seen({ name: "Orc", displayName: 50, isOwner: false });
    expect(shownTargetName(recorded)).toBe("Orc");
  });

  it("keeps a name the canvas hides, and a hidden token's", () => {
    seen({ name: "Orc", displayName: 20, isOwner: false });
    expect(shownTargetName(recorded)).toBeNull();
    seen({ name: "Orc", displayName: 50, isOwner: false, hidden: true });
    expect(shownTargetName(recorded)).toBeNull();
  });

  it("keeps the recorded name for a token gone from the scene", () => {
    seen(null);
    expect(shownTargetName(recorded)).toBe("Orc");
  });
});
