import { expect, test } from "bun:test";
import { DAY3_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { GRID_W, idx } from "../src/core/grid.ts";
import { parseLevel } from "../src/core/level.ts";
import {
  AXIS_HORIZONTAL,
  AXIS_VERTICAL,
  MAX_PERIOD,
  patrolCellAt,
  patrolFor,
  patrolsFor,
} from "../src/core/patrol.ts";

const level = parseLevel(DAY3_LEVEL_TEXT);
const at = (cell: number) => ({ x: cell % GRID_W, y: (cell / GRID_W) | 0 });

test("a guard patrols the corridor it stands in, along its longer axis", () => {
  // (3,3) sits in a one-wide vertical connector running y=1..y=5.
  const patrol = patrolFor(level, idx(3, 3));
  expect(patrol.axis).toBe(AXIS_VERTICAL);
  expect(patrol.length).toBe(5);
  expect(patrol.period).toBe(8);
  expect(at(patrol.lo)).toEqual({ x: 3, y: 1 });
});

test("the walk ping-pongs: out to the far end, back, and repeats", () => {
  const patrol = patrolFor(level, idx(3, 3));
  const walk: number[] = [];
  for (let t = 0; t < patrol.period * 2; t++) walk.push(at(patrolCellAt(patrol, t)).y);

  // Home is y=3, and it heads for the high end first.
  expect(walk.slice(0, 8)).toEqual([3, 4, 5, 4, 3, 2, 1, 2]);
  // ...then does exactly the same thing again, forever.
  expect(walk.slice(8, 16)).toEqual(walk.slice(0, 8));
});

test("a patrol never leaves its corridor or steps into a wall", () => {
  for (const patrol of patrolsFor(level)) {
    for (let t = 0; t < 200; t++) {
      const cell = patrolCellAt(patrol, t);
      expect(level.walls[cell]).toBe(0);
    }
  }
});

test("consecutive turns are always one step apart, never a jump", () => {
  for (const patrol of patrolsFor(level)) {
    let previous = patrolCellAt(patrol, 0);
    for (let t = 1; t < 100; t++) {
      const cell = patrolCellAt(patrol, t);
      const a = at(previous);
      const b = at(cell);
      const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      expect(distance).toBeLessThanOrEqual(1);
      previous = cell;
    }
  }
});

test("a guard that starts at the end of its run walks back down it", () => {
  // (1,1) is the level's start corner: the run east along the top band.
  const patrol = patrolFor(level, idx(1, 1));
  expect(patrol.axis).toBe(AXIS_HORIZONTAL);
  expect(patrol.start).toBe(0);
  expect(at(patrolCellAt(patrol, 1))).toEqual({ x: 2, y: 1 });
});

test("every patrol on the shipped day 3 level is within the period cap", () => {
  const rows = patrolsFor(level).map((p) => {
    const home = at(p.home);
    return `  (${home.x},${home.y})  ${p.axis === AXIS_VERTICAL ? "vertical  " : "horizontal"}  run ${p.length}  period ${p.period}`;
  });
  console.log(`\n${rows.join("\n")}`);
  for (const patrol of patrolsFor(level)) {
    expect(patrol.period).toBeLessThanOrEqual(MAX_PERIOD);
  }
});

test("a guard with nowhere to go simply stands still", () => {
  // Seal a cell into a one-cell pocket and read its patrol.
  const rows = DAY3_LEVEL_TEXT.split("\n");
  const row = (rows[1 + 3] as string).split("");
  row[3] = "."; // take the guard glyph out; geometry is what matters here
  rows[1 + 3] = row.join("");
  const patched = parseLevel(rows.join("\n"));

  // (1,3) is walled on every side in this level's band layout.
  const patrol = patrolFor(patched, idx(1, 3));
  expect(patrol.length).toBe(1);
  expect(patrol.period).toBe(1);
  expect(patrolCellAt(patrol, 0)).toBe(patrolCellAt(patrol, 7));
});
