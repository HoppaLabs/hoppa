import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { engineFor } from "../src/engines/registry.ts";
import { creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { DashV4 } from "../src/engines/dash/v4.ts";
import { DashV5, BODY } from "../src/engines/dash/v5.ts";
import { HELD_LEFT, HELD_RIGHT, HELD_UP, STATUS_PLAYING } from "../src/engines/types.ts";
import { knownBuilds } from "../src/engines/registry.ts";

const ONE = 256;
const made = creatureFromBuild("p", "P", "@", { FORCE: 2, HASTE: 4 } as Build, starterSprite());

/**
 * A deck with one hole in it and a ladder coming up through the hole.
 *
 * This is the shape the whole change is about: the hole is one cell, a body is
 * three quarters of a cell, and the ladder stands one rung proud of the deck.
 */
function tower(version: number): string {
  const rows = [`hoppa/1 dash seed=0 tiles=1 behaviour=${version}`];
  for (let y = 0; y < 14; y++) {
    if (y === 7) rows.push("....H..............$...."); // the rung above the deck
    else if (y === 8) rows.push("####H###################"); // the deck, hole at 4
    else if (y === 13) rows.push("########################");
    else if (y === 12) rows.push("..@.H..................>");
    else if (y >= 9 && y <= 11) rows.push("....H...................");
    else rows.push("........................");
  }
  return rows.join("\n") + "\n";
}

/**
 * Walk right until you are at least `at`, then hold up. Returns where you got
 * to -- the start is reported too, because walking overshoots by up to a whole
 * step and the offset asked for is not the offset achieved.
 */
function climbFrom(version: number, at: number): { from: number; row: number; x: number } {
  const engine = engineFor(parseLevel(tower(version)), made) as unknown as {
    step: (held: number) => number;
    x: number;
    y: number;
  };
  let guard = 0;
  while (engine.x < at && guard++ < 400) engine.step(HELD_RIGHT);
  const from = engine.x;
  for (let i = 0; i < 90; i++) engine.step(HELD_UP);
  return { from, row: (engine.y / ONE) | 0, x: engine.x };
}

/** Every stopping place whose middle is over the ladder's cell. */
const LADDER_CELL = 4;
const CENTRE = LADDER_CELL * ONE + ONE / 2;
function stops(version: number): { from: number; row: number; x: number }[] {
  return [-120, -80, -40, 0, 40, 80, 120]
    .map((off) => climbFrom(version, CENTRE + off))
    .filter((got) => ((got.from / ONE) | 0) === LADDER_CELL);
}

test("in v4 a ladder only takes you if you stopped almost exactly on it", () => {
  // A body is 2*BODY subcells across and a cell is ONE, so the gap in the deck
  // admits you only within (ONE - 2*BODY)/2 of the centre: a window 64 wide
  // out of 256. Walking covers 40 or more in one tick, so you step over it as
  // often as into it.
  expect(ONE - 2 * BODY).toBe(64);
  const got = stops(4);
  expect(got.length).toBeGreaterThan(3);
  const climbed = got.filter((g) => g.row <= 7);
  // Standing anywhere on the ladder's own cell, most places will not climb.
  expect(climbed.length).toBeLessThan(got.length);
  for (const one of climbed) {
    expect({ from: one.from, within: Math.abs(one.from - CENTRE) <= (ONE - 2 * BODY) / 2 }).toEqual({
      from: one.from,
      within: true,
    });
  }
});

test("in v5 it takes you from anywhere on its cell", () => {
  // Reported as "aligning on the stairs is difficult, often overshooting or
  // undershooting". The window is now the whole cell rather than a quarter of
  // it: if your middle is over the ladder, up climbs it.
  const got = stops(5);
  expect(got.length).toBeGreaterThan(3);
  for (const one of got) {
    expect({ from: one.from, climbed: one.row <= 7 }).toEqual({ from: one.from, climbed: true });
  }
});

test("...and it puts you on the middle of the rung, not merely nearby", () => {
  expect(climbFrom(5, CENTRE - 120).x).toBe(CENTRE);
});

test("a ladder you can get onto is a ladder you can get off", () => {
  // Sideways movement happens before climbing within a tick, so a snap that
  // ignored the steering would drag you back every time you tried to leave:
  // you could climb a ladder and then never get off it. Pressing a direction
  // means step off, and it wins.
  const engine = engineFor(parseLevel(tower(5)), made) as unknown as {
    step: (held: number) => number;
    x: number;
    y: number;
  };
  let guard = 0;
  while (engine.x < 4 * ONE + ONE / 2 && guard++ < 400) engine.step(HELD_RIGHT);
  for (let i = 0; i < 90; i++) engine.step(HELD_UP);
  const onTheLadder = engine.x;
  for (let i = 0; i < 30; i++) engine.step(HELD_RIGHT | HELD_UP);
  expect({ left: engine.x > onTheLadder }).toEqual({ left: true });
});

test("dash/4 plays exactly as it did: v5 is a new version, not an edit", () => {
  // Hard rule 3. Every link that pinned dash/4 replays as it always did, and
  // the only way to be sure is to run one and compare the hash.
  const play = (engine: { step: (held: number) => number; stateHash: () => number }): string => {
    // Walk to the ladder and climb: the one journey the two versions disagree
    // about, so the hashes have to differ.
    for (let i = 0; i < 200; i++) engine.step(i < 10 ? HELD_RIGHT : i < 150 ? HELD_UP : HELD_LEFT);
    return hashHex(engine.stateHash());
  };
  const four = parseLevel(tower(4));
  const runs = [0, 1, 2].map(() => play(new DashV4(four, made)));
  expect(new Set(runs).size).toBe(1);
  // ...and v5 on the same inputs is a different run, or the version is pointless.
  expect(play(new DashV5(parseLevel(tower(5)), made))).not.toBe(runs[0]);
});

test("v5 replays identically three times over", () => {
  const level = parseLevel(tower(5));
  const hashes = [0, 1, 2].map(() => {
    const engine = new DashV5(level, made);
    for (let i = 0; i < 300; i++) engine.step(i < 30 ? HELD_RIGHT : i < 200 ? HELD_UP : HELD_RIGHT);
    return hashHex(engine.stateHash());
  });
  expect(new Set(hashes).size).toBe(1);
});

test("every dash build routes, because retiring one breaks every link", () => {
  expect(knownBuilds().filter((b) => b.startsWith("dash/"))).toEqual([
    "dash/1", "dash/2", "dash/3", "dash/4", "dash/5", "dash/6", "dash/7",
  ]);
  const engine = engineFor(parseLevel(tower(5)), made);
  expect(engine.behaviourVersion).toBe(5);
  expect(engine.currentStatus()).toBe(STATUS_PLAYING);
});
