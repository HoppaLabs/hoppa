// raze/3: boxes in the city, and the one decision no other engine had to make.
//
// A box is a WALL. In every other game that is the end of it -- a wall is a
// thing you cannot walk through until somebody hits it. In the city walls COME
// DOWN, so a crate left to itself would be razed into burning rubble by the
// jaeger's swing, which reads as the box being destroyed and whatever was
// inside it lost.
//
// A crate is not a building. The swing opens it instead.

import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { TILE_BOX, TILE_BOX_OPEN, TILE_FIRE } from "../src/core/tiles.ts";
import { HELD_ACT, HELD_NONE, HELD_RIGHT } from "../src/engines/types.ts";
import { idx } from "../src/core/grid.ts";

/** The strongest creature, because razing a building needs strength. */
const JAEGER = PRESETS[0] as (typeof PRESETS)[number];

/** A street with one thing three cells to the right of the jaeger. */
function street(what: string): string {
  const rows = ["hoppa/1 raze seed=box tiles=6 behaviour=3"];
  for (let y = 0; y < GRID_H; y++) {
    const edge = y === 0 || y === GRID_H - 1;
    rows.push(edge ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#");
  }
  const put = (x: number, y: number, glyph: string): void => {
    const row = rows[y + 1] as string;
    rows[y + 1] = row.slice(0, x) + glyph + row.slice(x + 1);
  };
  put(2, 7, "@");
  put(5, 7, what);
  put(2, 2, "$");
  put(20, 11, ">");
  return `${rows.join("\n")}\n`;
}

function run(text: string) {
  const engine = engineFor(parseLevel(text), JAEGER) as unknown as {
    step(held: number): number;
    render(): Uint8Array;
    justOpened(): boolean;
    openedWasGem(): boolean;
    boxesLeft(): number;
    enemiesLeft(): number;
    exitOpen(): boolean;
  };
  return engine;
}

/**
 * Walk right until the thing ahead is one cell away, then swing.
 *
 * Reports what happened ON THE SWING TICK, because justOpened() is a one-tick
 * flag cleared at the top of every step -- which is right, and which means a
 * test that swings and then settles for a few ticks has already missed it.
 */
function walkUpAndHit(engine: ReturnType<typeof run>): { opened: boolean; gem: boolean } {
  for (let i = 0; i < 90; i = (i + 1) | 0) engine.step(HELD_RIGHT);
  engine.step(HELD_NONE);
  engine.step(HELD_ACT);
  const said = { opened: engine.justOpened(), gem: engine.openedWasGem() };
  for (let i = 0; i < 4; i = (i + 1) | 0) engine.step(HELD_NONE);
  return said;
}

test("a crate is not a building: hitting it opens it rather than razing it", () => {
  const engine = run(street("?"));
  expect(engine.render()[idx(5, 7)]).toBe(TILE_BOX);
  walkUpAndHit(engine);
  const tiles = engine.render();
  // Opened, not razed. A razed cell burns -- see EMBER_TICKS -- so a box that
  // had been treated as a building would be sitting in fire right now, and
  // the thing that was inside it would never have come out.
  expect(tiles[idx(5, 7)]).toBe(TILE_BOX_OPEN);
  expect(tiles[idx(5, 7)]).not.toBe(TILE_FIRE);
  expect(engine.boxesLeft()).toBe(0);
});

test("a gem in a box is a gem, and it counts toward the door", () => {
  // The room has one loose gem and one in a crate, so the exit stays shut
  // until BOTH are in hand. That is what stops boxes being decoration: the
  // box's slot comes after the level's own gems in the same mask.
  const engine = run(street("?"));
  expect(engine.exitOpen()).toBe(false);
  const said = walkUpAndHit(engine);
  expect(said.opened).toBe(true);
  expect(said.gem).toBe(true);
  // The crate's gem is in hand; the loose one on the far side is not.
  expect(engine.exitOpen()).toBe(false);
});

test("a monster in a box is in the room from the first tick, and not before", () => {
  const engine = run(street("!"));
  // It exists -- allocating one mid-run would make the replay depend on WHEN
  // something happened -- but it takes no part in anything.
  expect(engine.enemiesLeft()).toBe(0);
  const said = walkUpAndHit(engine);
  expect(said.opened).toBe(true);
  expect(said.gem).toBe(false);
  expect(engine.enemiesLeft()).toBe(1);
});

test("an ordinary building still comes down, which is the whole of raze", () => {
  const engine = run(street("#"));
  walkUpAndHit(engine);
  // Razed cells burn before they become rubble, so this one is fire.
  expect(engine.render()[idx(5, 7)]).toBe(TILE_FIRE);
  expect(engine.boxesLeft()).toBe(0);
});

test("raze/2 has no idea what a box is, and that is why it still ships", () => {
  // Every city link anybody has sent pins raze/2. It reads a box cell as the
  // wall it is and razes it, which is exactly what it did the day it shipped.
  const text = street("?").replace("behaviour=3", "behaviour=2");
  const engine = engineFor(parseLevel(text), JAEGER) as unknown as {
    step(held: number): number; render(): Uint8Array;
  };
  const helper = engine as unknown as ReturnType<typeof run>;
  for (let i = 0; i < 90; i = (i + 1) | 0) engine.step(HELD_RIGHT);
  engine.step(HELD_NONE);
  engine.step(HELD_ACT);
  for (let i = 0; i < 4; i = (i + 1) | 0) engine.step(HELD_NONE);
  expect(engine.render()[idx(5, 7)]).toBe(TILE_FIRE);
  void helper;
});
