import { expect, test } from "bun:test";
import { GRID_AREA, GRID_H, GRID_W, idx } from "../src/core/grid.ts";
import { LevelParseError, isWall, parseLevel } from "../src/core/level.ts";
import { DAY1_LEVEL_TEXT } from "../src/core/fixtures.ts";

const level = parseLevel(DAY1_LEVEL_TEXT);

test("the grid is 24x14 and nobody has quietly changed it", () => {
  expect(GRID_W).toBe(24);
  expect(GRID_H).toBe(14);
  expect(GRID_AREA).toBe(GRID_W * GRID_H);
  expect(level.walls.length).toBe(GRID_AREA);
});

test("the day 1 level parses with one start and a sealed border", () => {
  expect(level.engine).toBe("delve");
  expect(level.behaviourVersion).toBe(1);
  expect(level.startX).toBe(1);
  expect(level.startY).toBe(1);
  expect(isWall(level, level.startX, level.startY)).toBe(false);

  for (let x = 0; x < GRID_W; x++) {
    expect(isWall(level, x, 0)).toBe(true);
    expect(isWall(level, x, GRID_H - 1)).toBe(true);
  }
  for (let y = 0; y < GRID_H; y++) {
    expect(isWall(level, 0, y)).toBe(true);
    expect(isWall(level, GRID_W - 1, y)).toBe(true);
  }
});

test("every open cell is reachable from the start", () => {
  const seen = new Uint8Array(GRID_AREA);
  const stack = [[level.startX, level.startY] as const];
  seen[idx(level.startX, level.startY)] = 1;
  let reached = 0;

  while (stack.length > 0) {
    const [x, y] = stack.pop() as readonly [number, number];
    reached++;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      if (isWall(level, nx, ny) || seen[idx(nx, ny)] === 1) continue;
      seen[idx(nx, ny)] = 1;
      stack.push([nx, ny]);
    }
  }

  let open = 0;
  for (let i = 0; i < GRID_AREA; i++) if (level.walls[i] === 0) open++;
  console.log(`\n  day1.lvl: ${open} open cells, ${reached} reachable from start`);
  expect(reached).toBe(open);
});

test("malformed levels are rejected with a message, never a crash", () => {
  const cases: Array<[string, string]> = [
    ["", "empty"],
    ["not-a-header\n", "hoppa/"],
    ["hoppa/9 delve\n", "schema"],
    ["hoppa/1 delve\n####\n", "rows tall"],
  ];
  for (const [text, needle] of cases) {
    expect(() => parseLevel(text)).toThrow(LevelParseError);
    try {
      parseLevel(text);
    } catch (err) {
      expect((err as Error).message).toContain(needle);
    }
  }
});

test("a bad glyph names itself instead of being silently swallowed", () => {
  const rows = DAY1_LEVEL_TEXT.split("\n");
  rows[3] = "#..####....######...%..#";
  expect(() => parseLevel(rows.join("\n"))).toThrow(/glyph "%" is not in the tile set/);
});

test("a glyph the spec has but the engines do not yet is still an error", () => {
  // ~ is spec S9's water. It arrives with rafts on day 7; until then it must not
  // parse as floor, which would silently turn an unplayable level into a
  // playable one.
  const rows = DAY1_LEVEL_TEXT.split("\n");
  rows[3] = "#..####....######...~..#";
  expect(() => parseLevel(rows.join("\n"))).toThrow(/glyph "~" is not in the tile set/);
});

test("two starts are an error, not a coin toss", () => {
  const rows = DAY1_LEVEL_TEXT.split("\n");
  rows[3] = "#@.####....######......#";
  expect(() => parseLevel(rows.join("\n"))).toThrow(/two starts/);
});
