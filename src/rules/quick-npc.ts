/**
 * NPCs in a hurry (GURPS Basic Set: Campaigns p. 502).
 *
 * "Build important NPCs just like PCs" -- but the rest get "notes on their
 * important statistics", and "some trivial characters require no planning at
 * all! If you suddenly need to know (for instance) a skill for one of them,
 * just roll 3d and use the result." The Revised edition adds inventing a
 * character on the spot by "rolling dice for any important statistics".
 *
 * So a quick NPC is written down the way the NPC Record Card (p. 569) is: the
 * attributes, a few traits, and the skills as levels -- "Knife-17" -- rather
 * than as points. The sheet still prices everything in points, so a level the
 * GM chooses is turned back into the points that buy it, off the attribute the
 * skill uses. That keeps the point total honest and lets the NPC be edited on
 * the ordinary sheet afterwards.
 */

import { secondaryCharacteristics } from "./attributes.js";
import { defaultLevel, pointsForRelativeLevel, relativeLevelForPoints } from "./skills.js";
import type { Attribute, Attributes, Difficulty } from "./types.js";

/** The attributes and Will and Per, which is what a skill can be based on. */
export type SketchAttributeKey = Attribute | "Will" | "Per";

/** A skill as the card writes it: a name and a level. */
export interface SketchSkill {
  name: string;
  /** The compendium entry it is, so the real skill goes on the sheet. */
  uuid?: string;
  attribute: SketchAttributeKey;
  difficulty: Difficulty;
  /** The level the GM wants, as the card writes it. */
  level: number;
}

/** A trait as the card lists it: a name and what it costs. */
export interface SketchTrait {
  name: string;
  uuid?: string;
  points: number;
  levels?: number;
}

/** A piece of gear from the shelf. */
export interface SketchGear {
  name: string;
  uuid: string;
}

/** The sketch of an NPC: what the Record Card has room for. */
export interface NpcSketch {
  name: string;
  appearance: string;
  attributes: Attributes;
  /** Levels bought on top of the attributes, as the sheet records them. */
  secondary: { hp: number; will: number; per: number; fp: number; basicSpeed: number; basicMove: number };
  skills: SketchSkill[];
  traits: SketchTrait[];
  gear: SketchGear[];
  groupSize: number;
  tactics: string;
  cannonFodder: boolean;
  notes: string;
}

export const EMPTY_SECONDARY = Object.freeze({ hp: 0, will: 0, per: 0, fp: 0, basicSpeed: 0, basicMove: 0 });

/** A blank card: an average person with no name yet. */
export function emptySketch(): NpcSketch {
  return {
    name: "",
    appearance: "",
    attributes: { ST: 10, DX: 10, IQ: 10, HT: 10 },
    secondary: { ...EMPTY_SECONDARY },
    skills: [],
    traits: [],
    gear: [],
    groupSize: 1,
    tactics: "",
    cannonFodder: false,
    notes: "",
  };
}

/** The score a skill is based on, with Will and Per read off the sketch's IQ. */
export function sketchAttributeScore(sketch: Pick<NpcSketch, "attributes" | "secondary">, key: SketchAttributeKey): number {
  const derived = secondaryCharacteristics(sketch.attributes, sketch.secondary);
  if (key === "Will") return derived.will;
  if (key === "Per") return derived.per;
  return sketch.attributes[key];
}

/**
 * The points that buy a level, off the attribute the skill uses.
 *
 * A level too low to buy -- below what one point gives -- costs the one
 * point, since the card says the NPC has the skill; the sheet will then show
 * it a little higher than written. A level at or below the default is the
 * same case: the skill is known, at one point.
 */
export function pointsForLevel(level: number, attributeScore: number, difficulty: Difficulty): number {
  const points = pointsForRelativeLevel(level - attributeScore, difficulty);
  return points === null ? pointsForRelativeLevel(lowestBoughtRelativeLevel(difficulty), difficulty) ?? 1 : points;
}

/** The relative level one point buys: +0 for Easy, -1 Average, -2 Hard, -3 Very Hard. */
function lowestBoughtRelativeLevel(difficulty: Difficulty): number {
  let relative = -6;
  while (pointsForRelativeLevel(relative, difficulty) === null) relative += 1;
  return relative;
}

/** The level the sheet will show for a skill on the card, given the points its level turns into. */
export function levelOnSheet(skill: SketchSkill, sketch: Pick<NpcSketch, "attributes" | "secondary">): number {
  const score = sketchAttributeScore(sketch, skill.attribute);
  const points = pointsForLevel(skill.level, score, skill.difficulty);
  const relative = relativeLevelForPoints(points, skill.difficulty);
  return relative === null ? defaultLevel(score, skill.difficulty) : score + relative;
}

/**
 * "Just roll 3d and use the result" (p. 502): the skill of a trivial NPC
 * nobody wrote down, from the dice as they fell.
 */
export function trivialSkillLevel(dice: readonly number[]): number {
  return dice.reduce((total, die) => total + die, 0);
}

/**
 * Attributes rolled on the spot (Revised p. 502), 3d apiece: an average of
 * 10.5, which is the ordinary person the Basic Set assumes.
 */
export function rolledAttributes(roll3d: () => number): Attributes {
  return { ST: roll3d(), DX: roll3d(), IQ: roll3d(), HT: roll3d() };
}

/** The sketch's skills as the card writes them, "Knife-17", sorted by name. */
export function skillLines(sketch: NpcSketch): string[] {
  return [...sketch.skills]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => `${skill.name}-${levelOnSheet(skill, sketch)}`);
}

/** Item data for one skill on the card, priced from its level. */
export function skillItemData(skill: SketchSkill, sketch: Pick<NpcSketch, "attributes" | "secondary">): {
  name: string;
  type: "skill";
  system: { attribute: SketchAttributeKey; difficulty: Difficulty; points: number };
} {
  const score = sketchAttributeScore(sketch, skill.attribute);
  return {
    name: skill.name,
    type: "skill",
    system: { attribute: skill.attribute, difficulty: skill.difficulty, points: pointsForLevel(skill.level, score, skill.difficulty) },
  };
}

/** The actor's own numbers and words, as the NPC data model keys them. */
export function sketchActorSystem(sketch: NpcSketch): Record<string, unknown> {
  return {
    attributes: { ...sketch.attributes },
    purchased: { ...sketch.secondary },
    groupSize: Math.max(1, Math.floor(sketch.groupSize) || 1),
    tactics: sketch.tactics,
    cannonFodder: sketch.cannonFodder,
    details: {
      appearance: sketch.appearance,
      notes: sketch.notes,
    },
  };
}

/** The sketch's point total, as the sheet will add it up: attributes, secondary levels, traits, skills. */
export function sketchPoints(sketch: NpcSketch): number {
  const attributes = (sketch.attributes.ST - 10) * 10 + (sketch.attributes.HT - 10) * 10 + (sketch.attributes.DX - 10) * 20 + (sketch.attributes.IQ - 10) * 20;
  const s = sketch.secondary;
  const secondary = s.hp * 2 + s.fp * 3 + (s.will + s.per) * 5 + s.basicMove * 5 + Math.round(s.basicSpeed * 4) * 5;
  const traits = sketch.traits.reduce((total, trait) => total + trait.points, 0);
  const skills = sketch.skills.reduce((total, skill) => total + skillItemData(skill, sketch).system.points, 0);
  return attributes + secondary + traits + skills;
}
