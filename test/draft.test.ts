import { expect, test } from "bun:test";
import { GRID_AREA, GRID_H, GRID_W, idx } from "../src/core/grid.ts";
import {
  MAX_GUARDS, MAX_TREASURE, blankDraft, draftFromLevel, draftToText,
  paint, retarget, tally,
} from "../src/core/draft.ts";
import { adviceFor } from "../src/core/advice.ts";
import { decodeLevel, encodeLevel, sameLevel } from "../src/core/codec.ts";
import { parseLevel } from "../src/core/level.ts";
import { verifyLevelText } from "../src/core/verify.ts";
import { engineFor } from "../src/engines/registry.ts";

const ROAM = () => blankDraft("roam", 2);
const DASH = () => blankDraft("dash", 1);

// --- what you start with --------------------------------------------------------

test("a new level is an empty room you can already play", () => {
  const draft = ROAM();
  expect(draft.cells).toHaveLength(GRID_AREA);
  const result = verifyLevelText(draftToText(draft));
  expect(result.ok).toBe(true);
  expect(adviceFor(draftToText(draft)).playable).toBe(true);
  // And the engine it names is actually there.
  expect(engineFor(parseLevel(draftToText(draft))).behaviourVersion).toBe(2);
});

test("a new level has a wall all the way round, so nobody draws off the edge", () => {
  const draft = ROAM();
  for (let x = 0; x < GRID_W; x++) {
    expect(draft.cells[idx(x, 0)]).toBe("#");
    expect(draft.cells[idx(x, GRID_H - 1)]).toBe("#");
  }
  for (let y = 0; y < GRID_H; y++) {
    expect(draft.cells[idx(0, y)]).toBe("#");
    expect(draft.cells[idx(GRID_W - 1, y)]).toBe("#");
  }
});

// --- the rules that keep a draft drawable ----------------------------------------

test("there is only ever one start and one door: they move rather than multiply", () => {
  let draft = ROAM();
  draft = paint(draft, 5, 5, "@").draft;
  draft = paint(draft, 9, 9, "@").draft;
  expect(tally(draft, "@")).toBe(1);
  expect(draft.cells[idx(9, 9)]).toBe("@");
  expect(draft.cells[idx(5, 5)]).toBe(".");

  draft = paint(draft, 3, 3, ">").draft;
  draft = paint(draft, 7, 7, ">").draft;
  expect(tally(draft, ">")).toBe(1);
  expect(draft.cells[idx(7, 7)]).toBe(">");
});

test("you cannot paint over the start or the door, and you are told why", () => {
  let draft = ROAM();
  draft = paint(draft, 5, 5, "@").draft;
  const over = paint(draft, 5, 5, "#");
  expect(over.changed).toBe(false);
  expect(over.reason).toContain("where you start");
  expect(over.reason).not.toContain("glyph");

  draft = paint(draft, 6, 6, ">").draft;
  const overDoor = paint(draft, 6, 6, "#");
  expect(overDoor.changed).toBe(false);
  expect(overDoor.reason).toContain("way out");
});

test("treasure and enemies stop at their limits rather than silently vanishing", () => {
  let draft = ROAM();
  for (let i = 0; i < MAX_TREASURE + 4; i++) draft = paint(draft, 2 + i, 4, "$").draft;
  expect(tally(draft, "$")).toBe(MAX_TREASURE);

  const refused = paint(draft, 20, 4, "$");
  expect(refused.changed).toBe(false);
  expect(refused.reason).toContain("most a level can hold");

  for (let i = 0; i < MAX_GUARDS + 4; i++) draft = paint(draft, 2 + i, 6, "G").draft;
  expect(tally(draft, "G")).toBe(MAX_GUARDS);
});

test("painting off the level is ignored, not a crash", () => {
  const draft = ROAM();
  for (const [x, y] of [[-1, 5], [5, -1], [GRID_W, 5], [5, GRID_H]]) {
    const result = paint(draft, x as number, y as number, "#");
    expect(result.changed).toBe(false);
    expect(result.draft).toBe(draft);
  }
});

test("painting what is already there changes nothing", () => {
  const draft = ROAM();
  const again = paint(draft, 0, 0, "#");
  expect(again.changed).toBe(false);
  expect(again.draft).toBe(draft);
});

// --- switching games ---------------------------------------------------------------

test("ladders are dropped when a level stops being a side-on one", () => {
  let draft = DASH();
  draft = paint(draft, 4, 6, "H").draft;
  draft = paint(draft, 4, 7, "H").draft;
  expect(tally(draft, "H")).toBe(2);

  const above = retarget(draft, "roam", 2);
  expect(tally(above, "H")).toBe(0);
  expect(above.engine).toBe("roam");

  // ...and the rest of the room survives the trip.
  expect(above.cells[idx(0, 0)]).toBe("#");
  expect(tally(above, "@")).toBe(1);
});

test("a level keeps its drawing when only the behaviour version moves", () => {
  const draft = paint(ROAM(), 5, 5, "#").draft;
  const same = retarget(draft, "roam", 2);
  expect(same.cells).toEqual(draft.cells);
});

// --- it round-trips through everything a real level does -----------------------------

test("a drawn level survives text, the codec and back", () => {
  let draft = DASH();
  draft = paint(draft, 4, 6, "H").draft;
  draft = paint(draft, 8, 8, "$").draft;
  draft = paint(draft, 12, 8, "G").draft;

  const level = parseLevel(draftToText(draft));
  const round = decodeLevel(encodeLevel(level));
  expect(sameLevel(level, round)).toBe(true);

  // ...and reading it back gives the drawing you started with.
  expect(draftFromLevel(round).cells).toEqual(draft.cells);
});

test("a drawn level fits in a link", () => {
  let draft = ROAM();
  for (let i = 0; i < MAX_TREASURE; i++) draft = paint(draft, 2 + i, 4, "$").draft;
  for (let i = 0; i < MAX_GUARDS; i++) draft = paint(draft, 2 + i, 6, "G").draft;
  const advice = adviceFor(draftToText(draft));
  expect(advice.codeLength).toBeGreaterThan(0);
  expect(advice.codeLength).toBeLessThan(400);
});

// --- what it says about a broken level ------------------------------------------------

test("a walled-off door is called out in words, not check ids", () => {
  let draft = ROAM();
  // Box the door into its own corner.
  draft = paint(draft, GRID_W - 3, GRID_H - 2, "#").draft;
  draft = paint(draft, GRID_W - 2, GRID_H - 3, "#").draft;
  draft = paint(draft, GRID_W - 3, GRID_H - 3, "#").draft;

  const advice = adviceFor(draftToText(draft));
  expect(advice.playable).toBe(false);
  const text = advice.notes.map((n) => n.text).join(" ");
  expect(text).toContain("wall in the way");
  expect(text).not.toMatch(/L[0-9]/);
});

test("walled-off treasure is fatal, because the door never opens without it", () => {
  let draft = ROAM();
  draft = paint(draft, 5, 5, "$").draft;
  for (const [x, y] of [[4, 5], [6, 5], [5, 4], [5, 6]]) {
    draft = paint(draft, x as number, y as number, "#").draft;
  }
  const advice = adviceFor(draftToText(draft));
  expect(advice.playable).toBe(false);
  expect(advice.notes.some((n) => n.text.includes("treasure") && n.fatal)).toBe(true);
});

test("a guard with too much corridor is a warning, not a refusal", () => {
  // The whole open room is one long run, so its patrol period blows the cap.
  const draft = paint(ROAM(), 10, 6, "G").draft;
  const advice = adviceFor(draftToText(draft));
  expect(advice.notes.some((n) => n.text.includes("march"))).toBe(true);
  expect(advice.playable).toBe(true);
});

test("every note is something a child could act on", () => {
  const broken = paint(paint(ROAM(), 10, 6, "G").draft, GRID_W - 3, GRID_H - 2, "#").draft;
  for (const note of adviceFor(draftToText(broken)).notes) {
    expect(note.text).not.toMatch(/L[0-9]|glyph|entity|codec|patrol period|cell index/);
    expect(note.text.length).toBeLessThan(120);
  }
});
