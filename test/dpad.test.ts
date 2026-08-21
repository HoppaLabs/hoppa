// A thumb on the pad, without a thumb or a pad.
import { expect, test } from "bun:test";
import { DEAD_ZONE, PAD_MASK, heldFor } from "../src/web/play/dpad.ts";
import { HELD_DOWN, HELD_LEFT, HELD_NONE, HELD_RIGHT, HELD_UP } from "../src/engines/types.ts";

const R = 100;

test("the four cardinals, dead centre of their sectors", () => {
  expect(heldFor(R, 0, R)).toBe(HELD_RIGHT);
  expect(heldFor(0, R, R)).toBe(HELD_DOWN);
  expect(heldFor(-R, 0, R)).toBe(HELD_LEFT);
  expect(heldFor(0, -R, R)).toBe(HELD_UP);
});

test("the four diagonals hold two directions at once", () => {
  // The thing six separate buttons could not do with one thumb.
  expect(heldFor(70, -70, R)).toBe(HELD_UP | HELD_RIGHT);
  expect(heldFor(70, 70, R)).toBe(HELD_DOWN | HELD_RIGHT);
  expect(heldFor(-70, 70, R)).toBe(HELD_DOWN | HELD_LEFT);
  expect(heldFor(-70, -70, R)).toBe(HELD_UP | HELD_LEFT);
});

test("a thumb resting in the middle holds nothing", () => {
  expect(heldFor(0, 0, R)).toBe(HELD_NONE);
  expect(heldFor(R * DEAD_ZONE * 0.9, 0, R)).toBe(HELD_NONE);
  // ...and just outside it, it means what it points at.
  expect(heldFor(R * DEAD_ZONE * 1.1, 0, R)).toBe(HELD_RIGHT);
});

test("every sector is 45 degrees, and they tile the circle", () => {
  // Walked round in one-degree steps: the direction must change exactly eight
  // times, and every one of the eight must be reachable.
  const seen = new Set<number>();
  let changes = 0;
  let last = heldFor(R, 0, R);
  for (let deg = 1; deg < 360; deg++) {
    const rad = (deg * Math.PI) / 180;
    const held = heldFor(Math.cos(rad) * R, Math.sin(rad) * R, R);
    seen.add(held);
    if (held !== last) { changes++; last = held; }
  }
  expect(seen.size).toBe(8);
  // Eight sectors, eight boundaries, all of them at 22.5 + 45k degrees and so
  // all inside the walk -- the last, at 337.5, lands back in RIGHT where it
  // started.
  expect(changes).toBe(8);
});

test("rolling a thumb from one direction to the next never passes through nothing", () => {
  // The feel this whole file is for: sliding right-to-down must hand over
  // cleanly, with the diagonal in between and no dead frame.
  const path: number[] = [];
  for (let deg = 0; deg <= 90; deg++) {
    const rad = (deg * Math.PI) / 180;
    path.push(heldFor(Math.cos(rad) * R, Math.sin(rad) * R, R));
  }
  expect(path).not.toContain(HELD_NONE);
  expect(path[0]).toBe(HELD_RIGHT);
  expect(path[path.length - 1]).toBe(HELD_DOWN);
  expect(path).toContain(HELD_DOWN | HELD_RIGHT);
});

test("the pad only ever sets direction bits", () => {
  for (let deg = 0; deg < 360; deg += 7) {
    const rad = (deg * Math.PI) / 180;
    const held = heldFor(Math.cos(rad) * R, Math.sin(rad) * R, R);
    expect(held & ~PAD_MASK).toBe(0);
  }
});
