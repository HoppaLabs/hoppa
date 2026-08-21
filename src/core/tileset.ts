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
  /** The hazard that does not move: a flame below ground, spikes above it. */
  readonly fire: Pattern;
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
  ground: "#12306b",
};

export const TILESETS: readonly Tileset[] = [UNDERGROUND, OUTSIDE, REEF];

/**
 * The tileset for a world.
 *
 * Chosen by which GAME this is, not by the level's `tiles=` field. That field
 * exists in the format and on the wire, and stays reserved: a level saying
 * tiles=1 today gets whatever its engine's world looks like, which is the
 * behaviour that lets the art improve without reissuing a single link.
 */
export function tilesetFor(sideOn: boolean, engine?: string): Tileset {
  // Underwater is drawn from the side and is not the outdoors, so the boolean
  // that used to answer this on its own no longer can. It stays as the default
  // for every caller that has only ever had two worlds to pick between.
  if (engine === "swim") return REEF;
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
