/**
 * The day's temperature, as a fact about the world (GURPS Basic Set:
 * Campaigns pp. 426, 434).
 *
 * The Fatigue Costs table charges more for a hot day -- an hour's march, and
 * a battle -- and the heat charges extra on every exertion, but none of that
 * is anything a character sheet knows. The GM does, so it is a world setting:
 * set in the system settings or from the Weather dialog, read wherever the
 * system charges fatigue, and passed to the `gworld.fatigueCost` listeners so
 * a module's heat rule sees the same day everyone else does.
 */

import { SYSTEM_ID } from "./constants.js";
import { isHotDay } from "../rules/environment.js";

/** The world setting: the temperature in °F, or blank where the GM set none. */
export const TEMPERATURE_KEY = "temperatureF";

/** The day's weather, as the system reads it (the API's shape since 1.138.0). */
export interface DayWeather {
  /** The temperature in °F as the GM set it, or null where none is set. */
  temperatureF: number | null;
  /** Whether that counts as a hot day; false where no temperature is set. */
  hot: boolean;
}

/** Registers the setting. Called once, at init, with the other world settings. */
export function registerTemperatureSetting(): void {
  // A string, so blank can mean "nobody said" rather than a cold 0°F.
  game.settings.register(SYSTEM_ID, TEMPERATURE_KEY, {
    name: "GWORLD.Weather.Setting",
    hint: "GWORLD.Weather.SettingHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });
}

/** Reads a stored or typed temperature: a finite number, or null for blank. */
export function parseTemperature(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/** The day's temperature in °F, or null where the GM has set none. */
export function currentTemperature(): number | null {
  try {
    return parseTemperature(game.settings.get(SYSTEM_ID, TEMPERATURE_KEY));
  } catch {
    // Asked before settings are registered: no temperature is set.
    return null;
  }
}

/**
 * The day's weather. With an actor, `hot` is for that actor, whose
 * Temperature Tolerance on the hot side (Characters p. 93) lets them stand
 * more before the day counts as hot for them.
 */
export function dayWeather(actor?: any): DayWeather {
  const temperatureF = currentTemperature();
  if (temperatureF === null) return { temperatureF: null, hot: false };
  const toleranceF = Number(actor?.system?.derived?.traitEffects?.temperatureTolerance?.heatF) || 0;
  return { temperatureF, hot: isHotDay(temperatureF, toleranceF) };
}

/**
 * Sets the day's temperature, or clears it with null. Only the GM may: it is
 * the world's weather, not a player's. Returns whether it was set.
 */
export async function setTemperature(temperatureF: number | null): Promise<boolean> {
  if (!game.user?.isGM) return false;
  const clean = temperatureF === null ? null : parseTemperature(temperatureF);
  if (temperatureF !== null && clean === null) return false;
  await game.settings.set(SYSTEM_ID, TEMPERATURE_KEY, clean === null ? "" : String(clean));
  return true;
}
