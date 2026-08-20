import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { engineFor } from "../src/engines/registry.ts";
import { creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { DashV3, REACH as V3_REACH } from "../src/engines/dash/v3.ts";
import { DashV4, GRAB } from "../src/engines/dash/v4.ts";
import { GRAB as ROAM_GRAB } from "../src/engines/roam/v5.ts";
import { HELD_LEFT, HELD_RIGHT, STATUS_PLAYING } from "../src/engines/types.ts";
import { DASH3_LEVEL_TEXT, DASH4_LEVEL_TEXT } from "../src/core/fixtures.ts";

const ONE = 256;
const made = creatureFromBuild("p", "P", "@", { FORCE: 2, HASTE: 4 } as Build, starterSprite());

/**
 * A floor to walk along, and a gem `up` cells above it with nothing to stand on.
 *
 * From the side this is the shape that matters: a gem you can SEE and cannot
 * reach without working out how to get up there.
 */
function room(version: number, up: number): string {
  const rows = [`hoppa/1 dash seed=0 tiles=1 behaviour=${version}`, "########################"];
  const floor = 12;
  for (let y = 1; y <= 12; y++) {
    // up === 0 means the gem is on the floor with you, so it goes IN the floor
    // row -- the branches are checked in this order or it never gets placed.
    if (y === floor && up === 0) rows.push("#@........$...........>#");
    else if (y === floor) rows.push("#@....................>#");
    else if (y === floor - up) rows.push("#.........$............#");
    else rows.push("#......................#");
  }
  rows.push("########################");
  return rows.join("\n") + "\n";
}

/** Walk the floor from one end to the other. Did the gem come down to us? */
function walkUnder(version: number, up: number): boolean {
  const Engine = version === 3 ? DashV3 : DashV4;
  const engine = new Engine(parseLevel(room(version, up)), made);
  let status: number = STATUS_PLAYING;
  for (let t = 0; t < 400 && status === STATUS_PLAYING; t++) status = engine.step(HELD_RIGHT);
  return (engine as unknown as { collectedCount(): number }).collectedCount() > 0;
}

// --- the thing v4 exists to fix ---------------------------------------------

test("a gem above you is not yours until you get up there", () => {
  // From the side this is worse than from above: v3 let you collect treasure
  // off a platform you never climbed to.
  expect(walkUnder(4, 0)).toBe(true); // on the floor with you
  expect(walkUnder(4, 1)).toBe(false); // one cell up
  expect(walkUnder(4, 2)).toBe(false);
});

test("...and in v3 walking underneath collected it", () => {
  expect(walkUnder(3, 0)).toBe(true);
  expect(walkUnder(3, 1)).toBe(true); // the bug
  expect(walkUnder(3, 2)).toBe(false);
});

test("the side and the top agree about what a hand can reach", () => {
  // A creature carries between the two games, and "how close do I have to be"
  // is not something that should change when the camera moves.
  expect(GRAB).toBe(ROAM_GRAB);
  expect(GRAB).toBe(160);
  expect(V3_REACH).toBe(416);
  // Anywhere inside a gem's own cell still collects it: the furthest corner is
  // half a cell from the centre.
  expect(GRAB).toBeGreaterThan(ONE >> 1);
});

test("a gem you walk over at speed is always yours", () => {
  // The fastest build covers real ground per tick, and a narrow window can be
  // stepped clean over between ticks.
  for (const haste of [0, 1, 2, 3, 4, 5]) {
    const build = { FORCE: Math.min(5, 5 - haste), HASTE: haste } as Build;
    const engine = new DashV4(
      parseLevel(room(4, 0)),
      creatureFromBuild("p", "P", "@", build, starterSprite()),
    );
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 400 && status === STATUS_PLAYING; t++) status = engine.step(HELD_RIGHT);
    expect({ haste, got: engine.collectedCount() }).toEqual({ haste, got: 1 });
  }
});

// --- dash/3 is frozen -------------------------------------------------------

test("dash/3 plays exactly as it did: v4 is a new version, not an edit", () => {
  const level = parseLevel(DASH3_LEVEL_TEXT);
  const hashes: string[] = [];
  for (let run = 0; run < 3; run++) {
    const engine = new DashV3(level, made);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 600 && status === STATUS_PLAYING; t++) {
      status = engine.step(t % 120 < 60 ? HELD_RIGHT : HELD_LEFT);
    }
    hashes.push(hashHex(engine.stateHash()));
  }
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[1]).toBe(hashes[2]);
  expect(V3_REACH).toBe(416);
});

test("all four dash builds route", () => {
  for (const version of [1, 2, 3, 4]) {
    const text = DASH4_LEVEL_TEXT.replace("behaviour=4", `behaviour=${version}`);
    expect(engineFor(parseLevel(text)).behaviourVersion).toBe(version);
  }
});

test("v4 replays identically three times over", () => {
  const level = parseLevel(DASH4_LEVEL_TEXT);
  const hashes: string[] = [];
  for (let run = 0; run < 3; run++) {
    const engine = new DashV4(level, made);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 700 && status === STATUS_PLAYING; t++) {
      status = engine.step(t % 140 < 70 ? HELD_RIGHT : HELD_LEFT);
    }
    hashes.push(hashHex(engine.stateHash()));
  }
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[1]).toBe(hashes[2]);
});
