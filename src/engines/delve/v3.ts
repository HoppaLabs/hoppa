// Delve, behaviour version 3.
//
// Day 3 behaviour, in full: everything v2 does -- turns, treasure, an exit that
// opens once every gem is collected, a 999-turn cap, an absorbing end state --
// plus guards:
//
//   * guards patrol the corridor they stand in, ping-ponging at walls, derived
//     from geometry alone (see core/patrol.ts)
//   * a turn is: you move, then every guard moves
//   * a guard sharing your cell, or swapping through you, CATCHES you: lost
//   * a guard ending its turn within the noise radius SPOTS you: alert rises
//   * alert reaching ALERT_MAX loses the game
//
// Guard positions are a pure function of the turn counter, so they are not
// stored and not hashed -- replaying a log cannot drift them.
//
// NEVER edit this file's behaviour in place. Add v4.ts.

import { hashInit, hashInt32 } from "../../core/hash.ts";
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

export const DELVE_V3_BEHAVIOUR = 3;

/** Unchanged from v2. See docs/adr/0003. */
export const TURN_CAP = 999;
export const MAX_TREASURE = 8;

/**
 * How close a guard has to be to hear you, as a Chebyshev radius -- so radius 1
 * is the eight cells around it. Sound, not sight: walls do not block it, which
 * is both what "noise radius" means in spec S6 and far easier for a kid to
 * predict than a line-of-sight cone.
 *
 * Day 4 scales this with the creature's MASS ("you're loud", spec S5). Until
 * creatures exist, every delver is this loud.
 */
export const NOISE_RADIUS = 1;

/**
 * Alert runs 0..3, the four values spec S8 budgets in the solver state. Reaching
 * the top loses, so a default delver survives two spottings and dies on the
 * third. Day 4 wires GUARD -- "how many spottings you survive" -- to this.
 *
 * Alert does not decay. Three strikes is easy to explain and easy to feel; a
 * cooldown would be another number nobody asked for.
 */
export const ALERT_MAX = 3;

const CONSUMES: ReadonlySet<Capability> = new Set<Capability>(["GUARD"]);

export class DelveV3 implements Engine {
  readonly id = "delve" as const;
  readonly behaviourVersion = DELVE_V3_BEHAVIOUR;
  readonly consumes = CONSUMES;

  private readonly level: Level;
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

  constructor(level: Level) {
    if (level.treasureCells.length > MAX_TREASURE) {
      throw new Error(
        `level has ${level.treasureCells.length} treasures; delve v3 can track ${MAX_TREASURE} ` +
          `(see spec S13 check L5)`,
      );
    }
    this.level = level;
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

    const wasTurn = this.turn | 0;
    this.turn = (this.turn + 1) | 0;

    // You walked into a cell a guard was standing in. This also covers the
    // swap -- trading places with a guard in a one-wide corridor is walking
    // into it, not slipping past it.
    if (this.standingOnGuardAt(wasTurn)) return this.capture();

    // Guards move, then a guard that walked onto you has you.
    if (this.standingOnGuardAt(this.turn)) return this.capture();

    const here = idx(this.x, this.y);
    const slot = this.level.treasureSlot[here] as number;
    if (slot >= 0) this.collected = (this.collected | (1 << slot)) | 0;

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

    // Heard, but not touched.
    if (this.guardWithinNoiseRadius()) {
      this.spottedThisTurn = true;
      this.alert = (this.alert + 1) | 0;
      if (this.alert >= ALERT_MAX) {
        this.status = STATUS_LOST;
        return this.status;
      }
    }

    if (this.turn >= TURN_CAP) this.status = STATUS_LOST;

    return this.status;
  }

  private capture(): Status {
    this.caught = true;
    this.alert = ALERT_MAX;
    this.status = STATUS_LOST;
    return this.status;
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
      if (chebyshev <= NOISE_RADIUS) return true;
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
    return h | 0;
  }

  message(): string | null {
    if (this.status === STATUS_WON) return "Out, and heavier than you went in.";
    if (this.status === STATUS_LOST) {
      if (this.caught) return "A hand closed round your ankle.";
      if (this.alert >= ALERT_MAX) return "They knew exactly where you were.";
      return "The dark got bored of waiting.";
    }
    if (this.spottedThisTurn) return "Something heard that.";
    if (this.rattledExit) return "Shut. It wants the treasure first.";
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
    return ALERT_MAX;
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
