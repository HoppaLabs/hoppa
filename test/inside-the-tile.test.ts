// Nothing is drawn flush against the edge of its tile.
//
// Reported four times in two days, about four different pictures: "the crab
// looks cropped when placed", "the shell icon looks cropped on its left side",
// "the shells looked cropped when placed", "the crab looks cropped". It was
// never one drawing -- it was a rule nobody had written down.
//
// There are two ways to get it wrong and both were shipped:
//
//   1. run to the edge in BODY colour, so there is no line where the shape
//      stops. The cast sprites all did; tools/enemies.ts puts a rim on every
//      edge pixel now, which fixed eleven of fifteen at once.
//   2. run to the edge WITH a rim, but flush -- no clear column beside it. The
//      shell did, on one side only, which is exactly what "cropped on its left"
//      looks like: rimmed, but with the next tile's content hard against it.
//
// A thing that is deliberately the whole tile -- terrain, a road, a landing pad
// -- is exempt and listed below. Everything that is an OBJECT sitting on the
// floor has to sit inside it.

import { expect, test } from "bun:test";

/** The 16x16 frames declared under a name in a source file. */
function framesOf(file: string, name: string): string[][] {
  const src = require("fs").readFileSync(file, "utf8") as string;
  const at = src.indexOf(`const ${name}`);
  if (at < 0) return [];
  const body = src.slice(at, src.indexOf("];", at));
  const rows = [...body.matchAll(/"([.\d]{16})"/g)].map((m) => m[1] as string);
  const out: string[][] = [];
  for (let i = 0; i + 16 <= rows.length; i += 16) out.push(rows.slice(i, i + 16));
  return out;
}

/**
 * Which SIDES this drawing touches.
 *
 * Sides only, and that is the honest rule rather than a lazy one. Every report
 * was horizontal, and so is the mechanism: tiles sit side by side, so a shape
 * flush against a left edge has the next tile's content hard against it and
 * reads as cut. Top and bottom are different -- a person stands ON the floor
 * and a chest has feet, so touching the bottom of the tile is what standing on
 * something looks like, and a gem's tip reaching the top is deliberate.
 */
function touches(frame: readonly string[]): string[] {
  const bad: string[] = [];
  for (const row of frame) {
    if (row[0] !== "." && !bad.includes("left")) bad.push("left");
    if (row[15] !== "." && !bad.includes("right")) bad.push("right");
  }
  return bad;
}

const RENDERER = "src/web/play/renderer.ts";

// The objects: things that stand ON the floor, drawn over it.
const OBJECTS = ["GEM_FRAMES", "FLOWER_FRAMES", "SHELL_FRAMES", "PERSON_FRAMES", "CHEST_SHUT", "CHEST_OPEN", "GARDEN_DOOR_SHUT", "GARDEN_DOOR_OPEN"];

test("every object has air down each side of its tile", () => {
  for (const name of OBJECTS) {
    const frames = framesOf(RENDERER, name);
    expect({ name, found: frames.length > 0 }).toEqual({ name, found: true });
    frames.forEach((frame, i) => {
      expect({ what: `${name} f${i}`, touching: touches(frame) })
        .toEqual({ what: `${name} f${i}`, touching: [] });
    });
  }
});

test("...and the ones that ARE the whole tile are the ones that fill it", () => {
  // The control. If `touches` were broken it would report nothing for
  // everything, and the test above would pass on the very drawings that
  // shipped the bug. A landing pad is a painted square of tarmac and is
  // SUPPOSED to run edge to edge.
  const pad = framesOf(RENDERER, "EVAC_PAD");
  expect(pad).toHaveLength(1);
  expect(touches(pad[0] as string[]).sort()).toEqual(["left", "right"]);
});

test("every cast sprite has a rim where it meets the edge, if it meets one", () => {
  // The other half, and the one the crab needed: a sprite may fill its tile --
  // a shark's tail does, and should -- but where it reaches the edge the pixel
  // there has to be the OUTLINE, or there is no line where the shape stops.
  const { CASTS } = require("../src/core/enemies.ts") as typeof import("../src/core/enemies.ts");
  for (const world of Object.keys(CASTS)) {
    for (const one of (CASTS[world] as readonly { name: string; frames: readonly (readonly string[])[] }[])) {
      one.frames.forEach((frame, i) => {
        const bare: string[] = [];
        frame.forEach((row, y) => {
          const edgeRow = y === 0 || y === 15;
          for (let x = 0; x < 16; x++) {
            const onEdge = edgeRow || x === 0 || x === 15;
            const ch = row[x] as string;
            if (onEdge && ch !== "." && ch !== "6") bare.push(`${x},${y}=${ch}`);
          }
        });
        expect({ who: `${world}/${one.name} f${i}`, bare: bare.slice(0, 4) })
          .toEqual({ who: `${world}/${one.name} f${i}`, bare: [] });
      });
    }
  }
});
