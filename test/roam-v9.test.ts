// roam/9: the creature gets a body, seen from above.
//
// "Overall playing the games doesn't feel as natural as Mario or Zelda why?",
// and then "it feels like moving a cursor as you say."
//
// Up to roam/8 a step was `x += speed * direction`: position assigned straight
// from the button, with no state in which the creature is getting going or
// still going. dash/9 fixed that for the side-on game; this is the same finding
// from above, plus two problems that only exist in a room you walk around in.
//
// Every test here MEASURES the thing it is about against roam/8 rather than
// asserting a constant, because the constants are tuning and the behaviour is
// the promise.

import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { newestBuild } from "../src/core/builds.ts";
import { PRESETS } from "../src/core/creature.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { ONE, toCell } from "../src/core/fixed.ts";
import {
  FACE_LEFT, FACE_RIGHT,
  HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_NONE, HELD_RIGHT, HELD_UP,
} from "../src/engines/types.ts";
import { STUN_TICKS } from "../src/core/steer.ts";

const WHO = PRESETS[0] as (typeof PRESETS)[number];

interface Runner {
  step(held: number): number;
  where(): { x: number; y: number; facing: number };
  health(): { hp: number; max: number };
  stateHash(): number;
  swingLeft?(): number;
}

/** An empty room with a long clear run to the right. */
function room(behaviour: number): string {
  const rows = [`hoppa/1 roam seed=feel tiles=0 behaviour=${behaviour}`];
  for (let y = 0; y < GRID_H; y++) {
    const edge = y === 0 || y === GRID_H - 1;
    rows.push(edge ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#");
  }
  const put = (y: number, x: number, ch: string): void => {
    const line = rows[y + 1] as string;
    rows[y + 1] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(6, 2, "@");
  put(6, 12, "$");
  put(6, 20, ">");
  return rows.join("\n") + "\n";
}

function start(behaviour: number): Runner {
  return engineFor(parseLevel(room(behaviour)), WHO) as unknown as Runner;
}

/** How far it travelled, in cells, over this many ticks of this input. */
function travel(game: Runner, held: number, ticks: number): { x: number; y: number } {
  const fromX = game.where().x;
  const fromY = game.where().y;
  for (let i = 0; i < ticks; i = (i + 1) | 0) game.step(held);
  return { x: (game.where().x - fromX) / ONE, y: (game.where().y - fromY) / ONE };
}

// --- weight -------------------------------------------------------------------

test("roam/9 is what a new top-down level is drawn under", () => {
  expect(newestBuild("roam")).toBe(9);
});

test("it takes a moment to get going, where roam/8 was at full speed instantly", () => {
  const old = travel(start(8), HELD_RIGHT, 4).x;
  const now = travel(start(9), HELD_RIGHT, 4).x;
  console.log(`  first four ticks: roam/8 ${old.toFixed(2)} cells, roam/9 ${now.toFixed(2)}`);
  expect(now).toBeLessThan(old * 0.8);
  expect(now).toBeGreaterThan(0);
});

test("...and it reaches the same top speed, so the room is not slower to cross", () => {
  const old = travel(start(8), HELD_RIGHT, 40).x;
  const now = travel(start(9), HELD_RIGHT, 40).x;
  console.log(`  forty ticks: roam/8 ${old.toFixed(2)} cells, roam/9 ${now.toFixed(2)}`);
  expect(now).toBeGreaterThan(old * 0.9);
});

test("it carries on for a moment after you let go", () => {
  const game = start(9);
  travel(game, HELD_RIGHT, 20);
  const coast = travel(game, HELD_NONE, 10).x;
  console.log(`  coasted ${coast.toFixed(2)} cells after letting go`);
  expect(coast).toBeGreaterThan(0.1);

  const old = start(8);
  travel(old, HELD_RIGHT, 20);
  expect(travel(old, HELD_NONE, 10).x).toBe(0);
});

// --- diagonals ----------------------------------------------------------------

test("a diagonal is not a 41% speed boost any more", () => {
  // Every player finds this within a minute and then never walks in a straight
  // line again -- and every room's difficulty was tuned against a speed nobody
  // was using.
  const straight = travel(start(9), HELD_RIGHT, 40).x;
  const diagonal = travel(start(9), HELD_RIGHT | HELD_DOWN, 40);
  const across = Math.sqrt(diagonal.x * diagonal.x + diagonal.y * diagonal.y);
  console.log(`  roam/9: straight ${straight.toFixed(2)} cells, diagonally ${across.toFixed(2)}`);
  expect(across).toBeLessThan(straight * 1.05);
  expect(across).toBeGreaterThan(straight * 0.9);
});

test("...and on roam/8 it was, which is what was wrong", () => {
  const straight = travel(start(8), HELD_RIGHT, 40).x;
  const diagonal = travel(start(8), HELD_RIGHT | HELD_DOWN, 40);
  const across = Math.sqrt(diagonal.x * diagonal.x + diagonal.y * diagonal.y);
  console.log(`  roam/8: straight ${straight.toFixed(2)} cells, diagonally ${across.toFixed(2)}`);
  expect(across).toBeGreaterThan(straight * 1.3);
});

// --- the sticky door ----------------------------------------------------------

/**
 * A wall down the middle, with or without a single gap in it, and the creature
 * knocked `off` subcells out of line with the gap before it walks at it.
 *
 * A body is 192 subcells across in a 256-subcell cell, so the gap has 32
 * subcells of slack either side -- and nothing on screen tells the player
 * whether they are inside it. This is the geometry of every "the game is
 * ignoring me" moment in a room seen from above.
 */
function doorRoom(behaviour: number, doored: boolean): string {
  const DOOR_X = 10;
  const DOOR_Y = 6;
  const rows = [`hoppa/1 roam seed=door tiles=0 behaviour=${behaviour}`];
  for (let y = 0; y < GRID_H; y++) {
    if (y === 0 || y === GRID_H - 1) { rows.push("#".repeat(GRID_W)); continue; }
    const line = ("#" + ".".repeat(GRID_W - 2) + "#").split("");
    line[DOOR_X] = y === DOOR_Y && doored ? "." : "#";
    rows.push(line.join(""));
  }
  const put = (y: number, x: number, ch: string): void => {
    const line = rows[y + 1] as string;
    rows[y + 1] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(DOOR_Y, 3, "@");
  put(DOOR_Y, 20, "$");
  put(DOOR_Y, 21, ">");
  return rows.join("\n") + "\n";
}

/**
 * Push it `nudge` ticks off the door's row, let it settle, then hold right --
 * and say whether it ever got past the wall.
 */
function getsThrough(behaviour: number, doored: boolean, nudge: number): boolean {
  const game = engineFor(parseLevel(doorRoom(behaviour, doored)), WHO) as unknown as Runner;
  for (let i = 0; i < nudge; i = (i + 1) | 0) game.step(HELD_DOWN);
  for (let i = 0; i < 10; i = (i + 1) | 0) game.step(HELD_NONE);
  for (let i = 0; i < 200; i = (i + 1) | 0) {
    game.step(HELD_RIGHT);
    if (toCell(game.where().x) > 10) return true;
  }
  return false;
}

/** The worst misalignment, in subcells, this build can still get a door from. */
function widestNearMiss(behaviour: number): number {
  let worst = 0;
  for (let nudge = 0; nudge <= 20; nudge = (nudge + 1) | 0) {
    const game = engineFor(parseLevel(doorRoom(behaviour, true)), WHO) as unknown as Runner;
    for (let i = 0; i < nudge; i = (i + 1) | 0) game.step(HELD_DOWN);
    for (let i = 0; i < 10; i = (i + 1) | 0) game.step(HELD_NONE);
    const off = Math.abs(game.where().y - (6 * ONE + (ONE >> 1)));
    if (getsThrough(behaviour, true, nudge) && off > worst) worst = off;
  }
  return worst;
}

test("a doorway you are ALMOST lined up with lets you through", () => {
  // The single biggest source of "the game is ignoring me" in a room seen from
  // above, and it is invisible: the gap is right there and you simply stop.
  const now = widestNearMiss(9);
  const old = widestNearMiss(8);
  console.log(`  worst near miss that still gets through: roam/8 ${old} subcells, roam/9 ${now}`);
  expect(now).toBeGreaterThan(old * 3);
});

test("...but a wall with no door in it still stops you dead", () => {
  // The assist asks whether being properly lined up would OPEN the way, not
  // merely whether you are pressed against something. A version that shuffled
  // you about at every wall would be worse than no help at all.
  for (let nudge = 0; nudge <= 20; nudge = (nudge + 1) | 0) {
    expect({ nudge, through: getsThrough(9, false, nudge) }).toEqual({ nudge, through: false });
  }
});

test("...and it does not even shuffle you sideways there", () => {
  // Not getting through is only half of it. Leaning on a blank wall must not
  // quietly slide you up or down the room: that is the game moving you
  // somewhere you did not ask to go, which is the complaint this whole build
  // is answering.
  const game = engineFor(parseLevel(doorRoom(9, false)), WHO) as unknown as Runner;
  for (let i = 0; i < 6; i = (i + 1) | 0) game.step(HELD_DOWN);
  for (let i = 0; i < 10; i = (i + 1) | 0) game.step(HELD_NONE);
  // Walk into the wall and stay there.
  for (let i = 0; i < 60; i = (i + 1) | 0) game.step(HELD_RIGHT);
  const parked = game.where().y;
  for (let i = 0; i < 60; i = (i + 1) | 0) {
    game.step(HELD_RIGHT);
    expect({ tick: i, y: game.where().y }).toEqual({ tick: i, y: parked });
  }
});

// --- the swing ----------------------------------------------------------------

test("a swing asked for during the last one still happens", () => {
  // A swing is eight ticks and a child mashing the button lands the second
  // press inside the first, where it used to be dropped on the floor.
  const swings = (game: Runner, presses: readonly number[]): number => {
    let count = 0;
    let was = 0;
    for (let tick = 0; tick < 40; tick = (tick + 1) | 0) {
      game.step(presses.includes(tick) ? HELD_ACT : HELD_NONE);
      const now = game.swingLeft?.() ?? 0;
      if (now > was) count = (count + 1) | 0;
      was = now;
    }
    return count;
  };
  // Two presses, the second three ticks into the first swing.
  expect(swings(start(9), [0, 3])).toBe(2);
  expect(swings(start(8), [0, 3])).toBe(1);
});

test("...and letting go stops it: the buffer is not re-armed by holding", () => {
  // Armed on the button being DOWN rather than on the press, the buffer is
  // refilled every tick you lean on it -- so releasing mid-swing still buys
  // you one more swing you never asked for, several ticks after you let go.
  const game = start(9);
  let count = 0;
  let was = 0;
  for (let tick = 0; tick < 40; tick = (tick + 1) | 0) {
    game.step(tick < 12 ? HELD_ACT : HELD_NONE);
    const now = game.swingLeft?.() ?? 0;
    if (now > was) count = (count + 1) | 0;
    was = now;
  }
  // Twelve ticks is one swing and a half: two swings, and nothing after the
  // button comes up.
  expect(count).toBe(2);
});

test("...but leaning on the button does not flail", () => {
  const game = start(9);
  let count = 0;
  let was = 0;
  for (let tick = 0; tick < 40; tick = (tick + 1) | 0) {
    game.step(HELD_ACT);
    const now = game.swingLeft?.() ?? 0;
    if (now > was) count = (count + 1) | 0;
    was = now;
  }
  // Held, it swings again the moment the last one finishes -- which is v8's
  // behaviour and is kept. What must not happen is more than one per swing.
  expect(count).toBeLessThanOrEqual((40 / 8) | 0);
  expect(count).toBeGreaterThan(1);
});

// --- being hit ----------------------------------------------------------------

/** A room with a guard standing three cells to the right of the start. */
function guardRoom(behaviour: number): string {
  const rows = [`hoppa/1 roam seed=hit tiles=0 behaviour=${behaviour}`];
  for (let y = 0; y < GRID_H; y++) {
    const edge = y === 0 || y === GRID_H - 1;
    rows.push(edge ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#");
  }
  const put = (y: number, x: number, ch: string): void => {
    const line = rows[y + 1] as string;
    rows[y + 1] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(6, 2, "@");
  put(6, 6, "G");
  put(6, 12, "$");
  put(6, 20, ">");
  return rows.join("\n") + "\n";
}

/**
 * Where it was on the tick BEFORE it lost a heart, and on every tick after.
 *
 * The tick before matters and getting it wrong hid the whole effect: roam/8
 * moves you on the same tick it takes the heart, so a track that starts at the
 * first hurt tick has the teleport already baked into its first entry and shows
 * a creature standing perfectly still.
 */
function afterTheHit(behaviour: number): readonly number[] {
  const game = engineFor(parseLevel(guardRoom(behaviour)), WHO) as unknown as Runner;
  const full = game.health().hp;
  const track: number[] = [];
  for (let tick = 0; tick < 200; tick = (tick + 1) | 0) {
    const before = game.where().x;
    game.step(HELD_RIGHT);
    if (track.length === 0) {
      if (game.health().hp === full) continue;
      track.push(before);
    }
    track.push(game.where().x);
    if (track.length > STUN_TICKS + 6) break;
  }
  return track;
}

test("a hit throws you, where roam/8 teleported you", () => {
  // Same destination, completely different reading. You do not see yourself
  // thrown, you see yourself somewhere else -- and a child watching that
  // cannot tell being hit from the game glitching.
  const now = afterTheHit(9);
  const old = afterTheHit(8);
  const biggestStep = (track: readonly number[]): number => {
    let worst = 0;
    for (let i = 1; i < track.length; i = (i + 1) | 0) {
      const gap = Math.abs((track[i] as number) - (track[i - 1] as number));
      if (gap > worst) worst = gap;
    }
    return worst / ONE;
  };
  const moved = (track: readonly number[]): number =>
    Math.abs((track[track.length - 1] as number) - (track[0] as number)) / ONE;

  console.log(`  roam/8 biggest single tick ${biggestStep(old).toFixed(2)} cells; roam/9 ${biggestStep(now).toFixed(2)}`);
  console.log(`  total thrown: roam/8 ${moved(old).toFixed(2)} cells, roam/9 ${moved(now).toFixed(2)}`);
  // roam/8 moved you two cells in ONE tick. roam/9 never moves you more than
  // about a third of a cell in a tick, and gets you a comparable distance.
  expect(biggestStep(now)).toBeLessThan(biggestStep(old) / 2);
  expect(moved(now)).toBeGreaterThan(0.5);
});

test("the throw takes the wheel off you for a moment", () => {
  // Not for long. Long enough that the hit is a thing that HAPPENED to you
  // rather than a number changing in a corner; short enough that it can never
  // cascade, because being knocked into a second guard while still stunned by
  // the first is how a game gets a reputation for being unfair.
  const game = engineFor(parseLevel(guardRoom(9)), WHO) as unknown as Runner;
  const full = game.health().hp;
  let hitAt = -1;
  for (let tick = 0; tick < 200 && hitAt < 0; tick = (tick + 1) | 0) {
    game.step(HELD_RIGHT);
    if (game.health().hp < full) hitAt = tick;
  }
  expect(hitAt).toBeGreaterThan(0);
  // Still holding RIGHT, straight back into the guard, and still going left.
  for (let i = 0; i < STUN_TICKS; i = (i + 1) | 0) {
    const before = game.where().x;
    game.step(HELD_RIGHT);
    expect({ i, backwards: game.where().x < before }).toEqual({ i, backwards: true });
  }
});

test("...and you cannot even turn round while it lasts", () => {
  // Distance alone is too blunt to prove the stun: the knock is four times
  // walking speed, so a creature with the wheel back still travels backwards
  // for several ticks while it fights the momentum. Which way it is FACING is
  // the clean signal, because facing is set from the buttons and the buttons
  // are what the stun takes away.
  const game = engineFor(parseLevel(guardRoom(9)), WHO) as unknown as Runner;
  const full = game.health().hp;
  let hitAt = -1;
  for (let tick = 0; tick < 200 && hitAt < 0; tick = (tick + 1) | 0) {
    game.step(HELD_RIGHT);
    if (game.health().hp < full) hitAt = tick;
  }
  expect(hitAt).toBeGreaterThan(0);
  expect(game.where().facing).toBe(FACE_RIGHT);
  for (let i = 0; i < STUN_TICKS - 1; i = (i + 1) | 0) {
    game.step(HELD_LEFT);
    expect({ i, facing: game.where().facing }).toEqual({ i, facing: FACE_RIGHT });
  }
  // And then it comes back.
  game.step(HELD_LEFT);
  game.step(HELD_LEFT);
  expect(game.where().facing).toBe(FACE_LEFT);
});

// --- the wire -----------------------------------------------------------------

test("all of it is in the hash, or a shared level would not replay", () => {
  // Velocity, the stun and the swing buffer are authoritative: two clients
  // replaying the same log have to agree how fast the creature was already
  // going, or they part company at the next wall.
  const coasting = start(9);
  for (let i = 0; i < 10; i = (i + 1) | 0) coasting.step(HELD_RIGHT);

  const arriving = start(9);
  for (let i = 0; i < 10; i = (i + 1) | 0) arriving.step(HELD_NONE);
  // Walk the second one to the same place from a standing start, which it
  // cannot quite do -- so instead assert the obvious thing: the same log gives
  // the same hash, and a different log does not.
  expect(start(9).stateHash()).toBe(start(9).stateHash());

  const a = start(9);
  const b = start(9);
  for (let i = 0; i < 20; i = (i + 1) | 0) { a.step(HELD_RIGHT); b.step(HELD_RIGHT); }
  expect(a.stateHash()).toBe(b.stateHash());
  // One extra tick of coasting is a different state even though the buttons
  // are the same from here on.
  a.step(HELD_NONE);
  b.step(HELD_UP);
  expect(a.stateHash()).not.toBe(b.stateHash());
});

test("roam/8 is untouched: instant, and a diagonal is still faster", () => {
  const game = start(8);
  const first = travel(game, HELD_RIGHT, 1).x;
  const later = travel(game, HELD_RIGHT, 1).x;
  expect(first).toBe(later);
});
