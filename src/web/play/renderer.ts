// Canvas presentation. Maps tile indices to colours and nothing more.
//
// Colours here are cosmetics: they must never reach stateHash(). The real
// tileset arrives on day 7; flat squares are the day 1 presentation.

import { GRID_H, GRID_W } from "../../core/grid.ts";
import { colourFor } from "../../core/palette.ts";
import { SPRITE_H, SPRITE_W, spriteIndex, type Sprite } from "../../core/sprite.ts";
import { ONE } from "../../core/fixed.ts";
import {
  TILE_ACTOR,
  TILE_GUARD_REELING,
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
  private stamp: HTMLCanvasElement | null = null;

  /**
   * Set the sprite to draw the actor with. Re-stamped to an offscreen canvas
   * once per change rather than per frame: 256 fillRects every repaint is the
   * difference between smooth and not on a cheap phone.
   */
  setWeapon(weapon: string): void {
    this.weapon = weapon;
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
    },
    enemies: ReadonlyArray<{ x: number; y: number; stunned: boolean; chasing: boolean }>,
    reach: number,
  ): void {
    // Draw the map with the moving things left out; they go on top, in between
    // the squares.
    this.draw(tiles, false, true);

    const t = this.scale;
    const ctx = this.ctx;
    const px = (value: number) => (value * t) / ONE;

    for (const enemy of enemies) {
      const size = Math.max(4, Math.floor(t * 0.72));
      const x = px(enemy.x) - size / 2;
      const y = px(enemy.y) - size / 2;
      // A wand freezes rather than stuns, and it should look like it: ice, not
      // seeing stars. Same state underneath -- this is only how it is drawn.
      const downColour = this.weapon === "wand" ? "#7fd8ee" : "#7a5c86";
      // ...and it FLICKERS. "Not moving" is not a signal -- a guard at the end
      // of its patrol is not moving either. A child has to be able to tell at a
      // glance which ones cannot touch them, without waiting to see if it walks.
      const flickering = enemy.stunned && (Date.now() >> 7) % 2 === 0;
      ctx.fillStyle = enemy.stunned
        ? (flickering ? "#ffffff" : downColour)
        : enemy.chasing ? "#ff8a3d" : (COLOUR[TILE_GUARD] as string);
      ctx.fillRect(x, y, size, size);
      if (t >= 10 && !enemy.stunned) {
        // An eye, pointing the way it is coming.
        const eye = Math.max(1, Math.floor(size / 4));
        ctx.fillStyle = COLOUR[TILE_VOID] as string;
        ctx.fillRect(x + size / 2 - eye / 2, y + size / 2 - eye / 2, eye, eye);
      }
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
      // The arc turns about a point ABOVE the body's centre -- roughly where a
      // hand would be, not where the legs are. Swung from the centre, the
      // downward part of the sweep came out from between them.
      const cy = px(actor.y) - t * 0.22;
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
    const ax = px(actor.x) - size / 2;
    const ay = px(actor.y) - size / 2;
    // Blink while the mercy window is open, the way every game of this shape does.
    if (!actor.blinking || (Date.now() >> 6) % 2 === 0) {
      if (this.stamp !== null) {
        ctx.drawImage(this.stamp, ax, ay, size, size);
      } else {
        ctx.fillStyle = COLOUR[TILE_ACTOR] as string;
        ctx.fillRect(ax, ay, size, size);
      }
    }
  }

  draw(tiles: Uint8Array, blocked: boolean, mapOnly = false): void {
    const t = this.scale;
    const ctx = this.ctx;

    ctx.fillStyle = COLOUR[TILE_VOID] as string;
    ctx.fillRect(0, 0, t * GRID_W, t * GRID_H);

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

        // A ladder: two rails and rungs, so it reads as climbable rather than
        // as a differently-coloured wall.
        if (tile === TILE_LADDER) {
          ctx.fillStyle = COLOUR[TILE_FLOOR] as string;
          ctx.fillRect(x * t, y * t, t, t);
          const rail = Math.max(1, Math.floor(t / 8));
          const inset = Math.max(1, Math.floor(t / 5));
          ctx.fillStyle = COLOUR[TILE_LADDER] as string;
          ctx.fillRect(x * t + inset, y * t, rail, t);
          ctx.fillRect(x * t + t - inset - rail, y * t, rail, t);
          if (t >= 8) {
            const rungs = 2;
            for (let r = 0; r < rungs; r++) {
              const ry = y * t + Math.floor((t * (r * 2 + 1)) / (rungs * 2));
              ctx.fillRect(x * t + inset, ry, t - inset * 2, rail);
            }
          }
          continue;
        }

        if (tile === TILE_ACTOR) {
          ctx.fillStyle = COLOUR[TILE_FLOOR] as string;
          ctx.fillRect(x * t, y * t, t, t);

          if (this.stamp !== null && !blocked) {
            // Nearest-neighbour, whole cell. A 16x16 sprite in a 14px tile is
            // not a clean ratio, and smoothing it would turn pixel art to mud.
            ctx.drawImage(this.stamp, x * t, y * t, t, t);
            continue;
          }

          // No sprite yet, or a refused move: the day 1 square still says
          // "this is you" perfectly well.
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
