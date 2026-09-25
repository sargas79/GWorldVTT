/**
 * How hard the job in hand is, and how long is spent on it
 * (GURPS Basic Set: Campaigns pp. 345-346).
 *
 * A success roll is the skill plus whatever the situation adds or takes away.
 * These are the GM's standard steps for the situation: how easy the task is,
 * and the bonus for taking longer over it than it needs. Equipment is the
 * third, and lives with what equipment costs (`wealth.ts`).
 */

/** The steps of task difficulty, easiest first (p. 345). */
export type TaskDifficulty =
  | "automatic"
  | "trivial"
  | "veryEasy"
  | "easy"
  | "veryFavorable"
  | "average"
  | "veryUnfavorable"
  | "hard"
  | "veryHard"
  | "dangerous"
  | "impossible";

/**
 * The Task Difficulty Modifiers (p. 345): +10 for an automatic task down to
 * -10 for an impossible one, in steps of 2.
 */
export const TASK_DIFFICULTY: ReadonlyArray<{ difficulty: TaskDifficulty; modifier: number }> = [
  { difficulty: "automatic", modifier: 10 },
  { difficulty: "trivial", modifier: 8 },
  { difficulty: "veryEasy", modifier: 6 },
  { difficulty: "easy", modifier: 4 },
  { difficulty: "veryFavorable", modifier: 2 },
  { difficulty: "average", modifier: 0 },
  { difficulty: "veryUnfavorable", modifier: -2 },
  { difficulty: "hard", modifier: -4 },
  { difficulty: "veryHard", modifier: -6 },
  { difficulty: "dangerous", modifier: -8 },
  { difficulty: "impossible", modifier: -10 },
];

/**
 * Taking extra time (p. 346): +1 for twice the time the task needs, +2 for
 * four times, +3 for eight, +4 for fifteen and +5, the most there is, for
 * thirty.
 */
export const EXTRA_TIME: ReadonlyArray<{ multiple: number; bonus: number }> = [
  { multiple: 2, bonus: 1 },
  { multiple: 4, bonus: 2 },
  { multiple: 8, bonus: 3 },
  { multiple: 15, bonus: 4 },
  { multiple: 30, bonus: 5 },
];

