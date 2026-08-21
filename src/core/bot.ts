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

import { GRID_H, GRID_W, idx } from "./grid.ts";
import { cellCentre } from "./fixed.ts";
import { parseLevel, type Level } from "./level.ts";
import { engineFor } from "../engines/registry.ts";
import type { Creature } from "./creature.ts";
import { capsToBuild, clampPip } from "./creature.ts";
import { stepTableFor } from "./playable.ts";
import {
  TILE_EXIT_LOCKED,
  TILE_EXIT_OPEN,
  TILE_LADDER,
  TILE_TREASURE,
  TILE_WALL,
} from "./tiles.ts";
import {
  HELD_ACT,
  HELD_DOWN,
  HELD_LEFT,
  HELD_RIGHT,
  HELD_SWING,
  HELD_UP,
  STATUS_PLAYING,
  STATUS_WON,
} from "../engines/types.ts";

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
  readonly fires: Uint8Array;
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

/**
 * Handed back out so a page can watch a run without importing the registry.
 *
 * The eleven engine builds are the expensive part -- 114 kilobytes of the
 * level editor's lazy chunk -- and a page that wants to WATCH the bot needs
 * both the log and the engine to play it back through. Re-exported here so one
 * import() gets both and neither ends up in the page's first download.
 */
export { engineFor } from "../engines/registry.ts";

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
function routeFrom(
  walls: Uint8Array,
  from: number,
  to: number,
  fires: Uint8Array | null = null,
): number[] {
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
      if (fires !== null && fires[next] === 1) continue;
      seen[next] = cell;
      queue.push(next);
    }
  }
  if (seen[to] === -1) return [];
  const path: number[] = [];
  for (let cell = to; cell !== from; cell = seen[cell] as number) path.push(cell);
  return path.reverse();
}

/**
 * The way round the fire if there is one, and through it if there is not.
 *
 * Fire never blocks a route -- walking through costs a heart and you carry on
 * -- so refusing to cross it would make the bot fail levels a child would
 * finish. But taking a heart when a dry way exists would make the bot WORSE
 * than a child, and the point of it is to be no better than one.
 */
function routeAvoidingFire(bits: LevelBits, from: number, to: number): number[] {
  const dry = routeFrom(bits.walls, from, to, bits.fires);
  if (dry.length > 0) return dry;
  return routeFrom(bits.walls, from, to);
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
function playFromAbove(engine: Playable, level: LevelBits, cap: number): number[] {
  const log: number[] = [];
  for (let tick = 0; tick < cap; tick++) {
    if (engine.currentStatus() !== STATUS_PLAYING) break;
    const tiles = engine.render();
    const here = engine.position();
    const at = idx(here.x, here.y);
    const want = goal(tiles, here.x, here.y);
    if (want < 0) break;

    const path = routeAvoidingFire(level, at, want);
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


/**
 * Is there something to stand on in this cell?
 *
 * The floor of the world counts: you cannot fall off the bottom row.
 */
function footing(bits: LevelBits, x: number, y: number): boolean {
  if (x < 0 || x >= GRID_W || y < 0) return false;
  if (y + 1 >= GRID_H) return true;
  const under = idx(x, (y + 1) | 0);
  return bits.walls[under] === 1 || bits.ladders[under] === 1;
}

/**
 * A gap in the floor ahead, and somewhere to land on the other side.
 *
 * THIS IS THE ONE THE BOT DID NOT HAVE. A hole in a deck reads well and plays
 * well, and the bot walked into every one of them and fell -- which meant no
 * side-on room could ever ask for a jump, because a room the bot cannot finish
 * cannot ship. It is written down in tools/pack.ts as the reason room 9 lost
 * its hole: "it does not jump gaps, so it fell in every time."
 *
 * A jump carries two cells and lands short of a third, measured, so the far
 * side is looked for at two and at three -- three because a jump that starts a
 * little early still gets there, and a bot that will not try a gap it might
 * clear is a bot that fails rooms a child finishes.
 *
 * Returns false when there is nothing to land on, because then the hole is not
 * a gap to jump, it is a way DOWN, and jumping into it is worse than falling.
 */
const JUMP_REACH = 3;

function gapAhead(bits: LevelBits, x: number, y: number, facing: number): boolean {
  const first = (x + facing) | 0;
  if (first < 0 || first >= GRID_W) return false;
  // A wall in the way is a step, not a gap -- that is a different jump.
  if (bits.walls[idx(first, y)] === 1) return false;
  if (footing(bits, first, y)) return false;
  for (let d = 2; d <= JUMP_REACH; d = (d + 1) | 0) {
    const far = (x + facing * d) | 0;
    if (far < 0 || far >= GRID_W) break;
    if (bits.walls[idx(far, y)] === 1) break;
    if (footing(bits, far, y)) return true;
  }
  return false;
}

/**
 * A step up ahead that a jump would clear.
 *
 * The bot used to find these by walking into them and waiting eight ticks for
 * the stall counter, which works and wastes a second of a two-minute clock
 * every time. Seeing it coming is both quicker and what a child does.
 */
function stepAhead(bits: LevelBits, x: number, y: number, facing: number, stepUp: number): boolean {
  const first = (x + facing) | 0;
  if (first < 0 || first >= GRID_W) return false;
  if (bits.walls[idx(first, y)] !== 1) return false;
  for (let k = 1; k <= stepUp; k = (k + 1) | 0) {
    const ny = (y - k) | 0;
    if (ny < 0) return false;
    // The column above our own head has to be clear, or the jump hits a ceiling.
    if (bits.walls[idx(x, ny)] === 1) return false;
    if (bits.walls[idx(first, ny)] !== 1) return true;
  }
  return false;
}


/**
 * A route through a room WITH GRAVITY in it.
 *
 * routeFrom() floods four ways over open cells, which is the right question
 * from above and the wrong one from the side: it will happily route straight
 * up through thin air. That is why the side-on bot never had a route at all --
 * it answered "am I on the right row" instead, and a room whose answer was
 * "jump onto that ledge" could not be expressed, so no room was allowed to ask.
 *
 * The moves here are the ones the game actually has, and deliberately the SAME
 * ones src/core/playable.ts uses for the editor's "you cannot get up there"
 * warning -- so the bot and the warning agree about what is possible, which
 * they did not before:
 *
 *   fall     always, into open air below
 *   walk     sideways, along the ground or steering in the air
 *   climb    up a ladder
 *   jump     up to `stepUp` cells from standing, through a clear column
 *
 * Returns the cells to visit, nearest first, or nothing if there is no way.
 */
function routeWithGravity(
  bits: LevelBits,
  from: number,
  to: number,
  stepUp: number,
): number[] {
  const clear = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && bits.walls[idx(x, y)] !== 1;

  const seen = new Int32Array(GRID_W * GRID_H).fill(-1);
  const queue: number[] = [from];
  seen[from] = from;

  for (let at = 0; at < queue.length; at++) {
    const cell = queue[at] as number;
    if (cell === to) break;
    const x = (cell % GRID_W) | 0;
    const y = ((cell / GRID_W) | 0) | 0;
    const push = (nx: number, ny: number): void => {
      if (!clear(nx, ny)) return;
      const next = idx(nx, ny);
      if (seen[next] !== -1) return;
      seen[next] = cell;
      queue.push(next);
    };

    push(x, (y + 1) | 0);                       // gravity is not optional
    push((x - 1) | 0, y);
    push((x + 1) | 0, y);
    if (bits.ladders[cell] === 1) push(x, (y - 1) | 0);

    if (footing(bits, x, y) || bits.ladders[cell] === 1) {
      for (let k = 1; k <= stepUp; k = (k + 1) | 0) {
        const ny = (y - k) | 0;
        if (!clear(x, ny)) break;               // no jumping through a floor
        push(x, ny);
      }
    }
  }

  if (seen[to] === -1) return [];
  const path: number[] = [];
  for (let cell = to; cell !== from; cell = seen[cell] as number) path.push(cell);
  return path.reverse();
}

function playFromTheSide(
  engine: Playable,
  level: LevelBits,
  cap: number,
  stepUp: number,
): number[] {
  const log: number[] = [];
  let lastX = -1;
  let lastY = -1;
  let stalled = 0;
  // Once you have pushed off, you are committed.
  //
  // The route is worked out afresh every tick, which is right on the ground
  // and wrong in the air: a body a third of the way across a gap gets a route
  // that says go back, and a tick later one that says go on, and the two
  // answers alternate. Traced on room 9 -- it hung between two columns four
  // cells up, holding left, right, left, right, until the clock ran out.
  //
  // So a jump holds its direction for as long as a jump lasts. Which is what a
  // person does: you do not change your mind halfway over a hole.
  let flightWay = 0;

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
    const rising = lastY >= 0 && spot.y < lastY;
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
        // Stepping off a ladder onto the floor it serves needs the body CLEAR
        // of that floor, not merely in the row beside it: a body is three
        // quarters of a cell and the climb stops as soon as the cell changes.
        // Keep going while the step sideways is going nowhere -- and keep
        // going THE WAY YOU WERE HEADED. Always pressing up meant a bot
        // climbing DOWN to a step beside the ladder rose back through the deck
        // it had just come through, fell to the rung below, and did that until
        // the clock ran out. Traced, on room 4, for two minutes.
        if (stalled > 10) {
          // Which way clears it depends on WHAT IS IN THE WAY. A body is three
          // quarters of a cell, so standing on the rung level with a deck it
          // still overlaps the row above: stepping off is blocked by the deck
          // at head height, and the way out is DOWN. Coming up the other side,
          // the block is at foot height and the way out is up. Always pressing
          // up meant a bot climbing down to a step beside the ladder rose back
          // through the deck it had just come through, fell to the rung below,
          // and did that until the clock ran out. Traced, on room 4.
          const way = wx > here.x ? 1 : wx < here.x ? -1 : 0;
          const overhead = way !== 0 && here.y > 0
            && level.walls[idx(here.x + way, here.y - 1)] === 1;
          held |= overhead ? HELD_DOWN : HELD_UP;
        }
      } else {
        held |= wy < here.y ? HELD_UP : HELD_DOWN;
      }
    } else {
      // The route decides, not the ladders.
      //
      // This used to ask "is there a ladder on my row that leads the way I
      // want to go" and take it, which is right in a room where every gem sits
      // on a floor a ladder serves and wrong the moment one does not: with a
      // gem on a step beside the ladder, the bot rode up, saw the gem below,
      // rode down, saw it above, and did that until the clock ran out. The
      // ladder was always the answer to "how do I change floors" and never to
      // "how do I get THERE".
      //
      // routeWithGravity knows about ladders, jumps and falling together, so
      // asking it is asking the right question. The ladder handling below is
      // still here -- it is how you get ON one -- but it only runs when the
      // route says a ladder is the next move.
      const path = routeWithGravity(level, idx(here.x, here.y), want, stepUp);
      const step = path[0];
      if (step === undefined) {
        held |= wx > here.x ? HELD_RIGHT : wx < here.x ? HELD_LEFT : 0;
      } else {
        const sx = (step % GRID_W) | 0;
        const sy = ((step / GRID_W) | 0) | 0;
        const onLadderTile = level.ladders[idx(here.x, here.y)] === 1;
        const intoLadder = level.ladders[step] === 1;

        if (sy !== here.y && (onLadderTile || intoLadder) && sx === here.x) {
          // Line up with the ladder before climbing it. A ladder through a
          // hole in a floor is a one-cell gap, and a body three quarters of a
          // cell wide only fits within 32 subcells of the centre -- off-centre
          // the climb just stops at the floor and holds up forever.
          const dx = cellCentre(here.x) - spot.x;
          if (Math.abs(dx) > 30) held |= dx > 0 ? HELD_RIGHT : HELD_LEFT;
          else held |= sy < here.y ? HELD_UP : HELD_DOWN;
        } else {
          // Which way, from the first step that CHANGES COLUMN -- not from the
          // first step. A route out of mid-air begins by falling, and reading
          // only the first step meant the bot let go of left and right the
          // instant its feet left the ground: it jumped straight up, landed
          // where it took off, and did it again for two minutes. Traced.
          let way = 0;
          for (const cell of path) {
            const cx = (cell % GRID_W) | 0;
            if (cx !== here.x) { way = cx > here.x ? 1 : -1; break; }
          }
          if (way !== 0) held |= way > 0 ? HELD_RIGHT : HELD_LEFT;
          // Up, and not on a ladder, means push off the ground. The sideways
          // hold stays on: the arc carries you across as well as up.
          if (sy < here.y) held |= HELD_ACT;
        }
      }
    }

    // Swing at anything close. From the side the weapon is its own button --
    // the action key is the jump -- so this is HELD_SWING, not HELD_ACT.
    for (const enemy of engine.enemyPositions?.() ?? []) {
      if (Math.abs(enemy.x - here.x) <= 1 && Math.abs(enemy.y - here.y) <= 1) {
        held |= HELD_SWING;
        break;
      }
    }

    // A hole in the deck ahead, with the far side within a jump: go over it.
    // Without this the bot walked into every gap and fell, which is why no
    // side-on room was allowed to have one.
    {
      const way = (held & HELD_RIGHT) !== 0 ? 1 : (held & HELD_LEFT) !== 0 ? -1 : 0;
      if (way !== 0 && !holding) {
        if (gapAhead(level, here.x, here.y, way)) held |= HELD_ACT;
        else if (stepAhead(level, here.x, here.y, way, stepUp)) held |= HELD_ACT;
      }
    }

    // Spikes ahead: jump them.
    //
    // The top-down loop routes round fire, because from above there is always
    // a way round if there is one at all. From the side there is no round --
    // the floor is the floor -- so the answer is over, which is what the jump
    // button is for. Without this the bot walked into the same bed of spikes
    // until it ran out of hearts, on a level all three creatures can clear.
    const facing = (held & HELD_RIGHT) !== 0 ? 1 : (held & HELD_LEFT) !== 0 ? -1 : 0;
    if (facing !== 0) {
      const ahead = here.x + facing;
      if (ahead >= 0 && ahead < GRID_W && level.fires[idx(ahead, here.y)] === 1) {
        held |= HELD_ACT;
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
  return botPlaysLevel(parseLevel(text), creature, cap);
}

/**
 * The same, for a level that is already parsed.
 *
 * The page has one in its hand and no text to give -- and parsing a level back
 * out of text it just built, to hand it straight to the engine it is already
 * running, is work for nothing on a phone.
 */
export function botPlaysLevel(level: Level, creature: Creature, cap = 3600): Attempt {
  const engine = engineFor(level, creature) as unknown as Playable;
  // Only gravity needs the jumping router. Swimming is free movement, which is
  // the same contract the top-down router already solves -- which is the single
  // practical reason this engine is affordable at all: the pack stays verifiable
  // and the editor's autoplay works on water from the first day.
  const sideOn = level.engine === "dash";

  // How high THIS creature can get from standing. Judged by the rules the
  // level pins, not the newest ones -- an old link keeps the jump it had.
  const pips = capsToBuild(creature.caps).FORCE;
  const table = stepTableFor(level.behaviourVersion);
  const stepUp = (table[clampPip(pips)] ?? (table[0] as number)) | 0;

  const log = sideOn
    ? playFromTheSide(engine, level, cap, stepUp)
    : playFromAbove(engine, level, cap);

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
