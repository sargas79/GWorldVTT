import { describe, expect, it } from "vitest";

import { isOpenTechniqueData, templateTechnique, withChosenSkill } from "../open-techniques.js";

const disarming = {
  name: "Disarming",
  type: "technique",
  system: { prerequisite: "", skillFamilies: ["melee", "shield", "unarmed"], skillChoices: [], defaultModifier: 0 },
};

/** An open technique on its way onto a character (sargas79/GWorldVTT#194). */
describe("open techniques", () => {
  it("takes the technique for the skill chosen, bought off that skill", () => {
    const taken = withChosenSkill(disarming, "Broadsword");
    expect(taken.name).toBe("Disarming (Broadsword)");
    expect(taken.system.prerequisite).toBe("Broadsword");
    expect(isOpenTechniqueData(taken)).toBe(false);
  });

  it("takes a template's Disarming (Rapier) for Rapier, without asking", () => {
    // What entryItemFields makes of it: the entry's name, the document's data.
    const fromTemplate = templateTechnique({ ...disarming, name: "Disarming (Rapier)" }, "Disarming (Rapier)", "Disarming");
    expect(fromTemplate.name).toBe("Disarming (Rapier)");
    expect(fromTemplate.system.prerequisite).toBe("Rapier");
  });

  it("leaves a template's plain Disarming open, and anything else alone", () => {
    expect(templateTechnique(disarming, "Disarming", "Disarming").system.prerequisite).toBe("");
    const skill = { name: "Broadsword", type: "skill", system: {} };
    expect(templateTechnique(skill, "Broadsword", "Broadsword")).toBe(skill);
  });
});
