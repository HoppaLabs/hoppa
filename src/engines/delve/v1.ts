// Delve, behaviour version 1.
//
// Day 1 behaviour, in full: you occupy a cell, you try to move one cell per turn,
// and a wall or the grid edge refuses the move. No turns counter, no win, no
// treasure, no guards -- those land on later days as their own behaviour version
// if they change how this one moves.
//
// NEVER edit this file's behaviour in place. Shipped links pin a behaviour
// version; a movement tweak here silently invalidates every proof ever sent.
// Add v2.ts instead and keep this build in the bundle.

import { hashInit, hashInt32 } from "../../core/hash.ts";
import { GRID_AREA, idx, inBounds } from "../../core/grid.ts";
import { isWall, type Level } from "../../core/level.ts";
import { TILE_ACTOR, TILE_FLOOR, TILE_WALL } from "../../core/tiles.ts";
import {
  INPUT_DX,
  INPUT_DY,
  STATUS_PLAYING,
  type Capability,
  type Engine,
  type Status,
} from "../types.ts";

export const DELVE_V1_BEHAVIOUR = 1;

const CONSUMES: ReadonlySet<Capability> = new Set<Capability>();

export class DelveV1 implements Engine {
  readonly id = "delve" as const;
  readonly behaviourVersion = DELVE_V1_BEHAVIOUR;
  readonly consumes = CONSUMES;

  private readonly level: Level;
  private x: number;
  private y: number;
  private readonly tiles: Uint8Array;
  /** Set when the last step was refused by a wall. Presentation only. */
  private bumped = false;

  constructor(level: Level) {
    this.level = level;
    this.x = level.startX | 0;
    this.y = level.startY | 0;
    this.tiles = new Uint8Array(GRID_AREA);
  }

  step(input: number): Status {
    const dir = input | 0;
    // An input outside the alphabet is a wait, not a crash.
    if (dir < 0 || dir > 4) {
      this.bumped = false;
      return STATUS_PLAYING;
    }

    const nx = (this.x + (INPUT_DX[dir] as number)) | 0;
    const ny = (this.y + (INPUT_DY[dir] as number)) | 0;

    if (!inBounds(nx, ny) || isWall(this.level, nx, ny)) {
      this.bumped = dir !== 0;
      return STATUS_PLAYING;
    }

    this.x = nx;
    this.y = ny;
    this.bumped = false;
    return STATUS_PLAYING;
  }

  render(): Uint8Array {
    const walls = this.level.walls;
    for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
      this.tiles[i] = walls[i] === 1 ? TILE_WALL : TILE_FLOOR;
    }
    this.tiles[idx(this.x, this.y)] = TILE_ACTOR;
    return this.tiles;
  }

  stateHash(): number {
    let h = hashInit();
    h = hashInt32(h, this.x);
    h = hashInt32(h, this.y);
    return h | 0;
  }

  message(): string | null {
    return null; // personality arrives with capabilities on day 4
  }

  /**
   * The status, which for this one is always STATUS_PLAYING.
   *
   * NOT a behaviour change, and this file's banner still holds: it reads the
   * status, it cannot alter it, nothing here touches step() or stateHash(),
   * and the golden vectors prove it. Day 1 had no win and no loss, so there is
   * nothing to return but PLAYING -- what was missing was saying so. Every
   * other engine has had this method for weeks and the Engine interface never
   * declared it, so the one build without it was invisible.
   */
  currentStatus(): Status {
    return STATUS_PLAYING;
  }

  // --- presentation helpers, never part of the hash ---
  position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  didBump(): boolean {
    return this.bumped;
  }
}
