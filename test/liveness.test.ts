// The obvious things, asserted for every engine, every creature, every place
// you can put one.
//
// WHY THIS FILE EXISTS
//
// Four bugs in two days had the same shape: something visibly broken on a
// phone, and a green suite, because the assertion nobody writes is the one
// that seems too obvious to write. Enemies had never moved in the side-on
// game -- six behaviour versions of it. The garden shipped with a working
// sword that cleared every bunny. The reef shipped with nothing living in it.
// And when the first of those was fixed, the fix's own test asked about an
// enemy standing on a floor and never about one standing in mid-air, which is
// where the next bug was.
//
// So this does not pick examples. It walks the CROSS-PRODUCT -- every engine
// at its newest build, every enemy glyph, every kind of spot a child can drop
// one into -- and asserts the handful of things that must be true of all of
// them. A new engine or a new entity joins the table by existing.
//
// It prints the table too. A behaviour change that is nobody's bug still shows
// up as a diff somebody has to look at.

import { expect, test } from "bun:test";
import { blankDraft, draftToText, falls, paint, type Glyph } from "../src/core/draft.ts";
import { newestBuild } from "../src/core/builds.ts";
import { ENEMY_GLYPHS, isWall, parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { HELD_NONE } from "../src/engines/types.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { ONE } from "../src/core/fixed.ts";

const GAMES = ["roam", "dash", "swim", "calm"] as const;
const WHO = PRESETS[0] as (typeof PRESETS)[number];
const TICKS = 300;

type Watched = {
  step(held: number): number;
  stateHash(): number;
  enemyPositions(): Array<{ x: number; y: number }>;
};

/**
 * Somewhere a child can put a creature, and whether it should get out of the
 * cell it started in.
 *
 * ESCAPING ITS CELL, not "travelled more than zero". The distinction is the
 * whole point of this file. A walker with nothing under it flipped its facing
 * every tick and stood still -- and a walker sealed in a one-cell box shuffles
 * a tenth of a cell each way before its leading edge finds the rock, which is
 * a perfectly sensible thing for it to do. Distance travelled cannot tell
 * those two apart. Leaving the cell can.
 */
const SPOTS = [
  { name: "on the floor", at: [10, GRID_H - 2], walls: [] as Array<[number, number]>, escapes: () => true },
  { name: "in mid-air", at: [10, 4], walls: [] as Array<[number, number]>, escapes: () => true },
  {
    // A ledge wide enough to pace. This is what a child draws, and it must
    // work in every game.
    name: "on a ledge",
    at: [10, 8],
    walls: [[8, 9], [9, 9], [10, 9], [11, 9], [12, 9]] as Array<[number, number]>,
    escapes: () => true,
  },
  {
    // A single block with a creature on top. In a game with gravity this is a
    // PEN and not a bug: the ledge rule stops a walker stepping off, and a
    // one-cell pillar is nothing but ledge. It looks exactly like the bug that
    // started this file, which is why it is written down here rather than left
    // for somebody to rediscover and "fix".
    name: "on a pillar",
    at: [10, 8],
    walls: [[10, 9]] as Array<[number, number]>,
    escapes: (engine: string) => !falls(engine),
  },
  {
    // All FOUR sides. Two was the first attempt and it was a side-on
    // assumption wearing a general name: walled left and right, a top-down
    // enemy simply walks out through the top. Caught by this file on its first
    // run, which is the argument for walking the cross-product rather than
    // picking the case you happen to be thinking about.
    name: "penned in",
    at: [10, GRID_H - 3],
    walls: [
      [9, GRID_H - 3], [11, GRID_H - 3], [10, GRID_H - 4], [10, GRID_H - 2],
    ] as Array<[number, number]>,
    escapes: () => false,
  },
] as const;

function build(engine: string, glyph: string, spot: (typeof SPOTS)[number], version?: number): Watched {
  let draft = blankDraft(engine, version ?? newestBuild(engine));
  for (const [wx, wy] of spot.walls) draft = paint(draft, wx, wy, "#" as Glyph).draft;
  draft = paint(draft, spot.at[0] as number, spot.at[1] as number, glyph as Glyph).draft;
  return engineFor(parseLevel(draftToText(draft)), WHO) as unknown as Watched;
}

/** Distance covered, cells visited, and whether it ever left the grid. */
function watch(engine: Watched): { travel: number; cells: number; inGrid: boolean } {
  let last = engine.enemyPositions()[0];
  if (last === undefined) return { travel: -1, cells: 0, inGrid: true };
  const seen = new Set<number>();
  let travel = 0;
  let inGrid = true;
  for (let tick = 0; tick < TICKS; tick++) {
    engine.step(HELD_NONE);
    const now = engine.enemyPositions()[0] as { x: number; y: number };
    travel += Math.abs(now.x - last.x) + Math.abs(now.y - last.y);
    if (now.x < 0 || now.x >= GRID_W * ONE || now.y < 0 || now.y >= GRID_H * ONE) inGrid = false;
    else seen.add((((now.y / ONE) | 0) * GRID_W + ((now.x / ONE) | 0)) | 0);
    last = now;
  }
  return { travel, cells: seen.size, inGrid };
}

test("every creature in every game gets out of the cell it started in", () => {
  const table: string[] = [];
  for (const engine of GAMES) {
    for (const glyph of ENEMY_GLYPHS) {
      for (const spot of SPOTS) {
        const seen = watch(build(engine, glyph, spot));
        table.push(
          `  ${engine}/${newestBuild(engine)} "${glyph}" ${spot.name.padEnd(13)}` +
            ` ${String(seen.cells).padStart(3)} cells visited,` +
            ` ${(seen.travel / ONE).toFixed(1).padStart(6)} travelled` +
            (spot.escapes(engine) ? "" : "   (held: must not get out)"),
        );
        expect({
          engine, glyph, spot: spot.name,
          escapes: seen.cells > 1,
        }).toEqual({ engine, glyph, spot: spot.name, escapes: spot.escapes(engine) });
      }
    }
  }
  console.log("\n" + table.join("\n"));
});

test("nothing ever leaves the grid", () => {
  for (const engine of GAMES) {
    for (const glyph of ENEMY_GLYPHS) {
      for (const spot of SPOTS) {
        const seen = watch(build(engine, glyph, spot));
        expect({ engine, glyph, spot: spot.name, inGrid: seen.inGrid })
          .toEqual({ engine, glyph, spot: spot.name, inGrid: true });
      }
    }
  }
});

test("nothing ever stands inside rock", () => {
  for (const engine of GAMES) {
    for (const glyph of ENEMY_GLYPHS) {
      for (const spot of SPOTS) {
        let draft = blankDraft(engine, newestBuild(engine));
        for (const [wx, wy] of spot.walls) draft = paint(draft, wx, wy, "#" as Glyph).draft;
        draft = paint(draft, spot.at[0] as number, spot.at[1] as number, glyph as Glyph).draft;
        const level = parseLevel(draftToText(draft));
        const game = engineFor(level, WHO) as unknown as Watched;
        for (let tick = 0; tick < TICKS; tick++) {
          game.step(HELD_NONE);
          for (const at of game.enemyPositions()) {
            const cx = (at.x / ONE) | 0;
            const cy = (at.y / ONE) | 0;
            expect({ engine, glyph, spot: spot.name, inRock: isWall(level, cx, cy) })
              .toEqual({ engine, glyph, spot: spot.name, inRock: false });
          }
        }
      }
    }
  }
});

test("the same log twice gives the same hash, wherever it was put", () => {
  // Determinism is checked elsewhere for the player. Enemies carry state too --
  // dash/8's falling speed is the newest piece of it -- and a level whose
  // enemies replayed differently would not be shareable.
  const log = Array.from({ length: 200 }, (_, i) => (i * 5) % 32);
  for (const engine of GAMES) {
    for (const spot of SPOTS) {
      const hashes = [0, 1].map(() => {
        const game = build(engine, "G", spot);
        for (const held of log) game.step(held);
        return game.stateHash();
      });
      expect({ engine, spot: spot.name, same: hashes[0] === hashes[1] })
        .toEqual({ engine, spot: spot.name, same: true });
    }
  }
});
