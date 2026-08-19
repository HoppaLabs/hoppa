// Delve, behaviour version 4.
//
// Day 4 behaviour: everything v3 does -- turns, treasure, an exit that opens
// once every gem is collected, guards on geometry-derived patrols, noise, alert
// and capture -- except that the four capabilities Delve consumes now come from
// a creature instead of being fixed:
//
//   * MASS  -- how far guards hear you. Heavy is loud (spec S6: MASS must mean
//              something different in every engine, and in Delve it costs you)
//   * GUARD -- how many spottings you survive before the alarm is fatal
//   * HASTE -- an occasional free step: you move, the world does not
//   * REACH -- a long arm picks gems up from the next cell, without stepping
//              into the open
//
// The same level plays differently per creature, which is the whole point of
// the collection loop. The creature is an INPUT, like the level and the log:
// spec S15 keys golden vectors on (level, creature, log).
//
// Guard positions remain a pure function of the turn counter, so they are not
// stored and not hashed -- replaying a log cannot drift them.
//
// NEVER edit this file's behaviour in place. Add v5.ts.

import { hashInit, hashInt32 } from "../../core/hash.ts";
import { BRUK, type Creature } from "../../core/creature.ts";
import { GRID_AREA, GRID_W, idx, inBounds } from "../../core/grid.ts";
import { isWall, type Level } from "../../core/level.ts";
import { patrolCellAt, patrolsFor, type Patrol } from "../../core/patrol.ts";
import {
  TILE_ACTOR,
  TILE_EXIT_LOCKED,
  TILE_EXIT_OPEN,
  TILE_FLOOR,
  TILE_GUARD,
  TILE_TREASURE,
  TILE_WALL,
} from "../../core/tiles.ts";
import {
  INPUT_DX,
  INPUT_DY,
  STATUS_LOST,
  STATUS_PLAYING,
  STATUS_WON,
  type Capability,
  type Engine,
  type Status,
} from "../types.ts";

export const DELVE_V4_BEHAVIOUR = 4;

/** Unchanged from v2. See docs/adr/0003. */
export const TURN_CAP = 999;
export const MAX_TREASURE = 8;

// --- how eight numbers become behaviour ------------------------------------
//
// These thresholds are pinned to behaviour version 4 forever. They are coarse on
// purpose: a kid has to be able to feel the difference between two creatures in
// one run, and a 0..255 axis that moved a radius by a fraction of a cell would
// be invisible. Alert stays inside 0..3 whatever GUARD says, because spec S8
// budgets exactly four values for it in the solver state.

/** Chebyshev radius at which a guard hears you. Sound, not sight: walls do not
 *  block it, which is what "noise radius" means and is far easier for a kid to
 *  predict than a line-of-sight cone. */
export function noiseRadiusFor(creature: Creature): number {
  return creature.caps.MASS >= 128 ? 2 : 1;
}

/** Spottings you survive: the alarm is fatal on reaching this. */
export function alertCeilingFor(creature: Creature): number {
  return creature.caps.GUARD >= 128 ? ALERT_MAX : (ALERT_MAX - 1) | 0;
}

/** Cells a gem can be lifted from. 0 means you must stand on it. */
export function reachFor(creature: Creature): number {
  return creature.caps.REACH >= 128 ? 1 : 0;
}

/** The hard ceiling on alert, whatever GUARD says. */
export const ALERT_MAX = 3;

/**
 * HASTE accumulates; every time it passes this, one step costs no turn.
 *
 * Two guards on it. The accumulator is capped, and you never get two free steps
 * in a row -- without both, a creature with HASTE near 255 banks faster than it
 * spends and every step becomes free, so the turn counter stops advancing and
 * the game never terminates. Spec S13's E4 says it must, and E2 says an
 * all-255 creature has to be playable, so this is not a hypothetical.
 */
export const HASTE_PER_STEP = 256;

const CONSUMES: ReadonlySet<Capability> = new Set<Capability>([
  "GUARD",
  "HASTE",
  "MASS",
  "REACH",
]);

export class DelveV4 implements Engine {
  readonly id = "delve" as const;
  readonly behaviourVersion = DELVE_V4_BEHAVIOUR;
  readonly consumes = CONSUMES;

  private readonly level: Level;
  private readonly creature: Creature;
  private readonly noiseRadius: number;
  private readonly alertCeiling: number;
  private readonly reach: number;
  /** HASTE accumulator. Integer only -- no PRNG, no wall clock, no drift. */
  private haste: number;
  private freeStep = false;
  private lastStepWasFree = false;
  private readonly patrols: readonly Patrol[];
  private x: number;
  private y: number;
  private turn: number;
  private collected: number;
  private alert: number;
  private status: Status;
  private readonly allTreasure: number;
  private readonly tiles: Uint8Array;
  private bumped = false;
  private rattledExit = false;
  /** Presentation only: why the last step ended the game. */
  private caught = false;
  private spottedThisTurn = false;

  constructor(level: Level, creature: Creature = BRUK) {
    if (level.treasureCells.length > MAX_TREASURE) {
      throw new Error(
        `level has ${level.treasureCells.length} treasures; delve v4 can track ${MAX_TREASURE} ` +
          `(see spec S13 check L5)`,
      );
    }
    this.level = level;
    this.creature = creature;
    this.noiseRadius = noiseRadiusFor(creature);
    this.alertCeiling = alertCeilingFor(creature);
    this.reach = reachFor(creature);
    this.haste = 0;
    this.patrols = patrolsFor(level);
    this.x = level.startX | 0;
    this.y = level.startY | 0;
    this.turn = 0;
    this.collected = 0;
    this.alert = 0;
    this.status = STATUS_PLAYING;
    this.allTreasure = ((1 << level.treasureCells.length) - 1) | 0;
    this.tiles = new Uint8Array(GRID_AREA);
  }

  step(input: number): Status {
    if (this.status !== STATUS_PLAYING) return this.status;

    const dir = input | 0;
    // An input outside the alphabet is a wait, not a crash -- and a wait is a
    // turn, so garbage still costs you, and the guards still move.
    const known = dir >= 0 && dir <= 4;

    this.bumped = false;
    this.rattledExit = false;
    this.spottedThisTurn = false;

    if (known) {
      const nx = (this.x + (INPUT_DX[dir] as number)) | 0;
      const ny = (this.y + (INPUT_DY[dir] as number)) | 0;

      if (!inBounds(nx, ny) || isWall(this.level, nx, ny)) {
        this.bumped = dir !== 0;
      } else {
        this.x = nx;
        this.y = ny;
      }
    }

    // HASTE: an occasional free step. The accumulator is integer arithmetic on
    // the creature's own number, so "occasional" is exact and replayable -- a
    // PRNG here would be both banned and unnecessary.
    this.haste = (this.haste + this.creature.caps.HASTE) | 0;
    if (this.haste > HASTE_PER_STEP * 2) this.haste = (HASTE_PER_STEP * 2) | 0;
    this.freeStep = !this.lastStepWasFree && this.haste >= HASTE_PER_STEP;
    if (this.freeStep) this.haste = (this.haste - HASTE_PER_STEP) | 0;
    this.lastStepWasFree = this.freeStep;

    const wasTurn = this.turn | 0;
    // A free step does not advance the world: you moved, the guards did not.
    if (!this.freeStep) this.turn = (this.turn + 1) | 0;

    // You walked into a cell a guard was standing in. This also covers the
    // swap -- trading places with a guard in a one-wide corridor is walking
    // into it, not slipping past it.
    if (this.standingOnGuardAt(wasTurn)) return this.capture();

    // Guards move, then a guard that walked onto you has you.
    if (this.standingOnGuardAt(this.turn)) return this.capture();

    this.collectWithinReach();

    // Reaching the way out beats the alarm and beats the clock: the exit is
    // checked before either can end the run, same as v2's "winning on the last
    // turn counts".
    if (this.x === this.level.exitX && this.y === this.level.exitY && this.level.exitX >= 0) {
      if (this.collected === this.allTreasure) {
        this.status = STATUS_WON;
        return this.status;
      }
      this.rattledExit = true;
    }

    // Heard, but not touched. A free step is the same instant as the step
    // before it, so it cannot be heard twice.
    if (!this.freeStep && this.guardWithinNoiseRadius()) {
      this.spottedThisTurn = true;
      this.alert = (this.alert + 1) | 0;
      if (this.alert >= this.alertCeiling) {
        this.status = STATUS_LOST;
        return this.status;
      }
    }

    if (this.turn >= TURN_CAP) this.status = STATUS_LOST;

    return this.status;
  }

  private capture(): Status {
    this.caught = true;
    this.alert = this.alertCeiling;
    this.status = STATUS_LOST;
    return this.status;
  }

  /**
   * Pick up every gem within REACH. Radius 0 is v3's behaviour -- stand on it.
   * Radius 1 is the long arm: "grab treasure without stepping into the open".
   */
  private collectWithinReach(): void {
    const cells = this.level.treasureCells;
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) !== 0) continue;
      const cell = cells[i] as number;
      const tx = (cell % GRID_W) | 0;
      const ty = ((cell / GRID_W) | 0) | 0;
      const dx = tx > this.x ? (tx - this.x) | 0 : (this.x - tx) | 0;
      const dy = ty > this.y ? (ty - this.y) | 0 : (this.y - ty) | 0;
      const chebyshev = dx > dy ? dx : dy;
      if (chebyshev <= this.reach) this.collected = (this.collected | (1 << i)) | 0;
    }
  }

  private standingOnGuardAt(turn: number): boolean {
    const here = idx(this.x, this.y);
    for (let i = 0; i < this.patrols.length; i = (i + 1) | 0) {
      if (patrolCellAt(this.patrols[i] as Patrol, turn) === here) return true;
    }
    return false;
  }

  private guardWithinNoiseRadius(): boolean {
    for (let i = 0; i < this.patrols.length; i = (i + 1) | 0) {
      const cell = patrolCellAt(this.patrols[i] as Patrol, this.turn);
      const gx = (cell % GRID_W) | 0;
      const gy = ((cell / GRID_W) | 0) | 0;
      const dx = gx > this.x ? (gx - this.x) | 0 : (this.x - gx) | 0;
      const dy = gy > this.y ? (gy - this.y) | 0 : (this.y - gy) | 0;
      const chebyshev = dx > dy ? dx : dy;
      if (chebyshev <= this.noiseRadius) return true;
    }
    return false;
  }

  render(): Uint8Array {
    const walls = this.level.walls;
    for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
      this.tiles[i] = walls[i] === 1 ? TILE_WALL : TILE_FLOOR;
    }

    const cells = this.level.treasureCells;
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) === 0) {
        this.tiles[cells[i] as number] = TILE_TREASURE;
      }
    }

    if (this.level.exitX >= 0) {
      this.tiles[idx(this.level.exitX, this.level.exitY)] =
        this.collected === this.allTreasure ? TILE_EXIT_OPEN : TILE_EXIT_LOCKED;
    }

    for (let i = 0; i < this.patrols.length; i = (i + 1) | 0) {
      this.tiles[patrolCellAt(this.patrols[i] as Patrol, this.turn)] = TILE_GUARD;
    }

    this.tiles[idx(this.x, this.y)] = TILE_ACTOR;
    return this.tiles;
  }

  stateHash(): number {
    // Field order is pinned forever. Guard positions are deliberately absent:
    // they are a pure function of `turn`, which is already here.
    let h = hashInit();
    h = hashInt32(h, this.x);
    h = hashInt32(h, this.y);
    h = hashInt32(h, this.turn);
    h = hashInt32(h, this.collected);
    h = hashInt32(h, this.status);
    h = hashInt32(h, this.alert);
    // The haste accumulator decides future free steps, so it is authoritative
    // state, not bookkeeping.
    h = hashInt32(h, this.haste);
    h = hashInt32(h, this.lastStepWasFree ? 1 : 0);
    return h | 0;
  }

  /**
   * Spec S15: "message() is where the personality lives." It says what the
   * game thinks of YOUR creature, so the same event reads differently
   * depending on who you brought.
   */
  message(): string | null {
    const heavy = this.creature.caps.MASS >= 128;
    const quick = this.creature.caps.HASTE >= 128;
    const armed = this.reach > 0;
    const name = this.creature.name;

    if (this.status === STATUS_WON) {
      if (heavy) return `${name} left with the lot, and everything heard it go.`;
      if (quick) return `${name} was never really there.`;
      return `${name} lifted the lot without breaking stride.`;
    }

    if (this.status === STATUS_LOST) {
      if (this.caught) {
        return heavy
          ? `They only had to reach out. ${name} was never going to duck.`
          : `A hand closed round ${name}'s ankle.`;
      }
      if (this.alert >= this.alertCeiling) {
        return heavy
          ? "Something this heavy was never meant to sneak."
          : `They worked out exactly where ${name} was.`;
      }
      return "The dark got bored of waiting.";
    }

    if (this.spottedThisTurn) {
      return heavy ? "Every floorboard gave you up." : "Something heard that.";
    }
    if (this.rattledExit) {
      return armed ? "Shut. Even your arm is not that long." : "Shut. It wants the treasure first.";
    }
    return null;
  }

  // --- presentation helpers, never part of the hash ---
  position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  didBump(): boolean {
    return this.bumped;
  }

  wasSpotted(): boolean {
    return this.spottedThisTurn;
  }

  wasCaught(): boolean {
    return this.caught;
  }

  turns(): number {
    return this.turn;
  }

  turnsLeft(): number {
    return (TURN_CAP - this.turn) | 0;
  }

  alertLevel(): number {
    return this.alert;
  }

  alertMax(): number {
    return this.alertCeiling;
  }

  who(): Creature {
    return this.creature;
  }

  noise(): number {
    return this.noiseRadius;
  }

  reachCells(): number {
    return this.reach;
  }

  /** True when the last step cost no turn. Presentation only. */
  tookFreeStep(): boolean {
    return this.freeStep;
  }

  collectedCount(): number {
    let n = 0;
    for (let i = 0; i < this.level.treasureCells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) !== 0) n = (n + 1) | 0;
    }
    return n;
  }

  treasureTotal(): number {
    return this.level.treasureCells.length | 0;
  }

  guardCount(): number {
    return this.patrols.length | 0;
  }

  exitOpen(): boolean {
    return this.collected === this.allTreasure;
  }

  currentStatus(): Status {
    return this.status;
  }
}
