/**
 * Which of the GM Screen's tabs players see: a checkbox a tab, the system's
 * and the modules' alike. Only the GM opens it, from the settings.
 */

import { SYSTEM_ID } from "../constants.js";
import { GM_SCREEN_TABS } from "../gm-screen/layout.js";
import { registeredGmScreenTabs } from "../gm-screen/registry.js";
import { GM_SCREEN_HIDDEN_TABS, hiddenTabs } from "../gm-screen/settings.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class GmScreenPlayerTabs extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "gworld-gm-screen-player-tabs",
    classes: ["gworld", "gworld-gm-screen-player-tabs"],
    tag: "form",
    position: { width: 380 },
    window: { title: "GWORLD.GmScreen.Setting.HiddenTabsMenu.Name" },
    form: { handler: GmScreenPlayerTabs.#onSubmit, closeOnSubmit: true },
  };

  static override PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/apps/gm-screen-player-tabs.hbs` },
  };

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const hidden = new Set(hiddenTabs());
    return {
      tabs: [...GM_SCREEN_TABS, ...registeredGmScreenTabs()].map((tab) => ({
        id: tab.id,
        label: tab.label,
        shown: !hidden.has(tab.id),
      })),
    };
  }

  static async #onSubmit(
    this: GmScreenPlayerTabs,
    _event: Event,
    form: HTMLFormElement,
  ): Promise<void> {
    const hidden = [...form.querySelectorAll<HTMLInputElement>('input[name="shown"]')]
      .filter((box) => !box.checked)
      .map((box) => box.value);
    await game.settings.set(SYSTEM_ID, GM_SCREEN_HIDDEN_TABS, hidden);
  }
}
