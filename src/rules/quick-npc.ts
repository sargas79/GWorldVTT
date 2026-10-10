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

/** The secondary levels a sketch can carry, bought or granted. */
export interface SketchSecondary { hp: number; will: number; per: number; fp: number; basicSpeed: number; basicMove: number }

/**
 * A racial template written onto the sketch (Characters p. 261): what it
 * granted, and the racial cost that paid for it. Recorded on the actor as the
 * sheet records a template it applied, so the cost is billed once and the
 * sheet can say what the NPC is.
 */
export interface SketchRacial {
  name: string;
  uuid: string;
  reference?: string;
  attributeCost: number;
  granted: Attributes & SketchSecondary & { sm: number };
}

/** The sketch of an NPC: what the Record Card has room for. */
export interface NpcSketch {
  name: string;
  appearance: string;
  attributes: Attributes;
  /** Levels bought on top of the attributes, as the sheet records them. */
  secondary: SketchSecondary;
  /** Attribute levels a racial template granted, free once its cost is paid. */
  racial: Attributes;
  /** Secondary levels granted the same way. */
  bonuses: SketchSecondary;
  /** Size Modifier, which a racial template often sets. */
  sm: number;
  /** The racial templates written on, for the record and the racial cost. */
  racialTemplates: SketchRacial[];
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
    racial: { ST: 0, DX: 0, IQ: 0, HT: 0 },
    bonuses: { ...EMPTY_SECONDARY },
    sm: 0,
    racialTemplates: [],
    skills: [],
    traits: [],
    gear: [],
    groupSize: 1,
    tactics: "",
    cannonFodder: false,
    notes: "",
  };
}

/** What the sketch's attributes and secondary levels come to: bought plus granted. */
export type SketchStats = Pick<NpcSketch, "attributes" | "secondary"> & Partial<Pick<NpcSketch, "racial" | "bonuses">>;

/** The attributes as the sheet will show them: bought, plus what a racial template granted. */
export function sketchAttributes(sketch: SketchStats): Attributes {
  const racial = sketch.racial ?? { ST: 0, DX: 0, IQ: 0, HT: 0 };
  return {
    ST: sketch.attributes.ST + racial.ST,
    DX: sketch.attributes.DX + racial.DX,
    IQ: sketch.attributes.IQ + racial.IQ,
    HT: sketch.attributes.HT + racial.HT,
  };
}

/** The secondary characteristics as the sheet will show them. */
export function sketchSecondary(sketch: SketchStats) {
  const bonuses = sketch.bonuses ?? EMPTY_SECONDARY;
  const levels: SketchSecondary = {
    hp: sketch.secondary.hp + bonuses.hp,
    will: sketch.secondary.will + bonuses.will,
    per: sketch.secondary.per + bonuses.per,
    fp: sketch.secondary.fp + bonuses.fp,
    basicSpeed: sketch.secondary.basicSpeed + bonuses.basicSpeed,
    basicMove: sketch.secondary.basicMove + bonuses.basicMove,
  };
  return secondaryCharacteristics(sketchAttributes(sketch), levels);
}

/** The score a skill is based on, with Will and Per read off the sketch's IQ. */
export function sketchAttributeScore(sketch: SketchStats, key: SketchAttributeKey): number {
  if (key === "Will") return sketchSecondary(sketch).will;
  if (key === "Per") return sketchSecondary(sketch).per;
  return sketchAttributes(sketch)[key];
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
export function levelOnSheet(skill: SketchSkill, sketch: SketchStats): number {
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
export function skillItemData(skill: SketchSkill, sketch: SketchStats): {
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
    racial: { ...sketch.racial },
    bonuses: { ...sketch.bonuses },
    sm: sketch.sm,
    // Recorded as the sheet records a template it applied, so the racial cost
    // is billed once. The items it brought are not listed, since the card's
    // rows are the NPC's own now: taking the template off leaves them.
    templates: sketch.racialTemplates.map((racial) => ({
      name: racial.name,
      kind: "racial",
      uuid: racial.uuid,
      reference: racial.reference ?? "",
      attributeCost: racial.attributeCost,
      granted: { ...racial.granted },
      previous: {},
      written: {},
      at: null,
      itemIds: [],
    })),
    groupSize: Math.max(1, Math.floor(sketch.groupSize) || 1),
    tactics: sketch.tactics,
    cannonFodder: sketch.cannonFodder,
    details: {
      appearance: sketch.appearance,
      notes: sketch.notes,
    },
  };
}

/** The sketch's point total, as the sheet will add it up: attributes, secondary levels, traits, skills, and the racial cost of what was granted. */
export function sketchPoints(sketch: NpcSketch): number {
  const attributes = (sketch.attributes.ST - 10) * 10 + (sketch.attributes.HT - 10) * 10 + (sketch.attributes.DX - 10) * 20 + (sketch.attributes.IQ - 10) * 20;
  const s = sketch.secondary;
  const secondary = s.hp * 2 + s.fp * 3 + (s.will + s.per) * 5 + s.basicMove * 5 + Math.round(s.basicSpeed * 4) * 5;
  const traits = sketch.traits.reduce((total, trait) => total + trait.points, 0);
  const skills = sketch.skills.reduce((total, skill) => total + skillItemData(skill, sketch).system.points, 0);
  const racial = sketch.racialTemplates.reduce((total, template) => total + template.attributeCost, 0);
  return attributes + secondary + traits + skills + racial;
}
