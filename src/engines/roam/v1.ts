// Roam, behaviour version 1. Top-down, real time.
//
// The first engine where the world does not wait for you. Enemies walk on their
// own clock, you move while a direction is held, and you swing at things.
//
// Real time does NOT mean undetermined. The simulation still advances in whole
// numbered ticks; the difference is that a tick comes from a clock rather than
// from a thumb (see core/clock.ts). Positions are fixed-point subcells, never
// floats (core/fixed.ts). So a log is still held-button bytes against tick
// numbers, and still replays to the same hash on every device -- which is what
// keeps share links and win proofs working now the world moves on its own.
//
// Top-down with a sword, the way Zelda works: enemies patrol, notice you and
// chase, and you can swing at them.
//
// What the creature's four characteristics do here:
//
//   * speed    -- how fast you walk, and so whether you can outrun a chase
//   * strength -- how hard you hit, and how long an enemy stays down
//   * nerve    -- how many hits you can take before it is over
//   * reach    -- how far the sword lands, and how far you can lift a gem from
//
// The same four will mean the same things in the side-on engine. That is the
// point of dropping MASS: a characteristic that carries over is worth having.

import { hashInit, hashInt32 } from "../../core/hash.ts";
import { GRID_H, GRID_W, idx } from "../../core/grid.ts";
import { isWall, type Level } from "../../core/level.ts";
import { patrolsFor, type Patrol } from "../../core/patrol.ts";
import { BRUK, type Creature } from "../../core/creature.ts";
import { ONE, cellCentre, chebyshev, clamp, sign, toCell, towards } from "../../core/fixed.ts";
import {
  TILE_ACTOR, TILE_EXIT_LOCKED, TILE_EXIT_OPEN, TILE_FLOOR,
  TILE_GUARD, TILE_GUARD_REELING, TILE_TREASURE, TILE_WALL,
} from "../../core/tiles.ts";
import {
  FACE_DOWN, FACE_DX, FACE_DY, FACE_LEFT, FACE_RIGHT, FACE_UP,
  HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_RIGHT, HELD_UP,
  STATUS_LOST, STATUS_PLAYING, STATUS_WON,
  type Capability, type Engine, type Status,
} from "../types.ts";

export const ROAM_V1_BEHAVIOUR = 1;

/** Ticks before the dark takes you. 30 a second, so two minutes. */
export const TICK_CAP = 3600;
export const MAX_TREASURE = 8;

/** Half-width of a body, in subcells. Smaller than a cell, so corners forgive. */
export const BODY = 96;
/** Walking speed in subcells per tick, by speed pips 0..5. */
const SPEED_BY_PIP: readonly number[] = [20, 26, 32, 38, 44, 50];
/** Enemy speed: below a fast creature, above a slow one, so speed matters. */
export const ENEMY_SPEED = 30;
/** How close an enemy has to be before it gives chase. */
export const SIGHT = ONE * 4;
/** How long a swing stays out. */
export const SWING_TICKS = 8;
/** Ticks of mercy after being hit, so one bump is not three. */
export const MERCY_TICKS = 30;
/** Ticks a struck enemy stays down, by strength pips. */
const STUN_BY_PIP: readonly number[] = [14, 20, 26, 32, 40, 48];

const CONSUMES: ReadonlySet<Capability> = new Set<Capability>(["FORCE", "GUARD", "HASTE", "REACH"]);

function pipOf(value: number): number {
  return clamp((((value | 0) + 25) / 51) | 0, 0, 5);
}

export function speedFor(creature: Creature): number {
  return SPEED_BY_PIP[pipOf(creature.caps.HASTE)] as number;
}
export function heartsFor(creature: Creature): number {
  return (2 + pipOf(creature.caps.GUARD)) | 0;
}
/** How far the sword lands, measured from the body's centre. */
export function reachFor(creature: Creature): number {
  return (BODY + (ONE >> 2) + pipOf(creature.caps.REACH) * (ONE >> 1)) | 0;
}
/** How long a struck enemy stays down. */
export function stunFor(creature: Creature): number {
  return STUN_BY_PIP[pipOf(creature.caps.FORCE)] as number;
}

interface Enemy {
  x: number;
  y: number;
  /** Which way along its corridor it walks: +1 or -1. */
  dir: number;
  stun: number;
  chasing: number;
}

export class RoamV1 implements Engine {
  readonly id = "roam" as const;
  readonly behaviourVersion = ROAM_V1_BEHAVIOUR;
  readonly consumes = CONSUMES;

  private readonly level: Level;
  private readonly creature: Creature;
  private readonly patrols: readonly Patrol[];
  private readonly enemies: Enemy[];
  private readonly speed: number;
  private readonly hearts: number;
  private readonly reach: number;
  private readonly stunTicks: number;

  private x: number;
  private y: number;
  private facing: number;
  private tick: number;
  private collected: number;
  private hp: number;
  private swing: number;
  private mercy: number;
  private status: Status;
  private readonly allTreasure: number;
  private readonly tiles: Uint8Array;
  private struckThisTick = false;
  private hurtThisTick = false;

  constructor(level: Level, creature: Creature = BRUK) {
    if (level.treasureCells.length > MAX_TREASURE) {
      throw new Error(`level has ${level.treasureCells.length} treasures; roam v1 holds ${MAX_TREASURE}`);
    }
    this.level = level;
    this.creature = creature;
    this.patrols = patrolsFor(level);
    this.speed = speedFor(creature);
    this.hearts = heartsFor(creature);
    this.reach = reachFor(creature);
    this.stunTicks = stunFor(creature);

    this.x = cellCentre(level.startX);
    this.y = cellCentre(level.startY);
    this.facing = FACE_DOWN;
    this.tick = 0;
    this.collected = 0;
    this.hp = this.hearts;
    this.swing = 0;
    this.mercy = 0;
    this.status = STATUS_PLAYING;
    this.allTreasure = ((1 << level.treasureCells.length) - 1) | 0;
    this.tiles = new Uint8Array(GRID_W * GRID_H);

    this.enemies = [];
    for (let i = 0; i < this.patrols.length; i = (i + 1) | 0) {
      const home = (this.patrols[i] as Patrol).home;
      this.enemies.push({
        x: cellCentre(home % GRID_W),
        y: cellCentre((home / GRID_W) | 0),
        dir: 1, stun: 0, chasing: 0,
      });
    }
  }

  /** One tick. `held` is a bitmask of the buttons down right now. */
  step(held: number): Status {
    if (this.status !== STATUS_PLAYING) return this.status;

    const buttons = held | 0;
    this.struckThisTick = false;
    this.hurtThisTick = false;
    this.tick = (this.tick + 1) | 0;

    if (this.mercy > 0) this.mercy = (this.mercy - 1) | 0;
    if (this.swing > 0) this.swing = (this.swing - 1) | 0;

    this.walk(buttons);

    // A swing starts when the button goes down; holding it does not flail.
    if ((buttons & HELD_ACT) !== 0 && this.swing === 0) {
      this.swing = SWING_TICKS;
      this.strike();
    }

    this.moveEnemies();
    this.touchEnemies();
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

  private walk(buttons: number): void {
    let dx = 0;
    let dy = 0;
    if ((buttons & HELD_LEFT) !== 0) dx = (dx - 1) | 0;
    if ((buttons & HELD_RIGHT) !== 0) dx = (dx + 1) | 0;
    if ((buttons & HELD_UP) !== 0) dy = (dy - 1) | 0;
    if ((buttons & HELD_DOWN) !== 0) dy = (dy + 1) | 0;
    if (dx === 0 && dy === 0) return;

    if (dx > 0) this.facing = FACE_RIGHT;
    else if (dx < 0) this.facing = FACE_LEFT;
    else if (dy > 0) this.facing = FACE_DOWN;
    else if (dy < 0) this.facing = FACE_UP;

    // One axis at a time, so you slide along a wall instead of sticking to it.
    if (dx !== 0) {
      const nx = (this.x + this.speed * dx) | 0;
      if (this.fits(nx, this.y)) this.x = nx;
    }
    if (dy !== 0) {
      const ny = (this.y + this.speed * dy) | 0;
      if (this.fits(this.x, ny)) this.y = ny;
    }
  }

  /** Does a body centred here clear the walls? */
  private fits(x: number, y: number): boolean {
    const left = toCell((x - BODY) | 0);
    const right = toCell((x + BODY) | 0);
    const top = toCell((y - BODY) | 0);
    const bottom = toCell((y + BODY) | 0);
    for (let cy = top; cy <= bottom; cy = (cy + 1) | 0) {
      for (let cx = left; cx <= right; cx = (cx + 1) | 0) {
        if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
        if (isWall(this.level, cx, cy)) return false;
      }
    }
    return true;
  }

  private moveEnemies(): void {
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      if (enemy.stun > 0) {
        enemy.stun = (enemy.stun - 1) | 0;
        continue;
      }

      const near = chebyshev(enemy.x, enemy.y, this.x, this.y) <= SIGHT;
      enemy.chasing = near ? 1 : 0;

      if (near) {
        const stepX = (ENEMY_SPEED * sign((this.x - enemy.x) | 0)) | 0;
        const stepY = (ENEMY_SPEED * sign((this.y - enemy.y) | 0)) | 0;
        if (stepX !== 0 && this.clearFor((enemy.x + stepX) | 0, enemy.y)) {
          enemy.x = (enemy.x + stepX) | 0;
        }
        if (stepY !== 0 && this.clearFor(enemy.x, (enemy.y + stepY) | 0)) {
          enemy.y = (enemy.y + stepY) | 0;
        }
        continue;
      }

      // Otherwise walk the corridor it was drawn in, turning at each end.
      const patrol = this.patrols[i] as Patrol;
      const horizontal = patrol.axis === 0;
      const lowCell = horizontal ? patrol.lo % GRID_W : (patrol.lo / GRID_W) | 0;
      const low = cellCentre(lowCell);
      const high = cellCentre((lowCell + patrol.length - 1) | 0);

      const at = horizontal ? enemy.x : enemy.y;
      let next = (at + ENEMY_SPEED * enemy.dir) | 0;
      if (next >= high) { next = high; enemy.dir = -1; }
      else if (next <= low) { next = low; enemy.dir = 1; }
      if (horizontal) enemy.x = next;
      else enemy.y = next;
    }
  }

  private clearFor(x: number, y: number): boolean {
    const cx = toCell(x);
    const cy = toCell(y);
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
    return !isWall(this.level, cx, cy);
  }

  /** The sword. Strength decides how long what you hit stays down. */
  private strike(): void {
    const tipX = (this.x + (FACE_DX[this.facing] as number) * this.reach) | 0;
    const tipY = (this.y + (FACE_DY[this.facing] as number) * this.reach) | 0;

    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      if (enemy.stun > 0) continue;
      if (chebyshev(enemy.x, enemy.y, tipX, tipY) > ONE) continue;

      enemy.stun = this.stunTicks | 0;
      enemy.chasing = 0;
      this.struckThisTick = true;

      // Knocked back along the swing, as far as the room allows.
      const shoveX = (enemy.x + sign((enemy.x - this.x) | 0) * ONE) | 0;
      const shoveY = (enemy.y + sign((enemy.y - this.y) | 0) * ONE) | 0;
      if (this.clearFor(shoveX, enemy.y)) enemy.x = towards(enemy.x, shoveX, ONE);
      if (this.clearFor(enemy.x, shoveY)) enemy.y = towards(enemy.y, shoveY, ONE);
    }
  }

  private touchEnemies(): void {
    if (this.mercy > 0) return;
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      if (enemy.stun > 0) continue;
      if (chebyshev(enemy.x, enemy.y, this.x, this.y) > BODY + BODY) continue;

      this.hp = (this.hp - 1) | 0;
      this.mercy = MERCY_TICKS;
      this.hurtThisTick = true;

      const awayX = (this.x + sign((this.x - enemy.x) | 0) * ONE) | 0;
      const awayY = (this.y + sign((this.y - enemy.y) | 0) * ONE) | 0;
      if (this.fits(awayX, this.y)) this.x = awayX;
      if (this.fits(this.x, awayY)) this.y = awayY;
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
      this.tiles[i] = walls[i] === 1 ? TILE_WALL : TILE_FLOOR;
    }
    const cells = this.level.treasureCells;
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) === 0) this.tiles[cells[i] as number] = TILE_TREASURE;
    }
    if (this.level.exitX >= 0) {
      this.tiles[idx(this.level.exitX, this.level.exitY)] =
        this.collected === this.allTreasure ? TILE_EXIT_OPEN : TILE_EXIT_LOCKED;
    }
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      const cell = idx(clamp(toCell(enemy.x), 0, GRID_W - 1), clamp(toCell(enemy.y), 0, GRID_H - 1));
      this.tiles[cell] = enemy.stun > 0 ? TILE_GUARD_REELING : TILE_GUARD;
    }
    this.tiles[idx(clamp(toCell(this.x), 0, GRID_W - 1), clamp(toCell(this.y), 0, GRID_H - 1))] =
      TILE_ACTOR;
    return this.tiles;
  }

  stateHash(): number {
    let h = hashInit();
    h = hashInt32(h, this.x);
    h = hashInt32(h, this.y);
    h = hashInt32(h, this.facing);
    h = hashInt32(h, this.tick);
    h = hashInt32(h, this.collected);
    h = hashInt32(h, this.hp);
    h = hashInt32(h, this.swing);
    h = hashInt32(h, this.mercy);
    h = hashInt32(h, this.status);
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      h = hashInt32(h, enemy.x);
      h = hashInt32(h, enemy.y);
      h = hashInt32(h, enemy.dir);
      h = hashInt32(h, enemy.stun);
    }
    return h | 0;
  }

  message(): string | null {
    const name = this.creature.name;
    if (this.status === STATUS_WON) return `${name} got out with the lot.`;
    if (this.status === STATUS_LOST) {
      return this.hp <= 0 ? `${name} went down swinging.` : "The dark got bored of waiting.";
    }
    if (this.hurtThisTick) return "That hurt.";
    if (this.struckThisTick) return "Down it goes.";
    return null;
  }

  // --- presentation, never hashed ------------------------------------------------

  where(): { x: number; y: number; facing: number } {
    return { x: this.x, y: this.y, facing: this.facing };
  }
  enemyPositions(): Array<{ x: number; y: number; stunned: boolean; chasing: boolean }> {
    return this.enemies.map((e) => ({
      x: e.x, y: e.y, stunned: e.stun > 0, chasing: e.chasing !== 0,
    }));
  }
  merciful(): boolean { return this.mercy > 0; }
  swinging(): boolean { return this.swing > 0; }
  justStruck(): boolean { return this.struckThisTick; }
  justHurt(): boolean { return this.hurtThisTick; }
  /** True while any guard has noticed you. Presentation only. */
  hunted(): boolean { return this.enemies.some((e) => e.chasing !== 0 && e.stun === 0); }
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
