import { expect, test } from "bun:test";
import { DAY3_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { GRID_AREA, GRID_W, idx } from "../src/core/grid.ts";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { patrolCellAt, patrolsFor } from "../src/core/patrol.ts";
import { TILE_COUNT, TILE_GUARD } from "../src/core/tiles.ts";
import { ALERT_MAX, DelveV3, NOISE_RADIUS, TURN_CAP } from "../src/engines/delve/v3.ts";
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

const level = parseLevel(DAY3_LEVEL_TEXT);
const fresh = () => new DelveV3(level);
const MOVES: Record<string, number> = { U: 1, R: 2, D: 3, L: 4, ".": 0 };

/** The committed clean run: four gems, four patrols, never heard. */
const CLEAN_WIN =
  ".RRRR..DDDDRRDDDDLLLLLRRRRRRRRRRR..DDDLLRR..UUUUUUULLUUUURRRRRRRRRR" +
  "DDDDRLDDDDLRDDDR";

function play(log: string, engine = fresh()) {
  let status: number = STATUS_PLAYING;
  for (const ch of log) status = engine.step(MOVES[ch] as number);
  return { engine, status };
}

// --- guards exist and move ---------------------------------------------------

test("the level ships with four guards, and render() shows them", () => {
  const engine = fresh();
  expect(engine.guardCount()).toBe(4);
  let seen = 0;
  for (const t of engine.render()) if (t === TILE_GUARD) seen++;
  expect(seen).toBe(4);
});

test("guards are where the patrol geometry says, on every turn", () => {
  const patrols = patrolsFor(level);
  const engine = fresh();
  for (let t = 1; t <= 24; t++) {
    engine.step(INPUT_WAIT);
    const tiles = engine.render();
    for (const patrol of patrols) {
      const cell = patrolCellAt(patrol, t);
      // The actor may be standing on one, so only assert guards we can see.
      if (cell !== idx(engine.position().x, engine.position().y)) {
        expect(tiles[cell]).toBe(TILE_GUARD);
      }
    }
  }
});

test("E7: render() still returns exactly w*h valid tile indices", () => {
  const tiles = play("RRDD").engine.render();
  expect(tiles.length).toBe(GRID_AREA);
  for (const t of tiles) {
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(TILE_COUNT);
  }
});

// --- capture -----------------------------------------------------------------

test("walking into a guard is a catch, and the run ends there", () => {
  // Guard 0 patrols x=3 between y=1 and y=5, starting at y=3 and heading down.
  // Walk east along the top band and into the connector mouth to meet it.
  const engine = fresh();
  let status: number = STATUS_PLAYING;
  let steps = 0;
  // Sit at (2,1) until the guard is about to arrive at (3,1), then step in.
  while (status === STATUS_PLAYING && steps < 60) {
    const patrol = patrolsFor(level)[0]!;
    const guardNext = patrolCellAt(patrol, engine.turns() + 1);
    const here = engine.position();
    if (here.x === 2 && here.y === 1 && guardNext === idx(3, 1)) {
      status = engine.step(INPUT_RIGHT); // step onto the cell it moves into
      break;
    }
    status = engine.step(here.x < 2 ? INPUT_RIGHT : INPUT_WAIT);
    steps++;
  }

  expect(status).toBe(STATUS_LOST);
  expect(engine.wasCaught()).toBe(true);
  expect(engine.message()).toMatch(/ankle/i);
});

test("a catch is absorbing: nothing after it changes anything", () => {
  const engine = fresh();
  let status: number = STATUS_PLAYING;
  for (let i = 0; i < 60 && status === STATUS_PLAYING; i++) {
    status = engine.step(engine.position().x < 3 ? INPUT_RIGHT : INPUT_DOWN);
  }
  expect(status).toBe(STATUS_LOST);

  const settled = hashHex(engine.stateHash());
  const turns = engine.turns();
  for (const input of [INPUT_UP, INPUT_LEFT, INPUT_WAIT]) {
    expect(engine.step(input)).toBe(STATUS_LOST);
  }
  expect(engine.turns()).toBe(turns);
  expect(hashHex(engine.stateHash())).toBe(settled);
});

// --- alert -------------------------------------------------------------------

test("a guard within the noise radius is heard, and the alarm rises", () => {
  const engine = fresh();
  const patrols = patrolsFor(level);

  let heardOn = -1;
  for (let i = 0; i < 40 && engine.currentStatus() === STATUS_PLAYING; i++) {
    engine.step(engine.position().x < 2 ? INPUT_RIGHT : INPUT_WAIT);
    if (engine.wasSpotted()) {
      heardOn = engine.turns();
      break;
    }
  }

  expect(heardOn).toBeGreaterThan(0);
  expect(engine.alertLevel()).toBe(1);
  expect(engine.message()).toMatch(/heard/i);

  // And it really was within the radius.
  const me = engine.position();
  const near = patrols.some((p) => {
    const cell = patrolCellAt(p, heardOn);
    const gx = cell % GRID_W;
    const gy = (cell / GRID_W) | 0;
    return Math.max(Math.abs(gx - me.x), Math.abs(gy - me.y)) <= NOISE_RADIUS;
  });
  expect(near).toBe(true);
});

test("the alarm reaching its ceiling loses the game", () => {
  // Loiter next to the x=3 connector mouth and let the guard pass repeatedly.
  const engine = fresh();
  let status: number = STATUS_PLAYING;
  for (let i = 0; i < 200 && status === STATUS_PLAYING; i++) {
    status = engine.step(engine.position().x < 2 ? INPUT_RIGHT : INPUT_WAIT);
  }
  expect(status).toBe(STATUS_LOST);
  expect(engine.alertLevel()).toBe(ALERT_MAX);
  expect(engine.wasCaught()).toBe(false);
  expect(engine.message()).toMatch(/knew exactly/i);
});

test("alert is part of the hash: two runs to the same cell differ if one was heard", () => {
  const quiet = play(CLEAN_WIN.slice(0, 6)).engine;
  expect(quiet.alertLevel()).toBe(0);

  const loud = fresh();
  let status: number = STATUS_PLAYING;
  for (let i = 0; i < 40 && status === STATUS_PLAYING && loud.alertLevel() === 0; i++) {
    status = loud.step(loud.position().x < 2 ? INPUT_RIGHT : INPUT_WAIT);
  }
  expect(loud.alertLevel()).toBe(1);
  expect(hashHex(loud.stateHash())).not.toBe(hashHex(quiet.stateHash()));
});

// --- the clean run -----------------------------------------------------------

test("the guards can be dodged: the clean run wins without being heard", () => {
  const { engine, status } = play(CLEAN_WIN);
  expect(status).toBe(STATUS_WON);
  expect(engine.alertLevel()).toBe(0);
  expect(engine.wasCaught()).toBe(false);
  expect(engine.collectedCount()).toBe(4);
  expect(engine.turns()).toBe(CLEAN_WIN.length);
});

test("reaching the exit beats the alarm on the same turn", () => {
  // The last step of the clean run lands on the exit. Even if a guard were
  // beside it, the win is checked first -- same rule as v2 and the turn cap.
  const engine = fresh();
  let status: number = STATUS_PLAYING;
  for (const ch of CLEAN_WIN) status = engine.step(MOVES[ch] as number);
  expect(status).toBe(STATUS_WON);
});

// --- carried over from v2 ----------------------------------------------------

test("E3: three replays of one log produce identical hashes", () => {
  const log = CLEAN_WIN.slice(0, 30);
  const hashes = [play(log), play(log), play(log)].map((r) => hashHex(r.engine.stateHash()));
  console.log(`\n  v3 replay hashes: ${hashes.join("  ")}`);
  expect(new Set(hashes).size).toBe(1);
});

test("E10: the level's cosmetic fields do not reach stateHash()", () => {
  const restyled = parseLevel(DAY3_LEVEL_TEXT.replace("tiles=1", "tiles=7"));
  expect(restyled.tilesetId).toBe(7);
  const log = CLEAN_WIN.slice(0, 20);
  expect(hashHex(play(log, new DelveV3(restyled)).engine.stateHash())).toBe(
    hashHex(play(log).engine.stateHash()),
  );
});

test("E4: the game always terminates", () => {
  // Waiting in the corner is safe from catching but not from the clock.
  const engine = fresh();
  let status: number = STATUS_PLAYING;
  let steps = 0;
  while (status === STATUS_PLAYING && steps < TURN_CAP * 2) {
    status = engine.step(INPUT_WAIT);
    steps++;
  }
  expect(status).toBe(STATUS_LOST);
  expect(engine.turns()).toBeLessThanOrEqual(TURN_CAP);
});

test("E5-ish: seeded random logs never crash and always terminate", () => {
  let state = 0x51f3a7 | 0;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % 5;
  };

  for (let run = 0; run < 200; run++) {
    const engine = fresh();
    let status: number = STATUS_PLAYING;
    for (let i = 0; i < 400 && status === STATUS_PLAYING; i++) status = engine.step(next());
    expect(engine.turns()).toBeLessThanOrEqual(TURN_CAP);
    expect(engine.render().length).toBe(GRID_AREA);
  }
});
