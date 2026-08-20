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
 * The tallest step each strength can climb, in cells, by pips 0..5 -- one table
 * per side-on behaviour version, because a level pins the rules it was drawn
 * under and an old link must be judged by the jump it actually had.
 *
 * MEASURED, not derived: `test/playable.test.ts` and `test/dash-v2.test.ts`
 * drive the real engines at every strength and every step height and fail if
 * these drift from what the games do. A jump arc is velocity, gravity, body
 * size and landing checks together, and an arithmetic guess at it would be
 * wrong in exactly the cases that matter.
 *
 * Note dash/1's first entry: a creature with no strength could not climb any
 * step at all, which made a whole build a trap. That is what dash/2 fixes, and
 * why there are two tables rather than one (docs/adr/0018).
 */
const STEP_UP_BY_VERSION: Readonly<Record<number, readonly number[]>> = {
  1: [0, 1, 1, 1, 2, 2],
  2: [1, 1, 1, 2, 2, 3],
};

/** The newest side-on rules, for anything that does not name a version. */
export const STEP_UP_BY_PIP: readonly number[] = STEP_UP_BY_VERSION[2] as readonly number[];

/** The step table for a side-on behaviour version, newest rules if unknown. */
export function stepTableFor(behaviourVersion: number): readonly number[] {
  return STEP_UP_BY_VERSION[behaviourVersion | 0] ?? STEP_UP_BY_PIP;
}

/** The best any creature can manage here, for "is this broken for everybody". */
export function bestStepUp(behaviourVersion: number): number {
  const table = stepTableFor(behaviourVersion);
  let best = 0;
  for (let i = 0; i < table.length; i = (i + 1) | 0) {
    const step = table[i] as number;
    if (step > best) best = step;
  }
  return best;
}

/**
 * What a creature that did NOT spend on strength manages, for "you would have
 * to be strong". Two pips is the most you can have while still being properly
 * fast, so it is the honest baseline for "a fast one will not make it".
 */
export function typicalStepUp(behaviourVersion: number): number {
  return stepTableFor(behaviourVersion)[2] as number;
}

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
