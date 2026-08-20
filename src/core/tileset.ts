// The tileset. Spec S4 and S7: real tiles instead of flat coloured squares.
//
// Same rule as a creature sprite, deliberately: 8x8, two bits a pixel, three
// colours from the master palette plus transparent. That is what makes a level
// and the creature standing in it look like one world rather than two things
// on the same screen -- and it is the reason spec S4 puts sprites and tiles
// under one constraint in the first place.
//
// Purely presentation. Hard rule 4: none of this reaches stateHash(), and hard
// rule 5: engines emit tile indices and never pixels, so a tileset can change
// without touching a single shipped link. Two levels drawn under different
// tilesets play identically.
//
// Only the TERRAIN lives here -- wall, floor, ladder. The treasure spins, the
// enemies waddle and watch you, the door has a padlock and the player is a
// drawing somebody made: those are animated or personal, and flattening them
// into static tiles would be a step backwards.

import { PALETTE, type SubPalette } from "./palette.ts";

export const TILE_PX = 8;

/**
 * A tile as eight rows of eight characters.
 *
 * "." is transparent -- whatever is behind shows through -- and 1, 2 and 3 are
 * the three colours of whichever sub-palette the world is using.
 */
export type Pattern = readonly string[];

/** Stone, seen from above: blocks with mortar between them, offset by row. */
const STONE: Pattern = [
  "22222222",
  "23333322",
  "23333322",
  "22222222",
  "33222333",
  "33222333",
  "22222222",
  "11111111",
];

/** Ground, seen from the side: a bright top edge and darker earth below. */
const EARTH: Pattern = [
  "33333333",
  "33333333",
  "22322232",
  "22222222",
  "22221222",
  "12222221",
  "22212222",
  "22222222",
];

/** Open ground from above. Nearly plain: it is the thing you walk on, not the
 *  thing you look at, and a busy floor makes a gem hard to spot. */
const GROUND: Pattern = [
  "11111111",
  "11111111",
  "11121111",
  "11111111",
  "11111111",
  "11111111",
  "11111211",
  "11111111",
];

/** Air. Nothing at all, so the sky behind it is uninterrupted. */
const AIR: Pattern = [
  "........",
  "........",
  "........",
  "........",
  "........",
  "........",
  "........",
  "........",
];

/** A ladder: two rails and a rung, tileable end to end. */
const LADDER: Pattern = [
  ".3....3.",
  ".3....3.",
  ".333333.",
  ".3....3.",
  ".3....3.",
  ".333333.",
  ".3....3.",
  ".3....3.",
];

export interface Tileset {
  readonly id: number;
  readonly name: string;
  /** Three palette indices: dark, mid, light. */
  readonly sub: SubPalette;
  readonly wall: Pattern;
  readonly floor: Pattern;
  readonly ladder: Pattern;
  /** The hazard that does not move: a flame below ground, spikes above it. */
  readonly fire: Pattern;
  /**
   * Three colours for the hazard alone.
   *
   * It is a different MATERIAL from the terrain, and it borrowed the terrain's
   * palette at first: underground that made the flame stone grey, so it read
   * as a rock with a pointed top rather than as something that hurts. Nothing
   * else on screen needs its own palette, because nothing else is trying to
   * look hot.
   */
  readonly fireSub: SubPalette;
  /** Painted behind everything, for the parts a pattern leaves transparent. */
  readonly ground: string;
}

/**
 * Underground, for the games seen from above: stone walls, dark floor.
 *
 * The sub-palette indices are into PALETTE and are append-only there, so these
 * three numbers keep meaning the same colours forever.
 */
/**
 * Fire, for the world seen from above: a flame with a pale heart.
 *
 * It has to read as DANGER at fourteen pixels, and it has to be told apart
 * from a gem at a glance -- both are small bright things standing on dark
 * floor. So it fills its tile from the bottom, where a gem floats in the
 * middle, and it is drawn in the palette's brightest colour.
 */
const FLAME: Pattern = [
  "....3...",
  "...33...",
  "..3323..",
  ".332233.",
  ".322123.",
  "3221123.",
  "3211123.",
  "33222233",
];

/**
 * The same hazard for the side-on world: spikes coming up out of the ground.
 *
 * A flame standing on a grass ledge reads as a mistake -- fire belongs in a
 * cave. Spikes are what a side-on game puts on a floor, and they sit on the
 * ground rather than floating over it, so the shape says which way is down.
 */
const SPIKES: Pattern = [
  "..1..1..",
  "..2..2..",
  ".222.222",
  ".222.222",
  "22222222",
  "22222222",
  "33333333",
  "33333333",
];

export const UNDERGROUND: Tileset = {
  id: 1,
  name: "underground",
  sub: [1, 2, 3], // #1a212b edge, #39485c stone, #7c8899 highlight
  wall: STONE,
  floor: GROUND,
  ladder: LADDER,
  fire: FLAME,
  // Pale core, orange body, red edge: hot, and nothing else down here is warm.
  fireSub: [29, 34, 40], // #ffe9a3, #ff9f3d, #ff5f4d
  ground: PALETTE[0] as string, // #0d1014
};

/** Outside, for the side-on game: grass-topped earth under an open sky. */
export const OUTSIDE: Tileset = {
  id: 2,
  name: "outside",
  sub: [19, 20, 21], // #12521f earth, #1c7d2c grass, #2fae42 lit grass
  wall: EARTH,
  floor: AIR,
  ladder: LADDER,
  // Spikes, not a flame: see SPIKES.
  fire: SPIKES,
  // Dark metal with a bright tip, which is the way round that reads: a pale
  // spike is lost against the sky above it, and a dark one stands out against
  // both the sky and the green it is standing on.
  fireSub: [4, 2, 1], // #cdd6e0 tips, #39485c body, #1a212b base
  ground: "#8fc4e8",
};

export const TILESETS: readonly Tileset[] = [UNDERGROUND, OUTSIDE];

/**
 * The tileset for a world.
 *
 * Chosen by which GAME this is, not by the level's `tiles=` field. That field
 * exists in the format and on the wire, and stays reserved: a level saying
 * tiles=1 today gets whatever its engine's world looks like, which is the
 * behaviour that lets the art improve without reissuing a single link.
 */
export function tilesetFor(sideOn: boolean): Tileset {
  return sideOn ? OUTSIDE : UNDERGROUND;
}

/** The colour of one pattern character, or null where it is transparent. */
export function inkOf(set: Tileset, ch: string, sub: SubPalette = set.sub): string | null {
  if (ch === "1") return PALETTE[sub[0]] as string;
  if (ch === "2") return PALETTE[sub[1]] as string;
  if (ch === "3") return PALETTE[sub[2]] as string;
  return null;
}

/** Every pattern is 8x8 and uses nothing but ".", "1", "2" and "3". */
export function patternIsSound(pattern: Pattern): boolean {
  if (pattern.length !== TILE_PX) return false;
  for (const row of pattern) {
    if (row.length !== TILE_PX) return false;
    for (const ch of row) if (!".123".includes(ch)) return false;
  }
  return true;
}
