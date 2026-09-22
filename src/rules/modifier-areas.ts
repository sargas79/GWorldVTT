/**
 * Areas on a map that change the rolls made in them or through them: smoke,
 * a fog bank, a field that blinds one sense (since API 1.63.0).
 *
 * Pure geometry and filtering; the system reads the areas off the scene and
 * says where the roller and the target stand.
 */

export interface Point {
  x: number;
  y: number;
}

/** A line an area puts on a roll. */
export interface AreaLine {
  label: string;
  value: number;
  /** Roll kinds and tags it applies to, as a condition modifier's `rolls`; empty or absent for every roll. */
  rolls?: string[];
  /** `inside` for a roller standing in the area, `through` for a line from roller to target crossing it, `both` for either. */
  applies?: "inside" | "through" | "both";
}

/** An area as a module registers it. */
export interface ModifierArea {
  id: string;
  label: string;
  /** A circle: its centre in scene pixels and its radius in pixels. */
  center?: Point | null;
  radius?: number | null;
  /**
   * Stretches the circle into a band (since 1.70.0): every point within
   * `radius` of the line from here to `center`, as a swath of fire from where
   * it was fired to where it was aimed. Scene pixels.
   */
  from?: Point | null;
  /** Or a region on the scene, by id. */
  region?: string | null;
  lines: AreaLine[];
  /** The world time, in seconds, it goes at; null for never. */
  expires?: number | null;
}

/** Whether a point lies in a circle. */
export function inCircle(point: Point, center: Point, radius: number): boolean {
  return Math.hypot(point.x - center.x, point.y - center.y) <= radius;
}

/** Whether the segment from `a` to `b` passes through a circle. */
export function segmentCrossesCircle(a: Point, b: Point, center: Point, radius: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / length));
  return inCircle({ x: a.x + t * dx, y: a.y + t * dy }, center, radius);
}

/** How far a point is from the segment from `a` to `b`. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Whether a point lies in a band: within `radius` of the segment from `from` to `center`. */
export function inBand(point: Point, from: Point, center: Point, radius: number): boolean {
  return distanceToSegment(point, from, center) <= radius;
}

/** Whether the segment from `a` to `b` passes within `radius` of the segment from `c` to `d`. */
export function segmentCrossesBand(a: Point, b: Point, c: Point, d: Point, radius: number): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b)) <= radius;
}

/** Whether a line applies to a roll of this kind with these tags. */
export function lineAppliesTo(line: AreaLine, kind: string, tags: readonly string[]): boolean {
  return !Array.isArray(line.rolls) || line.rolls.length === 0 || line.rolls.some((r) => r === kind || tags.includes(r));
}

/**
 * The lines the areas put on one roll, each labelled with its area. An area
 * gives its `inside` lines where the roller stands in it, and its `through`
 * lines where the line to the target crosses it; a `both` line counts once.
 * Expired areas give nothing.
 */
export function areaLines(options: {
  areas: readonly ModifierArea[];
  kind: string;
  tags: readonly string[];
  now: number;
  /** Whether the roller stands in the area. */
  inside: (area: ModifierArea) => boolean;
  /** Whether the line to the target crosses it; false where there is no target. */
  through: (area: ModifierArea) => boolean;
}): Array<{ label: string; value: number }> {
  const lines: Array<{ label: string; value: number }> = [];
  for (const area of options.areas) {
    if (typeof area.expires === "number" && Number.isFinite(area.expires) && options.now >= area.expires) continue;
    const wanted = (area.lines ?? []).filter((l) => typeof l?.value === "number" && Number.isFinite(l.value) && l.value !== 0 && lineAppliesTo(l, options.kind, options.tags));
    if (!wanted.length) continue;
    let isInside: boolean | null = null;
    let isThrough: boolean | null = null;
    for (const line of wanted) {
      const applies = line.applies ?? "both";
      const hit =
        (applies !== "through" && (isInside ??= options.inside(area))) ||
        (applies !== "inside" && (isThrough ??= options.through(area)));
      if (hit) lines.push({ label: line.label ? `${area.label}: ${line.label}` : area.label, value: line.value });
    }
  }
  return lines;
}

/** A circle's centre point, where a module gave a usable one, and where a band starts (since 1.70.0). */
export function circleOf(area: ModifierArea): { center: Point; radius: number; from: Point | null } | null {
  const c = area.center;
  const r = Number(area.radius);
  if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y) || !(r > 0)) return null;
  const f = area.from;
  const from = f && Number.isFinite(f.x) && Number.isFinite(f.y) ? { x: f.x, y: f.y } : null;
  return { center: { x: c.x, y: c.y }, radius: r, from };
}

/** Whether a point is in an area drawn as a circle or a band; false for a region. */
export function inShape(point: Point, area: ModifierArea): boolean {
  const circle = circleOf(area);
  if (!circle) return false;
  return circle.from ? inBand(point, circle.from, circle.center, circle.radius) : inCircle(point, circle.center, circle.radius);
}

/** Whether the segment from `a` to `b` crosses an area drawn as a circle or a band. */
export function segmentCrossesShape(a: Point, b: Point, area: ModifierArea): boolean {
  const circle = circleOf(area);
  if (!circle) return false;
  return circle.from ? segmentCrossesBand(a, b, circle.from, circle.center, circle.radius) : segmentCrossesCircle(a, b, circle.center, circle.radius);
}
