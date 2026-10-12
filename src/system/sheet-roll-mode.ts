/**
 * Who sees the rolls made from a sheet: everyone, the GM alongside the player
 * who rolled ("private to GM"), or the GM alone ("blind to GM"), where the
 * player does not see the result either.
 *
 * The choice is made on the sheet and kept per user and per actor, so a
 * player can roll their character's Perception blind while the GM rolls an
 * NPC privately. It reaches every card with dice that the user's client posts
 * for that actor -- success rolls, damage, a plain 3d6 -- by applying the mode
 * as the card is created. A card that already chose who sees it (a roll the
 * rules keep secret, a whisper, a mode a module asked for) keeps its own.
 */
import { SYSTEM_ID } from "./constants.js";

/** The setting that holds each actor's choice, for this user only. */
export const SHEET_ROLL_MODES = "sheetRollModes";

/** The modes a sheet offers, in the order its buttons show them. */
export const SHEET_ROLL_MODE_IDS = ["public", "gm", "blind"] as const;
export type SheetRollMode = (typeof SHEET_ROLL_MODE_IDS)[number];

const ICONS: Readonly<Record<SheetRollMode, string>> = Object.freeze({
  public: "fa-solid fa-globe",
  gm: "fa-solid fa-user-secret",
  blind: "fa-solid fa-eye-slash",
});

function isSheetRollMode(mode: unknown): mode is SheetRollMode {
  return typeof mode === "string" && (SHEET_ROLL_MODE_IDS as readonly string[]).includes(mode);
}

/** Registers the setting. A client setting, since it is how this user rolls, not a fact about the world. */
export function registerSheetRollModeSetting(): void {
  game.settings.register(SYSTEM_ID, SHEET_ROLL_MODES, {
    scope: "client",
    config: false,
    type: Object,
    default: {},
  });
}

function storedModes(): Record<string, unknown> {
  try {
    const stored = game.settings.get(SYSTEM_ID, SHEET_ROLL_MODES);
    return stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Who sees the rolls this user makes for the actor with this id. Public unless chosen otherwise. */
export function sheetRollMode(actorId: string | null | undefined): SheetRollMode {
  if (!actorId) return "public";
  const mode = storedModes()[actorId];
  return isSheetRollMode(mode) ? mode : "public";
}

/** Sets who sees the rolls this user makes for an actor. Public is the default, so it is stored as nothing. */
export async function setSheetRollMode(actorId: string, mode: SheetRollMode): Promise<void> {
  const modes = { ...storedModes() };
  if (mode === "public") delete modes[actorId];
  else modes[actorId] = mode;
  await game.settings.set(SYSTEM_ID, SHEET_ROLL_MODES, modes);
}

/** The buttons a sheet's header shows: one per mode, the chosen one marked. */
export function sheetRollModeButtons(actorId: string | null | undefined): Array<{
  mode: SheetRollMode; icon: string; label: string; hint: string; active: boolean;
}> {
  const current = sheetRollMode(actorId);
  return SHEET_ROLL_MODE_IDS.map((mode) => ({
    mode,
    icon: ICONS[mode],
    label: game.i18n.localize(`GWORLD.RollVisibility.${mode}`),
    hint: game.i18n.localize(`GWORLD.RollVisibility.${mode}Hint`),
    active: mode === current,
  }));
}

/** What a card being created says about itself, as far as choosing its mode goes. */
export interface CardBeingCreated {
  /** Whether it carries dice. */
  isRoll: boolean;
  whisper?: readonly unknown[] | null;
  blind?: boolean | null;
  speakerActor?: string | null;
  /** The mode its creator asked for, if any. */
  requestedMode?: unknown;
  /**
   * The mode of the sheet the roll was made from, when that sheet's actor is
   * not the one speaking: a vehicle's control roll is the driver's.
   */
  sheetMode?: SheetRollMode | null;
}

/**
 * The mode to put a card in, or null to leave it as it is: only a card with
 * dice, spoken by an actor whose rolls this user keeps from the table, and
 * not already whispered or given a mode by whoever posted it.
 */
export function sheetModeForCard(card: CardBeingCreated, chosen: (actorId: string) => SheetRollMode = sheetRollMode): SheetRollMode | null {
  if (!card.isRoll) return null;
  if (typeof card.requestedMode === "string" && card.requestedMode) return null;
  if ((card.whisper?.length ?? 0) > 0 || card.blind === true) return null;
  // The sheet rolled from, where it keeps its rolls from the table; else the speaker's own choice.
  const mode = card.sheetMode && card.sheetMode !== "public"
    ? card.sheetMode
    : card.speakerActor ? chosen(card.speakerActor) : "public";
  return mode === "public" ? null : mode;
}

/** The modes of the sheets whose rolls are being made right now, innermost last. */
const rollingFrom: SheetRollMode[] = [];

/**
 * Runs a roll made from an actor's sheet whose cards another actor speaks --
 * a vehicle's, made by its driver -- so those cards follow the sheet's choice.
 */
export async function withSheetRollMode<T>(actorId: string | null | undefined, roll: () => Promise<T>): Promise<T> {
  rollingFrom.push(sheetRollMode(actorId));
  try {
    return await roll();
  } finally {
    rollingFrom.pop();
  }
}

/** Applies each actor's chosen mode to the cards with dice this user's client posts for it. */
export function registerSheetRollModeHooks(): void {
  // Foundry applies a mode asked for at creation before this hook runs, so a
  // card still public here is one nobody chose a mode for.
  Hooks.on("preCreateChatMessage", (message: any, _data: unknown, options: any, userId: string) => {
    if (userId !== game.user?.id) return;
    const mode = sheetModeForCard({
      isRoll: Boolean(message?.isRoll),
      whisper: message?.whisper,
      blind: message?.blind,
      speakerActor: message?.speaker?.actor ?? null,
      requestedMode: options?.messageMode,
      sheetMode: rollingFrom.at(-1) ?? null,
    });
    if (!mode) return;
    message.applyMode(mode);
  });
}
