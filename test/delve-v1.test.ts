import { expect, test } from "bun:test";
import { DAY1_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { GRID_AREA, GRID_H, GRID_W, idx } from "../src/core/grid.ts";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { TILE_ACTOR, TILE_COUNT, TILE_FLOOR, TILE_WALL } from "../src/core/tiles.ts";
import { DelveV1 } from "../src/engines/delve/v1.ts";
import {
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_UP,
  INPUT_WAIT,
  STATUS_PLAYING,
} from "../src/engines/types.ts";

const level = parseLevel(DAY1_LEVEL_TEXT);
const fresh = () => new DelveV1(level);

function run(log: readonly number[]) {
  const engine = fresh();
  for (const input of log) engine.step(input);
  return engine;
}

test("the actor starts on the level's start cell", () => {
  expect(fresh().position()).toEqual({ x: level.startX, y: level.startY });
});

test("an open cell is entered", () => {
  const engine = fresh();
  engine.step(INPUT_RIGHT);
  expect(engine.position()).toEqual({ x: 2, y: 1 });
  expect(engine.didBump()).toBe(false);
});

test("a wall refuses the move and the actor does not budge", () => {
  // (1,1) has wall above at (1,0) and wall left at (0,1).
  const engine = fresh();
  engine.step(INPUT_UP);
  expect(engine.position()).toEqual({ x: 1, y: 1 });
  expect(engine.didBump()).toBe(true);

  engine.step(INPUT_LEFT);
  expect(engine.position()).toEqual({ x: 1, y: 1 });
  expect(engine.didBump()).toBe(true);
});

test("the grid edge is as solid as a wall", () => {
  const engine = fresh();
  // Walk hard into the top-left corner, then keep pushing.
  for (let i = 0; i < 40; i++) {
    engine.step(INPUT_UP);
    engine.step(INPUT_LEFT);
  }
  const pos = engine.position();
  expect(pos.x).toBeGreaterThanOrEqual(0);
  expect(pos.y).toBeGreaterThanOrEqual(0);
  expect(pos).toEqual({ x: 1, y: 1 });
});

test("a wall never lets you through, however long you push", () => {
  // Run the whole top corridor east, then try to walk south through row 2's wall.
  const engine = fresh();
  for (let i = 0; i < GRID_W; i++) engine.step(INPUT_RIGHT);
  expect(engine.position()).toEqual({ x: 22, y: 1 });

  const before = engine.position();
  for (let i = 0; i < 5; i++) engine.step(INPUT_RIGHT);
  expect(engine.position()).toEqual(before);
});

test("E7: render() returns exactly w*h valid tile indices", () => {
  const tiles = run([INPUT_RIGHT, INPUT_RIGHT, INPUT_DOWN]).render();
  expect(tiles.length).toBe(GRID_AREA);
  expect(GRID_AREA).toBe(GRID_W * GRID_H);
  for (const t of tiles) {
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(TILE_COUNT);
  }
});

test("render() puts the actor where the engine says it is, over floor not wall", () => {
  const engine = run([INPUT_RIGHT, INPUT_RIGHT, INPUT_RIGHT]);
  const { x, y } = engine.position();
  const tiles = engine.render();

  let actors = 0;
  for (const t of tiles) if (t === TILE_ACTOR) actors++;
  expect(actors).toBe(1);
  expect(tiles[idx(x, y)]).toBe(TILE_ACTOR);

  // every other cell is exactly the level's wall map
  for (let i = 0; i < GRID_AREA; i++) {
    if (i === idx(x, y)) continue;
    expect(tiles[i]).toBe(level.walls[i] === 1 ? TILE_WALL : TILE_FLOOR);
  }
});

test("E3: three replays of one log produce identical hashes", () => {
  const log = [
    INPUT_RIGHT, INPUT_RIGHT, INPUT_DOWN, INPUT_DOWN, INPUT_LEFT,
    INPUT_UP, INPUT_UP, INPUT_UP, INPUT_RIGHT, INPUT_WAIT,
    INPUT_DOWN, INPUT_RIGHT, INPUT_RIGHT, INPUT_DOWN, INPUT_DOWN,
  ];
  const hashes = [run(log), run(log), run(log)].map((e) => hashHex(e.stateHash()));
  console.log(`\n  replay hashes: ${hashes.join("  ")}`);
  expect(new Set(hashes).size).toBe(1);
});

test("E8-ish: garbage inputs are waits, never crashes", () => {
  const engine = fresh();
  const before = hashHex(engine.stateHash());
  for (const junk of [-1, 5, 99, 2147483647, -2147483648, 0.5, NaN]) {
    expect(engine.step(junk)).toBe(STATUS_PLAYING);
  }
  expect(hashHex(engine.stateHash())).toBe(before);
});

test("day 1 never ends: status is always PLAYING", () => {
  const engine = fresh();
  for (let i = 0; i < 200; i++) {
    expect(engine.step(i % 5)).toBe(STATUS_PLAYING);
  }
});

test("the hash tracks position and nothing else", () => {
  const a = run([INPUT_RIGHT, INPUT_LEFT]); // returns to start
  const b = fresh();
  expect(hashHex(a.stateHash())).toBe(hashHex(b.stateHash()));

  const c = run([INPUT_RIGHT]);
  expect(hashHex(c.stateHash())).not.toBe(hashHex(b.stateHash()));
});

test("E10: the level's cosmetic fields do not reach stateHash()", () => {
  const restyled = parseLevel(DAY1_LEVEL_TEXT.replace("tiles=1", "tiles=7"));
  expect(restyled.tilesetId).toBe(7);

  const log = [INPUT_RIGHT, INPUT_RIGHT, INPUT_DOWN];
  const plain = run(log);
  const themed = new DelveV1(restyled);
  for (const input of log) themed.step(input);

  expect(hashHex(themed.stateHash())).toBe(hashHex(plain.stateHash()));
});
