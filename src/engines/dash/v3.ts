// Dash, behaviour version 3.
//
// v3 gives the side-on game the weapon. In v1 and v2 the only answer to an
// enemy was landing on it, so a creature's sword or wand -- a real choice since
// roam/3 -- did nothing at all in half the game. Strength carries between
// engines and speed carries between engines; the weapon should too, and a child
// who picked a wand should be able to see it. See docs/adr/0019.
//
// Stomping still works. Both are answers to an enemy, and they cost different
// things: landing on one needs you above it, swinging needs you beside it.
//
// v2 exists because v1's weakest jump was two subcells short of a single step.
// A creature with no strength could not climb anything at all, so spending the
// whole budget on speed quietly made half the side-on levels unplayable -- a
// trap a child had no way to see coming. See docs/adr/0018.
//
// v1 is untouched and still shipped: hard rule 3, and every link that pinned
// dash/1 still replays exactly as it did.
//
// (v1's own header follows.)
//
// Dash, behaviour version 1. From the side, one screen, the way the original
// Donkey Kong works.
//
// Single screen is the whole point. A scrolling platformer needs levels
// thousands of cells wide, which would break the 24x14 grid, the codec, the
// ~80-character link and the phone level editor all at once. Donkey Kong fits
// on one screen and so does this -- see docs/adr/0009.
//
// Same ticks, same fixed point, same links as Roam. The only real difference
// underneath is that here everything falls.
//
// What the creature's four characteristics do:
//
//   * speed    -- how fast you run, and how far a jump carries
//   * strength -- how high you jump
//   * nerve    -- how many hits you can take
//   * reach    -- how far you can grab treasure without standing on it
//
// You beat an enemy by landing on it, which is the one platformer verb every
// child already knows. There is no sword down here.
//
// NEVER edit this file's behaviour in place. Add v2.ts.

import { hashInit, hashInt32 } from "../../core/hash.ts";
import { GRID_H, GRID_W, idx } from "../../core/grid.ts";
import { isLadder, isWall, type Level } from "../../core/level.ts";
import { BRUK, type Creature } from "../../core/creature.ts";
import { ONE, cellCentre, chebyshev, clamp, sign, toCell, towards } from "../../core/fixed.ts";
import {
  TILE_ACTOR, TILE_EXIT_LOCKED, TILE_EXIT_OPEN, TILE_FLOOR, TILE_GUARD,
  TILE_GUARD_REELING, TILE_LADDER, TILE_TREASURE, TILE_WALL,
} from "../../core/tiles.ts";
import {
  FACE_DX, FACE_LEFT, FACE_RIGHT,
  HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_RIGHT, HELD_SWING, HELD_UP,
  STATUS_LOST, STATUS_PLAYING, STATUS_WON,
  type Capability, type Engine, type Status,
} from "../types.ts";

export const DASH_V3_BEHAVIOUR = 3;

export const TICK_CAP = 3600;
export const MAX_TREASURE = 8;

/** Half-width of a body. Half-height is the same: a body is a square. */
export const BODY = 96;

/** Subcells per tick, per tick. Gravity is the only constant that matters. */
export const GRAVITY = 6;
/** Nothing falls faster than this, so nothing tunnels through a floor. */
export const TERMINAL = 88;
/** Run speed by speed pips. */
const RUN_BY_PIP: readonly number[] = [22, 28, 34, 40, 46, 52];
/** Jump impulse by strength pips: strength is how hard you push off. */
/**
 * Upward push, by strength pips.
 *
 * v1's weakest was 58, which rises 0.98 of a cell and needs 1.0 -- so a
 * creature that spent everything on speed could not climb a single step, and
 * the side-on game became ladders and flat ground only. Two subcells of
 * velocity, and it made a whole build a trap.
 *
 * These are MEASURED, not chosen: driven through this engine at every strength
 * and step height, they give a maximum step of [1,1,1,2,2,3] cells. Everybody
 * can climb; strength buys a second cell at three pips and a third at five.
 * test/dash-v2.test.ts re-measures on every run.
 */
const JUMP_BY_PIP: readonly number[] = [64, 72, 80, 88, 96, 104];
/** Climbing is deliberately slower than running. */
export const CLIMB_SPEED = 26;
export const ENEMY_SPEED = 22;
/** Ticks a stomped enemy stays down. */
export const STOMP_TICKS = 90;
/** How long a swing stays out, in ticks. Same as from above, so it feels the same. */
export const SWING_TICKS = 8;
/**
 * How far the weapon lands, from the body's centre. Matched to roam's REACH:
 * a sword is a sword in both games, and a child who has learned how close they
 * have to be from above should not have to learn it again from the side.
 */
export const REACH = (BODY + (ONE >> 2) + 2 * (ONE >> 1)) | 0;
/** Swings an enemy takes before it is gone, by strength pips. Wands never kill. */
const HITS_BY_PIP: readonly number[] = [4, 3, 3, 2, 2, 1];
/** Ticks a struck enemy stays down, by strength pips. */
const STUN_BY_PIP: readonly number[] = [14, 20, 26, 32, 40, 48];
/** Ticks a wand freezes one for, by strength pips. Always from a single wave. */
const FREEZE_BY_PIP: readonly number[] = [90, 110, 130, 150, 170, 190];

export function reachFor(_creature: Creature): number {
  return REACH;
}
/** Swings this creature needs to put an enemy down for good. 0 for a wand. */
export function hitsToKillFor(creature: Creature): number {
  if (creature.weapon === "wand") return 0;
  return HITS_BY_PIP[pipOf(creature.caps.FORCE)] as number;
}
/** True when this creature's swing can finish an enemy off at all. */
export function killsFor(creature: Creature): boolean {
  return creature.weapon !== "wand";
}
/** How long a struck enemy stays put: a moment for a sword, a while for a wand. */
export function downTicksFor(creature: Creature): number {
  return creature.weapon === "wand"
    ? (FREEZE_BY_PIP[pipOf(creature.caps.FORCE)] as number)
    : (STUN_BY_PIP[pipOf(creature.caps.FORCE)] as number);
}
/** How hard you bounce off something you landed on. */
export const BOUNCE = 62;
export const MERCY_TICKS = 45;

const CONSUMES: ReadonlySet<Capability> = new Set<Capability>(["FORCE", "GUARD", "HASTE", "REACH"]);

function pipOf(value: number): number {
  return clamp((((value | 0) + 25) / 51) | 0, 0, 5);
}

export function runFor(creature: Creature): number {
  return RUN_BY_PIP[pipOf(creature.caps.HASTE)] as number;
}
export function jumpFor(creature: Creature): number {
  return JUMP_BY_PIP[pipOf(creature.caps.FORCE)] as number;
}
/**
 * Hearts come from STRENGTH now. Toughness used to be its own characteristic
 * and nobody could tell the two words apart, so being strong covers standing up
 * to a hit as well as landing one -- which is what most people assumed it meant
 * in the first place. See docs/adr/0012.
 */
export function heartsFor(creature: Creature): number {
  return (2 + pipOf(creature.caps.FORCE)) | 0;
}
/** The same for everyone; see the note on hearts. */
export function reachFor(_creature: Creature): number {
  return (BODY + (ONE >> 2) + 2 * (ONE >> 1)) | 0;
}

interface Walker {
  x: number;
  y: number;
  dir: number;
  stun: number;
  /** Swings left before it is gone. */
  hp: number;
  /** 1 once it has been put down. It stays down until the level restarts. */
  down: number;
}

export class DashV3 implements Engine {
  readonly id = "dash" as const;
  readonly behaviourVersion = DASH_V3_BEHAVIOUR;
  readonly consumes = CONSUMES;

  private readonly level: Level;
  private readonly creature: Creature;
  private readonly walkers: Walker[];
  private readonly run: number;
  private readonly jump: number;
  private readonly reach: number;
  private readonly downTicks: number;
  private readonly walkerHits: number;
  private readonly kills: boolean;
  private readonly hearts: number;
  private readonly reach: number;

  private x: number;
  private y: number;
  private vy: number;
  private facing: number;
  private grounded: boolean;
  private climbing: boolean;
  private tick: number;
  private collected: number;
  private hp: number;
  private mercy: number;
  private status: Status;
  private readonly allTreasure: number;
  private readonly tiles: Uint8Array;
  private stompedThisTick = false;
  private struckThisTick = false;
  private killedThisTick = false;
  private frozeThisTick = false;
  private swing = 0;
  private hurtThisTick = false;

  constructor(level: Level, creature: Creature = BRUK) {
    if (level.treasureCells.length > MAX_TREASURE) {
      throw new Error(`level has ${level.treasureCells.length} treasures; dash v3 holds ${MAX_TREASURE}`);
    }
    this.level = level;
    this.creature = creature;
    this.run = runFor(creature);
    this.jump = jumpFor(creature);
    this.hearts = heartsFor(creature);
    this.reach = reachFor(creature);

    this.x = cellCentre(level.startX);
    this.y = cellCentre(level.startY);
    this.vy = 0;
    this.facing = FACE_RIGHT;
    this.grounded = false;
    this.climbing = false;
    this.tick = 0;
    this.collected = 0;
    this.hp = this.hearts;
    this.mercy = 0;
    this.status = STATUS_PLAYING;
    this.allTreasure = ((1 << level.treasureCells.length) - 1) | 0;
    this.tiles = new Uint8Array(GRID_W * GRID_H);

    this.reach = reachFor(creature);
    this.downTicks = downTicksFor(creature);
    this.walkerHits = hitsToKillFor(creature);
    this.kills = killsFor(creature);

    this.walkers = [];
    for (let i = 0; i < level.guardCells.length; i = (i + 1) | 0) {
      const cell = level.guardCells[i] as number;
      this.walkers.push({
        x: cellCentre(cell % GRID_W),
        y: cellCentre((cell / GRID_W) | 0),
        dir: 1,
        stun: 0,
        hp: this.walkerHits | 0,
        down: 0,
      });
    }
  }

  step(held: number): Status {
    if (this.status !== STATUS_PLAYING) return this.status;

    const buttons = held | 0;
    this.stompedThisTick = false;
    this.hurtThisTick = false;
    this.struckThisTick = false;
    this.killedThisTick = false;
    this.frozeThisTick = false;
    this.tick = (this.tick + 1) | 0;
    if (this.mercy > 0) this.mercy = (this.mercy - 1) | 0;

    this.moveSideways(buttons);
    this.moveVertically(buttons);

    // A swing starts when the button goes down; holding it does not flail.
    if (this.swing > 0) this.swing = (this.swing - 1) | 0;
    if ((buttons & HELD_SWING) !== 0 && this.swing === 0) {
      this.swing = SWING_TICKS;
      this.strike();
    }

    this.moveWalkers();
    this.touchWalkers();
    this.collectTreasure();

    if (this.hp <= 0) {
      this.status = STATUS_LOST;
      return this.status;
    }

    if (
      this.level.exitX >= 0 &&
      this.collected === this.allTreasure &&
      toCell(this.x) === this.level.exitX &&
      toCell(this.y) === this.level.exitY
    ) {
      this.status = STATUS_WON;
      return this.status;
    }

    if (this.tick >= TICK_CAP) this.status = STATUS_LOST;
    return this.status;
  }

  private moveSideways(buttons: number): void {
    let dx = 0;
    if ((buttons & HELD_LEFT) !== 0) dx = (dx - 1) | 0;
    if ((buttons & HELD_RIGHT) !== 0) dx = (dx + 1) | 0;
    if (dx === 0) return;

    this.facing = dx > 0 ? FACE_RIGHT : FACE_LEFT;
    const nx = (this.x + this.run * dx) | 0;
    if (this.fits(nx, this.y)) this.x = nx;
  }

  private moveVertically(buttons: number): void {
    const onLadder = this.overLadder(this.x, this.y);

    // Climbing suspends gravity entirely, the way it does in every game of this
    // shape. A ladder you fall off halfway up is not a ladder.
    if (onLadder && ((buttons & HELD_UP) !== 0 || (buttons & HELD_DOWN) !== 0)) {
      this.climbing = true;
      this.vy = 0;
      const dy = (buttons & HELD_UP) !== 0 ? -CLIMB_SPEED : CLIMB_SPEED;
      const ny = (this.y + dy) | 0;
      if (this.fits(this.x, ny)) this.y = ny;
      this.grounded = false;
      return;
    }
    if (this.climbing && onLadder) {
      // Still holding on, just not moving.
      this.vy = 0;
      return;
    }
    this.climbing = false;

    // Jumping. Strength is how hard you push off, so a strong creature clears
    // gaps a quick one has to go round.
    if (this.grounded && (buttons & HELD_ACT) !== 0) {
      this.vy = (-this.jump) | 0;
      this.grounded = false;
    }

    this.vy = (this.vy + GRAVITY) | 0;
    if (this.vy > TERMINAL) this.vy = TERMINAL;

    // Step the fall in slices no larger than a body, so nothing tunnels through
    // a one-cell-thick floor at speed.
    let left = this.vy;
    const stepSize = BODY;
    this.grounded = false;
    while (left !== 0) {
      const slice = left > 0 ? (left < stepSize ? left : stepSize) : left > -stepSize ? left : -stepSize;
      const ny = (this.y + slice) | 0;
      if (this.fits(this.x, ny)) {
        this.y = ny;
        left = (left - slice) | 0;
      } else {
        if (slice > 0) this.grounded = true; // landed
        this.vy = 0;
        break;
      }
    }
  }

  private overLadder(x: number, y: number): boolean {
    const cx = toCell(x);
    const top = toCell((y - BODY + 1) | 0);
    const bottom = toCell((y + BODY - 1) | 0);
    for (let cy = top; cy <= bottom; cy = (cy + 1) | 0) {
      if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) continue;
      if (isLadder(this.level, cx, cy)) return true;
    }
    return false;
  }

  private fits(x: number, y: number): boolean {
    const left = toCell((x - BODY + 1) | 0);
    const right = toCell((x + BODY - 1) | 0);
    const top = toCell((y - BODY + 1) | 0);
    const bottom = toCell((y + BODY - 1) | 0);
    for (let cy = top; cy <= bottom; cy = (cy + 1) | 0) {
      for (let cx = left; cx <= right; cx = (cx + 1) | 0) {
        if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
        if (isWall(this.level, cx, cy)) return false;
      }
    }
    return true;
  }

  /** Is there floor under this spot? Used so walkers turn at a ledge. */
  private floorUnder(x: number, y: number): boolean {
    const cx = toCell(x);
    const cy = toCell((y + BODY + 2) | 0);
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
    return isWall(this.level, cx, cy);
  }

  private moveWalkers(): void {
    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      const walker = this.walkers[i] as Walker;
      if (walker.down !== 0) continue;
      if (walker.stun > 0) {
        walker.stun = (walker.stun - 1) | 0;
        continue;
      }

      const nx = (walker.x + ENEMY_SPEED * walker.dir) | 0;
      const blocked = !this.clearFor(nx, walker.y);
      const ledge = !this.floorUnder(nx, walker.y);
      if (blocked || ledge) {
        walker.dir = (-walker.dir) | 0;
      } else {
        walker.x = nx;
      }
    }
  }

  private clearFor(x: number, y: number): boolean {
    const cx = toCell(x);
    const cy = toCell(y);
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
    return !isWall(this.level, cx, cy);
  }

  /**
   * The weapon. Measured from YOU, not from the blade's tip, so an enemy
   * pressed against you is hit rather than falling through the middle of the
   * arc -- the same fix roam/3 needed, and for the same reason.
   *
   * Facing here is only ever left or right, which is the whole difference from
   * the game seen from above: you cannot swing at something below you. That is
   * what stomping is for.
   */
  private strike(): void {
    const dx = FACE_DX[this.facing] as number;

    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      const walker = this.walkers[i] as Walker;
      if (walker.down !== 0) continue;
      if (walker.stun > 0) continue;

      const away = chebyshev(walker.x, walker.y, this.x, this.y);
      if (away > this.reach) continue;

      // In front of you, unless it is close enough to be touching.
      const ahead = (((walker.x - this.x) | 0) * dx) | 0;
      if (away > BODY + BODY && ahead < 0) continue;

      this.struckThisTick = true;

      if (this.kills) {
        walker.hp = (walker.hp - 1) | 0;
        if (walker.hp <= 0) {
          walker.down = 1;
          walker.stun = 0;
          this.killedThisTick = true;
          continue;
        }
      } else {
        this.frozeThisTick = true;
      }

      walker.stun = this.downTicks | 0;

      // Shoved along the swing, as far as the ground allows.
      const shoveX = (walker.x + sign((walker.x - this.x) | 0) * ONE) | 0;
      if (this.clearFor(shoveX, walker.y)) walker.x = towards(walker.x, shoveX, ONE);
    }
  }

  /**
   * Landing on something beats it; walking into it does not. The difference is
   * whether you were on the way down, which is the rule every child already
   * knows from Mario.
   */
  private touchWalkers(): void {
    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      const walker = this.walkers[i] as Walker;
      if (walker.down !== 0) continue;
      if (walker.stun > 0) continue;
      if (chebyshev(walker.x, walker.y, this.x, this.y) > BODY + BODY) continue;

      const fromAbove = this.vy > 0 && this.y < walker.y;
      if (fromAbove) {
        walker.stun = STOMP_TICKS;
        this.vy = (-BOUNCE) | 0;
        this.grounded = false;
        this.stompedThisTick = true;
        continue;
      }

      if (this.mercy > 0) continue;
      this.hp = (this.hp - 1) | 0;
      this.mercy = MERCY_TICKS;
      this.hurtThisTick = true;
      // Knocked back and up, so you are not standing in it when mercy ends.
      const awayX = (this.x + sign((this.x - walker.x) | 0) * ONE) | 0;
      if (this.fits(awayX, this.y)) this.x = awayX;
      this.vy = (-BOUNCE) | 0;
      this.grounded = false;
      return;
    }
  }

  private collectTreasure(): void {
    const cells = this.level.treasureCells;
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) !== 0) continue;
      const cell = cells[i] as number;
      const tx = cellCentre(cell % GRID_W);
      const ty = cellCentre((cell / GRID_W) | 0);
      if (chebyshev(tx, ty, this.x, this.y) <= this.reach) {
        this.collected = (this.collected | (1 << i)) | 0;
      }
    }
  }

  render(): Uint8Array {
    const walls = this.level.walls;
    for (let i = 0; i < this.tiles.length; i = (i + 1) | 0) {
      if (walls[i] === 1) this.tiles[i] = TILE_WALL;
      else if (this.level.ladders[i] === 1) this.tiles[i] = TILE_LADDER;
      else this.tiles[i] = TILE_FLOOR;
    }
    const cells = this.level.treasureCells;
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) === 0) this.tiles[cells[i] as number] = TILE_TREASURE;
    }
    if (this.level.exitX >= 0) {
      this.tiles[idx(this.level.exitX, this.level.exitY)] =
        this.collected === this.allTreasure ? TILE_EXIT_OPEN : TILE_EXIT_LOCKED;
    }
    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      const walker = this.walkers[i] as Walker;
      if (walker.down !== 0) continue;
      const cell = idx(clamp(toCell(walker.x), 0, GRID_W - 1), clamp(toCell(walker.y), 0, GRID_H - 1));
      this.tiles[cell] = walker.stun > 0 ? TILE_GUARD_REELING : TILE_GUARD;
    }
    this.tiles[idx(clamp(toCell(this.x), 0, GRID_W - 1), clamp(toCell(this.y), 0, GRID_H - 1))] =
      TILE_ACTOR;
    return this.tiles;
  }

  stateHash(): number {
    let h = hashInit();
    h = hashInt32(h, this.x);
    h = hashInt32(h, this.y);
    h = hashInt32(h, this.vy);
    h = hashInt32(h, this.facing);
    h = hashInt32(h, this.grounded ? 1 : 0);
    h = hashInt32(h, this.climbing ? 1 : 0);
    h = hashInt32(h, this.tick);
    h = hashInt32(h, this.collected);
    h = hashInt32(h, this.hp);
    h = hashInt32(h, this.mercy);
    h = hashInt32(h, this.status);
    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      const walker = this.walkers[i] as Walker;
      h = hashInt32(h, walker.x);
      h = hashInt32(h, walker.y);
      h = hashInt32(h, walker.dir);
      h = hashInt32(h, walker.stun);
      h = hashInt32(h, walker.hp);
      h = hashInt32(h, walker.down);
    }
    return h | 0;
  }

  message(): string | null {
    const name = this.creature.name;
    if (this.status === STATUS_WON) return `${name} made it to the top.`;
    if (this.status === STATUS_LOST) {
      return this.hp <= 0 ? `${name} ran out of bounce.` : "Out of time.";
    }
    if (this.hurtThisTick) return "Ouch.";
    if (this.killedThisTick) return "Got it.";
    if (this.frozeThisTick) return "Frozen solid.";
    if (this.stompedThisTick) return "Bounced right off it.";
    return null;
  }

  // --- presentation, never hashed ------------------------------------------------

  where(): { x: number; y: number; facing: number } {
    return { x: this.x, y: this.y, facing: this.facing };
  }
  enemyPositions(): Array<{ x: number; y: number; stunned: boolean; chasing: boolean }> {
    return this.walkers
      .filter((w) => w.down === 0)
      .map((w) => ({ x: w.x, y: w.y, stunned: w.stun > 0, chasing: false }));
  }
  onGround(): boolean { return this.grounded; }
  onLadder(): boolean { return this.climbing; }
  falling(): number { return this.vy; }
  swinging(): boolean { return this.swing > 0; }
  swingLeft(): number { return this.swing; }
  swingLength(): number { return SWING_TICKS; }
  /** True on the tick a swing finished one off. Presentation only. */
  justKilled(): boolean { return this.killedThisTick; }
  /** True on the tick a wave froze one. Presentation only. */
  justFroze(): boolean { return this.frozeThisTick; }
  /** Enemies still standing, for the HUD. Presentation only. */
  enemiesLeft(): number {
    let n = 0;
    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      if ((this.walkers[i] as Walker).down === 0) n = (n + 1) | 0;
    }
    return n;
  }
  merciful(): boolean { return this.mercy > 0; }
  justStomped(): boolean { return this.stompedThisTick; }
  justHurt(): boolean { return this.hurtThisTick; }
  health(): { hp: number; max: number } { return { hp: this.hp, max: this.hearts }; }
  ticks(): number { return this.tick; }
  seconds(): number { return (this.tick / 30) | 0; }
  collectedCount(): number {
    let n = 0;
    for (let i = 0; i < this.level.treasureCells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) !== 0) n = (n + 1) | 0;
    }
    return n;
  }
  treasureTotal(): number { return this.level.treasureCells.length | 0; }
  exitOpen(): boolean { return this.collected === this.allTreasure; }
  currentStatus(): Status { return this.status; }
  position(): { x: number; y: number } { return { x: toCell(this.x), y: toCell(this.y) }; }
}
