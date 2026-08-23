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
  "#091a3d", "#0c2f73", "#144db5", "#2679ea", "#60b2ff", "#b6dcff",
  // teals and cyans
  "#053030", "#085450", "#0b817a", "#13b4a5", "#3ae3d1", "#80fdef",
  // greens
  "#082b11", "#0b531a", "#117e23", "#1cb032", "#49de40", "#9ef973",
  // yellows and sand
  "#3e2f04", "#6c5207", "#a57c0c", "#dbaa13", "#ffc23d", "#ffe9a3",
  // oranges
  "#3e1d04", "#6e3407", "#a7510c", "#de7713", "#ff9f3d", "#ffd0a3",
  // reds
  "#3d0a10", "#6f0d1a", "#a81225", "#e11d33", "#ff5f4d", "#ffb3a8",
  // purples and magentas
  "#26073d", "#430c72", "#6c14b3", "#a026ea", "#cb66ff", "#e8b6ff",
  // browns, for crates and mud
  "#2b1a0b", "#4e2e0f", "#764516", "#a46724", "#d78d40", "#fdc373",
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
