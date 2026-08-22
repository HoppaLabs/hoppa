// The water leaving the bucket.
//
//     "The water tool doesn't seem to work very well as it's not clear what
//      it's doing, there are no graphics or animations appearing."
//
// There were not. Pouring added a CSS class to the BUTTON and drew nothing at
// all on the board: if a fire happened to be in the cell you faced it went out
// sixteen ticks later, and if not, the press was indistinguishable from a
// broken button. Second act of adr/0055, "the bucket nobody could see" -- that
// one was about finding the button, and being shown nothing after finding it is
// the worse version.

import { expect, test } from "bun:test";
import { DROPS, THROW, dropsAt, type Drop } from "../src/web/play/pour.ts";
import { SPRITE_W } from "../src/core/sprite.ts";

const RIGHT = 1;
const LEFT = -1;
const DOWNWARD = 0;

/** The pour, sampled across its whole length. */
function through(facing: number): readonly (readonly Drop[])[] {
  const out: (readonly Drop[])[] = [];
  for (let i = 0; i <= 10; i = (i + 1) | 0) out.push(dropsAt(i / 10, facing));
  return out;
}

test("water comes out for the WHOLE pour, not once at the start", () => {
  // Sixteen ticks of standing still is the price of the water. The animation
  // running for all of it is what says the price is being paid, rather than
  // that the game has hung.
  for (const moment of through(RIGHT)) expect(moment.length).toBe(DROPS);
  expect(dropsAt(0, RIGHT).length).toBe(DROPS);
  expect(dropsAt(1, RIGHT).length).toBe(DROPS);
});

test("...and asks for nothing outside the pour", () => {
  expect(dropsAt(-0.01, RIGHT)).toEqual([]);
  expect(dropsAt(1.01, RIGHT)).toEqual([]);
});

test("it is a stream, not one lump moving", () => {
  // Staggered, so the drops are at different points of the same throw.
  const spots = new Set(dropsAt(0.3, RIGHT).map((d) => `${d.dx},${d.dy}`));
  expect(spots.size).toBe(DROPS);
});

test("it goes the way you are facing", () => {
  for (const drop of dropsAt(0.4, RIGHT)) expect(drop.dx).toBeGreaterThan(0);
  for (const drop of dropsAt(0.4, LEFT)) expect(drop.dx).toBeLessThan(0);
});

test("...and straight down the screen when you are facing up or down", () => {
  // Looked at from above there is no sideways to draw: water goes out in front
  // of you, and in front is into the screen.
  const drops = dropsAt(0.4, DOWNWARD);
  for (const drop of drops) expect(drop.dy).toBeGreaterThan(0);
  // Spread across the creature rather than stacked in one column.
  expect(new Set(drops.map((d) => d.dx)).size).toBeGreaterThan(1);
});

test("it clears the creature, or it is drawn inside its own body", () => {
  // The same mistake the landing dust made and had to be measured out of: a
  // sprite is 16 art pixels across, so anything drawn within 8 of the middle
  // is behind the creature. Water is drawn OVER the creature rather than
  // under, so this is about reading as thrown rather than about being hidden --
  // but it still has to leave the bucket rather than start in the chest.
  const half = SPRITE_W / 2;
  for (const facing of [RIGHT, LEFT]) {
    for (const moment of through(facing)) {
      for (const drop of moment) {
        expect(Math.abs(drop.dx)).toBeGreaterThan(half / 3);
      }
    }
  }
});

test("it falls as it travels", () => {
  // Water leaves flat and arrives low. Without this it is a laser made of
  // water, which is a different thing to be holding.
  const early = dropsAt(0, RIGHT)[0] as Drop;
  const late = dropsAt(0.49, RIGHT)[0] as Drop;
  expect(Math.abs(late.dx)).toBeGreaterThan(Math.abs(early.dx));
  expect(late.dy).toBeGreaterThan(early.dy);
});

test("it is thrown about a cell, not across the room", () => {
  // douse() reaches the cell you are facing and the one you are in. Water that
  // flew further than that would be promising something the engine does not do.
  for (const facing of [RIGHT, LEFT, DOWNWARD]) {
    for (const moment of through(facing)) {
      for (const drop of moment) {
        expect(Math.abs(drop.dx)).toBeLessThanOrEqual(THROW + 8);
        expect(Math.abs(drop.dy)).toBeLessThanOrEqual(THROW + 8);
      }
    }
  }
});

test("it breaks up and fades in whole steps", () => {
  // Everything else on this screen is stamped on an integer grid. A smooth
  // spray would be the one soft thing in a hard picture.
  const all = through(RIGHT).flat();
  expect(new Set(all.map((d) => d.fade)).size).toBeLessThanOrEqual(3);
  expect(new Set(all.map((d) => d.size)).size).toBeLessThanOrEqual(2);
  for (const drop of all) {
    expect(drop.fade).toBeGreaterThan(0);
    expect(drop.fade).toBeLessThanOrEqual(1);
  }
});
