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
// Day 3.
export const TILE_GUARD = 7;
// A guard you have barged, standing there seeing stars. Its own tile because
// "can I walk past this one right now" has to be answerable at a glance.
export const TILE_GUARD_REELING = 8;
/** A ladder. Side-on engines climb it; from above it is ordinary floor. */
export const TILE_LADDER = 9;
/**
 * A hazard that does not move.
 *
 * ONE tile, drawn differently by each world -- a flame underground, spikes out
 * in the open, where a flame standing on grass would look like a mistake. Hard
 * rule 5: an engine emits this index and knows nothing about which it is, and
 * hard rule 4: the choice is presentation, so it cannot reach stateHash().
 */
export const TILE_FIRE = 10;

// Grows as engines gain tiles; capped at 16 per engine.
export const TILE_COUNT = 11;
