import { expect, test } from "bun:test";
import { DAY1_LEVEL_TEXT, DAY2_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { GRID_W } from "../src/core/grid.ts";
import { verifyLevelText } from "../src/core/verify.ts";

/** Rewrite one cell of a level's ASCII art. rows[0] is the header. */
function withCell(text: string, x: number, y: number, glyph: string): string {
  const rows = text.split("\n");
  const row = (rows[1 + y] as string).split("");
  row[x] = glyph;
  rows[1 + y] = row.join("");
  expect(rows[1 + y]?.length).toBe(GRID_W);
  return rows.join("\n");
}

function check(result: ReturnType<typeof verifyLevelText>, id: string) {
  const found = result.checks.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no check ${id}`);
  return found;
}

test("the day 2 level passes L1-L5", () => {
  const result = verifyLevelText(DAY2_LEVEL_TEXT);
  const table = result.checks
    .map((c) => `  ${c.id}  ${c.ok === null ? "skip" : c.ok ? "ok  " : "FAIL"}  ${c.title}`)
    .join("\n");
  console.log(`\n${table}`);
  expect(result.ok).toBe(true);
});

test("L2: the day 1 level has no exit, so it parses but does not verify", () => {
  // This is the split that matters: day 1's level is still a valid *shape*, so
  // the day 1 golden vector keeps replaying. It is just not a playable day 2
  // level, and L2 is where that gets said.
  const result = verifyLevelText(DAY1_LEVEL_TEXT);
  expect(result.level).not.toBeNull();
  expect(check(result, "L1").ok).toBe(true);
  expect(check(result, "L2").ok).toBe(false);
  expect(check(result, "L2").detail).toMatch(/no exit/);
  expect(check(result, "L3").ok).toBeNull();
  expect(result.ok).toBe(false);
});

test("L1: a level that does not parse fails L1 and skips the rest", () => {
  const result = verifyLevelText("hoppa/1 delve\n####\n");
  expect(result.level).toBeNull();
  expect(check(result, "L1").ok).toBe(false);
  for (const id of ["L2", "L3", "L4", "L5"]) {
    expect(check(result, id).ok).toBeNull();
  }
  expect(result.ok).toBe(false);
});

test("L3: an exit walled off from the start is caught", () => {
  // The exit at (22,12) is only ever entered from (22,11) -- its other
  // neighbours are already wall. Brick that one cell up and it is unreachable.
  const sealed = withCell(DAY2_LEVEL_TEXT, 22, 11, "#");
  const result = verifyLevelText(sealed);
  expect(check(result, "L3").ok).toBe(false);
  expect(check(result, "L3").detail).toMatch(/walled off/);
  expect(result.ok).toBe(false);
});

test("L4: a treasure nobody can reach is caught", () => {
  // (4,8) is the one door into the south-west pocket that holds the treasure at
  // (4,10). Brick it up and the treasure is stranded -- this is the exact bug
  // the check caught while this level was being drawn.
  const sealed = withCell(DAY2_LEVEL_TEXT, 4, 8, "#");
  const result = verifyLevelText(sealed);
  expect(check(result, "L4").ok).toBe(false);
  expect(check(result, "L4").detail).toMatch(/walled off: \(4,10\)/);
  expect(result.ok).toBe(false);
});

test("L5: a ninth treasure has no bit to live in", () => {
  const rows = DAY2_LEVEL_TEXT.split("\n");
  rows[8] = "#........#$$$$$$$$$..#.#";
  expect(rows[8]?.length).toBe(GRID_W);

  const result = verifyLevelText(rows.join("\n"));
  expect(check(result, "L5").ok).toBe(false);
  expect(check(result, "L5").detail).toMatch(/only has 8 bits/);
});

test("reachableCells counts what the start can actually walk to", () => {
  const result = verifyLevelText(DAY2_LEVEL_TEXT);
  expect(result.reachableCells).toBe(150);
});
