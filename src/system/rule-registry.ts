/**
 * Rules an add-on module brings with it.
 *
 * The system's own switches are a fixed table (`optional-rules.ts`): the Basic
 * Set's rules and nothing else. Another book's rules come from a module, and a
 * table playing them wants to switch them on and off on the same page, stored
 * in the same object, asked about the same way. So a module registers a group
 * and its switches while the system starts up, and from then on they are rules
 * like any other.
 *
 * Two things keep a module's rules from ever touching the system's:
 *
 *   - **Keys are namespaced.** A module's `feint` is stored and asked about as
 *     `<module>.feint`. The system's keys never contain a dot, so the two can
 *     never collide, and a key with a dot always says whose it is.
 *   - **The window closes.** Registering is only possible until Foundry's
 *     `setup` hook. Settings are read, sheets are drawn and rules are asked
 *     about after that, and a switch appearing halfway through a session would
 *     be a switch nobody saw.
 */

/** A group of switches, as a module registers it. */
export interface RuleGroupRegistration {
  /** The registering module's id. */
  module: string;
  /** The group's id within the module. */
  id: string;
  /** The heading shown on the Rules page: a localization key or plain text. */
  label: string;
}

/** One switch, as a module registers it. */
export interface RuleRegistration {
  /** The registering module's id. */
  module: string;
  /** The id of a group this module registered. */
  group: string;
  /** The rule's key within the module. Stored as `<module>.<key>`. */
  key: string;
  /** The switch's name: a localization key or plain text. */
  name: string;
  /** One line under the name: a localization key or plain text. */
  hint?: string;
  /** Where the rule is written, shown beside the switch. */
  reference: string;
  /** Whether a world that has never saved the switch plays the rule. */
  default: boolean;
  /** False for a rule the module lists but does not read yet. */
  implemented?: boolean;
}

/** A registered group. */
export interface AddonRuleGroup {
  /** `<module>.<id>`. */
  id: string;
  module: string;
  label: string;
}

/** A registered switch. */
export interface AddonRule {
  /** `<module>.<key>`: what is stored and asked about. */
  key: string;
  module: string;
  /** The group's `<module>.<id>`. */
  group: string;
  name: string;
  hint: string;
  reference: string;
  default: boolean;
  implemented: boolean;
}

/** What a module is handed in the `gworld.registerRules` hook. */
export interface RuleRegistry {
  registerRuleGroup(registration: RuleGroupRegistration): string | null;
  registerRule(registration: RuleRegistration): string | null;
}

/** The hook a module listens to for registering its rules. */
export const REGISTER_RULES_HOOK = "gworld.registerRules";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const groups = new Map<string, AddonRuleGroup>();
const rules = new Map<string, AddonRule>();
let open = true;

/** The stored key for a module's rule. */
export function namespacedRuleKey(module: string, key: string): string {
  return `${module}.${key}`;
}

/** Whether a key belongs to a module rather than to the system. */
export function isAddonRuleKey(key: string): boolean {
  return key.includes(".");
}

/**
 * Nothing registered is ever an error that stops the system: a module with a
 * mistake loses the one registration and says why in the console.
 */
function refuse(what: string, why: string): null {
  console.warn(`gworld | ${what} not registered: ${why}`);
  return null;
}

/** Registers a group of switches. Returns the group's `<module>.<id>`, or null. */
export function registerRuleGroup(registration: RuleGroupRegistration): string | null {
  const { module, id, label } = registration ?? ({} as RuleGroupRegistration);
  const what = `rule group ${module}.${id}`;
  if (!open) return refuse(what, "rules can only be registered before the setup hook");
  if (typeof module !== "string" || !IDENTIFIER.test(module)) return refuse(what, "the module id is missing or malformed");
  if (typeof id !== "string" || !IDENTIFIER.test(id)) return refuse(what, "the group id is missing or malformed");
  if (typeof label !== "string" || !label.trim()) return refuse(what, "it has no label");
  const full = namespacedRuleKey(module, id);
  if (groups.has(full)) return refuse(what, "that group is already registered");
  groups.set(full, { id: full, module, label: label.trim() });
  return full;
}

/** Registers one switch in a group the same module registered. Returns its stored key, or null. */
export function registerRule(registration: RuleRegistration): string | null {
  const r = registration ?? ({} as RuleRegistration);
  const what = `rule ${r.module}.${r.key}`;
  if (!open) return refuse(what, "rules can only be registered before the setup hook");
  if (typeof r.module !== "string" || !IDENTIFIER.test(r.module)) return refuse(what, "the module id is missing or malformed");
  if (typeof r.key !== "string" || !IDENTIFIER.test(r.key)) return refuse(what, "the key is missing or malformed");
  const group = groups.get(namespacedRuleKey(r.module, String(r.group)));
  if (!group) return refuse(what, `the module has no group "${r.group}"`);
  if (typeof r.name !== "string" || !r.name.trim()) return refuse(what, "it has no name");
  if (typeof r.reference !== "string" || !r.reference.trim()) return refuse(what, "it has no reference");
  if (typeof r.default !== "boolean") return refuse(what, "its default is not true or false");
  const key = namespacedRuleKey(r.module, r.key);
  if (rules.has(key)) return refuse(what, "that key is already registered");
  rules.set(key, {
    key,
    module: r.module,
    group: group.id,
    name: r.name.trim(),
    hint: typeof r.hint === "string" ? r.hint.trim() : "",
    reference: r.reference.trim(),
    default: r.default,
    implemented: r.implemented !== false,
  });
  return key;
}

/** Ends registration. Called once, at Foundry's `setup` hook. */
export function closeRuleRegistration(): void {
  open = false;
}

/**
 * Asks the active modules for their rules. Called during the system's `init`,
 * before the settings are registered, so a module's listeners -- added when its
 * script loaded, before `init` began -- have all run by the time anything
 * reads a rule.
 */
export function openRuleRegistration(): void {
  const registry: RuleRegistry = { registerRuleGroup, registerRule };
  Hooks.callAll(REGISTER_RULES_HOOK, registry);
}

/** The registered groups, in the order they were registered. */
export function registeredRuleGroups(): AddonRuleGroup[] {
  return [...groups.values()];
}

/** The registered switches, in the order they were registered; one group's if named. */
export function registeredRules(group?: string): AddonRule[] {
  const all = [...rules.values()];
  return group === undefined ? all : all.filter((rule) => rule.group === group);
}

/** One registered switch by its stored key. */
export function registeredRule(key: string): AddonRule | undefined {
  return rules.get(key);
}
