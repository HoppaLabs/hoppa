// swim/3 -- no air, and everything that has to survive its removal.
//
// Found by tools/mutate.ts, not by reading: setting FLOW_PUSH to 0 in swim/3
// left the whole suite green. Every currents test hardcodes `behaviour=2`, so
// the build every new level is now drawn under had NOTHING checking that its
// water goes anywhere -- and with the air gone, currents are the only thing
// left that makes strength a routing decision underwater. See adr/0039, 0042.

import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { newestBuild } from "../src/core/builds.ts";
import { PRESETS } from "../src/core/creature.ts";
import { HELD_NONE, HELD_LEFT, HELD_RIGHT } from "../src/engines/types.ts";
import { ONE } from "../src/core/fixed.ts";

type Swimmer = {
  step(held: number): number;
  where(): { x: number; y: number };
  health(): { hp: number; max: number };
  breath?(): { left: number; full: number };
};

/** A corridor of rightward current, on whichever build is asked for. */
function swept(behaviour: number): string {
  return [
    `hoppa/1 swim seed=0 tiles=1 behaviour=${behaviour}`,
    "........................",
    "#......................#",
    "########################",
    "#.@rrrrrrrrrrrrrrrrrrr.#",
    "#..rrrrrrrrrrrrrrrrrrr.#",
    "########################",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.....................>#",
    "########################",
  ].join("\n");
}

function make(behaviour: number, who: (typeof PRESETS)[number]): Swimmer {
  return engineFor(parseLevel(swept(behaviour)), who) as unknown as Swimmer;
}

const NEWEST = newestBuild("swim");

test("the newest swim is the one this file is about", () => {
  // If a swim/4 ever lands, this file must be pointed at it or extended --
  // which is the failure that let swim/3's currents go untested at all.
  expect(NEWEST).toBe(3);
  expect(knownBuilds()).toContain("swim/3");
});

test("a current still carries you on the newest build", () => {
  const engine = make(NEWEST, PRESETS[1] as (typeof PRESETS)[number]);
  // Into the flow first: a cell holds one glyph, so the start is never itself
  // a current and every swim level begins by stepping into the water.
  for (let tick = 0; tick < 20; tick++) engine.step(HELD_RIGHT);
  const from = engine.where().x;
  for (let tick = 0; tick < 30; tick++) engine.step(HELD_NONE);
  const carried = (engine.where().x - from) / ONE;
  console.log(`\n  swim/${NEWEST}, one second of doing nothing in a current: carried ${carried.toFixed(2)} cells`);
  expect(carried).toBeGreaterThan(0.5);
});

test("strength still beats a current and speed still does not", () => {
  // adr/0039's whole argument, and the only reason FORCE means anything
  // underwater now that there is no air to hold. The SLOWEST creature is the
  // fastest one through a current; if this inverts, the engine has lost the
  // thing it was built for.
  const upstream = (who: (typeof PRESETS)[number]) => {
    const engine = make(NEWEST, who);
    for (let tick = 0; tick < 20; tick++) engine.step(HELD_RIGHT);
    const from = engine.where().x;
    for (let tick = 0; tick < 300; tick++) engine.step(HELD_LEFT);
    return (from - engine.where().x) / ONE;
  };
  const bash = upstream(PRESETS[0] as (typeof PRESETS)[number]);
  const nim = upstream(PRESETS[1] as (typeof PRESETS)[number]);
  console.log(`  ten seconds swimming INTO it: Bash ${bash.toFixed(2)} cells, Nim ${nim.toFixed(2)}`);
  expect(bash).toBeGreaterThan(nim);
});

test("there is no air, and nothing takes a heart for taking your time", () => {
  const engine = make(NEWEST, PRESETS[1] as (typeof PRESETS)[number]);
  expect(engine.breath).toBeUndefined();
  const hearts = engine.health().max;
  // Two full minutes of doing nothing at all.
  for (let tick = 0; tick < 3600; tick++) engine.step(HELD_NONE);
  expect(engine.health().hp).toBe(hearts);
});

test("swim/2 still drowns you, because its links were played that way", () => {
  // Hard rule 3, stated as the thing it protects rather than as a version list.
  const old = make(2, PRESETS[1] as (typeof PRESETS)[number]);
  expect(old.breath).toBeDefined();
  const hearts = old.health().max;
  for (let tick = 0; tick < 3600; tick++) old.step(HELD_NONE);
  expect(old.health().hp).toBeLessThan(hearts);
});
