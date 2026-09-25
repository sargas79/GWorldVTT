/**
 * Putting the GM Screen into Foundry: its settings, a button in the token
 * controls, a keybinding, and the "Show on screen" button on its roll cards.
 */

import { GmScreen } from "../apps/gm-screen.js";
import { GmScreenPlayerTabs } from "../apps/gm-screen-player-tabs.js";
import { SYSTEM_ID } from "../constants.js";
import { setGmScreenOpener } from "./api.js";
import { K } from "./sections/shared.js";
import {
  CURRENT_LAYOUT,
  GM_SCREEN_COLLAPSED,
  GM_SCREEN_HIDDEN_TABS,
  GM_SCREEN_LAYOUT,
  GM_SCREEN_PLAYERS,
  GM_SCREEN_TAB,
  hiddenTabs,
  mayOpen,
  migrateHiddenTabs,
} from "./settings.js";

/** A player's open screen, redrawn or closed when the GM changes what players may see. */
function refreshPlayerScreens(): void {
  const open = (foundry.applications as any).instances?.get?.(GmScreen.DEFAULT_OPTIONS.id);
  if (!(open instanceof GmScreen) || !open.readOnly || !(open as any).rendered) return;
  if (mayOpen()) void open.render();
  else void open.close();
}

function rebuildSceneControls(): void {
  void Promise.resolve((ui as any)?.controls?.render?.({ reset: true })).catch((error: unknown) =>
    console.warn("gworld | the scene controls failed to rebuild", error),
  );
}

/** Adds the screen's button to the token controls, for anyone who may open it. */
export function addGmScreenControl(controls: Record<string, any>): void {
  const tokens = controls?.tokens;
  if (!tokens) return;
  tokens.tools ??= {};
  tokens.tools["gworld-gm-screen"] = {
    name: "gworld-gm-screen",
    title: `${K}.Open`,
    icon: "fa-solid fa-table-columns",
    order: Object.keys(tokens.tools).length + 1,
    button: true,
    visible: mayOpen(),
    onChange: () => {
      void GmScreen.open().catch((error) =>
        console.warn("gworld | the GM Screen failed to open", error),
      );
    },
  };
}

/** Registers everything the screen needs. Called once, at init. */
export function registerGmScreen(): void {
  setGmScreenOpener((focus) => GmScreen.open(focus));

  game.settings.register(SYSTEM_ID, GM_SCREEN_PLAYERS, {
    name: `${K}.Setting.PlayersMayOpen.Name`,
    hint: `${K}.Setting.PlayersMayOpen.Hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      rebuildSceneControls();
      refreshPlayerScreens();
    },
  });
  game.settings.register(SYSTEM_ID, GM_SCREEN_HIDDEN_TABS, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => refreshPlayerScreens(),
  });
  game.settings.register(SYSTEM_ID, GM_SCREEN_LAYOUT, {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
  });
  // Once the world is loaded, the active GM moves the hidden list on to this
  // version's tabs, so a tab split out of a hidden one stays hidden.
  Hooks.once("ready", () => {
    const g = game as any;
    if (!g.user?.isGM || (g.users?.activeGM && !g.users.activeGM.isSelf)) return;
    const layout = Number(g.settings.get(SYSTEM_ID, GM_SCREEN_LAYOUT)) || 0;
    if (layout >= CURRENT_LAYOUT) return;
    void (async () => {
      await g.settings.set(
        SYSTEM_ID,
        GM_SCREEN_HIDDEN_TABS,
        migrateHiddenTabs(hiddenTabs(), layout),
      );
      await g.settings.set(SYSTEM_ID, GM_SCREEN_LAYOUT, CURRENT_LAYOUT);
    })().catch((error) =>
      console.warn("gworld | the GM Screen's hidden tabs could not be moved on", error),
    );
  });

  game.settings.registerMenu(SYSTEM_ID, "gmScreenPlayerTabs", {
    name: `${K}.Setting.HiddenTabsMenu.Name`,
    label: `${K}.Setting.HiddenTabsMenu.Label`,
    hint: `${K}.Setting.HiddenTabsMenu.Hint`,
    icon: "fa-solid fa-table-columns",
    type: GmScreenPlayerTabs,
    restricted: true,
  });
  // Where each user left the screen: their own, not the world's.
  game.settings.register(SYSTEM_ID, GM_SCREEN_TAB, {
    scope: "client",
    config: false,
    type: String,
    default: "criticalTables",
  });
  game.settings.register(SYSTEM_ID, GM_SCREEN_COLLAPSED, {
    scope: "client",
    config: false,
    type: Object,
    default: {},
  });

  (game as any).keybindings.register(SYSTEM_ID, "gmScreen", {
    name: `${K}.Keybinding.Name`,
    hint: `${K}.Keybinding.Hint`,
    editable: [],
    onDown: () => {
      void GmScreen.open().catch((error) =>
        console.warn("gworld | the GM Screen failed to open", error),
      );
      return true;
    },
  });

  Hooks.on("getSceneControlButtons", (controls: Record<string, any>) =>
    addGmScreenControl(controls),
  );
  Hooks.on("renderChatMessageHTML", (message: any, html: HTMLElement) => {
    const button = html.querySelector<HTMLButtonElement>("[data-gm-screen-show]");
    const flag = message?.flags?.[SYSTEM_ID]?.gmScreen;
    if (!button || !flag) return;
    if (!mayOpen()) {
      button.remove();
      return;
    }
    button.addEventListener("click", () => {
      void GmScreen.open({
        section: String(flag.section),
        row: String(flag.row),
        total: Number(flag.total),
      });
    });
  });
}
