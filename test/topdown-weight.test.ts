// The same body, in all three rooms you look down into.
//
// roam/9, calm/4 and raze/2 are three copies of one movement change, made
// because hard rule 3 forbids editing a shipped build. Three copies is three
// chances for one of them to quietly drift, so this file asserts the CONTRACT
// rather than any one engine: whatever the caves, the garden and the city do
// differently, they walk the same.
//
// test/roam-v9.test.ts argues about the numbers and shows the measurements.
// This file only asks whether each build has them at all.

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

/** Each world, the build that got a body, and the last one without one. */
const WORLDS = [
  { engine: "roam", tiles: 0, weighted: 9, before: 8 },
  { engine: "calm", tiles: 0, weighted: 4, before: 3 },
  { engine: "raze", tiles: 6, weighted: 2, before: 1 },
] as const;

interface Runner {
  step(held: number): number;
  where(): { x: number; y: number; facing: number };
  health(): { hp: number; max: number };
  swingLeft?(): number;
}

type World = (typeof WORLDS)[number];

/** An empty room, or one with a wall down the middle and a door in it. */
function room(
  world: World, behaviour: number,
  opts: { readonly wall?: boolean; readonly door?: boolean; readonly guard?: boolean } = {},
): string {
  const DOOR_X = 10;
  const ROW = 6;
  const rows = [`hoppa/1 ${world.engine} seed=body tiles=${world.tiles} behaviour=${behaviour}`];
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

function start(world: World, behaviour: number, opts = {}): Runner {
  return engineFor(parseLevel(room(world, behaviour, opts)), WHO) as unknown as Runner;
}

function travel(game: Runner, held: number, ticks: number): { x: number; y: number } {
  const fromX = game.where().x;
  const fromY = game.where().y;
  for (let i = 0; i < ticks; i = (i + 1) | 0) game.step(held);
  return { x: (game.where().x - fromX) / ONE, y: (game.where().y - fromY) / ONE };
}

test("every world you look down into is on a build with a body", () => {
  for (const world of WORLDS) {
    expect({ engine: world.engine, newest: newestBuild(world.engine) })
      .toEqual({ engine: world.engine, newest: world.weighted });
  }
});

test("all three take a moment to get going, where the build before did not", () => {
  for (const world of WORLDS) {
    const old = travel(start(world, world.before), HELD_RIGHT, 4).x;
    const now = travel(start(world, world.weighted), HELD_RIGHT, 4).x;
    expect({ engine: world.engine, slower: now < old * 0.8, moving: now > 0 })
      .toEqual({ engine: world.engine, slower: true, moving: true });
  }
});

test("all three reach the same top speed, so no room got slower to cross", () => {
  for (const world of WORLDS) {
    const old = travel(start(world, world.before), HELD_RIGHT, 40).x;
    const now = travel(start(world, world.weighted), HELD_RIGHT, 40).x;
    expect({ engine: world.engine, kept: now > old * 0.9 })
      .toEqual({ engine: world.engine, kept: true });
  }
});

test("all three carry on for a moment after you let go", () => {
  for (const world of WORLDS) {
    const game = start(world, world.weighted);
    travel(game, HELD_RIGHT, 20);
    const coast = travel(game, HELD_NONE, 10).x;
    expect({ engine: world.engine, coasted: coast > 0.1 })
      .toEqual({ engine: world.engine, coasted: true });
  }
});

test("in none of them is a diagonal a speed boost any more", () => {
  for (const world of WORLDS) {
    const straight = travel(start(world, world.weighted), HELD_RIGHT, 40).x;
    const d = travel(start(world, world.weighted), HELD_RIGHT | HELD_DOWN, 40);
    const across = Math.sqrt(d.x * d.x + d.y * d.y);
    expect({ engine: world.engine, fair: across < straight * 1.05 })
      .toEqual({ engine: world.engine, fair: true });

    const oldStraight = travel(start(world, world.before), HELD_RIGHT, 40).x;
    const oldD = travel(start(world, world.before), HELD_RIGHT | HELD_DOWN, 40);
    const oldAcross = Math.sqrt(oldD.x * oldD.x + oldD.y * oldD.y);
    expect({ engine: world.engine, wasFaster: oldAcross > oldStraight * 1.3 })
      .toEqual({ engine: world.engine, wasFaster: true });
  }
});

/** Knock it `nudge` ticks off the door's row, then walk at the wall. */
function getsThrough(world: World, behaviour: number, door: boolean, nudge: number): boolean {
  const game = start(world, behaviour, { wall: true, door });
  for (let i = 0; i < nudge; i = (i + 1) | 0) game.step(HELD_DOWN);
  for (let i = 0; i < 10; i = (i + 1) | 0) game.step(HELD_NONE);
  for (let i = 0; i < 200; i = (i + 1) | 0) {
    game.step(HELD_RIGHT);
    if (toCell(game.where().x) > 10) return true;
  }
  return false;
}

test("all three walk you into line with a doorway you nearly missed", () => {
  for (const world of WORLDS) {
    let now = 0;
    let before = 0;
    for (let nudge = 0; nudge <= 20; nudge = (nudge + 1) | 0) {
      if (getsThrough(world, world.weighted, true, nudge)) now = (now + 1) | 0;
      if (getsThrough(world, world.before, true, nudge)) before = (before + 1) | 0;
    }
    expect({ engine: world.engine, better: now > before + 1 })
      .toEqual({ engine: world.engine, better: true });
  }
});

test("...and none of them lets you past a wall with no door in it", () => {
  for (const world of WORLDS) {
    for (let nudge = 0; nudge <= 20; nudge = (nudge + 1) | 0) {
      expect({ engine: world.engine, nudge, through: getsThrough(world, world.weighted, false, nudge) })
        .toEqual({ engine: world.engine, nudge, through: false });
    }
  }
});

test("...nor even shuffles you sideways there", () => {
  for (const world of WORLDS) {
    const game = start(world, world.weighted, { wall: true, door: false });
    for (let i = 0; i < 6; i = (i + 1) | 0) game.step(HELD_DOWN);
    for (let i = 0; i < 70; i = (i + 1) | 0) game.step(HELD_RIGHT);
    const parked = game.where().y;
    for (let i = 0; i < 40; i = (i + 1) | 0) game.step(HELD_RIGHT);
    expect({ engine: world.engine, y: game.where().y })
      .toEqual({ engine: world.engine, y: parked });
  }
});

/** How many separate swings happened, given which ticks the button is down. */
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

test("all three remember a swing asked for during the last one", () => {
  for (const world of WORLDS) {
    expect({
      engine: world.engine,
      now: swings(start(world, world.weighted), (t) => t === 0 || t === 3),
      before: swings(start(world, world.before), (t) => t === 0 || t === 3),
    }).toEqual({ engine: world.engine, now: 2, before: 1 });
  }
});

test("...and in none of them does letting go buy one more swing", () => {
  for (const world of WORLDS) {
    expect({ engine: world.engine, count: swings(start(world, world.weighted), (t) => t < 12) })
      .toEqual({ engine: world.engine, count: 2 });
  }
});

/** Walk right into the guard and report the tick the heart went. */
function hitByAGuard(world: World, behaviour: number): Runner | null {
  const game = start(world, behaviour, { guard: true });
  const full = game.health().hp;
  for (let tick = 0; tick < 300; tick = (tick + 1) | 0) {
    game.step(HELD_RIGHT);
    if (game.health().hp < full) return game;
  }
  return null;
}

test("all three throw you when you are hit, rather than teleporting you", () => {
  for (const world of WORLDS) {
    const game = hitByAGuard(world, world.weighted);
    expect({ engine: world.engine, hit: game !== null }).toEqual({ engine: world.engine, hit: true });
    if (game === null) continue;
    // Still holding RIGHT, straight back into the guard, and still going left
    // -- and unable to even turn round while the stun lasts.
    expect({ engine: world.engine, facing: game.where().facing })
      .toEqual({ engine: world.engine, facing: FACE_RIGHT });
    for (let i = 0; i < STUN_TICKS - 1; i = (i + 1) | 0) {
      const before = game.where().x;
      game.step(HELD_LEFT);
      expect({ engine: world.engine, i, back: game.where().x < before, facing: game.where().facing })
        .toEqual({ engine: world.engine, i, back: true, facing: FACE_RIGHT });
    }
  }
});

test("...where the build before moved you a whole cell in one tick", () => {
  for (const world of WORLDS) {
    const game = start(world, world.before, { guard: true });
    const full = game.health().hp;
    let jump = 0;
    for (let tick = 0; tick < 300; tick = (tick + 1) | 0) {
      const before = game.where().x;
      game.step(HELD_RIGHT);
      if (game.health().hp < full) {
        jump = Math.abs(game.where().x - before) / ONE;
        break;
      }
    }
    expect({ engine: world.engine, teleported: jump > 1 })
      .toEqual({ engine: world.engine, teleported: true });
  }
});
