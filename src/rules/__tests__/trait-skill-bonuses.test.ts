import { describe, expect, it } from "vitest";

import { traitSkillBonuses, traitSkillBonusesFor } from "../talents.js";

/** What the traits held add to one skill, summed, with the labels alongside. */
function bonusTo(skill: string, traits: Array<{ name: string; levels?: number }>) {
  const lines = traitSkillBonusesFor(skill, traitSkillBonuses(traits));
  return { total: lines.reduce((sum, l) => sum + l.value, 0), labels: lines.map((l) => l.label) };
}

describe("the traits that add to a skill by name (GURPS Basic Set: Characters)", () => {
  it("Appearance adds its bonus from those attracted to Sex Appeal (pp. 21, 219)", () => {
    expect(bonusTo("Sex Appeal", [{ name: "Appearance", levels: 1 }])).toEqual({ total: 1, labels: ["Appearance"] }); // Attractive
    expect(bonusTo("Sex Appeal", [{ name: "Appearance", levels: 2 }]).total).toBe(4); // Beautiful
    expect(bonusTo("Sex Appeal", [{ name: "Appearance", levels: 3 }]).total).toBe(4); // Handsome
    expect(bonusTo("Sex Appeal", [{ name: "Appearance", levels: 5 }]).total).toBe(6); // Very Handsome
    expect(bonusTo("Sex Appeal", [{ name: "Appearance", levels: 6 }]).total).toBe(8); // Transcendent
    expect(bonusTo("Sex Appeal", [{ name: "Appearance", levels: 9 }]).total).toBe(8); // past the table stays there
  });

  it("Appearance as a disadvantage doubles its penalty on Sex Appeal (p. 219)", () => {
    expect(bonusTo("Sex Appeal", [{ name: "Appearance (Disadvantage)", levels: 1 }]).total).toBe(-2); // Unattractive
    expect(bonusTo("Sex Appeal", [{ name: "Appearance (Disadvantage)", levels: 3 }]).total).toBe(-8); // Hideous
    expect(bonusTo("Sex Appeal", [{ name: "Appearance (Disadvantage)", levels: 5 }]).total).toBe(-12); // Horrific
  });

  it("Appearance reaches no other skill", () => {
    expect(bonusTo("Diplomacy", [{ name: "Appearance", levels: 6 }]).total).toBe(0);
  });

  it("Absolute Direction is +3 to Body Sense and Navigation, and its second level adds 3D Spatial Sense's (p. 34)", () => {
    const one = [{ name: "Absolute Direction", levels: 1 }];
    expect(bonusTo("Body Sense", one).total).toBe(3);
    expect(bonusTo("Navigation (Sea)", one).total).toBe(3);
    expect(bonusTo("Piloting (Glider)", one).total).toBe(0);
    expect(bonusTo("Navigation (Space)", one).total).toBe(0);

    const two = [{ name: "Absolute Direction", levels: 2 }];
    expect(bonusTo("Piloting (Glider)", two).total).toBe(1);
    expect(bonusTo("Aerobatics", two).total).toBe(2);
    expect(bonusTo("Free Fall", two).total).toBe(2);
    expect(bonusTo("Navigation (Space)", two).total).toBe(2);
    expect(bonusTo("Navigation (Land)", two).total).toBe(3);

    // The same trait as its own entry.
    expect(bonusTo("Navigation (Hyperspace)", [{ name: "3D Spatial Sense" }]).total).toBe(2);
    expect(bonusTo("Body Sense", [{ name: "3D Spatial Sense" }]).total).toBe(3);
  });

  it("Empathy is +3 and Sensitive +1 to Detect Lies, Fortune-Telling and Psychology (p. 51)", () => {
    for (const skill of ["Detect Lies", "Fortune-Telling", "Psychology"]) {
      expect(bonusTo(skill, [{ name: "Empathy" }]).total).toBe(3);
      expect(bonusTo(skill, [{ name: "Sensitive" }]).total).toBe(1);
    }
    expect(bonusTo("Diplomacy", [{ name: "Empathy" }]).total).toBe(0);
  });

  it("Flexibility is +3 and Double-Jointed +5 to Climbing, Escape and Erotic Art (p. 56)", () => {
    expect(bonusTo("Climbing", [{ name: "Flexibility", levels: 1 }]).total).toBe(3);
    expect(bonusTo("Escape", [{ name: "Flexibility", levels: 2 }]).total).toBe(5);
    expect(bonusTo("Erotic Art", [{ name: "Double-Jointed" }]).total).toBe(5);
  });

  it("High Manual Dexterity is +1 a level, to four, on the fine-work skills (p. 59)", () => {
    expect(bonusTo("Lockpicking", [{ name: "High Manual Dexterity", levels: 2 }]).total).toBe(2);
    expect(bonusTo("Sleight of Hand", [{ name: "High Manual Dexterity", levels: 7 }]).total).toBe(4);
    expect(bonusTo("Surgery", [{ name: "High Manual Dexterity", levels: 1 }]).total).toBe(1);
    expect(bonusTo("Broadsword", [{ name: "High Manual Dexterity", levels: 4 }]).total).toBe(0);
  });

  it("Perfect Balance is +1 to Acrobatics, Climbing and Piloting (p. 74)", () => {
    expect(bonusTo("Acrobatics", [{ name: "Perfect Balance" }]).total).toBe(1);
    expect(bonusTo("Piloting (Helicopter)", [{ name: "Perfect Balance" }]).total).toBe(1);
  });

  it("Brachiator, Discriminatory Smell, Elastic Skin and Slippery reach one skill each (pp. 41, 49, 51, 85)", () => {
    expect(bonusTo("Climbing", [{ name: "Brachiator" }]).total).toBe(2);
    expect(bonusTo("Tracking", [{ name: "Discriminatory Smell" }]).total).toBe(4);
    expect(bonusTo("Disguise", [{ name: "Elastic Skin" }]).total).toBe(4);
    expect(bonusTo("Escape", [{ name: "Slippery", levels: 3 }]).total).toBe(3);
    expect(bonusTo("Escape", [{ name: "Slippery", levels: 8 }]).total).toBe(5);
  });

  it("Ham-Fisted is -3 a level on the fine-work skills and Fast-Draw (p. 138)", () => {
    expect(bonusTo("Jeweler", [{ name: "Ham-Fisted", levels: 1 }]).total).toBe(-3);
    expect(bonusTo("Fast-Draw (Pistol)", [{ name: "Ham-Fisted", levels: 2 }]).total).toBe(-6);
    expect(bonusTo("Fast-Draw (Pistol)", [{ name: "Ham-Fisted", levels: 5 }]).total).toBe(-6);
  });

  it("Low Empathy is -3 on the skills that read people (p. 142)", () => {
    expect(bonusTo("Detect Lies", [{ name: "Low Empathy" }]).total).toBe(-3);
    expect(bonusTo("Sex Appeal", [{ name: "Low Empathy" }]).total).toBe(-3);
    expect(bonusTo("Sociology", [{ name: "Low Empathy" }]).total).toBe(-3);
    expect(bonusTo("Intimidation", [{ name: "Low Empathy" }]).total).toBe(0);
  });

  it("Oblivious is -1 on the six Influence skills (p. 146)", () => {
    for (const skill of ["Diplomacy", "Fast-Talk", "Intimidation", "Savoir-Faire", "Sex Appeal", "Streetwise"]) {
      expect(bonusTo(skill, [{ name: "Oblivious" }]).total).toBe(-1);
    }
    expect(bonusTo("Leadership", [{ name: "Oblivious" }]).total).toBe(0);
  });

  it("Shyness is -1, -2 and -4 by level on the skills that deal with people (p. 154)", () => {
    expect(bonusTo("Public Speaking", [{ name: "Shyness", levels: 1 }]).total).toBe(-1);
    expect(bonusTo("Teaching", [{ name: "Shyness", levels: 2 }]).total).toBe(-2);
    expect(bonusTo("Sex Appeal", [{ name: "Shyness", levels: 3 }]).total).toBe(-4);
  });

  it("Stuttering and Disturbing Voice are -2 on the spoken skills (pp. 132, 157)", () => {
    expect(bonusTo("Singing", [{ name: "Stuttering" }]).total).toBe(-2);
    expect(bonusTo("Public Speaking", [{ name: "Disturbing Voice" }]).total).toBe(-2);
    expect(bonusTo("Mimicry", [{ name: "Stuttering" }]).total).toBe(0);
  });

  it("Callous, Gullibility and Truthfulness each name one skill (pp. 125, 137, 159)", () => {
    expect(bonusTo("Teaching", [{ name: "Callous" }]).total).toBe(-3);
    expect(bonusTo("Merchant", [{ name: "Gullibility" }]).total).toBe(-3);
    expect(bonusTo("Fast-Talk", [{ name: "Truthfulness" }]).total).toBe(-5);
  });

  it("stacks every trait that reaches the skill, one labelled line each", () => {
    const traits = [
      { name: "Appearance", levels: 3 },
      { name: "Shyness", levels: 1 },
      { name: "Oblivious" },
      { name: "Stuttering" },
    ];
    expect(bonusTo("Sex Appeal", traits)).toEqual({
      total: 4 - 1 - 1 - 2,
      labels: ["Appearance", "Shyness", "Oblivious", "Stuttering"],
    });
  });

  it("reads trait names whatever their case and spacing", () => {
    expect(bonusTo("Detect Lies", [{ name: "  empathy " }]).total).toBe(3);
  });

  it("says nothing for a trait that names no skill, or a skill nothing reaches", () => {
    expect(traitSkillBonuses([{ name: "Combat Reflexes" }]).size).toBe(0);
    expect(bonusTo("Guns (Pistol)", [{ name: "Empathy" }, { name: "Shyness", levels: 3 }]).total).toBe(0);
  });
});
