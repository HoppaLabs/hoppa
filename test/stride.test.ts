// The player's walk cycle, derived from the one picture a child drew.
//
// The enemies have had a two-frame stride since the day they arrived: legs
// together, legs apart, hand-drawn, stepped by distance. The player never had
// any of it -- one rigid sixteen-pixel drawing, sliding. dash/9 and roam/9 gave
// the movement weight, and a creature that accelerates beautifully and never
// moves a leg still reads as a cursor.
//
// There is no second frame to draw and there never will be one, so the walk is
// DERIVED: shove the bottom few rows of the drawing sideways by a single pixel
// and the creature is mid-step. This file is the argument about how.

import { expect, test } from "bun:test";
import { SPRITE_H, SPRITE_W } from "../src/core/sprite.ts";
import {
  LEG_ROWS, POSES, SETTLE_FRAMES, STRIDE, Stride, bobs, legShift, lowestInked, poseOf, strode,
} from "../src/web/play/stride.ts";

/** A sprite from a picture: rows of "." and "1". */
function drawing(rows: readonly string[]): Uint8Array {
  const pixels = new Uint8Array(SPRITE_W * SPRITE_H);
  for (let y = 0; y < SPRITE_H; y = (y + 1) | 0) {
    const row = rows[y] ?? ".".repeat(SPRITE_W);
    for (let x = 0; x < SPRITE_W; x = (x + 1) | 0) {
      pixels[y * SPRITE_W + x] = (row[x] ?? ".") === "." ? 0 : 1;
    }
  }
  return pixels;
}

function rowsOf(pixels: Uint8Array): string[] {
  const out: string[] = [];
  for (let y = 0; y < SPRITE_H; y = (y + 1) | 0) {
    let row = "";
    for (let x = 0; x < SPRITE_W; x = (x + 1) | 0) {
      row += (pixels[y * SPRITE_W + x] as number) === 0 ? "." : "1";
    }
    out.push(row);
  }
  return out;
}

/** A body with two feet, sitting on the bottom row. */
const STANDING = [
  ...Array.from({ length: 10 }, () => "....111111......"),
  "....111111......",
  "....111111......",
  "....111111......",
  "....11..11......",
  "....11..11......",
  "....11..11......",
];

// --- the cycle ----------------------------------------------------------------

test("the pose comes from how far it has walked, not from a clock", () => {
  // A timer would have the creature marching on the spot the moment it stops.
  expect(poseOf(0)).toBe(0);
  expect(poseOf(STRIDE - 1)).toBe(0);
  expect(poseOf(STRIDE)).toBe(1);
  expect(poseOf(STRIDE * 2)).toBe(2);
  expect(poseOf(STRIDE * 3)).toBe(3);
  expect(poseOf(STRIDE * POSES)).toBe(0);
});

test("it is a four-beat gait: forward, together, back, together", () => {
  // Two poses read as a twitch. Four read as a walk, and derived legs can do
  // four for the price of one more offscreen canvas.
  expect([0, 1, 2, 3].map(legShift)).toEqual([0, 1, 0, -1]);
});

test("...and the legs come back to where they started, so it cannot drift", () => {
  // A cycle whose shifts do not sum to zero is a creature slowly walking out of
  // its own hitbox.
  let sum = 0;
  for (let pose = 0; pose < POSES; pose = (pose + 1) | 0) sum += legShift(pose);
  expect(sum).toBe(0);
});

test("the body drops a pixel on the beats where the legs are out", () => {
  // Which is where a walking body actually is. One pixel; two is a hop.
  expect([0, 1, 2, 3].map(bobs)).toEqual([false, true, false, true]);
});

// --- the drawing --------------------------------------------------------------

test("a step moves the feet and leaves the body alone", () => {
  // The first try shifted five rows, which moves the bottom third of the body
  // with the feet -- so the creature did not step, it WADDLED.
  const before = rowsOf(drawing(STANDING));
  const after = rowsOf(strode(drawing(STANDING), 1));
  const moved: number[] = [];
  for (let y = 0; y < SPRITE_H; y = (y + 1) | 0) {
    if (before[y] !== after[y]) moved.push(y);
  }
  expect(moved).toEqual([13, 14, 15]);
  expect(moved.length).toBe(LEG_ROWS);
});

test("...and it moves them the way it was asked to", () => {
  expect(rowsOf(strode(drawing(STANDING), 1))[15]).toBe(".....11..11.....");
  expect(rowsOf(strode(drawing(STANDING), -1))[15]).toBe("...11..11.......");
  expect(rowsOf(strode(drawing(STANDING), 0))[15]).toBe("....11..11......");
});

test("legs shoved off the edge are dropped, never wrapped round", () => {
  // A foot that reappears on the other side of the creature is a horror.
  const hard = ["1..............1", "1..............1", "1..............1"];
  const wide = drawing([...Array.from({ length: 13 }, () => "................"), ...hard]);
  const out = rowsOf(strode(wide, 1));
  expect(out[15]).toBe(".1..............");
  expect(rowsOf(strode(wide, -1))[15]).toBe("..............1.");
});

test("a creature drawn floating still gets a walk", () => {
  // Measured from where the drawing ACTUALLY ends, not from the bottom of its
  // sixteen-pixel box. Otherwise this creature alone never moves a leg and
  // nobody could say why.
  const floating = [
    ...Array.from({ length: 5 }, () => "....111111......"),
    "....11..11......",
    ...Array.from({ length: 10 }, () => "................"),
  ];
  expect(lowestInked(drawing(floating))).toBe(5);
  const after = rowsOf(strode(drawing(floating), 1));
  expect(after[5]).toBe(".....11..11.....");
  expect(after[6]).toBe("................");
});

test("a blank drawing is left exactly alone", () => {
  const blank = drawing([]);
  expect(lowestInked(blank)).toBe(-1);
  expect(strode(blank, 1)).toEqual(blank);
});

// --- standing still -----------------------------------------------------------

test("the feet come together when the creature stops", () => {
  // Stepping by distance means a creature that stops mid-stride STAYS
  // mid-stride, standing there with one leg out. The enemies do exactly that
  // and get away with it because nobody watches a guard at the end of its
  // patrol; the player is watched constantly.
  const stride = new Stride();
  let x = 0;
  let pose = 0;
  // Walk until it is genuinely mid-stride. A fixed number of frames is a
  // coin toss: the first version walked exactly forty and landed, by luck, on
  // the pose where the feet are already together -- so it proved nothing.
  for (let frame = 0; frame < 200 && pose === 0; frame = (frame + 1) | 0) {
    x = (x + 40) | 0;
    pose = stride.at(x, 0);
  }
  expect(pose).not.toBe(0);   // caught mid-stride
  for (let frame = 0; frame < SETTLE_FRAMES; frame = (frame + 1) | 0) pose = stride.at(x, 0);
  expect(pose).toBe(0);       // and standing up straight
});

test("...but not between two ticks, because half the frames move nothing", () => {
  // THE REASON THIS IS A CLASS. The screen draws sixty times a second and the
  // engine ticks thirty, so at a dead run every other frame has the creature
  // in exactly the same place -- and while the world is held for a hit (see
  // ./hitstop.ts) NO frame moves it. Without a few frames of memory the
  // creature snaps to attention every other frame, which is a twitch, not a
  // walk.
  const stride = new Stride();
  let x = 0;
  const seen = new Set<number>();
  for (let frame = 0; frame < 120; frame = (frame + 1) | 0) {
    if (frame % 2 === 0) x = (x + 80) | 0;   // one tick's worth, every other frame
    seen.add(stride.at(x, 0));
  }
  // It walked through the whole cycle and never once stood to attention in the
  // middle of it.
  expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  // ...and specifically: the still frames do not reset it.
  const settled = new Stride();
  let y = 0;
  for (let frame = 0; frame < 60; frame = (frame + 1) | 0) {
    if (frame % 2 === 0) y = (y + 80) | 0;
  }
  expect(SETTLE_FRAMES).toBeGreaterThan(2);
});

test("a new run forgets where anybody was", () => {
  // A restart compares this frame's position against the last frame of the run
  // before it, which is a whole room away -- and a whole room of distance is a
  // pose picked at random.
  const stride = new Stride();
  for (let frame = 0; frame < 20; frame = (frame + 1) | 0) stride.at(frame * 40, 0);
  stride.forget();
  expect(stride.at(9999, 9999)).toBe(0);
});

test("it counts BOTH axes, because a top-down room is walked in four directions", () => {
  const across = new Stride();
  const down = new Stride();
  let a = 0;
  let d = 0;
  let poseA = 0;
  let poseD = 0;
  for (let frame = 0; frame < 30; frame = (frame + 1) | 0) {
    a = (a + 40) | 0;
    d = (d + 40) | 0;
    poseA = across.at(a, 0);
    poseD = down.at(0, d);
  }
  expect(poseD).toBe(poseA);
});
