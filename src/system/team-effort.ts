/**
 * Team efforts (GURPS Basic Set Revised p. 185).
 *
 * When every PC must roll against a vital skill that some of the party lack,
 * the GM may roll once for the whole team: the group's best skill level, plus
 * the number who know the skill (at least a point in it -- no defaults),
 * less the size of the group. The result applies to everybody. The party
 * sheet offers it for a skill; a resistance roll is a personal challenge, so
 * only skills are offered.
 */

import { isRuleOn } from "./optional-rules.js";
import { membersOf } from "./party.js";
import { skillName } from "./pending-modifiers.js";
import { rollSuccess } from "./roll.js";
import { teamEffort, type TeamEffort } from "../rules/complementary.js";

const L = (key: string, data?: Record<string, unknown>) =>
  data
    ? game.i18n.format(`GWORLD.TeamEffort.${key}`, data)
    : game.i18n.localize(`GWORLD.TeamEffort.${key}`);

/** One member of the party as a team effort reads them, for a skill. */
export interface TeamEffortMember {
  actor: any;
  name: string;
  /** Their level in the skill: null where they have none of their own. */
  level: number | null;
  points: number;
  /** Whether they know it: at least a point, no defaults. */
  knows: boolean;
}

/** The party's members and what each has of a skill, by name. */
export function teamEffortMembers(party: any, skill: string): TeamEffortMember[] {
  const wanted = skillName(skill);
  return membersOf(party).map((actor: any) => {
    const item = [...(actor.items ?? [])].find(
      (i: any) => i?.type === "skill" && skillName(String(i.name ?? "")) === wanted,
    );
    const level =
      typeof item?.system?.derived?.level === "number" ? item.system.derived.level : null;
    const points = Number(item?.system?.points ?? 0) || 0;
    return {
      actor,
      name: String(actor.name ?? ""),
      level,
      points,
      knows: level !== null && points > 0,
    };
  });
}

/** The roll a group of members would make, or null where none of them knows the skill. */
export function teamEffortFor(members: readonly TeamEffortMember[]): TeamEffort | null {
  return teamEffort(members.map((m) => ({ level: m.level, points: m.points })));
}

/** What the dialog asks: who takes part, and a situational modifier. */
export interface TeamEffortAnswer {
  members: TeamEffortMember[];
  modifier: number;
}

/** Asks who is in the effort (everyone, to begin with: the GM takes out whoever is out of contact) and the modifier. */
export async function promptForTeamEffort(
  skill: string,
  members: readonly TeamEffortMember[],
): Promise<TeamEffortAnswer | null> {
  const esc = foundry.utils.escapeHTML;
  const row = "display:flex;align-items:center;justify-content:space-between;gap:8px";
  const list = members
    .map((m, i) => {
      const what = m.knows ? L("Knows", { level: m.level ?? 0 }) : L("DoesNotKnow");
      return `<label style="${row}"><span><input type="checkbox" name="member" value="${i}" checked> ${esc(m.name)}</span><em>${esc(what)}</em></label>`;
    })
    .join("");
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("DialogTitle", { skill }) },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p class="hint">${esc(L("DialogHint"))}</p>
      ${list}
      <label style="${row}"><span>${esc(game.i18n.localize("GWORLD.Chat.Modifier"))}</span>
        <input type="number" name="modifier" value="0" step="1" style="width:80px"></label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const chosen = [
          ...(form?.querySelectorAll<HTMLInputElement>('input[name="member"]:checked') ?? []),
        ].map((box) => Number(box.value));
        return {
          members: members.filter((_m, i) => chosen.includes(i)),
          modifier:
            Number(form?.querySelector<HTMLInputElement>('input[name="modifier"]')?.value) || 0,
        };
      },
    },
    rejectClose: false,
  });
  return result && typeof result === "object" ? (result as TeamEffortAnswer) : null;
}

/**
 * Rolls a team effort for a skill: once, as the member with the best level,
 * against that level plus the number who know the skill and less the size of
 * the group. The card names the team, since its result applies to all of them.
 * Resolves to the roll's outcome, or null where nothing was rolled.
 */
export async function rollTeamEffort(options: {
  members: readonly TeamEffortMember[];
  skill: string;
  modifier?: number;
}): Promise<Awaited<ReturnType<typeof rollSuccess>>> {
  if (!isRuleOn("teamEfforts")) return null;
  const effort = teamEffortFor(options.members);
  if (!effort) {
    ui.notifications?.warn(L("NobodyKnows", { skill: options.skill }));
    return null;
  }
  // The one who rolls is the member with the best skill.
  const leader = options.members.find((m) => m.knows && m.level === effort.best);
  if (!leader) return null;

  const others = options.members.filter((m) => m !== leader).map((m) => m.name);
  const modifier = Number(options.modifier) || 0;
  const rolled = await rollSuccess({
    actor: leader.actor,
    base: effort.best,
    label: L("Label", { skill: options.skill }),
    kind: "skill",
    skill: options.skill,
    tags: ["teamEffort"],
    modifiers: [
      { label: L("Knowers"), value: effort.bonus },
      { label: L("GroupSize"), value: -effort.penalty },
      ...(modifier !== 0
        ? [{ label: game.i18n.localize("GWORLD.Chat.Situational"), value: modifier }]
        : []),
    ],
  });
  if (!rolled) return null;

  const esc = foundry.utils.escapeHTML;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: leader.actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content:
      `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("Title"))}</span>` +
      `<span class="gc-target">${esc(options.skill)}</span></div>` +
      `<div class="gc-note">${esc(L("Arithmetic", { best: effort.best, leader: leader.name, bonus: effort.bonus, size: effort.penalty }))}</div>` +
      `<div class="gc-note">${esc(L(rolled.success ? "AppliesSuccess" : "AppliesFailure", { names: [leader.name, ...others].join(", ") }))}</div>` +
      `</div>`,
  });
  return rolled;
}
