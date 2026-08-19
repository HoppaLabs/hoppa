// Tile indices. Engines emit these; presentation maps them to glyphs or pixels.
// Never a colour, never a character, never a pixel.

export const TILE_VOID = 0;
export const TILE_FLOOR = 1;
export const TILE_WALL = 2;
export const TILE_ACTOR = 3;
// Day 2. A locked exit and an open one are separate tiles because the state is
// something the player must be able to see, not something to infer from a HUD.
export const TILE_TREASURE = 4;
export const TILE_EXIT_LOCKED = 5;
export const TILE_EXIT_OPEN = 6;

// Day 2 tileset. Grows as engines gain tiles; capped at 16 per engine.
export const TILE_COUNT = 7;
