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
import { doorFrames, doorInks, doorShape, flagged } from "../src/web/play/renderer.ts";
import type { Pattern } from "../src/core/tileset.ts";

/** The drawing a world gets if it has never been thought about. */
const oak = doorShape("nowhere anybody has drawn", false);

/**
 * The worlds that fly a flag, and the four that were given something better.
 *
 * The garden and the beach were on the first list and should never have been:
 * each had been given its own way out, by name, before flags existed. "I
 * forgot about garden and beach put them back how they were".
 */
const FLIES = ["underground", "outside", "jungle", "pyramid"] as const;
const KEEPS = ["reef", "city", "garden", "beach"] as const;

test("the way out is a flag, in every world but two", () => {
  //     "Maybe instead of doors and exits we should have flags that flutter,
  //      except for the city and underwater levels?"
  //
  // A door is a thing you go THROUGH, and in a room seen from above there is
  // no through -- the exit is a square you stand on, drawn as a door lying
  // flat, which is a picture of the wrong verb. A flag is a thing you REACH.
  for (const world of FLIES) {
    expect({ world, flies: flagged(world) }).toEqual({ world, flies: true });
    // Three drawings when it is flying, one when it is not: a flag that is
    // still going in a level you have not finished says the wrong thing.
    expect({ world, frames: doorFrames(world, true).length })
      .toEqual({ world, frames: 3 });
    expect({ world, frames: doorFrames(world, false).length })
      .toEqual({ world, frames: 1 });
  }
});

test("...and the city and the reef keep what they were given", () => {
  // A landing pad is where a jaeger is airlifted out and a sea chest is what
  // you are down there for. Neither is a thing you plant a flag on, and both
  // were asked for by name.
  for (const world of KEEPS) {
    expect({ world, flies: flagged(world) }).toEqual({ world, flies: false });
    expect({ world, frames: doorFrames(world, true).length })
      .toEqual({ world, frames: 1 });
  }
  // A landing pad does not change SHAPE when the last person is aboard, its
  // lights come on -- so the city is the one world where the two are equal.
  expect(doorShape("city", false)).toEqual(doorShape("city", true));
  expect(doorInks("city", false)).not.toEqual(doorInks("city", true));
});

test("a furled flag and a flying one are plainly different", () => {
  // The thing a flag does for nothing that a door needed two drawings for:
  // limp when there is nothing to celebrate, flying when there is.
  for (const world of FLIES) {
    const shut = doorShape(world, false);
    const flying = doorFrames(world, true)[0] as Pattern;
    expect({ world, same: shut.join() === flying.join() }).toEqual({ world, same: false });
    expect({ world, dull: doorInks(world, false).join() === doorInks(world, true).join() })
      .toEqual({ world, dull: false });
  }
});

test("THE POLE DOES NOT MOVE -- only the cloth does", () => {
  // What separates a flag in wind from a flag being waved about. The pole is
  // the left-hand columns, and if those differ between frames the whole thing
  // wobbles and reads as the exit shaking rather than as a breeze.
  const frames = doorFrames("underground", true);
  const pole = (shape: Pattern): string => shape.map((row) => row.slice(0, 4)).join("|");
  for (const [at, shape] of frames.entries()) {
    expect({ at, pole: pole(shape) }).toEqual({ at, pole: pole(frames[0] as Pattern) });
  }
  // ...and the cloth genuinely does, or there is no flutter at all.
  const cloth = (shape: Pattern): string => shape.map((row) => row.slice(4)).join("|");
  expect(new Set(frames.map(cloth)).size).toBe(frames.length);
});

test("a world nobody has drawn a way out for still gets one", () => {
  // The fallback is not a bug, it is the thing that keeps a new world playable
  // on the day it is added. It just has to be a door and not a blank.
  expect(oak.some((row) => row.includes("1"))).toBe(true);
  expect(flagged("nowhere anybody has drawn")).toBe(false);
});

test("every world's shut and open drawings carry the same number of inks", () => {
  // A pattern digit indexes the ink array, so a drawing with a 7 in it and a
  // six-colour open palette paints undefined -- which is a silent hole in the
  // picture rather than a crash.
  // EVERY FRAME, not just the still one. A flag flies through three drawings
  // and only the first of them is what doorShape() hands back, so checking
  // that one would leave two thirds of the picture unchecked -- and a digit
  // that only appears in frame two is a hole that shows up one frame in three,
  // which is the hardest kind to see and to report.
  for (const world of ["underground", "outside", "reef", "beach", "garden", "city"]) {
    for (const open of [false, true]) {
      const inks = doorInks(world, open);
      for (const [at, shape] of doorFrames(world, open).entries()) {
        const highest = Math.max(...shape.flatMap((row) =>
          [...row].filter((ch) => ch !== ".").map((ch) => Number(ch))));
        expect({ world, open, at, highest, inks: inks.length })
          .toEqual({ world, open, at, highest, inks: Math.max(highest, inks.length) });
      }
    }
  }
});
