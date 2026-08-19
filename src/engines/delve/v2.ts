// Delve, behaviour version 2.
//
// Day 2 behaviour, in full: movement is exactly v1's -- one cell per turn, walls
// and the grid edge refuse -- plus
//
//   * every step is a turn, including a wait and including a refused move
//   * stepping onto treasure collects it
//   * the exit is shut until every treasure is collected
//   * stepping onto an open exit wins
//   * running out of turns loses
//   * a finished game is over: further steps change nothing
//
// This is a NEW FILE rather than an edit to v1 because CLAUDE.md hard rule 3
// says so, and because v1 is what levels/day1.lvl and the day 1 golden vector
// pin. Both builds ship; the registry routes on the level's behaviour= field.
//
// NEVER edit this file's behaviour in place either. Add v3.ts.

import { hashInit, hashInt32 } from "../../core/hash.ts";
import { GRID_AREA, idx, inBounds } from "../../core/grid.ts";
import { isWall, type Level } from "../../core/level.ts";
import {
  TILE_ACTOR,
  TILE_EXIT_LOCKED,
  TILE_EXIT_OPEN,
  TILE_FLOOR,
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

export const DELVE_V2_BEHAVIOUR = 2;

/**
 * Turns before the dark takes you. Spec S13's E4 requires a game to terminate;
 * it does not name the number. 999 is a deliberate ceiling, not a target: spec
 * S14's sim table has a median of 118 turns, so a player who hits this was lost
 * or idle, and three digits keeps the counter from reflowing the HUD.
 */
export const TURN_CAP = 999;

/** The collected mask is 8 bits wide, matching spec S8's solver cap. */
export const MAX_TREASURE = 8;

const CONSUMES: ReadonlySet<Capability> = new Set<Capability>();

export class DelveV2 implements Engine {
  readonly id = "delve" as const;
  readonly behaviourVersion = DELVE_V2_BEHAVIOUR;
  readonly consumes = CONSUMES;

  private readonly level: Level;
  private x: number;
  private y: number;
  private turn: number;
  /** Bit i set = treasure i collected. Bit order is the level's reading order. */
  private collected: number;
  private status: Status;
  private readonly allTreasure: number;
  private readonly tiles: Uint8Array;
  /** Set when the last step was refused by a wall. Presentation only. */
  private bumped = false;
  /** Set when the last step ended on an exit that is still shut. Presentation. */
  private rattledExit = false;

  constructor(level: Level) {
    if (level.treasureCells.length > MAX_TREASURE) {
      throw new Error(
        `level has ${level.treasureCells.length} treasures; delve v2 can track ${MAX_TREASURE} ` +
          `(see spec S13 check L5)`,
      );
    }
    this.level = level;
    this.x = level.startX | 0;
    this.y = level.startY | 0;
    this.turn = 0;
    this.collected = 0;
    this.status = STATUS_PLAYING;
    // All-ones for however many treasures this level has; 0 when it has none,
    // which leaves the exit open from the first turn.
    this.allTreasure = ((1 << level.treasureCells.length) - 1) | 0;
    this.tiles = new Uint8Array(GRID_AREA);
  }

  step(input: number): Status {
    // A finished game is absorbing. Replaying a log past its winning move must
    // land on the same hash as stopping there, or every result link is a lie.
    if (this.status !== STATUS_PLAYING) return this.status;

    const dir = input | 0;
    // An input outside the alphabet is a wait, not a crash -- and a wait is a
    // turn, so garbage still costs you.
    const known = dir >= 0 && dir <= 4;

    this.bumped = false;
    this.rattledExit = false;

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

    this.turn = (this.turn + 1) | 0;

    const here = idx(this.x, this.y);
    const slot = this.level.treasureSlot[here] as number;
    if (slot >= 0) this.collected = (this.collected | (1 << slot)) | 0;

    if (this.x === this.level.exitX && this.y === this.level.exitY && this.level.exitX >= 0) {
      if (this.collected === this.allTreasure) {
        this.status = STATUS_WON;
        return this.status;
      }
      this.rattledExit = true;
    }

    // Winning on the last turn counts. The cap is only checked once the move
    // has had its chance.
    if (this.turn >= TURN_CAP) this.status = STATUS_LOST;

    return this.status;
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

    this.tiles[idx(this.x, this.y)] = TILE_ACTOR;
    return this.tiles;
  }

  stateHash(): number {
    // Field order is pinned forever: shipped links that claim a result hash
    // depend on it. Append new state at the end, never in the middle.
    let h = hashInit();
    h = hashInt32(h, this.x);
    h = hashInt32(h, this.y);
    h = hashInt32(h, this.turn);
    h = hashInt32(h, this.collected);
    h = hashInt32(h, this.status);
    return h | 0;
  }

  message(): string | null {
    if (this.status === STATUS_WON) return "Out, and heavier than you went in.";
    if (this.status === STATUS_LOST) return "The dark got bored of waiting.";
    if (this.rattledExit) return "Shut. It wants the treasure first.";
    return null; // the rest of the personality arrives with capabilities on day 4
  }

  // --- presentation helpers, never part of the hash ---
  position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  didBump(): boolean {
    return this.bumped;
  }

  turns(): number {
    return this.turn;
  }

  turnsLeft(): number {
    return (TURN_CAP - this.turn) | 0;
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

  exitOpen(): boolean {
    return this.collected === this.allTreasure;
  }

  currentStatus(): Status {
    return this.status;
  }
}
