// Tile indices. Engines emit these; presentation maps them to glyphs or pixels.
// Never a colour, never a character, never a pixel.

export const TILE_VOID = 0;
export const TILE_FLOOR = 1;
export const TILE_WALL = 2;
export const TILE_ACTOR = 3;

// Day 1 tileset. Grows as engines gain tiles; capped at 16 per engine.
export const TILE_COUNT = 4;
