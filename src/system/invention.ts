/**
 * Inventing things (GURPS Basic Set: Campaigns pp. 472-474).
 *
 * The rules were all written and only one of them -- how many programs a
 * computer runs at once -- ever reached a sheet. An inventor could not roll a
 * Concept, build a Prototype, or find out how many bugs it came out with.
 *
 * Two rolls, in order. The Concept roll asks whether there is a testable
 * theory at all and may be tried once a day; the Prototype roll builds it,
 * costs money and time, and decides the bugs. Both hang off the same grade of
 * difficulty, which is read off the retail price or, for software, off its
 * Complexity -- and eased a step for every TL the inventor is ahead of it.
 */

import { SYSTEM_ID } from "./constants.js";
import { resolveSuccess } from "../rules/success.js";
import { formatDiceAdds } from "../rules/dice.js";
import {
  facilitiesCost,
  fitsAtOnce,
  conceptModifier,
  gradeForComplexity,
  gradeForPrice,
  gradeRow,
  halveDice,
  prototypeBugs,
  prototypeModifier,
  prototypeTime,
  reinventing,
  WORKSHOP_EXPLOSION,
  MINIMUM_INVENTION_DAYS,
  type InventionGrade,
} from "../rules/invention.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/invention.hbs`;

const L = (key: string, data?: Record<string, unknown>) =>
  data
    ? game.i18n.format(`GWORLD.Invention.${key}`, data)
    : game.i18n.localize(`GWORLD.Invention.${key}`);

/** What the inventor is trying to make, and how. */
export interface InventionPlan {
  /** "price" reads the grade off a retail price; "software" off a Complexity; "grade" is set by hand. */
  basis: "price" | "software" | "grade";
  retail: number;
  complexity: number;
  grade: InventionGrade;
  inventorTl: number;
  inventionTl: number;
  workingModel: boolean;
  knownToExist: boolean;
  variant: number;
  newTechnology: boolean;
  wellDescribed: number;
  /** The inventor's level in the invention skill the GM picked. */
  skill: number;
  assistants: number;
  poorTools: number;
  people: number;
  reusingFacilities: boolean;
  /** For software: the Complexity of the machine it is being written for, or 0. */
  computer: number;
}

/**
 * The grade an invention is, all things considered (p. 473).
 *
 * Read off the price or the Complexity where there is one, then eased: "Reduce
 * complexity by one step per TL by which the inventor's TL exceeds that of the
 * invention, to a minimum of Simple."
 */
export function inventionGrade(plan: InventionPlan): InventionGrade {
  const raw =
    plan.basis === "price"
      ? gradeForPrice(plan.retail)
      : plan.basis === "software"
        ? gradeForComplexity(plan.complexity)
        : plan.grade;
  return reinventing({ grade: raw, inventorTl: plan.inventorTl, inventionTl: plan.inventionTl });
}

/** Everything the two rolls need, worked out before either is made. */
export function inventionFigures(plan: InventionPlan): {
  grade: InventionGrade;
  requiredSkill: number;
  concept: number;
  prototype: number;
  facilities: number;
  time: ReturnType<typeof prototypeTime>;
  aheadOfItsTime: boolean;
  /** For software written for a named machine: whether it will run there at all. */
  runsOnTarget: boolean | null;
} {
  const grade = inventionGrade(plan);
  const aheadOfItsTime = plan.inventionTl > plan.inventorTl;
  const concept = conceptModifier({
    grade,
    complexity: plan.basis === "software" ? plan.complexity : null,
    workingModel: plan.workingModel,
    knownToExist: plan.knownToExist,
    variant: plan.variant,
    newTechnology: plan.newTechnology,
    aheadOfItsTime,
    wellDescribed: plan.wellDescribed,
  });

  return {
    grade,
    requiredSkill: gradeRow(grade).skill,
    concept,
    prototype: prototypeModifier({ concept, assistants: plan.assistants, poorTools: plan.poorTools }),
    facilities: facilitiesCost({ grade, aheadOfItsTime, reusingFacilities: plan.reusingFacilities }),
    time: prototypeTime({ grade, people: plan.people }),
    aheadOfItsTime,
    runsOnTarget:
      plan.basis === "software" && plan.computer > 0
        ? fitsAtOnce({ computer: plan.computer, programs: [plan.complexity] })
        : null,
  };
}

/**
 * Makes one of the two rolls (pp. 473-474).
 *
 * "The inventor must know this skill to have any chance of success", and the
 * grade names the level below which there is no chance at all -- so an
 * inventor short of it is told so rather than rolled.
 */
export async function rollInvention(options: {
  actor: any;
  plan: InventionPlan;
  stage: "concept" | "prototype";
}): Promise<void> {
  const { actor, plan, stage } = options;
  if (!actor?.isOwner) return;

  const figures = inventionFigures(plan);
  const modifier = stage === "concept" ? figures.concept : figures.prototype;
  const target = plan.skill + modifier;
  const short = plan.skill < figures.requiredSkill;

  let roll: any = null;
  let dice: number[] = [];
  let outcome: ReturnType<typeof resolveSuccess> | null = null;
  const lines: Array<{ key: string; data?: Record<string, unknown>; grave?: boolean }> = [];

  if (!short) {
    roll = new Roll("3d6");
    await roll.evaluate();
    dice = (roll.dice[0]?.results ?? []).map((r: { result: number }) => r.result);
    outcome = resolveSuccess(roll.total, target, dice);
  }

  if (stage === "prototype") {
    lines.push({ key: "Facilities", data: { cost: figures.facilities } });
    lines.push({
      key: "Time",
      data: {
        dice: formatDiceAdds(figures.time.dice),
        unit: L(`Unit.${figures.time.unit}`),
        people: figures.time.dividedBy,
        minimum: MINIMUM_INVENTION_DAYS,
      },
    });

    if (outcome) {
      const bugs = prototypeBugs({
        success: outcome.success,
        margin: outcome.margin,
        criticalSuccess: outcome.criticalSuccess,
      });
      if (bugs?.flawless) lines.push({ key: "Flawless" });
      else if (bugs) {
        // "1d/2" bugs are rolled here, so the card carries a number.
        const count = async (die: { dice: number; adds: number } | null, half: boolean) => {
          if (!die) return 0;
          const r = new Roll(`${die.dice}d6`);
          await r.evaluate();
          return half ? halveDice(r.total) : r.total;
        };
        const major = await count(bugs.major, true);
        // Minor bugs are 1d/2 on a wide success and a full 1d alongside major ones.
        const minor = await count(bugs.minor, bugs.major === null);
        if (bugs.major) lines.push({ key: "MajorBugs", data: { count: major }, grave: major > 0 });
        lines.push({ key: "MinorBugs", data: { count: minor } });
      }
      // "On a critical failure ... it inflicts at least 2d damage to the
      // inventor and each assistant."
      if (outcome.criticalFailure) {
        lines.push({ key: "Explodes", data: { damage: formatDiceAdds(WORKSHOP_EXPLOSION) }, grave: true });
      }
    }
  }

  // "On a critical failure, the inventor comes up with a 'flawed theory' that
  // looks good but that will never work in practice" (p. 473). Which only
  // works as a rule if the player cannot tell, so the Concept card goes to the
  // GM alone -- "the GM makes a secret 'Concept roll'".
  if (stage === "concept" && outcome?.criticalFailure) lines.push({ key: "FlawedTheory", grave: true });

  if (figures.runsOnTarget === false) lines.push({ key: "WontRun", data: { computer: plan.computer }, grave: true });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    // The Concept roll is the GM's secret; the Prototype is built in the open.
    ...(stage === "concept"
      ? { whisper: ChatMessage.implementation.getWhisperRecipients("GM").map((u: any) => u.id), blind: true }
      : {}),
    content: await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
      title: L(stage === "concept" ? "ConceptTitle" : "PrototypeTitle", { name: String(actor.name ?? "") }),
      grade: L(`Grade.${figures.grade}`),
      requiredSkill: figures.requiredSkill,
      short,
      target,
      skill: plan.skill,
      modifier,
      dice,
      total: roll?.total ?? null,
      outcome,
      lines,
    }),
    ...(roll ? { rolls: [roll] } : {}),
  });
}
