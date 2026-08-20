import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { decodeLevel, encodeLevel, sameLevel } from "../src/core/codec.ts";
import { engineFor } from "../src/engines/registry.ts";
import { BRUK, NIM, PELL, creatureFromBuild } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { ONE, toCell } from "../src/core/fixed.ts";
import { TickPump, TICK_MS } from "../src/core/clock.ts";
import {
  BODY, ENEMY_SPEED, RoamV1, SWING_TICKS, TICK_CAP, heartsFor, speedFor, stunFor,
} from "../src/engines/roam/v1.ts";
import {
  HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_NONE, HELD_RIGHT, HELD_UP,
  STATUS_LOST, STATUS_PLAYING, STATUS_WON,
} from "../src/engines/types.ts";
import { GRID_H, GRID_W, idx } from "../src/core/grid.ts";
import { isWall } from "../src/core/level.ts";

const TEXT = await Bun.file("levels/roam1.lvl").text();
const level = parseLevel(TEXT);
const fresh = (creature = BRUK) => new RoamV1(level, creature);

/**
 * A bare room with one guard four cells to the right of the start. The shipped
 * level is a maze, so "walk at the nearest enemy" there depends on the layout;
 * here it cannot. Anything about hitting and being hit is tested in this.
 */
const ARENA_TEXT = [
  "hoppa/1 roam seed=1a1a tiles=1 behaviour=1",
  "########################",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#.@...G...............$#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#.....................>#",
  "########################",
].join("\n");
const arena = parseLevel(ARENA_TEXT);

/** Hold a button for a number of ticks. */
function hold(engine: RoamV1, buttons: number, ticks: number): number {
  let status: number = STATUS_PLAYING;
  for (let i = 0; i < ticks; i++) status = engine.step(buttons);
  return status;
}

// --- the premise that must not break -------------------------------------------

test("a real-time level still fits in a share link", () => {
  const code = encodeLevel(level);
  console.log(`\n  roam level: ${code.length} chars of level data`);
  expect(code.length).toBeLessThan(150);
  expect(sameLevel(level, decodeLevel(code))).toBe(true);
});

test("a link pins the real-time engine and routes to it", () => {
  const decoded = decodeLevel(encodeLevel(level));
  expect(decoded.engine).toBe("roam");
  const engine = engineFor(decoded);
  expect(engine).toBeInstanceOf(RoamV1);
  expect(engine.behaviourVersion).toBe(1);
});

// E3, and the whole share gate: real time must still replay identically.
test("E3: the same held-button log replays to the same hash, three times", () => {
  const log = [
    [HELD_RIGHT, 20], [HELD_DOWN, 14], [HELD_RIGHT, 30], [HELD_NONE, 5],
    [HELD_DOWN, 25], [HELD_LEFT, 18], [HELD_UP, 9],
  ] as const;

  const run = () => {
    const engine = fresh();
    for (const [buttons, ticks] of log) hold(engine, buttons, ticks);
    return hashHex(engine.stateHash());
  };

  const hashes = [run(), run(), run()];
  console.log(`  roam replay hashes: ${hashes.join("  ")}`);
  expect(new Set(hashes).size).toBe(1);
});

test("a decoded level plays identically to the one it came from", () => {
  const a = engineFor(level) as unknown as RoamV1;
  const b = engineFor(decodeLevel(encodeLevel(level))) as unknown as RoamV1;
  for (let i = 0; i < 120; i++) {
    const buttons = i % 3 === 0 ? HELD_RIGHT : i % 3 === 1 ? HELD_DOWN : HELD_NONE;
    a.step(buttons);
    b.step(buttons);
  }
  expect(hashHex(b.stateHash())).toBe(hashHex(a.stateHash()));
});

test("time never enters the engine: only whole ticks do", () => {
  // The page turns milliseconds into ticks; the engine counts ticks. Two
  // machines running at different frame rates see the same simulation.
  const smooth = new TickPump();
  const stuttery = new TickPump();

  let smoothTicks = 0;
  for (let frame = 0; frame < 60; frame++) smoothTicks += smooth.pump(16);
  let stutteryTicks = 0;
  for (let frame = 0; frame < 15; frame++) stutteryTicks += stuttery.pump(64);

  // 60 frames at 16ms and 15 at 64ms are both ~960ms of play.
  expect(Math.abs(smoothTicks - stutteryTicks)).toBeLessThanOrEqual(1);
  expect(smoothTicks).toBe((960 / TICK_MS) | 0);
});

test("a backgrounded tab cannot simulate a minute in one frame", () => {
  const pump = new TickPump();
  expect(pump.pump(60_000)).toBeLessThanOrEqual(6);
});

// --- it is a stealth game --------------------------------------------------------

/** Walk straight at the arena's one guard until something happens. */
function chargeTheNearest(engine: RoamV1, until: () => boolean, extra = 0): void {
  for (let i = 0; i < 1200 && !until(); i++) {
    const me = engine.where();
    const target = engine.enemyPositions()[0];
    if (target === undefined) return;
    const buttons =
      (target.x > me.x + BODY ? HELD_RIGHT : target.x < me.x - BODY ? HELD_LEFT : 0) |
      (target.y > me.y + BODY ? HELD_DOWN : target.y < me.y - BODY ? HELD_UP : 0) |
      extra;
    if (engine.step(buttons) !== STATUS_PLAYING) return;
  }
}

test("the sword knocks an enemy down, and strength decides for how long", () => {
  const strong = creatureFromBuild("s", "Swinger", "?", { FORCE: 5, HASTE: 2, GUARD: 1, REACH: 0 }, starterSprite());
  const weak = creatureFromBuild("w", "Weak", "?", { FORCE: 0, HASTE: 2, GUARD: 3, REACH: 3 }, starterSprite());
  expect(stunFor(strong)).toBeGreaterThan(stunFor(weak));

  const engine = new RoamV1(arena, strong);
  chargeTheNearest(engine, () => engine.justStruck(), HELD_ACT);
  expect(engine.justStruck()).toBe(true);
  expect(engine.enemyPositions().some((e) => e.stunned)).toBe(true);
});

test("walking into an enemy without swinging costs you a heart", () => {
  const engine = new RoamV1(arena, BRUK);
  const before = engine.health().hp;
  chargeTheNearest(engine, () => engine.justHurt());
  expect(engine.justHurt()).toBe(true);
  expect(engine.health().hp).toBe(before - 1);
});

test("holding the attack button does not flail: one swing per press", () => {
  const engine = fresh();
  engine.step(HELD_ACT);
  expect(engine.swinging()).toBe(true);
  // Held down for the whole swing and beyond; it must not re-trigger early.
  for (let i = 0; i < SWING_TICKS - 1; i++) engine.step(HELD_ACT);
  expect(engine.swinging()).toBe(true);
});

test("nerve is how many times you can be caught", () => {
  expect(heartsFor(PELL)).toBeGreaterThan(heartsFor(NIM));
  for (const creature of [BRUK, NIM, PELL]) {
    expect(new RoamV1(level, creature).health().max).toBe(heartsFor(creature));
  }
});

// --- the world moves on its own ---------------------------------------------------

test("enemies move even when you do not touch the controls", () => {
  const engine = fresh();
  const before = engine.enemyPositions().map((e) => `${e.x},${e.y}`);
  hold(engine, HELD_NONE, 20);
  const after = engine.enemyPositions().map((e) => `${e.x},${e.y}`);
  expect(after).not.toEqual(before);
});

test("standing still still costs you time", () => {
  const engine = fresh();
  hold(engine, HELD_NONE, 45);
  expect(engine.ticks()).toBe(45);
  expect(engine.seconds()).toBe(1);
});

test("an enemy that notices you comes after you", () => {
  const engine = fresh();
  let chased = false;
  for (let i = 0; i < 600 && !chased; i++) {
    engine.step(HELD_RIGHT);
    if (engine.hunted()) chased = true;
  }
  expect(chased).toBe(true);
});

// --- movement ----------------------------------------------------------------------

test("speed decides how far a held direction carries you", () => {
  const quick = creatureFromBuild("q", "Quick", "?", { FORCE: 0, HASTE: 5, GUARD: 2, REACH: 1 }, starterSprite());
  const slow = creatureFromBuild("p", "Plod", "?", { FORCE: 3, HASTE: 0, GUARD: 5, REACH: 0 }, starterSprite());
  expect(speedFor(quick)).toBeGreaterThan(speedFor(slow));

  const a = new RoamV1(level, quick);
  const b = new RoamV1(level, slow);
  const start = a.where().x;
  hold(a, HELD_RIGHT, 10);
  hold(b, HELD_RIGHT, 10);
  expect(a.where().x - start).toBeGreaterThan(b.where().x - start);
});

test("you are faster than a guard only if you spent pips on it", () => {
  const quick = creatureFromBuild("q", "Quick", "?", { FORCE: 0, HASTE: 5, GUARD: 2, REACH: 1 }, starterSprite());
  const plod = creatureFromBuild("p", "Plod", "?", { FORCE: 3, HASTE: 0, GUARD: 5, REACH: 0 }, starterSprite());
  expect(speedFor(quick)).toBeGreaterThan(ENEMY_SPEED);
  expect(speedFor(plod)).toBeLessThan(ENEMY_SPEED);
});

test("walls stop you, and you slide along them rather than sticking", () => {
  const engine = new RoamV1(arena, BRUK);
  // Walk hard into the top wall. Bruk is slow, so give it long enough to
  // actually arrive: six cells at 20 subcells a tick is over 70 ticks.
  hold(engine, HELD_UP, 150);
  const stuck = engine.where();
  expect(toCell(stuck.y)).toBe(1); // the top open row
  hold(engine, HELD_UP | HELD_LEFT, 20);
  expect(engine.where().x).toBeLessThan(stuck.x);
  expect(toCell(engine.where().y)).toBe(1); // still pinned to the wall
});

test("a body never ends a tick inside a wall", () => {
  let state = 0x51ab3d | 0;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) & 15;
  };
  const engine = fresh();
  for (let i = 0; i < 1500 && engine.currentStatus() === STATUS_PLAYING; i++) {
    engine.step(next());
    const me = engine.where();
    for (const [dx, dy] of [[-BODY, -BODY], [BODY, -BODY], [-BODY, BODY], [BODY, BODY]]) {
      const cx = toCell((me.x + (dx as number)) | 0);
      const cy = toCell((me.y + (dy as number)) | 0);
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThan(GRID_W);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThan(GRID_H);
      expect(isWall(level, cx, cy)).toBe(false);
    }
  }
});

// --- winning and losing -------------------------------------------------------------

test("reach lifts a gem from further away", () => {
  const longArm = creatureFromBuild("l", "Long", "?", { FORCE: 0, HASTE: 0, GUARD: 3, REACH: 5 }, starterSprite());
  const shortArm = creatureFromBuild("s", "Short", "?", { FORCE: 0, HASTE: 0, GUARD: 3, REACH: 0 }, starterSprite());

  // Both walk the same path; the long arm should collect no later than the short.
  const a = new RoamV1(level, longArm);
  const b = new RoamV1(level, shortArm);
  for (let i = 0; i < 400; i++) {
    a.step(HELD_RIGHT);
    b.step(HELD_RIGHT);
  }
  expect(a.collectedCount()).toBeGreaterThanOrEqual(b.collectedCount());
});

test("E4: the game always ends", () => {
  const engine = fresh();
  let status: number = STATUS_PLAYING;
  let ticks = 0;
  while (status === STATUS_PLAYING && ticks < TICK_CAP * 2) {
    status = engine.step(HELD_NONE);
    ticks++;
  }
  expect(status).not.toBe(STATUS_PLAYING);
  expect(engine.ticks()).toBeLessThanOrEqual(TICK_CAP);
});

test("E7: render() returns exactly w*h valid tile indices", () => {
  const engine = fresh();
  hold(engine, HELD_RIGHT, 20);
  const tiles = engine.render();
  expect(tiles.length).toBe(GRID_W * GRID_H);
  for (const tile of tiles) expect(tile).toBeLessThan(9);
});

test("E10: cosmetics do not reach stateHash()", () => {
  const restyled = parseLevel(TEXT.replace("tiles=1", "tiles=7"));
  const a = new RoamV1(level, BRUK);
  const b = new RoamV1(restyled, BRUK);
  for (let i = 0; i < 60; i++) {
    a.step(HELD_RIGHT);
    b.step(HELD_RIGHT);
  }
  expect(hashHex(b.stateHash())).toBe(hashHex(a.stateHash()));
});

test("E5-ish: random input never crashes and always terminates", () => {
  let state = 0x2f9d11 | 0;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) & 15;
  };
  for (const creature of [BRUK, NIM, PELL]) {
    const engine = new RoamV1(level, creature);
    let status: number = STATUS_PLAYING;
    for (let i = 0; i < 2000 && status === STATUS_PLAYING; i++) status = engine.step(next());
    expect(engine.render().length).toBe(GRID_W * GRID_H);
    expect(engine.ticks()).toBeLessThanOrEqual(TICK_CAP);
  }
});
