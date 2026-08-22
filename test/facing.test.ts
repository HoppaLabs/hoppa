// Which way a walking thing is drawn.
//
// "I think the shark is facing the wrong way when it targets the player."
//
// It was. The renderer mirrored an enemy on the `dir` its engine reports, and
// `dir` is a PATROL field: every swim build sets it in the pacing branch and the chase
// branch never touches it. So the moment a shark turned to come at you it kept
// whichever way it had been pacing, and swam at you tail-first.
//
// Asked whether the other engines had it too, they did, and worse. Only ONE of
// the five real-time engines was drawing enemies the right way round:
//
//   swim   emits `dir`, but it is a patrol field -- stale during a chase
//   roam   does not emit `dir` AT ALL, so every enemy fell back to facing right
//   calm   the same
//   raze   the same
//   dash   emits it and maintains it in the walk, and its walkers never chase
//
// So a bear, a goblin, a bunny and a kaiju have never once turned around: they
// walked left facing right for as long as those engines have existed, and only
// the shark got reported because a shark's snout is the most obvious thing in
// the game.
//
// Fixed by asking a different question -- which way did it just GO -- because
// that needs no engine to answer it, is right during a chase, a patrol and a
// walk home alike, and fixes every shipped engine at once without touching one
// of them. Nothing here reaches stateHash, so a proof from yesterday still
// replays (hard rule 4).

import { expect, test } from "bun:test";
import { Facing } from "../src/web/play/facing.ts";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { newestBuild } from "../src/core/builds.ts";

test("a thing that has not moved yet faces the way the art is drawn", () => {
  expect(new Facing().of(0, 100)).toBe(1);
});

test("it faces the way it went, and keeps facing that way while it stands still", () => {
  const facing = new Facing();
  facing.of(0, 100);
  expect(facing.of(0, 90)).toBe(-1);
  // Standing still is not a direction. A guard at the end of its patrol must
  // not snap back to facing right.
  expect(facing.of(0, 90)).toBe(-1);
  expect(facing.of(0, 120)).toBe(1);
});

test("swimming straight down does not turn it sideways", () => {
  // The second bug, which nobody had reported because nobody could name it:
  // `dir` is the direction along the patrol's OWN axis, so on a vertical
  // corridor it means up or down -- and mirroring on it flipped the sprite
  // left-right according to whether the thing was going up or down.
  const facing = new Facing();
  facing.of(0, 100);
  expect(facing.of(0, 80)).toBe(-1);
  // Now it only moves vertically: x never changes, so neither does the facing.
  for (let i = 0; i < 10; i++) expect(facing.of(0, 80)).toBe(-1);
});

test("each enemy is remembered separately", () => {
  const facing = new Facing();
  facing.of(0, 100); facing.of(1, 100);
  facing.of(0, 80);
  expect(facing.of(0, 80)).toBe(-1);
  expect(facing.of(1, 130)).toBe(1);
});

test("a new run forgets where everything was", () => {
  const facing = new Facing();
  facing.of(0, 100); facing.of(0, 60);
  expect(facing.of(0, 60)).toBe(-1);
  facing.forget();
  // Not -1 carried over from a level that is no longer on screen, and not a
  // spurious turn from comparing against a position in a different room.
  expect(facing.of(0, 400)).toBe(1);
});

test("the renderer asks it, and no longer asks the engine's patrol field", async () => {
  const renderer = await Bun.file("src/web/play/renderer.ts").text();
  expect(renderer).toContain("const mirrored = this.facing.of(seat, enemy.x) < 0;");
  expect(renderer).not.toContain("(enemy.dir ?? 1) < 0");
});

test("...and the engine really does leave dir alone while chasing", async () => {
  // The cause, pinned where it is: if a later build starts maintaining `dir`
  // through a chase this test is the place that says the renderer no longer
  // has to care. Read as source because setting it would change stateHash,
  // and every shipped swim/2 link depends on that hash (hard rule 3).
  // Every swim build, not just the newest: a shipped link pins its own, so the
  // renderer has to be right for all of them.
  for (const version of [1, 2, 3]) {
    const swim = await Bun.file(`src/engines/swim/v${version}.ts`).text();
    const chase = swim.slice(swim.indexOf("if (near) {"), swim.indexOf("// Not chasing."));
    expect({ version, steps: chase.includes("this.stepOneAxis(enemy, this.x, this.y);") })
      .toEqual({ version, steps: true });
    expect({ version, turns: chase.includes("enemy.dir") }).toEqual({ version, turns: false });
  }
});

// --- and the same question asked of the engines themselves -------------------

/** A room with the player at `px` and one enemy near enough to chase. */
function room(engine: string, ex: number, px: number): string {
  const rows: string[] = [`hoppa/1 ${engine} seed=oooo tiles=0 behaviour=${newestBuild(engine)}`];
  for (let y = 0; y < GRID_H; y++) {
    rows.push(y === 0 || y === GRID_H - 1 ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#");
  }
  const put = (y: number, x: number, ch: string): void => {
    const line = rows[y + 1] as string;
    rows[y + 1] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(6, px, "@"); put(6, ex, "G"); put(8, px, "$"); put(GRID_H - 2, GRID_W - 2, ">");
  return rows.join("\n") + "\n";
}

interface Watched {
  step(held: number): number;
  enemyPositions(): Array<{ x: number; chasing: boolean; dir?: number }>;
}

/** Where the one enemy starts and ends up, after twenty idle ticks. */
function chase(engine: string, ex: number, px: number): { from: number; to: number; dir?: number } {
  const level = parseLevel(room(engine, ex, px));
  const game = engineFor(level, PRESETS[3] as (typeof PRESETS)[number]) as unknown as Watched;
  const from = (game.enemyPositions()[0] as { x: number }).x;
  for (let i = 0; i < 20; i = (i + 1) | 0) game.step(0);
  const after = game.enemyPositions()[0] as { x: number; dir?: number };
  return { from, to: after.x, dir: after.dir };
}

const CHASERS = ["roam", "swim", "calm", "raze"] as const;

test("every chasing engine really does come at you, both ways", () => {
  // The setup for the test below: if the enemy did not actually move, the
  // facing check underneath would be asserting nothing at all.
  for (const engine of CHASERS) {
    const right = chase(engine, 12, 14);
    const left = chase(engine, 16, 14);
    expect({ engine, went: right.to > right.from }).toEqual({ engine, went: true });
    expect({ engine, went: left.to < left.from }).toEqual({ engine, went: true });
  }
});

test("...and not one of them would have been drawn facing the right way", () => {
  // The bug, measured rather than argued. `dir` is either missing -- roam,
  // calm and raze never emit it, so the old `?? 1` drew every enemy facing
  // right forever -- or stale, which is the shark.
  for (const engine of CHASERS) {
    const left = chase(engine, 16, 14);
    const wouldMirror = (left.dir ?? 1) < 0;
    expect({ engine, mirrored: wouldMirror }).toEqual({ engine, mirrored: false });
  }
});

test("watching where it went gets all four right", () => {
  for (const engine of CHASERS) {
    const going = chase(engine, 16, 14);
    const facing = new Facing();
    facing.of(0, going.from);
    expect({ engine, faces: facing.of(0, going.to) }).toEqual({ engine, faces: -1 });

    const coming = chase(engine, 12, 14);
    const other = new Facing();
    other.of(0, coming.from);
    expect({ engine, faces: other.of(0, coming.to) }).toEqual({ engine, faces: 1 });
  }
});

test("dash was the one that was already right, and stays right", async () => {
  // Its walkers do not chase -- they pace a ledge -- and it both emits `dir`
  // and maintains it. Watching movement has to agree with it, or the fix has
  // broken the one engine that did not need fixing. Checked in a browser on
  // "the tall room" as well: snout and eye lead the way it is going.
  const dash = await Bun.file("src/engines/dash/v8.ts").text();
  expect(dash).toContain("dir: w.dir | 0");
  expect(dash).toContain("chasing: false");
});
