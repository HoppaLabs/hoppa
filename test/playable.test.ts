import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { GRID_H, GRID_W, idx } from "../src/core/grid.ts";
import { DashV1 } from "../src/engines/dash/v1.ts";
import { creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { toCell } from "../src/core/fixed.ts";
import { HELD_ACT, HELD_RIGHT, STATUS_PLAYING } from "../src/engines/types.ts";
import {
  bestStepUp, landingFrom, reachableWithGravity, stepTableFor,
} from "../src/core/playable.ts";
import { adviceFor } from "../src/core/advice.ts";
import { reachableFrom } from "../src/core/reach.ts";
import { DASH1_LEVEL_TEXT } from "../src/core/fixtures.ts";

// --- the table is measured, not guessed -------------------------------------------

/** Lower ground walkable at row 11; from x >= 12 the ground is `h` cells higher. */
function stepLevel(h: number): string {
  const rows: string[] = [];
  for (let y = 0; y < GRID_H; y++) {
    let row = "";
    for (let x = 0; x < GRID_W; x++) {
      const bottom = y >= 12;
      const raised = x >= 12 && y >= 12 - h;
      row += bottom || raised || x === 0 || x === GRID_W - 1 ? "#" : ".";
    }
    rows.push(row);
  }
  rows[11] = "#@" + (rows[11] as string).slice(2);
  return `hoppa/1 dash seed=0 tiles=1 behaviour=1\n${rows.join("\n")}\n`;
}

/** Drive the real engine: can this creature actually get up a step of `h`? */
function engineCanMount(pips: number, h: number): boolean {
  const level = parseLevel(stepLevel(h));
  const build = { FORCE: pips, HASTE: 5 - pips } as Build;
  const creature = creatureFromBuild("p", "P", "@", build, starterSprite());
  // Every jump timing, because a run-up matters and the right moment is not
  // something a table can assume.
  for (let k = 0; k < 140; k++) {
    const engine = new DashV1(level, creature);
    while (!engine.onGround()) engine.step(0);
    for (let t = 0; t < 420; t++) {
      const jump = t >= k && t < k + 3 ? HELD_ACT : 0;
      if (engine.step(HELD_RIGHT | jump) !== STATUS_PLAYING) break;
      const where = engine.where();
      if (toCell(where.x) >= 13 && toCell(where.y) <= 11 - h && engine.onGround()) return true;
    }
  }
  return false;
}

test("dash/1's step table matches what dash/1 actually does, at every strength", () => {
  const measured: number[] = [];
  for (let pips = 0; pips <= 5; pips++) {
    let best = 0;
    for (let h = 1; h <= 3; h++) if (engineCanMount(pips, h)) best = h;
    measured.push(best);
  }
  console.log(`\n  step-up measured from dash/1: ${JSON.stringify(measured)}`);
  expect(measured).toEqual([...stepTableFor(1)]);
  expect(Math.max(...measured)).toBe(bestStepUp(1));
});

test("in dash/1 a creature with no strength cannot climb a step at all", () => {
  // The trap dash/2 exists to fix: spend everything on speed under these rules
  // and the side-on game is ladders and flat ground only. Pinned here because
  // dash/1 is shipped and must keep behaving exactly this way (adr 0018).
  expect(stepTableFor(1)[0]).toBe(0);
  expect(engineCanMount(0, 1)).toBe(false);
});

// --- the fill respects gravity ------------------------------------------------------

const LEDGE = parseLevel([
  "hoppa/1 dash seed=0 tiles=1 behaviour=1",
  "########################",
  "#......................#",
  "#......................#",
  "#............########..#",  // a ledge 3 rows above the floor
  "#......................#",
  "#......................#",
  "#@.....................#",
  "########################",
  "########################",
  "########################",
  "########################",
  "########################",
  "########################",
  "########################",
].join("\n") + "\n");

test("a ledge out of jumping range is not reachable, however open the air is", () => {
  const start = landingFrom(LEDGE, LEDGE.startX, LEDGE.startY);
  const seen = reachableWithGravity(LEDGE, start.x, start.y, bestStepUp(1));
  // Standing ON the ledge means the row directly above it.
  expect(seen[idx(15, 2)]).toBe(0);
  // ...while the floor you started on is of course fine.
  expect(seen[idx(20, 6)]).toBe(1);
});

test("the same ledge IS reachable when you can jump that high", () => {
  const start = landingFrom(LEDGE, LEDGE.startX, LEDGE.startY);
  const seen = reachableWithGravity(LEDGE, start.x, start.y, 4);
  expect(seen[idx(15, 2)]).toBe(1);
});

test("a plain flood fill would have called it reachable, which is the bug", () => {
  // The old check only asked "is there open space between here and there".
  const flat = reachableFrom(LEDGE, LEDGE.startX, LEDGE.startY);
  expect(flat[idx(15, 2)]).toBe(1); // says yes
  const start = landingFrom(LEDGE, LEDGE.startX, LEDGE.startY);
  expect(reachableWithGravity(LEDGE, start.x, start.y, bestStepUp(1))[idx(15, 2)]).toBe(0); // says no
});

test("ladders get you up regardless of how weak your jump is", () => {
  const withLadder = parseLevel([
    "hoppa/1 dash seed=0 tiles=1 behaviour=1",
    "########################",
    "#......................#",
    "#...........H..........#",
    "#...........H########..#",
    "#...........H..........#",
    "#...........H..........#",
    "#@..........H..........#",
    "########################",
    "########################",
    "########################",
    "########################",
    "########################",
    "########################",
    "########################",
  ].join("\n") + "\n");
  const start = landingFrom(withLadder, withLadder.startX, withLadder.startY);
  // stepUp 0: the weakest creature there is, and the ladder still works.
  const seen = reachableWithGravity(withLadder, start.x, start.y, 0);
  expect(seen[idx(15, 2)]).toBe(1);
});

test("you cannot jump through a floor", () => {
  const ceiling = parseLevel([
    "hoppa/1 dash seed=0 tiles=1 behaviour=1",
    "########################",
    "#......................#",
    "#......................#",
    "########################",
    "#......................#",
    "#@.....................#",
    "########################",
    "########################",
    "########################",
    "########################",
    "########################",
    "########################",
    "########################",
    "########################",
  ].join("\n") + "\n");
  const start = landingFrom(ceiling, ceiling.startX, ceiling.startY);
  const seen = reachableWithGravity(ceiling, start.x, start.y, 5);
  expect(seen[idx(5, 2)]).toBe(0);
});

// --- the shipped level still passes -------------------------------------------------

test("the shipped side-on level is playable, and the check says so", () => {
  const advice = adviceFor(DASH1_LEVEL_TEXT);
  expect(advice.playable).toBe(true);
  const fatal = advice.notes.filter((n) => n.fatal);
  expect(fatal).toEqual([]);
});


// --- what the editor tells a child ------------------------------------------------

/** A side-on level with the door on a ledge nothing can jump to. */
const DOOR_TOO_HIGH = [
  "hoppa/1 dash seed=0 tiles=1 behaviour=1",
  "#......................#",
  "#......................#",
  "#...................>..#",
  "#..................#####",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#@.....................#",
  "########################",
  "########################",
].join("\n") + "\n";

test("a door nothing can jump to is fatal, in words about jumping", () => {
  const advice = adviceFor(DOOR_TOO_HIGH);
  expect(advice.playable).toBe(false);
  const text = advice.notes.map((n) => n.text).join(" ");
  expect(text).toContain("jump");
  expect(text).toContain("door");
  expect(text).not.toMatch(/L[0-9]|reachab|flood|BFS/);
});

test("the same level is fine once there is a ladder to it", () => {
  const fixed = DOOR_TOO_HIGH.split("\n").map((row, i) =>
    i >= 4 && i <= 12 ? `${row.slice(0, 19)}H${row.slice(20)}` : row,
  ).join("\n");
  const advice = adviceFor(fixed);
  expect(advice.notes.filter((n) => n.fatal)).toEqual([]);
  expect(advice.playable).toBe(true);
});

test("a ledge only a strong character reaches is a warning, not a refusal", () => {
  // Two cells up: BEST_STEP_UP clears it, TYPICAL_STEP_UP does not.
  const twoUp = [
    "hoppa/1 dash seed=0 tiles=1 behaviour=1",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#...................$..#",
    "#..................#####",
    "#@....................>#",
    "########################",
    "########################",
  ].join("\n") + "\n";
  const advice = adviceFor(twoUp);
  expect(advice.playable).toBe(true);
  expect(advice.notes.some((n) => !n.fatal && n.text.includes("strong"))).toBe(true);
});

test("levels seen from above are not judged on jumping", () => {
  // The same shape as DOOR_TOO_HIGH, but top-down: there is no gravity there,
  // so a ledge is just floor and nothing about it is a problem.
  const above = DOOR_TOO_HIGH.replace("dash seed=0 tiles=1 behaviour=1", "roam seed=0 tiles=1 behaviour=3");
  const advice = adviceFor(above);
  expect(advice.notes.some((n) => n.text.includes("jump"))).toBe(false);
});
