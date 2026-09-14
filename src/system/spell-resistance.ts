/**
 * Resisted spells (GURPS Basic Set: Characters pp. 241-242; Campaigns
 * p. 349).
 *
 * A Resisted spell that was cast successfully is not yet a spell that
 * worked: "The subject then attempts a resistance roll ... Compare the
 * subject's resistance roll to your skill roll in a Quick Contest." The
 * subject's half is theirs to roll, and "A conscious subject ... may choose
 * not to resist", so the casting posts a card with the caster's half on it
 * and a button for each subject, the way an attack posts its defense card.
 *
 * The caster's skill is capped by the Rule of 16 when the subject is a
 * living being, and the subject's Magic Resistance adds to their roll --
 * twice, against an Area spell.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { promptForNumber } from "./roll.js";
import { quickContest, resolveSuccess } from "../rules/success.js";
import {
  resistanceAttribute,
  resistanceScore,
  ruleOf16,
  spellAffects,
  subjectIsLiving,
} from "../rules/spell-attacks.js";

const RESIST_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/spell-resist.hbs`;
const ROLL_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/success-roll.hbs`;

const L = (key: string) => game.i18n.localize(`GWORLD.Resist.${key}`);

/** What the resistance card remembers of the casting. */
interface ResistFlag {
  spell: string;
  casterName: string;
  casterRoll: number;
  casterEffective: number;
  resistedBy: string;
  area: boolean;
  subjects: Array<{ uuid: string; name: string }>;
  /**
   * False for a resistance that is not to magic -- a Malediction's Quick
   * Contest (Characters p. 106) -- which Magic Resistance does nothing to.
   */
  magical?: boolean;
  /** Set on cards posted before 1.5.0 for an effect resisted with the better of HT or Will. */
  ritual?: boolean;
  /** The attributes whose best the subject resists with, for a module's effect. */
  resistWith?: string[];
  /** False where the Rule of 16 does not cap the caster. */
  ruleOf16?: boolean;
}

/**
 * A module's effect, resisted on the system's card (API 1.9.0): the subjects
 * resist with the best of `resistWith` (Will when it is left out), plus Magic
 * Resistance unless `magical` is false.
 */
export function postResistance(options: {
  caster: any;
  label: string;
  casterRoll: number;
  casterEffective: number;
  subjects: any[];
  resistWith?: string[];
  magical?: boolean;
  area?: boolean;
  ruleOf16?: boolean;
}): Promise<void> {
  const resistWith = (options?.resistWith ?? ["Will"]).filter((name) => resistanceAttribute(String(name)) !== null);
  const names = resistWith.length ? resistWith : ["Will"];
  return postResistCard({
    caster: options.caster,
    spell: String(options.label ?? ""),
    casterRoll: Number(options.casterRoll) || 0,
    casterEffective: Number(options.casterEffective) || 0,
    resistedBy: names.join(" / "),
    area: Boolean(options.area),
    subjects: options.subjects ?? [],
    resistWith: names,
    ...(options.magical === false ? { magical: false } : {}),
    ...(options.ruleOf16 === false ? { ruleOf16: false } : {}),
  });
}

/** Posts the caster's half of a Resisted spell, with a roll for each subject. */
export async function postResistCard(options: {
  caster: any;
  spell: string;
  casterRoll: number;
  casterEffective: number;
  resistedBy: string;
  area: boolean;
  subjects: any[];
  /** False where Magic Resistance does not apply. Spells leave it out. */
  magical?: boolean;
  /** The attributes whose best the subject resists with. */
  resistWith?: string[];
  /** False where the Rule of 16 does not cap the caster. */
  ruleOf16?: boolean;
}): Promise<void> {
  const flag: ResistFlag = {
    spell: options.spell,
    casterName: String(options.caster?.name ?? ""),
    casterRoll: options.casterRoll,
    casterEffective: options.casterEffective,
    resistedBy: options.resistedBy,
    area: options.area,
    subjects: options.subjects.map((subject) => ({
      uuid: String(subject.uuid),
      name: String(subject.name ?? ""),
    })),
    ...(options.magical === false ? { magical: false } : {}),
    ...(options.resistWith?.length ? { resistWith: [...options.resistWith] } : {}),
    ...(options.ruleOf16 === false ? { ruleOf16: false } : {}),
  };

  const content = await foundry.applications.handlebars.renderTemplate(RESIST_TEMPLATE, {
    spell: options.spell,
    resistedBy: options.resistedBy,
    area: options.area,
    casterRoll: options.casterRoll,
    casterSkill: options.casterEffective,
    casterMargin: Math.max(0, options.casterEffective - options.casterRoll),
    subjects: flag.subjects,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: options.caster }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    flags: { [SYSTEM_ID]: { resist: flag } },
  });
}

function resistFlag(message: any): ResistFlag | null {
  const flag = message?.getFlag?.(SYSTEM_ID, "resist");
  if (!flag || !Array.isArray(flag.subjects)) return null;
  return flag as ResistFlag;
}

/** Adds a resistance roll for each subject this user may roll for. */
export async function addResistControls(message: any, html: HTMLElement): Promise<void> {
  const flag = resistFlag(message);
  if (!flag) return;

  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-resist]")) return;

  for (const entry of flag.subjects) {
    const subject: any = await fromUuid(entry.uuid).catch(() => null);
    if (!subject?.isOwner) continue;

    const row = document.createElement("div");
    row.className = "gc-apply";
    row.dataset.gworldResist = entry.uuid;

    const who = document.createElement("div");
    who.className = "gc-who";
    who.textContent = String(subject.name ?? entry.name);
    row.append(who);

    const resistance = flag.magical === false ? 0 : Number(subject.system?.derived?.magic?.magicResistance ?? 0) || 0;
    const score = resistingScore(subject, flag);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gc-apply-button";
    button.textContent =
      score === null
        ? `${L("Resist")} ${flag.resistedBy}…`
        : `${L("Resist")} ${flag.resistedBy} ${resistanceScore({ score, magicResistance: resistance, area: flag.area })}`;
    button.addEventListener("click", () => {
      void rollResistance(subject, flag);
    });
    row.append(button);
    root.append(row);
  }
}

/**
 * What a subject resists with, before Magic Resistance: the best of the
 * attributes a module named (or HT and Will, on an older card), or the
 * attribute the spell's record names. Null where the record names something
 * else, and the subject is asked.
 */
function resistingScore(subject: any, flag: ResistFlag): number | null {
  const named = (flag.resistWith ?? []).map((name) => resistanceAttribute(name)).filter((a): a is NonNullable<typeof a> => a !== null);
  if (named.length) return Math.max(...named.map((attribute) => attributeOf(subject, attribute)));
  if (flag.ritual) return Math.max(attributeOf(subject, "HT"), attributeOf(subject, "Will"));
  const attribute = resistanceAttribute(flag.resistedBy);
  return attribute === null ? null : attributeOf(subject, attribute);
}

/** A subject's score in an attribute, Will and Per included. */
function attributeOf(subject: any, attribute: string): number {
  const derived = subject?.system?.derived ?? {};
  if (attribute === "Will") return Number(derived.will) || 10;
  if (attribute === "Per") return Number(derived.per) || 10;
  return Number(derived.attributes?.[attribute] ?? subject?.system?.attributes?.[attribute]) || 10;
}

/**
 * Rolls one subject's resistance and settles the Quick Contest.
 *
 * Where the record names something other than an attribute -- another spell,
 * "Will or skill", a lock -- the subject is asked for the score.
 */
async function rollResistance(subject: any, flag: ResistFlag): Promise<void> {
  let score: number | null = resistingScore(subject, flag);
  if (score === null) {
    score = await promptForNumber({
      title: `${L("Resist")} ${flag.spell}`,
      label: game.i18n.format("GWORLD.Resist.ScorePrompt", { with: flag.resistedBy }),
      initial: 10,
    });
    if (score === null) return;
  }

  const magicResistance = flag.magical === false ? 0 : Number(subject.system?.derived?.magic?.magicResistance ?? 0) || 0;
  const bonus = (flag.area ? 2 : 1) * magicResistance;
  const target = resistanceScore({ score, magicResistance, area: flag.area });

  // The Rule of 16 (Campaigns p. 349), for a living or sapient subject; "There
  // is no such limit if the subject is a spell" (p. 241).
  const capped =
    isRuleOn("ruleOf16") && flag.ruleOf16 !== false && (flag.resistWith?.length ? true : subjectIsLiving(flag.resistedBy))
      ? ruleOf16(flag.casterEffective, target)
      : flag.casterEffective;
  const caster = resolveSuccess(flag.casterRoll, capped);

  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice = (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
  const resisted = resolveSuccess(roll.total, target, dice);

  const affected = spellAffects({ caster, subject: resisted });
  const contest = quickContest(caster, resisted);

  const modifiers = bonus ? [{ label: game.i18n.localize("GWORLD.Spell.MagicResistance"), value: bonus }] : [];
  const content = await foundry.applications.handlebars.renderTemplate(ROLL_TEMPLATE, {
    label: game.i18n.format("GWORLD.Resist.Label", { name: String(subject.name), spell: flag.spell, with: flag.resistedBy }),
    kind: "skill",
    base: score,
    modifiers,
    totalModifier: bonus,
    effective: target,
    outcome: resisted,
    resultLabel: affected
      ? game.i18n.format("GWORLD.Resist.Affected", { spell: flag.spell, by: contest.marginOfVictory })
      : game.i18n.format("GWORLD.Resist.Resisted", {
          spell: flag.spell,
          caster: capped < flag.casterEffective
            ? game.i18n.format("GWORLD.Resist.CasterCapped", { skill: capped })
            : String(capped),
        }),
    resultClass: affected ? "failure" : "success",
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: subject }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
  });
}
