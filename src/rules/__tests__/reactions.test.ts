import { describe, expect, it } from "vitest";

import {
  AUTOMATIC_BONUS_SKILL,
  INFLUENCE_SKILLS,
  REACTIONS,
  SKILL_REACTION_BONUS,
  automaticInfluence,
  automaticSkillBonus,
  boundReaction,
  compareReactions,
  influenceResult,
  reactionFor,
  reactionRoll,
} from "../reactions.js";

describe("the Reaction Table (Campaigns p. 560)", () => {
  /** "0 or less: Disastrous. 1 to 3: Very Bad. 4 to 6: Bad. 7 to 9: Poor.
   * 10 to 12: Neutral. 13 to 15: Good. 16 to 18: Very Good. 19+: Excellent." */
  it("reads every band", () => {
    expect(reactionFor(0)).toBe("disastrous");
    expect(reactionFor(-6)).toBe("disastrous");
    expect(reactionFor(1)).toBe("veryBad");
    expect(reactionFor(3)).toBe("veryBad");
    expect(reactionFor(4)).toBe("bad");
    expect(reactionFor(6)).toBe("bad");
    expect(reactionFor(7)).toBe("poor");
    expect(reactionFor(9)).toBe("poor");
    expect(reactionFor(10)).toBe("neutral");
    expect(reactionFor(12)).toBe("neutral");
    expect(reactionFor(13)).toBe("good");
    expect(reactionFor(15)).toBe("good");
    expect(reactionFor(16)).toBe("veryGood");
    expect(reactionFor(18)).toBe("veryGood");
    expect(reactionFor(19)).toBe("excellent");
    expect(reactionFor(30)).toBe("excellent");
  });

  it("runs from disastrous to excellent, in order", () => {
    expect(REACTIONS[0]).toBe("disastrous");
    expect(REACTIONS[REACTIONS.length - 1]).toBe("excellent");
    expect(compareReactions("good", "bad")).toBeGreaterThan(0);
    expect(compareReactions("bad", "good")).toBeLessThan(0);
    expect(compareReactions("neutral", "neutral")).toBe(0);
  });
});

describe("a reaction roll (Campaigns p. 494)", () => {
  /** "Reaction modifiers apply directly to the die roll." */
  it("adds the modifier to the dice rather than to a target", () => {
    expect(reactionRoll({ rolled: 10, modifier: 4 })).toMatchObject({
      total: 14,
      reaction: "good",
    });
  });

  /** "A high roll is good, not bad." */
  it("is better the higher it lands", () => {
    expect(reactionRoll({ rolled: 5 }).reaction).toBe("bad");
    expect(reactionRoll({ rolled: 17 }).reaction).toBe("veryGood");
  });

  it("prints no modifier as a positive zero", () => {
    expect(Object.is(reactionRoll({ rolled: 10 }).modifier, 0)).toBe(true);
    expect(Object.is(reactionRoll({ rolled: 10, modifier: -0 }).modifier, 0)).toBe(true);
  });

  /** "A mountain man might be a loner, with a -2 reaction to any outsider --
   * and no matter what, his reaction will never be better than Neutral." */
  it("holds a reaction under a best case", () => {
    const result = reactionRoll({ rolled: 15, modifier: -2, best: "neutral" });
    expect(result.reaction).toBe("neutral");
    expect(result.bounded).toBe(true);
  });

  /** "Predetermined bonuses and worst-case reactions are possible for
   * unusually friendly NPCs." */
  it("holds one above a worst case", () => {
    expect(reactionRoll({ rolled: 4, worst: "neutral" }).reaction).toBe("neutral");
  });

  it("leaves a reaction inside its bounds alone", () => {
    const result = reactionRoll({ rolled: 11, best: "good", worst: "bad" });
    expect(result.reaction).toBe("neutral");
    expect(result.bounded).toBe(false);
  });

  it("applies both bounds at once without fighting itself", () => {
    expect(boundReaction({ reaction: "excellent", best: "poor", worst: "bad" })).toBe("poor");
    expect(boundReaction({ reaction: "disastrous", best: "poor", worst: "bad" })).toBe("bad");
  });
});

describe("skills that help (Campaigns p. 494)", () => {
  /** "A successful roll against a skill appropriate to the situation can give
   * +2 to reactions." */
  it("is worth two", () => {
    expect(SKILL_REACTION_BONUS).toBe(2);
  });

  /** "In a few cases, skill 20+ gives an automatic +2 to reactions." */
  it("needs no roll at 20 or better", () => {
    expect(AUTOMATIC_BONUS_SKILL).toBe(20);
    expect(automaticSkillBonus(20)).toBe(true);
    expect(automaticSkillBonus(19)).toBe(false);
  });
});

describe("an Influence roll (Campaigns p. 359)", () => {
  it("names the six Influence skills", () => {
    expect(INFLUENCE_SKILLS).toEqual([
      "Diplomacy",
      "Fast-Talk",
      "Intimidation",
      "Savoir-Faire",
      "Sex Appeal",
      "Streetwise",
    ]);
  });

  /** "If you win, you get a 'Good' reaction from the NPC." */
  it("buys a Good reaction outright", () => {
    expect(influenceResult({ skill: "Fast-Talk", won: true })).toMatchObject({
      reaction: "good",
      won: true,
    });
  });

  /** "-- 'Very Good' if you used Sex Appeal." */
  it("buys a Very Good one with Sex Appeal", () => {
    expect(influenceResult({ skill: "Sex Appeal", won: true }).reaction).toBe("veryGood");
  });

  /** "On any other outcome, the NPC resents your clumsy attempt at
   * manipulation. This gives you a 'Bad' reaction." */
  it("costs a Bad reaction on any other outcome", () => {
    expect(influenceResult({ skill: "Streetwise", won: false }).reaction).toBe("bad");
  });

  /** "-- 'Very Bad' if you attempted specious intimidation." */
  it("costs a Very Bad one for empty threats", () => {
    expect(influenceResult({ skill: "Intimidation", won: false, specious: true }).reaction)
      .toBe("veryBad");
    expect(influenceResult({ skill: "Intimidation", won: false }).reaction).toBe("bad");
  });

  /** "If you used Diplomacy, the GM will also make a regular reaction roll and
   * use the better of the two reactions." */
  it("gives Diplomacy a second chance and nothing else", () => {
    expect(influenceResult({ skill: "Diplomacy", won: false }).rollsAnyway).toBe(true);
    expect(influenceResult({ skill: "Fast-Talk", won: false }).rollsAnyway).toBe(false);
    expect(influenceResult({ skill: "Diplomacy", won: true }).rollsAnyway).toBe(false);
  });
});

describe("the people it is settled against in advance (Campaigns pp. 60, 95, 154)", () => {
  /** "You win automatically -- no roll required -- against those with Slave
   * Mentality." */
  it("wins against Slave Mentality without rolling", () => {
    expect(automaticInfluence({ skill: "Fast-Talk", slaveMentality: true })).toBe(true);
  });

  /** "Intimidation attempts against those with the Unfazeable advantage also
   * fail automatically." */
  it("cannot intimidate the Unfazeable, but can talk to them", () => {
    expect(automaticInfluence({ skill: "Intimidation", unfazeable: true })).toBe(false);
    expect(automaticInfluence({ skill: "Diplomacy", unfazeable: true })).toBeNull();
  });

  /** "If the subject is Indomitable, you lose automatically unless you have
   * Empathy." */
  it("loses to the Indomitable unless you have Empathy", () => {
    expect(automaticInfluence({ skill: "Diplomacy", indomitable: true })).toBe(false);
    expect(automaticInfluence({ skill: "Diplomacy", indomitable: true, empathy: true })).toBeNull();
  });

  it("settles nothing about an ordinary person", () => {
    expect(automaticInfluence({ skill: "Diplomacy" })).toBeNull();
  });
});
