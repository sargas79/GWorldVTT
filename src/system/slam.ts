/**
 * Slamming into and shoving a foe (GURPS Basic Set: Campaigns pp. 371-372).
 *
 * Every kind rolls to hit first, as an attack the targeted foe defends
 * against on the usual card. A slam, flying tackle, pounce or shield rush
 * that hits goes on to the damage both sides roll and who falls; a shove that
 * hits rolls its knockback, which never injures. Modules may add their own
 * ways to slam or shove (API 1.31.0): another skill, another bonus, a
 * one-handed shove, something else to take the slammer's damage, or two foes
 * at once.
 *
 * Each roll says what it is (since API 1.139.0): the slammer's blow is
 * `source: "slam"`, what the slammer takes back is `"slammed"`, and a shove's
 * knockback roll is `"shove"`, so a module's gear can add to a slam's damage,
 * or guard against it, without touching any other crushing blow.
 */

import { isRuleOn } from "./optional-rules.js";
import { damageDistance, rollDamage, rollSuccess } from "./roll.js";
import { callCombatHook, COMBAT_HOOKS } from "./combat-extensions.js";
import { targetedTokens, withTargets } from "./targets.js";
import { attributeOf } from "./attributes.js";
import { shoveDamage, slamDamage, slamOutcome, slamSkills, slamToHit, type SlamKind } from "../rules/attack-options.js";
import { knockback, strongAttackDamageBonus } from "../rules/maneuvers.js";
import { formatDiceAdds, parseDiceAdds, toRollFormula } from "../rules/dice.js";
import { normalizeSkillName } from "../rules/skills.js";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Slam.${key}`, data) : game.i18n.localize(`GWORLD.Slam.${key}`);

/** What a module's slam or shove rolls with, and what it changes. */
export interface SlamPreparation {
  /** The skill rolled to hit, and its level. */
  skill: { name: string; level: number };
  /** Added to the roll to hit. */
  toHit?: number;
  /** Added to the slammer's damage roll, or to a shove's. */
  damageBonus?: number;
  /** A shove with one hand: -1 per die. */
  oneHanded?: boolean;
  /** 1, or 2 foes at once: rolled to hit separately, one damage roll split between them. */
  foes?: 1 | 2;
  /** What takes the slammer's damage in the slammer's place. */
  bearer?: string;
  /** Anything worth saying on the card. */
  notes?: string[];
}

export interface SlamRegistration {
  module: string;
  key: string;
  label: string;
  kind: "slam" | "shove";
  available?: (actor: any) => boolean;
  prepare: (actor: any) => SlamPreparation | null;
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const variants: Array<{ id: string; label: string; kind: "slam" | "shove"; available: (actor: any) => boolean; prepare: SlamRegistration["prepare"] }> = [];

/** Registers a module's slam or shove (since 1.31.0). Returns its `<module>.<key>`, or null. */
export function registerSlam(registration: SlamRegistration): string | null {
  const r = registration ?? ({} as SlamRegistration);
  const id = `${r.module}.${r.key}`;
  const refuse = (why: string) => {
    console.warn(`gworld | slam ${id} not registered: ${why}`);
    return null;
  };
  if (typeof r.module !== "string" || !IDENTIFIER.test(r.module) || typeof r.key !== "string" || !IDENTIFIER.test(r.key)) return refuse("the module id or key is missing or malformed");
  if (typeof r.label !== "string" || !r.label.trim()) return refuse("it has no label");
  if (r.kind !== "slam" && r.kind !== "shove") return refuse('kind must be "slam" or "shove"');
  if (typeof r.prepare !== "function") return refuse("it has no prepare function");
  if (variants.some((v) => v.id === id)) return refuse("that key is already registered");
  variants.push({ id, label: r.label.trim(), kind: r.kind, available: typeof r.available === "function" ? r.available : () => true, prepare: r.prepare });
  return id;
}

/** A skill's level, or an attribute's for `DX`; `Shield` takes whichever Shield specialty is best. */
function levelOf(actor: any, name: string): number | null {
  if (name === "DX") return attributeOf(actor, "DX");
  const wanted = normalizeSkillName(name);
  let best: number | null = null;
  for (const item of actor?.items ?? []) {
    if (item?.type !== "skill") continue;
    const own = normalizeSkillName(String(item.name ?? ""));
    const matches = name === "Shield" ? own === wanted || own.startsWith(`${wanted} (`) : own === wanted;
    const level = item.system?.derived?.level;
    if (matches && typeof level === "number" && (best === null || level > best)) best = level;
  }
  return best;
}

function bestOf(actor: any, names: readonly string[]): { name: string; level: number } | null {
  let best: { name: string; level: number } | null = null;
  for (const name of names) {
    const level = levelOf(actor, name);
    if (level !== null && (best === null || level > best.level)) best = { name, level };
  }
  return best;
}

const readyShield = (actor: any) => [...(actor?.items ?? [])].find((item: any) => item.type === "shield" && item.system?.equipped) ?? null;

/** What the system's own kinds roll with. */
function prepareOwn(actor: any, kind: SlamKind): SlamPreparation | null {
  const skill = bestOf(actor, slamSkills(kind));
  if (!skill) return null;
  const shield = kind === "shieldRush" ? readyShield(actor) : null;
  return {
    skill,
    toHit: slamToHit(kind),
    damageBonus: shield ? Number(actor.system?.derived?.shieldDb ?? shield.system?.db ?? 0) || 0 : 0,
    ...(shield ? { bearer: String(shield.name ?? "") } : {}),
  };
}

async function post(actor: any, title: string, lines: string[]): Promise<void> {
  const escape = (text: string) => foundry.utils.escapeHTML(text);
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${escape(title)}</span></div>
      ${lines.map((line) => `<div class="gc-result">${escape(line)}</div>`).join("")}</div>`,
  });
}

/** Asks which slam or shove, and how far the slammer came. */
async function ask(actor: any, kind: "slam" | "shove"): Promise<{ choice: string; velocity: number; oneHanded: boolean } | null> {
  const own: SlamKind[] = kind === "shove" ? ["shove"] : ["slam", "flyingTackle", "pounce", ...(readyShield(actor) ? ["shieldRush" as const] : [])];
  const offered = [
    ...own.map((k) => ({ value: k, label: L(`Kinds.${k}`) })),
    ...variants.filter((v) => v.kind === kind).filter((v) => {
      try { return v.available(actor) === true; } catch { return false; }
    }).map((v) => ({ value: v.id, label: v.label })),
  ];
  const options = offered.map((o) => `<option value="${o.value}">${foundry.utils.escapeHTML(o.label)}</option>`).join("");
  const row = (label: string, control: string) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${label}</span>${control}</label>`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L(kind === "shove" ? "ShoveTitle" : "Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      ${row(L("Kind"), `<select name="choice" style="width:220px">${options}</select>`)}
      ${kind === "slam"
        ? row(L("Velocity"), `<input type="number" name="velocity" value="${Number(actor.system?.derived?.encumbrance?.move ?? 1)}" min="0" step="1" style="width:90px">`)
        : row(L("Hands"), `<select name="hands" style="width:220px"><option value="2">${L("BothHands")}</option><option value="1">${L("OneHand")}</option></select>`)}
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          choice: form?.querySelector<HTMLSelectElement>('select[name="choice"]')?.value ?? own[0],
          velocity: Math.max(0, Number(form?.querySelector<HTMLInputElement>('input[name="velocity"]')?.value ?? 0) || 0),
          oneHanded: form?.querySelector<HTMLSelectElement>('select[name="hands"]')?.value === "1",
        };
      },
    },
    rejectClose: false,
  });
  return result && typeof result === "object" ? (result as { choice: string; velocity: number; oneHanded: boolean }) : null;
}

/** The Slam and Shove buttons: asks, rolls to hit against each foe, and works out what the hits do. */
export async function slamOrShove(actor: any, kind: "slam" | "shove"): Promise<void> {
  if (!isRuleOn("slams")) return;
  const asked = await ask(actor, kind);
  if (!asked) return;
  const variant = variants.find((v) => v.id === asked.choice) ?? null;
  const ownKind = (variant ? null : asked.choice) as SlamKind | null;
  let prep: SlamPreparation | null = null;
  try {
    prep = variant ? variant.prepare(actor) : prepareOwn(actor, ownKind ?? "slam");
  } catch (error) {
    console.warn(`gworld | slam ${variant?.id} failed`, error);
  }
  if (prep && ownKind === "shove") prep.oneHanded = asked.oneHanded;
  if (!prep || !prep.skill || !Number.isFinite(Number(prep.skill.level))) {
    ui.notifications?.warn(L("NoSkill"));
    return;
  }
  const label = variant?.label ?? L(`Kinds.${ownKind}`);
  const foesWanted = prep.foes === 2 ? 2 : 1;
  const targeted = targetedTokens().filter((token: any) => token?.actor);
  if (foesWanted === 2 && targeted.length !== 2) {
    ui.notifications?.warn(L("TwoFoes"));
    return;
  }
  const foes: any[] = targeted.slice(0, foesWanted);

  // To hit, against each foe in turn (p. 371) -- the -4 and cap of a Move and Attack don't apply.
  const toHit = Number(prep.toHit) || 0;
  const hits: any[] = [];
  for (const foe of foes.length ? foes : [null]) {
    const outcome = await withTargets(foe ? [foe] : [], () => rollSuccess({
      actor,
      base: Number(prep!.skill.level),
      kind: "attack",
      label: foe ? L("HitLabel", { kind: label, foe: String(foe.actor?.name ?? foe.name ?? "") }) : label,
      skill: prep!.skill.name === "DX" ? "" : prep!.skill.name,
      modifiers: toHit ? [{ label, value: toHit }] : [],
      delivery: "unarmed",
      damageType: "cr",
      unarmed: true,
      tags: [kind],
    }));
    if (outcome?.success && !outcome.criticalFailure) hits.push(foe);
  }

  // A flying tackle ends lying down, hit or miss; a pounce rolls to stay up (p. 372).
  if (ownKind === "flyingTackle" && actor?.isOwner) await actor.update({ "system.posture": "lying" });
  if (ownKind === "pounce") {
    const stay = bestOf(actor, ["DX", "Acrobatics", "Jumping"]);
    const standing = stay ? await rollSuccess({ actor, base: stay.level, label: L("StayStanding"), kind: stay.name === "DX" ? "attribute" : "skill", ...(stay.name === "DX" ? {} : { skill: stay.name }) }) : null;
    if (!standing?.success && actor?.isOwner) await actor.update({ "system.posture": "lying" });
  }
  if (hits.length === 0) return;

  if (kind === "shove") return shove(actor, prep, label, hits, foesWanted);
  return slam(actor, prep, label, hits, foesWanted, asked.velocity);
}

async function slam(actor: any, prep: SlamPreparation, label: string, hits: any[], foesWanted: number, velocity: number): Promise<void> {
  const mine = slamDamage(Number(actor.system?.hp?.max ?? 0), velocity);
  const strong = actor?.system?.maneuver === "allOutAttack" && actor.system.allOutAttackOption === "strong"
    ? strongAttackDamageBonus(mine.dice)
    : 0;
  const dealt = await rollDamage({
    actor,
    label: L("Label", { yards: velocity }),
    formula: formatDiceAdds({ dice: mine.dice, adds: mine.modifier }),
    damageType: "cr",
    modifiers: [
      ...(prep.damageBonus ? [{ label, value: Number(prep.damageBonus) }] : []),
      ...(strong ? [{ label: game.i18n.localize("GWORLD.Maneuver.AllOutAttackOption.strong"), value: strong }] : []),
    ],
    source: "slam",
  });
  // Two foes at once split one roll between them; one foe takes it all.
  const each = foesWanted === 2 ? Math.floor(dealt / 2) : dealt;
  for (const foe of hits) {
    const victim = foe?.actor;
    if (!victim) continue;
    const theirs = slamDamage(Number(victim.system?.hp?.max ?? 0), velocity);
    const taken = await rollDamage({
      actor: victim,
      label: L("Back", { name: String(victim.name ?? ""), yards: velocity }),
      formula: formatDiceAdds({ dice: theirs.dice, adds: theirs.modifier }),
      damageType: "cr",
      // Rolled on the foe's HP, but it is the blow the slammer takes back, and
      // gear worn to slam with may guard against it and nothing else.
      source: "slammed",
    });
    const outcome = slamOutcome(each, taken);
    await post(actor, label, [
      L(`Outcome.${outcome}`, { slammer: String(actor.name ?? ""), foe: String(victim.name ?? ""), dealt: each, taken }),
      ...(prep.bearer ? [L("Bearer", { bearer: prep.bearer, taken })] : []),
      ...(prep.notes ?? []),
    ]);
  }
}

async function shove(actor: any, prep: SlamPreparation, label: string, hits: any[], foesWanted: number): Promise<void> {
  const thrust = parseDiceAdds(String(actor.system?.derived?.thrust ?? "1d-2")) ?? { dice: 1, adds: -2 };
  const dice = shoveDamage(thrust, prep.oneHanded === true);
  const given = formatDiceAdds({ dice: dice.dice, adds: dice.adds + (Number(prep.damageBonus) || 0) });
  // A shove's roll never injures, so it gets no damage card; but it is the
  // shover's damage all the same, and a module's lines reach it as they do a
  // slam's (since 1.139.0), tagged so a listener can tell it apart.
  const hooked = callCombatHook(COMBAT_HOOKS.damageModifiers, {
    actor, item: null, mode: null, label, formula: given, damageType: "cr" as const,
    modifiers: [] as Array<{ label: string; value: number }>,
    distanceYards: damageDistance(actor, undefined),
    source: "shove",
  });
  const parsed = (typeof hooked.formula === "string" ? parseDiceAdds(hooked.formula) : null) ?? parseDiceAdds(given)!;
  const bonus = (Array.isArray(hooked.modifiers) ? hooked.modifiers : [])
    .reduce((sum, m) => sum + (typeof m?.value === "number" && Number.isFinite(m.value) ? m.value : 0), 0);
  const rolled = { ...parsed, adds: parsed.adds + bonus };
  const formula = formatDiceAdds(rolled);
  const roll = new Roll(toRollFormula(rolled));
  await roll.evaluate();
  const basic = Math.max(0, Number(roll.total) || 0);
  // Doubled for one foe (p. 372); two foes each take the basic roll.
  const knock = foesWanted === 2 ? basic : basic * 2;
  const lines = [L("ShoveRoll", { formula, basic, knock })];
  for (const foe of hits) {
    const victim = foe?.actor;
    if (!victim) continue;
    const pushed = knockback({ basicDamage: knock, type: "cr", penetratedDr: true, targetStrength: attributeOf(victim, "ST") });
    lines.push(pushed.yards > 0
      ? L("Pushed", { foe: String(victim.name ?? ""), yards: pushed.yards, penalty: pushed.fallRollPenalty ? ` ${pushed.fallRollPenalty}` : "" })
      : L("NotPushed", { foe: String(victim.name ?? "") }));
  }
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${foundry.utils.escapeHTML(label)}</span></div>
      ${[...lines, ...(prep.notes ?? [])].map((line) => `<div class="gc-result">${foundry.utils.escapeHTML(line)}</div>`).join("")}</div>`,
    rolls: [roll],
  });
}
