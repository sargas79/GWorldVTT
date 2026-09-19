/**
 * The party sheet: the people a campaign follows, on one page.
 *
 * Three tabs on the new character sheet's frame. Members: each member's
 * portrait, hit points and fatigue, Will, Perception, speed, defenses, DR,
 * load, points and conditions, as the GM reads them at the table, each
 * rolled from here for that member. Skills: the best of every skill between
 * them, and the languages they share. Campaign: the terms the campaign was
 * set on, which the members' sheets read from here, and the world's own
 * settings, edited here rather than on Foundry's settings page.
 *
 * The rows read other actors, so the sheet redraws when any member, any of
 * their items or a world setting changes, not only when the party does.
 */

import { SYSTEM_ID } from "../constants.js";
import { CONDITIONS } from "../conditions.js";
import { activeConditions } from "../procedure-extensions.js";
import { handleRollAction } from "../roll.js";
import { describeMana, promptForMana, worldMana } from "../casting.js";
import { CONTROL_RATING_KEY } from "../legality.js";
import { COMBAT_STYLE, combatStyle } from "../settings.js";
import { CONTROL_RATINGS } from "../../rules/legality.js";
import { isRuleOn } from "../optional-rules.js";
import { RulesSettings } from "../apps/rules-settings.js";
import { CompendiumSourcesSettings } from "../apps/compendium-sources.js";
import { addMembers, moveMember, partyOf, removeMember, resolveMember } from "../party.js";
import {
  canJoin,
  memberRow,
  partyLanguages,
  partySkills,
  termsFrom,
  type MemberRow,
  type PartySkillRow,
} from "../party/roster.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_ROOT = `systems/${SYSTEM_ID}/templates/actor`;
const PARTY_ROOT = `${TEMPLATE_ROOT}/party`;

const DEFAULT_IMAGE = "icons/svg/mystery-man.svg";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Party.${key}`, data) : game.i18n.localize(`GWORLD.Party.${key}`);

/** A member as the sheet resolves it at render time, so a deleted actor reads as missing at once. */
interface ResolvedMember {
  uuid: string;
  actor: any | null;
}

/** The fatigue statuses' labels, which the Health list keys unevenly. */
function fatigueLabel(status: string): string {
  if (status === "fresh") return "";
  if (status === "veryTired") return game.i18n.localize("GWORLD.Health.VeryTired");
  if (status === "unconscious") return game.i18n.localize("GWORLD.Health.Unconscious");
  return game.i18n.localize(`GWORLD.Health.${status}`);
}

/** Asks which of the world's people to put in the party. Null when dismissed. */
async function promptForMembers(party: any): Promise<string[] | null> {
  const esc = foundry.utils.escapeHTML;
  const inParty = new Set(((party.system?.members ?? []) as Array<{ uuid: string }>).map((m) => m.uuid));
  const candidates = [...((game as any).actors ?? [])]
    .filter((a: any) => canJoin(a?.type) && !inParty.has(String(a.uuid)))
    .sort((a: any, b: any) => {
      const owned = Number(b.hasPlayerOwner === true) - Number(a.hasPlayerOwner === true);
      return owned || String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
  if (candidates.length === 0) {
    ui.notifications?.info(L("NoneToAdd"));
    return null;
  }
  const rows = candidates
    .map((a: any) => {
      const elsewhere = partyOf(a);
      const note = elsewhere && elsewhere !== party ? ` <em style="opacity:.7">(${esc(L("InParty", { party: String(elsewhere.name ?? "") }))})</em>` : "";
      return `<label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="member" value="${esc(String(a.uuid))}" ${a.hasPlayerOwner === true ? "checked" : ""}>
        <img src="${esc(String(a.img || DEFAULT_IMAGE))}" alt="" style="width:24px;height:24px;object-fit:cover;border:0;border-radius:50%">
        <span>${esc(String(a.name ?? ""))}</span>${note}
      </label>`;
    })
    .join("");
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("AddTitle") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px;max-height:60vh;overflow-y:auto">
      <p class="ihint" style="margin:0">${esc(L("AddHint"))}</p>${rows}</div>`,
    ok: {
      label: L("Add"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return [...(form?.querySelectorAll<HTMLInputElement>('input[name="member"]:checked') ?? [])].map((i) => i.value);
      },
    },
    rejectClose: false,
  });
  return Array.isArray(result) ? (result as string[]) : null;
}

export class GWorldPartySheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    // "v2" puts the new character sheet's frame and components on it.
    classes: ["gworld", "sheet", "actor", "party", "v2"],
    position: { width: 980, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      openMember: GWorldPartySheet.#onOpenMember,
      removeMember: GWorldPartySheet.#onRemoveMember,
      moveMember: GWorldPartySheet.#onMoveMember,
      addMembers: GWorldPartySheet.#onAddMembers,
      addPlayers: GWorldPartySheet.#onAddPlayers,
      roll: GWorldPartySheet.#onRoll,
      changeMana: GWorldPartySheet.#onChangeMana,
      openRules: GWorldPartySheet.#onOpenRules,
      openSources: GWorldPartySheet.#onOpenSources,
    },
  };

  static override PARTS = {
    header: { template: `${PARTY_ROOT}/header.hbs` },
    nav: { template: `${TEMPLATE_ROOT}/v2/nav.hbs` },
    members: { template: `${PARTY_ROOT}/tab-members.hbs`, scrollable: [""] },
    skills: { template: `${PARTY_ROOT}/tab-skills.hbs`, scrollable: [""] },
    campaign: { template: `${PARTY_ROOT}/tab-campaign.hbs`, scrollable: [""] },
  };

  static override TABS: any = {
    primary: {
      initial: "members",
      labelPrefix: "GWORLD.Party.Tab",
      tabs: [{ id: "members" }, { id: "skills" }, { id: "campaign" }],
    },
  };

  static LIMITED_PARTS = {
    limited: { template: `${TEMPLATE_ROOT}/limited.hbs` },
  };

  override _configureRenderParts(options: object): Record<string, unknown> {
    if (this.document.limited) return foundry.utils.deepClone(GWorldPartySheet.LIMITED_PARTS);
    return super._configureRenderParts(options);
  }

  declare actor: any;

  /* ── context ─────────────────────────────────────────────────────────── */

  #members(): ResolvedMember[] {
    return ((this.actor.system?.members ?? []) as Array<{ uuid: string }>).map((m) => {
      const uuid = String(m?.uuid ?? "");
      return { uuid, actor: resolveMember(uuid) };
    });
  }

  override async _prepareContext(options: object): Promise<Record<string, unknown>> {
    const context = (await super._prepareContext(options)) as Record<string, any>;
    const actor = this.actor;
    const system = actor.system;
    const tabs = (context.tabs ?? {}) as Record<string, { label?: string }>;
    const active = this.tabGroups.primary ?? "members";
    const members = this.#members();
    const present = members.filter((m) => m.actor !== null);
    const terms = termsFrom(system.campaign);
    const isGM = game.user?.isGM === true;

    const termChips: Array<{ label: string; value: string }> = [];
    if (terms.tl !== null) termChips.push({ label: game.i18n.localize("GWORLD.Field.TechLevel"), value: String(terms.tl) });
    if (terms.startingPoints !== null) termChips.push({ label: game.i18n.localize("GWORLD.Field.StartingPoints"), value: `${terms.startingPoints} CP` });
    if (terms.disadvantageLimit !== null) termChips.push({ label: game.i18n.localize("GWORLD.Field.DisadvantageLimit"), value: `-${terms.disadvantageLimit} CP` });

    return {
      ...context,
      actor,
      system,
      img: String(actor.img || DEFAULT_IMAGE),
      editable: this.isEditable,
      isOwner: actor.isOwner,
      isGM,
      tabLabel: tabs[active]?.label ?? "",
      countLabel: members.length === 1 ? L("OneMember") : L("Members", { count: members.length }),
      terms: termChips,
      members: members.map((m) => this.#memberContext(m)),
      skills: this.#skillsContext(present),
      languages: this.#languagesContext(present),
      campaign: {
        ...terms,
        affected: present.map((m) => String(m.actor.name ?? "")).join(", "),
      },
      // World settings need a GM to write, so the panel is the GM's.
      world: isGM ? this.#worldContext() : null,
      descriptionHTML: await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        String(system.description ?? ""),
        { relativeTo: actor, secrets: actor.isOwner },
      ),
    };
  }

  /** Each part gets its own tab, or every section renders inactive and the body comes up blank. */
  override async _preparePartContext(partId: string, context: Record<string, any>, options: object): Promise<Record<string, any>> {
    const partContext = (await super._preparePartContext(partId, context, options)) as Record<string, any>;
    if (partContext.tabs && partId in partContext.tabs) partContext.tab = partContext.tabs[partId];
    return partContext;
  }

  #memberContext(entry: ResolvedMember): Record<string, unknown> {
    const actor = entry.actor;
    if (!actor) return { uuid: entry.uuid, missing: true };
    const T = (key: string) => game.i18n.localize(key);
    const row: MemberRow = memberRow(actor.system ?? {});
    const hurt = row.hp.status !== "healthy";
    const tired = row.fp.status !== "fresh";

    const defense = (key: "dodge" | "parry" | "block") => {
      const value = row.defenses[key];
      const label = T(`GWORLD.Secondary.${key.charAt(0).toUpperCase()}${key.slice(1)}`);
      return value
        ? { label, text: String(value.total), roll: { type: key, label, basedOn: "" }, note: value.source ?? "" }
        : { label, text: "—", muted: true };
    };
    const stats = [
      { label: T("GWORLD.Secondary.WillAbbr"), text: row.will === null ? "—" : String(row.will), roll: row.will === null ? null : { type: "attribute", label: T("GWORLD.Secondary.Will"), basedOn: "Will" } },
      { label: T("GWORLD.Secondary.PerAbbr"), text: row.per === null ? "—" : String(row.per), roll: row.per === null ? null : { type: "attribute", label: T("GWORLD.Secondary.Per"), basedOn: "Per" } },
      { label: T("GWORLD.Secondary.BasicSpeed"), text: row.basicSpeed === null ? "—" : row.basicSpeed.toFixed(2) },
      { label: T("GWORLD.Secondary.MoveAbbr"), text: row.move === null ? "—" : String(row.move) },
      defense("dodge"),
      defense("parry"),
      defense("block"),
      { label: T("GWORLD.Secondary.DRAbbr"), text: `${row.dr.value}${row.dr.splits ? "*" : ""}`, note: row.dr.splits ? T("GWORLD.Party.DrSplits") : "" },
    ];

    const statuses = [...(actor.statuses ?? [])] as string[];
    const chips: Array<{ label: string; tone: string; img?: string; hint?: string }> = [
      ...CONDITIONS.filter((c) => statuses.includes(c.id)).map((c) => ({ label: T(c.label), tone: "red", img: c.img })),
      ...activeConditions(actor).map((c: any) => ({ label: String(c.label ?? c.id), tone: "steel" })),
    ];
    const posture = String(actor.system?.posture ?? "standing");
    if (posture !== "standing") chips.push({ label: T(`GWORLD.Posture.${posture}`), tone: "dark" });
    if (row.encumbrance.level > 0) {
      chips.push({ label: `${T("GWORLD.Field.Encumbrance")}: ${T(`GWORLD.Encumbrance.${row.encumbrance.key}`)}`, tone: row.encumbrance.level >= 3 ? "red" : "dark" });
    }

    return {
      uuid: entry.uuid,
      missing: false,
      name: String(actor.name ?? ""),
      img: String(actor.img || DEFAULT_IMAGE),
      player: String(actor.system?.details?.player ?? ""),
      typeLabel: L(actor.type === "npc" ? "Npc" : "Character"),
      // Foundry lets only an owner write the actor: the GM, or the player whose character it is.
      canEdit: actor.isOwner === true,
      hp: { ...row.hp, hurt, statusLabel: hurt ? T(`GWORLD.Health.${row.hp.status}`) : "" },
      fp: { ...row.fp, tired, statusLabel: fatigueLabel(row.fp.status) },
      stats,
      points: {
        ...row.points,
        hint: game.i18n.format("GWORLD.SheetV2.PointsHint", { spent: row.points.spent, available: row.points.available }),
      },
      chips,
    };
  }

  #skillsContext(members: ResolvedMember[]): Array<PartySkillRow & { othersText: string }> {
    const rows = partySkills(
      members.map((m) => ({
        uuid: m.uuid,
        name: String(m.actor.name ?? ""),
        skills: [...(m.actor.items ?? [])]
          .filter((item: any) => item?.type === "skill")
          .map((item: any) => ({
            id: String(item.id),
            name: String(item.name ?? ""),
            level: typeof item.system?.derived?.level === "number" ? item.system.derived.level : null,
            points: Number(item.system?.points ?? 0) || 0,
            attribute: String(item.system?.attribute ?? ""),
          })),
      })),
    );
    return rows.map((row) => ({
      ...row,
      othersText: row.others.map((h) => `${h.memberName} ${h.level}`).join(", "),
    }));
  }

  /**
   * The languages between them, with everyone who has each.
   *
   * The holders are grouped by how well they have it -- "Native: Ada, Bo" --
   * because a party of six sharing Common is one line of names, not six rows
   * of the same level repeated.
   */
  #languagesContext(members: ResolvedMember[]): Array<Record<string, unknown>> {
    const groups = (holders: readonly { memberName: string; level: string }[]) => {
      const byLevel: Array<{ levelLabel: string; names: string }> = [];
      for (const holder of holders) {
        const levelLabel = game.i18n.localize(`GWORLD.Language.${holder.level}`);
        const last = byLevel[byLevel.length - 1];
        if (last && last.levelLabel === levelLabel) last.names += `, ${holder.memberName}`;
        else byLevel.push({ levelLabel, names: holder.memberName });
      }
      return byLevel;
    };
    return partyLanguages(
      members.map((m) => ({
        uuid: m.uuid,
        name: String(m.actor.name ?? ""),
        languages: [...(m.actor.items ?? [])]
          .filter((item: any) => item?.type === "language")
          .map((item: any) => ({
            name: String(item.name ?? ""),
            spoken: String(item.system?.spoken ?? "none"),
            written: String(item.system?.written ?? "none"),
          })),
      })),
    ).map((row) => ({
      name: row.name,
      known: row.known,
      spoken: groups(row.spoken),
      written: groups(row.written),
    }));
  }

  /** The world's own settings, as the Campaign tab lets the GM set them. */
  #worldContext(): Record<string, unknown> {
    const T = (key: string) => game.i18n.localize(key);
    const mana = describeMana();
    const rating = String(game.settings.get(SYSTEM_ID, CONTROL_RATING_KEY) ?? "");
    const style = combatStyle();
    return {
      mana: isRuleOn("magic")
        ? { ...mana, worldLabel: T(`GWORLD.Mana.${worldMana()}`) }
        : null,
      controlRating: {
        key: CONTROL_RATING_KEY,
        inPlay: isRuleOn("legalityClass"),
        options: [
          { value: "", label: T("GWORLD.Legality.NoRating"), selected: rating === "" },
          ...CONTROL_RATINGS.map((cr) => ({ value: String(cr), label: T(`GWORLD.Legality.CR${cr}`), selected: rating === String(cr) })),
        ],
      },
      combatStyle: {
        key: COMBAT_STYLE,
        options: [
          { value: "basic", label: T("GWORLD.Settings.CombatStyle.Basic"), selected: style === "basic" },
          { value: "tactical", label: T("GWORLD.Settings.CombatStyle.Tactical"), selected: style === "tactical" },
        ],
      },
    };
  }

  /* ── rendering ───────────────────────────────────────────────────────── */

  override changeTab(tab: string, group: string, options: object = {}): void {
    super.changeTab(tab, group, options);
    if (group !== "primary") return;
    const label = this.element?.querySelector<HTMLElement>(`.v2-rail [data-tab="${tab}"] .v2-rail-label`)?.textContent ?? "";
    const title = this.element?.querySelector<HTMLElement>("[data-v2-tab-title]");
    if (title) title.textContent = label;
  }

  /** What was typed into the skills' search box, kept across redraws. */
  #filter = "";

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);
    const root = this.element as HTMLElement;

    // A member's current hit points or fatigue, written onto that member. Not
    // a form field: the party's form would not know whose it was.
    for (const input of root.querySelectorAll<HTMLInputElement>("input[data-member-field]")) {
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        const uuid = input.closest<HTMLElement>("[data-member-uuid]")?.dataset.memberUuid ?? "";
        const member = resolveMember(uuid);
        const value = Number(input.value);
        if (!member?.isOwner || !Number.isFinite(value)) return;
        void member.update({ [String(input.dataset.memberField)]: Math.trunc(value) });
      });
    }

    // A world setting, written where Foundry's settings page would write it.
    for (const select of root.querySelectorAll<HTMLSelectElement>("select[data-world-setting]")) {
      select.addEventListener("change", (event) => {
        event.stopPropagation();
        if (!game.user?.isGM) return;
        void game.settings.set(SYSTEM_ID, String(select.dataset.worldSetting), select.value);
      });
    }

    const search = root.querySelector<HTMLInputElement>("input[data-party-filter]");
    const list = root.querySelector<HTMLElement>("[data-party-list]");
    if (search && list) {
      const apply = () => {
        const needle = search.value.trim().toLowerCase();
        this.#filter = search.value;
        for (const row of list.querySelectorAll<HTMLElement>("[data-party-name]")) {
          row.hidden = needle.length > 0 && !String(row.dataset.partyName ?? "").toLowerCase().includes(needle);
        }
      };
      search.value = this.#filter;
      search.addEventListener("input", apply);
      apply();
    }
  }

  /* ── keeping the rows current ────────────────────────────────────────── */

  /** Hooks this sheet listens to while it is open, to take off again when it closes. */
  #hooks: Array<[string, number]> = [];

  #redrawTimer: ReturnType<typeof setTimeout> | null = null;
  #redrawSoon(): void {
    if (this.#redrawTimer) clearTimeout(this.#redrawTimer);
    this.#redrawTimer = setTimeout(() => {
      this.#redrawTimer = null;
      if ((this as any).rendered) void this.render();
    }, 150);
  }

  #isMember(actor: any): boolean {
    const uuid = String(actor?.uuid ?? "");
    return ((this.actor.system?.members ?? []) as Array<{ uuid: string }>).some((m) => m.uuid === uuid);
  }

  override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options);
    const on = (hook: string, fn: (...args: any[]) => void) => this.#hooks.push([hook, Hooks.on(hook, fn)]);
    // The rows read the members, so a member changing -- a wound, a condition,
    // a skill bought -- redraws them; the party's own updates redraw the sheet
    // as any document's do.
    on("updateActor", (actor: any) => {
      if (this.#isMember(actor)) this.#redrawSoon();
    });
    on("deleteActor", (actor: any) => {
      if (this.#isMember(actor)) this.#redrawSoon();
    });
    const itemChanged = (item: any) => {
      if (this.#isMember(item?.parent)) this.#redrawSoon();
    };
    on("createItem", itemChanged);
    on("updateItem", itemChanged);
    on("deleteItem", itemChanged);
    // The Campaign tab shows the world's settings, which another GM may change.
    on("updateSetting", () => this.#redrawSoon());
    on("createSetting", () => this.#redrawSoon());
  }

  override async _onClose(options: object): Promise<void> {
    await super._onClose(options);
    for (const [hook, id] of this.#hooks) Hooks.off(hook, id);
    this.#hooks = [];
  }

  /* ── members ─────────────────────────────────────────────────────────── */

  /** Somebody dropped onto the sheet joins the party. */
  override async _onDropActor(event: DragEvent, actor: any): Promise<unknown> {
    if (!this.actor.isOwner) return super._onDropActor(event, actor);
    await addMembers(this.actor, [actor]);
    return null;
  }

  static #memberOf(target: HTMLElement): any | null {
    const uuid = target.closest<HTMLElement>("[data-member-uuid]")?.dataset.memberUuid ?? "";
    return uuid ? resolveMember(uuid) : null;
  }

  static async #onOpenMember(this: GWorldPartySheet, _event: Event, target: HTMLElement) {
    const member = GWorldPartySheet.#memberOf(target);
    await member?.sheet?.render(true);
  }

  static async #onRemoveMember(this: GWorldPartySheet, _event: Event, target: HTMLElement) {
    const uuid = target.closest<HTMLElement>("[data-member-uuid]")?.dataset.memberUuid ?? "";
    await removeMember(this.actor, uuid);
  }

  static async #onMoveMember(this: GWorldPartySheet, _event: Event, target: HTMLElement) {
    const uuid = target.closest<HTMLElement>("[data-member-uuid]")?.dataset.memberUuid ?? "";
    await moveMember(this.actor, uuid, target.dataset.by === "-1" ? -1 : 1);
  }

  static async #onAddMembers(this: GWorldPartySheet) {
    if (!this.actor.isOwner) return;
    const uuids = await promptForMembers(this.actor);
    if (!uuids?.length) return;
    await addMembers(this.actor, uuids.map((uuid) => resolveMember(uuid)).filter(Boolean));
  }

  /** Every character a player owns, in one go. */
  static async #onAddPlayers(this: GWorldPartySheet) {
    if (!this.actor.isOwner) return;
    const players = [...((game as any).actors ?? [])].filter((a: any) => canJoin(a?.type) && a.hasPlayerOwner === true);
    if (players.length === 0) {
      ui.notifications?.info(L("NoPlayerCharacters"));
      return;
    }
    await addMembers(this.actor, players);
  }

  /** A roll made from a member's row is that member's roll. */
  static async #onRoll(this: GWorldPartySheet, event: Event, target: HTMLElement) {
    const member = GWorldPartySheet.#memberOf(target);
    if (member) await handleRollAction(member, event, target);
  }

  /* ── the world ───────────────────────────────────────────────────────── */

  static async #onChangeMana(this: GWorldPartySheet) {
    await promptForMana();
  }

  static async #onOpenRules(this: GWorldPartySheet) {
    if (!game.user?.isGM) return;
    await new RulesSettings().render({ force: true });
  }

  static async #onOpenSources(this: GWorldPartySheet) {
    if (!game.user?.isGM) return;
    await new CompendiumSourcesSettings().render({ force: true });
  }
}
