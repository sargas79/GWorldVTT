import { describe, expect, it } from "vitest";

import { activeSkills, awarenessRolls, contextModifiers, loadPercent, pointBadge, poolPercent, togglePinned } from "../sheet-v2/overview.js";

describe("the point badge", () => {
  it("says there are points ready to spend", () => {
    expect(pointBadge({ spent: 152, available: 155, unspent: 3 })).toEqual({ spent: 152, available: 155, unspent: 3, state: "ready", overBy: 0 });
  });

  it("says every point is spent", () => {
    expect(pointBadge({ spent: 150, available: 150, unspent: 0 }).state).toBe("spent");
  });

  /** Overspending is allowed and flagged, never blocked. */
  it("flags an overspend with how far over", () => {
    const badge = pointBadge({ spent: 158, available: 155, unspent: -3 });
    expect(badge.state).toBe("over");
    expect(badge.overBy).toBe(3);
  });

  it("works out the unspent points when none are given", () => {
    expect(pointBadge({ spent: 10, available: 12 }).unspent).toBe(2);
  });
});

describe("the Overview's skills", () => {
  const skills = [
    { id: "s", name: "Stealth", points: 4, level: 15 },
    { id: "a", name: "Acrobatics", points: 2, level: 12 },
    { id: "t", name: "Tracking", points: 0, level: 9 },
    { id: "o", name: "Observation", points: 2, level: 14 },
  ];

  it("lists pinned skills first, then the rest trained, each by name", () => {
    const rows = activeSkills(skills, ["s", "t"]);
    expect(rows.map((r) => [r.skill.name, r.pinned])).toEqual([
      ["Stealth", true],
      ["Tracking", true],
      ["Acrobatics", false],
      ["Observation", false],
    ]);
  });

  it("lists every trained skill by name when nothing is pinned, and no untrained one", () => {
    expect(activeSkills(skills, []).map((r) => r.skill.name)).toEqual(["Acrobatics", "Observation", "Stealth"]);
  });

  it("ignores a pin whose skill is gone", () => {
    expect(activeSkills(skills, ["gone"]).every((r) => !r.pinned)).toBe(true);
  });

  it("pins and unpins", () => {
    expect(togglePinned(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePinned(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("what is modifying rolls right now", () => {
  const base = {
    posture: "standing",
    postureEffects: { attack: 0, defense: 0 },
    encumbranceDodge: 0,
    encumbranceKey: "none",
    maneuver: "doNothing",
    attributePenalties: {},
    afflictions: { names: [], effect: { dx: 0, iq: 0, st: 0, ht: 0, defense: 0 } },
    timed: [],
    attackPenalties: { melee: [], ranged: [] },
    layeringPenalty: 0,
  };

  it("has nothing to say about a fresh character standing unencumbered", () => {
    expect(contextModifiers(base)).toEqual([]);
  });

  it("lists posture, load, maneuver and lowered attributes", () => {
    const lines = contextModifiers({
      ...base,
      posture: "kneeling",
      postureEffects: { attack: -2, defense: -2 },
      encumbranceDodge: -1,
      encumbranceKey: "light",
      maneuver: "moveAndAttack",
      attributePenalties: { DX: -2 },
    });
    expect(lines.map((l) => [l.appliesTo, l.value])).toEqual([
      ["melee", -2],
      ["defense", -2],
      ["Dodge", -1],
      ["melee", -4],
      ["DX", -2],
    ]);
  });

  /**
   * The conditions on the token, under their own names: "Nauseated -2" is a
   * line the player can act on where "Penalties -2" is not. The defense
   * figure is the condition's own, since an attribute penalty never reaches a
   * defense (Campaigns p. 421).
   */
  it("names the conditions on the token and what each costs", () => {
    const lines = contextModifiers({
      ...base,
      afflictions: { names: ["Nauseated"], effect: { dx: -2, iq: -2, st: -2, ht: -2, defense: -1 } },
    });
    expect(lines).toEqual([
      { label: "Nauseated", labelKey: false, appliesTo: "ST", value: -2 },
      { label: "Nauseated", labelKey: false, appliesTo: "DX", value: -2 },
      { label: "Nauseated", labelKey: false, appliesTo: "IQ", value: -2 },
      { label: "Nauseated", labelKey: false, appliesTo: "HT", value: -2 },
      { label: "Nauseated", labelKey: false, appliesTo: "defense", value: -1 },
    ]);
  });

  it("keeps a typed penalty and a condition apart", () => {
    const lines = contextModifiers({
      ...base,
      attributePenalties: { DX: -1 },
      afflictions: { names: ["Drunk"], effect: { dx: -2, iq: -2, st: 0, ht: 0, defense: 0 } },
    });
    expect(lines.map((l) => [l.label, l.appliesTo, l.value])).toEqual([
      ["GWORLD.Penalties.Label", "DX", -1],
      ["Drunk", "DX", -2],
      ["Drunk", "IQ", -2],
    ]);
  });

  it("lists what timed conditions and traits add, by name", () => {
    const lines = contextModifiers({
      ...base,
      timed: [{ label: "Dazzled", modifiers: [{ label: "to hit", value: -3 }] }],
      attackPenalties: { melee: [], ranged: [{ trait: "Bad Sight", value: -2 }] },
    });
    expect(lines).toEqual([
      { label: "Dazzled: to hit", labelKey: false, appliesTo: "", value: -3 },
      { label: "Bad Sight", labelKey: false, appliesTo: "ranged", value: -2 },
    ]);
  });
});

describe("bars", () => {
  it("fills a pool's bar by what is left, never past its ends", () => {
    expect(poolPercent(11, 14)).toBe(79);
    expect(poolPercent(-3, 14)).toBe(0);
    expect(poolPercent(20, 14)).toBe(100);
    expect(poolPercent(5, 0)).toBe(0);
  });

  it("fills the load bar against ten times Basic Lift", () => {
    expect(loadPercent(22, 22)).toBe(10);
    expect(loadPercent(500, 22)).toBe(100);
  });
});

describe("the Overview's Will and Perception rolls", () => {
  const senses = [
    { sense: "vision", score: 13, modifier: 1 },
    { sense: "hearing", score: 8, modifier: -4 },
    { sense: "tasteSmell", score: 12, modifier: 0 },
    { sense: "touch", score: 12, modifier: 0 },
  ];

  it("rolls Will and Perception, each tagged with the score it is made against", () => {
    const rows = awarenessRolls({ will: 13, per: 12, senses: [] });
    expect(rows).toEqual([
      { key: "will", label: "GWORLD.Secondary.Will", basedOn: "Will", sense: "", score: 13, modifier: 0 },
      { key: "per", label: "GWORLD.Secondary.Per", basedOn: "Per", sense: "", score: 12, modifier: 0 },
    ]);
  });

  /** "A Sense roll is a Perception roll" (Characters p. 35), at that sense's own score. */
  it("rolls each sense as a Perception roll at the score its traits leave", () => {
    const rows = awarenessRolls({ will: 13, per: 12, senses }).filter((row) => row.sense);
    expect(rows.map((row) => [row.key, row.score, row.modifier])).toEqual([
      ["vision", 13, 1],
      ["hearing", 8, -4],
      ["tasteSmell", 12, 0],
      ["touch", 12, 0],
    ]);
    expect(rows.every((row) => row.basedOn === "Per")).toBe(true);
    expect(rows[0]?.label).toBe("GWORLD.Senses.vision");
  });

  it("leaves a missing sense without a score to roll", () => {
    const rows = awarenessRolls({ will: 13, per: 12, senses: [{ sense: "vision", score: null, modifier: 0 }] });
    expect(rows[2]).toEqual({ key: "vision", label: "GWORLD.Senses.vision", basedOn: "Per", sense: "vision", score: null, modifier: 0 });
  });

  it("leaves a score out where the character has none", () => {
    expect(awarenessRolls({ will: undefined, per: null, senses: [] }).map((row) => row.score)).toEqual([null, null]);
  });
});
