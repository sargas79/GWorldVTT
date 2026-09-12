/**
 * Improvement through study (GURPS Basic Set: Characters p. 292).
 *
 * Points earned on adventures are the ledger's business. Points earned by
 * sitting down with a teacher are these: "every 200 hours of study equals one
 * character point" with instruction, and twice that -- 400 hours -- teaching
 * yourself from books or learning on the job. The hours that do not yet make
 * a point are not lost: they are banked on the skill until they do.
 */

export type StudyMethod = "education" | "selfTeaching" | "onTheJob";

/** Hours of each kind of study that make one character point (p. 292). */
export const STUDY_HOURS_PER_POINT: Readonly<Record<StudyMethod, number>> = {
  education: 200,
  selfTeaching: 400,
  onTheJob: 400,
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
