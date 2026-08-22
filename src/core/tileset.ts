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

import { GRID_H, GRID_W } from "./grid.ts";
import { TILE_FIRE, TILE_FROZEN } from "./tiles.ts";
import { PALETTE } from "./palette.ts";
import { SPRITE_W } from "./sprite.ts";

export const TILE_PX = SPRITE_W;

/**
 * A tile as sixteen rows of sixteen characters.
 *
 * "." is transparent -- whatever is behind shows through -- and 1 upwards are
 * steps of whichever RAMP the pattern is drawn against, darkest first.
 *
 * It used to be 1, 2 and 3 and nothing else, because a tile borrowed the
 * machinery a CREATURE uses and a creature is three colours by spec S5: it
 * travels in a link and gets two bits a pixel. A tile travels nowhere. That
 * ceiling was inherited, not chosen, and it is the reason the terrain read as
 * flat next to the era it is imitating -- the SNES gave a sprite fifteen
 * colours and a background layer more, and what it spent them on was
 * SHADING: a lit top edge, a mid face, a shadowed underside, in one material.
 *
 * A creature is still three. It still travels in a link.
 */
export type Pattern = readonly string[];

/**
 * The colours a pattern is drawn in: palette indices, darkest first.
 *
 * Nine at most, because a pattern row is characters and "1".."9" is what
 * there is. Nothing has needed nine yet.
 */
export type Ramp = readonly number[];

export const RAMP_MAX = 9;

/** Stone, seen from above: blocks with mortar between them, offset by row. */
const STONE: Pattern = [
  "2111111121111111",
  "2444444424444444",
  "2333333323333333",
  "2322333323333233",
  "1111111111111111",
  "4444424444444424",
  "3333323333333323",
  "3323323332333323",
  "2111111121111111",
  "2444444424444444",
  "2333333323333333",
  "2333233323322333",
  "1111111111111111",
  "4444424444444424",
  "3333323333333323",
  "1111111111111111",
];

/** Ground, seen from the side: a bright top edge and darker earth below. */
const EARTH: Pattern = [
  "7777677777777677",
  "7767777777677777",
  "7777778777777778",
  "6777777776777777",
  "7778777777787777",
  "7777776777777767",
  "7677777777677777",
  "7777788777778877",
  "7777777777777777",
  "6777777767777777",
  "7777677777777677",
  "7778777777777877",
  "7677777777677777",
  "7777777877777777",
  "7777677777777677",
  "7777777777777777",
];

/**
 * The same ground where the sky is above it: grass, and the soil under it.
 *
 * A tile cannot know what it is next to, which is why this is two patterns and
 * not one. Drawing the grass on EVERY earth tile put a lawn through the middle
 * of every platform four deep -- reported as "grass on top of grass" and it was
 * exactly that. The renderer picks: capped where the cell above is open, buried
 * where it is not.
 */
const EARTH_TOP: Pattern = [
  "5555555555555555",
  "4544455444554455",
  "4444444444444444",
  "3343333433343333",
  "2222222222222222",
  "1111111111111111",
  "7777677777777677",
  "7767777777677777",
  "7777778777777778",
  "6777777776777777",
  "7778777777787777",
  "7777776777777767",
  "7677777777677777",
  "7777788777778877",
  "7777777777777777",
  "6666666666666666",
];

/** Open ground from above. Nearly plain: it is the thing you walk on, not the
 *  thing you look at, and a busy floor makes a gem hard to spot. */
const GROUND: Pattern = [
  "1111111111111111",
  "1222222212222222",
  "1222222212222222",
  "1222232212222222",
  "1222222212223222",
  "1222222212222222",
  "1222222212222222",
  "1111111111111111",
  "1222222212222222",
  "1222222212222222",
  "1222222212222222",
  "1223222212222222",
  "1222222212222322",
  "1222222212222222",
  "1222222212222222",
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

/** A ladder: two round wooden rails and a rung, tileable end to end. */
const LADDER: Pattern = [
  "..1432....1432..",
  "..1432....1432..",
  "..1432....1432..",
  "..1432....1432..",
  "..144444444441..",
  "..122222222221..",
  "..1432....1432..",
  "..1432....1432..",
  "..1432....1432..",
  "..1432....1432..",
  "..144444444441..",
  "..122222222221..",
  "..1432....1432..",
  "..1432....1432..",
  "..1432....1432..",
  "..1432....1432..",
];

const STONE_TOP: Pattern = [
  "4444444444444444",
  "4444444444444444",
  "2111111121111111",
  "2444444424444444",
  "2333333323333333",
  "2322333323333233",
  "1111111111111111",
  "4444424444444424",
  "3333323333333323",
  "3323323332333323",
  "2111111121111111",
  "2444444424444444",
  "2333333323333333",
  "2333233323322333",
  "1111111111111111",
  "1111111111111111",
];

/** What a world's still hazard actually is. Presentation only. */
export type Hazard = "fire" | "spikes" | "urchins" | "water";

export interface Tileset {
  readonly id: number;
  readonly name: string;
  /** The terrain's ramp: palette indices, darkest first. */
  readonly sub: Ramp;
  readonly wall: Pattern;
  /**
   * The wall where the cell above it is open, if that is a different drawing.
   *
   * Grass belongs on the TOP of the ground, not through the middle of it. The
   * renderer looks up; nothing else has to know.
   */
  readonly wallTop?: Pattern;
  readonly floor: Pattern;
  readonly ladder: Pattern;
  /**
   * A ramp for the ladder alone, for the same reason the hazard has one: it is
   * a different MATERIAL from the ground it is bolted to. Borrowing the
   * terrain's ramp made it stone underground and GRASS GREEN outside, which is
   * not a thing a ladder is made of.
   */
  readonly ladderSub: Ramp;
  /**
   * WHAT the still hazard is, in words.
   *
   * The engines call it fire and always will -- TILE_FIRE is the index, it is
   * in every shipped log, and no engine may be told what a world looks like
   * (hard rule 4). But a world draws it as whatever that world has: a flame in
   * a cave and a street, a rank of metal spikes in the side-on game, a bank of
   * urchins on a reef, a pond on a lawn and the sea on a beach. Two of the six
   * are actually fire.
   *
   * Written down because something outside the drawing needs to know. A bucket
   * of water is a sensible answer to a flame and a silly one to a pond, and the
   * play page has no other way to tell them apart -- see src/web/play/water.ts.
   *
   * Required, not optional, and that is the point: a new world cannot be added
   * without somebody saying what its hazard is. The bug this replaces was
   * exactly a condition that named one engine and silently excluded the rest.
   */
  readonly hazard: Hazard;
  /** The hazard that does not move: a flame below ground, spikes above it. */
  readonly fire: Pattern;
  /**
   * ...and, where the hazard is WATER, the drawing for a given set of open
   * sides, so joined cells read as one pool.
   *
   * Only the garden sets it. A flame and a bank of urchins are things you
   * count; a pond is a thing you see the shape of, and six cells of it drawn
   * as six rimmed puddles is six puddles. See pondFor().
   */
  readonly fireFor?: (open: number) => Pattern;
  /**
   * ...and the same for the FLOOR, where it is a road and has to run somewhere.
   *
   * Only the city sets it. A cave floor is the same floor everywhere; a street
   * has a direction, and a tile cannot know its own direction without being
   * told what is beside it. The key is the four sides plus a car bit -- see
   * roadFor().
   */
  readonly floorFor?: (key: number) => Pattern;
  /**
   * ...and the same for a WALL, where one building is not every building.
   *
   * Only the city sets it. A cave wall is a cave wall however many there are;
   * a city is towers, and a row of identical towers is wallpaper. The key is a
   * KIND rather than a set of sides -- there is nothing to join up, only
   * something to vary -- and the renderer picks it from the cell's own
   * coordinates, so it costs the wire format nothing. See towerFor().
   */
  readonly wallKinds?: (kind: number) => Pattern;
  /**
   * A ramp for the hazard alone.
   *
   * It is a different MATERIAL from the terrain, and it borrowed the terrain's
   * palette at first: underground that made the flame stone grey, so it read
   * as a rock with a pointed top rather than as something that hurts. Nothing
   * else on screen needs its own palette, because nothing else is trying to
   * look hot.
   */
  readonly fireSub: Ramp;
  /**
   * Extra frames for the hazard, if it is the kind of thing that moves.
   *
   * Fire flickers; spikes are metal and do not. A tileset that leaves this out
   * gets one still frame, which is the right answer for a spike and would be
   * the wrong one for a flame.
   */
  readonly fireFrames?: readonly Pattern[];
  /**
   * A lone wall cell, if this world draws one differently.
   *
   * Absent in a world where a wall is a wall however many of them there are;
   * present in the garden, where one on its own is a tree.
   */
  readonly tree?: Pattern;
  /**
   * Water that flows, if this world has any. Drawn pointing RIGHT; the renderer
   * turns it for the other three. Absent in a world with no currents in it.
   */
  readonly flow?: Pattern;
  /** A ramp for the current alone: it is light on water, not stone. */
  readonly flowSub?: Ramp;
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
  "......222.......",
  "......222.......",
  "......222.......",
  "......333.......",
  "......333.......",
  ".....34443......",
  ".....44444......",
  "....3445443.....",
  "....4455544.....",
  "...345565543....",
  "..23455655432...",
  "..23455655432...",
  "1223344555443221",
  "1122333444333221",
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
    ".....12.........",
    ".....22.........",
    ".....22.........",
    ".....333........",
    ".....333........",
    "....33444.......",
    "....34444.......",
    "....445544......",
    "...3455554......",
    "...34556544.....",
    "..3345665443....",
    ".233455654432...",
    "1223344555443221",
    "1122333444333221",
  ],
  [
    "................",
    "................",
    "........21......",
    "........22......",
    "........22......",
    ".......333......",
    ".......333......",
    "......44433.....",
    "......44443.....",
    ".....445544.....",
    ".....4555543....",
    "....44565543....",
    "...3445665433...",
    "..234456554332..",
    "1223344555443221",
    "1122333444333221",
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
/**
 * Water that is going somewhere: a double chevron, pointing RIGHT.
 *
 * Drawn once and turned, rather than drawn four times. Two chevrons rather than
 * one arrow, because an arrow reads as a sign somebody put there and a repeated
 * chevron reads as movement -- which is what it is.
 *
 * Brightest at the tips and fading back along each arm, so the eye is pulled
 * the way the water goes even at the size a phone draws a cell.
 */
const FLOW: Pattern = [
  "................",
  "................",
  "................",
  "................",
  "...22....22.....",
  "....22....22....",
  ".....33....33...",
  "......44....44..",
  ".......44....44.",
  "......44....44..",
  ".....33....33...",
  "....22....22....",
  "...22....22.....",
  "................",
  "................",
  "................",
];

/** The same drawing, mirrored left-to-right. */
export function flipPattern(pattern: Pattern): Pattern {
  return pattern.map((row) => [...row].reverse().join("")) as unknown as Pattern;
}

/**
 * The same drawing, turned a quarter turn clockwise.
 *
 * Whole cells only, which is all a square grid can do -- and all the era could
 * do either. Turning the art beats drawing it four times: four drawings drift.
 */
export function turnPattern(pattern: Pattern): Pattern {
  const size = pattern.length;
  const out: string[] = [];
  for (let y = 0; y < size; y = (y + 1) | 0) {
    let row = "";
    for (let x = 0; x < size; x = (x + 1) | 0) {
      row += (pattern[size - 1 - x] as string)[y] as string;
    }
    out.push(row);
  }
  return out as unknown as Pattern;
}

/**
 * Still water: a pond.
 *
 * The garden borrowed the reef's chevrons for this at first and it was wrong in
 * a way that only showed on screen -- a chevron is an ARROW, so eight cells of
 * pond read as eight cells of current, and the one thing a pond must say is
 * that it is not going anywhere.
 *
 * It also has to MERGE. The first version rounded every corner, so a pond made
 * of five cells came out as five separate lozenges -- little pills of water
 * lying next to each other. Water does not do that. So it fills the cell edge
 * to edge, with the lit rim only along the top where the sky would catch it,
 * and neighbouring cells run together into one body.
 *
 * Flat and quiet, which is the whole brief.
 */
/**
 * A pond, with a rim only where the water actually ends.
 *
 * POND below draws its own rim on all four sides, so two cells of water side
 * by side showed two rims and a seam down the middle -- reported as "the ponds
 * sprites should merge when joined to create a bigger pool rather than a
 * several little pools". Six cells of pond read as six puddles.
 *
 * `open` is a bitmask of the sides with something OTHER than water beyond
 * them, in the order north, east, south, west. The rim goes on those sides and
 * the water runs to the edge on the rest, so any shape of pool comes out as
 * one body with one shoreline.
 *
 * The same trick a tree already uses -- see Tileset.tree, where a wall with
 * nothing beside it is drawn as a canopy. Read off the neighbours rather than
 * out of the level, so it costs the wire format nothing.
 */
export const POND_N = 1;
export const POND_E = 2;
export const POND_S = 4;
export const POND_W = 8;

/**
 * Which sides of this cell have something other than water beyond them.
 *
 * North, east, south, west -- and the edge of the grid counts as open, because
 * a pond against the wall of the world still has a bank there.
 *
 * Lives here rather than in the renderer so it can be read without a browser.
 * The decision is "where does the shoreline go", and a decision you cannot run
 * a test against is a decision nobody is checking.
 */
export function sidesOf(tiles: Uint8Array, x: number, y: number, tile: number, also = tile): number {
  const same = (cx: number, cy: number): boolean => {
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
    const at = tiles[cy * GRID_W + cx] as number;
    return at === tile || at === also;
  };
  return (same(x, y - 1) ? 0 : POND_N)
    | (same(x + 1, y) ? 0 : POND_E)
    | (same(x, y + 1) ? 0 : POND_S)
    | (same(x - 1, y) ? 0 : POND_W);
}

/**
 * ...for water, which is what asked for it first.
 *
 * Frozen water counts as water. A wand freezes a pond one wave at a time and
 * the ice wears off, so a pool is very often part ice and part water -- and if
 * the two did not recognise each other, a shoreline would appear down the
 * middle of a pond that has not moved. What joins up is the BODY of water,
 * whatever state each cell of it is in.
 *
 * Through sidesOf rather than beside it. It was written out again here, and
 * check:mutants found that within the hour: breaking sidesOf's neighbour walk
 * stopped failing anything, because the pond test had quietly moved onto the
 * copy and the roads were the only thing left using the original.
 */
export function openSides(tiles: Uint8Array, x: number, y: number): number {
  return sidesOf(tiles, x, y, TILE_FIRE, TILE_FROZEN);
}

/**
 * The ramp ice is drawn in, whatever it froze over.
 *
 * One ramp for every world, unlike everything else in this file, and that is
 * deliberate: a pond, the sea and a bank of urchins look nothing alike, but
 * frozen they are all ice, and a child has to read "I can walk on that" at a
 * glance in a world they may never have seen before. The SHAPE still comes
 * from the world -- ice takes the shape of what it froze -- and only the
 * colours are shared.
 *
 * The pond ramp's own order, lightened all the way through: 1 is the body of
 * the pool (which is nearly all of it -- the middle of a pool is a flat slab
 * and the body colour is the whole read), 3 is the shoreline, 5 the sparkle.
 * Rendered against grass and against the reef's navy before it went in: a
 * deep-blue pool and a pale one are the difference, and it has to be visible
 * at a glance from across the room.
 */
export const ICE_SUB: Ramp = [11, 10, 9, 4, 5];

const POND_CACHE = new Map<number, Pattern>();

export function pondFor(open: number): Pattern {
  const had = POND_CACHE.get(open);
  if (had !== undefined) return had;

  const W = 16;
  const rows: string[][] = [];
  for (let y = 0; y < W; y++) rows.push(new Array<string>(W).fill("1"));

  // The far bank, where the water stops. Two rows of the lightest ink at the
  // top -- the light on the far side of a pool -- and one row of the darker
  // rim everywhere else.
  const shore = (x: number, y: number, ink: string): void => {
    (rows[y] as string[])[x] = ink;
  };
  for (let x = 0; x < W; x++) {
    if ((open & POND_N) !== 0) {
      shore(x, 0, "4"); shore(x, 1, "4"); shore(x, 2, "3");
    }
    if ((open & POND_S) !== 0) { shore(x, W - 2, "3"); shore(x, W - 1, "3"); }
  }
  for (let y = 0; y < W; y++) {
    if ((open & POND_W) !== 0) shore(0, y, "3");
    if ((open & POND_E) !== 0) shore(W - 1, y, "3");
  }
  // Where two open sides meet, round the corner off by a pixel so a lone
  // puddle keeps the soft shape POND had.
  const corner = (a: number, b: number, x: number, y: number): void => {
    if ((open & a) !== 0 && (open & b) !== 0) shore(x, y, "3");
  };
  corner(POND_N, POND_W, 1, 3); corner(POND_N, POND_E, W - 2, 3);
  corner(POND_S, POND_W, 1, W - 3); corner(POND_S, POND_E, W - 2, W - 3);

  // One glint, and only on water with open air to the north -- the top of a
  // pool, where the light would be. Every cell having one made a big pond look
  // spotty rather than wet.
  if ((open & POND_N) !== 0) {
    shore(4, 6, "5"); shore(5, 6, "5"); shore(3, 7, "5"); shore(4, 7, "5");
  }

  const made = rows.map((row) => row.join("")) as unknown as Pattern;
  POND_CACHE.set(open, made);
  return made;
}

const POND: Pattern = [
  "4444444444444444",
  "4444444444444444",
  "3333333333333333",
  "3311111111111133",
  "3111111111111113",
  "3111111111111113",
  "3111551111111113",
  "3115511111111113",
  "3111111111111113",
  "3111111111111113",
  "3111111111111113",
  "3111111111111113",
  "3111111111111113",
  "3311111111111133",
  "3333333333333333",
  "3333333333333333",
];

/**
 * Planks: a bridge over a pond.
 *
 * Boards across, with a gap of water showing between each pair, because a solid
 * slab reads as a floor and the whole point is that there is water under it.
 * Rails down the long edges so it reads as a thing you walk ALONG.
 */
const BRIDGE: Pattern = [
  "2222222222222222",
  "3333333333333333",
  "................",
  "4444444444444444",
  "4444444444444444",
  "................",
  "4444444444444444",
  "4444444444444444",
  "................",
  "4444444444444444",
  "4444444444444444",
  "................",
  "4444444444444444",
  "4444444444444444",
  "3333333333333333",
  "2222222222222222",
];

/**
 * A bush, seen from above.
 *
 * The garden used EARTH for its hedges, which is the SIDE-ON ground drawing --
 * a bank of soil with grass along its top edge. Ninety cells of it, and from
 * above every one read as terrain rather than as planting, which is most of why
 * the first garden looked like a field with things dropped on it.
 *
 * It has to TILE, because a hedge is many cells of it: so it fills the cell
 * edge to edge and the TEXTURE does the work, not an outline. Leaf clumps, each
 * lit on its top-left and shadowed on its bottom-right, which is the whole of
 * how the era drew a mass of leaves.
 */
const BUSH: Pattern = [
  "1112232223422322",
  "1343321112333211",
  "1333331233333332",
  "3333333223333322",
  "2333332323333321",
  "3333334333232211",
  "3323233333121133",
  "3332333333323433",
  "3423333333213323",
  "3223333333233322",
  "2333332323123323",
  "3333321343333332",
  "3333331333332332",
  "2232333333333331",
  "2123333323233333",
  "1112333233323332",
];

/**
 * Grass, seen from above.
 *
 * The garden's floor was AIR -- a transparent tile showing one flat colour --
 * which is the last reason a room that is a third full read as empty: there was
 * literally nothing between the things in it.
 *
 * Tufts, scattered, wrapping so the tile repeats with no seam. Deliberately
 * SPARSE and deliberately close in tone to the ground behind it: this is drawn
 * under everything in the room, and anything busier turns the whole garden into
 * noise. Eight tufts a cell is the most it will take.
 */
const GRASS: Pattern = [
  ".........66.....",
  "........555.....",
  "..66............",
  ".555............",
  "................",
  ".......66....66.",
  "......555...555.",
  "................",
  ".....66.........",
  "....555.........",
  "................",
  "...........66...",
  ".66.......555...",
  "555...........66",
  ".............555",
  "................",
]

/**
 * A tree, seen from above: one round canopy.
 *
 * Unlike the bush it must NOT tile. A bush is many cells of texture; a tree is
 * ONE cell and its silhouette is the whole point, so it has an outline and the
 * bush does not.
 *
 * Which cells are trees costs nothing to say, because the level already says
 * it: a wall cell with no wall beside it is a tree, and a run of them is a
 * hedge. That is the spec's own rule for moving parts -- behaviour derived
 * from geometry, zero bytes in the encoding -- applied to a drawing, and it
 * matches how a child paints anyway. Tap once for a tree, drag for a hedge.
 */
const TREE: Pattern = [
  ".......111......",
  "...111113111....",
  ".1113114333111..",
  ".1443333333331..",
  "114433333333311.",
  "133333333333331.",
  "1233333333333311",
  "1243333333334331",
  "1333333334433333",
  "1233333334433332",
  "1233333333333332",
  "1123333333333321",
  ".123333323333321",
  ".112232212232211",
  "..1112111112111.",
  "....111...111...",
];

const SPIKES: Pattern = [
  ".......56.......",
  ".......54.......",
  "......4543......",
  "......4443......",
  ".....45443......",
  ".....44443......",
  "....4544432.....",
  "....4444332.....",
  "...45444332.....",
  "...444433322....",
  "..4544433322....",
  "..4444333222....",
  ".454443332222...",
  ".444433322222...",
  "2222222222222222",
  "1111111111111111",
];

export const UNDERGROUND: Tileset = {
  id: 1,
  name: "underground",
  hazard: "fire",
  // Darkest first: pit, mortar, shadow, face, lit edge.
  sub: [0, 1, 2, 3, 4],
  wall: STONE,
  wallTop: STONE_TOP,
  floor: GROUND,
  ladder: LADDER,
  // Wood, everywhere: edge, lit, face, shadow.
  ladderSub: [1, 52, 51, 49],
  fire: FLAME,
  fireFrames: FLAME_FRAMES,
  // Pale core, orange body, red edge: hot, and nothing else down here is warm.
  // Dark red edge up to a white heart.
  fireSub: [39, 40, 34, 28, 29, 5],
  ground: PALETTE[0] as string, // #0d1014
};

/** Outside, for the side-on game: grass-topped earth under an open sky. */
export const OUTSIDE: Tileset = {
  id: 2,
  name: "outside",
  hazard: "spikes",
  // Four steps of grass, then three of the soil under it.
  sub: [18, 19, 20, 21, 22, 49, 50, 51],
  wall: EARTH,
  wallTop: EARTH_TOP,
  floor: AIR,
  ladder: LADDER,
  ladderSub: [1, 52, 51, 49],
  // Spikes, not a flame: see SPIKES.
  fire: SPIKES,
  // Dark metal with a bright tip, which is the way round that reads: a pale
  // spike is lost against the sky above it, and a dark one stands out against
  // both the sky and the green it is standing on.
  // Metal, lit from the left, on a shadow it casts into its own tile.
  fireSub: [0, 1, 2, 3, 4, 5],
  ground: "#8fc4e8",
};

/**
 * The reef. Underwater, seen from the side.
 *
 * Drawn out of the same patterns as the ground above it, on a different ramp,
 * which is the whole point of a ramp: EARTH lit in teal is a reef, and nobody
 * had to draw a second set of rocks.
 *
 * The water itself is the `ground` colour behind everything, deep enough that
 * the pale gems and a child's own creature stand out against it. It is the one
 * world where the empty space is a THING rather than the absence of one, which
 * is also why it is the only one whose frame is open at the top: that row is
 * the surface, and the surface is where the air is.
 */
export const REEF: Tileset = {
  id: 3,
  name: "reef",
  hazard: "urchins",
  // Three steps of algae over four of the rock it is growing on: teal down
  // into navy. Sand would have been the obvious floor and it is wrong -- pale
  // sand against pale water leaves nothing to read the shape against.
  sub: [15, 14, 13, 7, 6, 1, 2, 3],
  wall: EARTH,
  wallTop: EARTH_TOP,
  floor: AIR,
  ladder: LADDER,
  ladderSub: [1, 52, 51, 49],
  // Sea urchins. A flame underwater would be a joke and a metal spike would be
  // litter; an urchin is the thing that is actually down there and hurts.
  fire: SPIKES,
  // Near-black up to a violet tip: the one thing on screen that is not a shade
  // of blue, because it is the one thing that is trying to be noticed.
  fireSub: [0, 42, 43, 44, 45, 46],
  flow: FLOW,
  // Water lit from within: deep blue up to near-white. It has to read against
  // the deep it is drawn on without becoming a solid object, which is why the
  // darkest step is barely lighter than the water itself.
  flowSub: [7, 8, 9, 10, 11],
  ground: "#12306b",
};

/**
 * The garden. Somewhere to be, seen from above.
 *
 * Every drawing in here is one the game already had, on different ramps -- and
 * that is the whole argument for ramps. A hedge is EARTH in green and a pond is
 * the hazard in blue. Nothing new was drawn and nothing new was budgeted,
 * which is why a fourth world took an afternoon instead of a week.
 *
 * The flower is the one exception, and it earned it: a recoloured gem is still
 * a cut crystal, and it sat under a button reading "flowers". See
 * FLOWER_FRAMES in the renderer.
 *
 * The entities keep their behaviour and change what they ARE, the same trick
 * the hazard has played since roam/6:
 *
 *   treasure -> a flower you pick        guard -> a bunny you play with
 *   hazard   -> a pond you walk round    ladder -> a garden path
 */
export const GARDEN: Tileset = {
  id: 4,
  name: "garden",
  hazard: "water",
  // Four steps of leaf: the dark between the clumps, the mass, the lit dome,
  // and one specular where the sun catches the top of a big one.
  //
  // Warmer than the first pass, which was leaf-green over cold grey-green and
  // came out looking like a lawn in February. Asked for "warmer colours"; the
  // fix is the ramp, not a new drawing.
  //
  // 1-4 are the bush: the dark between its leaves, the mass, the lit dome and
  // one specular. 5-6 are the grass tufts, and they sit ABOVE the lawn colour
  // rather than below it -- with both drawn in the same mid green the hedges
  // stopped reading as something you cannot walk through, which on a screen a
  // child is steering across is not a cosmetic problem.
  sub: [18, 19, 20, 29, 21, 23, 51, 50],
  wall: BUSH,
  // One on its own is a tree. See TREE.
  tree: TREE,
  // No separate cap: a bush seen from above has no top edge, and giving it one
  // is what made the first hedges read as a bank of soil.
  floor: GRASS,
  // A bridge, not a ladder. In a garden the tile you walk ALONG is a plank
  // crossing over water, which is the one thing a top-down world never had a
  // use for -- see calm/1 and docs/adr/0040.
  ladder: BRIDGE,
  // Warm wood, lit from above, on the water it is crossing.
  ladderSub: [8, 49, 51, 52, 53],
  // A pond. The hazard's own shape is a pointed thing, which is wrong for
  // water, and the reef's chevrons were worse -- a chevron is an arrow, and a
  // pond is the one thing that is definitely not going anywhere.
  fire: POND,
  fireFor: pondFor,
  // Deep in the middle, lighter at the rim, one glint. Nothing about it says
  // "this will hurt", because it will not: it is a shape you walk round.
  fireSub: [8, 9, 10, 11, 5],
  // Sunlit grass rather than pale mint.
  ground: "#6fd968",
};

/**
 * The city, seen from above. Asked for as a level where the player is a jaeger
 * and the thing coming down the street is a kaiju.
 *
 * The second skin, and the same trick as the beach: this is the ADVENTURE
 * game, drawn somewhere else. Rescuing people and getting them to an evac zone
 * is what "pick the treasure up and the door opens" already is -- so the rules
 * needed nothing, and the work is all in what a child sees.
 */
const STREET: Pattern = [
  "1222222222222222",
  "2222222222232222",
  "2222322221222222",
  "2212222223333322",
  "2222222223333322",
  "2222223222333222",
  "2222122222222222",
  "2222222222222223",
  "2222222232222122",
  "2322221222222222",
  "2222222222222222",
  "2213122222322221",
  "2211122212222222",
  "2122222222222222",
  "2222222222223222",
  "2222232222122222",
];

/**
 * The beach, seen from above. Asked for as "we have a request for beach
 * levels" -- and a beach is not a new GAME, it is the adventure game drawn
 * somewhere else.
 *
 * Which is why it is the first tileset chosen by the level's `tiles=` field
 * rather than by its engine. See tilesetFor() for what that field can and
 * cannot mean without breaking every link ever sent.
 */
const SAND: Pattern = [
  "4444444444444444",
  "4455555444444444",
  "4533333544444444",
  "4344444344444344",
  "4444444444444444",
  "4444434444555544",
  "4444444445333354",
  "4446644443444434",
  "4445444444443444",
  "4344555555444444",
  "4445333333544444",
  "4443444444344444",
  "4444444434444444",
  "4444444444445554",
  "4444444444453335",
  "4444444444434443",
];

const DUNE: Pattern = [
  "3222222232221222",
  "2222122223332333",
  "2114411122223222",
  "1221122212222222",
  "2333233321112111",
  "3222222232221222",
  "2222122223442333",
  "2111211122113222",
  "1222322212222222",
  "2333233321112111",
  "3222224432221222",
  "2222121123332333",
  "2111211122223222",
  "1222322212222442",
  "2333233321112111",
  "3222222232221222",
];

const PALM: Pattern = [
  "........77......",
  "...7...787......",
  "...77..7887.....",
  "..7997789777777.",
  "..79897897887...",
  "...7897899997...",
  "77778882297777..",
  "788878811888887.",
  ".788888118999887",
  "..79999229997877",
  "...77799899897..",
  "...78897897897..",
  ".77999778978887.",
  "..7977.787.777..",
  "...7...77...7...",
  "......7.........",
];

const BOARDWALK: Pattern = [
  "2222222222222222",
  "1444444444444441",
  "1333333333333331",
  "1333333333333331",
  "1222222222222221",
  "1333333333333331",
  "1444444444444441",
  "1333333333333331",
  "1333333333333331",
  "1222222222222221",
  "1333333333333331",
  "1444444444444441",
  "1333333333333331",
  "1333333333333331",
  "1222222222222221",
  "2222222222222222",
];

export const BEACH: Tileset = {
  id: 5,
  name: "beach",
  hazard: "water",
  // 1-6 are sand, darkest to a shell's white. 7-9 are the palm's greens, and
  // they live on the end of the terrain ramp rather than in one of their own,
  // because a palm is the only green thing here and a ramp per tile is how
  // you end up with nine of them.
  sub: [25, 26, 27, 28, 29, 5, 18, 20, 22],
  wall: DUNE,
  // One on its own is a palm. Same rule as the garden's tree: a wall cell with
  // no wall beside it, which costs the wire format nothing at all.
  tree: PALM,
  floor: SAND,
  // Planks over the water, the job the garden's bridge does. On a beach it is
  // the jetty, and it is the only way across the sea without getting wet.
  ladder: BOARDWALK,
  ladderSub: [48, 49, 51, 52],
  // The sea. It joins up the way a pond does -- see pondFor() -- because a
  // beach with six separate rimmed puddles on it is not a beach.
  fire: POND,
  fireFor: pondFor,
  // Deeper and colder than a garden pond: this is the sea, and the point of it
  // is that it is the edge of the world rather than a puddle to step round.
  fireSub: [6, 7, 8, 10, 5],
  ground: "#ffc23d",
};

/**
 * A road, drawn for the way it actually runs.
 *
 * "The background tiles need to look like roads, but they need to make
 * directional sense" -- which a single tile cannot do, because a tile does not
 * know which way the road goes. It can be told: the same neighbour read the
 * ponds use, asking which sides carry on being road rather than which sides
 * are water.
 *
 * So a cell with road above and below gets a dashed line running north-south,
 * one with road on all four sides gets a junction with stop lines and no
 * markings through the middle -- you do not paint a dashed line through a
 * crossroads -- and one with road on two adjacent sides gets a corner. Kerbs
 * go on the sides the road does NOT continue through, which is what makes a
 * street read as a street rather than as a dark strip.
 *
 * `key` is `link | (car << 4)`: the four sides, plus a bit the renderer sets
 * from the cell's own coordinates so that some tiles have a car on them and it
 * is the same tiles every time. A car is only ever drawn on a straight -- one
 * parked across a junction reads as a crash.
 */
export const ROAD_N = 1;
export const ROAD_E = 2;
export const ROAD_S = 4;
export const ROAD_W = 8;
export const ROAD_CAR = 16;

const ROAD_CACHE = new Map<number, Pattern>();

export function roadFor(key: number): Pattern {
  const had = ROAD_CACHE.get(key);
  if (had !== undefined) return had;

  const W = TILE_PX;
  const link = key & 15;
  const rows: string[][] = [];
  for (let y = 0; y < W; y++) rows.push(new Array<string>(W).fill("2"));
  const put = (x: number, y: number, ink: string): void => {
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    (rows[y] as string[])[x] = ink;
  };

  // Kerbs, on every side the road stops at: a lit lip and a dark gutter.
  for (let i = 0; i < W; i = (i + 1) | 0) {
    if ((link & ROAD_N) === 0) { put(i, 0, "4"); put(i, 1, "1"); }
    if ((link & ROAD_S) === 0) { put(i, W - 1, "4"); put(i, W - 2, "1"); }
    if ((link & ROAD_W) === 0) { put(0, i, "4"); put(1, i, "1"); }
    if ((link & ROAD_E) === 0) { put(W - 1, i, "4"); put(W - 2, i, "1"); }
  }

  const ns = (link & (ROAD_N | ROAD_S)) !== 0;
  const ew = (link & (ROAD_E | ROAD_W)) !== 0;
  const straightNS = ns && !ew;
  const straightEW = ew && !ns;

  if (straightNS) {
    for (let y = 0; y < W; y = (y + 1) | 0) {
      if (y % 6 < 3) { put(7, y, "3"); put(8, y, "3"); }
    }
  } else if (straightEW) {
    for (let x = 0; x < W; x = (x + 1) | 0) {
      if (x % 6 < 3) { put(x, 7, "3"); put(x, 8, "3"); }
    }
  } else if (ns && ew) {
    // A junction: stop lines on the approaches, and nothing through the middle.
    if ((link & ROAD_N) !== 0) for (let x = 3; x < 13; x = (x + 1) | 0) put(x, 3, "3");
    if ((link & ROAD_S) !== 0) for (let x = 3; x < 13; x = (x + 1) | 0) put(x, W - 4, "3");
  }

  // A drain, where there is a gutter to put one in.
  if ((link & ROAD_E) === 0) { put(W - 2, 5, "1"); put(W - 2, 6, "1"); }

  // A car, pointing the way the road goes.
  //
  // Written out as rows rather than as loops, because a car IS its details:
  // bonnet, windscreen with a glint on it, a roof with a highlight down the
  // middle, a rear window, a boot, four wheels standing proud of the body, two
  // amber headlights at the front and two red lamps at the back. Every one of
  // those is one or two pixels, and taking any of them out leaves a lozenge.
  //
  // Drawn facing NORTH and turned for the other axis -- see turnPattern(), the
  // same way the current arrows are drawn once and rotated.
  if ((key & ROAD_CAR) !== 0 && (straightNS || straightEW)) {
    const car: readonly string[] = [
      "................",
      "................",
      ".....111111.....",
      ".....169961.....",
      "....11999911....",
      "....11911911....",   // windscreen
      ".....195591.....",   // ...with the light catching it
      ".....199991.....",
      ".....197791.....",   // the roof highlight
      ".....199991.....",
      "....11911911....",   // rear window
      "....11999911....",
      ".....179971.....",   // two lamps at the back, not a light bar
      ".....111111.....",
      "................",
      "................",
    ];
    const rows16 = straightNS ? car : turnPattern(car as unknown as Pattern);
    for (let y = 0; y < W; y = (y + 1) | 0) {
      const row = rows16[y] as string;
      for (let x = 0; x < W; x = (x + 1) | 0) {
        const ch = row[x] as string;
        if (ch !== ".") put(x, y, ch);
      }
    }
  }

  const made = rows.map((row) => row.join("")) as unknown as Pattern;
  ROAD_CACHE.set(key, made);
  return made;
}

/**
 * A tower, in four kinds.
 *
 * "Could we differ by kinds of skyscrapers to break it up a little, it can be
 * random to conserve space" -- and random it is, in the only sense that costs
 * nothing: the renderer hashes the CELL'S OWN COORDINATES and asks for that
 * kind. Nothing is stored, nothing travels in a link, and the same city looks
 * the same every time anybody opens it.
 *
 * Two bits, so four buildings:
 *
 *   bit 0   two floors of windows instead of three -- "maybe some with two
 *           floors instead of 3", and a shorter block with more roof on it is
 *           the single biggest thing that breaks up a row
 *   bit 1   narrow, two windows across instead of three
 *
 * Which windows are lit comes off the same number, so the four are lit
 * differently as well as shaped differently. A row of identical towers with
 * identical lights is a wallpaper; a row where the lights disagree is a city.
 */
const TOWER_CACHE = new Map<number, Pattern>();

export const WALL_KINDS = 4;

export function towerFor(kind: number): Pattern {
  const k = kind & (WALL_KINDS - 1);
  const had = TOWER_CACHE.get(k);
  if (had !== undefined) return had;

  const W = TILE_PX;
  const rows: string[][] = [];
  for (let y = 0; y < W; y++) rows.push(new Array<string>(W).fill("."));
  const put = (x: number, y: number, ink: string): void => {
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    (rows[y] as string[])[x] = ink;
  };
  const box = (x0: number, y0: number, x1: number, y1: number, ink: string): void => {
    for (let y = y0; y <= y1; y = (y + 1) | 0) {
      for (let x = x0; x <= x1; x = (x + 1) | 0) put(x, y, ink);
    }
  };

  const twoFloors = (k & 1) !== 0;
  const narrow = (k & 2) !== 0;
  const left = narrow ? 3 : 2;
  const right = narrow ? 12 : 13;
  // A shorter building has more roof showing, which is what makes it read as
  // shorter rather than merely as one with fewer windows.
  const top = twoFloors ? 5 : 3;

  box(left, top + 1, right, W - 1, "3");
  // The roof, looked down on: a pale cap set back from the face below it.
  box(left + 1, top - 2, right - 1, top, "4");
  box(left + 2, top - 2, right - 2, top - 1, "5");
  // Two water tanks on a wide roof, one aerial on a narrow one.
  if (narrow) {
    box(7, top - 5, 8, top - 3, "4");
    put(7, top - 6, "5");
  } else {
    box(left + 2, top - 4, left + 3, top - 3, "5");
    box(right - 3, top - 4, right - 2, top - 3, "3");
  }

  // Windows: three across on a wide block, two on a narrow one, and three
  // floors or two. Lit or dark from the kind, so no two agree.
  const cols = narrow ? [5, 9] : [3, 7, 11];
  const floors = twoFloors ? [top + 3, top + 7] : [top + 2, top + 5, top + 8];
  for (let f = 0; f < floors.length; f = (f + 1) | 0) {
    for (let c = 0; c < cols.length; c = (c + 1) | 0) {
      const y = floors[f] as number;
      const x = cols[c] as number;
      const lit = ((f * 3 + c * 2 + k * 5) % 5) < 3;
      box(x, y, x + 1, y + 1, lit ? "6" : "1");
    }
  }

  // An outline, the same rule the garden's tree and the beach's palm use: one
  // cell on its own is a silhouette and needs an edge.
  for (let y = 0; y < W; y = (y + 1) | 0) {
    for (let x = 0; x < W; x = (x + 1) | 0) {
      if ((rows[y] as string[])[x] !== ".") continue;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ny = (y + dy) | 0;
        const nx = (x + dx) | 0;
        if (ny < 0 || nx < 0 || ny >= W || nx >= W) continue;
        const near = (rows[ny] as string[])[nx] as string;
        if (near !== "." && near !== "1") { put(x, y, "1"); break; }
      }
    }
  }

  const made = rows.map((row) => row.join("")) as unknown as Pattern;
  TOWER_CACHE.set(k, made);
  return made;
}


const FIRE_ESCAPE: Pattern = [
  "...4........4...",
  "...5555555555...",
  "...4........4...",
  "...4........4...",
  "...5555555555...",
  "...4........4...",
  "...4........4...",
  "...5555555555...",
  "...4........4...",
  "...4........4...",
  "...5555555555...",
  "...4........4...",
  "...4........4...",
  "...5555555555...",
  "...4........4...",
  "...4........4...",
];

export const CITY: Tileset = {
  id: 6,
  name: "city",
  hazard: "fire",
  // 1-5 are tarmac up to pale concrete; 6 is a lit window and 7 is white.
  // 1-5 are tarmac up to pale concrete, 6 is a lit window, and 7-9 belong to
  // the CAR: a light red for its lamps and the roof highlight, and two reds
  // for its body. Slot 7 was white and no city pattern ever used it.
  sub: [0, 1, 2, 3, 4, 28, 41, 38, 39],
  // EVERY wall cell is a lit tower, joined or not.
  //
  // Two goes at a joined ROOF -- a parapet per cell, then a parapet only where
  // the roof ends -- and neither read as a building: "the merge build sprites
  // still don't look right, just keep them as the lit skyscrapers". Which is
  // the right call. A city seen from above is towers, and a tower has an
  // outline and its lights on; a flat roof at sixteen pixels is a grey square
  // whichever way its kerb runs.
  //
  // So there is no wallFor here and no tree either: a run of these is a row of
  // buildings, which is what a city block IS, and one on its own is the same
  // drawing because it is the same thing.
  wall: towerFor(0),
  // ...and four kinds of it, picked from the cell's own coordinates so a row
  // of buildings is a row of DIFFERENT buildings. See towerFor().
  wallKinds: towerFor,
  floor: STREET,
  // ...but every cell of it is drawn for the way the road runs. See roadFor().
  floorFor: roadFor,
  // Nothing in the adventure game paints one, but a tileset without a ladder
  // draws a hole if a level from somewhere else ever carries one.
  ladder: FIRE_ESCAPE,
  ladderSub: [1, 3, 4, 5],
  // Burning wreckage. The same flame the caves use, and it wants no changing:
  // the one thing on this street that is not grey is the fire.
  fire: FLAME,
  fireFrames: FLAME_FRAMES,
  fireSub: [39, 40, 34, 28, 29, 5],
  ground: PALETTE[1] as string, // #1a212b, the tarmac
};

export const TILESETS: readonly Tileset[] = [UNDERGROUND, OUTSIDE, REEF, GARDEN, BEACH, CITY];

/**
 * The lowest `tiles=` value that names a skin rather than nothing.
 *
 * Everything below it is the engine's own world. This is not tidiness, it is
 * the only reading of the field that keeps every shipped link intact: the
 * value has been written since day one and read by nobody, so EVERY level ever
 * encoded carries tiles=1 -- including the reef and the garden, which do not
 * look remotely like tileset 1. Start reading it at 1 and every underwater
 * link ever sent renders as a dungeon.
 *
 * So 1..4 keep meaning what they have always meant in practice, which is
 * "whatever this game looks like", and the field starts saying something at 5.
 */
export const FIRST_SKIN = 5;

/** The skins a level can ask for by number, by id. */
const SKINS: Readonly<Record<number, Tileset>> = { 5: BEACH, 6: CITY };

/**
 * The tileset for a world.
 *
 * Chosen by which GAME this is, unless the level asks for a skin by number --
 * see FIRST_SKIN for why the numbering starts where it does. A level that asks
 * for nothing gets its engine's world, which is the behaviour that lets the
 * art improve without reissuing a single link.
 */
export function tilesetFor(sideOn: boolean, engine?: string, tilesetId = 0): Tileset {
  const skin = SKINS[tilesetId | 0];
  if (skin !== undefined) return skin;
  // Underwater is drawn from the side and is not the outdoors, so the boolean
  // that used to answer this on its own no longer can. It stays as the default
  // for every caller that has only ever had two worlds to pick between.
  if (engine === "swim") return REEF;
  if (engine === "calm") return GARDEN;
  return sideOn ? OUTSIDE : UNDERGROUND;
}

/** The colour of one pattern character, or null where it is transparent. */
export function inkOf(set: Tileset, ch: string, sub: Ramp = set.sub): string | null {
  const step = (ch.charCodeAt(0) - 49) | 0;   // "1" -> 0
  if (step < 0 || step >= sub.length) return null;
  const index = sub[step];
  if (index === undefined) return null;
  return PALETTE[index] as string;
}

/** Every pattern is 16x16 and uses nothing but "." and the digits 1 to 9. */
export function patternIsSound(pattern: Pattern, steps = RAMP_MAX): boolean {
  if (pattern.length !== TILE_PX) return false;
  const allowed = `.${"123456789".slice(0, Math.max(0, Math.min(RAMP_MAX, steps)))}`;
  for (const row of pattern) {
    if (row.length !== TILE_PX) return false;
    for (const ch of row) if (!allowed.includes(ch)) return false;
  }
  return true;
}
