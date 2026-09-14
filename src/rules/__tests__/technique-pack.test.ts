import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The pack is generated from the GCA data file, and a default read wrong is a
// technique bought at full skill for nothing on every sheet that takes it.
const pack = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../packs-src/skills/basic-set-techniques.json"), "utf8"),
) as { name: string; system: { prerequisite: string; defaultModifier: number; maxRelativeToPrerequisite: number } }[];

function technique(name: string) {
  const found = pack.find((t) => t.name === name);
  if (!found) throw new Error(`no technique ${name}`);
  return found.system;
}

describe("the Basic Set's techniques (#193)", () => {
  it("keeps the penalty of a default the data file quotes", () => {
    for (const skill of ["Beam Weapons (Pistol)", "Guns (Pistol)", "Bow"]) {
      expect(technique(`Dual-Weapon Attack (${skill})`)).toMatchObject({ prerequisite: skill, defaultModifier: -4 });
    }
    expect(technique("Finger Lock (Judo)")).toMatchObject({ prerequisite: "Arm Lock (Judo)", defaultModifier: -3 });
    expect(technique("Impersonate (Mimicry (Speech))")).toMatchObject({ defaultModifier: -3 });
    expect(technique("Set Trap (Explosives (Demolition))")).toMatchObject({ defaultModifier: -2 });
  });

  it("caps Whirlwind Attack at its skill for every weapon", () => {
    for (const skill of ["Broadsword", "Staff", "Two-Handed Sword"]) {
      expect(technique(`Whirlwind Attack (${skill})`)).toMatchObject({ defaultModifier: -5, maxRelativeToPrerequisite: 0 });
    }
  });
});
