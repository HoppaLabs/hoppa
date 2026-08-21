// Hard rule 4, for EVERY build -- not just the retired one it was written for.
//
// "Cosmetics never touch stateHash(). Sprites, palettes, tilesets are
// presentation only. There's a test for this; keep it passing."
//
// There was a test for it. E10, in test/delve-v3.test.ts, written on day 3 --
// and it covers delve/1, delve/2 and delve/3. Nothing since. Every engine
// built after day 3 -- roam, dash, swim, calm, twenty-two builds of them --
// could read the level's cosmetic fields straight into its hash and the suite
// would have stayed green.
//
// Found by tools/mutate.ts: adding `hashInt32(h, this.level.tilesetId)` to
// roam/8's stateHash() survived the whole suite.
//
// A shipped link pins a behaviour version and carries a `tiles=` field. If the
// art a level is drawn with could change its hash, then improving a tileset
// would silently invalidate every proof ever sent -- which is the same damage
// hard rule 3 exists to prevent, arriving by a different door.

import { expect, test } from "bun:test";
import { blankDraft, draftToText } from "../src/core/draft.ts";
import { parseLevel } from "../src/core/level.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { hashHex } from "../src/core/hash.ts";
import { FIRST_SKIN } from "../src/core/tileset.ts";

/** The same presses for every engine: real-time reads a bitmask, turn-based a move. */
const LOG = Array.from({ length: 120 }, (_, at) => (at * 7) % 24);

/** Every build the registry routes, as engine and version. */
const BUILDS = knownBuilds().map((key) => {
  const [engine, version] = key.split("/") as [string, string];
  return { key, engine, version: Number.parseInt(version, 10) };
});

function hashAfter(text: string): string {
  const engine = engineFor(parseLevel(text), PRESETS[0] as (typeof PRESETS)[number]) as unknown as {
    step(input: number): number;
    stateHash(): number;
  };
  for (const held of LOG) engine.step(held);
  return hashHex(engine.stateHash());
}

test("no build reads the tileset into its hash", () => {
  const table: string[] = [];
  for (const build of BUILDS) {
    const plain = draftToText(blankDraft(build.engine, build.version));
    // A blank draft asks for no skin: whatever its engine's world looks like.
    expect(plain).toContain("tiles=0");
    // The same room, the same log, drawn in a different set of colours -- and
    // a REAL skin, not a spare number, so this is the change a child can
    // actually make from the tab strip. See FIRST_SKIN in core/tileset.ts.
    const restyled = plain.replace("tiles=0", `tiles=${FIRST_SKIN}`);
    expect(parseLevel(restyled).tilesetId).toBe(FIRST_SKIN);

    const before = hashAfter(plain);
    const after = hashAfter(restyled);
    table.push(`  ${build.key.padEnd(8)} ${before}  ${after}  ${before === after ? "same" : "*** MOVED ***"}`);
    expect({ build: build.key, hash: after }).toEqual({ build: build.key, hash: before });
  }
  console.log(`\n  build    no skin   tiles=${FIRST_SKIN}\n${table.join("\n")}`);
});

test("it covers every build the registry routes, not a list somebody typed", () => {
  // The reason this file exists: E10 named three builds, and twenty-two more
  // arrived without it. Reading the registry means a new engine is covered by
  // being registered.
  expect(BUILDS.length).toBe(knownBuilds().length);
  expect(BUILDS.length).toBeGreaterThanOrEqual(25);
  for (const engine of ["delve", "roam", "dash", "swim", "calm"]) {
    expect(BUILDS.some((build) => build.engine === engine)).toBe(true);
  }
});
