// Canvas presentation. Maps tile indices to colours and nothing more.
//
// Colours here are cosmetics: they must never reach stateHash(). The real
// tileset arrives on day 7; flat squares are the day 1 presentation.

import { GRID_H, GRID_W } from "../../core/grid.ts";
import { colourFor } from "../../core/palette.ts";
import { SPRITE_H, SPRITE_W, spriteIndex, type Sprite } from "../../core/sprite.ts";
import { ONE } from "../../core/fixed.ts";
import { ENEMIES } from "../../core/enemies.ts";
import {
  TILE_PX, inkOf, tilesetFor, type Pattern, type Ramp, type Tileset,
} from "../../core/tileset.ts";
import {
  TILE_ACTOR,
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

/** Outline, face, highlight -- for each world. */
const GEM_INKS: Record<string, readonly string[]> = {
  // Rim, shadowed facet, body, lit facet, specular. A gem is not one blue and
  // a white dot -- what makes it read as CUT is that the facets disagree.
  underground: ["#062f2f", "#12807a", "#1fb3a6", "#5fe0d2", "#ffffff"],
  outside: ["#25093a", "#6b1fa8", "#9a3ad5", "#e8b6ff", "#ffffff"],
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
): HTMLCanvasElement {
  const set = tilesetFor(sideOn);
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
    : tile === TILE_TREASURE ? (GEM_FRAMES[0] as Pattern)
    : tile === TILE_EXIT_LOCKED ? (DOOR_SHUT[0] as Pattern)
    : tile === TILE_EXIT_OPEN ? (DOOR_OPEN[0] as Pattern)
    : null;

  // The ground goes down first: a ladder and a hazard both have gaps in them,
  // and a shape cut out of nothing reads as a hole rather than as a thing.
  ctx.fillStyle = sideOn ? set.ground : (COLOUR[TILE_FLOOR] as string);
  ctx.fillRect(0, 0, size, size);
  if (tile === TILE_LADDER || tile === TILE_FIRE) {
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
    const sub = tile === TILE_FIRE ? set.fireSub
      : tile === TILE_LADDER ? set.ladderSub
      : set.sub;
    // The gem and the door carry their own colours rather than the terrain's.
    const own =
      tile === TILE_TREASURE
        ? (GEM_INKS[set.name] ?? GEM_INKS.underground)
        : tile === TILE_EXIT_LOCKED ? DOOR_INKS.shut
        : tile === TILE_EXIT_OPEN ? DOOR_INKS.open
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
  /**
   * The stamp key for a wall with open sky above it.
   *
   * Not a tile index -- no engine ever emits it and none may (hard rule 5).
   * It is a second DRAWING of the same tile, chosen by what is next to it.
   */
  private static readonly WALL_TOP = -1;
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

  /** Side-on levels are painted against sky. Cosmetic; see SKY above. */
  setSideOn(sideOn: boolean): void {
    this.sideOn = sideOn;
  }

  /** One stamp per flame frame, in order. Empty until the stamps are built. */
  private flames: HTMLCanvasElement[] = [];

  /**
   * Put the clouds up, behind everything.
   *
   * Skipped below a two-pixel step: a thumbnail draws its whole world at four
   * pixels a tile, and a cloud there is three grey pixels that read as dirt.
   */
  private paintClouds(ctx: CanvasRenderingContext2D, t: number): void {
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
    return tilesetFor(this.sideOn);
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
      [TILE_FLOOR, set.floor, set.sub],
      [TILE_LADDER, set.ladder, set.ladderSub],
      [TILE_FIRE, set.fire, set.fireSub],
    ];

    // Fire gets one stamp per frame. Everything else gets one.
    const frames = set.fireFrames ?? [set.fire];
    const flames: HTMLCanvasElement[] = [];

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
  private paintUnder(x: number, y: number): void {
    const t = this.scale;
    const floor = this.stamps?.get(TILE_FLOOR);
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

  /** One stamp per gem frame, per world. Rebuilt when the tile size changes. */
  private gemStamps: HTMLCanvasElement[] = [];
  private gemStampedAt = -1;
  private gemStampedSet = "";

  private stampGems(t: number): void {
    const set = this.tiles();
    if (this.gemStampedAt === t && this.gemStampedSet === set.name) return;
    const inks = GEM_INKS[set.name] ?? (GEM_INKS.underground as readonly string[]);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.gemStamps = GEM_FRAMES.map((frame) => {
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

  private stampEnemies(): void {
    if (this.enemyStamps.length > 0) return;
    this.enemyStamps = ENEMIES.map((one) =>
      one.frames.map((frame) => {
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
            const ink = one.inks[ch.charCodeAt(0) - 49];
            if (ink === undefined) continue;
            ctx.fillStyle = ink;
            ctx.fillRect(x, y, 1, 1);
          }
        }
        return stamp;
      })
    );
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
  setGuardArt(art: ReadonlyMap<number, number> | null): void {
    this.guardArt = art;
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

      const art = this.enemyStamps[enemy.art ?? 0] ?? this.enemyStamps[0];
      const stamp = art?.[frame];

      // A one-pixel bob on the walk beat, which is the era's whole vocabulary
      // for "this thing is alive". One pixel: any more and it hops.
      const bob = enemy.stunned || frame === 0 ? 0 : 1;
      const top = foot - size + bob;

      if (stamp !== undefined) {
        // Stunned reads as flickering white, and frozen as ice: "not moving" is
        // not a signal, because a guard at the end of its patrol is not moving
        // either. A child has to tell at a glance which ones cannot touch them.
        const flickering = enemy.stunned && (Date.now() >> 7) % 2 === 0;
        if (enemy.stunned) {
          ctx.globalAlpha = flickering ? 0.35 : 0.75;
        } else if (enemy.chasing) {
          // Chasing is a state worth shouting about, and a tint is the one
          // thing that can say it without a second set of drawings.
          ctx.globalAlpha = 0.92;
        }
        ctx.drawImage(stamp, left, top, size, size);
        ctx.globalAlpha = 1;

        if (enemy.stunned && flickering) {
          ctx.fillStyle = this.weapon === "wand" ? "#7fd8ee" : "#ffffff";
          ctx.globalAlpha = 0.5;
          ctx.fillRect(left, top, size, size);
          ctx.globalAlpha = 1;
        }
        if (enemy.chasing) {
          ctx.fillStyle = "#ff8a3d";
          ctx.globalAlpha = 0.28;
          ctx.fillRect(left, top, size, size);
          ctx.globalAlpha = 1;
        }
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
      const angle = base - sweep / 2 + sweep * done;

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

      if (this.weapon === "wand") {
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
        if (mapOnly && (tile === TILE_ACTOR || tile === TILE_GUARD || tile === TILE_GUARD_REELING)) {
          tile = TILE_FLOOR;
        }

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
            ? gemFrame(y * GRID_W + x, GEM_FRAMES.length)
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
            (open ? DOOR_OPEN[0] : DOOR_SHUT[0]) as Pattern,
            (open ? DOOR_INKS.open : DOOR_INKS.shut) as readonly string[],
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
          const floor = this.stamps?.get(TILE_FLOOR);
          const rungs = this.stamps?.get(TILE_LADDER);
          if (floor !== undefined) ctx.drawImage(floor, x * t, y * t, t, t);
          if (rungs !== undefined) ctx.drawImage(rungs, x * t, y * t, t, t);
          continue;
        }

        // Fire is the tileset's too, and it stands ON the floor the same way a
        // ladder does -- its shape has gaps, and a hazard cut out of the world
        // behind it reads as a hole rather than as a thing in the room.
        if (tile === TILE_FIRE) {
          const floor = this.stamps?.get(TILE_FLOOR);
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
        const stamp = this.stamps?.get(capped ? GridRenderer.WALL_TOP : tile);
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
