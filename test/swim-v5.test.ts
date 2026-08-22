// swim/5: the reef, with corners.
//
// The reef is the one build nobody meant by "it feels like moving a cursor".
// Swimming has had momentum since swim/1 and it is the best feel in the game,
// so the water is deliberately NOT touched here -- the first test below is the
// guard on that.
//
// What swim shared with the other four was three things, all invisible until
// measured: a diagonal that was 41% faster than any straight line, a gap in
// the rock you were nearly lined up with stopping you dead, and a press during
// a swing being dropped. Plus the hit that teleported you two cells.

import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { newestBuild } from "../src/core/builds.ts";
import { PRESETS } from "../src/core/creature.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { ONE, toCell } from "../src/core/fixed.ts";
import {
  FACE_RIGHT, HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_NONE, HELD_RIGHT,
} from "../src/engines/types.ts";
import { STUN_TICKS } from "../src/core/steer.ts";

const WHO = PRESETS[0] as (typeof PRESETS)[number];

interface Runner {
  step(held: number): number;
  where(): { x: number; y: number; facing: number };
  health(): { hp: number; max: number };
  swingLeft?(): number;
}

function room(
  behaviour: number,
  opts: { readonly wall?: boolean; readonly door?: boolean; readonly guard?: boolean } = {},
): string {
  const DOOR_X = 10;
  const ROW = 6;
  const rows = [`hoppa/1 swim seed=reef tiles=0 behaviour=${behaviour}`];
  for (let y = 0; y < GRID_H; y++) {
    if (y === 0 || y === GRID_H - 1) { rows.push("#".repeat(GRID_W)); continue; }
    const line = ("#" + ".".repeat(GRID_W - 2) + "#").split("");
    if (opts.wall) line[DOOR_X] = y === ROW && opts.door !== false ? "." : "#";
    rows.push(line.join(""));
  }
  const put = (y: number, x: number, ch: string): void => {
    const line = rows[y + 1] as string;
    rows[y + 1] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(ROW, 3, "@");
  if (opts.guard) put(ROW, 7, "G");
  put(ROW, 20, "$");
  put(ROW, 21, ">");
  return rows.join("\n") + "\n";
}

function start(behaviour: number, opts = {}): Runner {
  return engineFor(parseLevel(room(behaviour, opts)), WHO) as unknown as Runner;
}

function travel(game: Runner, held: number, ticks: number): { x: number; y: number } {
  const fromX = game.where().x;
  const fromY = game.where().y;
  for (let i = 0; i < ticks; i = (i + 1) | 0) game.step(held);
  return { x: (game.where().x - fromX) / ONE, y: (game.where().y - fromY) / ONE };
}

test("swim/5 is what a new reef is drawn under", () => {
  expect(newestBuild("swim")).toBe(5);
});

test("THE WATER IS UNTOUCHED: a straight swim is tick-for-tick swim/4's", () => {
  // This is the point of the whole build. Everything below is about corners and
  // buttons; the drift, the cap and the gap between building speed and losing
  // it are the best feel in the game and must come through unchanged.
  const now = start(5);
  const before = start(4);
  for (let tick = 0; tick < 60; tick = (tick + 1) | 0) {
    // Twenty ticks pushing, twenty coasting, twenty pushing back the other way.
    const held = tick < 20 ? HELD_RIGHT : tick < 40 ? HELD_NONE : HELD_LEFT;
    now.step(held);
    before.step(held);
    expect({ tick, x: now.where().x, y: now.where().y })
      .toEqual({ tick, x: before.where().x, y: before.where().y });
  }
});

test("a diagonal is not a 41% speed boost any more", () => {
  const straight = travel(start(5), HELD_RIGHT, 40).x;
  const d = travel(start(5), HELD_RIGHT | HELD_DOWN, 40);
  const across = Math.sqrt(d.x * d.x + d.y * d.y);
  console.log(`  swim/5: straight ${straight.toFixed(2)} cells, diagonally ${across.toFixed(2)}`);
  expect(across).toBeLessThan(straight * 1.05);
  expect(across).toBeGreaterThan(straight * 0.9);

  const wasStraight = travel(start(4), HELD_RIGHT, 40).x;
  const wasD = travel(start(4), HELD_RIGHT | HELD_DOWN, 40);
  const wasAcross = Math.sqrt(wasD.x * wasD.x + wasD.y * wasD.y);
  console.log(`  swim/4: straight ${wasStraight.toFixed(2)} cells, diagonally ${wasAcross.toFixed(2)}`);
  expect(wasAcross).toBeGreaterThan(wasStraight * 1.3);
});

function getsThrough(behaviour: number, door: boolean, nudge: number): boolean {
  const game = start(behaviour, { wall: true, door });
  for (let i = 0; i < nudge; i = (i + 1) | 0) game.step(HELD_DOWN);
  for (let i = 0; i < 20; i = (i + 1) | 0) game.step(HELD_NONE);
  for (let i = 0; i < 300; i = (i + 1) | 0) {
    game.step(HELD_RIGHT);
    if (toCell(game.where().x) > 10) return true;
  }
  return false;
}

/** The worst misalignment, in subcells, this build can still get a gap from. */
function widestNearMiss(behaviour: number): number {
  let worst = 0;
  for (let nudge = 0; nudge <= 20; nudge = (nudge + 1) | 0) {
    const game = start(behaviour, { wall: true, door: true });
    for (let i = 0; i < nudge; i = (i + 1) | 0) game.step(HELD_DOWN);
    for (let i = 0; i < 20; i = (i + 1) | 0) game.step(HELD_NONE);
    const off = Math.abs(game.where().y - (6 * ONE + (ONE >> 1)));
    if (getsThrough(behaviour, true, nudge) && off > worst) worst = off;
  }
  return worst;
}

test("a gap in the rock you are ALMOST lined up with lets you through", () => {
  // Counting how many near misses got through is the wrong measure -- how far
  // a nudge carries you differs between builds, so the samples are not the
  // same offsets. What the assist is worth is how far OUT OF LINE you can be
  // and still make it.
  const now = widestNearMiss(5);
  const before = widestNearMiss(4);
  console.log(`  worst near miss that still gets through: swim/4 ${before} subcells, swim/5 ${now}`);
  expect(now).toBeGreaterThan(before * 3);
});

test("...but solid rock still stops you, and does not shuffle you about", () => {
  for (let nudge = 0; nudge <= 20; nudge = (nudge + 1) | 0) {
    expect({ nudge, through: getsThrough(5, false, nudge) }).toEqual({ nudge, through: false });
  }
  const game = start(5, { wall: true, door: false });
  for (let i = 0; i < 6; i = (i + 1) | 0) game.step(HELD_DOWN);
  for (let i = 0; i < 80; i = (i + 1) | 0) game.step(HELD_RIGHT);
  const parked = game.where().y;
  for (let i = 0; i < 40; i = (i + 1) | 0) game.step(HELD_RIGHT);
  expect(game.where().y).toBe(parked);
});

function swings(game: Runner, down: (tick: number) => boolean): number {
  let count = 0;
  let was = 0;
  for (let tick = 0; tick < 40; tick = (tick + 1) | 0) {
    game.step(down(tick) ? HELD_ACT : HELD_NONE);
    const now = game.swingLeft?.() ?? 0;
    if (now > was) count = (count + 1) | 0;
    was = now;
  }
  return count;
}

test("a swing asked for during the last one still happens", () => {
  expect(swings(start(5), (t) => t === 0 || t === 3)).toBe(2);
  expect(swings(start(4), (t) => t === 0 || t === 3)).toBe(1);
});

test("...and letting go does not buy one more swing", () => {
  expect(swings(start(5), (t) => t < 12)).toBe(2);
});

test("a hit throws you, where swim/4 teleported you", () => {
  // Underwater this matters more than anywhere else: the water is the one
  // place the game has always shown you your own momentum, so a creature that
  // teleports in it is the one thing in the room that does not obey it.
  const game = start(5, { guard: true });
  const full = game.health().hp;
  let hitAt = -1;
  for (let tick = 0; tick < 300 && hitAt < 0; tick = (tick + 1) | 0) {
    game.step(HELD_RIGHT);
    if (game.health().hp < full) hitAt = tick;
  }
  expect(hitAt).toBeGreaterThan(0);
  expect(game.where().facing).toBe(FACE_RIGHT);
  for (let i = 0; i < STUN_TICKS - 1; i = (i + 1) | 0) {
    const before = game.where().x;
    game.step(HELD_LEFT);
    expect({ i, back: game.where().x < before, facing: game.where().facing })
      .toEqual({ i, back: true, facing: FACE_RIGHT });
  }

  const old = start(4, { guard: true });
  const wasFull = old.health().hp;
  let jump = 0;
  for (let tick = 0; tick < 300; tick = (tick + 1) | 0) {
    const before = old.where().x;
    old.step(HELD_RIGHT);
    if (old.health().hp < wasFull) { jump = Math.abs(old.where().x - before) / ONE; break; }
  }
  console.log(`  swim/4 moved ${jump.toFixed(2)} cells on the tick it took the heart`);
  expect(jump).toBeGreaterThan(1);
});
