import { afterEach, describe, expect, it } from "vitest";

import { PROCEDURE_HOOKS, successRollModifiers, successRollTags } from "../procedure-extensions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.Hooks;
});

/** Rolls to detect somebody (sargas79/GWorldVTT#481). */
describe("detection rolls (since 1.63.0)", () => {
  it("tags a sense roll and a detection skill", () => {
    expect(successRollTags({ kind: "attribute", tags: ["Per", "hearing"] })).toEqual(expect.arrayContaining(["hearing", "detection"]));
    expect(successRollTags({ kind: "skill", skill: "Observation" })).toEqual(expect.arrayContaining(["detection", "vision"]));
    expect(successRollTags({ kind: "skill", skill: "Tracking" })).toContain("detection");
    expect(successRollTags({ kind: "skill", skill: "Stealth" })).not.toContain("detection");
  });

  it("asks gworld.detectionModifiers, with the subject, and adds its lines", () => {
    const subject = { name: "Wearer" };
    const heard: any[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event === PROCEDURE_HOOKS.detectionModifiers) {
          heard.push({ subject: context.subject, sense: context.sense });
          if (context.subject === subject && context.sense === "vision") context.modifiers.push({ label: "Cloak", value: -4 });
        }
        return true;
      },
    };
    const tags = successRollTags({ kind: "attribute", tags: ["Per", "vision"] });
    const lines = successRollModifiers({ actor: { items: [] }, label: "Vision", kind: "attribute", skill: "", base: 12, tags, modifiers: [], subject });
    expect(heard).toEqual([{ subject, sense: "vision" }]);
    expect(lines).toEqual([{ label: "Cloak", value: -4 }]);
  });
});
