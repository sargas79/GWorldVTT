/**
 * Minimal ambient declarations for the Foundry VTT v14 globals this system uses.
 *
 * Foundry ships no official TypeScript types, and the community packages lag
 * behind v14. Rather than depend on a stale type package, this file declares
 * only the surface GWorld actually touches, verified against the v14.367
 * client source. Anything not declared here is deliberately absent so that
 * reaching for an unverified API is a compile error rather than a runtime one.
 */

declare global {
  namespace foundry {
    namespace abstract {
      class DataModel {
        constructor(data?: object, options?: object);
        static defineSchema(): Record<string, unknown>;
        readonly parent: unknown;
        updateSource(changes: object, options?: object): object;
        toObject(source?: boolean): Record<string, unknown>;
      }

      class TypeDataModel extends DataModel {
        prepareBaseData(): void;
        prepareDerivedData(): void;
        /**
         * Checks a document as a whole, after each field has validated itself.
         * The place for rules that relate two fields to each other.
         */
        static validateJoint(data: Record<string, unknown>): void;
      }
    }

    namespace data {
      namespace fields {
        interface DataFieldOptions {
          required?: boolean;
          nullable?: boolean;
          initial?: unknown;
          label?: string;
          hint?: string;
          validate?: (value: unknown) => boolean | void;
        }

        interface NumberFieldOptions extends DataFieldOptions {
          min?: number;
          max?: number;
          step?: number;
          integer?: boolean;
          positive?: boolean;
          choices?: readonly number[] | Record<string, string>;
        }

        interface StringFieldOptions extends DataFieldOptions {
          blank?: boolean;
          trim?: boolean;
          choices?: readonly string[] | Record<string, string>;
          textSearch?: boolean;
        }

        class DataField {
          constructor(options?: DataFieldOptions);
        }
        class SchemaField extends DataField {
          constructor(fields: Record<string, DataField>, options?: DataFieldOptions);
        }
        class NumberField extends DataField {
          constructor(options?: NumberFieldOptions);
        }
        class StringField extends DataField {
          constructor(options?: StringFieldOptions);
        }
        class BooleanField extends DataField {
          constructor(options?: DataFieldOptions);
        }
        class HTMLField extends DataField {
          constructor(options?: StringFieldOptions);
        }
        class ArrayField extends DataField {
          constructor(element: DataField, options?: DataFieldOptions);
        }
        class ObjectField extends DataField {
          constructor(options?: DataFieldOptions);
        }
        class TypedObjectField extends DataField {
          constructor(element: DataField, options?: DataFieldOptions);
        }
        class DocumentUUIDField extends DataField {
          constructor(options?: DataFieldOptions & { relative?: boolean });
        }
        class FilePathField extends DataField {
          constructor(options?: DataFieldOptions & { categories?: string[] });
        }
      }
    }

    namespace applications {
      namespace api {
        class ApplicationV2 {
          constructor(options?: object);
          static DEFAULT_OPTIONS: object;
          static TABS: Record<
            string,
            { tabs: Array<{ id: string; cssClass?: string; label?: string }>; initial?: string; labelPrefix?: string }
          >;
          /** The unique element id Foundry gives this window. */
          readonly id: string;
          readonly element: HTMLElement;
          readonly tabGroups: Record<string, string>;
          render(options?: object | boolean): Promise<this>;
          close(options?: object): Promise<this>;
          changeTab(tab: string, group: string, options?: object): void;
          _prepareContext(options: object): Promise<object>;
        }

        class DocumentSheetV2 extends ApplicationV2 {
          readonly document: any;
          readonly isEditable: boolean;
          /**
           * Turns the submitted form into the expanded object the document is
           * updated with. Overridden to supply values a form omits, such as a
           * checkbox group with nothing ticked.
           */
          _processFormData(event: Event | null, form: HTMLFormElement, formData: object): object;
        }

        class DialogV2 extends ApplicationV2 {
          static confirm(options?: object): Promise<boolean>;
          static prompt(options?: object): Promise<unknown>;
          static wait(options?: object): Promise<unknown>;
        }

        function HandlebarsApplicationMixin<T extends abstract new (...args: any[]) => any>(
          Base: T,
        ): T & {
          new (...args: any[]): {
            _prepareContext(options: object): Promise<object>;
            _preparePartContext(partId: string, context: object, options: object): Promise<object>;
            _configureRenderParts(options: object): Record<string, unknown>;
            _onFirstRender(context: object, options: object): Promise<void>;
            _onRender(context: object, options: object): Promise<void>;
            _onClose(options: object): Promise<void>;
          };
          PARTS: Record<string, { template: string; scrollable?: string[]; templates?: string[] }>;
        };
      }

      namespace ux {
        class TextEditor {
          static implementation: {
            enrichHTML(content: string, options?: object): Promise<string>;
            getDragEventData(event: DragEvent): Record<string, unknown>;
          };
        }
      }

      namespace sheets {
        class ActorSheetV2 extends foundry.applications.api.DocumentSheetV2 {
          readonly actor: any;
          /**
           * Handles one dropped Item. The default creates it on the actor;
           * returning a nullish value means nothing was created. Verified
           * against `client/applications/sheets/actor-sheet.mjs`.
           */
          _onDropItem(event: DragEvent, item: any): Promise<unknown>;
        }
        class ItemSheetV2 extends foundry.applications.api.DocumentSheetV2 {
          readonly item: any;
        }
      }

      namespace apps {
        /**
         * The file browser. Only what the item sheet uses is declared: it is
         * constructed with the current path, a file type and a callback, and
         * `browse()` opens it.
         */
        class FilePicker {
          static implementation: new (options: {
            current?: string;
            type?: string;
            callback?: (path: string) => void;
          }) => { browse(): Promise<unknown> };
        }
        class DocumentSheetConfig {
          static registerSheet(
            documentClass: unknown,
            scope: string,
            sheetClass: unknown,
            options?: {
              label?: string;
              types?: string[];
              makeDefault?: boolean;
              canBeDefault?: boolean;
              canConfigure?: boolean;
            },
          ): void;
          static unregisterSheet(
            documentClass: unknown,
            scope: string,
            sheetClass: unknown,
            options?: { types?: string[] },
          ): void;
        }
      }

      namespace handlebars {
        /**
         * Preloads and compiles templates. Given a record, each key becomes the
         * name the partial is registered under -- verified against
         * `client/applications/handlebars.mjs`, which calls `getTemplate(p, k)`
         * for each entry.
         */
        function loadTemplates(paths: string[] | Record<string, string>): Promise<unknown>;
        function renderTemplate(path: string, data: object): Promise<string>;
      }
    }

    namespace utils {
      function mergeObject<T extends object>(original: T, other?: object, options?: object): T;
      function getProperty(object: object, key: string): unknown;
      function setProperty(object: object, key: string, value: unknown): boolean;
      function deepClone<T>(original: T): T;
      function randomID(length?: number): string;
      /**
       * Escapes &, <, >, " and ' for insertion into markup. Verified against
       * `common/utils/helpers.mjs`.
       */
      function escapeHTML(value: unknown): string;
    }
  }

  const CONFIG: {
    Actor: {
      documentClass: unknown;
      dataModels: Record<string, unknown>;
      typeLabels?: Record<string, string>;
    };
    Item: {
      documentClass: unknown;
      dataModels: Record<string, unknown>;
      typeLabels?: Record<string, string>;
    };
    Combat: { documentClass: unknown; initiative: { formula: string | null; decimals: number } };
    Combatant: { documentClass: unknown };
    /**
     * The status effects a token can carry.
     *
     * Declared as an array with a string index because it is neither: it is a
     * Proxy over an array that also keys each entry by its id, which is how
     * `Actor#toggleStatusEffect` looks one up. Writing `CONFIG.statusEffects[id]
     * = effect` goes through the proxy and does both; assigning a plain array
     * over the whole thing replaces the proxy and breaks every toggle.
     */
    statusEffects: Array<{ id: string; name: string; img: string }> & {
      [id: string]: { id: string; name: string; img: string };
    };
    [key: string]: any;
  };

  const CONST: {
    ACTIVE_EFFECT_CHANGE_TYPES: Record<string, number>;
    [key: string]: any;
  };

  const Hooks: {
    once(event: string, handler: (...args: any[]) => unknown): number;
    on(event: string, handler: (...args: any[]) => unknown): number;
    /** Takes either the handler or the id `on` returned for it. */
    off(event: string, handler: number | ((...args: any[]) => unknown)): void;
    call(event: string, ...args: any[]): boolean;
    callAll(event: string, ...args: any[]): boolean;
  };

  const game: {
    i18n: { localize(key: string): string; format(key: string, data?: object): string };
    /**
     * Keyboard shortcuts. Registered at init, before the bindings are built;
     * `onDown` returns true when it handled the key.
     */
    keybindings: {
      register(
        namespace: string,
        action: string,
        data: {
          name: string;
          hint?: string;
          editable?: Array<{ key: string; modifiers?: string[] }>;
          onDown?: () => boolean | void;
          onUp?: () => boolean | void;
          restricted?: boolean;
        },
      ): void;
    };
    settings: {
      get(namespace: string, key: string): unknown;
      set(namespace: string, key: string, value: unknown): Promise<unknown>;
      register(namespace: string, key: string, data: object): void;
      /**
       * Registers a button in the settings list that opens an application,
       * for a setting too involved to edit as one field.
       */
      registerMenu(namespace: string, key: string, data: object): void;
    };
    /**
     * `targets` is the set of tokens this user has targeted, which is how a
     * player says who they are shooting at (User#targets, a UserTargets set of
     * Token placeables).
     */
    user: { id: string; isGM: boolean; targets: Set<any> } | null;
    system: { id: string; version: string };
    ready: boolean;
    [key: string]: any;
  };

  /**
   * The active scene's canvas. Only the token layer's selection is declared:
   * `PlaceablesLayer#controlled` returns the placeables the user has selected,
   * and a Token placeable carries the actor it represents.
   *
   * Null before a scene is drawn, which is the case in a world with no scenes.
   */
  const canvas: {
    tokens: { controlled: Array<{ actor: any }> } | null;
    [key: string]: any;
  } | null;

  /**
   * Resolves a document by UUID, including one inside a compendium, or null
   * when nothing is there. Exposed globally by the client (`fromUuid` in
   * client/global.mjs, from foundry.utils).
   */
  function fromUuid(uuid: string, options?: object): Promise<any>;

  /**
   * The Combat document. Only what a subclass overrides is declared:
   * `_sortCombatants` is the turn-order comparator, called unbound.
   */
  class Combat {
    _sortCombatants(a: any, b: any): number;
    [key: string]: any;
  }

  const Actor: any;
  const Item: any;
  const ui: any;

  /** Foundry's dice roller. Formula evaluation and dice animation go through it. */
  class Roll {
    constructor(formula: string, data?: object, options?: object);
    readonly total: number;
    readonly dice: Array<{ results: Array<{ result: number; active?: boolean }> }>;
    evaluate(options?: object): Promise<this>;
    toJSON(): object;
  }

  const ChatMessage: {
    implementation: {
      create(data: object, operation?: object): Promise<unknown>;
      getSpeaker(options?: { scene?: unknown; actor?: unknown; token?: unknown; alias?: string }): object;
      /**
       * The users a whisper to this name reaches. Verified against
       * `client/documents/chat-message.mjs`: "GM" and "DM" return every GM,
       * "players" returns the non-GMs, and anything else is matched against
       * user names.
       */
      getWhisperRecipients(name: string): Array<{ id: string }>;
    };
  };
}

export {};
