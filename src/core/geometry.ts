/**
 * Pure 2D/2.5D geometry shared by the effects. No three.js, no DOM — every
 * function here is deterministic and unit-tested, so effects stay thin
 * rendering shells around verifiable math.
 *
 * Coordinate convention (same as the whole app): screen space normalized
 * 0..1, x right, y down.
 */

export interface Pt2 {
  x: number;
  y: number;
}

export interface Pt3 extends Pt2 {
  z: number;
}

/** Mean of the points. */
export function centroid(points: readonly Pt2[]): Pt2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = points.length || 1;
  return { x: x / n, y: y / n };
}

/**
 * Orders points by angle around a center (ascending atan2, so starting from
 * the upper-left in y-down space). This is what turns an unordered set of
 * fingertips into a simple, non-self-crossing polygon. Returns a new array
 * holding the same point objects.
 */
export function sortAroundCentroid<T extends Pt2>(points: readonly T[], c = centroid(points)): T[] {
  return [...points].sort(
    (a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x),
  );
}

/** Largest distance from the center to any point — the hand's "spread". */
export function maxRadius(points: readonly Pt2[], c = centroid(points)): number {
  let r = 0;
  for (const p of points) r = Math.max(r, Math.hypot(p.x - c.x, p.y - c.y));
  return r;
}

/**
 * Reorders an angle-sorted quad [p0..p3] so the SHORTER diagonal runs a—c.
 * Folding a sheet along the shorter diagonal is what a real piece of paper
 * would do; the two facets are then (a,b,c) and (a,c,d). Returns the same
 * point objects, so a caller may lift a.z / c.z into the fold ridge.
 */
export function foldQuad<T extends Pt2>(quad: readonly T[]): [T, T, T, T] {
  const d0 = Math.hypot(quad[0].x - quad[2].x, quad[0].y - quad[2].y);
  const d1 = Math.hypot(quad[1].x - quad[3].x, quad[1].y - quad[3].y);
  return d0 <= d1
    ? [quad[0], quad[1], quad[2], quad[3]]
    : [quad[1], quad[2], quad[3], quad[0]];
}

/**
 * Lambert term of one virtual key light (upper-left, slightly toward the
 * viewer) on a triangle, 0 dark .. 1 lit, 0.5 = facing straight out.
 * x is aspect-corrected so the light behaves the same on wide canvases.
 * Winding-independent: the normal is flipped to face the viewer.
 */
export function keyLightShade(tri: readonly Pt3[], aspect: number): number {
  const ax = tri[0].x * aspect;
  const bx = tri[1].x * aspect;
  const cx = tri[2].x * aspect;
  const ux = bx - ax;
  const uy = tri[1].y - tri[0].y;
  const uz = tri[1].z - tri[0].z;
  const vx = cx - ax;
  const vy = tri[2].y - tri[0].y;
  const vz = tri[2].z - tri[0].z;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const nl = Math.hypot(nx, ny, nz) || 1;
  const d = (nx * -0.45 + ny * -0.55 + nz * 0.7) / nl;
  return Math.max(0, Math.min(1, (d + 1) / 2));
}

/** Cubic Hermite through x0→x1 with tangents t0/t1, evaluated at w in 0..1. */
function hermite(x0: number, x1: number, t0: number, t1: number, w: number): number {
  const c2 = -3 * x0 + 3 * x1 - 2 * t0 - t1;
  const c3 = 2 * x0 - 2 * x1 + t0 + t1;
  return ((c3 * w + c2) * w + t0) * w + x0;
}

/**
 * Samples a CLOSED uniform Catmull-Rom curve through the control points —
 * the exact math of three.js's CatmullRomCurve3 (curveType 'catmullrom',
 * closed) so extracting it changed nothing visually; the unit test compares
 * the two directly. `samples` points are returned at t = i/(samples-1), so
 * the last sample equals the first (the loop closes). Higher `tension`
 * rounds the curve; 0 gives straight-ish segments.
 */
export function sampleClosedCatmullRom(
  points: readonly Pt2[],
  samples: number,
  tension: number,
): Pt2[] {
  const l = points.length;
  const out: Pt2[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const p = l * t;
    const intPoint = Math.floor(p);
    const w = p - intPoint;
    const p0 = points[(intPoint - 1 + l) % l];
    const p1 = points[intPoint % l];
    const p2 = points[(intPoint + 1) % l];
    const p3 = points[(intPoint + 2) % l];
    out.push({
      x: hermite(p1.x, p2.x, (p2.x - p0.x) * tension, (p3.x - p1.x) * tension, w),
      y: hermite(p1.y, p2.y, (p2.y - p0.y) * tension, (p3.y - p1.y) * tension, w),
    });
  }
  return out;
}
