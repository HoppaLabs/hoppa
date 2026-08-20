import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { engineFor } from "../src/engines/registry.ts";
import { creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { RoamV4, REACH as V4_REACH } from "../src/engines/roam/v4.ts";
import { GRAB, RoamV5, ENEMY_SPEED, heartsFor } from "../src/engines/roam/v5.ts";
import { ENEMY_SPEED as V4_ENEMY_SPEED, heartsFor as v4Hearts } from "../src/engines/roam/v4.ts";
import { HELD_ACT, HELD_LEFT, HELD_RIGHT, HELD_UP, STATUS_PLAYING } from "../src/engines/types.ts";
import { ROAM4_LEVEL_TEXT, ROAM5_LEVEL_TEXT } from "../src/core/fixtures.ts";

const ONE = 256;
const made = creatureFromBuild("p", "P", "@", { FORCE: 2, HASTE: 4 } as Build, starterSprite());

/** A corridor along row 6 with one gem placed `gemRow` rows up. */
function room(version: number, gemRow: number): string {
  const rows = [`hoppa/1 roam seed=0 tiles=1 behaviour=${version}`, "########################"];
  for (let y = 1; y <= 12; y++) {
    if (y === 6 && gemRow === 6) rows.push("#.@.......$...........>#");
    else if (y === 6) rows.push("#.@...................>#");
    else if (y === gemRow) rows.push("#.........$............#");
    else rows.push("#......................#");
  }
  rows.push("########################");
  return rows.join("\n") + "\n";
}

/** Walk the length of the corridor; did the gem come off the floor? */
function walkPast(version: number, gemRow: number): boolean {
  const Engine = version === 4 ? RoamV4 : RoamV5;
  const engine = new Engine(parseLevel(room(version, gemRow)), made);
  let status: number = STATUS_PLAYING;
  for (let t = 0; t < 300 && status === STATUS_PLAYING; t++) status = engine.step(HELD_RIGHT);
  return (engine as unknown as { collectedCount(): number }).collectedCount() > 0;
}

// --- the thing v5 exists to fix ---------------------------------------------

test("treasure is picked up by going to it, not from a corridor away", () => {
  // Reported from real play: "the proximity to capture the treasure is too
  // far, the player needs to be closer".
  expect(walkPast(5, 6)).toBe(true); // walked over it
  expect(walkPast(5, 5)).toBe(false); // one row above: left alone
  expect(walkPast(5, 4)).toBe(false);
});

test("...and in v4 walking one row away collected it", () => {
  expect(walkPast(4, 6)).toBe(true);
  expect(walkPast(4, 5)).toBe(true); // the bug
  expect(walkPast(4, 4)).toBe(false);
});

test("the reach that does it is a hand's, not a sword's", () => {
  // v4 borrowed the weapon's reach for the pickup test, which is why a gem
  // came off the floor from over a cell and a half away -- and through a wall,
  // since nothing about a pickup checks for one.
  expect(V4_REACH).toBe(416);
  expect(GRAB).toBe(160);
  expect(GRAB / ONE).toBeLessThan(0.7);
  // Still generous enough that anywhere inside a gem's own cell collects it:
  // the furthest corner of a cell is half a cell from the centre.
  expect(GRAB).toBeGreaterThan(ONE >> 1);
});

test("a gem you are standing on is always yours", () => {
  // The pickup must not be so tight that walking over a gem at speed can step
  // across it between ticks. The fastest build moves 50 subcells a tick.
  for (const haste of [0, 1, 2, 3, 4, 5]) {
    const build = { FORCE: Math.min(5, 5 - haste), HASTE: haste } as Build;
    const engine = new RoamV5(
      parseLevel(room(5, 6)),
      creatureFromBuild("p", "P", "@", build, starterSprite()),
    );
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 300 && status === STATUS_PLAYING; t++) status = engine.step(HELD_RIGHT);
    expect({ haste, got: engine.collectedCount() }).toEqual({ haste, got: 1 });
  }
});

// --- everything else is v4 exactly ------------------------------------------

test("v5 changes the pickup and nothing else", () => {
  expect(ENEMY_SPEED).toBe(V4_ENEMY_SPEED);
  for (const force of [0, 1, 2, 3, 4, 5]) {
    const build = { FORCE: force, HASTE: Math.min(5, 6 - force) } as Build;
    const creature = creatureFromBuild("p", "P", "@", build, starterSprite());
    expect(heartsFor(creature)).toBe(v4Hearts(creature));
  }
});

test("roam/4 plays exactly as it did: v5 is a new version, not an edit", () => {
  const level = parseLevel(ROAM4_LEVEL_TEXT);
  const creature = creatureFromBuild("p", "P", "@", { FORCE: 3, HASTE: 3 } as Build, starterSprite());
  const hashes: string[] = [];
  for (let run = 0; run < 3; run++) {
    const engine = new RoamV4(level, creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 600 && status === STATUS_PLAYING; t++) {
      status = engine.step((t % 5 === 0 ? HELD_ACT : 0) | (t % 160 < 80 ? HELD_RIGHT : HELD_UP));
    }
    hashes.push(hashHex(engine.stateHash()));
  }
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[1]).toBe(hashes[2]);
  expect(V4_REACH).toBe(416);
});

test("v4 and v5 do not play the same, which is the whole point", () => {
  const creature = creatureFromBuild("p", "P", "@", { FORCE: 3, HASTE: 3 } as Build, starterSprite());
  const play = (Engine: typeof RoamV4 | typeof RoamV5, text: string) => {
    const engine = new Engine(parseLevel(text), creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 600 && status === STATUS_PLAYING; t++) {
      status = engine.step(t % 160 < 80 ? HELD_RIGHT : HELD_UP);
    }
    return hashHex(engine.stateHash());
  };
  expect(play(RoamV4, ROAM4_LEVEL_TEXT)).not.toBe(play(RoamV5, ROAM5_LEVEL_TEXT));
});

test("all five roam builds route", () => {
  for (const version of [1, 2, 3, 4, 5]) {
    const text = ROAM5_LEVEL_TEXT.replace("behaviour=5", `behaviour=${version}`);
    expect(engineFor(parseLevel(text)).behaviourVersion).toBe(version);
  }
});

test("v5 replays identically three times over", () => {
  const level = parseLevel(ROAM5_LEVEL_TEXT);
  const creature = creatureFromBuild("p", "P", "@", { FORCE: 2, HASTE: 4 } as Build, starterSprite());
  const hashes: string[] = [];
  for (let run = 0; run < 3; run++) {
    const engine = new RoamV5(level, creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 800 && status === STATUS_PLAYING; t++) {
      status = engine.step((t % 7 === 0 ? HELD_ACT : 0) | (t % 150 < 75 ? HELD_RIGHT : HELD_LEFT));
    }
    hashes.push(hashHex(engine.stateHash()));
  }
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[1]).toBe(hashes[2]);
});
