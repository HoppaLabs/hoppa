// dash/8: an enemy in mid-air falls.
//
// Reported as "the enemies are not moving on the side app". They were not.
// A walker turns round rather than step off a platform, and a walker with
// nothing under it at all reads BOTH directions as a ledge -- so it flipped
// its facing every tick, thirty times a second, standing perfectly still.
//
// Which is exactly what a child produces: draw a room, tap a goblin into the
// middle of the sky. Only the side-on game had it; nothing falls underwater or
// from above, so roam and swim were always fine.

import { expect, test } from "bun:test";
import { blankDraft, draftToText, paint, type Glyph } from "../src/core/draft.ts";
import { newestBuild } from "../src/core/builds.ts";
import { parseLevel } from "../src/core/level.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { HELD_NONE } from "../src/engines/types.ts";
import { ENEMY_GLYPHS } from "../src/core/level.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";

type Watchable = {
  step(held: number): number;
  stateHash(): number;
  enemyPositions(): Array<{ x: number; y: number; dir: number }>;
};

const WHO = PRESETS[0] as (typeof PRESETS)[number];

/** A level as the editor hands it over, with one enemy painted in. */
function drawn(glyph: string, x: number, y: number, version = newestBuild("dash")): Watchable {
  let draft = blankDraft("dash", version);
  draft = paint(draft, x, y, glyph as Glyph).draft;
  return engineFor(parseLevel(draftToText(draft)), WHO) as unknown as Watchable;
}

/** How far it actually travels, not how far it ends up from where it started. */
function travelled(engine: Watchable, ticks: number): { across: number; fell: number } {
  let last = engine.enemyPositions()[0] as { x: number; y: number };
  const top = last.y;
  let across = 0;
  for (let tick = 0; tick < ticks; tick++) {
    engine.step(HELD_NONE);
    const now = engine.enemyPositions()[0] as { x: number; y: number };
    across += Math.abs(now.x - last.x);
    last = now;
  }
  return { across, fell: (last.y - top) | 0 };
}

test("every enemy dropped in the sky lands, and then walks", () => {
  const table: string[] = [];
  for (const glyph of ENEMY_GLYPHS) {
    const run = travelled(drawn(glyph, 10, 3), 300);
    table.push(`  "${glyph}" in open sky: fell ${(run.fell / 256).toFixed(1)} cells, then walked ${(run.across / 256).toFixed(1)}`);
    expect({ glyph, landed: run.fell > 256 }).toEqual({ glyph, landed: true });
    expect({ glyph, walked: run.across > 256 }).toEqual({ glyph, walked: true });
  }
  console.log("\n" + table.join("\n"));
});

test("dash/7 really did hang it in the air, which is what this fixes", () => {
  // The old build is shipped forever and must keep doing exactly what it did.
  const run = travelled(drawn("G", 10, 3, 7), 300);
  expect(run.fell).toBe(0);
  expect(run.across).toBe(0);
});

test("one that fell stands exactly where one drawn there stands", () => {
  // Otherwise a fallen enemy floats with a third of a cell of daylight under
  // its feet -- measured at 90 subcells before this was fixed. Nobody can name
  // that; everybody can see it.
  const fell = drawn("G", 10, 3);
  const placed = drawn("G", 10, GRID_H - 2);
  for (let tick = 0; tick < 200; tick++) { fell.step(HELD_NONE); placed.step(HELD_NONE); }
  expect((fell.enemyPositions()[0] as { y: number }).y)
    .toBe((placed.enemyPositions()[0] as { y: number }).y);
});

test("a walker already on the ground is untouched by any of this", () => {
  const run = travelled(drawn("G", 10, GRID_H - 2), 300);
  expect(run.fell).toBe(0);
  expect(run.across).toBeGreaterThan(256 * 20);
});

test("nothing leaves the grid, whatever a child deletes", () => {
  // A room with its floor scraped out is a level the advice already refuses to
  // call playable -- but it must not put an enemy through the bottom of the
  // world on the way to being told so.
  let draft = blankDraft("dash", newestBuild("dash"));
  for (let x = 1; x < GRID_W - 1; x = (x + 1) | 0) {
    draft = paint(draft, x, GRID_H - 1, "." as Glyph).draft;
  }
  draft = paint(draft, 10, 3, "G" as Glyph).draft;
  const engine = engineFor(parseLevel(draftToText(draft)), WHO) as unknown as Watchable;
  for (let tick = 0; tick < 900; tick++) engine.step(HELD_NONE);
  const at = engine.enemyPositions()[0] as { x: number; y: number };
  expect(at.y).toBeGreaterThanOrEqual(0);
  expect(at.y).toBeLessThan(GRID_H * 256);
  expect(Number.isSafeInteger(engine.stateHash())).toBe(true);
});

test("a fall replays identically, or a shared level would not", () => {
  // vy joined the hash in v8, which is the reason this is a new build and not
  // an edit to v7.
  const log = Array.from({ length: 400 }, (_, i) => (i * 5) % 32);
  const hashes = [0, 1].map(() => {
    const engine = drawn("G", 10, 3);
    for (const held of log) engine.step(held);
    return engine.stateHash();
  });
  expect(hashes[0]).toBe(hashes[1]);
});

test("every dash build still routes", () => {
  const dash = knownBuilds().filter((build) => build.startsWith("dash/"));
  expect(dash).toContain("dash/7");
  expect(dash).toContain("dash/8");
  expect(newestBuild("dash")).toBe(8);
});
