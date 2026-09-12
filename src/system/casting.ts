/**
 * Casting a spell from the sheet (GURPS Basic Set: Characters pp. 235-239).
 *
 * The dialog asks what the book leaves to the caster -- how much energy, how
 * wide an area, how far the subject is, how much of the cost to burn as HP --
 * and works the rest out: the mana here, what the caster's skill takes off the
 * cost and the time, what the spells still running cost, the target's Magic
 * Resistance. Then it rolls, pays what the outcome costs, reads the Critical
 * Spell Failure Table if it must, and puts a spell with a duration on the
 * caster's list of spells running, where it can be maintained or dropped.
 *
 * The arithmetic is all in `rules/casting.ts`; this is the asking, the dice
 * and the writing to the sheet.
 */

import { SYSTEM_ID } from "./constants.js";
import { setCondition, syncHealthConditions } from "./conditions.js";
import { applyFatigue } from "./fatigue.js";
import { isRuleOn } from "./optional-rules.js";
import { rollSuccess } from "./roll.js";
import { targetedTokens } from "./targets.js";
import { penaltyForRoll } from "../rules/attribute-penalties.js";
import {
  DISTRACTION_PENALTY,
  MANA_LEVELS,
  NO_RITUAL,
  areaEnergy,
  cancelCost,
  castingTimeAfterSkill,
  criticalFailuresAreMild,
  criticalSpellFailure,
  distancePenalty,
  effectiveMana,
  energyAfterSkill,
  energyBounds,
  energyOnOutcome,
  fatigueReturnsNextTurn,
  hpBurnPenalty,
  isExpired,
  isManaLevel,
  maintainedExpiry,
  maintenancePenalty,
  manaSkillModifier,
  mayCast,
  outcomeUnderMana,
  ritualForSkill,
  spellExpiry,
  subjectSizeEnergy,
  type ManaLevel,
  type Ritual,
} from "../rules/casting.js";
import { canAttempt, resolveSuccess } from "../rules/success.js";
import type { ActiveSpell } from "./data/character.js";

const CAST_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/spell-cast.hbs`;

/** The world setting holding the campaign's usual mana level. */
export const MANA_LEVEL_KEY = "manaLevel";
/** The scene flag that overrides it for one place. Blank means inherit. */
export const MANA_SCENE_FLAG = "manaLevel";

const L = (key: string) => game.i18n.localize(`GWORLD.Cast.${key}`);

// ── mana ─────────────────────────────────────────────────────────────────────

/** The world's mana level, as set, or normal before the setting exists. */
export function worldMana(): ManaLevel {
  let stored: unknown = "normal";
  try {
    stored = game.settings.get(SYSTEM_ID, MANA_LEVEL_KEY);
  } catch {
    // Asked before settings are registered: the default serves.
  }
  return isManaLevel(stored) ? stored : "normal";
}

/** A scene's own mana level, or null when it inherits the world's. */
export function sceneMana(scene: any): ManaLevel | null {
  const flag = scene?.getFlag?.(SYSTEM_ID, MANA_SCENE_FLAG);
  return isManaLevel(flag) ? flag : null;
}

/** The mana where spells are being cast now: the active scene's, else the world's. */
export function currentMana(): ManaLevel {
  const scene = (canvas as any)?.scene ?? (game as any).scenes?.active ?? null;
  return effectiveMana(worldMana(), sceneMana(scene));
}

/** The mana level a sheet should say, with where it came from. */
export function describeMana(): { level: ManaLevel; label: string; fromScene: boolean; inPlay: boolean } {
  const scene = (canvas as any)?.scene ?? (game as any).scenes?.active ?? null;
  const own = sceneMana(scene);
  const level = effectiveMana(worldMana(), own);
  return {
    level,
    label: game.i18n.localize(`GWORLD.Mana.${level}`),
    fromScene: own !== null,
    inPlay: isRuleOn("manaLevels"),
  };
}

/**
 * Lets the GM set the mana here and the campaign's default, from the sheet
 * rather than from two settings pages: "the mana level of the game world or
 * specific area" is one question with two parts.
 */
export async function promptForMana(): Promise<void> {
  if (!game.user?.isGM) return;
  const scene = (canvas as any)?.scene ?? (game as any).scenes?.active ?? null;
  const own = sceneMana(scene);
  const world = worldMana();
  const M = (key: string) => game.i18n.localize(`GWORLD.Mana.${key}`);
  const options = (selected: string | null, inherit: boolean) =>
    [
      ...(inherit ? [`<option value="" ${selected === null ? "selected" : ""}>${M("Inherit")}</option>`] : []),
      ...MANA_LEVELS.map(
        (level) => `<option value="${level}" ${selected === level ? "selected" : ""}>${M(level)}</option>`,
      ),
    ].join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: M("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:8px">
      <p style="margin:0;font-size:11px;opacity:0.85">${M("Hint")}</p>
      ${scene
        ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
             <span>${M("ThisScene")} <em>${foundry.utils.escapeHTML(String(scene.name ?? ""))}</em></span>
             <select name="scene" style="width:170px">${options(own, true)}</select>
           </label>`
        : ""}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${M("World")}</span>
        <select name="world" style="width:170px">${options(world, false)}</select>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Rules.Save"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          scene: form?.querySelector<HTMLSelectElement>('select[name="scene"]')?.value ?? null,
          world: form?.querySelector<HTMLSelectElement>('select[name="world"]')?.value ?? world,
        };
      },
    },
    rejectClose: false,
  });
  if (!result || typeof result !== "object") return;
  const chosen = result as { scene: string | null; world: string };

  if (isManaLevel(chosen.world) && chosen.world !== world) {
    await game.settings.set(SYSTEM_ID, MANA_LEVEL_KEY, chosen.world);
  }
  if (scene && chosen.scene !== null) {
    if (isManaLevel(chosen.scene)) await scene.setFlag(SYSTEM_ID, MANA_SCENE_FLAG, chosen.scene);
    else if (own !== null) await scene.unsetFlag(SYSTEM_ID, MANA_SCENE_FLAG);
  }
  // Every open sheet says what the mana is; tell them it changed.
  for (const actor of (game as any).actors ?? []) {
    if (actor.sheet?.rendered) actor.sheet.render();
  }
}

// ── the casting ──────────────────────────────────────────────────────────────

/** What the dialog asked for. */
interface CastChoices {
  energy: number;
  radius: number;
  subjectSm: number;
  distance: number;
  cannotSeeOrTouch: boolean;
  hpBurn: number;
  modifier: number;
}

/** What a spell's record says about how it is cast, read once. */
interface SpellShape {
  classes: string[];
  area: boolean;
  blocking: boolean;
  missile: boolean;
  melee: boolean;
  information: boolean;
  regular: boolean;
}

function shapeOf(item: any): SpellShape {
  const classes: string[] = item.system?.classes ?? [];
  const has = (c: string) => classes.includes(c);
  return {
    classes,
    area: has("area"),
    blocking: has("blocking"),
    missile: has("missile"),
    melee: has("melee"),
    information: has("information"),
    regular: has("regular") && !has("area"),
  };
}

/** The Magic Resistance of the one targeted token's actor, for a spell cast on them. */
function targetResistance(): { name: string; resistance: number } | null {
  const targets = targetedTokens();
  if (targets.length !== 1) return null;
  const actor = targets[0]?.actor;
  const resistance = Number(actor?.system?.derived?.magic?.magicResistance ?? 0) || 0;
  return actor && resistance > 0 ? { name: String(actor.name ?? ""), resistance } : null;
}

/**
 * Asks how the spell is being cast. Returns null when dismissed.
 *
 * Only what the class of spell needs is asked: an Area spell wants a radius,
 * a Regular one the subject's size and distance, a Missile one how much
 * energy goes into the missile. Everything else is worked out.
 */
async function promptForCast(options: {
  item: any;
  shape: SpellShape;
  level: number;
  mana: ManaLevel;
  ritual: Ritual;
  bounds: { min: number; max: number | null };
  running: { spellsOn: number; concentratingOn: number };
  resisted: { name: string; resistance: number } | null;
}): Promise<CastChoices | null> {
  const { item, shape, bounds } = options;
  const energy = item.system.energy ?? {};
  const row = (label: string, field: string) =>
    `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
       <span>${label}</span>${field}
     </label>`;
  const num = (name: string, value: number, min: number, max: number | null) =>
    `<input type="number" name="${name}" value="${value}" min="${min}" ${max !== null ? `max="${max}"` : ""} step="1" style="width:90px">`;

  const variable = bounds.max === null || bounds.max !== bounds.min;
  const energyLabel = bounds.max === null
    ? `${L("Energy")} (${bounds.min}+)`
    : `${L("Energy")} (${bounds.min}-${bounds.max})`;

  const lines: string[] = [];
  lines.push(`<span>${L("Skill")} ${options.level}</span>`);
  if (isRuleOn("manaLevels")) {
    lines.push(`<span>${game.i18n.localize("GWORLD.Mana.Here")} ${game.i18n.localize(`GWORLD.Mana.${options.mana}`)}</span>`);
  }
  if (isRuleOn("magicRituals")) {
    lines.push(`<span>${L(`Ritual.${options.ritual.ritual}`)}</span>`);
  }
  const running = maintenancePenalty(options.running);
  if (running !== 0 && isRuleOn("maintainingSpells")) {
    lines.push(`<span>${L("RunningPenalty")} ${running}</span>`);
  }
  if (options.resisted) {
    lines.push(`<span>${options.resisted.name}: ${game.i18n.localize("GWORLD.Spell.MagicResistance")} -${options.resisted.resistance}</span>`);
  }

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${L("Title")}: ${item.name}` },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;opacity:0.85">${lines.join("")}</div>
      ${shape.area
        ? row(`${L("Radius")} (${L("BaseCost")} ${energy.cast ?? "?"})`, num("radius", 1, 1, null))
        : variable
          ? row(energyLabel, num("energy", bounds.min, bounds.min, bounds.max))
          : ""}
      ${shape.area && energy.cast === null ? row(L("Energy"), num("energy", 1, 1, null)) : ""}
      ${shape.regular ? row(L("SubjectSm"), num("subjectSm", 0, -10, null)) : ""}
      ${shape.regular || shape.area
        ? row(L("Distance"), num("distance", 0, 0, null)) +
          `<label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="cannotSee"><span>${L("CannotSeeOrTouch")}</span>
           </label>`
        : ""}
      ${row(L("BurnHp"), num("hpBurn", 0, 0, null))}
      ${row(game.i18n.localize("GWORLD.Chat.Modifier"), num("modifier", 0, -99, 99))}
    </div>`,
    ok: {
      label: L("Cast"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const read = (name: string, fallback: number) => {
          const value = Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value);
          return Number.isFinite(value) ? value : fallback;
        };
        return {
          energy: read("energy", bounds.min),
          radius: read("radius", 1),
          subjectSm: read("subjectSm", 0),
          distance: read("distance", 0),
          cannotSeeOrTouch: form?.querySelector<HTMLInputElement>('input[name="cannotSee"]')?.checked ?? false,
          hpBurn: read("hpBurn", 0),
          modifier: read("modifier", 0),
        };
      },
    },
    rejectClose: false,
  });
  return result && typeof result === "object" ? (result as CastChoices) : null;
}

/** Takes energy off the caster: HP first where they chose to burn it, the rest as fatigue. */
async function payEnergy(actor: any, total: number, hpBurn: number): Promise<{ fp: number; hp: number }> {
  const hp = Math.max(0, Math.min(Math.floor(hpBurn), total));
  const fp = total - hp;
  if (fp > 0) await applyFatigue(actor, fp);
  if (hp > 0) {
    // "Treat HP lost this way just like any other injury" (p. 237).
    await actor.update({ "system.hp.value": (Number(actor.system?.hp?.value) || 0) - hp });
    await syncHealthConditions(actor);
  }
  return { fp, hp };
}

function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/** A duration in seconds, said the way a sheet says it. */
export function describeSeconds(seconds: number): string {
  if (seconds % 86400 === 0 && seconds >= 86400) return game.i18n.format("GWORLD.Cast.Days", { n: seconds / 86400 });
  if (seconds % 3600 === 0 && seconds >= 3600) return game.i18n.format("GWORLD.Cast.Hours", { n: seconds / 3600 });
  if (seconds % 60 === 0 && seconds >= 60) return game.i18n.format("GWORLD.Cast.Minutes", { n: seconds / 60 });
  return game.i18n.format("GWORLD.Cast.Seconds", { n: seconds });
}

/**
 * Casts a spell from the sheet, start to finish.
 *
 * Refuses, with a reason, what the book refuses: a spell not known, no mana,
 * a non-mage in ordinary mana, a caster who is stunned ("your spell is
 * automatically spoiled", p. 236).
 */
export async function castSpell(actor: any, item: any): Promise<void> {
  if (!actor?.isOwner || item?.type !== "spell") return;
  const derived = item.system?.derived ?? {};
  const level: number | null = derived.level ?? null;
  if (level === null) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Cast.NotKnown", { spell: item.name }));
    return;
  }
  if (actor.system?.conditions?.stunned) {
    ui.notifications?.warn(L("Stunned"));
    return;
  }

  const magic = actor.system?.derived?.magic ?? {};
  const manaInPlay = isRuleOn("manaLevels");
  const mana: ManaLevel = manaInPlay ? currentMana() : "normal";
  const isMage = magic.magery !== null && magic.magery !== undefined;
  if (manaInPlay && !mayCast(mana, isMage)) {
    ui.notifications?.warn(L(mana === "none" ? "NoMana" : "MagesOnly"));
    return;
  }

  const shape = shapeOf(item);
  const manaMod = manaInPlay ? manaSkillModifier(mana) : 0;
  // "'skill' refers to base skill, not effective skill. The only modifier
  // that matters here is the -5 for low mana."
  const ritual = isRuleOn("magicRituals") ? ritualForSkill(level + manaMod) : NO_RITUAL;
  const bounds = energyBounds(item.system.energy ?? { cast: null, castMax: null, text: "" }, magic.magery ?? null);
  const running = {
    spellsOn: Number(magic.spellsOn ?? 0),
    concentratingOn: Number(magic.concentratingOn ?? 0),
  };
  // Magic Resistance penalises a spell cast on its owner, single-subject and
  // Resisted, "even if he is willing" (p. 241). A Missile is thrown, not cast
  // on anyone; an Area spell has no single subject.
  const resisted =
    item.system.resistedBy && !shape.area && !shape.missile ? targetResistance() : null;

  const choices = await promptForCast({ item, shape, level, mana, ritual, bounds, running, resisted });
  if (!choices) return;

  // ── the cost, before and after skill ─────────────────────────────────
  const energy = item.system.energy ?? {};
  let asked: number;
  if (shape.area) {
    asked = energy.cast === null ? Math.max(1, Math.floor(choices.energy)) : areaEnergy(energy.cast, choices.radius);
  } else {
    asked = Math.max(bounds.min, Math.floor(choices.energy));
    if (bounds.max !== null) asked = Math.min(bounds.max, asked);
    if (shape.regular) asked = subjectSizeEnergy(asked, choices.subjectSm);
  }
  const cost = energyAfterSkill(asked, ritual, { blocking: shape.blocking });
  const reduced = asked - cost;
  // Maintaining an Area spell scales with the area as casting did.
  const maintainBase =
    energy.maintain === null || energy.maintain === undefined
      ? null
      : shape.area
        ? areaEnergy(energy.maintain, choices.radius)
        : Number(energy.maintain);
  const maintain = maintainBase === null ? null : energyAfterSkill(maintainBase, ritual, { blocking: shape.blocking });
  const seconds: number | null = item.system.castingTime?.seconds ?? null;
  const time = seconds === null
    ? String(item.system.castingTime?.text ?? "") || "—"
    : describeSeconds(castingTimeAfterSkill(seconds, ritual, { missile: shape.missile }));

  // ── the modifiers ────────────────────────────────────────────────────
  const modifiers: Array<{ label: string; value: number }> = [];
  if (manaMod !== 0) modifiers.push({ label: game.i18n.localize(`GWORLD.Mana.${mana}`), value: manaMod });
  if (isRuleOn("maintainingSpells")) {
    const penalty = maintenancePenalty(running);
    if (penalty !== 0) modifiers.push({ label: L("RunningPenalty"), value: penalty });
  }
  if (shape.regular || shape.area) {
    const penalty = distancePenalty({ yards: choices.distance, cannotSeeOrTouch: choices.cannotSeeOrTouch });
    if (penalty !== 0) modifiers.push({ label: L("DistanceLabel"), value: penalty });
  }
  if (resisted) {
    modifiers.push({ label: `${game.i18n.localize("GWORLD.Spell.MagicResistance")} (${resisted.name})`, value: -resisted.resistance });
  }
  const hpBurn = Math.max(0, Math.floor(choices.hpBurn));
  if (hpBurn > 0) modifiers.push({ label: L("BurnHp"), value: hpBurnPenalty(hpBurn) });
  // A lowered IQ lowers every spell with it (Campaigns p. 421).
  const temporary = actor.system?.attributePenalties
    ? penaltyForRoll({ penalties: actor.system.attributePenalties, basedOn: "IQ", kind: "skill" })
    : 0;
  if (temporary !== 0) modifiers.push({ label: game.i18n.localize("GWORLD.Penalties.Label"), value: temporary });
  if (choices.modifier !== 0) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Chat.Situational"), value: choices.modifier });
  }

  const effective = level + modifiers.reduce((sum, m) => sum + m.value, 0);
  if (!canAttempt(effective)) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Roll.TooLowToAttempt", { label: item.name, effective }));
    return;
  }

  // ── the roll ─────────────────────────────────────────────────────────
  const roll = new Roll("3d6");
  await roll.evaluate();
  let outcome = resolveSuccess(roll.total, effective, dieResults(roll));
  if (manaInPlay) outcome = outcomeUnderMana(outcome, mana);

  // ── what it cost ─────────────────────────────────────────────────────
  const owed = energyOnOutcome({ cost, outcome, information: shape.information });
  const paid = owed > 0 ? await payEnergy(actor, owed, hpBurn) : { fp: 0, hp: 0 };

  // ── a critical failure ───────────────────────────────────────────────
  const rolls: any[] = [roll];
  let failure: { roll: number; effect: string; injury: string; gmDecides: boolean } | null = null;
  const mild = manaInPlay && criticalFailuresAreMild(mana);
  if (outcome.criticalFailure && isRuleOn("criticalSpellFailure") && !mild) {
    const table = new Roll("3d6");
    await table.evaluate();
    rolls.push(table);
    const entry = criticalSpellFailure(table.total);
    let injury = "";
    if (entry.injuryDice) {
      const hurt = new Roll(`${entry.injuryDice}d6`);
      await hurt.evaluate();
      rolls.push(hurt);
      injury = game.i18n.format("GWORLD.Cast.Injury", { hp: hurt.total });
    } else if (entry.injury) {
      injury = game.i18n.format("GWORLD.Cast.Injury", { hp: entry.injury });
    }
    if (entry.stunned) await setCondition(actor, "stunned", true);
    failure = {
      roll: table.total,
      effect: game.i18n.localize(`GWORLD.SpellFailure.${entry.effect}`),
      injury,
      gmDecides: Boolean(entry.gmDecides),
    };
  }

  // ── a spell now running ──────────────────────────────────────────────
  const durationText = String(item.system.duration?.text ?? "");
  const durationSeconds: number | null = item.system.duration?.seconds ?? null;
  const instant = /^instant/i.test(durationText) || (!durationText && durationSeconds === null);
  const permanent = /^perm/i.test(durationText);
  // A Missile or Melee spell is held rather than running, a Blocking one is
  // over as it is cast, and an Information spell has no duration (p. 241).
  const runs = outcome.success && !instant && !permanent && !shape.missile && !shape.melee && !shape.blocking && !shape.information;
  if (runs) {
    const now = Number((game as any).time?.worldTime ?? 0) || 0;
    const entry: ActiveSpell = {
      id: foundry.utils.randomID(),
      itemId: String(item.id),
      name: String(item.name),
      castCost: cost,
      maintainCost: maintain,
      durationSeconds,
      expiresAt: spellExpiry(now, durationSeconds),
      startedAt: now,
      concentrating: false,
      permanent: false,
    };
    await actor.update({ "system.activeSpells": [...(actor.system.activeSpells ?? []), entry] });
  }

  // ── the card ─────────────────────────────────────────────────────────
  const subjectParts: string[] = [];
  if (shape.area) subjectParts.push(game.i18n.format("GWORLD.Cast.RadiusOf", { yards: Math.max(1, Math.floor(choices.radius)) }));
  if (shape.regular && choices.subjectSm > 0) subjectParts.push(`SM +${Math.floor(choices.subjectSm)}`);
  const paidText = owed > 0
    ? [paid.fp > 0 ? `${paid.fp} FP` : "", paid.hp > 0 ? `${paid.hp} HP` : ""].filter(Boolean).join(" + ")
    : "";

  const content = await foundry.applications.handlebars.renderTemplate(CAST_TEMPLATE, {
    spell: item.name,
    classes: shape.classes.map((c) => game.i18n.localize(`GWORLD.Spell.Class.${c}`)).join(" / "),
    subject: subjectParts.join(", "),
    base: level,
    modifiers,
    effective,
    cost,
    reduced,
    time,
    ritual: isRuleOn("magicRituals") ? L(`Ritual.${ritual.ritual}`) : "",
    dice: outcome.dice,
    roll: roll.total,
    resultLabel: outcome.criticalSuccess
      ? L("CriticalSuccess")
      : outcome.success
        ? game.i18n.format("GWORLD.Cast.Success", { margin: outcome.margin })
        : outcome.criticalFailure
          ? L("CriticalFailure")
          : game.i18n.format("GWORLD.Cast.Failure", { margin: outcome.margin }),
    resultClass: outcome.criticalSuccess
      ? "crit-success"
      : outcome.success
        ? "success"
        : outcome.criticalFailure
          ? "crit-failure"
          : "failure",
    paid: paidText ? game.i18n.format("GWORLD.Cast.Paid", { energy: paidText }) : "",
    fatigueReturns: manaInPlay && paid.fp > 0 && fatigueReturnsNextTurn(mana),
    duration: runs
      ? durationSeconds !== null
        ? describeSeconds(durationSeconds)
        : durationText
      : outcome.success && permanent
        ? durationText
        : "",
    maintain: runs && maintain !== null ? maintain : null,
    failure,
    mildFailure: outcome.criticalFailure && mild,
    note: outcome.criticalSuccess ? L("CriticalSuccessNote") : "",
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls,
  });
}

// ── spells running ───────────────────────────────────────────────────────────

function activeOf(actor: any, id: string): { list: ActiveSpell[]; index: number } {
  const list: ActiveSpell[] = [...(actor?.system?.activeSpells ?? [])];
  return { list, index: list.findIndex((s) => s.id === id) };
}

/** What the sheet shows of a running spell: how long is left, and whether it lapsed. */
export function describeActiveSpell(spell: ActiveSpell): { remaining: string; expired: boolean } {
  const now = Number((game as any).time?.worldTime ?? 0) || 0;
  if (spell.expiresAt === null) return { remaining: L("UntilDropped"), expired: false };
  const expired = isExpired(spell.expiresAt, now);
  return {
    remaining: expired ? L("Expired") : describeSeconds(spell.expiresAt - now),
    expired,
  };
}

/**
 * Pays to keep a spell up another interval (p. 238): "This takes no time and
 * requires no skill roll. Distance is not a factor."
 */
export async function maintainSpell(actor: any, id: string): Promise<void> {
  if (!actor?.isOwner) return;
  const { list, index } = activeOf(actor, id);
  const spell = list[index];
  if (!spell) return;
  if (spell.maintainCost === null) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Cast.CannotMaintain", { spell: spell.name }));
    return;
  }
  if (spell.maintainCost > 0) await applyFatigue(actor, spell.maintainCost);
  const now = Number((game as any).time?.worldTime ?? 0) || 0;
  list[index] = { ...spell, expiresAt: maintainedExpiry(spell.expiresAt, spell.durationSeconds, now) };
  await actor.update({ "system.activeSpells": list });
  ui.notifications?.info(game.i18n.format("GWORLD.Cast.Maintained", { spell: spell.name, energy: spell.maintainCost }));
}

/**
 * Lets a spell go. Cancelling one before its time costs a point (p. 237);
 * one that has run out simply ends.
 */
export async function dropSpell(actor: any, id: string): Promise<void> {
  if (!actor?.isOwner) return;
  const { list, index } = activeOf(actor, id);
  const spell = list[index];
  if (!spell) return;
  const now = Number((game as any).time?.worldTime ?? 0) || 0;
  const cost = cancelCost(spell.expiresAt, now);
  if (cost > 0) await applyFatigue(actor, cost);
  list.splice(index, 1);
  await actor.update({ "system.activeSpells": list });
  ui.notifications?.info(
    cost > 0
      ? game.i18n.format("GWORLD.Cast.Cancelled", { spell: spell.name, energy: cost })
      : game.i18n.format("GWORLD.Cast.Ended", { spell: spell.name }),
  );
}

/** Marks a running spell as one being concentrated on, or not: -3 rather than -1 on the next casting. */
export async function toggleConcentrating(actor: any, id: string): Promise<void> {
  if (!actor?.isOwner) return;
  const { list, index } = activeOf(actor, id);
  const spell = list[index];
  if (!spell) return;
  list[index] = { ...spell, concentrating: !spell.concentrating };
  await actor.update({ "system.activeSpells": list });
}

/**
 * The roll to keep casting through a distraction (p. 236): "make a Will roll
 * at -3 to continue casting your spell. On a failure, your spell is spoiled
 * and you must start over."
 */
export async function rollKeepConcentration(actor: any): Promise<void> {
  if (!isRuleOn("spellDistraction")) return;
  const will = Number(actor?.system?.derived?.will) || 10;
  await rollSuccess({
    actor,
    base: will,
    label: L("KeepConcentration"),
    kind: "skill",
    modifiers: [{ label: L("Distracted"), value: DISTRACTION_PENALTY }],
  });
}
