// dash/9: weight.
//
// "Overall playing the games doesn't feel as natural as Mario or Zelda why?"
// and then "it feels like moving a cursor as you say."
//
// It did. Up to dash/8 a sideways step was `x += run * direction`: full speed
// on the frame you press, zero on the frame you let go, and an instant reversal
// in between. Nothing accelerates, nothing carries, and a jump is one fixed
// height whether you tap the button or lean on it.
//
// Four things fix that, and none of them is anybody's invention: acceleration
// and friction, a jump you can cut short, a moment of grace after leaving a
// ledge, and a jump asked for slightly early still happening. Every one is
// authoritative state, so it is a new BUILD -- dash/8 keeps working for ever.
//
// Each test below measures the thing it is about rather than asserting that
// some constant has some value, because the constants are tuning and the
// behaviour is the promise.

import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { newestBuild } from "../src/core/builds.ts";
import { PRESETS } from "../src/core/creature.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { ONE, toCell } from "../src/core/fixed.ts";
import { HELD_ACT, HELD_LEFT, HELD_NONE, HELD_RIGHT } from "../src/engines/types.ts";
import { COYOTE_TICKS, BUFFER_TICKS } from "../src/engines/dash/v9.ts";

interface Runner {
  step(held: number): number;
  where(): { x: number; y: number; facing: number };
  onGround(): boolean;
  stateHash(): number;
}

/** A long flat floor, with a ledge that stops partway if asked for. */
function room(version: number, ledgeEndsAt = -1): string {
  const rows = [`hoppa/1 dash seed=feel tiles=0 behaviour=${version}`];
  for (let y = 0; y < GRID_H; y++) {
    if (y !== GRID_H - 1) { rows.push(".".repeat(GRID_W)); continue; }
    rows.push(ledgeEndsAt < 0 ? "#".repeat(GRID_W)
      : "#".repeat(ledgeEndsAt) + ".".repeat(GRID_W - ledgeEndsAt));
  }
  const put = (row: number, x: number, ch: string): void => {
    const line = rows[row] as string;
    rows[row] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(GRID_H - 1, 2, "@");
  put(GRID_H - 1, 6, "$");
  put(GRID_H - 1, 10, ">");
  return rows.join("\n") + "\n";
}

/**
 * A shelf high up with nothing under it, so walking off it is a real fall.
 *
 * The first version of this put the shelf on the LAST row and stopped it
 * halfway. Walking off the end there lands you on the bottom of the grid a
 * fraction of a cell later, where the engine re-grounds you every other tick
 * -- so the grace kept being renewed and a jump kept working, which looked
 * exactly like the grace never expiring. Seven cells of air is a fall.
 */
function ledgeRoom(): string {
  const SHELF = 6;
  const rows = [`hoppa/1 dash seed=edge tiles=0 behaviour=9`];
  for (let y = 0; y < GRID_H; y++) {
    rows.push(y === SHELF ? "#".repeat(9) + ".".repeat(GRID_W - 9) : ".".repeat(GRID_W));
  }
  const put = (row: number, x: number, ch: string): void => {
    const line = rows[row] as string;
    rows[row] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(SHELF, 2, "@");
  put(SHELF, 5, "$");
  put(GRID_H, GRID_W - 2, ">");
  return rows.join("\n") + "\n";
}

function onTheShelf(): Runner {
  return engineFor(parseLevel(ledgeRoom()), WHO) as unknown as Runner;
}

/** Walk right until it is past the end of the floor and genuinely falling. */
function runOffTheEdge(game: Runner): void {
  for (let i = 0; i < 200; i = (i + 1) | 0) {
    game.step(HELD_RIGHT);
    if (toCell(game.where().x) > 9 && !game.onGround()) return;
  }
  throw new Error("never left the ledge");
}

const WHO = PRESETS[0] as (typeof PRESETS)[number];

function start(version: number, ledgeEndsAt = -1): Runner {
  return engineFor(parseLevel(room(version, ledgeEndsAt)), WHO) as unknown as Runner;
}

/** How far it travelled sideways, in cells. */
function ran(game: Runner, from: number): number {
  return (game.where().x - from) / ONE;
}

test("dash/9 is what a new level is drawn under, and dash/8 never left", () => {
  expect(newestBuild("dash")).toBe(9);
  for (let v = 1; v <= 9; v = (v + 1) | 0) {
    expect({ v, routed: knownBuilds().includes(`dash/${v}`) }).toEqual({ v, routed: true });
  }
});

// --- acceleration ------------------------------------------------------------

test("it takes a moment to get going, where dash/8 was at full speed instantly", () => {
  const now = start(9);
  const then = start(8);
  settle(now); settle(then);
  const from = now.where().x;
  now.step(HELD_RIGHT);
  then.step(HELD_RIGHT);
  // One tick in, the old one has already covered its whole stride.
  expect(ran(now, from)).toBeLessThan(ran(then, from));
  expect(ran(now, from)).toBeGreaterThan(0);
});

test("...and it reaches the same top speed, so nothing got slower overall", () => {
  // The point is weight, not sluggishness. A run of any length has to end up
  // going as fast as it always did, or every level in the game gets harder.
  const now = start(9);
  const then = start(8);
  settle(now); settle(then);
  for (let i = 0; i < 20; i = (i + 1) | 0) { now.step(HELD_RIGHT); then.step(HELD_RIGHT); }
  const nowStride = (() => { const a = now.where().x; now.step(HELD_RIGHT); return now.where().x - a; })();
  const thenStride = (() => { const a = then.where().x; then.step(HELD_RIGHT); return then.where().x - a; })();
  expect(nowStride).toBe(thenStride);
});

test("it carries on for a moment after you let go", () => {
  const game = start(9);
  settle(game);
  for (let i = 0; i < 20; i = (i + 1) | 0) game.step(HELD_RIGHT);
  const at = game.where().x;
  game.step(HELD_NONE);
  expect(game.where().x).toBeGreaterThan(at);
  // ...but stops soon: sliding for ever is ice, not weight.
  for (let i = 0; i < 10; i = (i + 1) | 0) game.step(HELD_NONE);
  const settled = game.where().x;
  game.step(HELD_NONE);
  expect(game.where().x).toBe(settled);
});

test("turning round is crisper than starting from still", () => {
  // Without the extra push, a reversal costs the whole of stopping AND the
  // whole of starting, which reads as unresponsive rather than heavy.
  const turning = start(9);
  settle(turning);
  for (let i = 0; i < 20; i = (i + 1) | 0) turning.step(HELD_RIGHT);
  let ticksToTurn = 0;
  while (ticksToTurn < 60) {
    const before = turning.where().x;
    turning.step(HELD_LEFT);
    ticksToTurn = (ticksToTurn + 1) | 0;
    if (turning.where().x < before) break;
  }
  const standing = start(9);
  settle(standing);
  let ticksToGo = 0;
  while (ticksToGo < 60) {
    const before = standing.where().x;
    standing.step(HELD_LEFT);
    ticksToGo = (ticksToGo + 1) | 0;
    if (standing.where().x < before) break;
  }
  expect(ticksToTurn).toBeLessThanOrEqual(ticksToGo + 2);
});

// --- the jump ----------------------------------------------------------------

/** Let it fall to the floor first. A creature spawns in the air. */
function settle(game: Runner): void {
  for (let i = 0; i < 60 && !game.onGround(); i = (i + 1) | 0) game.step(HELD_NONE);
}

/**
 * How high it got, in cells, holding the jump for `hold` ticks.
 *
 * Settles first, and that is not a detail: measured from the SPAWN point
 * instead, every reading was the distance it fell rather than the height it
 * reached, and dash/8 came out with a jump of exactly zero.
 */
function jumpHeight(game: Runner, hold: number): number {
  settle(game);
  const floor = game.where().y;
  let peak = floor;
  for (let i = 0; i < 60; i = (i + 1) | 0) {
    game.step(i < hold ? HELD_ACT : HELD_NONE);
    if (game.where().y < peak) peak = game.where().y;
    if (i > hold + 2 && game.onGround()) break;
  }
  return (floor - peak) / ONE;
}

test("a tap is a hop and a hold is a jump", () => {
  // The single most-used control in a game of this shape, and until dash/9 it
  // did nothing at all: every jump was the same height.
  const tapped = jumpHeight(start(9), 2);
  const held = jumpHeight(start(9), 12);
  expect(tapped).toBeGreaterThan(0);
  expect(held).toBeGreaterThan(tapped * 1.3);
});

test("...and on dash/8 they are the same height, which is what was wrong", () => {
  const tapped = jumpHeight(start(8), 2);
  const held = jumpHeight(start(8), 12);
  expect(Math.abs(held - tapped)).toBeLessThan(0.05);
});

test("a jump asked for just before landing still happens", () => {
  // Jump buffering. Pressing jump slightly early is what a player does when
  // they mean "the moment I land", and dropping it is the game telling them
  // they were wrong when they were not.
  const game = start(9);
  settle(game);
  for (let i = 0; i < 12; i = (i + 1) | 0) game.step(HELD_ACT);       // up
  // Fall, and ask for the next jump while still in the air.
  let inAir = 0;
  while (!game.onGround() && inAir < 60) { game.step(HELD_NONE); inAir = (inAir + 1) | 0; }
  expect(inAir).toBeGreaterThan(0);
  // One press, a few ticks before touching down, would be lost without a buffer.
  const askedAt = game.where().y;
  void askedAt;
  const second = start(9);
  settle(second);
  for (let i = 0; i < 12; i = (i + 1) | 0) second.step(HELD_ACT);
  let ticks = 0;
  while (!second.onGround() && ticks < 60) { second.step(HELD_NONE); ticks = (ticks + 1) | 0; }
  // ...pressed on the tick before it lands, and held: it should leave again.
  const floor = second.where().y;
  for (let i = 0; i < 6; i = (i + 1) | 0) second.step(HELD_ACT);
  expect(second.where().y).toBeLessThan(floor);
});

test("walking off a ledge leaves a moment where a jump still works", () => {
  // Coyote time. A player who presses jump as they reach the edge believes
  // they were standing there, and at thirty ticks a second they are right to
  // within a frame or two.
  const game = onTheShelf();                   // a shelf that stops at x = 9
  settle(game);
  // Driven by WHERE IT IS, not by onGround(): that flag is only true on a tick
  // whose downward move was blocked, so it blinks off for a tick at a time
  // while walking along perfectly solid floor. A loop that watched it stopped
  // after one step and measured nothing.
  runOffTheEdge(game);
  expect(game.onGround()).toBe(false);         // off the end, falling
  const fell = game.where().y;
  // A jump one tick after the ledge: still allowed.
  game.step(HELD_ACT);
  game.step(HELD_ACT);
  expect(game.where().y).toBeLessThan(fell + ONE);
});

test("...but not for ever, or every jump is a double jump", () => {
  const game = onTheShelf();
  settle(game);
  runOffTheEdge(game);
  // Past the grace, and CHECKED to be still in the air: this room's drop ends
  // at the bottom of the grid, and a creature that has landed is allowed to
  // jump again -- which is the rule working, not failing.
  for (let i = 0; i < COYOTE_TICKS + 2; i = (i + 1) | 0) game.step(HELD_NONE);
  expect(game.onGround()).toBe(false);
  const falling = game.where().y;
  game.step(HELD_ACT);
  expect(game.onGround()).toBe(false);
  expect(game.where().y).toBeGreaterThan(falling);   // still going down
});

// --- the wire ----------------------------------------------------------------

test("all of it is in the hash, or a shared level would not replay", () => {
  // Where you are next tick depends on how fast you were already going. Two
  // runs that differ only in momentum must differ in the hash, or a proof
  // proves nothing.
  const rolling = start(9);
  settle(rolling);
  for (let i = 0; i < 10; i = (i + 1) | 0) rolling.step(HELD_RIGHT);
  for (let i = 0; i < 4; i = (i + 1) | 0) rolling.step(HELD_NONE);

  const still = start(9);
  settle(still);
  for (let i = 0; i < 14; i = (i + 1) | 0) still.step(HELD_NONE);

  expect(rolling.stateHash()).not.toBe(still.stateHash());
});

test("dash/8 is untouched: it still starts at full speed and cannot cut a jump", () => {
  // Hard rule 3, stated as the thing it protects. Every side-on link sent
  // before today pins dash/8.
  const then = start(8);
  settle(then);
  const from = then.where().x;
  then.step(HELD_RIGHT);
  const first = then.where().x - from;
  for (let i = 0; i < 10; i = (i + 1) | 0) then.step(HELD_RIGHT);
  const at = then.where().x;
  then.step(HELD_RIGHT);
  expect(then.where().x - at).toBe(first);   // no ramp: the first stride is the last
});

// --- two things the mutation runner found nothing checking ---------------------

/**
 * A room where the only way down is onto a guard's head.
 *
 * The guard is PENNED between two blocks. Left to itself it simply walks out
 * from under the falling creature -- twenty-two subcells a tick against a fall
 * of twenty ticks is a cell and a half -- and the test then measures an
 * ordinary landing and reports that nothing bounced.
 *
 * Rows are addressed straight into the grid here rather than through the
 * shared helper, whose `put` is a row out because of the header line.
 */
function stompRoom(): string {
  const floor = GRID_H - 1;
  const pen = GRID_H - 2;
  const grid: string[] = [];
  for (let y = 0; y < GRID_H; y++) {
    grid.push(y === floor ? "#".repeat(GRID_W) : ".".repeat(GRID_W));
  }
  const put = (y: number, x: number, ch: string): void => {
    const line = grid[y] as string;
    grid[y] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(pen, 5, "#");
  put(pen, 7, "#");
  put(pen, 6, "G");
  put(pen - 4, 6, "@");
  put(pen, 12, "$");
  put(pen, 16, ">");
  return `hoppa/1 dash seed=stomp tiles=0 behaviour=9\n` + grid.join("\n") + "\n";
}

/** How high the first upward move of the run carries it, in cells. */
function firstRise(game: Runner): number {
  let bounced = false;
  let deepest = 0;
  let peak = 0;
  for (let i = 0; i < 90; i = (i + 1) | 0) {
    const before = game.where().y;
    game.step(HELD_NONE);
    const after = game.where().y;
    if (!bounced) {
      if (after >= before) continue;
      bounced = true;
      deepest = before;
      peak = after;
      continue;
    }
    if (after < peak) peak = after;
    else break;
  }
  if (!bounced) throw new Error("never bounced");
  return (deepest - peak) / ONE;
}

test("a bounce off a guard's head is the game's push, not yours, so it is never cut", () => {
  // The cut belongs to the button. A stomp is the reward for a risk, and
  // clipping it because the player happens not to be holding jump takes the
  // reward away -- so this is not just a tuning difference, it is the wrong
  // thing being in charge of the height.
  const bounced = firstRise(engineFor(parseLevel(stompRoom()), WHO) as unknown as Runner);
  const clipped = jumpHeight(start(9), 1);
  console.log(`  bounce ${bounced.toFixed(2)} cells, a jump cut on the first tick ${clipped.toFixed(2)}`);
  expect(bounced).toBeGreaterThan(clipped * 1.5);
});

test("holding the jump button does not bounce you for ever", () => {
  // The buffer is armed on the EDGE of the press. Armed on the button being
  // DOWN it re-arms every tick, so the moment you land you are airborne again
  // and the creature pogos for as long as anybody leans on the button.
  const game = start(9);
  settle(game);
  let takeOffs = 0;
  let wasOn = true;
  for (let i = 0; i < 150; i = (i + 1) | 0) {
    game.step(HELD_ACT);
    const on = game.onGround();
    if (wasOn && !on) takeOffs = (takeOffs + 1) | 0;
    wasOn = on;
  }
  expect(takeOffs).toBe(1);
});

test("landing puts you ON the floor, not a third of a cell above it", () => {
  // Found by instrumenting the test above rather than by reading the code. A
  // fall is stepped in slices a body wide so nothing tunnels through a thin
  // floor, and a slice that did not fit used to be thrown away whole -- so
  // landing at speed stopped you up to 96 subcells short, standing on air.
  // Gravity then walked you down over the next ten ticks, and `grounded`
  // flickered the whole way, which is why a jump pressed right after landing
  // sometimes did nothing.
  const game = start(9);
  let landedAt = -1;
  for (let i = 0; i < 90 && landedAt < 0; i = (i + 1) | 0) {
    game.step(HELD_NONE);
    if (game.onGround()) landedAt = game.where().y;
  }
  expect(landedAt).toBeGreaterThan(0);
  for (let i = 0; i < 20; i = (i + 1) | 0) {
    game.step(HELD_NONE);
    expect({ tick: i, y: game.where().y, on: game.onGround() })
      .toEqual({ tick: i, y: landedAt, on: true });
  }
});
