import { describe, expect, it } from "vitest";

import { beastAttacks, beastTraitsFrom } from "../natural-attacks.js";

/** Damage for Animals (GURPS Basic Set: Campaigns p. 460). */
describe("beast attacks", () => {
  it("bite at thrust-1, crushing unless sharp teeth or fangs, and weaker with a Weak Bite", () => {
    // ST 16 thrusts 1d+1.
    const lion = beastAttacks({ st: 16, dx: 13, skills: {}, beast: { teeth: "sharp" } });
    expect(lion).toEqual([
      expect.objectContaining({ key: "bite", damage: { dice: 1, adds: 0 }, damageType: "cut", skillLevel: 13 }),
    ]);
    const snake = beastAttacks({ st: 5, dx: 13, skills: {}, beast: { teeth: "fangs" } });
    expect(snake[0]).toMatchObject({ damageType: "imp" });
    // ST 22 thrusts 2d: a Weak Bite is -2 a die on top of the -1.
    const camel = beastAttacks({ st: 22, dx: 9, skills: {}, beast: { teeth: null, weakBite: true } });
    expect(camel[0]).toMatchObject({ key: "bite", damage: { dice: 2, adds: -5 }, damageType: "cr" });
  });

  it("claws at thrust-1, +1 a die blunt and cutting sharp; hooves are for kicks", () => {
    // ST 14 thrusts 1d.
    const bear = beastAttacks({ st: 14, dx: 11, skills: {}, beast: { claws: "blunt" } });
    expect(bear).toEqual([expect.objectContaining({ key: "claw", damage: { dice: 1, adds: 0 }, damageType: "cr" })]);
    const cat = beastAttacks({ st: 4, dx: 14, skills: {}, beast: { claws: "sharp" } });
    expect(cat[0]).toMatchObject({ key: "claw", damageType: "cut" });
    expect(beastAttacks({ st: 22, dx: 9, skills: {}, beast: { claws: "hooves" } })).toEqual([]);
  });

  it("strikers at thrust +1 a die, of their own type", () => {
    // ST 27 thrusts 3d-1.
    const ox = beastAttacks({ st: 27, dx: 8, skills: {}, beast: { strikers: [{ name: "Horns", type: "imp" }] } });
    expect(ox).toEqual([
      expect.objectContaining({ key: "striker", skillName: "Horns", damage: { dice: 3, adds: 2 }, damageType: "imp" }),
    ]);
  });

  it("adds Brawling at DX+2 to every one of them", () => {
    // ST 17 thrusts 1d+2; Brawling 15 at DX 13 is DX+2.
    const tiger = beastAttacks({
      st: 17, dx: 13, skills: { Brawling: 15 }, beast: { teeth: "sharp", claws: "sharp" },
    });
    expect(tiger.map((a) => a.damage)).toEqual([{ dice: 1, adds: 2 }, { dice: 1, adds: 2 }]);
    expect(tiger[0]?.skillLevel).toBe(15);
  });

  it("reads the traits by their compendium names and the pages' short ones", () => {
    expect(beastTraitsFrom(["Teeth (Sharp Teeth)", "Claws (Hooves)", "Weak Bite", "Striker (Impaling): Antlers"]))
      .toEqual({ teeth: "sharp", weakBite: true, claws: "hooves", strikers: [{ name: "Antlers", type: "imp" }] });
    expect(beastTraitsFrom(["Fangs", "Sharp Claws"])).toMatchObject({ teeth: "fangs", claws: "sharp" });
    expect(beastTraitsFrom(["Combat Reflexes"])).toEqual({ teeth: null, weakBite: false, claws: null, strikers: [] });
  });
});
