/**
 * Which versions of the add-on API a module says it can work with.
 *
 * A module declares a semver range in its manifest --
 * `"flags": { "gworld": { "apiVersion": "^1.0.0" } }` -- and the system checks
 * its own API version against it when the world opens. The ranges understood
 * are the ones a module author is likely to write: an exact version, `^` and
 * `~`, comparisons (`>=1.2.0 <2.0.0`), `x` wildcards (`1.x`, `1.2.x`), `*`,
 * and alternatives joined with `||`. Anything else is not understood, and a
 * range that isn't understood is treated as not met, so the GM hears about it.
 */

type Triple = [number, number, number];

/** A version as three numbers, or null. Pre-release and build suffixes are ignored. */
export function parseVersion(version: string): Triple | null {
  const match = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+][0-9A-Za-z.-]*)?\s*$/.exec(version ?? "");
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compare(a: Triple, b: Triple): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

/** Whether a version satisfies one space-separated set of conditions, or null if a condition isn't understood. */
function satisfiesAll(version: Triple, conditions: string): boolean | null {
  const parts = conditions.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    const ok = satisfiesOne(version, part);
    if (ok === null) return null;
    if (!ok) return false;
  }
  return true;
}

function satisfiesOne(version: Triple, condition: string): boolean | null {
  if (condition === "*" || condition === "x") return true;

  const wildcard = /^(\d+)\.(?:(\d+)\.)?[xX*]$/.exec(condition);
  if (wildcard) {
    if (version[0] !== Number(wildcard[1])) return false;
    return wildcard[2] === undefined || version[1] === Number(wildcard[2]);
  }

  const op = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(condition);
  const target = op ? parseVersion(op[2]!) : null;
  if (!op || !target) return null;
  const c = compare(version, target);
  switch (op[1] ?? "=") {
    case "=": return c === 0;
    case ">": return c > 0;
    case ">=": return c >= 0;
    case "<": return c < 0;
    case "<=": return c <= 0;
    case "~": return c >= 0 && version[0] === target[0] && version[1] === target[1];
    case "^": {
      if (c < 0) return false;
      // ^0.x is stricter, as in npm: a 0.y API may break at every minor version.
      if (target[0] > 0) return version[0] === target[0];
      if (target[1] > 0) return version[0] === 0 && version[1] === target[1];
      return version[0] === 0 && version[1] === 0 && version[2] === target[2];
    }
    default: return null;
  }
}

/** Whether a version satisfies a range. A range that can't be read is not satisfied. */
export function satisfiesApiRange(version: string, range: string): boolean {
  const parsed = parseVersion(version);
  if (!parsed || typeof range !== "string" || !range.trim()) return false;
  return range.split("||").some((alternative) => satisfiesAll(parsed, alternative) === true);
}

/** A module whose declared range the running API doesn't meet. */
export interface IncompatibleModule {
  id: string;
  title: string;
  range: string;
}

/** The active modules whose `flags.gworld.apiVersion` isn't met by `version`. */
export function incompatibleModules(
  version: string,
  modules: Iterable<{ id: string; title?: string; active?: boolean; flags?: Record<string, any> }>,
): IncompatibleModule[] {
  const out: IncompatibleModule[] = [];
  for (const module of modules) {
    if (!module?.active) continue;
    const range = module.flags?.gworld?.apiVersion;
    if (typeof range !== "string") continue;
    if (!satisfiesApiRange(version, range)) out.push({ id: module.id, title: module.title ?? module.id, range });
  }
  return out;
}
