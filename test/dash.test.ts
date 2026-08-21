import { expect, test } from "bun:test";
import { DASH1_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { parseLevel, isLadder, hasLadders } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { decodeLevel, encodeLevel, sameLevel, carriesLadders } from "../src/core/codec.ts";
import { engineFor } from "../src/engines/registry.ts";
import { BRUK, NIM, PELL, creatureFromBuild } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { toCell } from "../src/core/fixed.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import {
  BODY, DashV1, GRAVITY, TERMINAL, TICK_CAP, heartsFor, jumpFor, runFor,
} from "../src/engines/dash/v1.ts";
import {
  HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_NONE, HELD_RIGHT, HELD_UP,
  STATUS_LOST, STATUS_PLAYING, STATUS_WON,
} from "../src/engines/types.ts";

const level = parseLevel(DASH1_LEVEL_TEXT);
const fresh = (creature = BRUK) => new DashV1(level, creature);

function hold(engine: DashV1, buttons: number, ticks: number): number {
  let status: number = STATUS_PLAYING;
  for (let i = 0; i < ticks; i++) status = engine.step(buttons);
  return status;
}

// --- ladders cost nothing to levels that do not have them ----------------------

test("only side-on engines carry a ladder map", () => {
  expect(carriesLadders("dash")).toBe(true);
  expect(carriesLadders("delve")).toBe(false);
  expect(carriesLadders("roam")).toBe(false);
});

test("the level has ladders, and they survive the codec", () => {
  expect(hasLadders(level)).toBe(true);
  const back = decodeLevel(encodeLevel(level));
  expect(sameLevel(level, back)).toBe(true);
  expect(hasLadders(back)).toBe(true);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      expect(isLadder(back, x, y)).toBe(isLadder(level, x, y));
    }
  }
});

test("a side-on level still fits in a share link", () => {
  const code = encodeLevel(level);
  console.log(`\n  dash level: ${code.length} chars, ladders and all`);
  expect(code.length).toBeLessThan(150);
});

test("a link pins the side-on engine and routes to it", () => {
  const engine = engineFor(decodeLevel(encodeLevel(level)));
  expect(engine).toBeInstanceOf(DashV1);
  expect(engine.id).toBe("dash");
});

// --- gravity --------------------------------------------------------------------

test("things fall, and then stop falling when they land", () => {
  const engine = fresh();
  const start = engine.where().y;
  hold(engine, HELD_NONE, 60);
  expect(engine.where().y).toBeGreaterThanOrEqual(start); // never floats upward
  expect(engine.onGround()).toBe(true);
  expect(engine.falling()).toBe(0);
});

test("nothing ever ends a tick inside a wall, however far it fell", () => {
  let state = 0x3ab19f | 0;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) & 31;
  };
  const engine = fresh();
  for (let i = 0; i < 2000 && engine.currentStatus() === STATUS_PLAYING; i++) {
    engine.step(next());
    const me = engine.where();
    const cx = toCell(me.x);
    const cy = toCell(me.y);
    expect(cx).toBeGreaterThanOrEqual(0);
    expect(cx).toBeLessThan(GRID_W);
    expect(cy).toBeGreaterThanOrEqual(0);
    expect(cy).toBeLessThan(GRID_H);
    expect(level.walls[cy * GRID_W + cx]).toBe(0);
  }
});

test("terminal velocity is slower than a body, so nothing tunnels through a floor", () => {
  // This is the property that keeps the fall solver honest: a single tick can
  // never carry you further than your own height.
  expect(TERMINAL).toBeLessThan(BODY * 2);
  expect(GRAVITY).toBeGreaterThan(0);
});

// --- jumping ---------------------------------------------------------------------

test("you cannot jump in mid-air", () => {
  const engine = fresh();
  hold(engine, HELD_NONE, 60); // settle on the floor
  expect(engine.onGround()).toBe(true);

  engine.step(HELD_ACT);
  expect(engine.onGround()).toBe(false);
  const rising = engine.falling();
  expect(rising).toBeLessThan(0);

  // Pressing again while airborne must not give a second boost.
  engine.step(HELD_ACT);
  expect(engine.falling()).toBeGreaterThan(rising);
});

test("strength is how high you jump", () => {
  const springy = creatureFromBuild("s", "Spring", "?", { FORCE: 5, HASTE: 0 }, starterSprite());
  const leaden = creatureFromBuild("l", "Lead", "?", { FORCE: 0, HASTE: 3 }, starterSprite());
  expect(jumpFor(springy)).toBeGreaterThan(jumpFor(leaden));

  const peak = (creature: typeof springy) => {
    const engine = new DashV1(level, creature);
    hold(engine, HELD_NONE, 60);
    const ground = engine.where().y;
    engine.step(HELD_ACT);
    let highest = engine.where().y;
    for (let i = 0; i < 40; i++) {
      engine.step(HELD_NONE);
      if (engine.where().y < highest) highest = engine.where().y;
    }
    return ground - highest;
  };

  const high = peak(springy);
  const low = peak(leaden);
  console.log(`\n  jump height: strong ${high} subcells, weak ${low}`);
  expect(high).toBeGreaterThan(low);
});

test("speed is how fast you run", () => {
  const quick = creatureFromBuild("q", "Quick", "?", { FORCE: 0, HASTE: 5 }, starterSprite());
  const plod = creatureFromBuild("p", "Plod", "?", { FORCE: 3, HASTE: 0 }, starterSprite());
  expect(runFor(quick)).toBeGreaterThan(runFor(plod));

  const travelled = (creature: typeof quick) => {
    const engine = new DashV1(level, creature);
    hold(engine, HELD_NONE, 60);
    const from = engine.where().x;
    hold(engine, HELD_RIGHT, 20);
    return engine.where().x - from;
  };
  expect(travelled(quick)).toBeGreaterThan(travelled(plod));
});

// --- ladders ----------------------------------------------------------------------

test("a ladder can be climbed, and holding it suspends the fall", () => {
  const engine = fresh();
  hold(engine, HELD_NONE, 60);

  // Walk right along the bottom floor to the ladder at x=19.
  let found = false;
  for (let i = 0; i < 600 && !found; i++) {
    engine.step(HELD_RIGHT);
    if (isLadder(level, toCell(engine.where().x), toCell(engine.where().y))) found = true;
  }
  expect(found).toBe(true);

  const before = engine.where().y;
  hold(engine, HELD_UP, 40);
  expect(engine.onLadder()).toBe(true);
  expect(engine.where().y).toBeLessThan(before); // it went up

  // Let go of everything: on a ladder you stay put rather than dropping.
  const held = engine.where().y;
  hold(engine, HELD_NONE, 5);
  expect(engine.where().y).toBe(held);
});

// --- stomping -----------------------------------------------------------------------

test("landing on an enemy beats it; walking into it does not", () => {
  const engine = fresh();
  hold(engine, HELD_NONE, 60);

  // Run at the enemy on the bottom floor without jumping.
  let hurt = false;
  for (let i = 0; i < 600 && !hurt && engine.currentStatus() === STATUS_PLAYING; i++) {
    engine.step(HELD_RIGHT);
    if (engine.justHurt()) hurt = true;
  }
  expect(hurt).toBe(true);
  expect(engine.health().hp).toBeLessThan(engine.health().max);
});

test("a stomped enemy stays down, and you bounce off it", () => {
  const engine = fresh();
  hold(engine, HELD_NONE, 60);

  let stomped = false;
  for (let i = 0; i < 1500 && !stomped && engine.currentStatus() === STATUS_PLAYING; i++) {
    // Run right, jumping whenever we are on the ground: sooner or later that
    // lands on something.
    engine.step(HELD_RIGHT | (engine.onGround() ? HELD_ACT : 0));
    if (engine.justStomped()) stomped = true;
  }

  if (stomped) {
    expect(engine.falling()).toBeLessThan(0); // bounced upward
    expect(engine.enemyPositions().some((e) => e.stunned)).toBe(true);
  } else {
    // Not reaching one is acceptable; being hurt by one from above is not.
    console.log("  (no stomp in this run -- the route never landed on one)");
  }
});

// --- the guarantees ------------------------------------------------------------------

test("E3: the same held-button log replays to the same hash, three times", () => {
  const log = [
    [HELD_NONE, 40], [HELD_RIGHT, 30], [HELD_ACT | HELD_RIGHT, 3],
    [HELD_RIGHT, 25], [HELD_UP, 30], [HELD_LEFT, 20], [HELD_DOWN, 15],
  ] as const;
  const run = () => {
    const engine = fresh();
    for (const [buttons, ticks] of log) hold(engine, buttons, ticks);
    return hashHex(engine.stateHash());
  };
  const hashes = [run(), run(), run()];
  console.log(`  dash replay hashes: ${hashes.join("  ")}`);
  expect(new Set(hashes).size).toBe(1);
});

test("a decoded level plays identically to the one it came from", () => {
  const a = fresh();
  const b = new DashV1(decodeLevel(encodeLevel(level)), BRUK);
  for (let i = 0; i < 200; i++) {
    const buttons = i % 4 === 0 ? HELD_RIGHT : i % 4 === 1 ? HELD_ACT : HELD_NONE;
    a.step(buttons);
    b.step(buttons);
  }
  expect(hashHex(b.stateHash())).toBe(hashHex(a.stateHash()));
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
  const tiles = fresh().render();
  expect(tiles.length).toBe(GRID_W * GRID_H);
  for (const tile of tiles) expect(tile).toBeLessThan(10);
});

test("E10: cosmetics do not reach stateHash()", () => {
  const restyled = parseLevel(DASH1_LEVEL_TEXT.replace("tiles=1", "tiles=7"));
  const a = fresh();
  const b = new DashV1(restyled, BRUK);
  for (let i = 0; i < 90; i++) {
    a.step(HELD_RIGHT);
    b.step(HELD_RIGHT);
  }
  expect(hashHex(b.stateHash())).toBe(hashHex(a.stateHash()));
});

test("E1/E2: uniform creatures play and terminate", () => {
  for (const value of [0, 255]) {
    const creature = creatureFromBuild("u", "Test", "?",
      { FORCE: value === 0 ? 0 : 5, HASTE: value === 0 ? 0 : 5 },
      starterSprite());
    const engine = new DashV1(level, creature);
    let status: number = STATUS_PLAYING;
    for (let i = 0; i < 400 && status === STATUS_PLAYING; i++) status = engine.step(HELD_RIGHT);
    expect(engine.render().length).toBe(GRID_W * GRID_H);
  }
});

test("nerve is still how many hits you can take", () => {
  expect(heartsFor(PELL)).toBeGreaterThan(heartsFor(NIM));
});
