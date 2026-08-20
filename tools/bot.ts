// A bot that plays a level, so "is this finishable" can be answered by finishing
// it rather than by reasoning about it.
//
// The spec's L3 and L4 checks ask whether the exit and the treasure are
// REACHABLE -- a flood fill over open cells. That is the right check for a
// child's level editor, because it is fast and it never says no to something
// that would have worked. It is not a proof that a room can be beaten: it knows
// nothing about guards, hearts, gravity, or a two-minute clock.
//
// This drives the real engine, tick by tick, through the real input masks. When
// it wins, the level is beatable by definition, and the log it returns is a
// replayable proof of exactly that.
//
// It is deliberately not clever. A bot that needs to be clever to finish a room
// is telling you the room is too hard for the front door of a children's game.

import { GRID_H, GRID_W, idx } from "../src/core/grid.ts";
import { cellCentre } from "../src/core/fixed.ts";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import type { Creature } from "../src/core/creature.ts";
import {
  TILE_EXIT_LOCKED,
  TILE_EXIT_OPEN,
  TILE_LADDER,
  TILE_TREASURE,
  TILE_WALL,
} from "../src/core/tiles.ts";
import {
  HELD_ACT,
  HELD_DOWN,
  HELD_LEFT,
  HELD_RIGHT,
  HELD_SWING,
  HELD_UP,
  STATUS_PLAYING,
  STATUS_WON,
} from "../src/engines/types.ts";

/**
 * Walls and ladders come from the LEVEL, never from render().
 *
 * The renderer draws the player over whatever tile it is standing on, so a bot
 * that reads ladders off the picture cannot see the ladder it is holding. That
 * cost an afternoon: it walked to the ladder, lost sight of it, walked away,
 * saw it again, and paced on the spot.
 */
interface LevelBits {
  readonly walls: Uint8Array;
  readonly ladders: Uint8Array;
}

/** What the engine has to tell us for the bot to steer at all. */
interface Playable {
  step(held: number): number;
  render(): Uint8Array;
  position(): { x: number; y: number };
  /** Subcell position. Steering on whole cells alone clips corners. */
  where?(): { x: number; y: number; facing: number };
  currentStatus(): number;
  collectedCount(): number;
  treasureTotal(): number;
  health?(): { hp: number; max: number };
  enemyPositions?(): Array<{ x: number; y: number; stunned: boolean; chasing: boolean }>;
  onGround?(): boolean;
  onLadder?(): boolean;
}

export interface Attempt {
  readonly won: boolean;
  readonly ticks: number;
  readonly seconds: number;
  readonly treasure: string;
  readonly hearts: string;
  /** The presses, in order. Replaying these into a fresh engine wins again. */
  readonly log: readonly number[];
  readonly why: string;
}

/**
 * Where the bot wants to be, read off what the engine is drawing right now.
 *
 * The NEAREST gem, not the first one on the grid. Taking them in reading order
 * sends it to the top of a three-floor room and back down again for the rest,
 * which ran the two-minute clock out on a room a child finishes in thirty
 * seconds. Straight-line distance is enough: the route is worked out separately
 * and this only has to choose between gems.
 */
function goal(tiles: Uint8Array, fromX: number, fromY: number): number {
  let exit = -1;
  let gem = -1;
  let best = Number.MAX_SAFE_INTEGER;
  for (let cell = 0; cell < tiles.length; cell++) {
    const tile = tiles[cell] as number;
    if (tile === TILE_EXIT_OPEN || tile === TILE_EXIT_LOCKED) exit = cell;
    if (tile !== TILE_TREASURE) continue;
    const away = Math.abs((cell % GRID_W) - fromX) + Math.abs(((cell / GRID_W) | 0) - fromY);
    if (away < best) {
      best = away;
      gem = cell;
    }
  }
  return gem >= 0 ? gem : exit;
}

/**
 * Shortest path over open cells, four ways.
 *
 * Walls come from the level rather than from the render, because a guard
 * standing in a corridor is not a wall -- walking into one costs a heart, and
 * routing around every guard would make the bot better at this than a child.
 */
function routeFrom(walls: Uint8Array, from: number, to: number): number[] {
  const seen = new Int32Array(GRID_W * GRID_H).fill(-1);
  const queue: number[] = [from];
  seen[from] = from;
  for (let at = 0; at < queue.length; at++) {
    const cell = queue[at] as number;
    if (cell === to) break;
    const x = cell % GRID_W;
    const y = (cell / GRID_W) | 0;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const next = idx(nx, ny);
      if (walls[next] === 1 || seen[next] !== -1) continue;
      seen[next] = cell;
      queue.push(next);
    }
  }
  if (seen[to] === -1) return [];
  const path: number[] = [];
  for (let cell = to; cell !== from; cell = seen[cell] as number) path.push(cell);
  return path.reverse();
}

/** Which way to hold to get from one cell to the next one along. */
function towards(from: number, to: number): number {
  const fx = from % GRID_W;
  const fy = (from / GRID_W) | 0;
  const tx = to % GRID_W;
  const ty = (to / GRID_W) | 0;
  let held = 0;
  if (tx > fx) held |= HELD_RIGHT;
  if (tx < fx) held |= HELD_LEFT;
  if (ty > fy) held |= HELD_DOWN;
  if (ty < fy) held |= HELD_UP;
  return held;
}

/**
 * Play a top-down level: walk the shortest route, swing at anything in the way.
 *
 * Re-routed every tick rather than once, because the route changes when a gem
 * is picked up and because a bot that follows a stale plan into a wall tells you
 * nothing about the room.
 */
function playFromAbove(engine: Playable, walls: Uint8Array, cap: number): number[] {
  const log: number[] = [];
  for (let tick = 0; tick < cap; tick++) {
    if (engine.currentStatus() !== STATUS_PLAYING) break;
    const tiles = engine.render();
    const here = engine.position();
    const at = idx(here.x, here.y);
    const want = goal(tiles, here.x, here.y);
    if (want < 0) break;

    const path = routeFrom(walls, at, want);
    let held = 0;
    if (path.length > 0) {
      // Line up on the other axis first, THEN turn. Never a diagonal.
      //
      // A corridor is one cell wide and a body is three quarters of one, so it
      // only fits within 32 subcells of the centre line. Anything looser and
      // the bot presses "up" into a gap it cannot enter and stands there for
      // the rest of the level -- which is exactly what the first two attempts
      // at this did, at (5,12), for eighty seconds.
      //
      // The band is 30: under the 32 that fits, and over half the 50 subcells
      // the fastest build covers in a tick, because a band under half a step
      // flips the sign every tick and never settles.
      const step = path[0] as number;
      const spot = engine.where?.() ?? { x: cellCentre(here.x), y: cellCentre(here.y), facing: 0 };
      const going = towards(at, step);
      const ALIGN = 30;
      const dx = cellCentre(step % GRID_W) - spot.x;
      const dy = cellCentre((step / GRID_W) | 0) - spot.y;

      if ((going & (HELD_UP | HELD_DOWN)) !== 0 && Math.abs(dx) > ALIGN) {
        held |= dx > 0 ? HELD_RIGHT : HELD_LEFT;
      } else if ((going & (HELD_LEFT | HELD_RIGHT)) !== 0 && Math.abs(dy) > ALIGN) {
        held |= dy > 0 ? HELD_DOWN : HELD_UP;
      } else {
        held |= going;
      }
    }

    // Swing at anything close. A wand freezes and a sword kills; either way the
    // thing stops walking into us, and a child mashes this button too.
    const enemies = engine.enemyPositions?.() ?? [];
    for (const enemy of enemies) {
      if (Math.abs(enemy.x - here.x) <= 1 && Math.abs(enemy.y - here.y) <= 1) {
        held |= HELD_ACT;
        break;
      }
    }

    log.push(held);
    engine.step(held);
  }
  return log;
}

/**
 * Play a side-on level.
 *
 * Gravity means a route over open cells is not a route you can walk, so this
 * does not plan one. It answers a simpler question in a fixed order: am I on
 * the right ROW? If not, get to a ladder that spans the gap and climb it. Only
 * once the row is right does it walk towards the target.
 *
 * The order matters more than anything else here. Deciding horizontally first
 * walks to the target's column, finds no way up, turns back towards the ladder,
 * and then the column rule pulls it forwards again -- the first version of this
 * paced between x=6 and x=7 for eighty seconds.
 */
function ladderColumns(ladders: Uint8Array): Set<number> {
  const columns = new Set<number>();
  for (let cell = 0; cell < ladders.length; cell++) {
    if (ladders[cell] === 1) columns.add(cell % GRID_W);
  }
  return columns;
}

/**
 * A ladder column you can actually get on from here.
 *
 * "Spans the two rows" is not enough, and this is the trap: the built-in side
 * level has a ladder at column 4 covering rows 5 to 8 and another at column 20
 * covering rows 9 to 12. Standing on the bottom floor and wanting the top, the
 * nearest ladder that spans the gap is column 4 -- which does not come down
 * this far, so the bot walks to it and presses up against a floor for the rest
 * of the level.
 *
 * So: the ladder has to be at the row the player is standing on. Crossing three
 * floors then happens one ladder at a time, which is how a child does it too.
 */
function ladderFromHere(
  ladders: Uint8Array,
  walls: Uint8Array,
  row: number,
  going: number,
  near: number,
): number {
  let best = -1;
  for (const column of ladderColumns(ladders)) {
    if (ladders[idx(column, row)] !== 1) continue;
    // It has to lead the way we want to go -- and "not a wall above me" is not
    // that. Once ladders stand one rung proud of the deck they serve, the
    // ladder you have just climbed still has a tile at your feet and open air
    // above it, so it passed this test and the bot walked back onto the ladder
    // it was already standing on top of, forever. The next rung has to exist.
    const next = row + (going < row ? -1 : 1);
    if (next < 0 || next >= GRID_H) continue;
    if (walls[idx(column, next)] === 1) continue;
    if (ladders[idx(column, next)] !== 1) continue;
    if (best < 0 || Math.abs(column - near) < Math.abs(best - near)) best = column;
  }
  return best;
}

function playFromTheSide(engine: Playable, level: LevelBits, cap: number): number[] {
  const log: number[] = [];
  let lastX = -1;
  let lastY = -1;
  let stalled = 0;

  for (let tick = 0; tick < cap; tick++) {
    if (engine.currentStatus() !== STATUS_PLAYING) break;
    const tiles = engine.render();
    const here = engine.position();
    const spot = engine.where?.() ?? { x: cellCentre(here.x), y: cellCentre(here.y), facing: 0 };
    const want = goal(tiles, here.x, here.y);
    if (want < 0) break;
    const wx = want % GRID_W;
    const wy = (want / GRID_W) | 0;

    // Stalling is measured in SUBCELLS, not cells. Hanging at the top of a
    // ladder, the cell does not change for a hundred ticks while the climb is
    // still creeping upwards a few subcells at a time.
    if (spot.x === lastX && spot.y === lastY) stalled++;
    else stalled = 0;
    lastX = spot.x;
    lastY = spot.y;

    let held = 0;
    const holding = engine.onLadder?.() === true;

    if (holding) {
      // The engine's own answer, not the picture and not the level: at the top
      // of a ladder the body still overlaps the floor it is about to step onto,
      // so "am I on a ladder" and "is there a ladder tile here" disagree.
      //
      // Climb until climbing stops helping, then step off sideways.
      if (stalled > 4 || wy === here.y) {
        held |= wx > here.x ? HELD_RIGHT : wx < here.x ? HELD_LEFT : 0;
        // Stepping off the top of a ladder onto the floor it serves needs the
        // body CLEAR of that floor, not merely in the row above it: a body is
        // three quarters of a cell and the climb stops as soon as the cell
        // changes. Keep climbing while the step sideways is going nowhere.
        if (stalled > 10) held |= HELD_UP;
      } else {
        held |= wy < here.y ? HELD_UP : HELD_DOWN;
      }
    } else if (wy !== here.y) {
      const column = ladderFromHere(level.ladders, level.walls, here.y, wy, here.x);
      if (column < 0) {
        held |= wx > here.x ? HELD_RIGHT : wx < here.x ? HELD_LEFT : 0;
      } else if (here.x !== column) {
        held |= column > here.x ? HELD_RIGHT : HELD_LEFT;
      } else {
        // Line up with the ladder before climbing it. A ladder through a hole
        // in a floor is a one-cell gap, and a body three quarters of a cell
        // wide only fits within 32 subcells of the centre -- off-centre, the
        // climb just stops at the floor and holds up forever.
        const dx = cellCentre(column) - spot.x;
        if (Math.abs(dx) > 30) held |= dx > 0 ? HELD_RIGHT : HELD_LEFT;
        else held |= wy < here.y ? HELD_UP : HELD_DOWN;
      }
    } else if (wx > here.x) {
      held |= HELD_RIGHT;
    } else if (wx < here.x) {
      held |= HELD_LEFT;
    }

    // Swing at anything close. From the side the weapon is its own button --
    // the action key is the jump -- so this is HELD_SWING, not HELD_ACT.
    for (const enemy of engine.enemyPositions?.() ?? []) {
      if (Math.abs(enemy.x - here.x) <= 1 && Math.abs(enemy.y - here.y) <= 1) {
        held |= HELD_SWING;
        break;
      }
    }

    // Still nowhere? Jump. Covers a step up and a ledge that walking will not
    // clear.
    if (stalled > 8) held |= HELD_ACT;

    log.push(held);
    engine.step(held);
  }
  return log;
}

/** Hand a level and a creature to the bot and see whether it gets out. */
export function botPlays(text: string, creature: Creature, cap = 3600): Attempt {
  const level = parseLevel(text);
  const engine = engineFor(level, creature) as unknown as Playable;
  const sideOn = level.engine === "dash";

  const log = sideOn
    ? playFromTheSide(engine, level, cap)
    : playFromAbove(engine, level.walls, cap);

  const status = engine.currentStatus();
  const health = engine.health?.() ?? { hp: 0, max: 0 };
  const won = status === STATUS_WON;
  return {
    won,
    ticks: log.length,
    seconds: (log.length / 30) | 0,
    treasure: `${engine.collectedCount()}/${engine.treasureTotal()}`,
    hearts: health.max === 0 ? "n/a" : `${health.hp}/${health.max}`,
    log,
    why: won
      ? "out"
      : status === STATUS_PLAYING
        ? "ran out of ticks"
        : health.hp <= 0
          ? "died"
          : "lost",
  };
}

/** Replay a log into a fresh engine. The proof that the win was not a fluke. */
export function replayWins(text: string, creature: Creature, log: readonly number[]): boolean {
  const engine = engineFor(parseLevel(text), creature) as unknown as Playable;
  for (const held of log) {
    if (engine.currentStatus() !== STATUS_PLAYING) break;
    engine.step(held);
  }
  return engine.currentStatus() === STATUS_WON;
}

void TILE_WALL;
