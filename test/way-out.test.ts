// Every world's way out looks like a way out OF THAT WORLD.
//
// The tile index is the same everywhere and always has been -- shut while a gem
// is still out there, open the moment the last one is in, which is what
// test/exit-opens.test.ts pins. What changes is the picture, and it kept being
// wrong in the same way: a padlocked oak door, set into a stone frame, standing
// on a seabed / a lawn / a street.
//
// Each of the three was reported separately, in the same words each time:
//
//   "in the underwater levels the exit needs to sea chest or sailor's trunk"
//   "we can use the sea chest on the beach levels as well"
//   "the garden can have an exit, a cute wooden door actually"
//
// So this is the list, and a new world absent from it gets the dungeon's door
// on whatever it is standing on. That is a decision to make deliberately.

import { expect, test } from "bun:test";
import { doorInks, doorShape } from "../src/web/play/renderer.ts";

/** The drawing a world gets if it has never been thought about. */
const oak = doorShape("underground", false);

test("the garden has its own door, and it is not the dungeon's", () => {
  const shut = doorShape("garden", false);
  expect(shut).not.toEqual(oak);
  // Seven inks, because it has a pane of glass in it -- the other doors have
  // six. Cheap proof that this is the garden's drawing and not a recolour.
  expect(doorInks("garden", false)).toHaveLength(7);
  // ...and it opens into something different, rather than lighting up in place.
  expect(doorShape("garden", true)).not.toEqual(shut);
});

test("the water and the sand share a chest, and the city has neither", () => {
  expect(doorShape("reef", false)).toEqual(doorShape("beach", false));
  expect(doorShape("reef", false)).not.toEqual(oak);
  // A landing pad does not change SHAPE when the last person is aboard, its
  // lights come on -- so the city is the one world where the two are equal.
  expect(doorShape("city", false)).toEqual(doorShape("city", true));
  expect(doorInks("city", false)).not.toEqual(doorInks("city", true));
});

test("a world nobody has drawn a way out for still gets one", () => {
  // The fallback is not a bug, it is the thing that keeps a new world playable
  // on the day it is added. It just has to be a door and not a blank.
  const unknown = doorShape("somewhere new", false);
  expect(unknown).toEqual(oak);
  expect(unknown.some((row) => row.includes("1"))).toBe(true);
});

test("every world's shut and open drawings carry the same number of inks", () => {
  // A pattern digit indexes the ink array, so a drawing with a 7 in it and a
  // six-colour open palette paints undefined -- which is a silent hole in the
  // picture rather than a crash.
  for (const world of ["underground", "outside", "reef", "beach", "garden", "city"]) {
    for (const open of [false, true]) {
      const shape = doorShape(world, open);
      const inks = doorInks(world, open);
      const highest = Math.max(...shape.flatMap((row) =>
        [...row].filter((ch) => ch !== ".").map((ch) => Number(ch))));
      expect({ world, open, highest, inks: inks.length })
        .toEqual({ world, open, highest, inks: Math.max(highest, inks.length) });
    }
  }
});
