// The puff when you land.
//
// The squash was already there and it says what happened to the CREATURE. This
// says what happened to the FLOOR, and a landing that leaves the ground
// completely undisturbed is half a landing.
//
// The interesting test here is the last one. Twice this was tuned by drawing it
// ten times life size and looking, and the first time the thing it was drawn
// next to was the wrong size -- a mocked-up pair of feet two art pixels wide
// standing in for a creature that is sixteen. Every puff was inside the
// silhouette, the dust is drawn UNDER the creature, and so none of it could
// ever be seen. So there is now a test for "some of this is outside the
// creature", which is the property my eye was supposed to be checking.

import { expect, test } from "bun:test";
import { SPRITE_W } from "../src/core/sprite.ts";
import { DUST_AT_SPEED, DUST_FRAMES, landed, puffsAt, type Puff } from "../src/web/play/dust.ts";

/** Every frame of the puff, in order. */
function whole(): readonly (readonly Puff[])[] {
  const out: (readonly Puff[])[] = [];
  for (let f = 0; f < DUST_FRAMES; f = (f + 1) | 0) out.push(puffsAt(f));
  return out;
}

test("it is over in six frames, and asks for nothing outside them", () => {
  // A tenth of a second. Past the end the caller gets an empty list rather
  // than a wrapped-round one, which is its cue to stop asking.
  expect(puffsAt(-1)).toEqual([]);
  expect(puffsAt(DUST_FRAMES)).toEqual([]);
  expect(puffsAt(DUST_FRAMES + 40)).toEqual([]);
  for (const frame of whole()) expect(frame.length).toBe(2);
});

test("it is symmetric, because impact is symmetric", () => {
  // A puff that trails behind reads as SPEED. This is not about speed, it is
  // about weight arriving, and both sides at once is the only shape that says
  // so.
  for (let f = 0; f < DUST_FRAMES; f = (f + 1) | 0) {
    const [left, right] = puffsAt(f) as [Puff, Puff];
    expect({ f, dx: left.dx }).toEqual({ f, dx: -right.dx });
    expect({ f, ...left, dx: 0 }).toEqual({ f, ...right, dx: 0 });
  }
});

test("some of every puff is OUTSIDE the creature, or nobody sees any of it", () => {
  // THE ONE THAT WOULD HAVE CAUGHT IT. A sprite is 16 art pixels across, so it
  // covers 8 either side of its centre, and dust is drawn underneath. A puff
  // whose far edge is still inside that is a puff that does not exist.
  const half = SPRITE_W / 2;
  for (let f = 0; f < DUST_FRAMES; f = (f + 1) | 0) {
    for (const puff of puffsAt(f)) {
      const outerEdge = Math.abs(puff.dx) + puff.size;
      expect({ f, dx: puff.dx, showing: outerEdge > half }).toEqual({ f, dx: puff.dx, showing: true });
    }
  }
});

test("it travels outward and never comes back", () => {
  let last = 0;
  for (let f = 0; f < DUST_FRAMES; f = (f + 1) | 0) {
    const puff = puffsAt(f)[1] as Puff;
    expect({ f, further: puff.dx > last }).toEqual({ f, further: true });
    last = puff.dx;
  }
});

test("it thins, and never thickens", () => {
  let size = Infinity;
  let fade = Infinity;
  for (let f = 0; f < DUST_FRAMES; f = (f + 1) | 0) {
    const puff = puffsAt(f)[0] as Puff;
    expect({ f, thinner: puff.size <= size && puff.fade <= fade })
      .toEqual({ f, thinner: true });
    size = puff.size;
    fade = puff.fade;
  }
  // ...and it is actually gone by the end rather than merely smaller.
  const lastPuff = puffsAt(DUST_FRAMES - 1)[0] as Puff;
  expect(lastPuff.fade).toBeLessThan(0.5);
});

test("it fades in whole steps rather than down a ramp", () => {
  // Everything else on this screen is stamped on an integer grid at an integer
  // scale. A smooth alpha ramp would be the one soft thing in a hard picture,
  // which is the fault that had to be found and fixed twice already.
  const levels = new Set(whole().flat().map((p) => p.fade));
  expect(levels.size).toBeLessThanOrEqual(3);
});

test("it starts on the ground and rises as it thins", () => {
  // Dust leaves the ground and THEN rises; it does not start in the air. An
  // earlier version lifted it a whole art pixel immediately, and at ten times
  // scale the gap underneath was the first thing you saw: two blocks hovering,
  // not dust.
  expect((puffsAt(0)[0] as Puff).dy).toBe(0);
  let dy = 0;
  for (let f = 0; f < DUST_FRAMES; f = (f + 1) | 0) {
    const puff = puffsAt(f)[0] as Puff;
    expect({ f, rising: puff.dy <= dy }).toEqual({ f, rising: true });
    dy = puff.dy;
  }
  expect(dy).toBeLessThan(0);
});

test("only a real landing raises anything", () => {
  // On the frame the creature ARRIVES -- airborne last frame, grounded this
  // one -- and only if it was coming down fast enough to matter. Walking off a
  // one-cell step is not an impact.
  expect(landed(true, false, DUST_AT_SPEED + 1)).toBe(true);
  // Still in the air.
  expect(landed(true, true, 99)).toBe(false);
  // Was already standing there: this is every frame of standing still.
  expect(landed(false, false, 99)).toBe(false);
  // Arrived, but barely moving.
  expect(landed(true, false, DUST_AT_SPEED)).toBe(false);
  expect(landed(true, false, 0)).toBe(false);
  // Going UP through the threshold is not a landing either.
  expect(landed(true, false, -80)).toBe(false);
});
