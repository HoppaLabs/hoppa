import { expect, test } from "bun:test";
import { DAY2_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { GRID_AREA, GRID_W, idx } from "../src/core/grid.ts";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import {
  TILE_ACTOR,
  TILE_COUNT,
  TILE_EXIT_LOCKED,
  TILE_EXIT_OPEN,
  TILE_TREASURE,
} from "../src/core/tiles.ts";
import { DelveV2, MAX_TREASURE, TURN_CAP } from "../src/engines/delve/v2.ts";
import {
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_UP,
  INPUT_WAIT,
  STATUS_LOST,
  STATUS_PLAYING,
  STATUS_WON,
} from "../src/engines/types.ts";

const level = parseLevel(DAY2_LEVEL_TEXT);
const fresh = () => new DelveV2(level);
const MOVES: Record<string, number> = { U: 1, R: 2, D: 3, L: 4, ".": 0 };

/** The BFS-optimal win, same log the golden vector pins. */
const WIN_LOG =
  "DDDDDDRRRRRRRUUUURRRDDDDLDDRRRUURRDDDDLRUUUULLDDLLLUUUURUULLLDDDD" +
  "LLLLDDDUUULLLUUUUUURRRDDLDDRRRUUUURRRRRRRDDDDRRUUUURRRRRRRDDDDLRDDDDDDD";

/** Reaches the exit without collecting everything: 50 turns, 1 of 5 treasures. */
const TO_SHUT_EXIT = "RRRDDLDDRRRUUUURRRRRRRDDDDRRUUUURRRRRRRDDDDDDDDDDD";

/** The prefix of WIN_LOG that ends standing on the first treasure it reaches. */
const TO_FIRST_TREASURE = WIN_LOG.slice(0, 39);

function play(log: string, engine = fresh()) {
  let status = STATUS_PLAYING;
  for (const ch of log) status = engine.step(MOVES[ch] as number);
  return { engine, status };
}

// --- the turn counter -------------------------------------------------------

test("a fresh game is on turn zero with nothing collected", () => {
  const engine = fresh();
  expect(engine.turns()).toBe(0);
  expect(engine.collectedCount()).toBe(0);
  expect(engine.currentStatus()).toBe(STATUS_PLAYING);
});

test("every step is a turn -- moving, waiting and bumping alike", () => {
  const engine = fresh();
  engine.step(INPUT_DOWN); // moves
  expect(engine.turns()).toBe(1);
  engine.step(INPUT_WAIT); // stands still on purpose
  expect(engine.turns()).toBe(2);
  engine.step(INPUT_LEFT); // wall at (0,2): refused
  expect(engine.turns()).toBe(3);
  expect(engine.didBump()).toBe(true);
  expect(engine.position()).toEqual({ x: 1, y: 2 });
});

test("garbage input is a wait, and a wait still costs a turn", () => {
  const engine = fresh();
  for (const junk of [-1, 5, 99, 2147483647, -2147483648, 0.5, NaN]) {
    expect(engine.step(junk)).toBe(STATUS_PLAYING);
  }
  expect(engine.turns()).toBe(7);
  expect(engine.position()).toEqual({ x: level.startX, y: level.startY });
});

// --- treasure ---------------------------------------------------------------

test("stepping onto treasure collects it, and it stays collected", () => {
  const { engine } = play(TO_FIRST_TREASURE);
  expect(engine.collectedCount()).toBe(1);
  // It is the treasure at (14,11), slot 4 in reading order.
  expect(engine.position()).toEqual({ x: 14, y: 11 });
  expect(level.treasureSlot[idx(14, 11)]).toBe(4);

  play("RL", engine); // step off the treasure cell and back onto it
  expect(engine.collectedCount()).toBe(1);
  expect(engine.turns()).toBe(TO_FIRST_TREASURE.length + 2);
});

test("a collected treasure is gone from the grid for good", () => {
  const { engine } = play(TO_FIRST_TREASURE);
  expect(engine.render()[idx(14, 11)]).toBe(TILE_ACTOR); // standing on it
  play("R", engine);
  expect(engine.render()[idx(14, 11)]).not.toBe(TILE_TREASURE);
});

test("collecting every treasure takes exactly the level's count", () => {
  const { engine } = play(WIN_LOG);
  expect(engine.treasureTotal()).toBe(5);
  expect(engine.collectedCount()).toBe(5);
});

test("a level with more treasure than the mask can hold is refused, not mangled", () => {
  // Nine treasures: one more than the 8 bits the collected mask has.
  const rows = DAY2_LEVEL_TEXT.split("\n");
  rows[8] = "#........#$$$$$$$$$..#.#";
  expect(rows[8]?.length).toBe(GRID_W);
  const crowded = parseLevel(rows.join("\n"));
  expect(crowded.treasureCells.length).toBeGreaterThan(MAX_TREASURE);
  expect(() => new DelveV2(crowded)).toThrow(/can track 8/);
});

// --- the exit ---------------------------------------------------------------

test("the exit is shut until the last treasure is in hand", () => {
  const engine = fresh();
  expect(engine.exitOpen()).toBe(false);
  const { engine: won } = play(WIN_LOG);
  expect(won.exitOpen()).toBe(true);
});

test("standing on a shut exit does not win, and says so", () => {
  const { engine, status } = play(TO_SHUT_EXIT);
  expect(engine.position()).toEqual({ x: level.exitX, y: level.exitY });
  expect(engine.collectedCount()).toBe(1);
  expect(engine.treasureTotal()).toBe(5);
  expect(status).toBe(STATUS_PLAYING);
  expect(engine.exitOpen()).toBe(false);
  expect(engine.message()).toMatch(/treasure/i);

  // And it stays shut: you can stand there all day.
  play("....", engine);
  expect(engine.currentStatus()).toBe(STATUS_PLAYING);
});

test("the exit with every treasure collected is a win", () => {
  const { engine, status } = play(WIN_LOG);
  expect(status).toBe(STATUS_WON);
  expect(engine.position()).toEqual({ x: level.exitX, y: level.exitY });
  expect(engine.turns()).toBe(WIN_LOG.length);
  expect(engine.message()).not.toBeNull();
});

test("a level with no treasure at all has its exit open from turn zero", () => {
  const bare = parseLevel(DAY2_LEVEL_TEXT.replace(/\$/g, "."));
  expect(bare.treasureCells.length).toBe(0);
  expect(new DelveV2(bare).exitOpen()).toBe(true);
});

// --- ending -----------------------------------------------------------------

test("E4: the game terminates -- the turn cap is a loss", () => {
  const engine = fresh();
  let status = STATUS_PLAYING;
  let steps = 0;
  while (status === STATUS_PLAYING && steps < TURN_CAP * 2) {
    status = engine.step(INPUT_WAIT);
    steps++;
  }
  expect(status).toBe(STATUS_LOST);
  expect(engine.turns()).toBe(TURN_CAP);
  expect(steps).toBe(TURN_CAP);
  expect(engine.turnsLeft()).toBe(0);
});

test("a finished game is absorbing: extra steps change nothing", () => {
  const { engine, status } = play(WIN_LOG);
  expect(status).toBe(STATUS_WON);

  const settled = hashHex(engine.stateHash());
  const turns = engine.turns();
  for (const input of [INPUT_UP, INPUT_LEFT, INPUT_WAIT, INPUT_DOWN]) {
    expect(engine.step(input)).toBe(STATUS_WON);
  }
  expect(engine.turns()).toBe(turns);
  expect(hashHex(engine.stateHash())).toBe(settled);
});

// --- render -----------------------------------------------------------------

test("E7: render() returns exactly w*h valid tile indices", () => {
  const tiles = play("DDRR").engine.render();
  expect(tiles.length).toBe(GRID_AREA);
  for (const t of tiles) {
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(TILE_COUNT);
  }
});

test("render() shows uncollected treasure, a shut exit, and one actor", () => {
  const tiles = fresh().render();
  let treasure = 0;
  let actors = 0;
  for (const t of tiles) {
    if (t === TILE_TREASURE) treasure++;
    if (t === TILE_ACTOR) actors++;
  }
  expect(treasure).toBe(5);
  expect(actors).toBe(1);
  expect(tiles[idx(level.exitX, level.exitY)]).toBe(TILE_EXIT_LOCKED);
});

test("render() drops collected treasure and opens the exit", () => {
  const tiles = play(WIN_LOG).engine.render();
  for (const t of tiles) expect(t).not.toBe(TILE_TREASURE);
  // The actor is standing on the open exit at the end, so check the tile the
  // engine would draw with the actor elsewhere.
  const engine = fresh();
  for (const ch of WIN_LOG.slice(0, WIN_LOG.length - 1)) engine.step(MOVES[ch] as number);
  expect(engine.render()[idx(level.exitX, level.exitY)]).toBe(TILE_EXIT_OPEN);
});

// --- the hash ---------------------------------------------------------------

test("E3: three replays of one log produce identical hashes", () => {
  const log = "DDDDDDRRRRRRRUUUURRRDDDDLDD";
  const hashes = [play(log), play(log), play(log)].map((r) => hashHex(r.engine.stateHash()));
  console.log(`\n  v2 replay hashes: ${hashes.join("  ")}`);
  expect(new Set(hashes).size).toBe(1);
});

test("the hash covers the turn counter, not just position", () => {
  // Same square, different number of turns spent getting there.
  const direct = play("DD").engine;
  const scenic = play("DD..").engine;
  expect(scenic.position()).toEqual(direct.position());
  expect(hashHex(scenic.stateHash())).not.toBe(hashHex(direct.stateHash()));
});

test("the hash covers collected treasure", () => {
  // Same log, same walls, same cell, same turn -- the only difference in
  // authoritative state is whether a treasure was picked up on the way.
  const stripped = parseLevel(DAY2_LEVEL_TEXT.replace(/\$/g, "."));
  const rich = play(TO_FIRST_TREASURE).engine;
  const bare = play(TO_FIRST_TREASURE, new DelveV2(stripped)).engine;

  expect(bare.position()).toEqual(rich.position());
  expect(bare.turns()).toBe(rich.turns());
  expect(rich.collectedCount()).toBe(1);
  expect(bare.collectedCount()).toBe(0);
  expect(hashHex(bare.stateHash())).not.toBe(hashHex(rich.stateHash()));
});

test("E10: the level's cosmetic fields do not reach stateHash()", () => {
  const restyled = parseLevel(DAY2_LEVEL_TEXT.replace("tiles=1", "tiles=7"));
  expect(restyled.tilesetId).toBe(7);

  const log = "DDDDDDRRRRRRRUUUU";
  const plain = play(log).engine;
  const themed = play(log, new DelveV2(restyled)).engine;
  expect(hashHex(themed.stateHash())).toBe(hashHex(plain.stateHash()));
});

test("E5-ish: seeded random logs never crash and always terminate", () => {
  // A tiny xorshift so the fuzz is reproducible without importing a PRNG that
  // does not exist yet.
  let state = 0x2f6e2b1 | 0;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % 5;
  };

  for (let run = 0; run < 200; run++) {
    const engine = fresh();
    let status: number = STATUS_PLAYING;
    for (let i = 0; i < 400 && status === STATUS_PLAYING; i++) {
      status = engine.step(next());
    }
    expect(engine.turns()).toBeLessThanOrEqual(TURN_CAP);
    expect(engine.render().length).toBe(GRID_AREA);
  }
});
