/**
 * The Combat tab's log: this character's most recent chat messages, a line
 * each, newest first.
 *
 * The chat log is the record; this is a view of it. Each line says what the
 * card is about in a few words and links back to the card itself.
 */

export interface LogMessage {
  id: string;
  speakerActor: string | null;
  flavor?: unknown;
  content?: unknown;
  timestamp?: unknown;
  rolls?: unknown[];
}

export interface LogLine {
  id: string;
  text: string;
  /** "roll" for a card with dice on it, "note" for anything else. */
  kind: "roll" | "note";
  timestamp: number;
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** An HTML card as one line of plain text, cut at a word. */
export function plainLine(html: unknown, limit = 110): string {
  const text = String(html ?? "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e)
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The last `count` messages this actor spoke, newest first, each as a line. */
export function combatLog(messages: readonly LogMessage[], actorId: string, count = 8): LogLine[] {
  return messages
    .filter((m) => m.speakerActor === actorId)
    .slice(-count)
    .reverse()
    .map((m) => ({
      id: m.id,
      text: plainLine(String(m.flavor ?? "").trim() ? m.flavor : m.content),
      kind: (Array.isArray(m.rolls) && m.rolls.length > 0 ? "roll" : "note") as LogLine["kind"],
      timestamp: Number(m.timestamp) || 0,
    }))
    .filter((line) => line.text.length > 0);
}
