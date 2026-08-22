// The way out is shut until the treasure is in, and then it is not.
//
// Every world draws it differently now -- an oak door underground, a landing
// pad in the city, a sailor's trunk on the seabed -- and two of those are two
// separate drawings rather than one recoloured. So the thing worth pinning is
// not the picture, which is presentation, but the TILE the engine emits: shut
// while anything is still out there, open the moment the last one is picked
// up. Everything downstream hangs off that one index.

import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { newestBuild } from "../src/core/builds.ts";
import { GRID_H, GRID_W, idx } from "../src/core/grid.ts";
import { TILE_EXIT_LOCKED, TILE_EXIT_OPEN } from "../src/core/tiles.ts";

/** A room with one gem a step away and the way out in the far corner. */
function room(engine: string, version: number, tiles: number): string {
  const rows = [`hoppa/1 ${engine} seed=oooo tiles=${tiles} behaviour=${version}`];
  const open = (): string => "#" + ".".repeat(GRID_W - 2) + "#";
  for (let y = 0; y < GRID_H; y++) {
    rows.push(y === 0 || y === GRID_H - 1 ? "#".repeat(GRID_W) : open());
  }
  const put = (row: number, x: number, ch: string): void => {
    const line = rows[row] as string;
    rows[row] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  // You, a gem one step to your right, and the way out in the far corner.
  put(1, 2, "@");
  put(1, 3, "$");
  put(GRID_H - 2, GRID_W - 2, ">");
  return rows.join("\n") + "\n";
}

const WORLDS: ReadonlyArray<readonly [string, number]> = [
  ["roam", 0], ["dash", 0], ["swim", 0], ["calm", 0], ["calm", 5], ["raze", 6],
];

test("the way out is shut while a gem is still out there, in every game", () => {
  for (const [engine, tiles] of WORLDS) {
    const text = room(engine, newestBuild(engine), tiles);
    const level = parseLevel(text);
    const game = engineFor(level, PRESETS[0] as (typeof PRESETS)[number]) as unknown as {
      step(held: number): number; render(): Uint8Array;
    };
    const at = idx(level.exitX, level.exitY);
    expect({ engine, tiles, tile: game.render()[at] })
      .toEqual({ engine, tiles, tile: TILE_EXIT_LOCKED });
  }
});

test("...and open the moment the last one is in", () => {
  for (const [engine, tiles] of WORLDS) {
    const text = room(engine, newestBuild(engine), tiles);
    const level = parseLevel(text);
    const game = engineFor(level, PRESETS[0] as (typeof PRESETS)[number]) as unknown as {
      step(held: number): number; render(): Uint8Array;
      collectedCount(): number; treasureTotal(): number;
    };
    const at = idx(level.exitX, level.exitY);
    // Walk right onto the gem. Held right is enough in every one of these:
    // the gem is one cell along and nothing is in the way.
    for (let i = 0; i < 90 && game.collectedCount() < game.treasureTotal(); i++) game.step(2);
    expect({ engine, tiles, got: game.collectedCount(), of: game.treasureTotal() })
      .toEqual({ engine, tiles, got: game.treasureTotal(), of: game.treasureTotal() });
    expect({ engine, tiles, tile: game.render()[at] })
      .toEqual({ engine, tiles, tile: TILE_EXIT_OPEN });
  }
});
