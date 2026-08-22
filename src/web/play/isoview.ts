// The spike's canvas half: the city drawn as blocks. See ./iso.ts for why this
// is allowed to exist and what it is not allowed to touch.
//
// A separate class rather than a mode on GridRenderer, deliberately. The flat
// renderer is two thousand lines that every world and both pages depend on, and
// a spike that reaches into it is a spike you cannot delete on Monday. This one
// borrows the same canvas and nothing else, and removing it is removing a file.
//
// 2D canvas, not WebGL. Isometric blocks are painter's-algorithm quads, which
// this project can already draw -- and WebGL would cost the two properties the
// game is built on: zero runtime dependencies, and integer-scaled pixel art
// with smoothing off.

import { GRID_W } from "../../core/grid.ts";
import {
  TILE_ACTOR, TILE_EXIT_LOCKED, TILE_EXIT_OPEN, TILE_FIRE, TILE_FLOOR,
  TILE_GUARD, TILE_GUARD_REELING, TILE_TREASURE, TILE_WALL,
} from "../../core/tiles.ts";
import { tilesetFor, type Tileset } from "../../core/tileset.ts";
import { PALETTE } from "../../core/palette.ts";
import { ONE } from "../../core/fixed.ts";
import {
  BLOCK_H, ISO_H, ISO_W, backToFront, isoHeight, isoWidth, isoX, isoY,
  inTheWay, originX, originY, towerHeight,
} from "./iso.ts";

/** A moving thing to stand on the ground plane, in engine sub-cell units. */
export interface IsoActor {
  readonly x: number;
  readonly y: number;
}

/**
 * Light comes from the left, always.
 *
 * One rule for every face in the picture: the top is what the sun hits, the
 * left face catches some of it, the right face is in shadow. Getting this
 * wrong -- lighting each block from wherever suited it -- is what makes an
 * isometric scene look like stickers rather than like a place.
 */
const TOP = 1;
const LEFT = 0.72;
const RIGHT = 0.5;

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((n >>> 16) & 0xff) * amount);
  const g = Math.round(((n >>> 8) & 0xff) * amount);
  const b = Math.round((n & 0xff) * amount);
  return `rgb(${r},${g},${b})`;
}

export class IsoView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private world: Tileset;

  constructor(canvas: HTMLCanvasElement, engine: string, tilesetId: number) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("canvas 2d context unavailable");
    this.ctx = ctx;
    this.world = tilesetFor(false, engine, tilesetId);
  }

  setWorld(engine: string, tilesetId: number): void {
    this.world = tilesetFor(false, engine, tilesetId);
  }

  /** Whole-pixel scales only, same discipline as the flat renderer. */
  fit(availableWidth: number, availableHeight: number): void {
    const scale = Math.max(1, Math.floor(Math.min(
      availableWidth / isoWidth(),
      availableHeight / isoHeight(),
    )));
    this.scale = scale;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = isoWidth() * scale;
    const cssH = isoHeight() * scale;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * A colour per tile, for the spike only.
   *
   * The real thing would stamp the WORLD'S OWN ART onto the three faces -- the
   * tower drawings, the road pieces, the little people -- and that is most of
   * the work a real version would be. Flat faces are here to answer the cheap
   * question first: does the shape of a city read better standing up? If the
   * answer is no, none of that art ever has to be drawn.
   *
   * Pulled off the world's own ramps rather than typed in, so even the spike
   * cannot drift away from what the city looks like.
   */
  private ink(tile: number): string {
    const ramp = (which: readonly number[] | undefined, step: number, fallback: string): string =>
      (which === undefined ? undefined : PALETTE[which[step] as number]) ?? fallback;
    if (tile === TILE_WALL) return ramp(this.world.sub, 3, "#7c8899");
    if (tile === TILE_FLOOR) return ramp(this.world.sub, 1, "#1a212b");
    if (tile === TILE_FIRE) return ramp(this.world.fireSub, 3, "#ff9f3d");
    if (tile === TILE_TREASURE) return "#b6dcff";
    if (tile === TILE_EXIT_OPEN) return "#2fae42";
    if (tile === TILE_EXIT_LOCKED) return "#4a5c6f";
    if (tile === TILE_GUARD_REELING) return "#9a3ad5";
    if (tile === TILE_GUARD) return "#d82f42";
    return "#5fe0d2";
  }

  private diamond(cx: number, cy: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ISO_H / 2);
    ctx.lineTo(cx + ISO_W / 2, cy);
    ctx.lineTo(cx, cy + ISO_H / 2);
    ctx.lineTo(cx - ISO_W / 2, cy);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * A block: the two faces you can see, then the lid.
   *
   * The lid goes UP from the ground, not down from it. Drawn the other way
   * round first, and the whole city came out as pits sunk into a slab -- which
   * is a good demonstration of why a spike gets looked at rather than reasoned
   * about. `cy` is where the cell meets the ground; the top face sits a tower's
   * height above it and the two visible faces hang between them.
   */
  private block(cx: number, cy: number, tall: number, hex: string): void {
    const ctx = this.ctx;
    const rise = tall * BLOCK_H;
    const ty = cy - rise;

    ctx.fillStyle = shade(hex, LEFT);
    ctx.beginPath();
    ctx.moveTo(cx - ISO_W / 2, ty);
    ctx.lineTo(cx, ty + ISO_H / 2);
    ctx.lineTo(cx, ty + ISO_H / 2 + rise);
    ctx.lineTo(cx - ISO_W / 2, ty + rise);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shade(hex, RIGHT);
    ctx.beginPath();
    ctx.moveTo(cx + ISO_W / 2, ty);
    ctx.lineTo(cx, ty + ISO_H / 2);
    ctx.lineTo(cx, ty + ISO_H / 2 + rise);
    ctx.lineTo(cx + ISO_W / 2, ty + rise);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shade(hex, TOP);
    this.diamond(cx, ty);

    // Lit windows down the two faces we can see, one row per floor. Not
    // decoration: a flat-shaded box at this size reads as a crate, and a grid
    // of little lights is the whole difference between a crate and a building
    // at night.
    ctx.fillStyle = "rgba(255,194,61,.85)";
    for (let floor = 0; floor < tall; floor = (floor + 1) | 0) {
      const top = ty + ISO_H / 2 + floor * BLOCK_H + 2;
      ctx.fillRect(cx - 6, top + 1, 2, 3);
      ctx.fillRect(cx - 3, top + 2, 2, 3);
      ctx.fillRect(cx + 2, top + 2, 2, 3);
      ctx.fillRect(cx + 5, top + 1, 2, 3);
    }
  }

  /**
   * A flat thing standing on the ground: a gem, a flame, a creature.
   *
   * Billboarded, which is what every isometric game has always done with the
   * things that move. Drawn at the cell's own depth so the sort puts it in
   * front of what is behind it and behind what is in front.
   */
  private standing(cx: number, cy: number, hex: string, tall = 10, wide = 8): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,.28)";
    this.diamond(cx, cy);
    ctx.fillStyle = hex;
    ctx.fillRect(Math.round(cx - wide / 2), Math.round(cy - tall), wide, tall);
    ctx.fillStyle = shade(hex, 1.25);
    ctx.fillRect(Math.round(cx - wide / 2), Math.round(cy - tall), wide, 2);
  }

  /**
   * One frame.
   *
   * `tiles` is exactly what the engine emitted -- no engine knows this file
   * exists -- and the actor and the enemies come in at their sub-cell
   * positions, the same ones the flat renderer draws from.
   */
  draw(tiles: Uint8Array, actor: IsoActor | null, enemies: readonly IsoActor[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.world.ground;
    ctx.fillRect(0, 0, isoWidth(), isoHeight());

    const ox = originX();
    const oy = originY();
    const at = (x: number, y: number, z = 0): readonly [number, number] =>
      [ox + isoX(x, y), oy + isoY(x, y, z)];

    // Anything standing on a cell, by cell, so the sort can place it.
    const standers = new Map<number, string[]>();
    const put = (cx: number, cy: number, hex: string): void => {
      const key = cy * GRID_W + cx;
      const had = standers.get(key);
      if (had === undefined) standers.set(key, [hex]);
      else had.push(hex);
    };
    for (const one of enemies) put(cellOf(one.x), cellOf(one.y), this.ink(TILE_GUARD));
    if (actor !== null) put(cellOf(actor.x), cellOf(actor.y), this.ink(TILE_ACTOR));

    for (const [x, y] of backToFront()) {
      const tile = tiles[y * GRID_W + x] as number;
      const [cx, cy] = at(x, y);

      if (tile === TILE_WALL) {
        // See-through where it would bury the player. Without this the city
        // is beautiful and unplayable -- see inTheWay().
        const hiding = actor !== null
          && inTheWay(x, y, cellOf(actor.x), cellOf(actor.y));
        if (hiding) ctx.globalAlpha = 0.34;
        this.block(cx, cy, towerHeight(tiles, x, y), this.ink(TILE_WALL));
        ctx.globalAlpha = 1;
        continue;
      }

      // Everything else stands on the street, so the street goes down first.
      ctx.fillStyle = shade(this.ink(TILE_FLOOR), TOP);
      this.diamond(cx, cy);

      if (tile === TILE_TREASURE) this.standing(cx, cy, this.ink(TILE_TREASURE), 9, 6);
      else if (tile === TILE_FIRE) this.standing(cx, cy, this.ink(TILE_FIRE), 11, 7);
      else if (tile === TILE_EXIT_LOCKED) this.standing(cx, cy, this.ink(TILE_EXIT_LOCKED), 4, 12);
      else if (tile === TILE_EXIT_OPEN) this.standing(cx, cy, this.ink(TILE_EXIT_OPEN), 4, 12);
      else if (tile === TILE_GUARD || tile === TILE_GUARD_REELING) {
        this.standing(cx, cy, this.ink(tile), 12, 8);
      }

      for (const hex of standers.get(y * GRID_W + x) ?? []) this.standing(cx, cy, hex, 12, 8);
    }
  }
}

function cellOf(value: number): number {
  return Math.max(0, Math.floor(value / ONE));
}
