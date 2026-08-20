import { expect, test } from "bun:test";
import { DAY1_LEVEL_TEXT, DAY2_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { parseLevel } from "../src/core/level.ts";
import { DelveV1 } from "../src/engines/delve/v1.ts";
import { DelveV2 } from "../src/engines/delve/v2.ts";
import { engineFor, knownBuilds, newestBehaviour, UnknownBehaviourError } from "../src/engines/registry.ts";

// E11: a pinned behaviour version always routes to that engine build.
test("a level pinning behaviour=1 gets the day 1 build, forever", () => {
  const engine = engineFor(parseLevel(DAY1_LEVEL_TEXT));
  expect(engine).toBeInstanceOf(DelveV1);
  expect(engine.behaviourVersion).toBe(1);
});

test("a level pinning behaviour=2 gets the day 2 build", () => {
  const engine = engineFor(parseLevel(DAY2_LEVEL_TEXT));
  expect(engine).toBeInstanceOf(DelveV2);
  expect(engine.behaviourVersion).toBe(2);
});

test("every build ships: retiring one would break every link that pinned it", () => {
  expect(knownBuilds()).toEqual([
    "delve/1", "delve/2", "delve/3", "delve/4", "delve/5",
    "roam/1", "roam/2", "roam/3",
    "dash/1", "dash/2", "dash/3",
  ]);
});

test("E11: an unknown behaviour version refuses politely and names what it has", () => {
  const future = parseLevel(DAY2_LEVEL_TEXT.replace("behaviour=2", "behaviour=99"));
  expect(() => engineFor(future)).toThrow(UnknownBehaviourError);
  expect(() => engineFor(future)).toThrow(/delve\/99/);
  expect(() => engineFor(future)).toThrow(/needs a newer hoppa/);
});

test("E11: an unknown engine id refuses the same way, without crashing", () => {
  const other = parseLevel(DAY2_LEVEL_TEXT.replace(" delve ", " shove "));
  expect(() => engineFor(other)).toThrow(UnknownBehaviourError);
  expect(() => engineFor(other)).toThrow(/shove\/2/);
});

test("the day 1 level, routed, still behaves like day 1: it never ends", () => {
  const engine = engineFor(parseLevel(DAY1_LEVEL_TEXT));
  for (let i = 0; i < 200; i++) expect(engine.step(i % 5)).toBe(0);
});


test("newestBehaviour finds the newest build, so nothing has to keep its own table", () => {
  // The level editor asks this instead of carrying a version number. A
  // hardcoded one went stale when dash/3 shipped and every level drawn after
  // that was quietly still dash/2 -- so the sword did nothing in levels made
  // with it. Adding a build to BUILDS must be the only step.
  for (const engine of ["delve", "roam", "dash"]) {
    const versions = knownBuilds()
      .filter((key) => key.slice(0, key.lastIndexOf("/")) === engine)
      .map((key) => Number.parseInt(key.slice(key.lastIndexOf("/") + 1), 10));
    expect(newestBehaviour(engine)).toBe(Math.max(...versions));
    // ...and it really is routable.
    expect(knownBuilds()).toContain(`${engine}/${newestBehaviour(engine)}`);
  }
  expect(newestBehaviour("shove")).toBe(0);
  expect(newestBehaviour("")).toBe(0);
});
