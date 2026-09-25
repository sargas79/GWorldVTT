import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const relayed: Array<{ action: string; actor: any; source: any; args: any }> = [];
vi.mock("../gm-relay.js", () => ({
  relayEffect: vi.fn(async (action: string, actor: any, source: any, args: any) => {
    relayed.push({ action, actor, source, args });
    return `gworld.${args.application.key}`;
  }),
}));
vi.mock("../roll.js", () => ({ rollDamage: vi.fn(async () => 20) }));
vi.mock("../optional-rules.js", () => ({ isRuleOn: () => true }));

import { FLINCH_PENALTY, liquidDefended, liquidEffects } from "../../rules/dirty-tricks.js";
import { splashInTheFace } from "../gunplay.js";
import { detonateCharge, structureMultiplierOf } from "../demolition.js";

/**
 * Liquids in the face for a module's weapon (Campaigns p. 405;
 * sargas79/GWorldVTT#834), and a charge's multiplier against the structure
 * it is set on (#835; API 1.155.0).
 */

const globals = globalThis as Record<string, unknown>;
let dice: number[] = [];
const cards: any[] = [];

beforeEach(() => {
  relayed.length = 0;
  cards.length = 0;
  dice = [];
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` } };
  globals.Roll = class {
    total = 0;
    dice: any[] = [];
    constructor(public formula: string) {}
    async evaluate() {
      this.total = dice.shift() ?? 10;
      this.dice = [{ results: [{ result: this.total }] }];
      return this;
    }
  };
  globals.foundry = { applications: { handlebars: { renderTemplate: vi.fn(async (_path: string, context: any) => { cards.push(context); return ""; }) } } };
  globals.ChatMessage = { implementation: { create: vi.fn(), getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
});

afterEach(() => {
  for (const key of ["game", "Roll", "foundry", "ChatMessage", "CONST", "ui"]) delete globals[key];
});

describe("what a splash leaves behind (p. 405)", () => {
  it("stops at any defense but a parry", () => {
    expect(["none", "dodge", "block", "parry"].map(liquidDefended)).toEqual([false, true, true, false]);
  });

  it("is a flinch at -2 to defenses until the victim's turn, and to DX and the senses through it", () => {
    const effects = liquidEffects({ blinded: false, blindSeconds: 0, flinched: true, defended: false });
    expect(effects).toEqual([
      { key: "flinchDefense", turns: 1, seconds: 1, rolls: ["defense"], value: FLINCH_PENALTY },
      { key: "flinchNextTurn", turns: 2, seconds: 2, rolls: ["DX", "vision", "hearing", "tasteSmell", "touch"], value: FLINCH_PENALTY },
    ]);
    expect(FLINCH_PENALTY).toBe(-2);
  });

  it("is blindness for its seconds on a critical hit, and nothing for a victim who kept composure", () => {
    expect(liquidEffects({ blinded: true, blindSeconds: 4, flinched: false, defended: false })).toEqual([
      { key: "blinded", turns: null, seconds: 4, rolls: [], value: 0 },
    ]);
    expect(liquidEffects({ blinded: false, blindSeconds: 0, flinched: false, defended: false })).toEqual([]);
  });
});

describe("combat.liquidInTheFace's procedure", () => {
  const thrower = { name: "Thrower" };
  const victim = { name: "Victim", system: { derived: { will: 10 } } };

  it("rolls Will and leaves the flinch on the victim, through the GM for the thrower", async () => {
    dice = [14];
    const outcome = await splashInTheFace({ actor: thrower, victim, hit: true, criticalHit: false, defense: "parry", liquid: "Beer", apply: true });
    expect(outcome).toMatchObject({ flinched: true, defended: false, will: 10, conditions: ["gworld.splash-flinchDefense", "gworld.splash-flinchNextTurn"] });
    expect(relayed.map((r) => r.action)).toEqual(["applyCondition", "applyCondition"]);
    expect(relayed[0]).toMatchObject({ actor: victim, source: thrower });
    expect(relayed[0]!.args.application).toMatchObject({ module: "gworld", duration: { turns: 1, seconds: 1 }, effects: { modifiers: [{ value: -2, rolls: ["defense"] }] } });
    expect(cards[0]).toMatchObject({ splash: true, liquid: "Beer", triedToParry: true, flinched: true });
  });

  it("blinds on a critical hit, relayed for the source named", async () => {
    dice = [3];
    const source = { name: "Squirt gun owner" };
    const outcome = await splashInTheFace({ actor: thrower, victim, hit: true, criticalHit: true, apply: true, source });
    expect(outcome).toMatchObject({ blinded: true, blindSeconds: 3 });
    expect(relayed).toHaveLength(1);
    expect(relayed[0]!.source).toBe(source);
    expect(relayed[0]!.args.application).toMatchObject({ key: "splash-blinded", duration: { seconds: 3 }, effects: { modifiers: [] } });
  });

  it("changes nothing on the victim unless asked, as the sheet's button", async () => {
    dice = [14];
    const outcome = await splashInTheFace({ actor: thrower, victim, hit: true, criticalHit: false, defended: false });
    expect(outcome.flinched).toBe(true);
    expect(outcome.conditions).toEqual([]);
    expect(relayed).toHaveLength(0);
  });

  it("does nothing to a victim who dodged", async () => {
    const outcome = await splashInTheFace({ actor: thrower, victim, hit: true, criticalHit: false, defense: "dodge", apply: true });
    expect(outcome).toMatchObject({ defended: true, flinched: false });
    expect(relayed).toHaveLength(0);
  });
});

describe("hazards.detonate's structureMultiplier", () => {
  it("takes a positive number, else 1", () => {
    expect([2, 0.5, 0, -1, Number.NaN, undefined, "3"].map(structureMultiplierOf)).toEqual([2, 0.5, 1, 1, 1, 1, 3]);
  });

  it("multiplies the damage to the structure alone", async () => {
    // 1 lb of TNT: 6d x 2 is 12d, 72 at most against a contact target.
    const plain = await detonateCharge({ ref: 1, weightLbs: 1, structure: { dr: 0, hp: 10000 } });
    const doubled = await detonateCharge({ ref: 1, weightLbs: 1, structure: { dr: 0, hp: 10000 }, structureMultiplier: 2 });
    expect(plain?.structure).toMatchObject({ multiplier: 1 });
    expect(doubled?.structure?.damage).toBe(plain!.structure!.damage * 2);
    expect(doubled?.structure?.multiplier).toBe(2);
    // The blast card for people rolled as ever.
    expect(doubled?.basicDamage).toBe(plain?.basicDamage);
  });
});
