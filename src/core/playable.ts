// Can you actually get there?
//
// reach.ts answers "is this cell connected to the start through open space",
// which is the right question for a game seen from above and the wrong one for
// a game with gravity. From the side you cannot walk upwards: an open cell one
// row above your head is connected, and unreachable, and the difference is the
// whole of what makes a side-on level playable or a waste of an afternoon.
//
// This has been wanted four times -- a guard in a one-wide corridor (day 3), a
// level nobody loud could win (day 4), floors too far apart to jump (day 8) --
// and the third of those is the one that reproduces, so it is the one this
// answers. See docs/adr/0017.
//
// IT IS DELIBERATELY GENEROUS. Where the real physics is hard to model, this
// assumes you CAN do it: air control is unlimited, and a run-up is never
// required. So a cell it calls unreachable is unreachable for certain, and a
// cell it calls reachable might still be hard. False alarms tell a child their
// good level is broken; missed problems only cost them the attempt the share
// gate was going to make them play anyway. Only one of those is worth risking.

import { GRID_AREA, GRID_H, GRID_W, idx } from "./grid.ts";
import { isLadder, isWall, type Level } from "./level.ts";

/**
 * The tallest step each strength can climb, in cells, by pips 0..5.
 *
 * MEASURED from dash/1, not derived: `test/playable.test.ts` drives the real
 * engine at every strength and every step height and fails if this table drifts
 * from what the game actually does. A jump arc is velocity, gravity, body size
 * and landing checks together, and an arithmetic guess at it would be wrong in
 * exactly the cases that matter.
 *
 * Note the first entry. A creature with NO strength cannot climb any step at
 * all -- it goes where flat ground and ladders take it and nowhere else.
 */
export const STEP_UP_BY_PIP: readonly number[] = [0, 1, 1, 1, 2, 2];

/** The best any creature can manage, for "is this broken for everybody". */
export const BEST_STEP_UP = 2;
/** What a middling creature manages, for "you would need to be strong". */
export const TYPICAL_STEP_UP = 1;

function open(level: Level, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  return !isWall(level, x, y);
}

/**
 * Can you stand here? Either something solid under your feet, or a ladder to
 * hold on to. Standing is what lets you walk and what lets you push off.
 */
function supported(level: Level, x: number, y: number): boolean {
  if (isLadder(level, x, y)) return true;
  if (y + 1 >= GRID_H) return true; // the floor of the world
  if (isWall(level, x, y + 1)) return true;
  return isLadder(level, x, y + 1);
}

/**
 * Every cell you can get to from (fromX, fromY) in a game with gravity.
 *
 * `stepUp` is how many cells you can rise from standing. The moves are: walk
 * along anything you can stand on, climb a ladder, jump straight up through
 * open cells, drift sideways while in the air, and fall.
 */
export function reachableWithGravity(
  level: Level,
  fromX: number,
  fromY: number,
  stepUp: number,
): Uint8Array {
  const seen = new Uint8Array(GRID_AREA);
  if (!open(level, fromX, fromY)) return seen;

  const queue = new Int16Array(GRID_AREA);
  let head = 0;
  let tail = 0;
  const push = (x: number, y: number): void => {
    if (!open(level, x, y)) return;
    const cell = idx(x, y);
    if (seen[cell] === 1) return;
    seen[cell] = 1;
    queue[tail] = cell | 0;
    tail = (tail + 1) | 0;
  };

  push(fromX, fromY);

  while (head < tail) {
    const cell = queue[head] as number;
    head = (head + 1) | 0;
    const x = (cell % GRID_W) | 0;
    const y = ((cell / GRID_W) | 0) | 0;

    // Gravity is not optional. Anywhere with air beneath it, you go down.
    push(x, (y + 1) | 0);

    const standing = supported(level, x, y);

    // Sideways. On the ground you walk; in the air you steer, which this lets
    // you do freely -- see the note at the top about being generous.
    push((x - 1) | 0, y);
    push((x + 1) | 0, y);

    if (isLadder(level, x, y)) push(x, (y - 1) | 0);

    if (standing) {
      // Up, one cell at a time, stopping at the first ceiling. You cannot jump
      // through a floor, so the whole column has to be clear.
      for (let k = 1; k <= stepUp; k = (k + 1) | 0) {
        const ny = (y - k) | 0;
        if (!open(level, x, ny)) break;
        push(x, ny);
      }
    }
  }

  return seen;
}

/** Where the start ends up once it has fallen, which is where play begins. */
export function landingFrom(level: Level, startX: number, startY: number): { x: number; y: number } {
  let y = startY | 0;
  while (y + 1 < GRID_H && open(level, startX, (y + 1) | 0) && !isLadder(level, startX, y)) {
    y = (y + 1) | 0;
  }
  return { x: startX | 0, y };
}
