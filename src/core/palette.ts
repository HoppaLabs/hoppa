// The master palette. Spec S4: one palette of 54 colours, defined once, and
// every sprite picks a sub-palette of three of them plus transparent.
//
// "No colour picker. No custom colours. The constraint is the feature."
//
// The COLOURS themselves are cosmetics and must never reach stateHash(). The
// INDICES are not: a creature stores three 6-bit indices, so reordering this
// list would silently repaint every creature ever saved or shared. Append only.

export const PALETTE: readonly string[] = [
  // greys and the near-black void
  "#0d1014", "#1a212b", "#39485c", "#7c8899", "#cdd6e0", "#ffffff",
  // blues
  "#0b1a3a", "#12306b", "#1f4fa8", "#3a7bd5", "#6fb2f0", "#b6dcff",
  // teals and cyans
  "#062f2f", "#0d5350", "#12807a", "#1fb3a6", "#5fe0d2", "#b3f5ee",
  // greens
  "#0a2a12", "#12521f", "#1c7d2c", "#2fae42", "#6fd968", "#bff0a8",
  // yellows and sand
  "#3d2f06", "#6b520c", "#a37c14", "#d8ab1f", "#ffc23d", "#ffe9a3",
  // oranges
  "#3d1d06", "#6b350c", "#a35314", "#d87a1f", "#ff9f3d", "#ffd0a3",
  // reds
  "#3a0d12", "#6b1420", "#a31d2e", "#d82f42", "#ff5f4d", "#ffb3a8",
  // purples and magentas
  "#25093a", "#42126b", "#6b1fa8", "#9a3ad5", "#c46ff0", "#e8b6ff",
  // browns, for crates and mud
  "#2a1a0d", "#4a2f16", "#6f4823", "#9a6b38", "#c49461", "#e6c9a0",
];

export const PALETTE_SIZE = 54;

/** Three palette indices plus transparent. Spec S5: 3 x 6 bits. */
export type SubPalette = readonly [number, number, number];

export function isPaletteIndex(value: number): boolean {
  const v = value | 0;
  return v >= 0 && v < PALETTE_SIZE;
}

export function clampIndex(value: number): number {
  const v = value | 0;
  if (v < 0) return 0;
  if (v >= PALETTE_SIZE) return (PALETTE_SIZE - 1) | 0;
  return v;
}

export function normaliseSubPalette(sub: readonly number[]): SubPalette {
  return [clampIndex(sub[0] ?? 0), clampIndex(sub[1] ?? 0), clampIndex(sub[2] ?? 0)];
}

/** The colour a 2bpp pixel value paints. 0 is transparent and has no colour. */
export function colourFor(sub: SubPalette, value: number): string | null {
  const v = value | 0;
  if (v <= 0 || v > 3) return null;
  return PALETTE[sub[(v - 1) | 0] as number] as string;
}
