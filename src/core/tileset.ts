// The tileset. Spec S4 and S7: real tiles instead of flat coloured squares.
//
// Same rule as a creature sprite, deliberately: three colours from the master
// palette plus transparent, on the SAME GRID. That is what makes a level and
// the creature standing in it look like one world rather than two things on
// the same screen -- and it is the reason spec S4 puts sprites and tiles under
// one constraint in the first place.
//
// The grid used to be 8, against a sprite's 16, and both are drawn one cell
// wide. So every terrain pixel came out twice the size of every creature
// pixel. Reported as "treasure pixels look much bigger than the other
// sprites", which is exactly what it was, and it is the sort of thing that
// makes a screen look assembled rather than drawn. TILE_PX is SPRITE_W now and
// there is a test that will not let it drift again -- see test/artgrid.test.ts,
// which is where the rule is written down.
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
import { SPRITE_W } from "./sprite.ts";

export const TILE_PX = SPRITE_W;

/**
 * A tile as sixteen rows of sixteen characters.
 *
 * "." is transparent -- whatever is behind shows through -- and 1, 2 and 3 are
 * the three colours of whichever sub-palette the world is using.
 */
export type Pattern = readonly string[];

/** Stone, seen from above: blocks with mortar between them, offset by row. */
const STONE: Pattern = [
  "2222222222222222",
  "2333333322333333",
  "2333333322333333",
  "2333333322333333",
  "2222222222222222",
  "3333223333333322",
  "3333223333333322",
  "3333223333333322",
  "2222222222222222",
  "2333333322333333",
  "2333333322333333",
  "2333333322333333",
  "2222222222222222",
  "3333223333333322",
  "3333223333333322",
  "1111111111111111",
];

/** Ground, seen from the side: a bright top edge and darker earth below. */
const EARTH: Pattern = [
  "3333333333333333",
  "3333333333333333",
  "3333333333333333",
  "3333333333333333",
  "2333233332333332",
  "2233222322232222",
  "2222222222222222",
  "2222112222221122",
  "2222112222221122",
  "2222222222222222",
  "1122222211222222",
  "1122222211222222",
  "2222222222222222",
  "2221122222211222",
  "2221122222211222",
  "2222222222222222",
];

/** Open ground from above. Nearly plain: it is the thing you walk on, not the
 *  thing you look at, and a busy floor makes a gem hard to spot. */
const GROUND: Pattern = [
  "1111111111111111",
  "1111111111111111",
  "1111111111111111",
  "1111221111111111",
  "1111221111111111",
  "1111111111111111",
  "1111111111111111",
  "1111111111112211",
  "1111111111112211",
  "1111111111111111",
  "1122111111111111",
  "1122111111111111",
  "1111111111111111",
  "1111111111111111",
  "1111111111111111",
  "1111111111111111",
];

/** Air. Nothing at all, so the sky behind it is uninterrupted. */
const AIR: Pattern = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

/** A ladder: two rails and a rung, tileable end to end. */
const LADDER: Pattern = [
  "..33........33..",
  "..33........33..",
  "..33........33..",
  "..33........33..",
  "..333333333333..",
  "..333333333333..",
  "..33........33..",
  "..33........33..",
  "..33........33..",
  "..33........33..",
  "..333333333333..",
  "..333333333333..",
  "..33........33..",
  "..33........33..",
  "..33........33..",
  "..33........33..",
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
  /**
   * Extra frames for the hazard, if it is the kind of thing that moves.
   *
   * Fire flickers; spikes are metal and do not. A tileset that leaves this out
   * gets one still frame, which is the right answer for a spike and would be
   * the wrong one for a flame.
   */
  readonly fireFrames?: readonly Pattern[];
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
  "................",
  "................",
  ".......33.......",
  "......333.......",
  "......3323......",
  ".....33223......",
  ".....332233.....",
  "....3322233.....",
  "....33221233....",
  "...332211233....",
  "...332111233....",
  "..33321112333...",
  "..33221112233...",
  "..33221112233...",
  ".33322111223333.",
  "3333222222233333",
];

/**
 * The same flame, a moment later, and a moment after that.
 *
 * Fire is the one thing in the room that should never hold still. Three frames
 * rather than a filter, because this is pixel art: a flame flickers by
 * CHANGING SHAPE, and scaling or fading one drawing just makes it throb.
 *
 * Only the tip moves. The base is where the fire is anchored and a base that
 * wandered would read as the whole thing sliding about, so the bottom two rows
 * are identical in all three and the tip does the work.
 *
 * Presentation, and only presentation. Hard rule 4: no engine may ever be told
 * which frame is showing, and a run replays identically in a still window and
 * a moving one.
 */
const FLAME_FRAMES: readonly Pattern[] = [
  FLAME,
  [
    "................",
    "................",
    "......33........",
    "......333.......",
    ".....3323.......",
    ".....33223......",
    "....332233......",
    "....3322233.....",
    "...33221233.....",
    "...33211233.....",
    "..333211123.....",
    "..33211122333...",
    "..33221112233...",
    ".333221112233...",
    ".33322111223333.",
    "3333222222233333",
  ],
  [
    "................",
    "................",
    "........33......",
    ".......333......",
    ".......3233.....",
    "......33223.....",
    "......332233....",
    ".....3322233....",
    ".....33221233...",
    "....332211233...",
    "....3321112333..",
    "...3321112233...",
    "..33221112233...",
    "..332211122333..",
    ".33322111223333.",
    "3333222222233333",
  ],
];

/**
 * The same hazard for the side-on world: spikes coming up out of the ground.
 *
 * A flame standing on a grass ledge reads as a mistake -- fire belongs in a
 * cave. Spikes are what a side-on game puts on a floor, and they sit on the
 * ground rather than floating over it, so the shape says which way is down.
 *
 * ONE spike, not two. A point needs its width to fall away every row it
 * climbs, and a pair splitting the tile between them left four columns each,
 * which cannot do it: rendered at the size it is actually played at, a row of
 * them read as battlements. Reported as "they don't look sharp enough".
 *
 * On the sixteen grid the whole tile buys a taper of two columns a row over
 * fourteen rows, which is a real point rather than an approximation of one.
 * The pale flank down the left is what lights it.
 */
const SPIKES: Pattern = [
  ".......11.......",
  ".......12.......",
  "......1122......",
  "......1222......",
  ".....112222.....",
  ".....122222.....",
  "....11222222....",
  "....12222222....",
  "...1122222222...",
  "...1222222222...",
  "..112222222222..",
  "..122222222222..",
  ".11222222222222.",
  ".12222222222222.",
  "3333333333333333",
  "3333333333333333",
];

export const UNDERGROUND: Tileset = {
  id: 1,
  name: "underground",
  sub: [1, 2, 3], // #1a212b edge, #39485c stone, #7c8899 highlight
  wall: STONE,
  floor: GROUND,
  ladder: LADDER,
  fire: FLAME,
  fireFrames: FLAME_FRAMES,
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

/** Every pattern is 16x16 and uses nothing but ".", "1", "2" and "3". */
export function patternIsSound(pattern: Pattern): boolean {
  if (pattern.length !== TILE_PX) return false;
  for (const row of pattern) {
    if (row.length !== TILE_PX) return false;
    for (const ch of row) if (!".123".includes(ch)) return false;
  }
  return true;
}
