// Roam, behaviour version 5. Top-down, real time.
//
// v5 changes one thing: you pick treasure up by going to it, rather than by
// being within a sword's length of it. Up to v4 the pickup test borrowed the
// weapon's reach -- 416 subcells, over a cell and a half -- so walking down
// the corridor next to a gem collected it. See docs/adr/0028.
//
// Everything else is v4 exactly, including enemy speed and hearts, so a level
// plays the same in every other respect.

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

export const ROAM_V5_BEHAVIOUR = 5;

/** Ticks before the dark takes you. 30 a second, so two minutes. */
export const TICK_CAP = 3600;
export const MAX_TREASURE = 8;

/** Half-width of a body, in subcells. Smaller than a cell, so corners forgive. */
export const BODY = 96;
/** Walking speed in subcells per tick, by speed pips 0..5. */
const SPEED_BY_PIP: readonly number[] = [20, 26, 32, 38, 44, 50];
/** Enemy speed: below a fast creature, above a slow one, so speed matters. */
/**
 * Enemy walking speed, in subcells per tick.
 *
 * Below every creature's speed on purpose: the player range is 20 to 50, and
 * an enemy that outpaces some builds makes those builds unplayable rather than
 * merely harder. Chosen by measuring against the whole range, not by feel.
 */
export const ENEMY_SPEED = 22;
/**
 * How close an enemy has to be before it gives chase, and how far before it
 * gives up. Four cells was too much: a guard two cells from the start meant
 * being hunted from the first tick with nowhere to learn the controls.
 */
export const SIGHT = ONE * 3;
export const LOSE_INTEREST = ONE * 5;
/** How long a swing stays out. */
export const SWING_TICKS = 8;
/**
 * Ticks of mercy after being hit. Long enough to actually get away: at 30 the
 * mercy ran out while still inside the guard, so five hearts went in five
 * seconds.
 */
export const MERCY_TICKS = 50;
/** Ticks a struck enemy stays down, by strength pips. */
const STUN_BY_PIP: readonly number[] = [14, 20, 26, 32, 40, 48];
/**
 * Sword hits an enemy takes before it is gone, by strength pips. A weak
 * creature can still clear a path; it just has to work at it.
 */
const HITS_BY_PIP: readonly number[] = [4, 3, 3, 2, 2, 1];
/**
 * Ticks a wand freezes an enemy for, by strength pips. Three seconds at no
 * strength, six and a bit at full -- always from ONE wave.
 *
 * Deliberately far longer than a sword's stun. The wand's whole case is that
 * it works immediately and never has to be landed twice; if the freeze were
 * short it would just be a worse sword, and nobody would ever pick it.
 */
const FREEZE_BY_PIP: readonly number[] = [90, 110, 130, 150, 170, 190];
/**
 * How close to its home cell an enemy has to be before it counts as back on
 * patrol. Half a cell -- the corridor walk snaps it the rest of the way.
 */
const HOME_SLACK = ONE >> 1;

const CONSUMES: ReadonlySet<Capability> = new Set<Capability>(["FORCE", "GUARD", "HASTE", "REACH"]);

function pipOf(value: number): number {
  return clamp((((value | 0) + 25) / 51) | 0, 0, 5);
}

export function speedFor(creature: Creature): number {
  return SPEED_BY_PIP[pipOf(creature.caps.HASTE)] as number;
}
/**
 * Hearts come from STRENGTH now. Toughness used to be its own characteristic
 * and nobody could tell the two words apart, so being strong covers standing up
 * to a hit as well as landing one -- which is what most people assumed it meant
 * in the first place. See docs/adr/0012.
 */
/**
 * Hearts, by strength. Three at none, eight at full.
 *
 * v3 started at two, which meant a creature that spent everything on speed
 * died to two touches -- and one of those is nearly free, because you have to
 * learn a room before you can avoid what is in it. Three is the difference
 * between a mistake and a run.
 */
export function heartsFor(creature: Creature): number {
  return (3 + pipOf(creature.caps.FORCE)) | 0;
}
/**
 * How far the sword lands, measured from the body's centre. The same for
 * everyone: reach was a fourth characteristic that nobody asked for, and two
 * things to spend points on is as much as a child should have to weigh.
 */
export const REACH = (BODY + (ONE >> 2) + 2 * (ONE >> 1)) | 0;

/**
 * How close you must be to pick treasure up. **Not the weapon's reach.**
 *
 * Up to roam/4 these were the same number, so a gem came off the floor from
 * 416 subcells away -- more than a cell and a half. Walking down the corridor
 * NEXT to a treasure collected it, which is what "the proximity to capture the
 * treasure is too far" was describing.
 *
 * A sword is meant to reach; a hand is not. This is your own body plus a
 * quarter of a cell, so you collect a gem by going to it: anywhere inside its
 * cell picks it up (half a cell from the centre at the very corner), and a
 * little grace outside covers walking briskly past the edge.
 */
export const GRAB = (BODY + (ONE >> 2)) | 0;

export function reachFor(_creature: Creature): number {
  return REACH;
}
/** How long a struck enemy stays down. */
export function stunFor(creature: Creature): number {
  return STUN_BY_PIP[pipOf(creature.caps.FORCE)] as number;
}

/**
 * Sword hits this creature needs to put an enemy down for good.
 *
 * A wand never kills, whatever its strength -- that is the trade, not a
 * shortcoming, so this is only asked of a creature carrying a sword.
 */
export function hitsToKillFor(creature: Creature): number {
  if (creature.weapon === "wand") return 0;
  return HITS_BY_PIP[pipOf(creature.caps.FORCE)] as number;
}

/** True when this creature's swing can finish an enemy off at all. */
export function killsFor(creature: Creature): boolean {
  return creature.weapon !== "wand";
}

/**
 * How long a struck enemy stays put. A sword buys you a moment between swings;
 * a wand buys you the room.
 */
export function downTicksFor(creature: Creature): number {
  return creature.weapon === "wand"
    ? (FREEZE_BY_PIP[pipOf(creature.caps.FORCE)] as number)
    : (STUN_BY_PIP[pipOf(creature.caps.FORCE)] as number);
}

interface Enemy {
  x: number;
  y: number;
  /** Which way along its corridor it walks: +1 or -1. */
  dir: number;
  stun: number;
  chasing: number;
  /** Sword hits left before it goes down for good. */
  hp: number;
  /** 1 once it has been put down. It stays down until the level restarts. */
  down: number;
}

export class RoamV5 implements Engine {
  readonly id = "roam" as const;
  readonly behaviourVersion = ROAM_V5_BEHAVIOUR;
  readonly consumes = CONSUMES;

  private readonly level: Level;
  private readonly creature: Creature;
  private readonly patrols: readonly Patrol[];
  private readonly enemies: Enemy[];
  private readonly speed: number;
  private readonly hearts: number;
  private readonly reach: number;
  private readonly stunTicks: number;
  /** Sword hits this creature needs to put an enemy down for good. */
  private readonly enemyHits: number;
  /** False for a wand: it freezes and never finishes. */
  private readonly kills: boolean;

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
  private killedThisTick = false;
  private frozeThisTick = false;

  constructor(level: Level, creature: Creature = BRUK) {
    if (level.treasureCells.length > MAX_TREASURE) {
      throw new Error(`level has ${level.treasureCells.length} treasures; roam v5 holds ${MAX_TREASURE}`);
    }
    this.level = level;
    this.creature = creature;
    this.patrols = patrolsFor(level);
    this.speed = speedFor(creature);
    this.hearts = heartsFor(creature);
    this.reach = reachFor(creature);
    this.stunTicks = downTicksFor(creature);
    this.enemyHits = hitsToKillFor(creature);
    this.kills = killsFor(creature);

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
        hp: this.enemyHits | 0, down: 0,
      });
    }
  }

  /** One tick. `held` is a bitmask of the buttons down right now. */
  step(held: number): Status {
    if (this.status !== STATUS_PLAYING) return this.status;

    const buttons = held | 0;
    this.struckThisTick = false;
    this.hurtThisTick = false;
    this.killedThisTick = false;
    this.frozeThisTick = false;
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
      const patrol = this.patrols[i] as Patrol;

      // Dead is dead, for this attempt. Every game of this shape works that
      // way -- you clear a room and it stays clear -- and starting the level
      // again brings the whole room back with it.
      if (enemy.down !== 0) continue;

      if (enemy.stun > 0) {
        enemy.stun = (enemy.stun - 1) | 0;
        continue;
      }

      // Hysteresis: it takes SIGHT to notice you and LOSE_INTEREST to forget,
      // so a guard does not flicker between chasing and strolling on the line.
      const distance = chebyshev(enemy.x, enemy.y, this.x, this.y);
      const near = enemy.chasing !== 0 ? distance <= LOSE_INTEREST : distance <= SIGHT;
      enemy.chasing = near ? 1 : 0;

      if (near) {
        const stepX = (ENEMY_SPEED * sign((this.x - enemy.x) | 0)) | 0;
        const stepY = (ENEMY_SPEED * sign((this.y - enemy.y) | 0)) | 0;
        if (stepX !== 0 && this.enemyFits((enemy.x + stepX) | 0, enemy.y)) {
          enemy.x = (enemy.x + stepX) | 0;
        }
        if (stepY !== 0 && this.enemyFits(enemy.x, (enemy.y + stepY) | 0)) {
          enemy.y = (enemy.y + stepY) | 0;
        }
        continue;
      }

      // Not chasing. A chase drags an enemy out of the corridor it was drawn
      // in, and the corridor's extent only means anything ON that corridor --
      // v1 applied it wherever the chase had left the enemy, which is how a
      // guard ended up pacing a column of solid rock. So: walk back to the
      // cell it came from first, and only pace once it is there.
      const homeX = cellCentre(patrol.home % GRID_W);
      const homeY = cellCentre((patrol.home / GRID_W) | 0);
      const offX = (enemy.x - homeX) | 0;
      const offY = (enemy.y - homeY) | 0;
      const horizontal = patrol.axis === 0;
      const strayed = horizontal
        ? (offY > HOME_SLACK || offY < -HOME_SLACK)
        : (offX > HOME_SLACK || offX < -HOME_SLACK);

      if (strayed) {
        this.walkEnemyHome(enemy, homeX, homeY);
        continue;
      }

      // On the corridor's line. Snap the off-axis drift away, then pace.
      if (horizontal) enemy.y = homeY;
      else enemy.x = homeX;

      const lowCell = horizontal ? patrol.lo % GRID_W : (patrol.lo / GRID_W) | 0;
      const low = cellCentre(lowCell);
      const high = cellCentre((lowCell + patrol.length - 1) | 0);

      const at = horizontal ? enemy.x : enemy.y;
      let next = (at + ENEMY_SPEED * enemy.dir) | 0;
      if (next >= high) { next = high; enemy.dir = -1; }
      else if (next <= low) { next = low; enemy.dir = 1; }
      // Belt and braces: the corridor was measured from open cells, so this
      // should always pass. It is here so that no future change to how a
      // patrol is derived can put an enemy inside a wall again.
      if (horizontal) { if (this.enemyFits(next, enemy.y)) enemy.x = next; else enemy.dir = (-enemy.dir) | 0; }
      else { if (this.enemyFits(enemy.x, next)) enemy.y = next; else enemy.dir = (-enemy.dir) | 0; }
    }
  }

  /** Head back toward the cell this enemy was drawn in, one axis at a time. */
  private walkEnemyHome(enemy: Enemy, homeX: number, homeY: number): void {
    const stepX = (ENEMY_SPEED * sign((homeX - enemy.x) | 0)) | 0;
    const stepY = (ENEMY_SPEED * sign((homeY - enemy.y) | 0)) | 0;
    if (stepX !== 0 && this.enemyFits(towards(enemy.x, homeX, ENEMY_SPEED), enemy.y)) {
      enemy.x = towards(enemy.x, homeX, ENEMY_SPEED);
    }
    if (stepY !== 0 && this.enemyFits(enemy.x, towards(enemy.y, homeY, ENEMY_SPEED))) {
      enemy.y = towards(enemy.y, homeY, ENEMY_SPEED);
    }
  }

  /**
   * Does an enemy body centred here clear the walls?
   *
   * The same test the player gets. v1 checked a single point, so an enemy could
   * stand with three quarters of itself inside a wall and the check was happy.
   */
  private enemyFits(x: number, y: number): boolean {
    return this.fits(x, y);
  }

  /** The sword. Strength decides how long what you hit stays down. */
  private strike(): void {
    const dx = FACE_DX[this.facing] as number;
    const dy = FACE_DY[this.facing] as number;

    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      if (enemy.down !== 0) continue;
      if (enemy.stun > 0) continue;

      // Measured from YOU, not from the blade's tip.
      //
      // v1 and v2 asked whether the enemy was within a cell of the tip, which
      // is a ring 0.6 to 2.6 cells ahead with a hole in the middle. An enemy
      // standing on top of you -- exactly when you most want to swing -- fell
      // through the hole, so you took hits while swinging and nothing
      // happened. Reported from a real game.
      const away = chebyshev(enemy.x, enemy.y, this.x, this.y);
      if (away > this.reach) continue;

      // ...and it has to be in front of you, unless it is close enough to be
      // touching, in which case which way you happen to face is not something
      // a player is tracking while being chased.
      const ahead = (((enemy.x - this.x) | 0) * dx + ((enemy.y - this.y) | 0) * dy) | 0;
      if (away > BODY + BODY && ahead < 0) continue;

      this.struckThisTick = true;

      if (this.kills) {
        enemy.hp = (enemy.hp - 1) | 0;
        if (enemy.hp <= 0) {
          enemy.down = 1;
          enemy.chasing = 0;
          enemy.stun = 0;
          this.killedThisTick = true;
          continue;
        }
      } else {
        // A wand does not wear an enemy down: every wave is the same wave, and
        // waving again at something already frozen just tops the freeze up.
        this.frozeThisTick = true;
      }

      enemy.stun = this.stunTicks | 0;
      enemy.chasing = 0;

      // Knocked back along the swing, as far as the room allows. The whole
      // body has to land clear: v1 tested the destination as a point, so a
      // shove could park an enemy half inside a wall.
      const shoveX = (enemy.x + sign((enemy.x - this.x) | 0) * ONE) | 0;
      const shoveY = (enemy.y + sign((enemy.y - this.y) | 0) * ONE) | 0;
      if (this.enemyFits(shoveX, enemy.y)) enemy.x = towards(enemy.x, shoveX, ONE);
      if (this.enemyFits(enemy.x, shoveY)) enemy.y = towards(enemy.y, shoveY, ONE);
    }
  }

  private touchEnemies(): void {
    if (this.mercy > 0) return;
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      if (enemy.down !== 0) continue;
      if (enemy.stun > 0) continue;
      if (chebyshev(enemy.x, enemy.y, this.x, this.y) > BODY + BODY) continue;

      this.hp = (this.hp - 1) | 0;
      this.mercy = MERCY_TICKS;
      this.hurtThisTick = true;

      // Thrown clear, not nudged: landing still inside the guard means the
      // next hit arrives the moment mercy ends.
      const awayX = (this.x + sign((this.x - enemy.x) | 0) * ONE * 2) | 0;
      const awayY = (this.y + sign((this.y - enemy.y) | 0) * ONE * 2) | 0;
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
      if (chebyshev(tx, ty, this.x, this.y) <= GRAB) {
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
      if (enemy.down !== 0) continue;
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
      h = hashInt32(h, enemy.hp);
      h = hashInt32(h, enemy.down);
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
    if (this.killedThisTick) return "Got it.";
    if (this.frozeThisTick) return "Frozen solid.";
    if (this.struckThisTick) return "Down it goes.";
    return null;
  }

  // --- presentation, never hashed ------------------------------------------------

  where(): { x: number; y: number; facing: number } {
    return { x: this.x, y: this.y, facing: this.facing };
  }
  enemyPositions(): Array<{ x: number; y: number; stunned: boolean; chasing: boolean }> {
    return this.enemies
      .filter((e) => e.down === 0)
      .map((e) => ({ x: e.x, y: e.y, stunned: e.stun > 0, chasing: e.chasing !== 0 }));
  }
  /** Enemies still standing, for the HUD. Presentation only. */
  enemiesLeft(): number {
    let n = 0;
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      if ((this.enemies[i] as Enemy).down === 0) n = (n + 1) | 0;
    }
    return n;
  }
  /** True on the tick a swing finished one off. Presentation only. */
  justKilled(): boolean { return this.killedThisTick; }
  /** True on the tick a wave froze one. Presentation only. */
  justFroze(): boolean { return this.frozeThisTick; }
  /** Whether this creature's swing can kill at all. Presentation only. */
  canKill(): boolean { return this.kills; }
  merciful(): boolean { return this.mercy > 0; }
  swinging(): boolean { return this.swing > 0; }
  /** Ticks left of the current swing, for drawing the arc. Presentation only. */
  swingLeft(): number { return this.swing; }
  swingLength(): number { return SWING_TICKS; }
  justStruck(): boolean { return this.struckThisTick; }
  justHurt(): boolean { return this.hurtThisTick; }
  /** True while any guard has noticed you. Presentation only. */
  hunted(): boolean {
    return this.enemies.some((e) => e.down === 0 && e.chasing !== 0 && e.stun === 0);
  }
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
