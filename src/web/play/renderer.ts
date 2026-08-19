// Canvas presentation. Maps tile indices to colours and nothing more.
//
// Colours here are cosmetics: they must never reach stateHash(). The real
// tileset arrives on day 7; flat squares are the day 1 presentation.

import { GRID_H, GRID_W } from "../../core/grid.ts";
import {
  TILE_ACTOR,
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
};

const ACTOR_BLOCKED = "#ff5f4d";
const FLOOR_DOT = "#222a35";

export class GridRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (ctx === null) throw new Error("canvas 2d context unavailable");
    this.ctx = ctx;
  }

  /** Pick the largest whole-pixel tile size that fits the space we're given. */
  fit(availableWidth: number, availableHeight: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const tile = Math.max(6, Math.floor(Math.min(availableWidth / GRID_W, availableHeight / GRID_H)));
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

  draw(tiles: Uint8Array, blocked: boolean): void {
    const t = this.scale;
    const ctx = this.ctx;

    ctx.fillStyle = COLOUR[TILE_VOID] as string;
    ctx.fillRect(0, 0, t * GRID_W, t * GRID_H);

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const tile = tiles[y * GRID_W + x] as number;
        if (tile === TILE_VOID) continue;

        // Treasure is a diamond, not a square: shape carries the difference
        // from the actor even when the tiles are tiny or the screen is dim.
        if (tile === TILE_TREASURE) {
          ctx.fillStyle = COLOUR[TILE_FLOOR] as string;
          ctx.fillRect(x * t, y * t, t, t);
          const cx = x * t + t / 2;
          const cy = y * t + t / 2;
          const r = Math.max(2, (t / 2) - Math.max(1, Math.floor(t / 5)));
          ctx.fillStyle = COLOUR[TILE_TREASURE] as string;
          ctx.beginPath();
          ctx.moveTo(cx, cy - r);
          ctx.lineTo(cx + r, cy);
          ctx.lineTo(cx, cy + r);
          ctx.lineTo(cx - r, cy);
          ctx.closePath();
          ctx.fill();
          continue;
        }

        // A shut exit is a barred doorway; an open one glows and the bars are
        // gone. The difference has to be obvious from across a room.
        if (tile === TILE_EXIT_LOCKED || tile === TILE_EXIT_OPEN) {
          const open = tile === TILE_EXIT_OPEN;
          ctx.fillStyle = COLOUR[tile] as string;
          ctx.fillRect(x * t, y * t, t, t);
          const inset = Math.max(1, Math.floor(t / 5));
          ctx.fillStyle = COLOUR[TILE_VOID] as string;
          if (open) {
            // A way through.
            ctx.fillRect(x * t + inset, y * t + inset, t - inset * 2, t - inset * 2);
          } else if (t >= 10) {
            // Two bars across the doorway.
            const bar = Math.max(1, Math.floor(t / 8));
            ctx.fillRect(x * t + inset, y * t + Math.floor(t / 3), t - inset * 2, bar);
            ctx.fillRect(x * t + inset, y * t + Math.floor((t * 2) / 3), t - inset * 2, bar);
          }
          continue;
        }

        // A guard is a red square with a dark eye. Square like the actor, but
        // never the actor's colour -- "am I about to touch that" has to be
        // answerable at a glance and at arm's length.
        if (tile === TILE_GUARD) {
          ctx.fillStyle = COLOUR[TILE_FLOOR] as string;
          ctx.fillRect(x * t, y * t, t, t);
          const pad = Math.max(1, Math.floor(t / 8));
          ctx.fillStyle = COLOUR[TILE_GUARD] as string;
          ctx.fillRect(x * t + pad, y * t + pad, t - pad * 2, t - pad * 2);
          if (t >= 10) {
            const eye = Math.max(1, Math.floor(t / 5));
            ctx.fillStyle = COLOUR[TILE_VOID] as string;
            ctx.fillRect(
              x * t + ((t - eye) >> 1),
              y * t + ((t - eye) >> 1),
              eye,
              eye,
            );
          }
          continue;
        }

        if (tile === TILE_ACTOR) {
          // The actor sits inset so you can see which cell it occupies.
          ctx.fillStyle = COLOUR[TILE_FLOOR] as string;
          ctx.fillRect(x * t, y * t, t, t);
          const pad = Math.max(1, Math.floor(t / 8));
          ctx.fillStyle = blocked ? ACTOR_BLOCKED : (COLOUR[TILE_ACTOR] as string);
          ctx.fillRect(x * t + pad, y * t + pad, t - pad * 2, t - pad * 2);
          continue;
        }

        ctx.fillStyle = COLOUR[tile] ?? (COLOUR[TILE_VOID] as string);
        ctx.fillRect(x * t, y * t, t, t);

        // A faint dot on floor so open space reads as walkable, not empty.
        if (tile === TILE_FLOOR && t >= 10) {
          ctx.fillStyle = FLOOR_DOT;
          ctx.fillRect(x * t + (t >> 1), y * t + (t >> 1), 1, 1);
        }
      }
    }
  }
}
