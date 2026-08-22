// raze/1 -- buildings that come down.
//
// The feature's whole risk is in one place: a smashed building is state, and
// state that is not hashed is state a replay can disagree about. A shared
// level is only worth anything because the proof replays cold, so most of this
// file is about that rather than about the smashing.

import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { BRUK, NIM, PELL, VANCE, creatureFromCaps, buildToCaps } from "../src/core/creature.ts";
import { EMBER_TICKS, RAZE_V1_BEHAVIOUR, SMASH_PIP, smashesFor } from "../src/engines/raze/v1.ts";
import { GRID_W, idx } from "../src/core/grid.ts";
import { hashHex } from "../src/core/hash.ts";
import { HELD_ACT, HELD_RIGHT, STATUS_PLAYING } from "../src/engines/types.ts";
import { TILE_FIRE, TILE_FLOOR, TILE_WALL } from "../src/core/tiles.ts";
import { verifyLevelText } from "../src/core/verify.ts";

/**
 * A room with a wall one cell to the right of the start, and a gem behind it.
 *
 * The gem is reachable the long way round as well, so this is a level that
 * verifies with or without the shortcut -- which is the property that lets a
 * razed wall never make a level MORE broken than it was.
 */
const ROOM = [
  `hoppa/1 raze seed=aaaa tiles=6 behaviour=${RAZE_V1_BEHAVIOUR}`,
  "########################",
  "#.@#$..................#",
  "#..#...................#",
  "#..#...................#",
  "#..#...................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#.....................>#",
  "########################",
  "",
].join("\n");

const play = (creature = VANCE) =>
  engineFor(parseLevel(ROOM), creature) as unknown as {
    step(held: number): number;
    render(): Uint8Array;
    stateHash(): number;
    canSmash?(): boolean;
    justRazed?(): boolean;
    razedCount?(): number;
    health(): { hp: number; max: number };
  };

const WALL_AT = idx(3, 1);

test("a strong creature brings the building in front of it down", () => {
  const game = play();
  expect(game.render()[WALL_AT]).toBe(TILE_WALL);
  // Face right by walking into it, then swing.
  game.step(HELD_RIGHT);
  game.step(HELD_RIGHT | HELD_ACT);
  expect(game.justRazed!()).toBe(true);
  expect(game.razedCount!()).toBe(1);
  // ...and what is left is burning, not gone.
  expect(game.render()[WALL_AT]).toBe(TILE_FIRE);
});

test("...and it burns for three seconds, then it is rubble", () => {
  const game = play();
  game.step(HELD_RIGHT);
  game.step(HELD_RIGHT | HELD_ACT);
  for (let i = 0; i < EMBER_TICKS - 2; i++) game.step(0);
  expect(game.render()[WALL_AT]).toBe(TILE_FIRE);
  game.step(0);
  game.step(0);
  expect(game.render()[WALL_AT]).toBe(TILE_FLOOR);
  // And it stays rubble: nothing ever puts a building back up, which is what
  // makes this safe -- the world only ever changes toward more room.
  for (let i = 0; i < 60; i++) game.step(0);
  expect(game.render()[WALL_AT]).toBe(TILE_FLOOR);
});

test("standing in a building you just knocked down costs a heart", () => {
  const game = play();
  game.step(HELD_RIGHT);
  game.step(HELD_RIGHT | HELD_ACT);
  const before = game.health().hp;
  // Walk into the burning cell. It is one cell away, so a few ticks of held
  // right is plenty at any speed.
  for (let i = 0; i < 30; i++) game.step(HELD_RIGHT);
  expect(game.health().hp).toBeLessThan(before);
});

test("only strength unlocks it, and it is the top of the range", () => {
  expect(smashesFor(VANCE)).toBe(true);
  expect(smashesFor(BRUK)).toBe(true);
  expect(smashesFor(PELL)).toBe(false);
  expect(smashesFor(NIM)).toBe(false);
  for (let pips = 0; pips <= 5; pips++) {
    const who = creatureFromCaps("t", "T", buildToCaps({ FORCE: pips, HASTE: 0 }));
    expect({ pips, smashes: smashesFor(who) }).toEqual({ pips, smashes: pips >= SMASH_PIP });
  }
});

test("a creature that cannot smash swings at a building and nothing happens", () => {
  const game = play(NIM);
  game.step(HELD_RIGHT);
  game.step(HELD_RIGHT | HELD_ACT);
  expect(game.justRazed!()).toBe(false);
  expect(game.render()[WALL_AT]).toBe(TILE_WALL);
});

test("THE ONE THAT MATTERS: a run with a smash in it replays to the same hash", () => {
  // Which buildings are down, and how long each has left to burn, is
  // authoritative state. If it is not hashed then two runs of the same log can
  // disagree about the room, and a shared level stops being a proof of
  // anything. Same reasoning as the doused fires it sits beside.
  const log: number[] = [HELD_RIGHT, HELD_RIGHT | HELD_ACT];
  for (let i = 0; i < 200; i++) log.push(i % 7 === 0 ? HELD_ACT : HELD_RIGHT);

  const run = (): { hash: string; razed: number } => {
    const game = play();
    for (const held of log) game.step(held);
    return { hash: hashHex(game.stateHash()), razed: game.razedCount!() };
  };
  const first = run();
  expect(first.razed).toBeGreaterThan(0);
  expect(run()).toEqual(first);
});

test("...and the hash MOVES when a building comes down", () => {
  // The other half, and the one that took three goes to write honestly.
  //
  // First version: swing in one run and not the other, two ticks in, compare.
  // Passed -- because `swing` is hashed, so the two differed whether or not
  // the razing did. Second version: face different ways. Passed -- because
  // FACING and POSITION are hashed too. Both stayed green with the razed state
  // deleted from the hash entirely, which is what check:mutants is for.
  //
  // What is needed is two runs that end IDENTICAL in every hashed field except
  // the one under test. So both press right into the same wall -- which blocks
  // both, so neither ever moves and both end facing the same way -- and then
  // one swings and the other does not. After sixty idle ticks the swing has
  // long run out of both. Nothing is left to differ except which buildings are
  // down, and only one of them knocked anything over.
  const swung = play();
  const still = play();
  swung.step(HELD_RIGHT);
  still.step(HELD_RIGHT);
  swung.step(HELD_ACT);
  still.step(0);
  for (let i = 0; i < 60; i++) { swung.step(0); still.step(0); }

  expect(swung.razedCount!()).toBe(1);
  expect(still.razedCount!()).toBe(0);
  expect(hashHex(swung.stateHash())).not.toBe(hashHex(still.stateHash()));
});

test("...and two runs that razed nothing agree, so it is the razing that moved it", () => {
  // The control. Without it "the hashes differ" only ever meant "the hashes
  // differ", and the pair above would pass for any reason at all.
  const a = play();
  const b = play();
  a.step(HELD_RIGHT);
  b.step(HELD_RIGHT);
  a.step(0);
  b.step(0);
  for (let i = 0; i < 60; i++) { a.step(0); b.step(0); }
  expect(a.razedCount!()).toBe(0);
  expect(hashHex(a.stateHash())).toBe(hashHex(b.stateHash()));
});

test("the edge of the world is not a building", () => {
  // Razing the outer ring would leave a hole in the frame that still cannot be
  // walked through -- fits() stops you leaving the grid whatever the walls say
  // -- so it would read as a bug and behave as nothing.
  const corner = [
    `hoppa/1 raze seed=bbbb tiles=6 behaviour=${RAZE_V1_BEHAVIOUR}`,
    "########################",
    "#@....................$#",
    ...Array.from({ length: 10 }, () => "#" + ".".repeat(22) + "#"),
    "#.....................>#",
    "########################",
    "",
  ].join("\n");
  const game = engineFor(parseLevel(corner), VANCE) as unknown as {
    step(h: number): number; render(): Uint8Array; razedCount(): number;
  };
  // Face left, into the frame, and swing at it for a while.
  for (let i = 0; i < 20; i++) game.step(HELD_ACT | (i % 2 === 0 ? 8 : 0));
  expect(game.razedCount()).toBe(0);
  expect(game.render()[idx(0, 1)]).toBe(TILE_WALL);
});

test("smashing only ever adds somewhere to walk, so the checks still hold", () => {
  // L3 and L4 flood-fill the open cells. Nothing this engine does ever closes
  // one, so a level that verified before a swing verifies after it -- which is
  // why the verifier needed no changes at all.
  const checks = verifyLevelText(ROOM).checks.filter((c) => !c.ok);
  expect(checks.map((c) => `${c.id}: ${c.detail}`)).toEqual([]);
});

test("a razed gap is a gap for the monsters too", () => {
  // One wall test, asked through one function. In roam/8 the same question was
  // inline in four places, and four is how many chances there are to forget.
  const source = require("fs").readFileSync("src/engines/raze/v1.ts", "utf8") as string;
  expect(source.match(/isWall\(this\.level/g) ?? []).toHaveLength(1);
  expect(source).toContain("private wallAt(");
});

test("the room a level was DRAWN with is what the patrols are worked out from", () => {
  // Deliberate: a patrol is a property of the room a child drew, and a guard
  // whose beat changes when you knock a wall out is a guard nobody can plan
  // around. Written down here so that changing it is a decision.
  const source = require("fs").readFileSync("src/engines/raze/v1.ts", "utf8") as string;
  expect(source).toContain("this.patrols = patrolsFor(level);");
  // ...and assigned exactly once, from the level, at construction. Anything
  // that recomputed them mid-run would show up as a second assignment.
  expect(source.match(/this\.patrols = /g) ?? []).toHaveLength(1);
  void STATUS_PLAYING;
  void GRID_W;
});
