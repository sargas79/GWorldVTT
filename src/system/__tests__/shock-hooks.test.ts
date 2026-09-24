import { afterEach, describe, expect, it, vi } from "vitest";

import { shock } from "../hazards.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/**
 * A Foundry just big enough for the shock tool: every 3d6 rolls `ht3d6`, any
 * other formula (the burning damage) `damage`, and the listeners are given.
 */
function stage(options: {
  ht3d6: number[];
  damage?: number;
  listeners?: Record<string, (context: any) => void>;
}) {
  const posted: any[] = [];
  const faces = (total: number) => {
    const first = Math.min(6, Math.max(1, total - 2));
    const second = Math.min(6, Math.max(1, total - first - 1));
    return [first, second, total - first - second];
  };
  const rolls = [...options.ht3d6];
  globals.Hooks = {
    callAll: (event: string, context: any) => {
      options.listeners?.[event]?.(context);
      return true;
    },
  };
  globals.ChatMessage = { implementation: { create: async (d: any) => { posted.push(d); return d; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = {
    applications: { handlebars: { renderTemplate: async (_: string, context: any) => context } },
    utils: { escapeHTML: (s: string) => s },
  };
  globals.game = {
    user: { isGM: true },
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k} ${JSON.stringify(d)}` },
    settings: { get: () => ({}) },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  globals.Roll = class {
    total: number;
    dice: any[];
    constructor(formula: string) {
      // The hit location's 3d6 comes after the damage; it lands on the torso.
      this.total = formula === "3d6" ? (rolls.length ? rolls.shift()! : 10) : (options.damage ?? 0);
      this.dice = [{ results: faces(this.total).map((result) => ({ result })) }];
    }
    async evaluate() { return this; }
  };
  const update = vi.fn(async () => undefined);
  const actor = {
    isOwner: true,
    name: "Victim",
    system: { hp: { value: 12, max: 12 }, conditions: {}, derived: { attributes: { HT: 12 } } },
    items: [],
    effects: [],
    flags: {},
    update,
    getFlag: () => undefined,
    setFlag: async () => undefined,
  };
  return { actor, posted, update };
}

describe("gworld.shockModifiers (since 1.119.0)", () => {
  it("offers the Basic Set's figures and takes a listener's", async () => {
    const heard: any[] = [];
    const { actor, posted } = stage({
      // Hit location, then the HT roll.
      ht3d6: [10, 9],
      damage: 8,
      listeners: {
        [PROCEDURE_HOOKS.shockModifiers]: (context) => {
          heard.push({ ...context, lines: [...context.lines] });
          context.injuryStep = 1;
          context.dr = 3;
          context.modifier = -1;
          context.lines.push("A module's rate");
        },
      },
    });
    const outcome = await shock({ actor, kind: "lethal", modifier: 0, continuous: false, formula: "2d", metalArmor: true });
    expect(heard[0]).toMatchObject({
      kind: "lethal", formula: "2d", modifier: 0, injuryStep: 2, heartAttackMargin: 5, dr: 1, rollOnZeroInjury: false, lines: [],
    });
    // 8 burning against the module's DR 3: 5 injury, -5 at one per point, and -1.
    expect(outcome).toMatchObject({ injury: 5, dr: 3, injuryModifier: -5, rolled: true, target: 12 - 5 - 1, roll: 9 });
    expect(outcome!.success).toBe(false);
    expect(outcome!.lines[0]).toBe("A module's rate");
    expect(posted).toHaveLength(1);
  });

  it("gives no modifier for the injury where the step is 0", async () => {
    const { actor } = stage({
      ht3d6: [10, 9],
      damage: 8,
      listeners: { [PROCEDURE_HOOKS.shockModifiers]: (context) => { context.injuryStep = 0; context.dr = 0; } },
    });
    const outcome = await shock({ actor, kind: "lethal", modifier: 0, continuous: false, formula: "2d", metalArmor: false });
    expect(outcome).toMatchObject({ injury: 8, injuryModifier: 0, target: 12, success: true });
  });

  it("rolls against a shock that did no injury only when asked", async () => {
    const quiet = stage({ ht3d6: [10], damage: 0 });
    const skipped = await shock({ actor: quiet.actor, kind: "lethal", modifier: 0, continuous: false, formula: "1d-3", metalArmor: false });
    expect(skipped).toMatchObject({ injury: 0, rolled: false, target: null, roll: null });

    const asked = stage({
      ht3d6: [10, 15],
      damage: 0,
      listeners: { [PROCEDURE_HOOKS.shockModifiers]: (context) => { context.rollOnZeroInjury = true; } },
    });
    const rolled = await shock({ actor: asked.actor, kind: "lethal", modifier: 0, continuous: false, formula: "1d-3", metalArmor: false });
    expect(rolled).toMatchObject({ injury: 0, rolled: true, target: 12, roll: 15, success: false, unconscious: true });
  });

  it("gives a nonlethal shock a heart attack at a listener's margin", async () => {
    const plain = stage({ ht3d6: [18] });
    const basic = await shock({ actor: plain.actor, kind: "nonlethal", modifier: -4, continuous: false, formula: "", metalArmor: false });
    // Failed by 10, but the Basic Set stops no heart with a nonlethal shock.
    expect(basic).toMatchObject({ rolled: true, success: false, stunned: true, heartAttack: false });

    const hooked = stage({
      ht3d6: [18],
      listeners: { [PROCEDURE_HOOKS.shockModifiers]: (context) => { context.heartAttackMargin = 10; } },
    });
    const strong = await shock({ actor: hooked.actor, kind: "nonlethal", modifier: -4, continuous: false, formula: "", metalArmor: false });
    expect(strong).toMatchObject({ heartAttack: true, margin: 10 });
    expect(strong!.lines.some((line) => line.startsWith("GWORLD.Hazard.HeartAttack") && line.includes("10"))).toBe(true);
  });

  it("leaves an immune victim untouched: no damage, no roll, no stun", async () => {
    const after: any[] = [];
    const { actor, posted, update } = stage({
      ht3d6: [10, 18],
      damage: 12,
      listeners: {
        [PROCEDURE_HOOKS.shockModifiers]: (context) => {
          expect(context.immune).toBe(false);
          context.immune = true;
        },
        [PROCEDURE_HOOKS.afterShock]: (context) => after.push({ immune: context.immune, rolled: context.rolled }),
      },
    });
    const outcome = await shock({ actor, kind: "lethal", modifier: -4, continuous: true, contactSeconds: 5, formula: "3d", metalArmor: false });
    expect(outcome).toMatchObject({
      immune: true, injury: 0, dr: null, rolled: false, target: null, roll: null,
      stunned: false, unconscious: false, heartAttack: false, lines: ["GWORLD.Hazard.ShockImmune"],
    });
    expect(update).not.toHaveBeenCalled();
    expect(after).toEqual([{ immune: true, rolled: false }]);
    expect(posted[0].content.lines).toEqual(["GWORLD.Hazard.ShockImmune"]);
    expect(posted[0].rolls).toEqual([]);
  });

  it("shows an immune victim's listener lines in place of the default", async () => {
    const { actor, posted } = stage({
      ht3d6: [18],
      listeners: {
        [PROCEDURE_HOOKS.shockModifiers]: (context) => { context.immune = true; context.lines.push("The suit carries it"); },
      },
    });
    const outcome = await shock({ actor, kind: "nonlethal", modifier: 0, continuous: false, formula: "", metalArmor: false });
    expect(outcome).toMatchObject({ immune: true, rolled: false, stunned: false });
    expect(posted[0].content.lines).toEqual(["The suit carries it"]);
  });

  it("takes a lethal shock's heart attack away with a null margin", async () => {
    const { actor } = stage({
      ht3d6: [10, 18],
      damage: 4,
      listeners: { [PROCEDURE_HOOKS.shockModifiers]: (context) => { context.heartAttackMargin = null; context.dr = 0; } },
    });
    const outcome = await shock({ actor, kind: "lethal", modifier: 0, continuous: false, formula: "1d", metalArmor: false });
    expect(outcome).toMatchObject({ success: false, unconscious: true, heartAttack: false });
  });
});

describe("gworld.afterShock (since 1.119.0)", () => {
  it("hears the outcome and holds a victim who can't let go", async () => {
    const heard: any[] = [];
    const { actor, posted } = stage({
      ht3d6: [10, 14],
      damage: 5,
      listeners: {
        [PROCEDURE_HOOKS.shockModifiers]: (context) => { context.dr = 0; },
        [PROCEDURE_HOOKS.afterShock]: (context) => {
          heard.push({ actor: context.actor, injury: context.injury, stunned: context.stunned });
          context.contact = { held: true, label: "Clenched on the wire" };
        },
      },
    });
    const outcome = await shock({ actor, kind: "localized", modifier: 0, continuous: false, formula: "1d", metalArmor: false });
    expect(heard).toEqual([{ actor, injury: 5, stunned: true }]);
    expect(outcome!.contact).toEqual({ held: true, label: "Clenched on the wire" });
    expect(outcome!.lines).toContain("Clenched on the wire");
    expect(posted[0].content.lines).toContain("Clenched on the wire");
  });

  it("leaves contact null when nobody sets it, and fires where nothing got through", async () => {
    const events: string[] = [];
    const { actor } = stage({
      ht3d6: [10],
      damage: 0,
      listeners: { [PROCEDURE_HOOKS.afterShock]: () => events.push("after") },
    });
    const outcome = await shock({ actor, kind: "lethal", modifier: 0, continuous: false, formula: "1d-3", metalArmor: false });
    expect(events).toEqual(["after"]);
    expect(outcome!.contact).toBeNull();
  });
});
