// The bucket button, and the four builds that had one and could not show it.
//
// "Can the wand put out fires, or at least make them cooler so they don't
// hurt?" -- asked by somebody with a bucket they had never been shown.
//
// roam/8 was given one ("a water bucket to put out the fires"). Every top-down
// engine written since is a copy of that one, because hard rule 3 makes a new
// behaviour a new BUILD rather than an edit -- so calm/1, calm/2, swim/1,
// swim/2, swim/3 and raze/1 all read HELD_SWING and put the fire out. The
// button asked `engine === "roam"`, so in the garden, underwater and the city
// the ability shipped and was unreachable.
//
// This is the test that would have caught it: it does not ask what the table
// says, it asks the ENGINES what they do, and then checks the table agrees.

import { expect, test } from "bun:test";
import { bucketHelps, hasWater, wateredEngines } from "../src/web/play/water.ts";
import { BEACH, CITY, GARDEN, OUTSIDE, REEF, UNDERGROUND, type Tileset } from "../src/core/tileset.ts";
import { NEWEST_BUILD } from "../src/core/builds.ts";

/** Every engine build that actually reads the bucket button, read from source. */
async function dousesInSource(engine: string, version: number): Promise<boolean> {
  const file = Bun.file(`src/engines/${engine}/v${version}.ts`);
  if (!(await file.exists())) return false;
  const src = await file.text();
  return src.includes("this.pour = POUR_TICKS;") && src.includes("this.douse();");
}

/** Every build of every engine, 1..newest. */
function buildsFor(engine: string): number[] {
  const newest = NEWEST_BUILD[engine] ?? 0;
  const out: number[] = [];
  for (let v = 1; v <= newest; v = (v + 1) | 0) out.push(v);
  return out;
}

const ENGINES = Object.keys(NEWEST_BUILD);

test("every build that douses is offered the button, and no build that cannot", async () => {
  // Both directions. Offering a button that does nothing is the bug the
  // original condition was written to avoid; hiding one that works is the bug
  // it caused.
  for (const engine of ENGINES) {
    for (const version of buildsFor(engine)) {
      const real = await dousesInSource(engine, version);
      expect({ engine, version, offered: hasWater(engine, version), real })
        .toEqual({ engine, version, offered: real, real });
    }
  }
});

test("an old link keeps the game the person who beat it was playing", () => {
  // roam/7 has no bucket and never will. Hard rule 3: a proof recorded without
  // one has to replay without one, so the button is per BUILD, not per engine.
  expect(hasWater("roam", 7)).toBe(false);
  expect(hasWater("roam", 8)).toBe(true);
});

test("an engine nobody has thought about gets no bucket, rather than a broken one", () => {
  expect(hasWater("shove", 99)).toBe(false);
  expect(hasWater("nothing at all", 1)).toBe(false);
});

test("the side-on game is the one that genuinely has none", async () => {
  // Not an oversight: from the side HELD_ACT is jump and HELD_SWING is the
  // weapon, so there is no free bit for a bucket. It needs a new build and a
  // new button, which is a separate day's work.
  expect(wateredEngines()).not.toContain("dash");
  for (const version of buildsFor("dash")) {
    expect({ version, douses: await dousesInSource("dash", version) })
      .toEqual({ version, douses: false });
  }
});

test("a bucket is only offered where the world actually draws a flame", () => {
  // The engines all call it fire and always will -- TILE_FIRE is the index and
  // it is in every shipped log. What a world DRAWS is a different question, and
  // only two of the six draw something a bucket would help with.
  const worlds: ReadonlyArray<readonly [Tileset, boolean]> = [
    [UNDERGROUND, true],   // a flame in a cave
    [CITY, true],          // a flame in a street
    [OUTSIDE, false],      // metal spikes; pouring water on a spike does nothing
    [REEF, false],         // urchins, underwater, where a bucket is a joke
    [GARDEN, false],       // a pond -- a bucket here drains the lawn
    [BEACH, false],        // the sea, and there is rather a lot of it
  ];
  for (const [world, helps] of worlds) {
    expect({ world: world.name, helps: bucketHelps(world.hazard) })
      .toEqual({ world: world.name, helps });
  }
});

test("every world says what its hazard is, and it is one of the four", () => {
  // Required rather than optional on purpose: a new world cannot be added
  // without somebody answering this, which is exactly what the bug it replaces
  // failed at -- a condition naming one engine, silently excluding the rest.
  const all = [UNDERGROUND, OUTSIDE, REEF, GARDEN, BEACH, CITY];
  for (const world of all) {
    expect({ world: world.name, known: ["fire", "spikes", "urchins", "water"].includes(world.hazard) })
      .toEqual({ world: world.name, known: true });
  }
});

test("the two that get a bucket are both played by an engine that has one", () => {
  // The join. A world where a bucket makes sense, played by a build that does
  // not douse, is a promise the engine cannot keep -- and the other way round
  // is the bug that was shipped. Underground is roam's, the city is raze's.
  expect(hasWater("roam", 8) && bucketHelps(UNDERGROUND.hazard)).toBe(true);
  expect(hasWater("raze", 1) && bucketHelps(CITY.hazard)).toBe(true);
  // ...and the garden and the reef douse but must not offer it.
  expect(hasWater("calm", 2)).toBe(true);
  expect(bucketHelps(GARDEN.hazard)).toBe(false);
  expect(hasWater("swim", 3)).toBe(true);
  expect(bucketHelps(REEF.hazard)).toBe(false);
});
