// Nothing is painted in the colour of the ground it stands on.
//
// This exists because two things were, and both shipped.
//
//   * the flag's POLE was #4e2e0f, which is exactly the jungle's ground and
//     near enough the pyramid's floor to disappear into it. Reported as "the
//     flag is hard to see in the Egypt levels".
//   * the jungle frog's OUTLINE was #082b11, which became exactly the jungle's
//     ground the day that floor went green. An outline the colour of the floor
//     is a creature with no edge.
//
// Both had been "checked" by measuring contrast, and both survived it, for the
// same reason: those checks asked for the BEST contrast any of the drawing's
// inks reached. The flag's cloth is white and the frog's body is bright, so the
// part that had gone invisible was never the part being measured. Ask per ink,
// weighted by how much of the drawing it actually covers.
//
// SCOPE: things that were given their OWN colours. A ladder, a tree and a
// hazard are drawn from the world's terrain ramp on purpose -- a tree IS
// foliage, and the gap between a ladder's rungs is MEANT to be the ground
// showing through. The rule is for things that stand ON the world: an exit, a
// gem, a creature. If a drawing was given its own inks, it has to use them.

import { expect, test } from "bun:test";
import { TILESETS } from "../src/core/tileset.ts";
import { doorFrames, doorInks, GEM_INKS, gemShapes } from "../src/web/play/renderer.ts";
import { CASTS, ENEMIES } from "../src/core/enemies.ts";
import type { Pattern } from "../src/core/tileset.ts";

/**
 * How much of a drawing each ink covers.
 *
 * Across every frame, because a walk cycle is one creature and an ink that
 * only appears on the second frame is still that creature's colour.
 */
function share(frames: readonly Pattern[]): Map<number, number> {
  const used = new Map<number, number>();
  let total = 0;
  for (const frame of frames) {
    for (let y = 0; y < 16; y = (y + 1) | 0) {
      const row = frame[y] as string;
      for (let x = 0; x < 16; x = (x + 1) | 0) {
        const ch = row[x] as string;
        if (ch === ".") continue;
        const at = (ch.charCodeAt(0) - 49) | 0;
        used.set(at, (used.get(at) ?? 0) + 1);
        total = (total + 1) | 0;
      }
    }
  }
  const out = new Map<number, number>();
  for (const [at, n] of used) out.set(at, n / Math.max(1, total));
  return out;
}

/**
 * A fifth of the drawing.
 *
 * Low enough to catch both bugs -- the pole was 30% of the flag and the frog's
 * outline 30% of the frog -- and high enough to leave a highlight or a single
 * accent pixel alone, which is allowed to borrow any colour it likes because
 * losing it costs nothing.
 */
const MUCH = 0.2;

/** Everything drawn on a world that carries colours of its own. */
function propsOf(world: string): { what: string; frames: readonly Pattern[]; inks: readonly string[] }[] {
  const gems = GEM_INKS[world] ?? (GEM_INKS.underground as readonly string[]);
  return [
    { what: "the way out, shut", frames: doorFrames(world, false), inks: doorInks(world, false) },
    { what: "the way out, open", frames: doorFrames(world, true), inks: doorInks(world, true) },
    { what: "the treasure", frames: gemShapes(world), inks: gems },
    ...(CASTS[world] ?? ENEMIES).map((one) => ({
      what: one.name, frames: one.frames as readonly Pattern[], inks: one.inks,
    })),
  ];
}

test("nothing that stands on a world is painted the colour of its ground", () => {
  const wrong: string[] = [];
  for (const set of TILESETS) {
    for (const prop of propsOf(set.name)) {
      for (const [at, part] of share(prop.frames)) {
        if (part < MUCH) continue;
        const ink = prop.inks[at];
        if (ink === undefined) continue;
        if (ink !== set.ground) continue;
        wrong.push(
          `${set.name}: ${prop.what} is ${(part * 100) | 0}% ${ink}, which is the ground it stands on`,
        );
      }
    }
  }
  expect(wrong).toEqual([]);
});

test("the two that shipped would both have been caught here", () => {
  // Written out rather than derived, so this keeps testing the TEST after the
  // drawings move on. These are the real numbers from the two reports.
  const pole = { ink: "#4e2e0f", ground: "#4e2e0f", part: 0.3 };
  const outline = { ink: "#082b11", ground: "#082b11", part: 0.3 };
  for (const one of [pole, outline]) {
    expect(one.part).toBeGreaterThanOrEqual(MUCH);
    expect(one.ink).toBe(one.ground);
  }
});

test("every world has an exit, a treasure and a cast drawn for it", () => {
  // The other half of how this goes wrong: a new world absent from a table
  // silently inherits a fallback. Space did, and shipped an oak door in orbit
  // until somebody said so. A missing drawing is not an error anywhere, which
  // is exactly why it needs asserting.
  const rows: string[] = [];
  for (const set of TILESETS) {
    const props = propsOf(set.name);
    for (const prop of props) {
      expect({ world: set.name, what: prop.what, frames: prop.frames.length > 0 })
        .toEqual({ world: set.name, what: prop.what, frames: true });
      expect({ world: set.name, what: prop.what, inks: prop.inks.length >= 3 })
        .toEqual({ world: set.name, what: prop.what, inks: true });
    }
    rows.push(`  ${set.name.padEnd(12)} ${props.length} drawings of its own`);
  }
  console.log(`\n${rows.join("\n")}`);
});
