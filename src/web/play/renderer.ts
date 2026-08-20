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

  /** Turn the spinning treasure off, for a view that is not redrawn each frame. */
  setSpinning(spinning: boolean): void {
    this.spinning = spinning;
  }

  /** The colour for a tile, in whichever world this level is. */
  private ink(tile: number): string {
    if (this.sideOn) {
      const sky = SKY[tile];
      if (sky !== undefined) return sky;
    }
    return COLOUR[tile] ?? (COLOUR[TILE_VOID] as string);
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

      // A WADDLE, driven by where it is rather than by a clock: the phase comes
      // from its own position, so it bounces as it walks and stands still when
      // it stands still. A timer would have it jogging on the spot at the end
      // of its patrol, which reads as agitated rather than bored.
      //
      // Chasing, it bounces faster and higher. That is a second way of saying
      // "this one has seen you", for a child who has not noticed the colour.
      const travelled = (enemy.x + enemy.y) / ONE;
      const beat = enemy.chasing ? 2.6 : 1.6;
      const wave = enemy.stunned ? 0 : Math.sin(travelled * beat * Math.PI);
      const lift = enemy.chasing ? 0.16 : 0.1;

      // Squashed at the bottom of the bounce, stretched at the top, the way
      // anything with legs looks when it is moving.
      const squash = 1 - wave * 0.12;
      const drawW = size * squash;
      const drawH = size / squash;
      const x = px(enemy.x) - drawW / 2;
      // Feet on the ground, so the bounce lifts it rather than sinking it.
      const foot = px(enemy.y) + size / 2;
      const y = foot - drawH - Math.abs(wave) * size * lift;

      // A wand freezes rather than stuns, and it should look like it: ice, not
      // seeing stars. Same state underneath -- this is only how it is drawn.
      const downColour = this.weapon === "wand" ? "#7fd8ee" : "#7a5c86";
      // ...and it FLICKERS. "Not moving" is not a signal -- a guard at the end
      // of its patrol is not moving either. A child has to be able to tell at a
      // glance which ones cannot touch them, without waiting to see if it walks.
      const flickering = enemy.stunned && (Date.now() >> 7) % 2 === 0;
      ctx.fillStyle = enemy.stunned
        ? (flickering ? "#ffffff" : downColour)
        : enemy.chasing ? "#ff8a3d" : (this.ink(TILE_GUARD));
      ctx.fillRect(x, y, drawW, drawH);

      if (t >= 10 && !enemy.stunned) {
        // Two eyes, and they LOOK AT YOU once it is chasing. Being watched is
        // the thing a child needs to feel, and a pair of eyes swinging round
        // says it before any colour does.
        const eye = Math.max(1, Math.round(size / 5));
        const gap = Math.max(1, Math.round(size / 5));
        let gazeX = 0;
        let gazeY = 0;
        if (enemy.chasing) {
          const dx = actor.x - enemy.x;
          const dy = actor.y - enemy.y;
          const far = Math.max(1, Math.hypot(dx, dy));
          gazeX = (dx / far) * eye * 0.6;
          gazeY = (dy / far) * eye * 0.6;
        }
        const midX = x + drawW / 2;
        const midY = y + drawH * 0.42;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(midX - gap - eye / 2, midY - eye / 2, eye, eye);
        ctx.fillRect(midX + gap - eye / 2, midY - eye / 2, eye, eye);
        const pupil = Math.max(1, Math.round(eye / 2));
        ctx.fillStyle = this.ink(TILE_VOID);
        ctx.fillRect(midX - gap - pupil / 2 + gazeX, midY - pupil / 2 + gazeY, pupil, pupil);
        ctx.fillRect(midX + gap - pupil / 2 + gazeX, midY - pupil / 2 + gazeY, pupil, pupil);
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

    ctx.fillStyle = this.ink(TILE_VOID);
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
        //
        // And it SPINS -- narrow, gone edge-on, wide again, the way a coin does
        // in every game a child has ever seen. It is the only thing on a
        // top-down screen that moves when nothing else is happening, which is
        // what makes a still room look like a place rather than a picture.
        //
        // Each one starts at its own point in the turn, from its cell number,
        // so a row of them ripples instead of pulsing in lockstep.
        if (tile === TILE_TREASURE) {
          ctx.fillStyle = this.ink(TILE_FLOOR);
          ctx.fillRect(x * t, y * t, t, t);
          const cx = x * t + t / 2;
          const cy = y * t + t / 2;
          const r = Math.max(2, (t / 2) - Math.max(1, Math.floor(t / 5)));

          // A full turn every 1.6 seconds. Frozen mid-face when nothing is
          // animating, so the level editor never draws one as a sliver.
          const phase = this.spinning
            ? ((Date.now() / 1600) + (y * GRID_W + x) * 0.13) * Math.PI * 2
            : 0;
          const wide = Math.abs(Math.cos(phase));
          // Never quite vanishes: a gem you cannot see is a gem you cannot find.
          const rx = Math.max(1, r * wide);

          // Edge-on it catches less light, which is what sells the turn.
          ctx.fillStyle = wide > 0.35 ? this.ink(TILE_TREASURE) : "#3fa7c9";
          ctx.beginPath();
          ctx.moveTo(cx, cy - r);
          ctx.lineTo(cx + rx, cy);
          ctx.lineTo(cx, cy + r);
          ctx.lineTo(cx - rx, cy);
          ctx.closePath();
          ctx.fill();
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
          const left = x * t;
          const top = y * t;

          ctx.fillStyle = this.ink(TILE_FLOOR);
          ctx.fillRect(left, top, t, t);

          // The doorway: taller than it is wide, and standing on the ground.
          const pad = Math.max(1, Math.round(t * 0.14));
          const dx = left + pad;
          const dy = top + Math.max(1, Math.round(t * 0.08));
          const dw = t - pad * 2;
          const dh = t - (dy - top);

          ctx.fillStyle = open ? "#6fe08a" : "#8a6f9e";
          ctx.fillRect(dx, dy, dw, dh);

          if (open) {
            // A lit way through, so it reads as somewhere to walk rather than
            // as a green door you still have to open.
            const inset = Math.max(1, Math.round(t * 0.16));
            ctx.fillStyle = "#d8ffe6";
            ctx.fillRect(dx + inset, dy + inset, dw - inset * 2, dh - inset);
          } else {
            // Panelling, so it is a door and not a coloured block.
            ctx.fillStyle = "#6f5681";
            const gap = Math.max(1, Math.round(t * 0.1));
            ctx.fillRect(dx + gap, dy + gap, dw - gap * 2, Math.max(1, Math.round(t * 0.06)));

            if (t >= 12) {
              // The padlock. A shackle on top of a body, in brass, because a
              // lock is the one shape everybody already reads as "shut".
              const bodyW = Math.max(3, Math.round(t * 0.34));
              const bodyH = Math.max(3, Math.round(t * 0.26));
              const bx = left + Math.round((t - bodyW) / 2);
              const by = top + Math.round(t * 0.44);
              const ring = Math.max(1, Math.round(t * 0.08));

              ctx.strokeStyle = "#ffc23d";
              ctx.lineWidth = ring;
              ctx.beginPath();
              ctx.arc(left + t / 2, by, Math.max(2, bodyW * 0.32), Math.PI, 0);
              ctx.stroke();

              ctx.fillStyle = "#ffc23d";
              ctx.fillRect(bx, by, bodyW, bodyH);
              ctx.fillStyle = "#6f5681";
              ctx.fillRect(
                left + Math.round(t / 2) - Math.max(1, Math.round(ring / 2)),
                by + Math.round(bodyH * 0.3),
                Math.max(1, ring),
                Math.max(1, Math.round(bodyH * 0.45)),
              );
            } else {
              // Too small for a lock; a brass bar still says "shut".
              ctx.fillStyle = "#ffc23d";
              ctx.fillRect(dx, top + Math.round(t * 0.5), dw, Math.max(1, Math.round(t * 0.16)));
            }
          }
          continue;
        }

        // A guard is a red square with a dark eye. Square like the actor, but
        // never the actor's colour -- "am I about to touch that" has to be
        // answerable at a glance and at arm's length.
        if (tile === TILE_GUARD) {
          ctx.fillStyle = this.ink(TILE_FLOOR);
          ctx.fillRect(x * t, y * t, t, t);
          const pad = Math.max(1, Math.floor(t / 8));
          ctx.fillStyle = this.ink(TILE_GUARD);
          ctx.fillRect(x * t + pad, y * t + pad, t - pad * 2, t - pad * 2);
          if (t >= 10) {
            const eye = Math.max(1, Math.floor(t / 5));
            ctx.fillStyle = this.ink(TILE_VOID);
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
          ctx.fillStyle = this.ink(TILE_FLOOR);
          ctx.fillRect(x * t, y * t, t, t);
          const rail = Math.max(1, Math.floor(t / 8));
          const inset = Math.max(1, Math.floor(t / 5));
          ctx.fillStyle = this.ink(TILE_LADDER);
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
          ctx.fillStyle = this.ink(TILE_FLOOR);
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
          ctx.fillStyle = blocked ? ACTOR_BLOCKED : (this.ink(TILE_ACTOR));
          ctx.fillRect(x * t + pad, y * t + pad, t - pad * 2, t - pad * 2);
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
