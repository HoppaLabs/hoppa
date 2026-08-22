// Canvas presentation. Maps tile indices to colours and nothing more.
//
// Colours here are cosmetics: they must never reach stateHash(). The real
// tileset arrives on day 7; flat squares are the day 1 presentation.

import { GRID_H, GRID_W } from "../../core/grid.ts";
import { weaponArt } from "./weapon.ts";
import { colourFor } from "../../core/palette.ts";
import { SPRITE_H, SPRITE_W, spriteIndex, type Sprite } from "../../core/sprite.ts";
import { ONE } from "../../core/fixed.ts";
import { CASTS, ENEMIES } from "../../core/enemies.ts";
import {
  ROAD_CAR, WALL_KINDS,
  TILE_PX, flipPattern, inkOf, tilesetFor, turnPattern,
  type Pattern, type Ramp, type Tileset,
  openSides, sidesOf,
} from "../../core/tileset.ts";
import {
  TILE_ACTOR,
  TILE_FLOW,
  TILE_GUARD_REELING,
  TILE_FIRE,
  TILE_LADDER,
  TILE_EXIT_LOCKED,
  TILE_EXIT_OPEN,
  TILE_FLOOR,
  TILE_GUARD,
  TILE_TREASURE,
  TILE_VOID,
  TILE_WALL,
} from "../../core/tiles.ts";

const COLOUR: Record<number, string> = {
  [TILE_VOID]: "#0d1014",
  [TILE_FLOOR]: "#191f27",
  [TILE_WALL]: "#39485c",
  [TILE_ACTOR]: "#ffc23d",
  // Treasure is deliberately NOT gold: the actor is gold, and on a 14px tile a
  // gold nugget and a gold creature are the same square. Cyan reads as a gem
  // and stays distinct for a red-green colour-blind player too.
  [TILE_TREASURE]: "#7fe3ff",
  [TILE_EXIT_LOCKED]: "#7a5c86",
  [TILE_EXIT_OPEN]: "#6fe08a",
  [TILE_GUARD]: "#ff5f4d",
  [TILE_GUARD_REELING]: "#7a5c86",
  [TILE_LADDER]: "#9a6b38",
  // Only ever seen if a tileset stamp fails to build. Orange, because whatever
  // else goes wrong, "this square hurts" must survive it.
  [TILE_FIRE]: "#ff9f3d",
};

/**
 * Clouds, for the side-on sky.
 *
 * A flat field of one colour is the only part of either world with nothing in
 * it, and it reads as unfinished rather than as open air.
 *
 * Drawn the way the era drew them, which matters more here than anywhere else
 * on screen because a cloud is a big soft shape and every shortcut shows:
 *
 *   * whole pixels only, at an integer scale. A cloud at a fractional position
 *     is an anti-aliased smear, and one smear undoes a screen of pixel art.
 *   * three colours -- white, a shaded underside, and the sky showing through.
 *     Two tones is what says "this is a lit thing" without shading it.
 *   * a flat bottom and a lumpy top. That silhouette IS the cloud; without it
 *     a white blob reads as a hole in the sky.
 *
 * Presentation only, and nothing here reaches an engine: hard rule 4. A run
 * replays identically under a clear sky or a cloudy one.
 */
type Cloud = readonly string[];

const CLOUD_WIDE: Cloud = [
  "...............................XXXXX........................",
  ".............................XXXXXXXXX......................",
  "...........................XXXXXXXXXXXXX....................",
  "................XXXXXXXXXXXXXXXXXXXXXXXXX...................",
  "..............XXXXXXXXXXXXXXXXXXXXXXXXXXXX..................",
  "............XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.............",
  "...........XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX...........",
  "...........XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.........",
  ".......XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX........",
  "......XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.....",
  ".....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX....",
  "....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX...",
  "....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX...",
  "...XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..",
  "...XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..",
  "...XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..",
  "...XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..",
  "...sssssssssssssssssssssssssssssssssssssssssssssssssssssss..",
  "...sssssssssssssssssssssssssssssssssssssssssssssssssssssss..",
  "...sssssssssssssssssssssssssssssssssssssssssssssssssssssss..",
];
const CLOUD_SMALL: Cloud = [
  "....................XXXXXXX...........",
  "...................XXXXXXXXX..........",
  "..........XXXXXXXXXXXXXXXXXXX.........",
  ".........XXXXXXXXXXXXXXXXXXXX.........",
  "........XXXXXXXXXXXXXXXXXXXXXX........",
  "......XXXXXXXXXXXXXXXXXXXXXXXXXXX.....",
  "...XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX....",
  "..XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX....",
  "..XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX...",
  ".XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX...",
  ".XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX...",
  ".ssssssssssssssssssssssssssssssssss...",
  ".ssssssssssssssssssssssssssssssssss...",
];

/**
 * How big one art pixel is on screen, in CSS pixels.
 *
 * THE RULE, and the reason it is a function rather than three sums: every
 * drawing in this game -- terrain, gem, door, cloud, creature, enemy -- is
 * authored on a grid of TILE_PX units to the cell, and drawn at this many
 * screen pixels per unit. So one pixel of a gem is the same size as one pixel
 * of the knight standing next to it.
 *
 * It was not always. Tiles were drawn on a grid of eight and sprites on a grid
 * of sixteen, both one cell wide, so terrain came out at double scale.
 * Reported as "treasure pixels look much bigger than the other sprites", and
 * that is precisely what it was: two art styles on one screen. test/artgrid
 * fails if anything drifts off the grid again.
 *
 * Whole numbers only. The era's hardware could not scale by a fraction, and a
 * fractional scale is what turns a hard edge into a smear.
 */
function artUnit(tile: number): number {
  return Math.max(1, Math.round(tile / TILE_PX));
}

/**
 * Where the clouds sit, in cells across and down.
 *
 * Fixed rather than random: the sky is not a thing to be surprised by, and a
 * layout that changed per level would be one more thing moving on a page that
 * already has enough.
 */
/**
 * Where the bubbles are, how big, and how fast they rise.
 *
 * Fixed, for the same reason the clouds are fixed. Different rates so they
 * never form a row, which is the thing that gives away a loop.
 */
const BUBBLES: readonly { x: number; y: number; size: number; rate: number }[] = [
  // Sizes in art pixels across. The first pass used 2 to 4 and the small ones
  // came out as single dots -- a ring needs at least four pixels a side before
  // the hole in the middle survives.
  { x: 3, y: 2, size: 5, rate: 90 },
  { x: 7, y: 9, size: 4, rate: 130 },
  { x: 12, y: 5, size: 6, rate: 70 },
  { x: 16, y: 12, size: 4, rate: 110 },
  { x: 20, y: 7, size: 5, rate: 100 },
  { x: 9, y: 1, size: 4, rate: 150 },
  { x: 18, y: 4, size: 5, rate: 80 },
];

const CLOUDS: readonly { at: Cloud; x: number; y: number; drift: number }[] = [
  { at: CLOUD_WIDE, x: 0, y: 0, drift: 300 },
  { at: CLOUD_SMALL, x: 13, y: 2, drift: 190 },
  { at: CLOUD_WIDE, x: 8, y: 4, drift: 380 },
];

/**
 * The gem, drawn as pixels rather than as a path.
 *
 * It was a canvas path: moveTo, lineTo, fill -- which is a VECTOR diamond, so
 * every edge came out anti-aliased and the spin was a cosine sampled per
 * frame. That was tolerable while it was small and became obvious the moment
 * it was made bigger. Reported as "the treasure doesn't look like pixel art
 * any more, it's too sharp", which is exactly right: everything around it is
 * made of squares and it was not.
 *
 * Three frames rather than a continuous width: full face, half turned, edge
 * on. The era had no tweening, and a gem that snaps between three poses reads
 * as turning far better than one that smoothly narrows.
 *
 * 1 is the outline, 2 the face, 3 the highlight.
 */
const GEM_FRAMES: readonly Pattern[] = [
  [
    ".......11.......",
    "......1441......",
    ".....144551.....",
    "....14445531....",
    "...1444553321...",
    "..144445533221..",
    ".14444455332221.",
    ".13334455533221.",
    "..133344533221..",
    "...1333333221...",
    "....13333221....",
    ".....133221.....",
    "......1221......",
    ".......11.......",
    "................",
    "................",
  ],
  [
    ".......11.......",
    "......1441......",
    "......1451......",
    ".....144531.....",
    ".....145531.....",
    "....14453321....",
    "....13453321....",
    "....1333321.....",
    ".....133321.....",
    ".....133221.....",
    "......1321......",
    "......1221......",
    ".......11.......",
    ".......11.......",
    "................",
    "................",
  ],
  [
    ".......11.......",
    ".......11.......",
    "......1451......",
    "......1451......",
    "......1451......",
    "......1431......",
    "......1431......",
    "......1331......",
    "......1321......",
    "......1321......",
    "......1221......",
    "......1221......",
    ".......11.......",
    ".......11.......",
    "................",
    "................",
  ],
];

/**
 * The door, shut and open.
 *
 * It was drawn procedurally -- rounded fillRects and a ctx.arc for the
 * padlock's shackle -- which put a smooth anti-aliased curve in the middle of
 * a screen made of squares, and gave the level editor's button nothing to show
 * but a flat purple block. A pattern fixes both: the room and the button draw
 * the same eight-by-eight, and there is no curve left to soften.
 *
 * 1 is the frame, 2 the face, 3 the brass (shut) or the lit way through (open).
 */
/**
 * The evac zone: a landing pad with an H on it.
 *
 * ONE pattern for both states, unlike the door, which has a shut drawing and
 * an open one. A pad does not change shape when the last person is aboard --
 * the lights come on. So the shape is fixed and only the inks move, which is
 * also why it needs no second sixteen-by-sixteen.
 *
 * 1 is the tarmac round it, 2 the pad's edge, 3 the pad, 4 the H, 5 the
 * corner lights.
 */
const EVAC_PAD: Pattern = [
  "1111111111111111",
  "1522222222222251",
  "1233333333333321",
  "1233333333333321",
  "1233443333443321",
  "1233443333443321",
  "1233443333443321",
  "1233444444443321",
  "1233444444443321",
  "1233443333443321",
  "1233443333443321",
  "1233443333443321",
  "1233333333333321",
  "1233333333333321",
  "1522222222222251",
  "1111111111111111",
];

const DOOR_SHUT: readonly Pattern[] = [[
  "................",
  ".11111111111111.",
  ".14341243412431.",
  ".14341243412431.",
  ".11111111111111.",
  ".14341556412431.",
  ".14341565412431.",
  ".14341555412431.",
  ".14341555412431.",
  ".14341565412431.",
  ".11111555111111.",
  ".14341243412431.",
  ".14341243412431.",
  ".14341243412431.",
  ".11111111111111.",
  "................",
]];

const DOOR_OPEN: readonly Pattern[] = [[
  "................",
  ".11111111111111.",
  ".12222222222221.",
  ".12333333333321.",
  ".12344444444321.",
  ".12344444444321.",
  ".12344444444321.",
  ".12344444444321.",
  ".12344444444321.",
  ".12344444444321.",
  ".12344444444321.",
  ".12333333333321.",
  ".12222222222221.",
  ".13333333333331.",
  ".11111111111111.",
  "................",
]];

/** Frame, face, brass or glow. */
const DOOR_INKS: Record<string, readonly string[]> = {
  // Oak: edge, shadow, face, lit; then brass and its shine.
  shut: ["#2a1a0d", "#4a2f16", "#6f4823", "#9a6b38", "#a37c14", "#ffc23d"],
  // The way through: frame, the dark beyond, glow, the light you walk into.
  open: ["#2a1a0d", "#12306b", "#2f7a4a", "#6fe08a"],
};

/**
 * The way out, where a world calls it something else.
 *
 * A door in a city is wrong twice over: nobody rescues people through a
 * padlocked oak door, and there is no wall for it to be set into. The city's
 * is a landing pad -- one shape, lit when the last person is aboard.
 *
 * Same mechanism as gemShapes(), one level along again. A world absent from
 * here gets the door.
 */
const DOOR_BY_WORLD: Record<string, readonly Pattern[]> = {
  city: [EVAC_PAD],
};

const DOOR_INKS_BY_WORLD: Record<string, Record<string, readonly string[]>> = {
  city: {
    // Waiting: the tarmac round it, a dull pad, and the H unlit.
    shut: ["#1a212b", "#39485c", "#4a5c6f", "#7c8899", "#a37c14"],
    // Cleared for lift: the pad lit, the H white, the corner lights on.
    open: ["#0a2a12", "#1c7d2c", "#2fae42", "#bff0a8", "#ffffff"],
  },
};

/** The drawing this world's way out uses, in the state it is in. */
function doorShape(world: string, open: boolean): Pattern {
  const own = DOOR_BY_WORLD[world];
  if (own !== undefined) return own[0] as Pattern;
  return (open ? DOOR_OPEN[0] : DOOR_SHUT[0]) as Pattern;
}

/** ...and its colours. */
function doorInks(world: string, open: boolean): readonly string[] {
  const own = DOOR_INKS_BY_WORLD[world];
  const key = open ? "open" : "shut";
  return (own?.[key] ?? DOOR_INKS[key]) as readonly string[];
}

/**
 * A flower, for the garden.
 *
 * The garden used to recolour the gem: same cut diamond, pink instead of teal,
 * on a button that said "flowers". A recoloured crystal is still a crystal --
 * it was the last thing left in the palette where the word and the picture
 * disagreed, and it was the word that was right.
 *
 Five petals, not four. Four was drawn first and it was wrong: four petals
 * at north, east, south and west make a DIAMOND at the size a level actually
 * draws them, which is the shape the whole exercise was getting away from.
 * Five reads as a flower down to about ten pixels.
 *
 * Symmetric to the pixel, checked rather than eyeballed. Five petals do not
 * fall on a sixteen-wide grid symmetrically on their own -- the mirror of
 * column x is column 15-x, so the centre is 8.0 and not the 7.5 that looks
 * right -- so it is rasterised and then folded across its own mirror.
 *
 * The three frames are a NOD, not a spin. A gem turns to catch the light; a
 * flower sits in the ground and moves because the air does. It is the same
 * drawing one pixel lower, level, and one higher -- and gemFrame ping-pongs
 * 0,1,2,1, so it rises and falls rather than snapping back.
 *
 * 1 is the outline, 2 the shadowed base of the petals, 3 the mid, 4 the lit
 * tips, 5 the heart.
 */
const FLOWER_FRAMES: readonly Pattern[] = [
  [ // low, and the frame the still buttons show
    "................",
    "................",
    "......1111......",
    "......1441......",
    ".....143341.....",
    "..111333333111..",
    ".14433222233441.",
    ".14432255223441.",
    ".14332555523341.",
    "..133255552331..",
    "...1322552231...",
    "...1332222331...",
    "...1433333341...",
    "...1444114441...",
    "...1111..1111...",
    "................",
  ],
  [ // level
    "................",
    "......1111......",
    "......1441......",
    ".....143341.....",
    "..111333333111..",
    ".14433222233441.",
    ".14432255223441.",
    ".14332555523341.",
    "..133255552331..",
    "...1322552231...",
    "...1332222331...",
    "...1433333341...",
    "...1444114441...",
    "...1111..1111...",
    "................",
    "................",
  ],
  [ // high
    "......1111......",
    "......1441......",
    ".....143341.....",
    "..111333333111..",
    ".14433222233441.",
    ".14432255223441.",
    ".14332555523341.",
    "..133255552331..",
    "...1322552231...",
    "...1332222331...",
    "...1433333341...",
    "...1444114441...",
    "...1111..1111...",
    "................",
    "................",
    "................",
  ],
];

/**
 * A scallop, for the beach.
 *
 * It NODS rather than spins, the way the flower does: a shell lying on sand
 * is a thing at rest, and one turning end over end read as a coin. Ribs, and
 * a hinge flush with the bottom of the fan -- the first draft had a stalk
 * under it and came out a mushroom.
 *
 * 1 is the rim, 2 the shadow between the ribs, 3 the shell, 4 the lit ribs,
 * 5 the pearl at the hinge.
 *
 * The widest frame has its rim on BOTH sides. Two rows of it ran off the left
 * edge of the tile with no rim on them while the right edge had one, and an
 * outline that stops on one side reads as a picture that has been cut: "the
 * shell icon looks cropped on its left side when placed".
 */
const SHELL_FRAMES: readonly Pattern[] = [
  [ // upright, and the frame the still buttons show
    "................",
    "................",
    "................",
    "......111.......",
    "....1122211.....",
    "..11222222211...",
    ".1222433342221..",
    "122344333443221.",
    "123334434433321.",
    "1233334343333221",
    "1444334343344421",
    "111444333444111.",
    "...113355331....",
    ".....111111.....",
    "................",
    "................",
  ],
  [ // half over
    "................",
    "................",
    "................",
    "................",
    "................",
    ".....11111......",
    "...112222211....",
    "..12223332221...",
    ".1223443443221..",
    "122333434333221.",
    "124433434334421.",
    ".1144433344411..",
    "...113355331....",
    ".....111111.....",
    "................",
    "................",
  ],
  [ // laid flat
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "......111.......",
    "...111222111....",
    "..12224342221...",
    ".1223343433221..",
    ".1243343433421..",
    "..14443334441...",
    "...113355331....",
    ".....111111.....",
    "................",
    "................",
  ],
];

/**
 * Somebody to rescue, for the city.
 *
 * The treasure of a city level: the child is a jaeger and the job is getting
 * people to the evac zone, which is what "pick the treasure up and the door
 * opens" already was. So the only work is what it LOOKS like.
 *
 * It waves rather than spins. A person turning end over end is not somebody
 * asking for help, and the first one -- the gem's own three frames, recoloured
 * -- read as a doll being thrown. The arm is drawn as a chain from the
 * shoulder: built as separate cells it came apart at the top of the wave and
 * the hand floated.
 *
 * 1 is the outline, 2 the coat, 3 the lit coat, 4 skin, 5 hair.
 */
const PERSON_FRAMES: readonly Pattern[] = [
  [ // arm down, and the frame the still buttons show
    "................",
    "......1111......",
    ".....155551.....",
    "....15555551....",
    "....14444441....",
    "...114144141....",
    "..12214444111...",
    "...12233322221..",
    "....123332221...",
    "....12222221....",
    "....12222221....",
    ".....122221.....",
    ".....122221.....",
    ".....121121.....",
    ".....121121.....",
    "......1..1......",
  ],
  [ // half up
    "................",
    "......1111......",
    ".....155551.....",
    "....15555551....",
    "...114444441....",
    "..1224144141....",
    "..12214444111...",
    "...12233322221..",
    "....123332221...",
    "....12222221....",
    "....12222221....",
    ".....122221.....",
    ".....122221.....",
    ".....121121.....",
    ".....121121.....",
    "......1..1......",
  ],
  [ // waving
    "................",
    "......1111......",
    ".....155551.....",
    "...115555551....",
    "..1224444441....",
    "..1224144141....",
    "..12214444111...",
    "...12233322221..",
    "....123332221...",
    "....12222221....",
    "....12222221....",
    ".....122221.....",
    ".....122221.....",
    ".....121121.....",
    ".....121121.....",
    "......1..1......",
  ],
];


/**
 * The shape a world's treasure is, where it is not the gem.
 *
 * The INKS have varied per world since the first tileset; the SHAPE had not,
 * which is how a garden ended up with a pink diamond in it. Same mechanism,
 * one level up. A world absent from here gets the gem.
 */
const GEM_SHAPES: Record<string, readonly Pattern[]> = {
  garden: FLOWER_FRAMES,
  beach: SHELL_FRAMES,
  city: PERSON_FRAMES,
};

/** The frames this world's treasure turns, or nods, through. */
function gemShapes(world: string): readonly Pattern[] {
  return GEM_SHAPES[world] ?? GEM_FRAMES;
}

/**
 * The colour a creature goes when it has noticed you, and how much of it.
 *
 * Same hue and same strength as the translucent rectangle these replace, so
 * nothing about the READING changes -- only that it lands on the creature
 * instead of on a square of water behind it.
 */
export const CHASE_TINT = "#ff8a3d";
export const CHASE_MIX = 0.28;
export const STUN_MIX = 0.5;

/** `amount` of `tint` mixed into `base`. Both are #rrggbb. Presentation only. */
export function mix(base: string, tint: string, amount: number): string {
  const of = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  const blend = (a: number, b: number) => Math.round(a + (b - a) * amount);
  const r = blend(of(base, 1), of(tint, 1));
  const g = blend(of(base, 3), of(tint, 3));
  const b = blend(of(base, 5), of(tint, 5));
  return `rgb(${r},${g},${b})`;
}

/**
 * What to draw in a cell whose tile index is an ACTOR.
 *
 * In a moving frame the actors are drawn afterwards at their real positions,
 * so their cell is painted as whatever they are standing ON. That used to be
 * plain floor unconditionally, which erased the ladder rung, bridge plank or
 * cell of current underneath for as long as anybody stood there -- reported as
 * "when the player sprites moves over a bridge or ladder or current the prop
 * sprites disappear".
 *
 * Pure, and here rather than inline in the loop, because the only other way to
 * see it is to stand on a ladder on a phone.
 */
export function standingOn(
  tile: number,
  mapOnly: boolean,
  under: ReadonlyMap<number, number> | null,
  cell: number,
): number {
  const isActor = tile === TILE_ACTOR || tile === TILE_GUARD || tile === TILE_GUARD_REELING;
  if (!mapOnly || !isActor) return tile;
  return under?.get(cell) ?? TILE_FLOOR;
}

/** Outline, face, highlight -- for each world. */
const GEM_INKS: Record<string, readonly string[]> = {
  // Rim, shadowed facet, body, lit facet, specular. A gem is not one blue and
  // a white dot -- what makes it read as CUT is that the facets disagree.
  underground: ["#062f2f", "#12807a", "#1fb3a6", "#5fe0d2", "#ffffff"],
  outside: ["#25093a", "#6b1fa8", "#9a3ad5", "#e8b6ff", "#ffffff"],
  reef: ["#062f2f", "#12807a", "#1fb3a6", "#5fe0d2", "#ffffff"],
  // A flower, and by now a flower-shaped one -- see FLOWER_FRAMES. Outline,
  // the shadow where the petals meet, the mid, the lit tips, and the yellow
  // heart. Warm pink, which is what a child means by "flower" long before
  // anything about petals comes into it.
  garden: ["#6b1420", "#d82f42", "#ff5f4d", "#ffb3a8", "#ffe9a3"],
  // A shell, in the warm end of the shore: rim, the shadow between the ribs,
  // the shell, the lit ribs, and a pearl at the hinge. Not sand-coloured --
  // a shell the colour of the beach it is lying on is a shell nobody finds.
  beach: ["#6b350c", "#d87a1f", "#ff9f3d", "#ffd0a3", "#ffffff"],
  // A person: outline, coat, the lit side of the coat, skin, hair. High-vis
  // blue, because the one thing that must not blend into a grey street is the
  // thing you are there to pick up.
  city: ["#0d1014", "#1f4fa8", "#3a7bd5", "#ffd0a3", "#6b350c"],
};

/** The gem's shape: a diamond, so a spin is a change of width and nothing else. */
function diamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.lineTo(cx + rx, cy);
  ctx.lineTo(cx, cy + ry);
  ctx.lineTo(cx - rx, cy);
  ctx.closePath();
}

/**
 * Which gem frame this cell is showing.
 *
 * Same arithmetic as the flame, and the same trap: Math.floor rather than
 * `| 0`, because a clock divided down is still far past what 32 bits hold.
 * A full turn is six steps -- out and back through the three drawings -- so a
 * gem spends as long edge-on as face-on.
 */
function gemFrame(cell: number, frames: number): number {
  const step = Math.floor(Date.now() / 190) + cell;
  const round = frames * 2 - 2;
  const at = ((step % round) + round) % round;
  return at < frames ? at : round - at;
}

/**
 * Which flame frame this cell is showing.
 *
 * `| 0` is the house style for integer arithmetic and it is WRONG here.
 * `Date.now() / 160` is about eleven billion, `| 0` truncates to 32 bits, and
 * eleven billion wraps to a NEGATIVE number -- so the frame index went
 * negative, the lookup missed, and the cell fell through to the flat orange
 * square that exists for when a stamp fails to build. On screen: a row of
 * hazards where some were flames and some were plain blocks, flickering
 * between the two. Caught by looking at a screenshot, not by the test, which
 * was happily reporting six distinct frames a second.
 *
 * Math.floor, and a modulo that cannot go negative whatever it is handed.
 */
function flameFrame(cell: number, frames: number): number {
  const step = Math.floor(Date.now() / 160) + cell;
  return ((step % frames) + frames) % frames;
}

/**
 * One tile, drawn the way the game draws it, at whatever size you ask for.
 *
 * This exists so the level editor's buttons cannot lie. They used to be
 * hand-picked coloured squares written out a second time in the editor, and
 * they had already drifted: treasure was #5fd3f3 on the button and #7fe3ff in
 * the room. Worse, a wall is a PATTERN in the game and was a flat block on the
 * button, so the thing you painted with looked nothing like the thing you got.
 *
 * Terrain comes from the tileset, exactly as the stamps do. Everything else is
 * a flat fill in the same COLOUR table the renderer uses, because that is
 * honestly what the game draws for it -- if a gem ever gets a shape, it gets
 * one here and on the button at the same moment.
 */
export function tileChip(
  tile: number,
  sideOn: boolean,
  size: number,
  sprite?: Sprite | null,
  enemy?: { rows: readonly string[]; inks: readonly string[] } | null,
  engine = "",
  tilesetId = 0,
): HTMLCanvasElement {
  const set = tilesetFor(sideOn, engine, tilesetId);
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.max(1, Math.round(size * dpr));
  canvas.height = Math.max(1, Math.round(size * dpr));
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return canvas;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pattern: Pattern | null =
    // The capped drawing, on a button: a chip is a picture of the thing, and
    // the thing has grass on top of it. Bare soil is what it looks like BURIED.
    tile === TILE_WALL ? (set.wallTop ?? set.wall)
    : tile === TILE_FLOOR ? set.floor
    : tile === TILE_LADDER ? set.ladder
    : tile === TILE_FIRE ? set.fire
    : tile === TILE_FLOW ? (set.flow ?? null)
    : tile === TILE_TREASURE ? (gemShapes(set.name)[0] as Pattern)
    : tile === TILE_EXIT_LOCKED ? doorShape(set.name, false)
    : tile === TILE_EXIT_OPEN ? doorShape(set.name, true)
    : null;

  // The ground goes down first: a ladder and a hazard both have gaps in them,
  // and a shape cut out of nothing reads as a hole rather than as a thing.
  ctx.fillStyle = sideOn ? set.ground : (COLOUR[TILE_FLOOR] as string);
  ctx.fillRect(0, 0, size, size);
  if (tile === TILE_LADDER || tile === TILE_FIRE || tile === TILE_FLOW) {
    paintPattern(ctx, set.floor, set.sub, set, size);
  }

  // An enemy, which has its own inks rather than a creature's three.
  if (enemy != null) {
    const scale = artUnit(size);
    const pad = Math.floor((size - SPRITE_W * scale) / 2);
    for (let y = 0; y < SPRITE_H; y++) {
      const row = enemy.rows[y] ?? "";
      for (let x = 0; x < SPRITE_W; x++) {
        const ch = row[x] ?? ".";
        if (ch === ".") continue;
        const ink = enemy.inks[ch.charCodeAt(0) - 49];
        if (ink === undefined) continue;
        ctx.fillStyle = ink;
        ctx.fillRect(pad + x * scale, pad + y * scale, scale, scale);
      }
    }
    return canvas;
  }

  // A 16x16 creature -- the player -- drawn at whatever whole multiple fits.
  // This is what was missing: every entity button was a flat block of one
  // colour, so the tool grid showed no sprites at all.
  if (sprite != null) {
    const scale = artUnit(size);
    const drawn = SPRITE_W * scale;
    const pad = Math.floor((size - drawn) / 2);
    for (let y = 0; y < SPRITE_H; y++) {
      for (let x = 0; x < SPRITE_W; x++) {
        const colour = colourFor(sprite.sub, sprite.pixels[spriteIndex(x, y)] as number);
        if (colour === null) continue;
        ctx.fillStyle = colour;
        ctx.fillRect(pad + x * scale, pad + y * scale, scale, scale);
      }
    }
    return canvas;
  }

  if (pattern !== null) {
    const sub = tile === TILE_FLOW ? (set.flowSub ?? set.sub)
      : tile === TILE_FIRE ? set.fireSub
      : tile === TILE_LADDER ? set.ladderSub
      : set.sub;
    // The gem and the door carry their own colours rather than the terrain's.
    const own =
      tile === TILE_TREASURE
        ? (GEM_INKS[set.name] ?? GEM_INKS.underground)
        : tile === TILE_EXIT_LOCKED ? doorInks(set.name, false)
        : tile === TILE_EXIT_OPEN ? doorInks(set.name, true)
        : null;
    if (own != null) {
      paintInked(ctx, pattern, own as readonly [string, string, string], 0, 0, size);
      return canvas;
    }
    paintPattern(ctx, pattern, sub, set, size);
    return canvas;
  }

  ctx.fillStyle = (COLOUR[tile] ?? COLOUR[TILE_FLOOR]) as string;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/**
 * A three-ink pattern, at an explicit set of colours.
 *
 * The tileset's own patterns go through paintPattern and its sub-palette; the
 * gem and the door have colours of their own, so they come here instead. Both
 * land on whole pixels the same way.
 */
function paintInked(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  inks: readonly string[],
  left: number,
  top: number,
  size: number,
): void {
  const step = size / TILE_PX;
  for (let y = 0; y < TILE_PX; y++) {
    const row = pattern[y] as string;
    for (let x = 0; x < TILE_PX; x++) {
      const ch = row[x] as string;
      if (ch === ".") continue;
      const ink = inks[ch.charCodeAt(0) - 49];
      if (ink === undefined) continue;
      ctx.fillStyle = ink;
      ctx.fillRect(
        left + Math.floor(x * step),
        top + Math.floor(y * step),
        Math.ceil(step),
        Math.ceil(step),
      );
    }
  }
}

function paintPattern(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  sub: Ramp,
  set: Tileset,
  size: number,
): void {
  const step = size / TILE_PX;
  for (let y = 0; y < TILE_PX; y++) {
    const row = pattern[y] as string;
    for (let x = 0; x < TILE_PX; x++) {
      const ink = inkOf(set, row[x] as string, sub);
      if (ink === null) continue;
      ctx.fillStyle = ink;
      ctx.fillRect(Math.floor(x * step), Math.floor(y * step), Math.ceil(step), Math.ceil(step));
    }
  }
}

/**
 * The side-on game gets a sky.
 *
 * Not decoration: it is the only thing on screen that says the rules just
 * changed. From above, the dark ground is what you walk on and a wall is
 * something you go round; from the side, the open space is AIR -- you fall
 * through it, and a wall is something you stand on. A kid handed the same
 * dark room twice has to work that out by dying in it.
 *
 * Only the three terrain colours move. Treasure, the exit, enemies and the
 * ladder keep their meaning across both games, and they were picked to stay
 * legible on either background.
 */
const SKY: Record<number, string> = {
  [TILE_VOID]: "#8fc4e8",
  [TILE_FLOOR]: "#a8d4f0",
  [TILE_WALL]: "#5c7a4a",
  // Cyan was picked to stand out against a DARK room. Against sky it very
  // nearly vanished, so the gem gets its own colour out here.
  //
  // Gold was the obvious answer and the wrong one: measured against this sky
  // it is 1.01:1 -- gold and pale blue differ in hue but barely in brightness,
  // so it disappears for anyone who cannot separate those, and in sunlight for
  // everyone. Mario's coins work because Mario's sky is far darker than this.
  //
  // This magenta was picked by measuring, not by eye: 4.8:1 against the sky,
  // 4.0:1 against the void behind it, and further from every other thing on a
  // side-on screen -- enemy, door, lock, ladder, ground -- than any of them are
  // from each other.
  [TILE_TREASURE]: "#a3006f",
};

const ACTOR_BLOCKED = "#ff5f4d";
const FLOOR_DOT = "#222a35";


export class GridRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  /** The player's creature, drawn instead of a plain square. Cosmetic only. */
  private sprite: Sprite | null = null;
  /** Cosmetic, like the sprite: it never reaches the engine. */
  private weapon: string = "sword";
  /** Which palette to paint the terrain in. Presentation only. */
  private sideOn = false;
  /** Which world this is, so the tileset can be more than "side-on or not". */
  private world = "";
  /**
   * Whether anything is animating. The game redraws every frame and wants the
   * spin; the level editor redraws only when you change something, so an
   * animated gem would be frozen at whatever angle the last edit caught it at.
   */
  private spinning = true;
  /**
   * One pre-drawn canvas per terrain tile, at the size we are drawing at.
   *
   * A tile is 64 pixels and there are 336 cells, so painting them pixel by
   * pixel would be twenty thousand fills a frame. Stamped once here and then
   * blitted, it is 336 drawImage calls -- which is what the old flat squares
   * cost anyway.
   */
  private guardArt: ReadonlyMap<number, number> | null = null;
  private stamps: Map<number, HTMLCanvasElement> | null = null;
  /** One stamp per direction: left, right, up, down. Turned, not redrawn. */
  private flows: HTMLCanvasElement[] = [];
  private flowArt: ReadonlyMap<number, number> | null = null;
  /**
   * The stamp key for a wall with open sky above it.
   *
   * Not a tile index -- no engine ever emits it and none may (hard rule 5).
   * It is a second DRAWING of the same tile, chosen by what is next to it.
   */
  private static readonly WALL_TOP = -1;
  /** A wall cell with no wall beside it. In the garden, that is a tree. */
  private static readonly LONE_WALL = -2;
  private stampedAt = -1;
  private stampedSet = "";
  /** Frames of landing squash left to draw, and what we saw last frame. */
  private squash = 0;
  private wasAirborne = false;
  private lastVy = 0;
  private stamp: HTMLCanvasElement | null = null;

  /**
   * Set the sprite to draw the actor with. Re-stamped to an offscreen canvas
   * once per change rather than per frame: 256 fillRects every repaint is the
   * difference between smooth and not on a cheap phone.
   */
  setWeapon(weapon: string): void {
    this.weapon = weapon;
  }

  /** Which skin this level asks for, or 0 for its engine's own world. */
  private skin = 0;

  /** Side-on levels are painted against sky. Cosmetic; see SKY above. */
  setSideOn(sideOn: boolean, engine = "", tilesetId = 0): void {
    this.sideOn = sideOn;
    this.world = engine;
    this.skin = tilesetId | 0;
  }

  /** One stamp per flame frame, in order. Empty until the stamps are built. */
  private flames: HTMLCanvasElement[] = [];
  /** One pond per set of open sides, where the world's hazard is water. */
  private readonly ponds = new Map<number, HTMLCanvasElement>();
  /** One road per set of joined sides plus a car bit, where the floor is a street. */
  private readonly roads = new Map<number, HTMLCanvasElement>();
  /** One stamp per KIND of building, where a wall is a tower. */
  private readonly towers = new Map<number, HTMLCanvasElement>();

  /**
   * Which of a world's buildings stands on this cell.
   *
   * From the cell's own coordinates, so it is the same building every time
   * anybody opens the level and nothing about it has to be stored. The hash is
   * the one the cars use: two odd multiplies and a xor, which scatters where
   * `x + y` would put every third building in a diagonal stripe.
   */
  private kindAt(x: number, y: number): number {
    const h = (Math.imul(x + 3, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b)) >>> 0;
    return (h >>> 5) % WALL_KINDS;
  }

  /**
   * The floor stamp for THIS cell.
   *
   * Plain floor everywhere except a world whose floor is a road, where it is
   * the piece that runs the way this bit of road runs. Everything that paints
   * ground goes through here -- the open cells, and the base under a ladder, a
   * fire and a gem -- because a gem sitting on a square of generic tarmac in
   * the middle of a marked road is exactly the seam this is here to avoid.
   */
  private floorAt(tiles: Uint8Array, x: number, y: number): HTMLCanvasElement | undefined {
    if (this.roads.size === 0) return this.stamps?.get(TILE_FLOOR);
    // Which sides carry on being road: anything that is not a wall. Asked as
    // "not a wall" rather than "is floor" because a cell with a gem or a guard
    // standing on it is still road underneath.
    const link = sidesOf(tiles, x, y, TILE_WALL);
    // ...and whether this one has a car on it, from the cell's own position so
    // that it is the same cells every time and no two neighbours agree.
    const h = (Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(y + 1, 0x165667b1)) >>> 0;
    const car = h % 7 === 0 ? ROAD_CAR : 0;
    return this.roads.get(link | car) ?? this.stamps?.get(TILE_FLOOR);
  }

  /**
   * Put the clouds up, behind everything.
   *
   * Skipped below a two-pixel step: a thumbnail draws its whole world at four
   * pixels a tile, and a cloud there is three grey pixels that read as dirt.
   */
  private paintClouds(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.world === "swim") {
      this.paintSurface(ctx, t);
      return;
    }
    if (!this.sideOn) return;
    // One art pixel, the same size as every other art pixel on the screen --
    // see artUnit(). The clouds used to be drawn at a fifth of a tile each,
    // which made them three times chunkier than the creature standing under
    // them; they are the same size on screen as before because the DRAWING is
    // three times wider now, not because the pixels are bigger.
    const step = artUnit(t);

    const wide = t * GRID_W;
    for (const cloud of CLOUDS) {
      // Whole pixels, always. Frozen when nothing else is animating, so the
      // level editor draws the same sky twice running.
      const slide = this.spinning ? Math.floor(Date.now() / cloud.drift) : 0;
      const rows = cloud.at;
      const w = (rows[0] as string).length * step;
      // Wrap around the room rather than sailing off it, so the sky is never
      // empty on one side.
      const left = (((cloud.x * t + slide) % (wide + w)) + wide + w) % (wide + w) - w;
      const top = cloud.y * t;

      for (let y = 0; y < rows.length; y++) {
        const row = rows[y] as string;
        for (let x = 0; x < row.length; x++) {
          const ch = row[x] as string;
          if (ch === ".") continue;
          // Three tones. A cloud lit from above is white on top, its own
          // colour through the middle and blue-grey underneath -- two tones
          // read as a paper cut-out, which is what these were.
          ctx.fillStyle = y < 3 ? "#ffffff" : ch === "X" ? "#e4f1fb" : "#b6d3ea";
          ctx.fillRect(left + x * step, top + y * step, step, step);
        }
      }
    }
  }

  /** Turn the spinning treasure off, for a view that is not redrawn each frame. */
  setSpinning(spinning: boolean): void {
    this.spinning = spinning;
  }

  /** The tileset this world uses. Presentation only; see core/tileset.ts. */
  private tiles(): Tileset {
    return tilesetFor(this.sideOn, this.world, this.skin);
  }

  /**
   * Stamp each terrain tile onto its own little canvas at the current size.
   *
   * Rebuilt when the size or the world changes, and never per frame.
   */
  private restamp(): void {
    const t = this.scale;
    const set = this.tiles();
    if (this.stamps !== null && this.stampedAt === t && this.stampedSet === set.name) return;

    const made = new Map<number, HTMLCanvasElement>();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    // The hazard is the one thing that does not use the terrain palette: it is
    // a different material, and borrowing the terrain's colours made the flame
    // stone grey. See Tileset.fireSub.
    const patterns: ReadonlyArray<readonly [number, Pattern, Ramp]> = [
      [TILE_WALL, set.wall, set.sub],
      [GridRenderer.WALL_TOP, set.wallTop ?? set.wall, set.sub],
      [GridRenderer.LONE_WALL, set.tree ?? set.wall, set.sub],
      [TILE_FLOOR, set.floor, set.sub],
      [TILE_LADDER, set.ladder, set.ladderSub],
      [TILE_FIRE, set.fire, set.fireSub],
    ];

    // Fire gets one stamp per frame. Everything else gets one.
    const frames = set.fireFrames ?? [set.fire];
    const flames: HTMLCanvasElement[] = [];

    // A current gets one per direction, all four turned from the one drawing
    // so they cannot drift apart. Order matches FLOW_GLYPHS: left, right, up,
    // down -- and the drawing points right, so right is the one left alone.
    const flows: HTMLCanvasElement[] = [];
    if (set.flow !== undefined) {
      const right = set.flow;
      const turned: readonly Pattern[] = [
        flipPattern(right),                            // left
        right,                                         // right
        turnPattern(turnPattern(turnPattern(right))),  // up
        turnPattern(right),                            // down
      ];
      for (const pattern of turned) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(t * dpr));
        canvas.height = Math.max(1, Math.round(t * dpr));
        const ctx = canvas.getContext("2d");
        if (ctx === null) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintPattern(ctx, pattern, set.flowSub ?? set.sub, set, t);
        flows.push(canvas);
      }
    }
    this.flows = flows;

    for (const [tile, pattern, sub] of patterns) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(t * dpr));
      canvas.height = Math.max(1, Math.round(t * dpr));
      const ctx = canvas.getContext("2d");
      if (ctx === null) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Whole-pixel steps where they divide evenly, so the art stays crisp.
      const step = t / TILE_PX;
      for (let y = 0; y < TILE_PX; y++) {
        const row = pattern[y] as string;
        for (let x = 0; x < TILE_PX; x++) {
          const ink = inkOf(set, row[x] as string, sub);
          if (ink === null) continue;
          ctx.fillStyle = ink;
          ctx.fillRect(
            Math.floor(x * step),
            Math.floor(y * step),
            Math.ceil(step),
            Math.ceil(step),
          );
        }
      }
      made.set(tile, canvas);
    }

    for (const frame of frames) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(t * dpr));
      canvas.height = Math.max(1, Math.round(t * dpr));
      const ctx = canvas.getContext("2d");
      if (ctx === null) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintPattern(ctx, frame, set.fireSub, set, t);
      flames.push(canvas);
    }
    this.flames = flames;

    // A pond, once per set of open sides. Sixteen little canvases, built the
    // same way and at the same time as everything else, so the paint loop only
    // ever looks one up. See Tileset.fireFor.
    this.ponds.clear();
    if (set.fireFor !== undefined) {
      for (let open = 0; open < 16; open = (open + 1) | 0) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(t * dpr));
        canvas.height = Math.max(1, Math.round(t * dpr));
        const ctx = canvas.getContext("2d");
        if (ctx === null) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintPattern(ctx, set.fireFor(open), set.fireSub, set, t);
        this.ponds.set(open, canvas);
      }
    }

    // ...and a road the same way, where the floor runs somewhere. Thirty-two
    // rather than sixteen: the four sides, and a bit for whether this one has
    // a car parked on it. See Tileset.floorFor.
    this.roads.clear();
    if (set.floorFor !== undefined) {
      for (let key = 0; key < 32; key = (key + 1) | 0) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(t * dpr));
        canvas.height = Math.max(1, Math.round(t * dpr));
        const ctx = canvas.getContext("2d");
        if (ctx === null) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintPattern(ctx, set.floorFor(key), set.sub, set, t);
        this.roads.set(key, canvas);
      }
    }

    // ...and one per kind of building, where a wall is a tower.
    this.towers.clear();
    if (set.wallKinds !== undefined) {
      for (let kind = 0; kind < WALL_KINDS; kind = (kind + 1) | 0) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(t * dpr));
        canvas.height = Math.max(1, Math.round(t * dpr));
        const ctx = canvas.getContext("2d");
        if (ctx === null) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintPattern(ctx, set.wallKinds(kind), set.sub, set, t);
        this.towers.set(kind, canvas);
      }
    }

    this.stamps = made;
    this.stampedAt = t;
    this.stampedSet = set.name;
  }

  /**
   * The ground a thing is standing on.
   *
   * Anything the engine puts in a cell -- a gem, an enemy, the door -- replaces
   * the floor tile there, so it has to paint the floor back in behind itself.
   * It used to paint a flat colour, which matched when the floor WAS a flat
   * colour; against a tiled world it left every gem sitting on a pale square.
   */
  private paintUnder(x: number, y: number, tiles?: Uint8Array): void {
    const t = this.scale;
    const floor = tiles === undefined
      ? this.stamps?.get(TILE_FLOOR)
      : this.floorAt(tiles, x, y);
    if (floor === undefined) {
      this.ctx.fillStyle = this.ink(TILE_FLOOR);
      this.ctx.fillRect(x * t, y * t, t, t);
      return;
    }
    // The world's own ground first, because a floor tile may be transparent.
    this.ctx.fillStyle = this.tiles().ground;
    this.ctx.fillRect(x * t, y * t, t, t);
    this.ctx.drawImage(floor, x * t, y * t, t, t);
  }

  /**
   * The surface of the water, along the top row.
   *
   * The single most important thing on an underwater screen, because it is the
   * answer to the only question the level keeps asking. Air is UP -- that is
   * the whole rule, and a rule nobody can see is not a rule, it is a surprise.
   * Without this the top of a reef level is just more blue.
   *
   * Drawn as the era drew water: a bright band, a row of highlight on top of
   * it, and a broken line of glints under that. Whole art pixels, and it moves
   * on the same clock as the clouds so a still screen stays still.
   */
  private paintSurface(ctx: CanvasRenderingContext2D, t: number): void {
    const step = artUnit(t);
    const wide = t * GRID_W;
    const slide = this.spinning ? Math.floor(Date.now() / 260) : 0;

    // The band itself: the top row, a shade lighter than the deep.
    ctx.fillStyle = "#3a7bd5";
    ctx.fillRect(0, 0, wide, t);
    // The line where air meets water, which is the line a player aims for.
    ctx.fillStyle = "#b6dcff";
    ctx.fillRect(0, 0, wide, step * 2);

    // Glints, ticking along the band. Two rows so it reads as a moving surface
    // rather than as a painted stripe.
    ctx.fillStyle = "#6fb2f0";
    const run = step * 12;
    for (let x = -run; x < wide + run; x += run) {
      const at = x + ((slide * step) % run);
      ctx.fillRect(at, step * 3, step * 5, step);
      ctx.fillRect(at + step * 6, step * 5, step * 3, step);
    }

    this.paintShafts(ctx, t, step);
    this.paintBubbles(ctx, t, step);
  }

  /**
   * Sunlight coming down through the water.
   *
   * The underwater answer to the clouds, and it exists for exactly the same
   * reason they do: a flat field of one colour is the only part of a screen
   * with nothing in it, and it reads as unfinished rather than as open water.
   * Deep blue is a bigger empty field than sky ever was.
   *
   * Angled, because vertical beams read as bars. A diagonal in pixel art is a
   * staircase and that is correct -- the era had no other way to draw one, and
   * the steps are what stop it looking like a gradient somebody airbrushed on.
   */
  private paintShafts(ctx: CanvasRenderingContext2D, t: number, step: number): void {
    const wide = t * GRID_W;
    const tall = t * GRID_H;
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = "#b6dcff";
    // Fixed positions, like the clouds: light through water is not a thing to
    // be surprised by, and a layout that changed per level would be one more
    // thing moving on a page that has enough already.
    for (const from of [2, 9, 15, 21]) {
      const top = from * t;
      const width = step * 10;
      for (let y = 0; y < tall; y += step) {
        // One step right for every two down: a shallow rake, the way light
        // actually comes in, rather than a 45-degree wedge.
        const shift = Math.floor(y / (step * 2)) * step;
        const x = top + shift;
        if (x > wide) break;
        ctx.fillRect(x, y, width, step);
      }
    }
    ctx.restore();
  }

  /**
   * Bubbles, rising.
   *
   * The one thing on screen that says which way is up without any words, on a
   * screen whose whole rule is that air is up. Slow, few, and drawn as rings
   * rather than dots so they read as bubbles and not as bullets.
   */
  private paintBubbles(ctx: CanvasRenderingContext2D, t: number, step: number): void {
    const tall = t * GRID_H;
    const drift = this.spinning ? Date.now() : 0;
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "#b6dcff";
    for (const bubble of BUBBLES) {
      // Rising and wrapping: up past the surface, back in at the seabed.
      const travelled = Math.floor(drift / bubble.rate) * step;
      const y = tall - (((travelled + bubble.y * t) % (tall + t)) | 0);
      // A slow sway, in whole pixels, so it wobbles rather than sliding.
      const sway = Math.floor(y / (step * 6)) % 2 === 0 ? 0 : step;
      const x = bubble.x * t + sway;
      const r = bubble.size * step;
      // A ring: the outline, and nothing in the middle.
      ctx.fillRect(x, y, r, step);
      ctx.fillRect(x, y + r - step, r, step);
      ctx.fillRect(x, y, step, r);
      ctx.fillRect(x + r - step, y, step, r);
    }
    ctx.restore();
  }

  /** How many of the four cells beside this one are also wall. */
  private wallsAround(tiles: Uint8Array, x: number, y: number): number {
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      if ((tiles[ny * GRID_W + nx] as number) === TILE_WALL) n = (n + 1) | 0;
    }
    return n;
  }

  /** The colour for a tile, in whichever world this level is. */
  private ink(tile: number): string {
    if (this.sideOn) {
      const sky = SKY[tile];
      if (sky !== undefined) return sky;
    }
    return COLOUR[tile] ?? (COLOUR[TILE_VOID] as string);
  }

  /**
   * The six enemy frames, stamped once: three creatures, two frames each.
   *
   * Built the same way the player's sprite is -- a 16x16 canvas with one
   * fillRect per pixel, then blitted whole with smoothing off. That is the
   * entire fix for "the animation breaks the 8bit look": a stamp cannot be
   * anti-aliased, cannot be scaled by a fraction, and cannot tween.
   */
  private enemyStamps: HTMLCanvasElement[][] = [];
  /** Which world the stamps above were drawn for. */
  private castStampedFor = "";

  /** The same frames again, lit for a creature that has noticed you. */
  private enemyChasing: HTMLCanvasElement[][] = [];
  /** ...and for one that has just been hit. */
  private enemyStunned: HTMLCanvasElement[][] = [];

  /** One stamp per gem frame, per world. Rebuilt when the tile size changes. */
  private gemStamps: HTMLCanvasElement[] = [];
  private gemStampedAt = -1;
  private gemStampedSet = "";

  private stampGems(t: number): void {
    const set = this.tiles();
    if (this.gemStampedAt === t && this.gemStampedSet === set.name) return;
    const inks = GEM_INKS[set.name] ?? (GEM_INKS.underground as readonly string[]);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.gemStamps = gemShapes(set.name).map((frame) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(t * dpr));
      canvas.height = Math.max(1, Math.round(t * dpr));
      const ctx = canvas.getContext("2d");
      if (ctx === null) return canvas;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintInked(ctx, frame, inks, 0, 0, t);
      return canvas;
    });
    this.gemStampedAt = t;
    this.gemStampedSet = set.name;
  }

  /**
   * One enemy frame, drawn once, optionally tinted.
   *
   * The tint is mixed into the INK of each pixel the creature actually
   * occupies. It used to be a translucent fillRect over the whole tile, and a
   * hard-edged square over a sprite that is not square reads as a box behind
   * the creature rather than as a light on it -- reported as "when enemy
   * sprites move there background changes", with a screenshot of a shark in a
   * grey rectangle. Over the reef's navy, #ff8a3d at 0.28 comes out
   * rgb(84,73,94), which is exactly the box in the picture.
   */
  private stampOne(
    frame: readonly string[],
    inks: readonly string[],
    tint: string | null,
    amount: number,
  ): HTMLCanvasElement {
    const stamp = document.createElement("canvas");
    stamp.width = SPRITE_W;
    stamp.height = SPRITE_H;
    const ctx = stamp.getContext("2d");
    if (ctx === null) return stamp;
    for (let y = 0; y < SPRITE_H; y++) {
      const row = frame[y] as string;
      for (let x = 0; x < SPRITE_W; x++) {
        const ch = row[x] as string;
        if (ch === ".") continue;
        const ink = inks[ch.charCodeAt(0) - 49];
        if (ink === undefined) continue;
        ctx.fillStyle = tint === null ? ink : mix(ink, tint, amount);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return stamp;
  }

  private stampEnemies(): void {
    // Rebuilt when the WORLD changes, not just once. A bat has no business in a
    // rock pool and a goblin has none on a lawn: each world picks its own cast,
    // the same way it already picks its gem colours.
    //
    // ...and when the WEAPON changes, because the stunned tint says which one
    // hit it: a wand freezes blue, a sword flashes white.
    const cast = CASTS[this.tiles().name] ?? ENEMIES;
    const key = `${this.tiles().name}/${this.weapon}`;
    if (this.enemyStamps.length > 0 && this.castStampedFor === key) return;
    this.castStampedFor = key;

    const stun = this.weapon === "wand" ? "#7fd8ee" : "#ffffff";
    this.enemyStamps = cast.map((one) =>
      one.frames.map((frame) => this.stampOne(frame, one.inks, null, 0)));
    this.enemyChasing = cast.map((one) =>
      one.frames.map((frame) => this.stampOne(frame, one.inks, CHASE_TINT, CHASE_MIX)));
    this.enemyStunned = cast.map((one) =>
      one.frames.map((frame) => this.stampOne(frame, one.inks, stun, STUN_MIX)));
  }

  /**
   * Which enemy stands in which cell, for the frames that are drawn from the
   * tile grid rather than from moving actors -- the level editor, and the
   * still frame between turns.
   *
   * Without it a placed enemy came out as a RED SQUARE WITH AN EYE while the
   * button that placed it showed a goblin. The tile grid carries one index for
   * all three kinds, deliberately: no engine may be told which is which (hard
   * rule 4), so the art has to arrive beside the tiles rather than in them.
   */
  private under: ReadonlyMap<number, number> | null = null;

  setGuardArt(art: ReadonlyMap<number, number> | null): void {
    this.guardArt = art;
  }

  /**
   * Which way the current in each cell flows.
   *
   * Read off the LEVEL, not off the engine -- the same arrangement guardArt
   * uses to tell a goblin from a bat. Hard rule 5: an engine emits one tile
   * index for a current and knows nothing about which way it points, and hard
   * rule 4 keeps the drawing out of stateHash(). The direction is real state,
   * but it is state that never changes, so the level is where it belongs.
   */
  setFlowArt(art: ReadonlyMap<number, number> | null): void {
    this.flowArt = art;
  }

  /**
   * What is really in a cell, for the cells something can STAND on.
   *
   * An engine emits one tile per cell and the actor overwrites whatever it is
   * standing on, so a moving frame draws plain floor there and puts the sprite
   * on top. On a ladder rung, a plank of a bridge or a cell of current, that
   * erases the thing underneath -- reported as "when the player sprites moves
   * over a bridge or ladder or current the prop sprites disappear".
   *
   * Read off the LEVEL, the same way guardArt and flowArt are, because it is
   * exactly the same kind of fact: real, fixed, and none of the engine's
   * business (hard rules 4 and 5).
   */
  setUnder(under: ReadonlyMap<number, number> | null): void {
    this.under = under;
  }

  setSprite(sprite: Sprite | null): void {
    this.sprite = sprite;
    this.stamp = null;
    if (sprite === null) return;

    const stamp = document.createElement("canvas");
    stamp.width = SPRITE_W;
    stamp.height = SPRITE_H;
    const ctx = stamp.getContext("2d");
    if (ctx === null) return;
    for (let y = 0; y < SPRITE_H; y++) {
      for (let x = 0; x < SPRITE_W; x++) {
        const colour = colourFor(sprite.sub, sprite.pixels[spriteIndex(x, y)] as number);
        if (colour === null) continue;
        ctx.fillStyle = colour;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    this.stamp = stamp;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (ctx === null) throw new Error("canvas 2d context unavailable");
    this.ctx = ctx;
  }

  /** The cell size currently being drawn at, in CSS pixels. */
  tileSize(): number {
    return this.scale;
  }

  /**
   * Draw at a chosen cell size rather than the one that fits.
   *
   * The level editor uses this to go bigger than the screen and scroll: on a
   * phone, 24 cells across is a 15 point cell, and a fingertip is nearer 40.
   */
  setTileSize(tile: number): void {
    this.resize(Math.max(6, Math.floor(tile)));
  }

  /** Pick the largest whole-pixel tile size that fits the space we're given. */
  fit(availableWidth: number, availableHeight: number): void {
    this.resize(
      Math.max(6, Math.floor(Math.min(availableWidth / GRID_W, availableHeight / GRID_H))),
    );
  }

  private resize(tile: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.scale = tile;

    const cssW = tile * GRID_W;
    const cssH = tile * GRID_H;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * A real-time frame. The tile grid is drawn from the engine's tiles, but the
   * moving things are drawn from their exact sub-cell positions instead of
   * being snapped to a square -- that is the whole difference between "the
   * world advances when you press" and "the world is moving".
   */
  drawMoving(
    tiles: Uint8Array,
    actor: {
      x: number; y: number; facing: number;
      swinging: boolean; blinking: boolean;
      swingLeft: number; swingLength: number;
      /** Side-on only. Absent from above, where nothing leaves the ground. */
      airborne?: boolean;
      /** Subcells per tick, negative going up. Drives the squash and stretch. */
      vy?: number;
    },
    enemies: ReadonlyArray<{
      x: number; y: number; stunned: boolean; chasing: boolean;
      /** Which of the three it is drawn as. Presentation only. */
      art?: number;
      /** Which way it is walking, if its engine says. Side-on, dash/7 on. */
      dir?: number;
    }>,
    reach: number,
  ): void {
    // Draw the map with the moving things left out; they go on top, in between
    // the squares.
    this.draw(tiles, false, true);

    const t = this.scale;
    const ctx = this.ctx;
    const px = (value: number) => (value * t) / ONE;

    this.stampEnemies();

    for (const enemy of enemies) {
      // Whole pixels, always.
      //
      // The old drawing was fillRects at fractional coordinates, scaled every
      // frame by a non-integer squash factor. Sampled on the canvas that patch
      // held SEVENTEEN distinct colours; real pixel art holds three or four.
      // Hardware of the era could not position at half a pixel and could not
      // scale at all, and that is exactly why its sprites look the way they do.
      // An INTEGER multiple of the sprite, never a fraction of the tile.
      //
      // This was t * 0.86, which on a 15px tile drew a 16px sprite at 12: a
      // 0.75 downscale that throws away every fourth row and column. With
      // smoothing off that is not a blur, it is DELETION -- and it is why the
      // dragon, whose identity is a thin wing edge and a snout, arrived on
      // screen as a smudge while the goblin survived. Rendered side by side at
      // 12, 24 and 48 pixels, the difference is not subtle.
      //
      // Integer scale factors only is the era's rule and the reason its art
      // still looks like itself. A 16px sprite slightly overhangs a 15px tile,
      // which is what sprites have always done.
      const scale = artUnit(t);
      const size = SPRITE_W * scale;
      const left = Math.round(px(enemy.x) - size / 2);
      const foot = Math.round(px(enemy.y) + size / 2);

      // A two-frame walk, stepped by DISTANCE rather than by a clock: it
      // strides while it walks and stands still when it stands still. A timer
      // would have it marching on the spot at the end of its patrol.
      //
      // Stepped, not tweened. The era had no interpolation -- every frame was
      // drawn -- and the snap between two poses IS the look.
      const travelled = ((enemy.x + enemy.y) / (ONE >> 1)) | 0;
      const frame = enemy.stunned ? 0 : (((travelled % 2) + 2) % 2);

      // Which SET, not which alpha. A creature that has noticed you is drawn
      // in its own lit colours; a stunned one in the colours of whatever hit
      // it. The tint lands on the creature and nowhere else -- see stampOne.
      const flickering = enemy.stunned && (Date.now() >> 7) % 2 === 0;
      const set = enemy.stunned && flickering ? this.enemyStunned
        : enemy.chasing && !enemy.stunned ? this.enemyChasing
        : this.enemyStamps;
      const art = set[enemy.art ?? 0] ?? set[0];
      const stamp = art?.[frame];

      // A one-pixel bob on the walk beat, which is the era's whole vocabulary
      // for "this thing is alive". One pixel: any more and it hops.
      const bob = enemy.stunned || frame === 0 ? 0 : 1;
      const top = foot - size + bob;

      if (stamp !== undefined) {
        // Stunned reads as flickering, and frozen as ice: "not moving" is not
        // a signal, because a guard at the end of its patrol is not moving
        // either. A child has to tell at a glance which ones cannot touch them.
        // The fade stays -- it is the flicker -- and only the tinting moved.
        if (enemy.stunned) ctx.globalAlpha = flickering ? 0.35 : 0.75;
        // Face the way you are walking. Until dash/7 no side-on enemy ever took
        // a step, so every one of them could be drawn facing the same way and
        // nobody could tell; the moment they walk, one of the two directions is
        // a moonwalk. Mirrored rather than drawn twice: the art is a silhouette
        // with a light side, and at 16 pixels a flip reads as a turn.
        const mirrored = (enemy.dir ?? 1) < 0;
        if (mirrored) {
          ctx.save();
          ctx.translate(left + size, top);
          ctx.scale(-1, 1);
          ctx.drawImage(stamp, 0, 0, size, size);
          ctx.restore();
        } else {
          ctx.drawImage(stamp, left, top, size, size);
        }
        ctx.globalAlpha = 1;

        continue;
      }

      // No stamp built yet: the day-one square still says "this is a thing that
      // hurts" perfectly well.
      ctx.fillStyle = enemy.stunned ? "#7a5c86" : this.ink(TILE_GUARD);
      ctx.fillRect(left, top, size, size);
    }

    // The sword. It SWEEPS: over the few ticks a swing lasts, the blade starts
    // behind the shoulder, arcs through the facing direction and follows
    // through. A bar that blinks on and off reads as a bug; an arc reads as a
    // swing, and it is the only feedback saying "that press did something".
    //
    // All of this is presentation, so ordinary maths is fine here -- the
    // determinism zone is the engine, and none of these numbers reach it.
    if (actor.swinging && actor.swingLength > 0) {
      const done = 1 - actor.swingLeft / actor.swingLength; // 0 -> 1 through the swing
      const base = (Math.PI / 2) * actor.facing - Math.PI / 2; // facing, in radians
      const sweep = (Math.PI * 5) / 6; // 150 degrees of arc
      const art = weaponArt(this.weapon, this.world);
      // A LASER does not sweep. A blade travels through an arc because an arm
      // does; a beam leaves the muzzle in one direction and that direction is
      // the one you are facing. Given the arc it looked like a lightsabre,
      // which is a different thing to be holding.
      const angle = art === "laser" ? base : base - sweep / 2 + sweep * done;

      // The blade is shortest at the extremes of the arc and longest through
      // the middle, the way an actual swing looks.
      const extend = 0.55 + 0.45 * Math.sin(Math.PI * done);
      // The hilt starts clear of the body rather than at its centre. Drawn from
      // the centre the blade came out of the middle of the creature, which read
      // wrong; held out in front, it reads as something being swung.
      const hilt = t * 0.34;
      const len = px(reach) * extend * 0.72 - hilt;
      const cx = px(actor.x);
      // The arc turns about a point a little above the body's centre -- roughly
      // where a hand would be, not where the legs are. Swung from dead centre,
      // the downward half of the sweep came out from between them.
      //
      // A little: it was a fifth of a tile up, which put the pivot at the
      // shoulder and made the blade look hinged off the top of the head on the
      // upswing. Halved, so it reads as an arm rather than an antenna.
      const cy = px(actor.y) - t * 0.1;
      const thick = Math.max(2, Math.floor(t / 5));

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      if (art === "wand") {
        // A wand is a short pale rod with the work happening at the tip: the
        // star is the swing, the way the blade is for a sword.
        const star = Math.max(3, t * 0.22);
        ctx.fillStyle = "rgba(219,182,255,.30)";
        ctx.fillRect(hilt, -thick, len, thick * 2);
        ctx.fillStyle = "#e8dcf4";
        ctx.fillRect(hilt, -thick / 2, len, thick);
        ctx.fillStyle = "rgba(233,208,255,.55)";
        ctx.beginPath();
        ctx.arc(hilt + len, 0, star, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(hilt + len, 0, star * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (art === "laser") {
        // A bolt, not a blade: a hot white core inside a wider coloured glow,
        // a flare at the muzzle, and the whole thing at full length from the
        // first frame. It fades over the swing rather than retracting, because
        // a beam that shortens reads as a stick being pulled back in.
        const fade = 1 - done * 0.65;
        const core = Math.max(1.5, thick * 0.4);
        const reachOut = px(reach) * 0.95;
        ctx.fillStyle = `rgba(255,95,77,${(0.30 * fade).toFixed(3)})`;
        ctx.fillRect(hilt, -thick * 1.6, reachOut, thick * 3.2);
        ctx.fillStyle = `rgba(255,159,61,${(0.75 * fade).toFixed(3)})`;
        ctx.fillRect(hilt, -core * 1.8, reachOut, core * 3.6);
        ctx.fillStyle = `rgba(255,255,255,${fade.toFixed(3)})`;
        ctx.fillRect(hilt, -core / 2, reachOut, core);
        // The muzzle flare, and a bright dot where the beam lands.
        ctx.fillStyle = `rgba(255,233,163,${(0.9 * fade).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(hilt, 0, Math.max(2, thick * 0.9 * fade), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hilt + reachOut, 0, Math.max(2, thick * 0.7 * fade), 0, Math.PI * 2);
        ctx.fill();
      } else if (art === "trident") {
        // Three prongs on a shaft. Nobody swings a broadsword through water,
        // and the prongs are the whole reason this reads as a trident rather
        // than a sword drawn badly -- so they are the LAST thing to shrink:
        // even at a quarter of a tile the head keeps all three.
        ctx.fillStyle = "rgba(226,234,242,.18)";
        ctx.fillRect(hilt, -thick, len * 0.7, thick * 2);
        // The shaft, in bronze, so the head reads against it.
        ctx.fillStyle = "#b98d4a";
        ctx.fillRect(hilt, -thick / 2, len * 0.78, thick);
        const head = hilt + len * 0.34;
        const nose = hilt + len;
        // The prongs are THINNER than the shaft and set wider than they are
        // thick: at a phone's tile size the gaps between them are two or three
        // pixels, and if the prongs were shaft-width the gaps would close and
        // the whole head would read as one white paddle. It did.
        const prong = Math.max(1.5, thick * 0.45);
        const spread = Math.max(prong * 1.9, t * 0.12);
        // The crossbar the prongs stand on.
        ctx.fillStyle = "#dfe8f0";
        ctx.fillRect(head, -spread - prong / 2, prong, spread * 2 + prong);
        for (const at of [-spread, 0, spread]) {
          ctx.fillRect(head, at - prong / 2, nose - head, prong);
        }
        // Barbs: a point on each prong, which is what a fish spear has.
        ctx.fillStyle = "#ffffff";
        for (const at of [-spread, 0, spread]) {
          ctx.fillRect(nose - prong, at - prong / 2, prong, prong);
        }
      } else {
        // Silver, not gold: a sword is steel, and the gold one read as brass.
        const trail = Math.max(2, thick);
        ctx.fillStyle = "rgba(226,234,242,.24)";
        ctx.fillRect(hilt, -trail, len, trail * 2);
        // The crossguard, at the hilt end, so the shape says "sword" even at
        // the size a phone draws it.
        ctx.fillStyle = "#8d7a5c";
        ctx.fillRect(hilt - thick * 0.6, -thick * 1.4, thick * 0.8, thick * 2.8);
        ctx.fillStyle = "#e2eaf2";
        ctx.fillRect(hilt, -thick / 2, len, thick);
        // A tip, so it looks like a sword rather than a stick.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(hilt + len - thick, -thick / 2, thick, thick);
      }
      ctx.restore();
    }

    const size = Math.max(4, Math.floor(t * 0.8));
    // Squash and stretch, the oldest trick there is.
    //
    // A jump where the only thing that changes is the y coordinate reads as a
    // sprite being slid upwards. Stretching it thin on the way up and through
    // the fall, then flattening it on impact, is what makes it read as pushing
    // off and landing. Both numbers come from the engine's own vy, so the
    // animation tracks the real arc rather than a timer guessing at it.
    let stretchX = 1;
    let stretchY = 1;
    if (actor.airborne !== undefined) {
      const vy = actor.vy ?? 0;
      if (this.squash > 0) {
        // Just landed: wide and low for a few frames.
        this.squash -= 1;
        stretchX = 1.16;
        stretchY = 0.8;
      } else if (actor.airborne) {
        const fast = Math.min(1, Math.abs(vy) / 60);
        stretchX = 1 - 0.18 * fast;
        stretchY = 1 + 0.24 * fast;
      }
      // Remember the impact for the frame it happens on.
      if (this.wasAirborne && !actor.airborne && this.lastVy > 34) this.squash = 5;
      this.wasAirborne = actor.airborne;
      this.lastVy = vy;
    }

    const drawW = size * stretchX;
    const drawH = size * stretchY;
    const ax = px(actor.x) - drawW / 2;
    // Anchored at the FEET, not the middle: a stretched sprite centred on its
    // middle sinks into the floor it is standing on.
    const ay = px(actor.y) + size / 2 - drawH;
    // Blink while the mercy window is open, the way every game of this shape does.
    if (!actor.blinking || (Date.now() >> 6) % 2 === 0) {
      if (this.stamp !== null) {
        ctx.drawImage(this.stamp, ax, ay, drawW, drawH);
      } else {
        ctx.fillStyle = this.ink(TILE_ACTOR);
        ctx.fillRect(ax, ay, drawW, drawH);
      }
    }
  }

  draw(tiles: Uint8Array, blocked: boolean, mapOnly = false): void {
    const t = this.scale;
    const ctx = this.ctx;

    this.restamp();
    // Painted behind everything, so the parts a tile leaves transparent -- the
    // sky between two platforms, the gaps in a ladder -- show the world, not
    // whatever was on the canvas last frame.
    ctx.fillStyle = this.tiles().ground;
    ctx.fillRect(0, 0, t * GRID_W, t * GRID_H);
    this.paintClouds(ctx, t);

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        let tile = tiles[y * GRID_W + x] as number;
        if (tile === TILE_VOID) continue;
        // In a moving frame the actors are drawn afterwards at their real
        // positions, so their tiles are just floor here.
        tile = standingOn(tile, mapOnly, this.under, y * GRID_W + x);

        // Treasure is a diamond, not a square: shape carries the difference
        // from the actor even when the tiles are tiny or the screen is dim.
        //
        // And it SPINS -- narrow, gone edge-on, wide again, the way a coin does
        // in every game a child has ever seen. It is the only thing on a
        // top-down screen that moves when nothing else is happening, which is
        // what makes a still room look like a place rather than a picture.
        //
        // Each one starts at its own point in the turn, from its cell number,
        // so a row of them ripples instead of pulsing in lockstep.
        if (tile === TILE_TREASURE) {
          this.paintUnder(x, y);
          this.stampGems(t);
          // Which way it is facing, in three steps rather than as a smooth
          // narrowing: the era had no tweening, and the snap between poses is
          // what reads as turning. Each gem starts at its own point in the
          // cycle from its cell number, so a row of them ripples.
          //
          // Frozen face-on when nothing is animating, so the level editor
          // never draws one as a sliver.
          const turn = this.spinning
            ? gemFrame(y * GRID_W + x, this.gemStamps.length)
            : 0;
          const gem = this.gemStamps[turn];
          if (gem !== undefined) {
            ctx.drawImage(gem, x * t, y * t, t, t);
          } else {
            ctx.fillStyle = this.ink(TILE_TREASURE);
            ctx.fillRect(x * t + (t >> 2), y * t + (t >> 2), t >> 1, t >> 1);
          }
          continue;
        }

        // The way out. It has to say two things at a glance: this is a DOOR,
        // and it is LOCKED until you have everything.
        //
        // It used to be a square with two bars across it, which read as a
        // grating. So: a door-shaped slab standing on the floor of its tile,
        // with a handle, and a padlock hung on it while it is shut. When it
        // opens the lock goes and the doorway becomes a lit gap you can walk
        // into. A child should not have to be told which is which.
        if (tile === TILE_EXIT_LOCKED || tile === TILE_EXIT_OPEN) {
          const open = tile === TILE_EXIT_OPEN;
          this.paintUnder(x, y);
          paintInked(
            ctx,
            doorShape(this.tiles().name, open),
            doorInks(this.tiles().name, open),
            x * t,
            y * t,
            t,
          );
          continue;
        }

        // A guard is a red square with a dark eye. Square like the actor, but
        // never the actor's colour -- "am I about to touch that" has to be
        // answerable at a glance and at arm's length.
        if (tile === TILE_GUARD) {
          this.paintUnder(x, y);
          this.stampEnemies();
          const which = this.guardArt?.get(y * GRID_W + x) ?? 0;
          const still = this.enemyStamps[which]?.[0];
          if (still !== undefined) {
            const scale = artUnit(t);
            const size = SPRITE_W * scale;
            ctx.drawImage(
              still,
              x * t + Math.round((t - size) / 2),
              y * t + Math.round((t - size) / 2),
              size,
              size,
            );
            continue;
          }
          const pad = Math.max(1, Math.floor(t / 8));
          ctx.fillStyle = this.ink(TILE_GUARD);
          ctx.fillRect(x * t + pad, y * t + pad, t - pad * 2, t - pad * 2);
          continue;
        }

        // A ladder is the tileset's, and it sits ON the floor: its rungs have
        // gaps, and through them you should see the ground of the room rather
        // than whatever is behind the whole world.
        if (tile === TILE_LADDER) {
          const floor = this.floorAt(tiles, x, y);
          const rungs = this.stamps?.get(TILE_LADDER);
          if (floor !== undefined) ctx.drawImage(floor, x * t, y * t, t, t);
          if (rungs !== undefined) ctx.drawImage(rungs, x * t, y * t, t, t);
          continue;
        }

        // Fire is the tileset's too, and it stands ON the floor the same way a
        // ladder does -- its shape has gaps, and a hazard cut out of the world
        // behind it reads as a hole rather than as a thing in the room.
        if (tile === TILE_FIRE) {
          const floor = this.floorAt(tiles, x, y);
          // Water joins up. A pond's rim goes only where the water actually
          // ends, so any shape of pool is one body with one shoreline --
          // reported as "the ponds sprites should merge when joined to create
          // a bigger pool rather than a several little pools".
          //
          // Read off the NEIGHBOURING TILES, the same way a lone wall becomes
          // a tree, so it costs the wire format nothing.
          if (this.ponds.size > 0) {
            const pool = this.ponds.get(openSides(tiles, x, y));
            if (floor !== undefined) ctx.drawImage(floor, x * t, y * t, t, t);
            if (pool !== undefined) {
              ctx.drawImage(pool, x * t, y * t, t, t);
              continue;
            }
          }
          // Six frames a second, and each fire starts at its own point in the
          // cycle from its cell number -- so a row of them crackles instead of
          // blinking in unison, the same trick the spinning gems use.
          //
          // Frozen on frame nothing when nothing else is animating, so the
          // level editor draws a still flame rather than whichever one it
          // happened to catch.
          const flame = this.flames.length === 0
            ? this.stamps?.get(TILE_FIRE)
            : this.flames[this.spinning ? flameFrame(y * GRID_W + x, this.flames.length) : 0];
          if (floor !== undefined) ctx.drawImage(floor, x * t, y * t, t, t);
          if (flame !== undefined) {
            ctx.drawImage(flame, x * t, y * t, t, t);
          } else {
            ctx.fillStyle = COLOUR[TILE_FIRE] as string;
            ctx.fillRect(x * t, y * t, t, t);
          }
          continue;
        }

        // A current is the water itself moving, so the water goes down first
        // and the chevrons ride on top of it -- exactly as a ladder sits on
        // its floor. Cut out of nothing it would read as a hole.
        if (tile === TILE_FLOW) {
          const floor = this.floorAt(tiles, x, y);
          if (floor !== undefined) ctx.drawImage(floor, x * t, y * t, t, t);
          const dir = this.flowArt?.get(y * GRID_W + x) ?? 1;
          const arrows = this.flows[dir] ?? this.flows[1];
          if (arrows !== undefined) ctx.drawImage(arrows, x * t, y * t, t, t);
          continue;
        }

        if (tile === TILE_ACTOR) {
          this.paintUnder(x, y);

          if (this.stamp !== null && !blocked) {
            // Nearest-neighbour, whole cell. A 16x16 sprite in a 14px tile is
            // not a clean ratio, and smoothing it would turn pixel art to mud.
            ctx.drawImage(this.stamp, x * t, y * t, t, t);
            continue;
          }

          // No sprite yet, or a refused move: the day 1 square still says
          // "this is you" perfectly well.
          const pad = Math.max(1, Math.floor(t / 8));
          ctx.fillStyle = blocked ? ACTOR_BLOCKED : (this.ink(TILE_ACTOR));
          ctx.fillRect(x * t + pad, y * t + pad, t - pad * 2, t - pad * 2);
          continue;
        }

        // Terrain comes from the tileset; anything that moves or is personal
        // is still drawn by hand above.
        // A wall with open air above it is drawn differently -- grass on the
        // top of the ground rather than through the middle of it.
        const capped = tile === TILE_WALL
          && (y === 0 || (tiles[(y - 1) * GRID_W + x] as number) !== TILE_WALL);
        // A wall with nothing beside it is a tree, in the one world that draws
        // trees. Read off the neighbours rather than out of the level, which is
        // why it costs the wire format nothing at all -- see Tileset.tree.
        const alone = tile === TILE_WALL && this.tiles().tree !== undefined
          && this.wallsAround(tiles, x, y) === 0;
        // A wall, in a world that has more than one kind of them. Same idea as
        // the road below: the cell picks its own, from where it is.
        if (tile === TILE_WALL && this.towers.size > 0) {
          const building = this.towers.get(this.kindAt(x, y));
          if (building !== undefined) {
            ctx.drawImage(building, x * t, y * t, t, t);
            continue;
          }
        }

        // The floor is the one tile that can be a different DRAWING per cell:
        // in a world whose floor is a road it runs whichever way the road
        // runs. Everywhere else floorAt() hands back the one floor stamp.
        if (tile === TILE_FLOOR) {
          const ground = this.floorAt(tiles, x, y);
          if (ground !== undefined) {
            ctx.drawImage(ground, x * t, y * t, t, t);
            continue;
          }
        }
        const stamp = this.stamps?.get(
          alone ? GridRenderer.LONE_WALL : capped ? GridRenderer.WALL_TOP : tile,
        );
        if (stamp !== undefined) {
          ctx.drawImage(stamp, x * t, y * t, t, t);
          continue;
        }

        ctx.fillStyle = this.ink(tile);
        ctx.fillRect(x * t, y * t, t, t);

        // A faint dot on floor so open space reads as walkable, not empty.
        // Skipped against sky: open space there is AIR, and telling a player it
        // is walkable is the opposite of what this game needs them to know.
        if (tile === TILE_FLOOR && t >= 10 && !this.sideOn) {
          ctx.fillStyle = FLOOR_DOT;
          ctx.fillRect(x * t + (t >> 1), y * t + (t >> 1), 1, 1);
        }
      }
    }
  }
}
