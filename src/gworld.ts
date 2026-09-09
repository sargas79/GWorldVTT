/**
 * GWorld - a GURPS Lite (4th Edition) system for Foundry Virtual Tabletop.
 *
 * Entry point. The rules engine in `src/rules` is pure and Foundry-free; this
 * module and everything under `src/system` form the integration layer that
 * binds it to Foundry documents, sheets, and the canvas.
 */

import "./styles/gworld.css";

import * as rules from "./rules/index.js";

export const SYSTEM_ID = "gworld";

declare const Hooks: {
  once(event: string, handler: () => void): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
};

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initialising GURPS Lite system`);

  // Exposed for macros and for poking at the rules engine from the console.
  (globalThis as Record<string, unknown>).gworld = { rules };
});

Hooks.once("ready", () => {
  console.log(`${SYSTEM_ID} | Ready`);
});

export { rules };
