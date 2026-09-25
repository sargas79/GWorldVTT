/**
 * Improvement through study (GURPS Basic Set: Characters pp. 292-293).
 *
 * Points earned on adventures are the ledger's business. Points earned by
 * sitting down with a teacher are these: 200 hours of learning make a point,
 * and how many hours of the clock make an hour of learning depends on how
 * the studying was done. The hours that do not yet make a point are not
 * lost: they are banked on the skill until they do.
 */

export type StudyMethod = "education" | "intensive" | "selfTeaching" | "onTheJob";

/**
 * Hours of each kind of study that make one character point (pp. 292-293).
 *
 * "It takes 200 hours of learning to gain one point"; an hour of instruction
 * is an hour of learning, an hour of intensive training counts as two, "every
 * two hours of reading, exercises, practice, etc. without an instructor count
 * as one hour", and "every four hours on the job count as one hour".
 */
export const STUDY_HOURS_PER_POINT: Readonly<Record<StudyMethod, number>> = {
  education: 200,
  intensive: 100,
  selfTeaching: 400,
  onTheJob: 800,
};

export interface StudyResult {
  /** Character points earned, to go into the skill studied. */
  points: number;
  /** Hours toward the next point, to be banked on the skill. */
  bankedHours: number;
}

/**
 * What a stretch of study is worth (p. 292).
 *
 * The hours already banked count first, so a hundred hours on top of a
 * hundred and fifty is a point and fifty over.
 */
export function studyPoints(options: {
  hours: number;
  method: StudyMethod;
  /** Hours already banked toward the next point. */
  banked?: number;
}): StudyResult {
  const rate = STUDY_HOURS_PER_POINT[options.method];
  const total = Math.max(0, options.banked ?? 0) + Math.max(0, options.hours);
  const points = Math.floor(total / rate);
  return { points, bankedHours: total - points * rate };
}

export interface StudyLevelsResult {
  /** Levels gained, to go onto the attribute or trait studied. */
  levels: number;
  /** Character points those levels cost, for the ledger. */
  points: number;
  /** Hours toward the next level, to be banked on what was studied. */
  bankedHours: number;
}

/**
 * What a stretch of study is worth toward something bought by the level
 * rather than by the point: an attribute, or an advantage that can be learned
 * as if it were a skill (pp. 292, 294). A skill takes a point at a time; an
 * attribute or a trait only moves when a whole level is paid for, so the
 * hours are banked until they come to the next level's cost at 200 hours of
 * learning a point.
 *
 * `levelCost(n)` is what the n-th level from here costs (0 first), or null
 * when there is no such level. A level that costs nothing, or less, can't be
 * studied toward and stops the count.
 */
export function studyLevels(options: {
  hours: number;
  method: StudyMethod;
  /** Hours already banked toward the next level. */
  banked?: number;
  levelCost: (n: number) => number | null;
}): StudyLevelsResult {
  const rate = STUDY_HOURS_PER_POINT[options.method];
  let total = Math.max(0, options.banked ?? 0) + Math.max(0, options.hours);
  let levels = 0;
  let points = 0;
  for (;;) {
    const cost = options.levelCost(levels);
    if (cost === null || !Number.isFinite(cost) || cost <= 0 || total < cost * rate) break;
    total -= cost * rate;
    points += cost;
    levels += 1;
  }
  return { levels, points, bankedHours: total };
}
