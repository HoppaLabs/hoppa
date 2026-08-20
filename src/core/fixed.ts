// Fixed-point arithmetic. The determinism zone forbids floating point (spec S2),
// and real-time movement needs positions between cells, so positions are
// integers counting SUBCELLS.
//
// 256 subcells to a cell, which is how the machines this game is pretending to
// be did it: a shift, never a divide, and exact on every device. A creature at
// x = 384 is halfway across cell 1.
//
// Everything here is closed over 32-bit integers. Math.imul for products,
// | 0 everywhere else, and nothing that can produce a fraction.

/** Subcells per cell. A power of two so every conversion is a shift. */
export const ONE = 256;
export const SHIFT = 8;

export function fromCell(cells: number): number {
  return ((cells | 0) << SHIFT) | 0;
}

/** The cell a subcell position sits in, rounding towards negative infinity. */
export function toCell(value: number): number {
  return (value | 0) >> SHIFT;
}

/** How far into its cell a position is, always 0..ONE-1. */
export function fraction(value: number): number {
  return (value | 0) & (ONE - 1);
}

/** The centre of a cell. */
export function cellCentre(cells: number): number {
  return (fromCell(cells) + (ONE >> 1)) | 0;
}

export function mul(a: number, b: number): number {
  // The product of two fixed-point values has twice the fraction, so shift back.
  return (Math.imul(a | 0, b | 0) >> SHIFT) | 0;
}

export function div(a: number, b: number): number {
  if ((b | 0) === 0) return 0;
  return (((a | 0) << SHIFT) / (b | 0)) | 0;
}

export function clamp(value: number, low: number, high: number): number {
  const v = value | 0;
  if (v < (low | 0)) return low | 0;
  if (v > (high | 0)) return high | 0;
  return v;
}

export function abs(value: number): number {
  const v = value | 0;
  return v < 0 ? (-v) | 0 : v;
}

export function sign(value: number): number {
  const v = value | 0;
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

/** Move `value` towards `target` by at most `step`. */
export function towards(value: number, target: number, step: number): number {
  const v = value | 0;
  const t = target | 0;
  const s = abs(step);
  if (t > v) return v + s > t ? t : (v + s) | 0;
  if (t < v) return v - s < t ? t : (v - s) | 0;
  return v;
}

/**
 * Chebyshev distance in subcells -- the same shape of "how close" the turn-based
 * builds used for noise, just measured finely.
 */
export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  const dx = abs((ax | 0) - (bx | 0));
  const dy = abs((ay | 0) - (by | 0));
  return dx > dy ? dx : dy;
}

/** Rounded to the nearest cell rather than truncated. */
export function nearestCell(value: number): number {
  return ((value | 0) + (ONE >> 1)) >> SHIFT;
}
