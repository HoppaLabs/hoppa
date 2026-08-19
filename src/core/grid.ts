// The grid. 24x14 is fixed by the encoding budget (spec S10) and is a shipped-link
// compatibility concern -- changing it invalidates every level ever sent.

export const GRID_W = 24;
export const GRID_H = 14;
export const GRID_AREA = 336; // GRID_W * GRID_H, written out so it stays a literal

export function idx(x: number, y: number): number {
  return ((y | 0) * GRID_W + (x | 0)) | 0;
}

export function inBounds(x: number, y: number): boolean {
  return (x | 0) >= 0 && (x | 0) < GRID_W && (y | 0) >= 0 && (y | 0) < GRID_H;
}
